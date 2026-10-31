/* The Island — UI sketch. One canvas for the board, plain HTML for everything
   else. Grid state is integer rows/columns; the renderer only reads it. */
(() => {
  'use strict';
  const N = 60, TW = 32, TH = 16, CHAT_CAP = 512, CHAT_PREFIX = 'dey.ci/island#';
  const D = window.ISLAND, P = D.pieces;
  const $ = (sel, root = document) => root.querySelector(sel);
  const t = name => $(`[data-target="island.${name}"]`);
  const fmt = n => n.toLocaleString('en-GB');

  /* ─── Catalogue ─────────────────────────────────────── */
  const SURFACE = new Set(['path', 'water']);
  const kind = s => {
    const p = P[s];
    if (SURFACE.has(p.cat)) return 'paths';
    if (p.cat === 'tree') return 'trees';
    if (p.cat === 'hedge' || p.cat === 'fence' || p.cat === 'accent') return 'hedges';
    return p.w * p.h >= 4 ? 'buildings' : 'decor';
  };
  const CATS = [['buildings', 'Buildings'], ['decor', 'Décor'], ['hedges', 'Hedges'], ['paths', 'Paths & water'], ['trees', 'Trees']];
  const SHELF = Object.keys(P).filter(s => (P[s].art || SURFACE.has(P[s].cat)) && !/^(Building #|Build )/.test(P[s].name))
    .sort((a, b) => P[a].id - P[b].id);
  const isSurface = s => SURFACE.has(P[s].cat);
  const paintable = s => isSurface(s) || (P[s].w === 1 && P[s].h === 1);

  const imgs = {};
  const icon = s => {
    const id = P[s].id;
    if (!(id in imgs)) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { imgs[id] = im; invalidate(); };
      im.onerror = () => { imgs[id] = null; };
      imgs[id] = undefined;
      im.src = `../research/islands/assets/icons/${id}.webp`;
    }
    return imgs[id];
  };
  const iconUrl = s => `../research/islands/assets/icons/${P[s].id}.webp`;

  /* ─── State ─────────────────────────────────────────── */
  let pieces = new Map();   // id -> {id, slug, r, c, w, h}
  let surfaces = new Map(); // cell index -> slug
  let occ = new Int32Array(N * N).fill(-1);
  let nextId = 1;
  let owner = 'mine';        // 'mine' | 'example'
  const undo = [], redo = [];

  const snapshot = () => ({ pieces: [...pieces.values()].map(p => ({ ...p })), surfaces: [...surfaces] });
  const restore = s => {
    pieces = new Map(s.pieces.map(p => [p.id, { ...p }]));
    surfaces = new Map(s.surfaces);
    reindex();
  };
  const commit = () => { undo.push(snapshot()); if (undo.length > 100) undo.shift(); redo.length = 0; };
  function reindex() {
    occ.fill(-1);
    for (const p of pieces.values())
      for (let r = p.r; r < p.r + p.h; r++) for (let c = p.c; c < p.c + p.w; c++) occ[r * N + c] = p.id;
    changed();
  }
  const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  function fits(slug, r, c, w = P[slug].w, h = P[slug].h, ignore = -1) {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
      if (!inside(y, x)) return false;
      const o = occ[y * N + x];
      if (o !== -1 && o !== ignore) return false;
    }
    return true;
  }
  function addPiece(slug, r, c, w = P[slug].w, h = P[slug].h) {
    const p = { id: nextId++, slug, r, c, w, h };
    pieces.set(p.id, p);
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) occ[y * N + x] = p.id;
    return p;
  }
  function load(layout) {
    pieces = new Map(); surfaces = new Map(); occ.fill(-1);
    for (const [idx, s] of Object.entries(layout.surfaces)) surfaces.set(+idx, s);
    for (const [idx, s] of Object.entries(layout.pieces)) {
      const r = Math.floor(idx / N), c = idx % N;
      if (P[s] && fits(s, r, c)) addPiece(s, r, c);
    }
    undo.length = redo.length = 0;
    selected = null;
    changed();
  }

  /* ─── Board renderer ────────────────────────────────── */
  const board = t('board'), canvas = $('canvas', board), ctx = canvas.getContext('2d');
  const cam = { x: 0, y: N * TH / 2, s: 1 };
  let vw = 0, vh = 0, dpr = 1, queued = false;
  let selected = null, ghost = null, brush = 'build_7005', tool = 'look', moving = false;

  const gx = (r, c) => (c - r) * TW / 2;
  const gy = (r, c) => (c + r) * TH / 2;
  const toScreen = (x, y) => [(x - cam.x) * cam.s + vw / 2, (y - cam.y) * cam.s + vh / 2];
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.s + cam.x, (sy - vh / 2) / cam.s + cam.y];
  function cellAt(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    const a = x / (TW / 2), b = y / (TH / 2);
    return [Math.floor((b - a) / 2), Math.floor((b + a) / 2)];
  }

  function resize() {
    const rect = board.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = rect.width; vh = rect.height;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    invalidate();
  }
  function fit(whole = true) {
    cam.x = 0; cam.y = N * TH / 2;
    const w = vw / (N * TW * 1.08), h = vh / (N * TH * 1.2);
    // On a tall phone the whole island is a thin strip; open closer, on the Fountain.
    cam.s = whole ? Math.min(w, h) : Math.min(h, w * 1.8);
    invalidate();
  }
  function invalidate() { if (!queued) { queued = true; requestAnimationFrame(draw); } }

  function poly(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
  const corners = (r, c, h = 1, w = 1) => [[gx(r, c), gy(r, c)], [gx(r, c + w), gy(r, c + w)], [gx(r + h, c + w), gy(r + h, c + w)], [gx(r + h, c), gy(r + h, c)]];

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function draw() {
    queued = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c1a2b';
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (vw / 2 - cam.x * cam.s), dpr * (vh / 2 - cam.y * cam.s));

    // Shallows ring, cliff and sand rim, then the meadow.
    const m = 2.2;
    ctx.fillStyle = 'rgba(125,189,240,0.07)';
    poly(corners(-m * 2.4, -m * 2.4, N + m * 4.8, N + m * 4.8)); ctx.fill();
    ctx.fillStyle = '#3d3423';
    poly(corners(-m, -m, N + 2 * m, N + 2 * m).map(([x, y], i) => [x, y + (i === 0 ? 0 : 10)])); ctx.fill();
    ctx.fillStyle = '#b8a27a';
    poly(corners(-m, -m, N + 2 * m, N + 2 * m)); ctx.fill();
    ctx.fillStyle = '#5d7a3c';
    poly(corners(0, 0, N, N)); ctx.fill();

    // Visible cell range (cheap cull by screen bounds).
    const [x0, y0] = toWorld(-TW * cam.s, -TH * 4 * cam.s), [x1, y1] = toWorld(vw + TW * cam.s, vh + TH * 2 * cam.s);
    const vis = (r, c) => { const x = gx(r, c + .5), y = gy(r, c + .5); return x > x0 - TW && x < x1 + TW && y > y0 - TH * 6 && y < y1 + TH; };

    for (const [idx, s] of surfaces) {
      const r = Math.floor(idx / N), c = idx % N;
      if (!vis(r, c)) continue;
      ctx.fillStyle = P[s] ? P[s].swatch : '#888';
      poly(corners(r, c)); ctx.fill();
    }

    if (cam.s > 1.4 || tool !== 'look') {
      ctx.strokeStyle = 'rgba(11,14,22,0.18)'; ctx.lineWidth = 1 / cam.s;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        ctx.moveTo(gx(i, 0), gy(i, 0)); ctx.lineTo(gx(i, N), gy(i, N));
        ctx.moveTo(gx(0, i), gy(0, i)); ctx.lineTo(gx(N, i), gy(N, i));
      }
      ctx.stroke();
    }

    // Pieces, back to front.
    const list = [...pieces.values()].sort((a, b) => (a.r + a.h + a.c + a.w) - (b.r + b.h + b.c + b.w) || a.c - b.c);
    for (const p of list) {
      if (!vis(p.r + p.h - 1, p.c + p.w - 1) && !vis(p.r, p.c)) continue;
      drawPiece(p, moving && selected === p.id ? 0.35 : 1);
    }

    if (selected != null && pieces.has(selected) && !moving) {
      // Lift the selected piece above its neighbours so it can't hide behind them.
      const p = pieces.get(selected);
      ctx.lineWidth = 2 / cam.s; ctx.strokeStyle = '#7DBDF0'; ctx.fillStyle = 'rgba(125,189,240,0.22)';
      poly(corners(p.r, p.c, p.h, p.w)); ctx.fill(); ctx.stroke();
      drawPiece(p, 1);
    }
    if (ghost) {
      const { r, c, w, h, ok, slug } = ghost;
      ctx.lineWidth = 2 / cam.s;
      ctx.fillStyle = ok ? 'rgba(125,189,240,0.28)' : 'rgba(224,122,106,0.35)';
      ctx.strokeStyle = ok ? '#7DBDF0' : '#E07A6A';
      poly(corners(r, c, h, w)); ctx.fill(); ctx.stroke();
      if (slug && !isSurface(slug)) drawPiece({ slug, r, c, w, h }, ok ? 0.75 : 0.4);
    }
    placeSelectionBar();
  }

  function drawPiece(p, alpha) {
    const def = P[p.slug];
    ctx.globalAlpha = alpha;
    const bottomX = gx(p.r + p.h, p.c + p.w), bottomY = gy(p.r + p.h, p.c + p.w);
    const im = icon(p.slug);
    const span = (p.w + p.h) * TW / 2;
    if (def.cat === 'hedge' || def.cat === 'fence' || def.cat === 'accent') {
      const lift = 5;
      const top = corners(p.r, p.c, p.h, p.w).map(([x, y]) => [x, y - lift]);
      ctx.fillStyle = shade(def.swatch, 0.62);
      poly([top[3], top[2], [top[2][0], top[2][1] + lift], [top[3][0], top[3][1] + lift]]); ctx.fill();
      ctx.fillStyle = shade(def.swatch, 0.78);
      poly([top[1], top[2], [top[2][0], top[2][1] + lift], [top[1][0], top[1][1] + lift]]); ctx.fill();
      ctx.fillStyle = shade(def.swatch, 1.08);
      poly(top); ctx.fill();
    } else if (im) {
      const size = span * (def.cat === 'tree' ? 1.1 : 1.0);
      ctx.drawImage(im, bottomX - size / 2, bottomY - size * 0.96, size, size);
    } else {
      ctx.fillStyle = def.swatch;
      poly(corners(p.r, p.c, p.h, p.w).map(([x, y]) => [x, y - 6])); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ─── Selection bar ─────────────────────────────────── */
  const bar = t('selection');
  function placeSelectionBar() {
    const p = selected != null && pieces.get(selected);
    if (!p || moving) { bar.hidden = true; return; }
    bar.hidden = false;
    const span = (p.w + p.h) * TW / 2;
    const [sx, syTop] = toScreen(gx(p.r + p.h, p.c + p.w), gy(p.r + p.h, p.c + p.w) - span * 1.05);
    const [, syBottom] = toScreen(0, gy(p.r + p.h, p.c + p.w));
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    const x = Math.max(bw / 2 + 6, Math.min(vw - bw / 2 - 6, sx));
    let y = syTop - 8;
    if (y - bh < 54) y = syBottom + bh + 10;
    bar.style.left = `${x}px`; bar.style.top = `${Math.min(vh - 6, y)}px`;
  }

  /* ─── Gestures ──────────────────────────────────────── */
  const pts = new Map();
  let g = null; // current gesture
  const SLOP = 8;

  board.addEventListener('pointerdown', e => {
    if (e.target !== canvas) return;
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pts.size === 2) {
      if (g && g.stroke) restore(g.stroke);  // a second finger cancels a stroke
      const [a, b] = [...pts.values()];
      g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: cam.s, w0: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
      ghost = null; invalidate();
    } else if (pts.size === 1) {
      const [r, c] = cellAt(e.offsetX, e.offsetY);
      g = { type: 'pending', x: e.offsetX, y: e.offsetY, cam: { ...cam }, r, c, onSel: inside(r, c) && occ[r * N + c] === selected && selected != null, mouse: e.pointerType === 'mouse' };
    }
  });

  board.addEventListener('pointermove', e => {
    const pt = pts.get(e.pointerId);
    if (!pt) { if (e.pointerType === 'mouse') hover(e.offsetX, e.offsetY); return; }
    pt.x = e.offsetX; pt.y = e.offsetY;
    if (!g) return;
    if (g.type === 'pinch' && pts.size === 2) {
      const [a, b] = [...pts.values()];
      cam.s = clampScale(g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.x = g.w0[0] - (mx - vw / 2) / cam.s; cam.y = g.w0[1] - (my - vh / 2) / cam.s;
      invalidate(); return;
    }
    if (g.type === 'pending' && Math.hypot(pt.x - g.x, pt.y - g.y) > SLOP) {
      if ((tool === 'look' && g.onSel) || moving) { g.type = 'move'; g.snap = snapshot(); moving = true; }
      else if (tool === 'place') g.type = 'aim';
      else if (tool === 'paint' || tool === 'clear') { g.type = 'stroke'; g.stroke = snapshot(); g.last = null; strokeTo(g.r, g.c); }
      else g.type = 'pan';
    }
    if (g.type === 'pan') {
      cam.x = g.cam.x - (pt.x - g.x) / cam.s; cam.y = g.cam.y - (pt.y - g.y) / cam.s; invalidate();
    } else if (g.type === 'aim') {
      hover(pt.x, pt.y);
    } else if (g.type === 'stroke') {
      const [r, c] = cellAt(pt.x, pt.y); strokeTo(r, c);
    } else if (g.type === 'move') {
      const p = pieces.get(selected), [r, c] = cellAt(pt.x, pt.y);
      const rr = r - Math.floor(p.h / 2), cc = c - Math.floor(p.w / 2);
      ghost = { r: rr, c: cc, w: p.w, h: p.h, slug: p.slug, ok: fits(p.slug, rr, cc, p.w, p.h, p.id) };
      invalidate();
    }
  });

  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.type === 'pinch') { if (pts.size === 0) g = null; else g = { type: 'done' }; return; }
    if (e.type === 'pointercancel') { if (g.stroke) restore(g.stroke); g = null; ghost = null; invalidate(); return; }
    if (g.type === 'pending') tap(g.r, g.c);
    else if (g.type === 'aim') { if (ghost) tap(ghost.r + Math.floor(ghost.h / 2), ghost.c + Math.floor(ghost.w / 2)); }
    else if (g.type === 'stroke') { undo.push(g.stroke); redo.length = 0; changed(); }
    else if (g.type === 'move') finishMove(g.snap);
    g = null;
    if (!g && e.pointerType !== 'mouse') { ghost = null; invalidate(); }
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);
  board.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { ghost = null; invalidate(); } });

  board.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  const clampScale = s => Math.max(0.25, Math.min(4, s));
  function zoomAt(sx, sy, k) {
    const [wx, wy] = toWorld(sx, sy);
    cam.s = clampScale(cam.s * k);
    cam.x = wx - (sx - vw / 2) / cam.s; cam.y = wy - (sy - vh / 2) / cam.s;
    invalidate();
  }

  function hover(sx, sy) {
    if (moving) return;
    const [r, c] = cellAt(sx, sy);
    if (tool === 'place') {
      const def = P[brush], rr = r - Math.floor(def.h / 2), cc = c - Math.floor(def.w / 2);
      ghost = { r: rr, c: cc, w: def.w, h: def.h, slug: brush, ok: isSurface(brush) ? inside(r, c) : fits(brush, rr, cc) };
    } else if ((tool === 'paint' || tool === 'clear') && inside(r, c)) {
      ghost = { r, c, w: 1, h: 1, ok: tool === 'paint' };
    } else ghost = null;
    invalidate();
  }

  function tap(r, c) {
    if (moving) {
      const p = pieces.get(selected), rr = r - Math.floor(p.h / 2), cc = c - Math.floor(p.w / 2);
      ghost = { r: rr, c: cc, w: p.w, h: p.h, slug: p.slug, ok: fits(p.slug, rr, cc, p.w, p.h, p.id) };
      return finishMove(snapshot());
    }
    if (!inside(r, c)) { select(null); return; }
    const hit = occ[r * N + c];
    if (tool === 'look') { select(hit === -1 ? null : hit); return; }
    if (tool === 'place') {
      const def = P[brush];
      if (isSurface(brush)) { commit(); surfaces.set(r * N + c, brush); changed(); return; }
      const rr = r - Math.floor(def.h / 2), cc = c - Math.floor(def.w / 2);
      if (!fits(brush, rr, cc)) { say('Something is in the way. Drag the piece to aim, or clear a space first.'); return; }
      commit(); addPiece(brush, rr, cc); changed();
      return;
    }
    if (tool === 'paint' || tool === 'clear') {
      const s = snapshot(); paintCell(r, c); undo.push(s); redo.length = 0; changed();
    }
  }

  function strokeTo(r, c) {
    const from = g.last || [r, c];
    const n = Math.max(Math.abs(r - from[0]), Math.abs(c - from[1]), 1);
    for (let i = 0; i <= n; i++) paintCell(Math.round(from[0] + (r - from[0]) * i / n), Math.round(from[1] + (c - from[1]) * i / n));
    g.last = [r, c];
    hover(...toScreen(gx(r, c + .5), gy(r + .5, c + .5)));
    changed(false);
  }
  function paintCell(r, c) {
    if (!inside(r, c)) return;
    const i = r * N + c;
    if (tool === 'clear') {
      const hit = occ[i];
      if (hit !== -1) { const p = pieces.get(hit); pieces.delete(hit); for (let y = p.r; y < p.r + p.h; y++) for (let x = p.c; x < p.c + p.w; x++) occ[y * N + x] = -1; if (selected === hit) select(null); }
      else surfaces.delete(i);
      return;
    }
    if (isSurface(brush)) surfaces.set(i, brush);
    else if (occ[i] === -1) addPiece(brush, r, c);
  }

  function finishMove(snap) {
    moving = false;
    const p = pieces.get(selected);
    if (ghost && ghost.ok && p) {
      undo.push(snap); redo.length = 0;
      pieces.delete(p.id);
      reindex();
      const q = addPiece(p.slug, ghost.r, ghost.c, p.w, p.h);
      selected = q.id;
    } else if (ghost) say('No room there. The piece stayed where it was.');
    ghost = null;
    changed();
  }

  /* ─── Tools, palette and inspector ──────────────────── */
  const ws = $('.workspace'), hint = t('hint');
  const HINTS = {
    look: 'Drag to look around · pinch to zoom · tap a piece',
    place: 'Tap the ground, or drag to aim and lift to drop',
    paint: 'Drag to paint · two fingers to look around',
    clear: 'Drag over pieces to clear them · two fingers to look around',
  };
  let sayTimer;
  function say(text) {
    hint.textContent = text; hint.style.color = 'var(--ink)';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { hint.style.color = ''; hint.textContent = HINTS[tool]; }, 2600);
  }

  function setTool(next) {
    tool = next; moving = false; ghost = null;
    ws.dataset.tool = next;
    document.querySelectorAll('[data-action="island.tool"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === next)));
    if (next !== 'look') select(null);
    if (next === 'paint' && !paintable(brush)) pickBrush('garden_path', false);
    hint.textContent = HINTS[next];
    invalidate();
  }

  let cat = 'buildings', query = '';
  function renderCats() {
    t('cats').innerHTML = CATS.map(([k, label]) => `<button type="button" class="cat" role="tab" data-action="island.cat" data-cat="${k}" aria-selected="${k === cat}">${label}</button>`).join('');
  }
  const counts = () => {
    const n = {};
    for (const p of pieces.values()) n[p.slug] = (n[p.slug] || 0) + 1;
    for (const s of surfaces.values()) n[s] = (n[s] || 0) + 1;
    return n;
  };
  function renderShelf() {
    const n = counts(), q = query.trim().toLowerCase();
    const list = SHELF.filter(s => q ? P[s].name.toLowerCase().includes(q) : kind(s) === cat);
    t('shelf').innerHTML = list.map(s => {
      const p = P[s], have = n[s] || 0;
      const cap = isSurface(s) ? 500 : p.effect;
      const meta = isSurface(s) || p.cat === 'hedge'
        ? `<span class="${have > 500 ? 'over' : ''}">${fmt(have)}</span>${isSurface(s) ? ' / 500' : ''}`
        : `${p.w}×${p.h}${have ? ` · <span class="${cap && have > cap ? 'over' : ''}">×${have}</span>` : ''}`;
      return `<li><button type="button" class="piece" data-action="island.brush" data-slug="${s}" aria-pressed="${s === brush && tool !== 'look'}">
        <img src="${iconUrl(s)}" alt="" width="128" height="128" loading="lazy" decoding="async" onerror="this.outerHTML='<i class=&quot;swatch&quot; style=&quot;background:${p.swatch}&quot;></i>'">
        <span class="piece-name">${p.name}</span><span class="piece-meta">${meta}</span></button></li>`;
    }).join('') || '<li class="note">Nothing by that name.</li>';
  }
  function pickBrush(slug, switchTool = true) {
    brush = slug;
    if (switchTool) setTool(isSurface(slug) || P[slug].cat === 'hedge' ? 'paint' : 'place');
    if (query === '' && kind(slug) !== cat) { cat = kind(slug); renderCats(); }
    renderShelf();
    const btn = t('shelf').querySelector(`[data-slug="${slug}"]`);
    if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function select(id) {
    selected = id; moving = false;
    const insp = t('inspector');
    if (id == null) { insp.hidden = true; delete ws.dataset.selecting; invalidate(); return; }
    const p = pieces.get(id), def = P[p.slug], have = counts()[p.slug] || 1;
    const effectNote = def.effect
      ? (have > def.effect
        ? `You have <b>${have}</b>. Only the first ${def.effect === 1 ? '' : def.effect + ' '}add${def.effect === 1 ? 's' : ''} its buff; the rest are decoration.`
        : `The first ${def.effect === 1 ? 'copy adds' : def.effect + ' copies add'} its buff. More are decoration.`)
      : 'Decoration only.';
    insp.innerHTML = `
      <div class="insp-head">
        <img src="${iconUrl(p.slug)}" alt="" width="128" height="128">
        <span class="label" style="color:var(--amber)">Selected</span>
        <button type="button" class="back" data-action="island.deselect">Done</button>
        <h3>${def.name}</h3>
      </div>
      <dl class="insp-facts">
        <dt>Size</dt><dd>${p.w}×${p.h}</dd>
        <dt>Prosperity</dt><dd>${def.prosper ? fmt(def.prosper) : '—'}</dd>
        <dt>At</dt><dd>${p.c + 45}, ${p.r + 45}</dd>
      </dl>
      <p class="insp-note">${effectNote}</p>`;
    insp.hidden = false;
    ws.dataset.selecting = '';
    invalidate();
  }

  /* ─── Starts ────────────────────────────────────────── */
  const STARTS = [
    { slug: 'mine', title: 'Your island', sub: 'Saved on this phone', tag: 'Yours' },
    { slug: 'blank', title: 'Blank island', sub: 'Just the Fountain', tag: 'New' },
    { slug: 'kingshot-8901', title: 'Garden maze', sub: 'Sun hedges and winding paths', tag: 'Example' },
    { slug: 'kingshot-8902', title: 'Ponds and paving', sub: 'Lily ponds, a paved square', tag: 'Example' },
    { slug: 'kingshot-8903', title: 'Hedged lakes', sub: 'Open water, few trees', tag: 'Example' },
    { slug: 'kingshot-8904', title: 'Water garden', sub: 'Pools edged in hedge', tag: 'Example' },
    { slug: 'paste', title: 'Paste from chat', sub: 'A dey.ci/island line', tag: 'Import' },
  ];
  let mine = null;
  function renderStarts() {
    t('starts').innerHTML = STARTS.map(s => `<li><button type="button" class="start" data-action="island.start" data-slug="${s.slug}">
      ${s.slug === 'paste' ? '<span class="start-blank">⎘</span>' : `<canvas width="304" height="192" data-thumb="${s.slug}"></canvas>`}
      <span class="tag">${s.tag}</span><b>${s.title}</b><small>${s.sub}</small></button></li>`).join('');
    document.querySelectorAll('[data-thumb]').forEach(cv => thumb(cv, cv.dataset.thumb));
  }
  function layoutFor(slug) {
    if (slug === 'mine') return mine;
    if (slug === 'blank') return D.layouts[0] && { pieces: { 1647: 'build_7000' }, surfaces: {} };
    return D.layouts.find(l => l.slug === slug);
  }
  function thumb(cv, slug) {
    const L = layoutFor(slug), x = cv.getContext('2d');
    if (!L) return;
    const w = 2.5, h = 1.25, ox = cv.width / 2, oy = (cv.height - N * h * 2) / 2 + 4;
    const cell = (r, c, col) => {
      const px = ox + (c - r) * w * 2 / 2 * 1, py = oy + (c + r) * h;
      x.fillStyle = col; x.beginPath(); x.moveTo(px, py); x.lineTo(px + w, py + h); x.lineTo(px, py + 2 * h); x.lineTo(px - w, py + h); x.fill();
    };
    x.fillStyle = '#0c1a2b'; x.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cell(r, c, '#5d7a3c');
    for (const [i, s] of Object.entries(L.surfaces)) cell(Math.floor(i / N), i % N, P[s] ? P[s].swatch : '#888');
    for (const [i, s] of Object.entries(L.pieces)) {
      const p = P[s]; if (!p) continue;
      const r0 = Math.floor(i / N), c0 = i % N;
      for (let r = r0; r < r0 + p.h; r++) for (let c = c0; c < c0 + p.w; c++) cell(r, c, s === 'build_7000' ? '#F1E3C2' : shade(p.swatch, 0.9));
    }
  }
  function start(slug) {
    if (slug === 'paste') { say('Paste a dey.ci/island line to open it as a copy.'); return; }
    if (slug === 'mine') { owner = 'mine'; load(mine); }
    else { owner = 'example'; load(layoutFor(slug)); }
    fit(false);
    $('#build').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* ─── Glance and share ──────────────────────────────── */
  function changed(full = true) {
    invalidate();
    if (!full) return;
    $('[data-action="island.undo"]').disabled = !undo.length;
    $('[data-action="island.redo"]').disabled = !redo.length;
    t('owner').innerHTML = owner === 'mine'
      ? '<b>Your island</b> · saved on this phone'
      : '<b>Example copy</b> · not saved · <u>keep as mine</u>';
    renderShelf();
    glance();
  }

  function glance() {
    const n = counts();
    let prosper = 0, spare = 0, buildings = 0, green = 0;
    for (const [s, k] of Object.entries(n)) {
      const p = P[s]; if (!p || isSurface(s)) continue;
      if (kind(s) === 'buildings' || kind(s) === 'decor') buildings += k; else green += k;
      prosper += p.prosper * (p.effect ? Math.min(k, p.effect) : k);
      if (p.effect && k > p.effect && p.prosper) spare += k - p.effect;
    }
    const over = Object.entries(n).filter(([s, k]) => isSurface(s) && k > 500);
    const paths = [...surfaces.values()].length;
    t('glance').innerHTML = `
      <div><dt>Prosperity</dt><dd>${fmt(prosper)}<small>from pieces that count</small></dd></div>
      <div><dt>Buildings &amp; décor</dt><dd>${fmt(buildings)}<small>${spare ? `${spare} add no buff` : 'every copy counts'}</small></dd></div>
      <div><dt>Trees &amp; hedges</dt><dd>${fmt(green)}<small>no limit found</small></dd></div>
      <div class="${over.length ? 'is-over' : ''}"><dt>Path &amp; water tiles</dt><dd>${fmt(paths)}<small>${over.length ? over.map(([s, k]) => `${P[s].name} ${fmt(k)} / 500`).join(', ') : 'all within limits'}</small></dd></div>`;
    t('limits').textContent = over.length ? 'Over a limit? The game caps each path type at 500 tiles. The extra tiles stay in the plan, flagged, so you can decide what to cut.' : '';

    // Rough chat-length estimate: 3 bytes a piece, paths as runs, base64url.
    const bytes = 8 + pieces.size * 3 + Math.ceil(runs() * 2.2);
    const chars = CHAT_PREFIX.length + Math.ceil(bytes * 4 / 3);
    const rail = $('.budget-rail'), fill = t('budgetFill');
    t('budgetNum').textContent = `≈ ${fmt(chars)} / ${CHAT_CAP}`; // placeholder until the real codec is wired in
    fill.style.width = `${Math.min(100, chars / CHAT_CAP * 100)}%`;
    if (chars > CHAT_CAP) {
      rail.dataset.over = '';
      t('budgetNote').textContent = 'Too long for one chat line. Send the link outside the game, or download the file.';
    } else {
      delete rail.dataset.over;
      t('budgetNote').textContent = `Fits in one chat line with ${CHAT_CAP - chars} characters to spare.`;
    }
  }
  function runs() {
    let n = 0;
    for (let i = 0; i < N * N; i++) { const s = surfaces.get(i); if (s && surfaces.get(i - 1) !== s) n++; }
    return n;
  }

  /* ─── Actions (the site's data-action contract) ─────── */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action.replace('island.', '');
    const p = selected != null && pieces.get(selected);
    switch (a) {
      case 'tool': setTool(b.dataset.tool); break;
      case 'cat': cat = b.dataset.cat; query = ''; t('cats').querySelectorAll('.cat').forEach(x => x.setAttribute('aria-selected', String(x === b))); $('#piece-search').value = ''; renderShelf(); t('shelf').scrollLeft = 0; break;
      case 'brush': pickBrush(b.dataset.slug); break;
      case 'zoom': zoomAt(vw / 2, vh / 2, +b.dataset.step > 0 ? 1.35 : 1 / 1.35); break;
      case 'fit': fit(); break;
      case 'undo': if (undo.length) { redo.push(snapshot()); restore(undo.pop()); select(null); } break;
      case 'redo': if (redo.length) { undo.push(snapshot()); restore(redo.pop()); select(null); } break;
      case 'deselect': select(null); break;
      case 'start': start(b.dataset.slug); break;
      case 'rotate':
        if (!p) break;
        if (p.w === p.h) { say('Turned. Square pieces keep their footprint.'); break; }
        if (!fits(p.slug, p.r, p.c, p.h, p.w, p.id)) { say('No room to turn it here.'); break; }
        commit(); [p.w, p.h] = [p.h, p.w]; reindex(); select(p.id); break;
      case 'move': if (p) { moving = true; bar.hidden = true; hint.textContent = 'Tap where it should go, or drag it'; invalidate(); } break;
      case 'copy': if (p) { pickBrush(p.slug); } break;
      case 'remove':
        if (!p) break;
        commit(); pieces.delete(p.id); reindex(); select(null); say(`${P[p.slug].name} removed. Undo brings it back.`); break;
      case 'copyChat': case 'copyLink': case 'download': say('Copied (sketch).'); break;
    }
  });
  $('#piece-search').addEventListener('input', e => { query = e.target.value; renderShelf(); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(`[data-action="island.${e.shiftKey ? 'redo' : 'undo'}"]`).click(); }
    else if (e.key === 'Escape') { moving = false; ghost = null; select(null); setTool('look'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null) $('[data-action="island.remove"]').click();
    else if (e.key.toLowerCase() === 'r' && selected != null) $('[data-action="island.rotate"]').click();
  });

  /* ─── Boot ──────────────────────────────────────────── */
  // A stand-in "your island": the default fountain and path cross, plus a few buildings.
  const base = D.layouts.find(l => l.slug === 'kingshot-8900');
  mine = { pieces: { ...base.pieces }, surfaces: { ...base.surfaces } };
  [[22, 22, 'build_7005'], [22, 34, 'build_7008'], [34, 22, 'build_7014'], [34, 34, 'build_7017'], [26, 40, 'build_7006'], [40, 26, 'build_7002'],
   [18, 28, 'build_7009'], [28, 18, 'build_7029'], [40, 34, 'build_7035'], [44, 34, 'build_7035'], [14, 22, 'build_7036']]
    .forEach(([r, c, s]) => { mine.pieces[r * N + c] = s; });
  for (let c = 18; c < 42; c++) { mine.pieces[16 * N + c] = 'song_of_the_sun'; mine.pieces[44 * N + c] = 'lush_elegy'; }
  for (let i = 0; i < 70; i++) { const r = (i * 37) % 13 + 2, c = (i * 23) % 56 + 2; mine.pieces[r * N + c] = ['tree_fir', 'tree_round', 'tree_pine', 'tree_pair'][i % 4]; }
  for (let i = 0; i < 40; i++) { const r = 48 + (i * 7) % 10, c = (i * 29) % 50 + 5; mine.pieces[r * N + c] = ['tree_bush', 'tree_round'][i % 2]; }
  for (let r = 46; r < 54; r++) for (let c = 42; c < 54; c++) if ((r - 50) ** 2 / 16 + (c - 48) ** 2 / 36 < 1) mine.surfaces[r * N + c] = 'pond';

  // Colour the hero's island by glyph, the way the generated scenes take page tokens.
  const art = $('.ascii-island');
  const cls = ch => '~'.includes(ch) ? 'sea' : '^'.includes(ch) ? 'tree' : ':'.includes(ch) ? 'path' : '()o=|'.includes(ch) ? 'fount' : "*".includes(ch) ? 'sky' : 'rim';
  art.innerHTML = art.textContent.split('\n').map((line, i) => i === 0 ? `<span class="sky">${line}</span>` : line.replace(/\S/g, ch => `<span class="${cls(ch)}">${ch.replace('<', '&lt;').replace('>', '&gt;')}</span>`)).join('\n');

  renderCats();
  renderStarts();
  new ResizeObserver(() => { const first = !vw; resize(); if (first) fit(false); }).observe(board);
  load(mine);
  setTool('look');

  // Screenshot hooks for the sketch review.
  window.__island = { select: (slug) => { const p = [...pieces.values()].find(x => x.slug === slug); if (p) { select(p.id); const [x, y] = [gx(p.r + p.h / 2, p.c + p.w / 2), gy(p.r + p.h / 2, p.c + p.w / 2)]; cam.x = x; cam.y = y; cam.s = 1.6; invalidate(); } }, setTool, pickBrush, start, hover: (r, c) => { const [x, y] = toScreen(gx(r + .5, c + .5), gy(r + .5, c + .5)); hover(x, y); }, cam, fit };
})();
