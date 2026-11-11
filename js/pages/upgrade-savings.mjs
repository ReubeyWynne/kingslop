/* The upgrade priority page's savings: each balance's daily income from the ledger's inventory
   history, and the player's goals projected to the next KvK prep or Strongest Governor
   (UpgradeSavings over UpgradeGoals). The event choice is a view, never saved; the soonest
   one is shown first. A balance without enough readings shows no rate.
   upgrade-priority/index.html binds to it with x-data="upgradeSavings" on #savings. */
import { Alpine } from '../alpine.mjs';
import UpgradeSavings from '../upgrade-savings.mjs';
import UpgradeGoals from '../upgrade-goals.mjs';
import { text } from './upgrade-goals.mjs';

/* The section as plain text, from the shared ledger (null when it cannot be read) and the
   chosen event. */
function present(store, chosen) {
  const api = globalThis.BH, words = text(api), t = words.t, tpl = words.tpl;
  const locale = () => document.documentElement.lang || undefined;
  const date = at => new Date(at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  // Small rates keep one decimal: half a shard a day is not nothing.
  const perDay = n => n >= 10 ? api.fmt(n) : n.toLocaleString(locale(), { maximumFractionDigits: 1 });
  const days = n => api.fill(api.trCount('priority.savings.in', n, ['today', 'in 1 day', 'in {n} days']), { n: api.fmt(n) });
  // A balance by its inventory id: the goals' item names, then hero shards and master emblems, then the event planner's label.
  function itemName(id) {
    const own = api.tr('priority.item.' + id, null);
    if (own) return own;
    const hero = /^hero-shards-(.+)$/.exec(id), master = /^master-emblems-(.+)$/.exec(id);
    if (hero) { const h = globalThis.HeroSpend.HEROES.find(x => x.key === hero[1]); return tpl('item.shards', { hero: h ? h.name : hero[1] }); }
    if (master) { const m = globalThis.MasterSpend.find(master[1]); return tpl('savings.emblems', { master: m ? m.name : master[1] }); }
    const listed = globalThis.EventRules.data.items.find(x => x.id === id);
    return listed ? listed.label : id;
  }
  const lineName = line => line.pool ? itemName(line.id) + ' + ' + itemName(line.pool) : itemName(line.id);
  function lineText(p, l, event) {
    if (l.perDay === null) return tpl('savings.lineNoRate', { item: lineName(l), short: api.fmt(l.short) });
    if (p.state === 'reached') return tpl('savings.lineReached', { item: lineName(l), short: api.fmt(l.short), rate: perDay(l.perDay), when: days(l.days) });
    return tpl(l.left ? 'savings.lineShort' : 'savings.lineCovered', { item: lineName(l), short: api.fmt(l.short), gain: api.fmt(l.gain), left: api.fmt(l.left), event });
  }
  const now = Date.now(), upcoming = UpgradeSavings.next(now), pick = upcoming.find(x => x.event === chosen) || upcoming[0];
  const event = t('savings.event.' + pick.event);
  const history = store ? store.history() : [], rates = UpgradeSavings.rates(history);
  const shown = Object.keys(rates).map(id => rates[id]).filter(r => r.enough && !/^troop-/.test(r.id))
    .sort((a, b) => itemName(a.id).localeCompare(itemName(b.id), locale()));
  const projected = store ? UpgradeSavings.all(UpgradeGoals.all(store.snapshot()), history, pick.at, now).filter(p => p.state !== 'skip') : [];
  return {
    pick: pick.event,
    when: Object.fromEntries(upcoming.map(x => [x.event, date(x.at) + ' · ' + days(x.days)])),
    status: tpl('savings.status', { event, date: date(pick.at), when: days(pick.days) }),
    rates: shown.map(r => ({ id: r.id, text: tpl('savings.rate', { item: itemName(r.id), rate: perDay(r.perDay), days: api.fmt(r.days) }) + (r.spent ? ' ' + tpl('savings.spent', { n: api.fmt(r.spent) }) : '') })),
    goals: projected.map((p, at) => ({
      key: at, state: p.state, title: words.title(p.goal),
      said: tpl('savings.state.' + p.state, { event, date: p.on === null ? '' : date(p.on) }),
      lines: p.lines.map((l, n) => ({ key: n, state: l.perDay === null ? 'unknown' : l.left ? 'short' : 'covered', text: lineText(p, l, event) }))
    }))
  };
}

Alpine.data('upgradeSavings', () => ({
  view: null, chosen: null,
  init() {
    Alpine.effect(() => {
      Alpine.store('i18n').v; const ready = Alpine.store('ledger').ready;
      this.view = present(ready ? globalThis.PlayerLedger.shared() : null, this.chosen);
    });
  },
  pressed(event) { return String(event === this.view.pick); }
}));
