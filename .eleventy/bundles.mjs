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
   listed, each setting its global as it does, and the site bundle's modules (boot.before and
   boot.shared) are a group of their own that the page's modules read through their globals.
   A module may import other modules but never read a classic script's global as it loads,
   so running a little earlier changes nothing. It imports the _data JSON it needs; where the
   page lists that data's script (boot.json "data") before its modules, the build reads the
   global the script sets instead, and stops if the script comes after them.

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

/* The page globals a group of modules reads instead of bundling its own copy, keyed by file:
   the modules an earlier group already ran (the site bundle's, for a page's own modules), by
   their boot.json "globals" name, and the _data files whose data script (boot.json "data")
   the page lists before the group runs. An import of either becomes `module.exports = <global>`,
   so a default import is that object and a named import one of its properties. */
function pageGlobals(root, boot, before, ran) {
  const provided = new Map(), later = new Map();
  for (const rel of ran) if (boot.globals && boot.globals[rel]) provided.set(path.resolve(root, rel), 'globalThis.' + boot.globals[rel]);
  for (const [file, { script, value }] of Object.entries(boot.data || {})) {
    if (before.includes(script)) provided.set(path.resolve(root, file), value);
    else later.set(path.resolve(root, file), script);
  }
  return { provided, later, ran: new Set(ran.map(rel => path.resolve(root, rel))) };
}

function pageGlobalsPlugin(root, { provided, later, ran }, first) {
  return {
    name: 'page-globals',
    setup(b) {
      b.onResolve({ filter: /^\.\.?\// }, args => {
        if (args.namespace === 'page-global' || !args.resolveDir) return undefined;
        const file = path.resolve(args.resolveDir, args.path), rel = path.relative(root, file);
        if (provided.has(file)) return { path: rel + ' (page global)', namespace: 'page-global', pluginData: provided.get(file) };
        if (later.has(file)) throw new Error(rel + ' is read from ' + later.get(file) + ', so the page must list that before ' + first);
        if (ran.has(file)) throw new Error(rel + ' already runs earlier on the page; name its global in _data/boot.json "globals"');
        return undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'page-global' }, args => ({ contents: 'module.exports = ' + args.pluginData + ';', loader: 'js' }));
    }
  };
}

async function esbuild(root, contents, minify, plugins = []) {
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile: 'entry.mjs', loader: 'js' },
    bundle: true, format: 'iife', minify, write: false, legalComments: 'none', charset: 'utf8', logLevel: 'silent', plugins
  });
  return result.outputFiles[0].text;
}

/* A list of scripts as the parts a page runs in order: each classic script, and each group of
   modules where the first of the group is listed. Modules in `sharedMods` (what the site bundle
   runs) are one group and the page's own modules another, so in either form a module the site
   bundle runs is read through its global rather than bundled twice. */
function parts(list, sharedMods) {
  const out = [], groups = new Map();
  list.forEach((rel, i) => {
    if (!isModule(rel)) return out.push({ rel });
    const key = sharedMods.includes(rel) ? 'shared' : 'own';
    if (!groups.has(key)) { groups.set(key, { mods: [], before: list.slice(0, i) }); out.push(groups.get(key)); }
    groups.get(key).mods.push(rel);
  });
  return out;
}

/** A list of modules as one classic script that sets each module's global, as a page runs
    them. `before` is every script the page runs ahead of them. The .dsh checks use it too. */
export async function bundleModules({ root, boot, mods, before = [], minify = false }) {
  const globals = boot.globals || {};
  const lines = mods.map((rel, i) => {
    if (!fs.existsSync(path.join(root, rel))) throw new Error('No such module: ' + rel);
    const name = globals[rel];
    return name
      ? 'import * as m' + i + " from './" + rel + "';\nglobalThis." + name + " = m" + i + "['module.exports'] || Object.assign({}, m" + i + ');'
      : "import './" + rel + "';";
  });
  const plugin = pageGlobalsPlugin(root, pageGlobals(root, boot, before, before.filter(isModule)), mods[0]);
  try {
    return await esbuild(root, lines.join('\n') + '\n', minify, [plugin]);
  } catch (error) {
    throw new Error('Could not bundle ' + mods.join(', ') + ': ' + (((error.errors || [])[0] || {}).text || error.message));
  }
}

/** Builds every bundle. Returns { scripts: { token: [root-relative src, …] }, late: { token: […] },
    files: { path: text } }; `late` is what a page loads after paint (pages.json lateScripts).
    `stamp` versions the unbundled classic scripts, as before. */
export async function buildScripts({ root, data, bundle, stamp }) {
  const liquid = createLiquid(root);
  const templates = liquidScripts(root);
  const boot = data.boot;
  const cache = new Map(), files = {}, scripts = {}, late = {};
  const sharedList = [...boot.before, ...boot.shared], sharedMods = sharedList.filter(isModule);

  async function classic(rel) {
    if (!cache.has(rel)) {
      cache.set(rel, templates.has(rel)
        ? await liquid.parseAndRender(templates.get(rel).body, { site: { data } })
        : fs.readFileSync(path.join(root, rel), 'utf8'));
    }
    return cache.get(rel);
  }

  const modules = (group, before, minify) => bundleModules({ root, boot, mods: group.mods, before, minify });

  /* `list` joined into one minified file; `earlier` is what the page has already run. */
  async function join(name, list, earlier) {
    const out = [];
    for (const part of parts(list, sharedMods)) {
      if (part.rel) out.push('/* ' + part.rel + ' */\n' + (await classic(part.rel)) + '\n;\n');
      else out.push('/* ' + part.mods.join(', ') + ' */\n' + (await modules(part, [...earlier, ...part.before], false)) + '\n;\n');
    }
    let code;
    try {
      ({ code } = await transform(out.join(''), { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }));
    } catch (error) {
      throw new Error('Could not bundle ' + name + ': ' + error.message);
    }
    files[name] = code;
    return name + '?v=' + hash(code);
  }

  let shared = null;
  for (const [token, page] of Object.entries(data.pages)) await pageScripts(token, page).catch(error => {
    throw new Error('pages.json "' + token + '": ' + error.message);
  });
  async function pageScripts(token, page) {
    const split = splitScripts(token, page, boot);
    // What the page loads after paint for a returning player (pages.json lateScripts), after all of the rest.
    const lateList = (page.lateScripts || []).map(s => s.slice((page.depth || '').length));
    if (bundle) {
      shared = shared || await join('js/site.bundle.js', split.shared, []);
      scripts[token] = [shared, await join('js/page-' + token + '.bundle.js', split.own, split.shared)];
      if (lateList.length) late[token] = [await join('js/page-' + token + '.late.bundle.js', lateList, [...split.shared, ...split.own])];
      return;
    }
    // Unbundled: the page's own order, each group of modules as one file where its first is listed.
    const list = [...boot.before, ...(page.scripts || []).map(s => s.slice((page.depth || '').length)), ...boot.after];
    const out = [];
    for (const part of parts(list, sharedMods)) {
      if (part.rel) { out.push(part.rel + '?v=' + stamp); continue; }
      const name = sharedMods.includes(part.mods[0]) ? 'js/site.modules.js' : 'js/page-' + token + '.modules.js';
      files[name] = await modules(part, part.before, false);
      out.push(name + '?v=' + hash(files[name]));
    }
    scripts[token] = out;
    if (lateList.length) {
      late[token] = [];
      for (const part of parts(lateList, [])) {
        if (part.rel) { late[token].push(part.rel + '?v=' + stamp); continue; }
        const name = 'js/page-' + token + '.late.modules.js';
        files[name] = await modules(part, [...list, ...part.before], false);
        late[token].push(name + '?v=' + hash(files[name]));
      }
    }
  }

  // Workers written as modules, bundled into the classic scripts the pages start.
  for (const name of fs.readdirSync(path.join(root, 'js')).filter(n => /-worker\.mjs$/.test(n)).sort()) {
    files['js/' + name.replace(/\.mjs$/, '.js')] = await esbuild(root, "import './js/" + name + "';\n", bundle);
  }
  return { scripts, late, files };
}
