/* The Island page. One canvas draws the board (js/island-board.mjs); everything you read or
   press is markup in island/index.html, bound here with x-data="island". No toolbar: tapping
   open ground offers what fits there, tapping a piece opens its card, pressing and holding a
   piece lifts it, and a loaded brush places or paints. The plan itself lives in IslandModel;
   this file holds what is picked and open, which pieces are yours, and saves. */
import { Alpine } from '../alpine.mjs';
import IslandModel from '../island-model.mjs';
import { islandBoard, thumb, loadScript } from '../island-board.mjs';

const DATA = globalThis.ISLAND_DATA, N = DATA.size;
const PLAN_KEY = 'bh:island-plan:v1', RECENT_KEY = 'bh:island-recent:v1', TAUGHT_KEY = 'bh:island-taught:v1';
const CLEAR = '__clear', FOUNTAIN = 'build_7000'; // every island has exactly one Fountain
const KINDS = [['building', 'Buildings'], ['decor', 'Small buildings'], ['hedge', 'Hedges & lamps'], ['surface', 'Paths & water'], ['tree', 'Trees']].map(([kind, label]) => ({ kind, label }));
const BLANK = { pieces: [[27 * N + 27, FOUNTAIN, 0]], surfaces: [] };

function read(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
const fmt = n => new Intl.NumberFormat('en-GB').format(n);
const capText = d => !d.limit ? '' : d.limit === 1 ? 'One per island.' : 'Up to ' + fmt(d.limit) + ' per island.';
const ownKey = d => 'island-piece-' + d.id;
const byAuthored = (a, b) => (b.authored ? 1 : 0) - (a.authored ? 1 : 0);

Alpine.data('island', (artBase, examplesSrc) => {
  // The plan and the board stay outside Alpine's reactivity; `rev` is what bindings track.
  const model = IslandModel.create(DATA.pieces, N), def = model.def;
  let board = null, hintTimer = 0, guardTimer = 0, examples = null;
  const store = (() => { try { const s = globalThis.PlayerLedger.current(); s.snapshot(); return s; } catch (e) { return null; } })();
  const saved = read(PLAN_KEY, null);
  if (!saved || model.load(saved) === -1) model.load(BLANK);

  return {
    rev: 0, owns: {}, hasStore: !!store,
    owner: { mine: true }, full: true, deckOpen: false, jump: false, examples: [],
    brush: null, pending: null, lifted: null, cardId: null, ground: null,
    hint: '', hintShown: false, status: '', guarded: false,
    sheetOpen: false, kind: 'building', query: '', kinds: KINDS,
    recent: read(RECENT_KEY, ['garden_path', 'lush_elegy', 'tree_fir', 'build_7035']).filter(s => s === CLEAR || def(s)),

    init() {
      Alpine.effect(() => { Alpine.store('ledger').v; this.readOwns(); });
      board = islandBoard(this.$refs.board, this.$refs.canvas, this, model, artBase, { pop: this.$refs.pop, confirm: this.$refs.confirm, quick: this.$refs.quick, deck: this.$refs.deck, drop: this.$refs.drop });
      if (!read(TAUGHT_KEY, false)) this.say('Tap open ground to see what fits there', true);
      this.setFull(this.full);
      if (read(TAUGHT_KEY, false)) this.overLimits();
      const later = globalThis.requestIdleCallback || (fn => setTimeout(fn, 400));
      later(() => this.loadExamples());
    },
    destroy() { if (board) board.destroy(); },

    /* ---- yours ---- */
    readOwns() {
      const owns = {};
      if (store) try { const inv = store.snapshot().inventory; DATA.pieces.forEach(d => { const e = inv[ownKey(d)]; if (e && e.status === 'confirmed') owns[d.slug] = e.amount; }); } catch (e) { /* unreadable: nothing marked */ }
      this.owns = owns;
    },
    owned(slug) { return Object.prototype.hasOwnProperty.call(this.owns, slug) ? this.owns[slug] : null; },
    isYours(slug) { return this.owned(slug) > 0; },
    get anyOwned() { return Object.keys(this.owns).some(s => this.owns[s] > 0); },
    get ownedNote() {
      const n = Object.keys(this.owns).filter(s => this.owns[s] > 0).length;
      return store ? (n ? n + ' kind' + (n === 1 ? '' : 's') + ' of piece marked as yours.' : 'Nothing marked yet.') : 'Your save can’t be read in this browser.';
    },
    // A piece as the lists show it: its art (or a swatch) and the line under its name.
    piece(d, meta) {
      const own = this.owned(d.slug), yours = own > 0;
      return { slug: d.slug, name: d.name, img: d.icon ? artBase + d.id + '.webp' : null, swatch: 'background:' + d.swatch, own: yours || !this.anyOwned ? 'yes' : 'no', meta: meta != null ? meta : yours ? 'yours ×' + own : own === 0 ? 'not owned' : 'not marked' };
    },

    /* ---- the plan ---- */
    save() { if (this.owner.mine) write(PLAN_KEY, model.toJSON()); },
    touched() { this.rev++; },
    redraw() { this.$nextTick(() => board && board.invalidate()); },
    committed() { this.save(); this.rev++; this.redraw(); },
    remember(slug) { this.recent = [slug].concat(this.recent.filter(s => s !== slug)).slice(0, 5); write(RECENT_KEY, this.recent); },
    get canUndo() { this.rev; return model.canUndo; },
    undo() { if (model.undo()) { this.closeAll(); this.committed(); } },
    clearCell(r, c) { const hit = model.pieceAt(r, c); if (!hit || hit.slug !== FOUNTAIN) model.clear(r, c); },
    paintable(slug) { if (slug === CLEAR) return true; const d = def(slug); return d.w === 1 && d.h === 1; },
    overLimits() {
      const over = model.over(), names = Object.keys(over);
      if (names.length) this.say(names.length === 1 ? def(names[0]).name + ' is over its limit: ' + over[names[0]][0] + ' of ' + over[names[0]][1] : names.length + ' kinds of piece are over their limit on this plan', false);
    },

    /* ---- messages ---- */
    say(text, hold) {
      this.hint = text; this.hintShown = true; this.status = text;
      clearTimeout(hintTimer);
      if (!hold) hintTimer = setTimeout(() => { this.hintShown = false; }, 2600);
    },
    hush() { this.hintShown = false; },
    taught() { if (!read(TAUGHT_KEY, false)) { write(TAUGHT_KEY, true); this.hintShown = false; } },
    // A touch that opens a card must not also press what appears under the finger.
    guard() { this.guarded = true; clearTimeout(guardTimer); guardTimer = setTimeout(() => { this.guarded = false; }, 380); },

    /* ---- open ground: what fits here ---- */
    rankRecent(a, b) {
      const ra = this.recent.indexOf(a.slug), rb = this.recent.indexOf(b.slug);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || b.w * b.h - a.w * a.h || a.id - b.id;
    },
    get groundView() {
      const g = this.ground; this.rev;
      if (!g) return null;
      const fitting = DATA.pieces.filter(d => d.kind !== 'surface' && d.slug !== FOUNTAIN && model.room(d.slug) > 0 && model.anchorFor(d.w, d.h, g.r, g.c, -1)).sort((a, b) => this.rankRecent(a, b));
      const size = d => this.piece(d, d.w + '×' + d.h);
      const path = this.recent.filter(s => s !== CLEAR && model.isSurface(s))[0] || 'garden_path';
      return {
        yours: fitting.filter(d => this.isYours(d.slug)).map(size),
        others: fitting.filter(d => !this.isYours(d.slug)).slice(0, 24).map(size),
        othersLabel: this.anyOwned ? 'Not yours yet · plan anyway' : 'Fits here',
        empty: !fitting.length, path, pathLabel: def(path).name + ' from here'
      };
    },
    openGround(r, c) { this.closeAll(); this.ground = { r, c }; this.guard(); this.say('', false); this.hintShown = false; this.redraw(); },
    pick(slug) { const at = this.ground; this.closeAll(); this.stage(slug, at.r, at.c); },
    pathHere(slug) { const at = this.ground; this.loadBrush(slug); model.edit(() => { model.paint(this.brush, at.r, at.c); }); this.committed(); },

    /* ---- staging a piece ---- */
    stage(slug, r, c) {
      if (model.room(slug) <= 0) { this.noRoom(slug); return; }
      const d = def(slug), a = model.anchorFor(d.w, d.h, r, c, -1);
      this.pending = { slug, r: a ? a.r : r - Math.floor(d.h / 2), c: a ? a.c : c - Math.floor(d.w / 2), w: d.w, h: d.h, ok: !!a };
      this.say('Drag to nudge it, then ✓', true);
      this.redraw();
    },
    accept() {
      const p = this.pending; if (!p) return;
      if (!p.ok) { this.say('Something is in the way there.'); return; }
      const slug = p.slug, first = !read(TAUGHT_KEY, false);
      model.edit(() => { model.place(slug, p.r, p.c, p.w, p.h); });
      this.remember(slug); this.taught();
      this.pending = null; this.hintShown = false;
      // The first piece placed teaches the one gesture nothing on screen shows.
      this.say(def(slug).name + ' placed' + (first ? ' · press and hold it to move it' : ''), first);
      this.committed();
    },
    reject() { this.pending = null; this.hintShown = false; this.redraw(); },

    /* ---- a piece's card ---- */
    openCard(id) { this.closeAll(); this.cardId = id; this.guard(); this.redraw(); },
    closeCard() { this.cardId = null; this.redraw(); },
    get card() {
      this.rev;
      const p = this.cardId != null ? model.pieces.get(this.cardId) : null;
      if (!p) return null;
      const d = def(p.slug), placedN = model.counts()[p.slug] || 0, own = this.owned(p.slug), notes = [], fountain = p.slug === FOUNTAIN;
      if (fountain) notes.push({ text: 'Every island has one Fountain, in the middle.' });
      else if (d.effect) notes.push(placedN > d.effect ? { warn: true, text: placedN + ' on this plan, and only ' + (d.effect === 1 ? 'the first adds' : 'the first ' + d.effect + ' add') + ' its buff.' } : { text: 'The first ' + (d.effect === 1 ? 'copy adds' : d.effect + ' copies add') + ' its buff; more are decoration.' });
      if (!fountain && d.limit) notes.push(placedN > d.limit ? { warn: true, text: capText(d) + ' This plan has ' + fmt(placedN) + '.' } : { text: capText(d) });
      if (own !== null && placedN > own) notes.push({ warn: true, text: 'You own ' + own + '; this plan uses ' + placedN + '.' });
      if (!notes.length) notes.push({ text: 'Decoration.' });
      // Notes run on one line, a space between each.
      notes.forEach((n, i) => { n.gap = i ? ' ' : ''; });
      return {
        piece: this.piece(d), name: d.name, fountain, notes, own: own === null ? '?' : String(own), square: p.w === p.h, more: !fountain && model.room(p.slug) > 0,
        meta: d.w + '×' + d.h + (d.prosper ? ' · +' + fmt(d.prosper) + ' prosperity' : '') + ' · ' + (p.c + 45) + ', ' + (p.r + 45)
      };
    },
    turn() { const id = this.cardId; if (!model.edit(() => model.turn(id))) this.say('No room to turn it here'); this.committed(); },
    more() { const p = model.pieces.get(this.cardId); if (p) this.loadBrush(p.slug); },
    own(step) {
      const p = model.pieces.get(this.cardId); if (!p || !store) return;
      const d = def(p.slug), now = this.owned(p.slug);
      let next = Math.max(0, (now === null ? 0 : now) + step);
      if (now === null && step > 0) next = 1;
      try { store.setBalance(ownKey(d), next, 'manual'); } catch (e) { this.say('Your save could not be updated'); }
      this.readOwns();
    },
    removeSelected() {
      const p = model.pieces.get(this.cardId);
      if (!p || p.slug === FOUNTAIN) return;
      model.edit(() => { model.remove(p.id); });
      this.closeCard(); this.say(def(p.slug).name + ' removed · ↶ brings it back'); this.committed();
    },
    // A piece the island has no more room for: show the one already placed, or say so.
    noRoom(slug) {
      const d = def(slug), n = model.count(slug);
      if (d.limit === 1 && d.kind !== 'surface') {
        let have = null;
        model.pieces.forEach(p => { if (!have && p.slug === slug) have = p; });
        if (have) { board.look(have); this.openCard(have.id); this.say(d.name + ' is one per island, and yours is here'); return; }
      }
      this.say('The island holds ' + fmt(d.limit) + ' ' + d.name + (d.limit === 1 ? '' : 's') + ', and this plan has ' + fmt(n));
    },

    /* ---- the brush and the strip ---- */
    loadBrush(slug) {
      if (slug !== CLEAR && model.room(slug) <= 0 && !this.paintable(slug)) { this.closeAll(); this.noRoom(slug); return; }
      this.closeAll();
      this.brush = slug;
      if (slug !== CLEAR) this.remember(slug);
      this.taught();
      this.say(slug === CLEAR ? 'Drag over pieces and paths to clear them' : this.paintable(slug) ? 'Drag to paint · two fingers to look around' : 'Tap open ground to place');
      this.redraw();
    },
    unloadBrush() { this.brush = null; if (board) board.forget(); this.redraw(); },
    get recentPieces() { return this.recent.filter(s => s !== CLEAR).map(s => this.piece(def(s))); },
    get brushView() {
      this.rev;
      const b = this.brush; if (!b) return null;
      if (b === CLEAR) return { eraser: true, name: 'Eraser', line: [{ text: 'tap or drag over pieces and paths' }] };
      const d = def(b), n = model.count(b), line = [{ text: fmt(n) + (d.limit ? ' / ' + fmt(d.limit) : ''), warn: !!(d.limit && n >= d.limit) }];
      let rest = (d.gems ? ' · ' + fmt(n * d.gems) + ' gems' : '') + (d.kind === 'surface' ? ' · drag to paint' : this.paintable(b) ? ' placed · tap or drag' : ' placed · tap open sand');
      const own = this.owned(b);
      if (own !== null && n > own) { line.push({ text: rest + ' · ' }); line.push({ text: 'you own ' + own, warn: true }); }
      else line.push({ text: rest });
      return { eraser: false, name: d.name, piece: this.piece(d), line };
    },

    /* ---- the catalogue ---- */
    openSheet() { this.closeAll(); this.query = ''; this.sheetOpen = true; },
    closeSheet() { this.sheetOpen = false; },
    pickKind(kind) { this.kind = kind; this.query = ''; },
    get sheet() {
      this.rev;
      const q = this.query.trim().toLowerCase(), counts = model.counts();
      const list = DATA.pieces.filter(d => d.slug !== FOUNTAIN).filter(d => q ? d.name.toLowerCase().indexOf(q) >= 0 : d.kind === this.kind);
      const row = d => {
        const n = counts[d.slug] || 0, own = this.owned(d.slug), placed = n ? (d.limit ? n + '/' + d.limit : n) + ' placed' : (d.limit === 1 ? 'one only' : '');
        return this.piece(d, (own > 0 ? 'yours ×' + own : own === 0 ? 'not owned' : '') + (placed ? (own !== null ? ' · ' : '') + placed : ''));
      };
      const yours = list.filter(d => this.isYours(d.slug)), others = list.filter(d => !this.isYours(d.slug));
      return { yours: yours.map(row), others: others.map(row), othersLabel: yours.length || this.anyOwned ? 'Not yours yet' : 'Every piece', empty: !list.length };
    },

    closeAll() { this.ground = null; if (this.cardId != null) this.closeCard(); this.closeSheet(); this.redraw(); },

    /* ---- what a tap, a press and a drop mean (the board reads the gestures) ---- */
    tap(r, c) {
      if (this.deckOpen) { this.closeDeck(); return; }
      if (this.ground || (this.cardId != null && !model.pieceAt(r, c))) { this.closeAll(); return; }
      const pending = this.pending;
      if (pending) {
        if (model.inside(r, c)) { const d = def(pending.slug), a = model.anchorFor(d.w, d.h, r, c, -1); pending.r = a ? a.r : r - Math.floor(d.h / 2); pending.c = a ? a.c : c - Math.floor(d.w / 2); pending.ok = !!a; this.redraw(); }
        return;
      }
      const brush = this.brush;
      if (brush) {
        if (brush !== CLEAR && model.room(brush) <= 0) { this.noRoom(brush); return; }
        if (this.paintable(brush)) {
          const gone = brush === CLEAR && model.pieceAt(r, c);
          model.edit(() => { if (brush === CLEAR) this.clearCell(r, c); else model.paint(brush, r, c); });
          if (gone && gone.slug !== FOUNTAIN) this.say(def(gone.slug).name + ' removed');
        } else {
          const b = def(brush), at = model.anchorFor(b.w, b.h, r, c, -1);
          if (!at) { this.say('No room for ' + b.name + ' here'); return; }
          model.edit(() => { model.place(brush, at.r, at.c); });
        }
        this.committed(); return;
      }
      const hit = model.pieceAt(r, c);
      if (hit) this.openCard(hit.id);
      else if (model.inside(r, c)) this.openGround(r, c);
      else this.closeAll();
    },
    liftAt(id) {
      const p = model.pieces.get(id);
      if (!p) return;
      this.closeAll();
      this.lifted = { id, r: p.r, c: p.c, ok: true, overDrop: false };
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not allowed */ } }
      this.say('Drop it to move it, or on the bar to remove it', true);
      this.redraw();
    },
    dropLifted() {
      const l = this.lifted, p = model.pieces.get(l.id);
      this.lifted = null; this.hintShown = false;
      if (l.overDrop) { model.edit(() => { model.remove(l.id); }); this.say(def(p.slug).name + ' removed · ↶ brings it back'); }
      else if (l.ok && (l.r !== p.r || l.c !== p.c)) { model.edit(() => { model.move(l.id, l.r, l.c); }); this.say(def(p.slug).name + ' moved'); }
      else if (!l.ok) this.say('No room there; it stayed where it was');
      this.committed();
    },

    /* ---- presets ---- */
    loadExamples() {
      if (examples) return Promise.resolve();
      return loadScript(examplesSrc).then(() => { examples = globalThis.ISLAND_EXAMPLES || []; this.examples = examples.slice().sort(byAuthored); });
    },
    // Draws a preset's (or your saved plan's) picture onto a canvas in the list.
    thumb(canvas, slug) { thumb(canvas, slug ? examples.find(e => e.slug === slug) : read(PLAN_KEY, BLANK), def); },
    get deckList() { return [{ slug: '', name: 'Your plan', tag: 'Yours' }].concat(this.examples.map(ex => ({ slug: ex.slug, name: ex.name, tag: ex.authored ? 'Ours' : 'Game layout' }))); },
    current(slug) { return slug === (this.owner.mine ? '' : this.owner.slug); },
    // The carousel keeps the plan on the board in view: at once when it opens, gently after.
    reveal(card) { const smooth = !this.jump && !matchMedia('(prefers-reduced-motion: reduce)').matches; this.jump = false; if (card.scrollIntoView) card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: smooth ? 'smooth' : 'auto' }); },
    openPreset(slug) {
      const ex = examples.find(e => e.slug === slug);
      if (!ex) return;
      if (this.owner.mine) this.save();
      this.closeAll(); this.unloadBrush(); this.reject();
      this.owner = { mine: false, name: ex.name, slug: ex.slug };
      model.load({ pieces: ex.pieces.map(e => [e[0], e[1], 0]), surfaces: ex.surfaces });
      this.committed();
      this.setFull(true, true);
      this.overLimits();
    },
    backToMine() {
      this.owner = { mine: true };
      model.load(read(PLAN_KEY, BLANK));
      this.closeAll(); this.committed(); this.$nextTick(() => board.fit(false));
    },
    preset(slug) { this.loadExamples().then(() => { this.openPreset(slug); this.openDeck(); }); },
    pickPreset(slug) { if (slug) this.openPreset(slug); else if (!this.owner.mine) this.backToMine(); },
    keep() {
      if (!window.confirm('Replace your saved plan with this copy?')) return;
      this.owner = { mine: true }; this.save(); this.say('Kept as your plan');
      if (this.deckOpen) this.closeDeck();
    },

    /* ---- the preset carousel inside the board ----
       Your own plan first, then every preset. A tap swaps the board to it straight away (a copy,
       until kept), so flicking through is a swipe and a tap, never a trip down the page. */
    openDeck() {
      this.loadExamples().then(() => {
        this.closeAll(); this.unloadBrush(); this.reject();
        this.jump = true; this.deckOpen = true; this.guard();
        this.$nextTick(() => board.fit(true));
      });
    },
    closeDeck() { this.deckOpen = false; },
    fitWhole() { board.fit(true); },
    browse() { if (this.deckOpen) this.closeDeck(); else this.openDeck(); },

    /* ---- full screen: the default. The board covers the page, so the carousel can't open. ---- */
    setFull(on, fit) {
      this.full = on;
      if (!on) window.scrollTo(0, 0);
      this.$nextTick(() => { board.resize(); if (fit) board.fit(true); });
    },
    // The page carousel also answers ← and →; in full screen those keys stay with the board.
    holdArrows(e) {
      if (!this.full || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
      e.preventDefault();
    }
  };
});
