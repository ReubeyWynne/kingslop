/* The Masters page's KvK points controller: what each unlocked master's emblems and
   manuscripts score when spent. The plan and every rate come from MasterSpend and the event
   rules, the same numbers the Town Centre totals use. masters/index.html binds to it with
   x-data="masterPoints". Its words and the names of missing facts are js/master-points.js,
   which Town Centre shares. */
import Alpine from '../alpine.mjs';
import MasterSpend from '../master-spend.mjs';
import EventRules from '../event-rules.mjs';

const EMPTY = { rows: [], total: '—', coverage: '', events: [], left: '', empty: '' };
const order = id => MasterSpend.MASTERS.findIndex(m => m.id === id);

/* The panel as plain text, from a ledger snapshot: one row per unlocked master, best first. */
function present(snapshot) {
  if (!snapshot) return EMPTY;
  const api = globalThis.BH, P = globalThis.MasterPoints, t = key => P.t(api, key), fill = (key, values) => P.fill(api, key, values);
  const plan = MasterSpend.plan(snapshot);
  const scored = Object.values(plan.masters).map(entry => ({ entry, points: MasterSpend.points(EventRules, 'prep', entry) }))
    .sort((a, b) => b.points.total - a.points.total || order(a.entry.id) - order(b.entry.id));
  const rows = scored.map(({ entry, points }) => {
    const e = entry.emblems, m = entry.manuscripts;
    const steps = m ? m.to.reduce((sum, level, at) => sum + level - m.from[at], 0) : 0;
    return {
      key: entry.id,
      name: entry.name,
      points: api.fmt(points.total),
      emblems: e && e.spend
        ? { b: api.fmt(e.spend), small: [fill('classStep', { name: e.className }), fill('emblemPieces', { own: api.fmt(e.ownUsed), general: api.fmt(e.general) })] }
        : { plain: t('none'), small: [] },
      manuscripts: m
        ? { b: api.fmt(m.spend), small: [fill('skillSteps', { n: api.fmt(steps) })].concat(m.learningXp ? [fill('learning', { n: api.fmt(m.learningXp) })] : []) }
        : { plain: t('unknownCount'), small: [] }
    };
  });
  const total = scored.reduce((sum, row) => sum + row.points.total, 0);
  // The same three-event table as every calculator: emblems and manuscripts each on their best days.
  let emblems = 0, books = 0;
  scored.forEach(({ entry }) => { if (entry.emblems) emblems += entry.emblems.spend || 0; if (entry.manuscripts) books += entry.manuscripts.spend || 0; });
  const events = [];
  if (emblems) events.push({ label: t('eventEmblems'), cells: globalThis.EventPoints.forItems({ 'master-emblem': emblems }) });
  if (books) events.push({ label: t('eventManuscripts'), cells: globalThis.EventPoints.forItems({ 'masters-manuscript': books }) });
  const left = value => value === null ? t('unknownCount') : api.fmt(value);
  return {
    rows, events,
    total: fill('total', { n: api.fmt(total) }),
    coverage: plan.unknown.length ? fill('partial', { names: P.names(api, plan.unknown) }) : t('complete'),
    empty: rows.length ? '' : t('empty'),
    left: rows.length ? fill('left', { general: left(plan.items[MasterSpend.EMBLEM].left), manuscripts: left(plan.items[MasterSpend.MANUSCRIPT].left) }) : ''
  };
}

Alpine.data('masterPoints', () => ({
  view: EMPTY,
  // Worked out once per save or language switch, not on every binding that reads it.
  init() { Alpine.effect(() => { Alpine.store('i18n').v; this.view = present(Alpine.store('ledger').snapshot); }); },
  // The shared event table is built by event-points.js, so it is placed rather than bound.
  placeEvents(el) {
    const events = this.view.events;
    el.replaceChildren(...(events.length ? [globalThis.EventPoints.table(globalThis.BH, events, 'hero-event-points')] : []));
  }
}));
