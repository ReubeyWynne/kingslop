/* Which files the site publishes, and the data the templates read as `site.data`.
   The rules are the ones the site was published under with Jekyll, so the move to
   Eleventy changes no URL:
   - a file or folder whose name starts with "_", "." or "#", or ends in "~", is never published;
   - Markdown is never published (it is the repository's documentation), nor anything below;
   - a file that starts with a front-matter fence ("---") is a template and is rendered;
     every other file is copied byte for byte. */
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED = new Set([
  'api', 'node_modules', 'vendor', 'package.json', 'package-lock.json', 'eleventy.config.mjs',
  'Gemfile', 'Gemfile.lock'
]);

function hidden(name) {
  return name.startsWith('_') || name.startsWith('.') || name.startsWith('#') || name.endsWith('~');
}

function walk(dir, rel, keep, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (!keep(entry.name, r, entry.isDirectory())) continue;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), r, keep, out);
    else if (entry.isFile()) out.push(r);
  }
  return out;
}

/** Every published file, relative to the site root, with "/" separators. */
export function publicFiles(root) {
  return walk(root, '', (name, rel, isDir) => {
    if (hidden(name)) return false;
    if (!rel.includes('/') && EXCLUDED.has(name)) return false;
    if (!isDir && name.toLowerCase().endsWith('.md')) return false;
    return true;
  }, []);
}

/** Every file in the working tree except dependencies and git. */
export function allFiles(root) {
  return walk(root, '', (name, rel) => !(rel === 'node_modules' || rel === '.git'), []);
}

export function hasFrontMatter(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(5);
    const n = fs.readSync(fd, head, 0, 5, 0);
    return /^---\r?\n/.test(head.subarray(0, n).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

/** _data/*.json as a nested object: _data/seasonal/x.json is data.seasonal.x. */
export function loadSiteData(dir) {
  const data = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) data[entry.name] = loadSiteData(full);
    else if (entry.name.endsWith('.json')) data[entry.name.slice(0, -5)] = JSON.parse(fs.readFileSync(full, 'utf8'));
  }
  return data;
}
