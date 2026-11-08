// Modules (js/*.mjs) as one classic script, bundled the way a page runs them: each sets its
// global (window.EventRules …, named in _data/boot.json "globals") and reads its _data from
// the data globals (window.EventRuleData …) rather than the JSON files. For checks that run
// an engine in a vm context or a test page with data of their own.
//   classicModules('js/event-rules.mjs', 'js/governor-engine.mjs') → source text
// In a vm context the script sets and reads the context's own globals, so give the context
// itself as `window`: const context = { EventRuleData: data }; context.window = context;
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const cache = new Map();
function classicModules(...mods) {
  const key = mods.join(' ');
  if (!cache.has(key)) {
    cache.set(key, execFileSync(process.execPath, [path.join(__dirname, 'classic-modules.mjs'), ...mods], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  }
  return cache.get(key);
}

module.exports = { classicModules };
