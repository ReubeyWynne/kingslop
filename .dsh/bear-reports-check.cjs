// Bear reports check — _data/bear-reports.json against the battle engine's Bear (js/battle-engine.mjs
// BEAR). Every entry is simulated at the current Bear defence; the defence each entry asks for is
// that defence × simulated ÷ seen (damage is inversely proportional to it). The game's own hits
// decide, weighted by how many there are; the Frakinator's run stands in while there are none.
// Run it after adding an entry: it prints the refitted defence to put in BEAR.def.
const assert = require('node:assert/strict');
const E = require('../js/battle-engine.mjs'), C = require('../js/combat.mjs');
const combat = require('../_data/combat.json'), log = require('../_data/bear-reports.json');
const data = { heroSkills: combat.heroSkills, widgets: combat.widgets, widgetSkill: combat.widgetSkill };
const rows = log.reports.map(r => {
  const joiners = (r.joiners || log.defaultJoiners).map(key => ({ key, level: 5 }));
  const skills = C.side(data, { role: 'rally', heroes: r.heroes.map(h => ({ key: h.key, levels: h.skills, widget: 0 })), joiners });
  const sim = E.bearHunt({ n: r.march, tier: r.tier, tg: r.tg, atk: r.attack, let: r.lethality, skills }, 10000, 7, r.valora);
  const seen = r.hits ? r.hits.reduce((a, b) => a + b) / r.hits.length : r.mean;
  const lo = E.quantile(sim.totals, 0.05), hi = E.quantile(sim.totals, 0.95);
  if (r.hits) r.hits.forEach(h => assert.ok(h >= lo * 0.9 && h <= hi * 1.1, `${r.date} ${r.player}: a hit of ${(h / 1e6).toFixed(1)}M is far outside ${(lo / 1e6).toFixed(1)}–${(hi / 1e6).toFixed(1)}M — check the entry`));
  return { r, sim: sim.mean, seen, def: E.BEAR.def * sim.mean / seen, weight: r.hits ? r.hits.length : 1 };
});
rows.forEach(x => console.log(`  ${x.r.date} ${x.r.player} (${x.r.source}${x.r.joiners ? '' : ', joiners assumed'}): seen ${(x.seen / 1e6).toFixed(1)}M, simulated ${(x.sim / 1e6).toFixed(1)}M → defence ${x.def.toFixed(1)}`));
const game = rows.filter(x => x.r.source === 'game'), use = game.length >= 3 ? game : rows;
const fit = use.reduce((s, x) => s + x.def * x.weight, 0) / use.reduce((s, x) => s + x.weight, 0);
console.log(`Bear reports: ${rows.length} entries, ${game.length} from the game. Fitted defence ${fit.toFixed(1)} (${game.length >= 3 ? 'game hits only' : 'all entries until three game setups'}); BEAR.def is ${E.BEAR.def}.`);
assert.ok(Math.abs(E.BEAR.def / fit - 1) < 0.03, `BEAR.def ${E.BEAR.def} has drifted from the reports' ${fit.toFixed(1)}: update it`);
