/* The scripts each page loads, and the files the build makes for them.

   A page runs the scripts in _data/boot.json around its own list (pages.json scripts). Most
   are classic scripts sharing the page's globals (window.BH …); the ones moved to ES modules
   end in .mjs and import what they need. Classic scripts still read a module through the
   global it used to set, named in boot.json "globals", until none does: the module's
   'module.exports' object when it has one (the one object require() returns), else a copy
   of its exports.

   Bundled (the default), a page loads two files, minified with esbuild:
   - js/site.bundle.js: boot.before and boot.shared, what every page runs, cached once;
   - js/page-<token>.bundle.js: the rest of the page's list, then boot.after.
   Unbundled (`npm run debug`), each classic script loads on its own and the page's modules
   load as one unminified file, js/page-<token>.modules.js, so there is still one copy of each.

   In either form a page's modules are bundled together and run where the first of them is
   listed, each setting its global as it does. A module may import other modules but never
   read a classic script's global as it loads, so running a little earlier changes nothing.

   Classic scripts are joined as they are (esbuild keeps every top-level name). A script that
   finds files beside itself (workers, dictionaries) reads its own URL, and every bundle sits
   in js/ with them, so those paths are unchanged. A bundle's ?v= is a hash of its contents.

   Workers written as modules (js/*-worker.mjs) are bundled into the classic worker script
   the page starts (js/*-worker.js). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build, transform } from 'esbuild';
import { createLiquid } from './liquid.mjs';

const isModule = rel => rel.endsWith('.mjs');
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

/* What every page runs (boot.before, then boot.shared), and the rest of the page's own list,
   then boot.after. A page must list every shared script. */
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

async function esbuild(root, contents, minify) {
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile: 'entry.mjs', loader: 'js' },
    bundle: true, format: 'iife', minify, write: false, legalComments: 'none', charset: 'utf8', logLevel: 'silent'
  });
  return result.outputFiles[0].text;
}

/** Builds every bundle. Returns { scripts: { token: [root-relative src, …] }, files: { path: text } }.
    `stamp` versions the unbundled classic scripts, as before. */
export async function buildScripts({ root, data, bundle, stamp }) {
  const liquid = createLiquid(root);
  const templates = liquidScripts(root);
  const globals = data.boot.globals || {};
  const cache = new Map(), files = {}, scripts = {};

  async function classic(rel) {
    if (!cache.has(rel)) {
      cache.set(rel, templates.has(rel)
        ? await liquid.parseAndRender(templates.get(rel).body, { site: { data } })
        : fs.readFileSync(path.join(root, rel), 'utf8'));
    }
    return cache.get(rel);
  }

  /* The page's modules as one classic script that sets each module's global. */
  async function modules(list, minify) {
    const lines = list.map((rel, i) => {
      if (!fs.existsSync(path.join(root, rel))) throw new Error('No such module: ' + rel);
      const name = globals[rel];
      return name
        ? 'import * as m' + i + " from './" + rel + "';\nglobalThis." + name + " = m" + i + "['module.exports'] || Object.assign({}, m" + i + ');'
        : "import './" + rel + "';";
    });
    return esbuild(root, lines.join('\n') + '\n', minify);
  }

  /* Classic scripts in order, with the modules joined where the first of them is listed. */
  async function join(name, list) {
    const mods = list.filter(isModule);
    const parts = [];
    for (const rel of list) {
      if (!isModule(rel)) parts.push('/* ' + rel + ' */\n' + (await classic(rel)) + '\n;\n');
      else if (rel === mods[0]) parts.push('/* ' + mods.join(', ') + ' */\n' + (await modules(mods, false)) + '\n;\n');
    }
    let code;
    try {
      ({ code } = await transform(parts.join(''), { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }));
    } catch (error) {
      throw new Error('Could not bundle ' + name + ': ' + error.message);
    }
    files[name] = code;
    return name + '?v=' + hash(code);
  }

  let shared = null;
  for (const [token, page] of Object.entries(data.pages)) {
    const split = splitScripts(token, page, data.boot);
    if (bundle) {
      shared = shared || await join('js/site.bundle.js', split.shared);
      scripts[token] = [shared, await join('js/page-' + token + '.bundle.js', split.own)];
      continue;
    }
    // Unbundled: the page's own order, every module in one file where the first is listed.
    const list = [...split.shared.slice(0, data.boot.before.length), ...(page.scripts || []).map(s => s.slice((page.depth || '').length)), ...data.boot.after];
    const mods = list.filter(isModule), out = [];
    for (const rel of list) {
      if (!isModule(rel)) out.push(rel + '?v=' + stamp);
      else if (rel === mods[0]) {
        const name = 'js/page-' + token + '.modules.js', code = await modules(mods, false);
        files[name] = code;
        out.push(name + '?v=' + hash(code));
      }
    }
    scripts[token] = out;
  }

  // Workers written as modules, bundled into the classic scripts the pages start.
  for (const name of fs.readdirSync(path.join(root, 'js')).filter(n => /-worker\.mjs$/.test(n)).sort()) {
    files['js/' + name.replace(/\.mjs$/, '.js')] = await esbuild(root, "import './js/" + name + "';\n", bundle);
  }
  return { scripts, files };
}
