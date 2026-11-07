/* Two scripts per page. Every page used to load its scripts one by one (up to 38 tags on
   Town Centre); the build now joins them, in the order the page lists them, into
   js/site.bundle.js (what every page runs, cached once for the whole site) and
   js/page-<token>.bundle.js (the rest), and minifies both with esbuild.

   The scripts are classic scripts sharing the page's globals (window.BH, window.HeroGear …),
   so they are joined as they are, not converted to modules: esbuild minifies the joined
   text as one classic script and keeps every top-level name. A script that finds files
   beside itself (workers, dictionaries) reads its own URL, and the bundle sits in js/ with
   them, so those paths are unchanged.

   A bundle's ?v= is a hash of its contents, so a browser keeps it until it changes, and a
   worker started from it inherits the same query. Scripts a page loads later (lateScripts,
   workers, the screenshot reader) stay separate files. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { transform } from 'esbuild';
import { createLiquid } from './liquid.mjs';

/* The same scripts split in two: what every page runs (boot.before, then boot.shared) and the
   rest of the page's own list, then boot.after. A page's own scripts never run before the
   shared ones in a bundle, so a page must list every shared script. */
export function splitScripts(token, page, boot) {
  const own = (page.scripts || []).map(s => s.slice((page.depth || '').length));
  const absent = boot.shared.filter(s => !own.includes(s));
  if (absent.length) throw new Error('pages.json "' + token + '" does not list ' + absent.join(', ') + ' (shared by every page in _data/boot.json)');
  return { shared: [...boot.before, ...boot.shared], own: [...own.filter(s => !boot.shared.includes(s)), ...boot.after] };
}

/* js/*.liquid templates are published at their permalink (js/hero-data.liquid → /js/hero-data.js). */
function liquidScripts(root) {
  const map = new Map();
  for (const name of fs.readdirSync(path.join(root, 'js'))) {
    if (!name.endsWith('.liquid')) continue;
    const text = fs.readFileSync(path.join(root, 'js', name), 'utf8');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const permalink = m && (m[1].match(/^permalink:\s*(\S+)/m) || [])[1];
    if (permalink) map.set(permalink.replace(/^\//, ''), { body: text.slice(m[0].length) });
  }
  return map;
}

/** Joins and minifies the scripts. Returns { bundles: { shared, pages: { token: … } }, files: { path: text } };
    each bundle is { file, v, sources, bytes, sourceBytes }. */
export async function buildBundles({ root, data }) {
  const liquid = createLiquid(root);
  const templates = liquidScripts(root);
  const site = { data };
  const cache = new Map(), files = {}, pages = {};

  async function source(rel) {
    if (cache.has(rel)) return cache.get(rel);
    let text;
    if (templates.has(rel)) text = await liquid.parseAndRender(templates.get(rel).body, { site });
    else text = fs.readFileSync(path.join(root, rel), 'utf8');
    cache.set(rel, text);
    return text;
  }

  async function bundle(name, sources) {
    const parts = [];
    for (const rel of sources) parts.push('/* ' + rel + ' */\n' + (await source(rel)) + '\n;\n');
    const joined = parts.join('');
    let code;
    try {
      ({ code } = await transform(joined, { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }));
    } catch (error) {
      throw new Error('Could not bundle ' + name + ': ' + error.message);
    }
    const v = crypto.createHash('sha256').update(code).digest('hex').slice(0, 10);
    files[name] = code;
    return { file: name, v, sources, bytes: Buffer.byteLength(code), sourceBytes: Buffer.byteLength(joined) };
  }

  let shared = null;
  for (const [token, page] of Object.entries(data.pages)) {
    const split = splitScripts(token, page, data.boot);
    if (!shared) shared = await bundle('js/site.bundle.js', split.shared);
    pages[token] = await bundle('js/page-' + token + '.bundle.js', split.own);
  }
  const bundles = { shared, pages };
  return { bundles, files };
}
