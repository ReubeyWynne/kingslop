/* The Event Cycle page (events/): the live 28-day clock, today's card and the KingShot copy
   for the day, from js/event-cycle.mjs. events/index.html binds to it with x-data="kvk" on
   the today section, the clock and the prep chart, and x-data="reference('<phase>')" on each
   reference section. */
import { Alpine, words, shared } from '../alpine.mjs';
import { useWords, todayDay, weekOf, prepDayOf, daySummary, present, splitParts, LIMIT, CYCLE_LEN, DOWS, JUMPS } from '../event-cycle.mjs';

useWords(words);
const BH = () => globalThis.BH;
const t = (key, fallback, values) => words.t(key, fallback, values);
const fmt = n => words.fmt(n);

/* The page's one state, read by the today section, the clock and the prep chart. */
let started = false;
const cycle = shared('kvk', {
  ...words,
  day: todayDay(),
  following: true,
  // The copy box: the site link (kept across days), the message part shown, the preview fold
  // and the copy status. A new day or language starts the box afresh.
  link: false, part: 0, preview: false, status: '', copying: false,
  // The page's own address, which the copy may end with (set from the markup).
  site: '',
  days: Array.from({ length: CYCLE_LEN }, (_, i) => i + 1),
  jumps: JUMPS,
  card: null,
  // Worked out once per day, save or language switch, not on every binding that reads it.
  init() {
    if (started) return;
    started = true;
    Alpine.effect(() => { Alpine.store('i18n').v; this.card = present(this.day, this.following, Alpine.store('ledger').snapshot); });
    // A new language or save redraws the card, so the copy box starts afresh too.
    Alpine.effect(() => { Alpine.store('i18n').v; Alpine.store('ledger').v; this.fresh(); });
  },
  fresh() { this.part = 0; this.preview = false; this.status = ''; },
  go(n) { this.following = false; this.day = ((n - 1 + CYCLE_LEN) % CYCLE_LEN) + 1; this.fresh(); },
  today() { this.following = true; this.day = todayDay(); this.fresh(); },
  // The display follows the UTC date: if the day rolls over while the page is open (or the tab
  // sat backgrounded overnight), it catches up on focus or visibility.
  catchUp() { const now = todayDay(); if (this.following && now !== this.day) { this.day = now; this.fresh(); } },
  get week() { return weekOf(this.day); },
  get prepDay() { return this.week === 'prep' ? prepDayOf(this.day) : 0; },
  get heading() { return this.following ? t('ks.today.title', 'Today') : t('ks.today.selected', 'Selected day'); },
  get date() {
    Alpine.store('i18n').v;
    const now = new Date(), date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + this.day - todayDay()));
    return date.toLocaleDateString((globalThis.I18N && I18N.locale) || 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' · UTC';
  },
  get weekday() { Alpine.store('i18n').v; const dows = BH().tr('ks.today.dows', DOWS), i = (this.day - 1) % 7; return (Array.isArray(dows) ? dows[i] : '') || DOWS[i]; },
  get position() { return t('ks.today.dayOut', 'day {n} of 28', { n: fmt(this.day) }); },
  get next() { return t('ks.today.nextUp', 'Next day') + ' · ' + daySummary(this.day % CYCLE_LEN + 1); },
  range(jump) { return t('ks.today.cycleRange', 'Days {from}–{to}', { from: fmt(jump.first), to: fmt(jump.end) }); },
  jumped(jump) { return jump.first === 22 ? this.day >= 22 : weekOf(jump.first) === this.week; },
  // The clock's cells: the selected day, and today when another day is selected.
  cell(d) { return { cell: true, [weekOf(d)]: true, now: d === this.day, mark: d === todayDay() && d !== this.day }; },
  cellLabel(d) {
    const w = weekOf(d), now = todayDay();
    return t('ks.today.dayOut', 'day {n} of 28', { n: fmt(d) }) + ' · ' + (w === 'gap' ? t('ks.today.between', 'Between weeks') : t('ks.week.' + w, 'KvK')) + (d === now ? ' · ' + t('ks.today.title', 'Today') : '');
  },
  isToday(d) { return d === todayDay() ? 'date' : null; },
  get parts() { return splitParts(this.card.copy + (this.link && this.site ? '\n' + this.site : '')); },
  // The part buttons, shown only when the message runs over one part.
  get partList() { return this.parts.length > 1 ? this.parts : []; },
  get copyNote() { return t('ks.today.copyNote', 'Shaped for KingShot chat: item icons ride in as &lt;item_icon_N&gt; tags, every line stays inside 28 display cells, and a block stays under 512 characters. If a block runs over one message, it comes split into parts; paste them in order.'); },
  get message() { return this.parts[this.part] || ''; },
  get chars() {
    const len = this.message.length;
    return t('ks.today.chars', '<b>{n}</b> / 512 characters', { n: fmt(len) }) +
      (len <= LIMIT ? ' — ' + t('ks.today.fits', 'fits one message') : ' — <span class="over">' + t('ks.today.over', 'split into {n} messages', { n: this.parts.length }) + '</span>');
  },
  partLabel(i) { return t('ks.today.part', 'part {n}', { n: i + 1 }); },
  get copyLabel() { return '📋 ' + (this.parts.length > 1 ? this.partLabel(this.part) + ' · ' : '') + t('ks.today.copyRun', 'Copy for KingShot'); },
  setLink(on) { this.link = on; this.part = 0; this.status = ''; },
  pick(i) { this.part = i; this.status = ''; },
  // Copies the message, or opens the preview with the message selected for the reader to copy
  // (the one place this controller touches the page: the preview's text box, from the markup).
  async copy(box) {
    let copied = false;
    this.copying = true;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(this.message); copied = true; }
    } catch (e) { copied = false; }
    if (!copied) {
      this.preview = true;
      await Alpine.nextTick();
      box.focus(); box.select();
      try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
    }
    this.copying = false;
    this.status = copied ? t('ks.today.copied', 'copied. paste it straight into KingShot.') : t('ks.today.copyFailed', 'Select and copy the message below.');
  }
});

/* A reference section: folded at first, its body shown on demand, and marked as the current
   phase while the selected day falls in it. */
Alpine.data('reference', phase => ({
  open: false,
  get mark() { return this.open ? '−' : '+'; },
  get current() { return !!phase && cycle.week === phase; }
}));

