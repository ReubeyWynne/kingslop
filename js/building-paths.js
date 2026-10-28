/* Building paths: what a building goal takes. Pure (UMD), over window.BuildingPaths
   (_data/building_paths.json), so .dsh/building-paths-check.cjs can require it.

   A building is keyed by its id, or id-n for a numbered copy a prerequisite names ("house-1"
   is House 1); the same keys hold its level in the save's buildings.levels. Levels are the game's ids ('0' not built, '1'…'30', '30-1', 'TG 1', 'TG1-1' …);
   rank() orders them the way the optimizer does, 30 + 5 × TG.

   plan(data, goal, have) answers a goal { building, level } from the levels the player gave
   (have). A building they have not given is assumed at the least the rest of their city needs:
   everything the goal building's current level, and each level they did give, required on the
   way. The plan is every step from there to the goal, prerequisites first, with what it costs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuildingPathsEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RESOURCES = ['bread', 'wood', 'stone', 'iron', 'truegold', 'tempered-truegold'];

  function rank(id) {
    if (id === undefined || id === null || id === '' || id === '0') return 0;
    var m = /^TG ?(\d+)(?:-(\d))?$/.exec(id);
    if (m) return 30 + 5 * Number(m[1]) + (m[2] ? Number(m[2]) : 0);
    m = /^(\d+)(?:-(\d))?$/.exec(id);
    return m ? Number(m[1]) + (m[2] ? Number(m[2]) : 0) : NaN;
  }
  // 'TG1' and 'TG 1' are one level; links carry the short form.
  function level(id) {
    var text = String(id === undefined || id === null ? '' : id).trim(), m = /^TG ?(\d+)$/.exec(text);
    return m ? 'TG ' + m[1] : text.replace(/^TG (\d+-\d)$/, 'TG$1');
  }
  function short(id) { return String(id).replace(/^TG (\d+)$/, 'TG$1'); }

  function key(need) { return need[2] ? need[0] + '-' + need[2] : need[0]; }
  function split(k) { var m = /^(.+)-(\d+)$/.exec(k); return m ? { id: m[1], n: Number(m[2]) } : { id: k, n: null }; }

  function index(data) {
    if (data.__index) return data.__index;
    var byId = {};
    data.buildings.forEach(function (b) { byId[b.id] = b; });
    // A building a prerequisite names without levels (the Hero Hall) is one step: built.
    (data.single || []).forEach(function (id) { byId[id] = { id: id, single: true, levels: [{ id: '1', cost: {}, time: null, sources: [] }] }; });
    Object.defineProperty(data, '__index', { value: byId, enumerable: false });
    return byId;
  }
  function building(data, k) { return index(data)[split(k).id] || null; }
  function levels(data, k) { var b = building(data, k); return b ? b.levels.map(function (l) { return l.id; }) : []; }
  // The level before `id` on the building's path ('0' before its first).
  function before(data, k, id) {
    var list = levels(data, k), at = list.indexOf(id);
    return at > 0 ? list[at - 1] : '0';
  }
  function steps(data, k, from, to) {
    var b = building(data, k), lo = rank(from), hi = rank(to);
    return b ? b.levels.filter(function (l) { return rank(l.id) > lo && rank(l.id) <= hi; }) : [];
  }

  // Raise `target` until every step above `base` and up to it has its prerequisites in it.
  function close(data, target, base) {
    var out = Object.assign({}, target), queue = Object.keys(out), guard = 0;
    while (queue.length && guard++ < 10000) {
      var k = queue.shift();
      steps(data, k, base[k] || '0', out[k]).forEach(function (step) {
        (step.needs || []).forEach(function (need) {
          var y = key(need), m = need[1] || '1';
          if (rank(m) > rank(out[y]) && rank(m) > rank(base[y])) { out[y] = m; queue.push(y); }
        });
      });
    }
    return out;
  }

  function plan(data, goal, have) {
    have = have || {};
    var g = goal.building, to = goal.level, b = building(data, g);
    if (!b || levels(data, g).indexOf(to) < 0) return { state: 'unknown' };
    var start = {};
    Object.keys(have).forEach(function (k) { if (building(data, k) && !isNaN(rank(have[k]))) start[k] = have[k]; });
    if (start[g] === undefined) start[g] = before(data, g, to);
    // The least each other building must already be, given the levels we know.
    var floor = close(data, start, {}), current = {}, assumed = {};
    Object.keys(floor).forEach(function (k) {
      current[k] = start[k] !== undefined ? start[k] : floor[k];
      if (start[k] === undefined) assumed[k] = true;
    });
    if (rank(current[g]) >= rank(to)) return { state: 'met', goal: goal, current: current, assumed: assumed, steps: [], total: total([]) };
    var want = {};
    want[g] = to;
    want = close(data, want, current);
    // Order: a step goes once its prerequisites are reached; prerequisites before the goal
    // building, and among them the building first named. A step whose prerequisite no plan
    // reaches (a source gap) is listed as blocked rather than dropped.
    var at = Object.assign({}, current), queue = {}, order = Object.keys(want), out = [], blocked = [];
    order.forEach(function (k) { queue[k] = steps(data, k, current[k] || '0', want[k]); });
    function ready(step) { return (step.needs || []).every(function (n) { return rank(at[key(n)]) >= rank(n[1] || '1'); }); }
    for (var guard = 0; guard < 2000; guard++) {
      var pick = null;
      for (var i = 0; i < order.length && !pick; i++) { var k = order[i]; if (k !== g && queue[k].length && ready(queue[k][0])) pick = k; }
      if (!pick && queue[g].length && ready(queue[g][0])) pick = g;
      if (!pick) break;
      var step = queue[pick].shift();
      out.push({ building: pick, from: at[pick] || '0', level: step.id, step: step });
      at[pick] = step.id;
    }
    order.forEach(function (k) { queue[k].forEach(function (step) { blocked.push({ building: k, level: step.id, step: step }); }); });
    return { state: blocked.length ? 'blocked' : 'plan', goal: goal, current: current, assumed: assumed, want: want, steps: out, runs: runs(out), blocked: blocked, total: total(out) };
  }

  // Consecutive steps on one building read as one line: Embassy 10 → 14.
  function runs(list) {
    var out = [];
    list.forEach(function (s) {
      var last = out[out.length - 1];
      if (last && last.building === s.building) { last.level = s.level; last.steps.push(s.step); }
      else out.push({ building: s.building, from: s.from, level: s.level, steps: [s.step] });
    });
    out.forEach(function (r) { r.total = total(r.steps.map(function (step) { return { step: step }; })); });
    return out;
  }
  function total(list) {
    var cost = {}, unverified = {}, time = 0, timeKnown = true;
    list.forEach(function (s) {
      var step = s.step;
      Object.keys(step.cost || {}).forEach(function (r) { cost[r] = (cost[r] || 0) + step.cost[r]; });
      (step.unverified || []).forEach(function (r) { unverified[r] = true; });
      if (typeof step.time === 'number') time += step.time; else timeKnown = false;
    });
    return { cost: cost, resources: RESOURCES.filter(function (r) { return cost[r]; }), unverified: unverified, time: time, timeKnown: timeKnown, steps: list.length };
  }
  // Every building the goal's whole path can name, from scratch.
  function involved(data, goal) { var t = {}; t[goal.building] = goal.level; return Object.keys(close(data, t, {})); }

  // A link: ?b=town-center&to=3[&have=house-1:2,embassy:TG1-2][&speed=42.5]. Without have the
  // reader's own levels fill in the plan; with it the link opens as the sender left it.
  function encode(state) {
    var out = ['b=' + state.building, 'to=' + short(state.level)];
    var have = Object.keys(state.have || {}).sort().map(function (k) { return k + ':' + short(state.have[k]); });
    if (have.length) out.push('have=' + have.join(','));
    if (state.speed > 0) out.push('speed=' + state.speed);
    return out.join('&');
  }
  function decode(data, search) {
    var q = new URLSearchParams(search), b = q.get('b'), to = level(q.get('to') || ''), out = { have: null, speed: null };
    if (b && building(data, b) && !building(data, b).single && levels(data, b).indexOf(to) >= 0) { out.building = b; out.level = to; }
    if (q.has('have')) {
      out.have = {};
      (q.get('have') || '').split(',').forEach(function (pair) {
        var at = pair.lastIndexOf(':'), k = pair.slice(0, at), l = level(pair.slice(at + 1));
        if (at > 0 && building(data, k) && (l === '0' || levels(data, k).indexOf(l) >= 0)) out.have[k] = l;
      });
    }
    var speed = Number(q.get('speed'));
    if (q.has('speed') && isFinite(speed) && speed > 0 && speed <= 1000) out.speed = speed;
    return out;
  }

  // Base seconds at a construction speed bonus (%).
  function atSpeed(seconds, speed) { return speed > 0 ? Math.floor(seconds / (1 + speed / 100)) : seconds; }

  return { RESOURCES: RESOURCES, rank: rank, level: level, short: short, key: key, split: split, building: building, levels: levels, before: before, steps: steps, total: function (steps) { return total(steps.map(function (step) { return { step: step }; })); }, plan: plan, involved: involved, encode: encode, decode: decode, atSpeed: atSpeed };
}));
