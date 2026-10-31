/* Building paths: what a building goal takes. Pure (UMD), over window.BuildingPaths
   (_data/building_paths.json), so .dsh/building-paths-check.cjs can require it.

   A building is keyed by its id, or id-n for a numbered copy a prerequisite names ("house-1"
   is House 1); the same keys hold its level in the save's buildings.levels. Levels are the game's ids ('0' not built, '1'…'30', '30-1', 'TG 1', 'TG1-1' …);
   rank() orders them the way the optimizer does, 30 + 5 × TG.

   plan(data, goals, have) answers goals [{ building, level }, …] from the levels the player gave
   (have). A building they have not given is assumed at the least the rest of their city needs:
   everything each goal building's current level, and each level they did give, required on the
   way. The plan is every step from there to every goal, prerequisites shared and counted once,
   prerequisites first, with what it costs. */
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

  // Goals are a list of { building, level }; one goal on its own is a list of one. Two goals
  // on one building keep the higher level.
  function goals(data, list) {
    var out = [], at = {};
    (Array.isArray(list) ? list : [list]).forEach(function (g) {
      if (!g || !building(data, g.building) || levels(data, g.building).indexOf(g.level) < 0) return;
      if (at[g.building] === undefined) { at[g.building] = out.length; out.push({ building: g.building, level: g.level }); }
      else if (rank(g.level) > rank(out[at[g.building]].level)) out[at[g.building]].level = g.level;
    });
    return out;
  }

  function plan(data, goal, have) {
    have = have || {};
    var list = goals(data, goal);
    if (!list.length) return { state: 'unknown' };
    var start = {}, mine = {};
    Object.keys(have).forEach(function (k) { if (building(data, k) && !isNaN(rank(have[k]))) start[k] = have[k]; });
    list.forEach(function (g) { mine[g.building] = true; if (start[g.building] === undefined) start[g.building] = before(data, g.building, g.level); });
    // The least each other building must already be, given the levels we know.
    var floor = close(data, start, {}), current = {}, assumed = {};
    Object.keys(floor).forEach(function (k) {
      current[k] = start[k] !== undefined ? start[k] : floor[k];
      if (start[k] === undefined) assumed[k] = true;
    });
    var want = {};
    list.forEach(function (g) { if (rank(current[g.building]) < rank(g.level)) want[g.building] = g.level; });
    if (!Object.keys(want).length) return { state: 'met', goals: list, current: current, assumed: assumed, want: {}, steps: [], runs: [], blocked: [], total: total([]) };
    want = close(data, want, current);
    // Order: a step goes once its prerequisites are reached; prerequisites before the goal
    // buildings, and among each the building first named. A step whose prerequisite no plan
    // reaches (a source gap) is listed as blocked rather than dropped.
    var at = Object.assign({}, current), queue = {}, order = Object.keys(want), out = [], blocked = [];
    var last = list.map(function (g) { return g.building; }).filter(function (k) { return want[k] !== undefined; });
    order = order.filter(function (k) { return !mine[k]; }).concat(last);
    order.forEach(function (k) { queue[k] = steps(data, k, current[k] || '0', want[k]); });
    function ready(step) { return (step.needs || []).every(function (n) { return rank(at[key(n)]) >= rank(n[1] || '1'); }); }
    for (var guard = 0; guard < 5000; guard++) {
      var pick = null;
      for (var i = 0; i < order.length && !pick; i++) { var k = order[i]; if (queue[k].length && ready(queue[k][0])) pick = k; }
      if (!pick) break;
      var step = queue[pick].shift();
      out.push({ building: pick, from: at[pick] || '0', level: step.id, step: step });
      at[pick] = step.id;
    }
    order.forEach(function (k) { queue[k].forEach(function (step) { blocked.push({ building: k, level: step.id, step: step }); }); });
    return { state: blocked.length ? 'blocked' : 'plan', goals: list, current: current, assumed: assumed, want: want, why: why(out.concat(blocked), want, mine), steps: out, runs: runs(out), blocked: blocked, total: total(out) };
  }

  // Why each prerequisite goes as high as it does: the first step of each other building that
  // needs its top level (Embassy TG 4 for Command Center TG3-1), so a goal that pulls in a
  // prerequisite's extra upgrades says so on that prerequisite's card.
  function why(list, want, mine) {
    var out = {};
    list.forEach(function (s) {
      (s.step.needs || []).forEach(function (need) {
        var k = key(need);
        if (mine[k] || want[k] === undefined || rank(need[1] || '1') !== rank(want[k])) return;
        var by = out[k] || (out[k] = []);
        if (!by.some(function (b) { return b.building === s.building; })) by.push({ building: s.building, level: s.level });
      });
    });
    return out;
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
  function involved(data, goal) { var t = {}; goals(data, goal).forEach(function (g) { t[g.building] = g.level; }); return Object.keys(close(data, t, {})); }

  // A link: ?goal=town-center:TG3,barracks:TG3[&have=house-1:2,embassy:TG1-2][&speed=42.5][&dt=1][&pan=5]
  // (speed is the whole construction speed bonus, dt Double Time, pan Pan's Master Architect level).
  // Without have the reader's own levels fill in the plan; with it the link opens as the sender
  // left it. The first links carried one goal as ?b=town-center&to=3; those still open.
  function pairs(list) { return list.map(function (x) { return x[0] + ':' + short(x[1]); }).join(','); }
  function encode(state) {
    var out = ['goal=' + pairs((state.goals || []).map(function (g) { return [g.building, g.level]; }))];
    var have = Object.keys(state.have || {}).sort().map(function (k) { return [k, state.have[k]]; });
    if (have.length) out.push('have=' + pairs(have));
    if (state.speed > 0) out.push('speed=' + state.speed);
    if (state.doubleTime) out.push('dt=1');
    if (state.pan > 0) out.push('pan=' + state.pan);
    return out.join('&');
  }
  function read(text) {
    return (text || '').split(',').map(function (pair) { var at = pair.lastIndexOf(':'); return at > 0 ? [pair.slice(0, at), level(pair.slice(at + 1))] : null; }).filter(Boolean);
  }
  function decode(data, search) {
    var q = new URLSearchParams(search), out = { goals: [], have: null, speed: null, doubleTime: q.get('dt') === '1', pan: null };
    var wanted = q.has('goal') ? read(q.get('goal')) : q.has('b') ? [[q.get('b'), level(q.get('to') || '')]] : [];
    out.goals = goals(data, wanted.filter(function (x) { return building(data, x[0]) && !building(data, x[0]).single; }).map(function (x) { return { building: x[0], level: x[1] }; }));
    if (q.has('have')) {
      out.have = {};
      read(q.get('have')).forEach(function (x) { if (building(data, x[0]) && (x[1] === '0' || levels(data, x[0]).indexOf(x[1]) >= 0)) out.have[x[0]] = x[1]; });
    }
    var speed = Number(q.get('speed'));
    if (q.has('speed') && isFinite(speed) && speed > 0 && speed <= 1000) out.speed = speed;
    var pan = Number(q.get('pan'));
    if (Number.isInteger(pan) && pan >= 1 && pan < BOOST.pan.length) out.pan = pan;
    return out;
  }

  // Base seconds at a construction speed bonus (%).
  function atSpeed(seconds, speed) { return speed > 0 ? Math.floor(seconds / (1 + speed / 100)) : seconds; }

  // What shortens an upgrade. Speed bonuses add up and divide the base time; Double Time then
  // takes 20% off; Pan's Master Architect takes whole hours off every upgrade last ("after speed
  // bonuses"). Values: VIP (none, 4–8, 9+), Saul's construction skill and the Gray Wolf's by
  // level, the Chief Minister (and while the kingdom holds the High King), the Ground Works
  // decree and KvK, as read in game and on Kingshot Optimizer's building calculator.
  var BOOST = {
    vip: { 0: 0, 4: 10, 9: 20 }, saul: [0, 3, 6, 9, 12, 15], wolf: [0, 5, 7, 9, 12, 15],
    position: { '': 0, minister: 10, highKing: 15 }, groundWorks: 10, kvk: 5, doubleTime: 0.8, pan: [0, 2, 3, 4, 6, 8]
  };
  function pick(list, i) { return list[i] || 0; }
  // settings: { mode: 'overview' | 'parts', overview, vip, saul, research, wolf, position, groundWorks, kvk, doubleTime, pan }
  function boost(settings) {
    var b = settings || {}, base = b.mode === 'parts' ? pick(BOOST.vip, b.vip) + pick(BOOST.saul, b.saul) + (Number(b.research) || 0) : Number(b.overview) || 0;
    var speed = base + pick(BOOST.wolf, b.wolf) + pick(BOOST.position, b.position || '') + (b.groundWorks ? BOOST.groundWorks : 0) + (b.kvk ? BOOST.kvk : 0);
    return { speed: Math.round(speed * 100) / 100, doubleTime: !!b.doubleTime, pan: pick(BOOST.pan, b.pan) };
  }
  function stepSeconds(seconds, b) {
    b = b || {};
    var s = seconds / (1 + (b.speed || 0) / 100);
    if (b.doubleTime) s *= BOOST.doubleTime;
    return Math.max(0, Math.floor(s) - (b.pan || 0) * 3600);
  }
  // The time a list of steps takes, each its own upgrade.
  function timed(list, b) {
    var time = 0, known = true;
    list.forEach(function (step) { if (typeof step.time === 'number') time += stepSeconds(step.time, b); else known = false; });
    return { time: time, known: known };
  }

  return { RESOURCES: RESOURCES, rank: rank, level: level, short: short, key: key, split: split, building: building, levels: levels, before: before, steps: steps, total: function (steps) { return total(steps.map(function (step) { return { step: step }; })); }, goals: goals, plan: plan, involved: involved, encode: encode, decode: decode, atSpeed: atSpeed, BOOST: BOOST, boost: boost, stepSeconds: stepSeconds, timed: timed };
}));
