/* The Heroes page's KvK points controller: what each owned hero's shards and widgets score
   when spent. The plan and every rate come from HeroSpend and the event rules, the same
   numbers the Town Centre totals use. heroes/index.html binds to it with x-data="heroPoints".
   Its words and the names of missing facts are js/hero-points.js, which Town Centre shares. */
import { Alpine } from '../alpine.mjs';
import HeroSpend from '../hero-spend.mjs';
import EventRules from '../event-rules.mjs';

const EMPTY = { rows: [], total: '—', open: null, unknowns: [], events: [], left: '', empty: '' };

/* The panel as plain text, from a ledger snapshot: one row per owned hero, best first. */
function present(snapshot) {
  if (!snapshot) return EMPTY;
  const api = globalThis.BH, P = globalThis.HeroPoints, t = key => P.t(api, key), fill = (key, values) => P.fill(api, key, values);
  const plan = HeroSpend.plan(snapshot);
  const scored = Object.entries(plan.heroes).map(([key, hero]) => ({ key, hero, points: HeroSpend.points(EventRules, 'prep', hero) }))
    .sort((a, b) => b.points.total - a.points.total || a.hero.name.localeCompare(b.hero.name));
  const rows = scored.map(({ key, hero, points }) => ({
    key,
    name: hero.name,
    points: api.fmt(points.total),
    stars: !hero.shards ? t('unknownCount') : hero.shards.from === 30 ? t('maxed') : fill('stars', { from: P.stars(api, hero.shards.from), to: P.stars(api, hero.shards.to) }),
    shards: hero.shards
      ? { b: api.fmt(hero.shards.spend), small: [fill('pieces', { own: api.fmt(hero.shards.ownUsed), general: api.fmt(hero.shards.general) })] }
      : { plain: t('unknownCount'), small: [] },
    widget: hero.widget
      ? { b: api.fmt(hero.widget.spend), small: [fill('widgetLevel', { from: api.fmt(hero.widget.from), to: api.fmt(hero.widget.to) }), fill('widgetPieces', { own: api.fmt(hero.widget.ownUsed), general: api.fmt(hero.widget.general) })] }
      : { plain: t('none'), small: [] }
  }));
  const total = scored.reduce((sum, row) => sum + row.points.total, 0);
  // A total still waiting on counts stays open, and the counts it waits on follow as ? marks.
  const unknowns = plan.unknown.slice(0, 3).map(id => P.names(api, [id]));
  if (plan.unknown.length > 3) unknowns.push(fill('more', { n: api.fmt(plan.unknown.length - 3) }));
  // The same three-event table as every calculator: shards and widgets each on their best days.
  const shards = {};
  let widgets = 0;
  scored.forEach(({ hero }) => { if (hero.shards && hero.shards.spend) shards[hero.item] = (shards[hero.item] || 0) + hero.shards.spend; if (hero.widget) widgets += hero.widget.spend; });
  const events = [];
  if (Object.keys(shards).length) events.push({ label: t('eventShards'), cells: globalThis.EventPoints.forItems(shards) });
  if (widgets) events.push({ label: t('eventWidgets'), cells: globalThis.EventPoints.forItems({ 'hero-widget': widgets }) });
  const left = id => { const value = plan.items[id].left; return value === null ? t('unknownCount') : api.fmt(value); };
  return {
    rows, events, unknowns,
    total: fill('total', { n: api.fmt(total) }),
    open: plan.unknown.length ? '' : null,
    empty: rows.length ? '' : t('empty'),
    left: rows.length ? fill('leftShards', { mythic: left('mythic-hero-shard'), epic: left('epic-hero-shard'), rare: left('rare-hero-shard') }) + ' ' + fill('leftWidgets', { n: left('hero-widget') }) + (plan.items['mythic-hero-shard'].kept !== 0 ? ' ' + t('keptMythic') : '') : ''
  };
}

/* Under each figure, the event's days as a strip with the ❧ on the day it scores, in place of
   the table's "day 3". The table itself is event-points.js's, shared by every calculator. */
function dayStrips(wrap, events) {
  const EVENTS = globalThis.EventPoints.EVENTS;
  wrap.querySelectorAll('tbody tr').forEach((tr, row) => {
    tr.querySelectorAll('td').forEach((td, column) => {
      const cell = events[row].cells[EVENTS[column]], label = td.querySelector('small');
      if (!cell || !label) return;
      const best = cell.days || [cell.day], strip = document.createElement('ol');
      strip.className = 'days';
      strip.setAttribute('aria-label', label.textContent);
      EventRules.days(EVENTS[column]).forEach(day => {
        const li = document.createElement('li');
        li.textContent = String(day.day);
        if (best.includes(day.day)) li.dataset.best = '';
        strip.appendChild(li);
      });
      label.replaceWith(strip);
    });
  });
  return wrap;
}

Alpine.data('heroPoints', () => ({
  view: EMPTY,
  // Worked out once per save or language switch, not on every binding that reads it.
  init() { Alpine.effect(() => { Alpine.store('i18n').v; this.view = present(Alpine.store('ledger').snapshot); }); },
  // The shared event table is built by event-points.js, so it is placed rather than bound.
  placeEvents(el) {
    const events = this.view.events;
    el.replaceChildren(...(events.length ? [dayStrips(globalThis.EventPoints.table(globalThis.BH, events, 'hero-event-points'), events)] : []));
  }
}));
