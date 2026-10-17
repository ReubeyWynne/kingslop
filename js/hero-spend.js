/* What the hero bag can actually be spent on. Event points for hero shards and widgets
   are paid per piece consumed by an ascension or widget upgrade, so a shard only scores
   if an owned hero still has a star step it can pay for. One plan serves the Town Centre
   totals and the Heroes page, so both count the same spendable pieces.

   Costs (kingshotguide.com/database/hero-shards, kingshotmastery.com hero ascension
   calculator, kingshotguide.com hero widget calculator; every hero shares one curve):
   - a star step (catalogue index i → i + 1) costs STAR_STEPS[i]; 0★ to 5★ is 1,065 shards.
   - widget level n costs 5n widgets; 0 to 10 is 275.
   A step is paid whole: a part-filled step consumes nothing. General shards turn into any
   hero's shards of the same rarity, except Amadeus and Helga, who take only their own.
   Widgets belong to one hero (`hero-widgets-{hero}`); a generation's choose-a-hero widget
   chest (`hero-widget-chest-gen{n}`) goes to any owned widget hero of that generation.
   `hero-widget` is only the event item that carries the widget rate. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/heroes.json').heroes, require('./player-ledger.js'));
  else root.HeroSpend = factory(root.HeroCatalogue, root.PlayerLedger);
})(typeof window === 'object' ? window : globalThis, function (catalogue, ledger) {
  'use strict';
  var STAR_STEPS = [1, 1, 2, 2, 2, 2, 5, 5, 5, 5, 5, 15, 15, 15, 15, 15, 15, 40, 40, 40, 40, 40, 40, 100, 100, 100, 100, 100, 100, 100];
  var WIDGET_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  var EXCLUSIVE = ['amadeus', 'helga'];
  var SHARD_ITEM = { legendary: 'mythic-hero-shard', epic: 'epic-hero-shard', rare: 'rare-hero-shard' }, WIDGET_ITEM = 'hero-widget';
  var ITEMS = [SHARD_ITEM.legendary, SHARD_ITEM.epic, SHARD_ITEM.rare, WIDGET_ITEM];
  var HEROES = (catalogue || []).map(function (hero) { return { key: hero.key, name: hero.name, rarity: hero.rarity, generation: hero.generation, widget: Boolean(hero.widget) }; });
  var shardId = ledger.heroShardId, widgetId = ledger.heroWidgetId, chestId = ledger.widgetChestId;
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // Cumulative cost of the steps still ahead: totals[j] is the price of the next j steps.
  function ahead(steps, from) { var totals = [0]; for (var i = from; i < steps.length; i++) totals.push(totals[totals.length - 1] + steps[i]); return totals; }
  // Whole steps a hero's own pieces pay for alone.
  function ownOnly(totals, own) { var j = 0; while (j + 1 < totals.length && totals[j + 1] <= own) j++; return j; }
  /* Share a pool of general pieces between heroes so the most pieces are consumed; on a tie
     the fewest general pieces are used. Each hero picks how many steps to take, paying with
     its own pieces first, so this is a small grouped knapsack over the pool. */
  function allocate(pool, candidates) {
    var picks = candidates.map(function (c) { return { steps: ownOnly(c.totals, c.own), general: 0 }; });
    var open = candidates.map(function (c, at) {
      var options = [];
      if (!c.shared) return options;
      for (var j = picks[at].steps + 1; j < c.totals.length; j++) options.push({ steps: j, general: c.totals[j] - c.own, gain: c.totals[j] - c.totals[picks[at].steps] });
      return options;
    });
    var need = open.reduce(function (sum, options) { return sum + (options.length ? options[options.length - 1].general : 0); }, 0);
    var cap = Math.min(pool, need);
    if (cap <= 0) return picks;
    if (cap === need) {
      open.forEach(function (options, at) { if (options.length) { var last = options[options.length - 1]; picks[at] = { steps: last.steps, general: last.general }; } });
      return picks;
    }
    // best[g]: most extra pieces consumed using exactly g general pieces (-1: unreachable).
    var best = new Float64Array(cap + 1).fill(-1), choice = [];
    best[0] = 0;
    open.forEach(function (options) {
      var next = best.slice(), pick = new Int16Array(cap + 1).fill(-1);
      for (var g = 0; g <= cap; g++) {
        if (best[g] < 0) continue;
        for (var o = 0; o < options.length; o++) {
          var spent = g + options[o].general; if (spent > cap) break;
          if (best[g] + options[o].gain > next[spent]) { next[spent] = best[g] + options[o].gain; pick[spent] = o; }
        }
      }
      choice.push(pick); best = next;
    });
    var at = 0; for (var g = 1; g <= cap; g++) if (best[g] > best[at]) at = g;
    for (var h = open.length - 1; h >= 0; h--) {
      var o = choice[h][at];
      if (o >= 0) { picks[h] = { steps: open[h][o].steps, general: open[h][o].general }; at -= open[h][o].general; }
    }
    return picks;
  }
  /* The whole plan: every owned hero's spendable shards and widgets, the general pieces each
     takes, and per event item the pieces that would be consumed. Unknown stars, widget levels
     or counts are listed and counted as nothing, so a total is never inflated. */
  function plan(snapshot) {
    var section = snapshot.heroes || { roster: {} }, roster = section.roster || {}, unknown = [], heroes = {}, items = {};
    var owned = HEROES.filter(function (hero) { return Object.hasOwn(roster, hero.key); });
    function note(id) { if (!unknown.includes(id)) unknown.push(id); }
    // With no heroes recorded nothing can be spent yet, which is unknown rather than zero.
    // pool: the general pieces counted; left: those no owned hero can use (null while unknown).
    ITEMS.forEach(function (id) { items[id] = { amount: 0, pool: 0, used: 0, left: 0, unknown: owned.length ? [] : ['heroes'] }; });
    if (!owned.length) note('heroes');
    function spend(item, pool, steps, list, pieces) {
      var groups = list.map(function (entry) { return { totals: ahead(steps, pieces.from(entry)), own: pieces.own(entry), shared: pieces.shared(entry) }; });
      var picks = allocate(pool || 0, groups), used = 0;
      list.forEach(function (entry, at) {
        var totals = groups[at].totals, take = picks[at];
        pieces.write(entry, { from: pieces.from(entry), to: pieces.from(entry) + take.steps, spend: totals[take.steps], own: groups[at].own, ownUsed: totals[take.steps] - take.general, general: take.general, toMax: totals[totals.length - 1] });
        items[item].amount += totals[take.steps]; used += take.general;
      });
      items[item].used += used;
      if (pool === null || items[item].pool === null) items[item].pool = items[item].left = null;
      else { items[item].pool += pool; items[item].left += pool - used; }
    }
    owned.forEach(function (hero) {
      var copy = roster[hero.key];
      heroes[hero.key] = { key: hero.key, name: hero.name, rarity: hero.rarity, item: SHARD_ITEM[hero.rarity], shards: null, widget: null };
      if (copy.stars === null || copy.stars === undefined) { note('hero-stars-' + hero.key); items[SHARD_ITEM[hero.rarity]].unknown.push('hero-stars-' + hero.key); }
      if (confirmed(snapshot, shardId(hero.key)) === null) { note(shardId(hero.key)); items[SHARD_ITEM[hero.rarity]].unknown.push(shardId(hero.key)); }
      if (!hero.widget) return;
      if (copy.widget === null || copy.widget === undefined) { note('hero-widget-level-' + hero.key); items[WIDGET_ITEM].unknown.push('hero-widget-level-' + hero.key); }
      if (confirmed(snapshot, widgetId(hero.key)) === null) { note(widgetId(hero.key)); items[WIDGET_ITEM].unknown.push(widgetId(hero.key)); }
    });
    Object.keys(SHARD_ITEM).forEach(function (rarity) {
      var item = SHARD_ITEM[rarity], pool = confirmed(snapshot, item), list = owned.filter(function (hero) { return hero.rarity === rarity && roster[hero.key].stars !== null && roster[hero.key].stars !== undefined; });
      if (pool === null && list.some(function (hero) { return !EXCLUSIVE.includes(hero.key); })) { note(item); items[item].unknown.push(item); }
      spend(item, pool, STAR_STEPS, list, {
        from: function (hero) { return roster[hero.key].stars; },
        own: function (hero) { return confirmed(snapshot, shardId(hero.key)) || 0; },
        shared: function (hero) { return !EXCLUSIVE.includes(hero.key); },
        write: function (hero, result) { heroes[hero.key].shards = result; }
      });
    });
    // Widgets belong to one hero; a generation's choose-a-hero chest goes to any widget hero of that generation.
    var widgets = owned.filter(function (hero) { return hero.widget && roster[hero.key].widget !== null && roster[hero.key].widget !== undefined; });
    widgets.map(function (hero) { return hero.generation; }).filter(function (gen, at, all) { return all.indexOf(gen) === at; }).forEach(function (generation) {
      var id = chestId(generation), pool = confirmed(snapshot, id);
      if (pool === null) { note(id); items[WIDGET_ITEM].unknown.push(id); }
      spend(WIDGET_ITEM, pool, WIDGET_STEPS, widgets.filter(function (hero) { return hero.generation === generation; }), {
        from: function (hero) { return roster[hero.key].widget; },
        own: function (hero) { return confirmed(snapshot, widgetId(hero.key)) || 0; },
        shared: function () { return true; },
        write: function (hero, result) { heroes[hero.key].widget = result; }
      });
    });
    return { heroes: heroes, items: items, unknown: unknown, owned: owned.length };
  }
  /* The snapshot an event calculator should score: each hero item's balance becomes the
     pieces the plan can consume, so rates and days stay with the event rules. */
  function budget(snapshot, known) {
    var result = known || plan(snapshot), inventory = Object.assign({}, snapshot.inventory);
    ITEMS.forEach(function (id) { inventory[id] = { amount: result.items[id].amount, status: 'confirmed', provenance: null }; });
    return Object.assign({}, snapshot, { inventory: inventory });
  }
  // The best rate an event pays for one piece of an item, on any of its days.
  function rate(rules, event, id) {
    var out = null;
    rules.days(event).forEach(function (entry) { entry.rows.forEach(function (row) { (row.items || []).forEach(function (item) { if (item.id === id && (!out || item.rate > out.rate)) out = { day: entry.day, rate: item.rate }; }); }); });
    return out;
  }
  // Points one hero's spendable pieces score in an event, each kind on its best day.
  function points(rules, event, hero) {
    var shard = rate(rules, event, hero.item), widget = rate(rules, event, WIDGET_ITEM);
    var fromShards = hero.shards && shard ? hero.shards.spend * shard.rate : 0, fromWidget = hero.widget && widget ? hero.widget.spend * widget.rate : 0;
    return { shards: fromShards, widget: fromWidget, total: fromShards + fromWidget, shardDay: shard && shard.day, widgetDay: widget && widget.day };
  }
  // What an unknown id from the plan asks for, so pages can name it: { kind, hero }.
  var MISSING = { stars: 'stars', shards: 'shards', 'widget-level': 'widgetLevel', widgets: 'widgets' };
  function missing(id) {
    if (id === 'heroes') return { kind: 'heroes', hero: null };
    var chest = /^hero-widget-chest-gen([0-9]+)$/.exec(id);
    if (chest) return { kind: 'chest', hero: null, generation: Number(chest[1]) };
    var m = /^hero-(stars|shards|widget-level|widgets)-([a-z][a-z0-9]*)$/.exec(id), hero = m && HEROES.find(function (entry) { return entry.key === m[2]; });
    return hero ? { kind: MISSING[m[1]], hero: hero } : null;
  }
  return { STAR_STEPS: STAR_STEPS.slice(), WIDGET_STEPS: WIDGET_STEPS.slice(), EXCLUSIVE: EXCLUSIVE.slice(), SHARD_ITEM: Object.assign({}, SHARD_ITEM), WIDGET_ITEM: WIDGET_ITEM, ITEMS: ITEMS.slice(), HEROES: HEROES, shardId: shardId, widgetId: widgetId, chestId: chestId, allocate: allocate, plan: plan, budget: budget, rate: rate, points: points, missing: missing };
});
