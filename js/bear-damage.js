/* The Bear Hunt page's damage estimate: your best Bear lead from the save
   (js/lead-account.js, scored by js/lead-engine.js like the Heroes page's
   lead finder), hitting with the marches the builder above shows, over a
   whole hunt at the hunt's size. The result names what it's worked out from
   with the same input chips (js/lead-inputs.js) and stays provisional while
   a core input is missing. */
(function () {
  'use strict';
  var EN = {
    noHeroes: 'Mark the heroes you own on the Heroes page.',
    lead: 'Leading with {heroes}',
    perHit: '{dmg} a hit × {n}',
    leaders: 'Other rally leaders',
    est: 'Estimate'
  };
  var TYPES = ['inf', 'cav', 'arc'], HUNT_MINUTES = 30, CYCLE = 5, SIMS = 1000;
  // The reward ladder (MATHS.md): each threshold is one more Forgehammer.
  var LADDER = [47e6, 90e6, 175e6, 330e6, 625e6, 1.2e9, 2.4e9, 4.8e9, 9.6e9, 19.2e9, 38.4e9];

  window.Interactions.register('bear-damage', function (context) {
    var api = context.api, L = window.LeadEngine, I = window.LeadInputs, A = window.LeadAccount, data = window.LeadData, store = null;
    if (!L || !I || !A || !data) return {};
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function t(key) { return api.tr('bh.damage.' + key, EN[key]); }
    function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function target(key) { return context.targets(key)[0]; }
    function put(key, text) { context.targets(key).forEach(function (node) { node.textContent = text; }); }
    function label(id) { return id === 'leaders' ? t('leaders') : api.tr('leads.input.' + id, I.LABELS[id]); }
    function counts(march) { return march ? [march.infantry, march.cavalry, march.archers] : [0, 0, 0]; }

    function marches() { return window.BH_MARCHES || null; }
    function hunt() { return window.BH_HUNT || (window.BH_HUNT_PLAN && window.BH_HUNT_PLAN.plan(15, 0)); }

    function inputsFor(acc) {
      var facts = I.gather(store, { usePets: acc.prefs.usePets !== false, rallyTyped: true, tierPicked: false });
      var result = I.assess('bear', facts, { townKnown: L.TOWN_TG });
      // The march sizes come from the builder on this page, so the rally capacity isn't an input here.
      result.items = result.items.filter(function (item) { return item.id !== 'rally'; });
      result.estimated = result.estimated.filter(function (id) { return id !== 'rally'; });
      return result;
    }

    function hit(acc, lineup, march) {
      var n = counts(march);
      if (!(n[0] + n[1] + n[2] > 1)) return 0;
      return L.hunt(acc.you, lineup, n, data, { hunts: SIMS, pointsPct: acc.valora }).mean;
    }

    function paintTiers(total) {
      var reached = -1;
      LADDER.forEach(function (at, i) { if (total >= at) reached = i; });
      document.querySelectorAll('.brackets li').forEach(function (li, i) {
        if (total !== null && i === reached) li.dataset.reached = ''; else delete li.dataset.reached;
      });
    }

    function run() {
      var acc = A.read(store, data, { job: 'bear', serverGen: window.KS_SERVER_AGE && window.KS_SERVER_AGE.getGeneration() });
      var inputs = inputsFor(acc), result = target('result');
      context.targets('inputs').forEach(function (list) { I.paint(list, inputs, { self: 'bear-hunt', label: label }); });
      var lineups = L.lineups(L.candidates(acc.owned, data));
      if (!lineups.length) {
        result.hidden = true;
        context.targets('estMark').forEach(function (node) { node.hidden = true; node.open = false; });
        delete context.root.dataset.provisional;
        put('status', t('noHeroes'));
        paintTiers(null);
        return;
      }
      put('status', '');
      var best = null;
      lineups.forEach(function (lineup) { var r = L.bear(acc.you, lineup, data); if (!best || r.score > best.score) { best = r; best.lineup = lineup; } });
      var m = marches(), plan = hunt(), cycles = HUNT_MINUTES / CYCLE;
      var queues = m ? m.queues : plan.joins;
      // One join in each of the other rallies every five minutes, as far as your joins reach.
      var joinHits = cycles * Math.min(plan.joiners, Math.round(queues * window.BH_HUNT_PLAN.TURNOVER * 100) / 100);
      var own = hit(acc, best.lineup, m && m.own), join = queues ? hit(acc, best.lineup, m && m.join) : 0;
      var ownHits = own ? cycles : 0, total = own * ownHits + join * joinHits;

      put('lead', api.fill(t('lead'), { heroes: best.lineup.filter(Boolean).map(function (copy) { return data.heroes[copy.key].name; }).join(', ') }));
      put('own', api.fill(t('perHit'), { dmg: api.compact(own), n: api.fmt(ownHits) }));
      put('join', api.fill(t('perHit'), { dmg: api.compact(join), n: api.fmt(Math.round(joinHits)) }));
      var value = target('total');
      value.textContent = api.compact(total);
      if (inputs.open.length) value.dataset.open = ''; else delete value.dataset.open;
      // Your stats stand in for the leaders of the rallies you join.
      var standIns = inputs.estimated.concat(join ? ['leaders'] : []);
      context.targets('estMark').forEach(function (node) { node.hidden = !standIns.length; if (node.hidden) node.open = false; });
      put('estNames', standIns.map(label).join(' · '));
      context.targets('unknowns').forEach(function (list) {
        list.replaceChildren.apply(list, inputs.open.map(function (id) { return el('li', '', label(id)); }));
        list.hidden = !inputs.open.length;
      });
      if (inputs.provisional) context.root.dataset.provisional = ''; else delete context.root.dataset.provisional;
      result.hidden = false;
      paintTiers(total);
    }

    var timer = null;
    function soon() { clearTimeout(timer); timer = setTimeout(run, 60); }
    if (store) context.cleanup(store.subscribe(soon));
    context.listen(document, 'ks:server-age-change', soon);
    context.listen(document, 'bh:marches', soon);
    context.listen(document, 'bh:hunt', soon);
    context.listen(document, 'i18n:change', soon);
    run();
    return { refresh: run };
  });
})();
