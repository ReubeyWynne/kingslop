/* The upgrade priority page's savings: each balance's daily income from the ledger's inventory
   history, and the player's goals projected to the next KvK prep or Strongest Governor
   (UpgradeSavings over UpgradeGoals). The event choice is a view, never saved; the soonest
   one is shown first. A balance without enough readings shows no rate. */
(function () {
  'use strict';
  window.Interactions.register('upgrade-savings', function (context) {
    var api = context.api, engine = window.UpgradeSavings, words = window.UpgradeGoalsText(api), store = null, chosen = null;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function t(key, fallback) { return api.tr('priority.' + key, fallback || key); }
    function tpl(key, vars) { return api.fill(t(key), vars); }
    function one(key) { return context.targets(key)[0]; }
    function locale() { return document.documentElement.lang || undefined; }
    function eventName(event) { return t('savings.event.' + event); }
    function date(at) { return new Date(at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    // Small rates keep one decimal: half a shard a day is not nothing.
    function perDay(n) { return n >= 10 ? api.fmt(n) : n.toLocaleString(locale(), { maximumFractionDigits: 1 }); }
    function days(n) { return api.fill(api.trCount('priority.savings.in', n, ['today', 'in 1 day', 'in {n} days']), { n: api.fmt(n) }); }
    // A balance by its inventory id: the goals' item names, then hero shards and master emblems, then the event planner's label.
    function itemName(id) {
      var own = api.tr('priority.item.' + id, null);
      if (own) return own;
      var hero = /^hero-shards-(.+)$/.exec(id), master = /^master-emblems-(.+)$/.exec(id);
      if (hero) { var h = window.HeroSpend.HEROES.find(function (x) { return x.key === hero[1]; }); return tpl('item.shards', { hero: h ? h.name : hero[1] }); }
      if (master) { var m = window.MasterSpend.find(master[1]); return tpl('savings.emblems', { master: m ? m.name : master[1] }); }
      var listed = window.EventRules.data.items.find(function (x) { return x.id === id; });
      return listed ? listed.label : id;
    }
    function lineName(line) { return line.pool ? itemName(line.id) + ' + ' + itemName(line.pool) : itemName(line.id); }
    function lineText(p, l, event) {
      if (l.perDay === null) return tpl('savings.lineNoRate', { item: lineName(l), short: api.fmt(l.short) });
      if (p.state === 'reached') return tpl('savings.lineReached', { item: lineName(l), short: api.fmt(l.short), rate: perDay(l.perDay), when: days(l.days) });
      return tpl(l.left ? 'savings.lineShort' : 'savings.lineCovered', { item: lineName(l), short: api.fmt(l.short), gain: api.fmt(l.gain), left: api.fmt(l.left), event: event });
    }
    function goalNode(p, event) {
      var node = one('goal').content.firstElementChild.cloneNode(true), lines = node.querySelector('[data-part="lines"]');
      node.dataset.state = p.state;
      node.querySelector('[data-part="title"]').textContent = words.title(p.goal);
      node.querySelector('[data-part="state"]').textContent = tpl('savings.state.' + p.state, { event: event, date: p.on === null ? '' : date(p.on) });
      p.lines.forEach(function (l) {
        var li = document.createElement('li');
        li.dataset.state = l.perDay === null ? 'unknown' : l.left ? 'short' : 'covered';
        li.textContent = lineText(p, l, event);
        lines.appendChild(li);
      });
      if (!p.lines.length) lines.remove();
      return node;
    }
    function rateNode(r) {
      var li = document.createElement('li');
      li.dataset.item = r.id;
      li.textContent = tpl('savings.rate', { item: itemName(r.id), rate: perDay(r.perDay), days: api.fmt(r.days) }) + (r.spent ? ' ' + tpl('savings.spent', { n: api.fmt(r.spent) }) : '');
      return li;
    }
    function render() {
      var now = Date.now(), upcoming = engine.next(now), pick = upcoming.find(function (x) { return x.event === chosen; }) || upcoming[0];
      context.nodes('[data-action="upgrade-savings.event"]').forEach(function (button) {
        var found = upcoming.find(function (x) { return x.event === button.dataset.event; });
        button.disabled = false;
        button.setAttribute('aria-pressed', String(found === pick));
        button.querySelector('small').textContent = date(found.at) + ' · ' + days(found.days);
      });
      var event = eventName(pick.event);
      one('status').textContent = tpl('savings.status', { event: event, date: date(pick.at), when: days(pick.days) });
      var history = store ? store.history() : [], rates = engine.rates(history);
      var shown = Object.keys(rates).map(function (id) { return rates[id]; }).filter(function (r) { return r.enough && !/^troop-/.test(r.id); })
        .sort(function (a, b) { return itemName(a.id).localeCompare(itemName(b.id), locale()); });
      var list = one('rates');
      list.textContent = '';
      shown.forEach(function (r) { list.appendChild(rateNode(r)); });
      one('learning').hidden = Boolean(shown.length);
      var goals = one('goals'), projected = store ? engine.all(window.UpgradeGoals.all(store.snapshot()), history, pick.at, now).filter(function (p) { return p.state !== 'skip'; }) : [];
      goals.textContent = '';
      projected.forEach(function (p) { goals.appendChild(goalNode(p, event)); });
      one('none').hidden = Boolean(projected.length);
    }
    if (store) context.cleanup(store.subscribe(render));
    return { refresh: render, actions: {
      event: { run: function (node) { chosen = node.dataset.event; render(); } }
    } };
  });
})();
