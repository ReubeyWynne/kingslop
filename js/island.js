/* The Island page. One canvas draws the board; everything you read or press is HTML.
   No toolbar: tapping open ground offers what fits there, tapping a piece opens its card,
   pressing and holding a piece lifts it, and a loaded brush places or paints. The plan
   itself lives in IslandModel; this file only draws it, reads gestures and saves. */
(function () {
  'use strict';
  var DATA = window.ISLAND_DATA, N = DATA.size, TW = 32, TH = 16;
  var PLAN_KEY = 'bh:island-plan:v1', RECENT_KEY = 'bh:island-recent:v1', TAUGHT_KEY = 'bh:island-taught:v1';
  var CLEAR = '__clear', FOUNTAIN = 'build_7000'; // every island has exactly one Fountain
  var KINDS = [['building', 'Buildings'], ['decor', 'Décor'], ['hedge', 'Hedges'], ['surface', 'Paths & water'], ['tree', 'Trees']];
  var LONG_PRESS = 420, SLOP_TOUCH = 9, SLOP_MOUSE = 4;

  function read(key, fallback) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return new Intl.NumberFormat('en-GB').format(n); }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    function f(v) { return Math.max(0, Math.min(255, Math.round(v * k))); }
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  window.Interactions.register('island', function (context) {
    var root = context.root, artBase = root.dataset.art;
    var model = window.IslandModel.create(DATA.pieces, N);
    var def = model.def;
    function node(key) { return context.targets(key)[0]; }

    /* ─── Ownership: inventory balances keyed island-piece-{id} ── */
    var store = null, owns = {};
    try { store = context.ledger; } catch (e) { store = null; }
    function ownKey(d) { return 'island-piece-' + d.id; }
    function readOwns() {
      owns = {};
      if (!store) return;
      try {
        var inv = store.snapshot().inventory;
        DATA.pieces.forEach(function (d) { var e = inv[ownKey(d)]; if (e && e.status === 'confirmed') owns[d.slug] = e.amount; });
      } catch (e) { owns = {}; }
    }
    function owned(slug) { return Object.prototype.hasOwnProperty.call(owns, slug) ? owns[slug] : null; }
    function isYours(slug) { return owned(slug) > 0; }
    function anyOwned() { return Object.keys(owns).some(function (s) { return owns[s] > 0; }); }
    if (store && store.subscribe) context.cleanup(store.subscribe(function () { readOwns(); refreshOpen(); }));
    readOwns();

    /* ─── Art ────────────────────────────────────────────────── */
    var images = {};
    function image(d) {
      if (!d.icon) return null;
      if (!(d.id in images)) {
        images[d.id] = null;
        var im = new Image();
        im.decoding = 'async';
        im.onload = function () { images[d.id] = im; invalidate(); };
        im.src = artBase + d.id + '.webp';
      }
      return images[d.id];
    }
    function art(d, cls) {
      return d.icon ? '<img src="' + artBase + d.id + '.webp" width="128" height="128" alt="" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : '') + '>'
        : '<i class="island-swatch" style="background:' + esc(d.swatch) + '"></i>';
    }

    /* ─── Plan state and saving ─────────────────────────────── */
    var owner = { mine: true };
    var saved = read(PLAN_KEY, null);
    if (!saved || model.load(saved) === -1) model.load({ pieces: [[27 * N + 27, 'build_7000', 0]], surfaces: [] });
    function save() { if (owner.mine) write(PLAN_KEY, model.toJSON()); }
    function committed() { save(); syncStrip(); invalidate(); }

    var recent = read(RECENT_KEY, ['garden_path', 'lush_elegy', 'tree_fir', 'build_7035']).filter(function (s) { return s === CLEAR || def(s); });
    function remember(slug) {
      recent = [slug].concat(recent.filter(function (s) { return s !== slug; })).slice(0, 5);
      write(RECENT_KEY, recent);
    }

    /* ─── Board drawing ─────────────────────────────────────── */
    var board = node('board'), canvas = board.querySelector('canvas'), ctx = canvas.getContext('2d');
    var cam = { x: 0, y: N * TH / 2, s: 1 }, vw = 0, vh = 0, dpr = 1, queued = false;
    var brush = null, pending = null, lifted = null, cardId = null, ground = null, cursor = null;

    function gx(r, c) { return (c - r) * TW / 2; }
    function gy(r, c) { return (c + r) * TH / 2; }
    function toScreen(x, y) { return [(x - cam.x) * cam.s + vw / 2, (y - cam.y) * cam.s + vh / 2]; }
    function toWorld(sx, sy) { return [(sx - vw / 2) / cam.s + cam.x, (sy - vh / 2) / cam.s + cam.y]; }
    function cellAt(sx, sy) {
      var w = toWorld(sx, sy), a = w[0] / (TW / 2), b = w[1] / (TH / 2);
      return [Math.floor((b - a) / 2), Math.floor((b + a) / 2)];
    }
    function corners(r, c, h, w) {
      h = h || 1; w = w || 1;
      return [[gx(r, c), gy(r, c)], [gx(r, c + w), gy(r, c + w)], [gx(r + h, c + w), gy(r + h, c + w)], [gx(r + h, c), gy(r + h, c)]];
    }
    function poly(pts) { ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
    function clampScale(s) { return Math.max(0.2, Math.min(4, s)); }

    function resize() {
      var rect = board.getBoundingClientRect();
      var first = !vw;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = rect.width; vh = rect.height;
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      if (first) fit(false);
      invalidate();
    }
    // The whole island, or on a tall phone a closer view on the Fountain.
    function fit(whole) {
      cam.x = 0; cam.y = N * TH / 2;
      var w = vw / (N * TW * 1.08), h = (vh - 80) / (N * TH * 1.15);
      cam.s = whole || vw >= vh ? Math.min(w, h) : Math.min(h, w * 3);
      invalidate();
    }
    function zoomAt(sx, sy, k) {
      var w = toWorld(sx, sy);
      cam.s = clampScale(cam.s * k);
      cam.x = w[0] - (sx - vw / 2) / cam.s; cam.y = w[1] - (sy - vh / 2) / cam.s;
      invalidate();
    }
    function invalidate() { if (!queued) { queued = true; requestAnimationFrame(draw); } }

    function draw() {
      queued = false;
      if (!vw) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0C1A2B';
      ctx.fillRect(0, 0, vw, vh);
      ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (vw / 2 - cam.x * cam.s), dpr * (vh / 2 - cam.y * cam.s));

      // Shallows, cliff and sand rim, then the meadow.
      var m = 2.2;
      ctx.fillStyle = 'rgba(125,189,240,0.07)';
      poly(corners(-m * 2.4, -m * 2.4, N + m * 4.8, N + m * 4.8)); ctx.fill();
      ctx.fillStyle = '#3D3423';
      poly(corners(-m, -m, N + 2 * m, N + 2 * m).map(function (p, i) { return [p[0], p[1] + (i ? 10 : 0)]; })); ctx.fill();
      ctx.fillStyle = '#B8A27A';
      poly(corners(-m, -m, N + 2 * m, N + 2 * m)); ctx.fill();
      ctx.fillStyle = '#5D7A3C';
      poly(corners(0, 0, N, N)); ctx.fill();

      var tl = toWorld(-TW * cam.s, -TH * 8 * cam.s), br = toWorld(vw + TW * cam.s, vh + TH * 2 * cam.s);
      function visible(r, c) { var x = gx(r, c + 0.5), y = gy(r, c + 0.5); return x > tl[0] - TW && x < br[0] + TW && y > tl[1] - TH * 8 && y < br[1] + TH; }

      model.surfaces.forEach(function (slug, idx) {
        var r = Math.floor(idx / N), c = idx % N;
        if (!visible(r, c)) return;
        ctx.fillStyle = def(slug).swatch;
        poly(corners(r, c)); ctx.fill();
      });

      // Grid lines while something is being placed or the view is close.
      if (cam.s > 1.3 || brush || pending || lifted) {
        ctx.strokeStyle = 'rgba(10,16,24,0.18)'; ctx.lineWidth = 1 / cam.s;
        ctx.beginPath();
        for (var i = 0; i <= N; i++) {
          ctx.moveTo(gx(i, 0), gy(i, 0)); ctx.lineTo(gx(i, N), gy(i, N));
          ctx.moveTo(gx(0, i), gy(0, i)); ctx.lineTo(gx(N, i), gy(N, i));
        }
        ctx.stroke();
      }

      var list = Array.from(model.pieces.values()).sort(function (a, b) { return (a.r + a.h + a.c + a.w) - (b.r + b.h + b.c + b.w) || a.c - b.c; });
      list.forEach(function (p) {
        if (!visible(p.r + p.h - 1, p.c + p.w - 1) && !visible(p.r, p.c)) return;
        drawPiece(p, lifted && lifted.id === p.id ? 0.25 : 1);
      });

      if (cardId != null && model.pieces.has(cardId)) {
        var sp = model.pieces.get(cardId);
        outline(sp.r, sp.c, sp.h, sp.w, 'rgba(125,189,240,0.22)', '#7DBDF0');
        drawPiece(sp, 1); // over its neighbours, so a selected piece is never hidden
      }
      if (ground) outline(ground.r, ground.c, 1, 1, 'rgba(125,189,240,0.3)', '#7DBDF0');
      if (pending) ghost(pending.slug, pending.r, pending.c, pending.w, pending.h, pending.ok);
      if (lifted) { var lp = model.pieces.get(lifted.id); ghost(lp.slug, lifted.r, lifted.c, lp.w, lp.h, lifted.ok && !lifted.overDrop); }
      if (hover) ghost(hover.slug, hover.r, hover.c, hover.w, hover.h, hover.ok);
      if (cursor) outline(cursor.r, cursor.c, 1, 1, null, '#F1E3C2');
      place();
    }
    function outline(r, c, h, w, fill, stroke) {
      ctx.lineWidth = 2 / cam.s; poly(corners(r, c, h, w));
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.strokeStyle = stroke; ctx.stroke();
    }
    function ghost(slug, r, c, w, h, ok) {
      outline(r, c, h, w, ok ? 'rgba(125,189,240,0.28)' : 'rgba(224,122,106,0.35)', ok ? '#7DBDF0' : '#E07A6A');
      if (slug && slug !== CLEAR && !model.isSurface(slug)) drawPiece({ slug: slug, r: r, c: c, w: w, h: h }, ok ? 0.8 : 0.4);
    }
    function drawPiece(p, alpha) {
      var d = def(p.slug), im = image(d);
      var bx = gx(p.r + p.h, p.c + p.w), by = gy(p.r + p.h, p.c + p.w), span = (p.w + p.h) * TW / 2;
      ctx.globalAlpha = alpha;
      if (d.kind === 'hedge') {
        // Hedges and fences are short blocks so a run of them reads as one border.
        var lift = 5, top = corners(p.r, p.c, p.h, p.w).map(function (q) { return [q[0], q[1] - lift]; });
        ctx.fillStyle = shade(d.swatch, 0.62);
        poly([top[3], top[2], [top[2][0], top[2][1] + lift], [top[3][0], top[3][1] + lift]]); ctx.fill();
        ctx.fillStyle = shade(d.swatch, 0.78);
        poly([top[1], top[2], [top[2][0], top[2][1] + lift], [top[1][0], top[1][1] + lift]]); ctx.fill();
        ctx.fillStyle = shade(d.swatch, 1.08);
        poly(top); ctx.fill();
      } else if (im) {
        var size = span * (d.kind === 'tree' ? 1.1 : 1);
        ctx.drawImage(im, bx - size / 2, by - size * 0.96, size, size);
      } else {
        ctx.fillStyle = d.swatch;
        poly(corners(p.r, p.c, p.h, p.w).map(function (q) { return [q[0], q[1] - 6]; })); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ─── Floating HTML placed against the board ────────────── */
    var pop = node('ground'), confirmBox = node('confirm'), card = node('card');
    function place() {
      if (ground && !pop.hidden) {
        var s = toScreen(gx(ground.r + 0.5, ground.c + 0.5), gy(ground.r + 0.5, ground.c + 0.5));
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var x = Math.max(8, Math.min(vw - pw - 8, s[0] - pw / 2)), below = s[1] - ph - 16 < 50;
        pop.style.left = x + 'px';
        pop.style.top = (below ? s[1] + 18 : s[1] - ph - 14) + 'px';
        pop.style.setProperty('--tip', Math.max(14, Math.min(pw - 14, s[0] - x)) + 'px');
        pop.toggleAttribute('data-below', below);
      }
      if (pending && !confirmBox.hidden) {
        var e = toScreen(gx(pending.r + pending.h, pending.c + pending.w), gy(pending.r + pending.h, pending.c + pending.w));
        var cw = confirmBox.offsetWidth;
        confirmBox.style.left = Math.max(8, Math.min(vw - cw - 8, e[0] - cw / 2)) + 'px';
        confirmBox.style.top = Math.min(vh - 140, e[1] + 10) + 'px';
      }
    }

    /* ─── Messages ──────────────────────────────────────────── */
    var hint = node('hint'), status = node('status'), hintTimer = 0;
    function say(text, hold) {
      hint.textContent = text; hint.hidden = false; status.textContent = text;
      clearTimeout(hintTimer);
      if (!hold) hintTimer = setTimeout(function () { hint.hidden = true; }, 2600);
    }
    if (!read(TAUGHT_KEY, false)) say('Tap open ground to see what fits there', true);
    function taught() { if (!read(TAUGHT_KEY, false)) { write(TAUGHT_KEY, true); hint.hidden = true; } }

    /* ─── Picking: ground card, piece card, strip, sheet ────── */
    function pieceButton(d, action, extra) {
      var own = owned(d.slug), yours = own > 0;
      var meta = extra != null ? extra : (yours ? 'yours ×' + own : (own === 0 ? 'not owned' : 'not marked'));
      return '<li><button type="button" class="island-piece" data-action="' + action + '" data-slug="' + esc(d.slug) + '" data-own="' + (yours || !anyOwned() ? 'yes' : 'no') + '">'
        + art(d) + '<span>' + esc(d.name) + '</span><small>' + esc(meta) + '</small></button></li>';
    }
    function rankRecent(a, b) {
      var ra = recent.indexOf(a.slug), rb = recent.indexOf(b.slug);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || b.w * b.h - a.w * a.h || a.id - b.id;
    }

    function openGround(r, c) {
      closeAll();
      ground = { r: r, c: c };
      var fitting = DATA.pieces.filter(function (d) { return d.kind !== 'surface' && d.slug !== FOUNTAIN && model.anchorFor(d.w, d.h, r, c, -1); }).sort(rankRecent);
      var yours = fitting.filter(function (d) { return isYours(d.slug); }), others = fitting.filter(function (d) { return !isYours(d.slug); });
      var html = '';
      if (yours.length) html += '<p class="island-label">Yours · fits here</p><ul class="island-pieces">' + yours.map(function (d) { return pieceButton(d, 'island.pick', d.w + '×' + d.h); }).join('') + '</ul>';
      else if (!anyOwned()) html += '<p class="island-empty">Mark the pieces you own and they come first here.</p>';
      if (others.length) html += '<p class="island-label">' + (anyOwned() ? 'Not yours yet · plan anyway' : 'Fits here') + '</p><ul class="island-pieces">' + others.slice(0, 24).map(function (d) { return pieceButton(d, 'island.pick', d.w + '×' + d.h); }).join('') + '</ul>';
      if (!fitting.length) html += '<p class="island-empty">Only paths fit on this spot.</p>';
      var path = recent.filter(function (s) { return s !== CLEAR && model.isSurface(s); })[0] || 'garden_path';
      html += '<div class="island-links"><button type="button" class="island-link" data-action="island.pathHere" data-slug="' + path + '">' + esc(def(path).name) + ' from here</button><button type="button" class="island-link" data-action="island.catalogue">All pieces</button></div>';
      pop.innerHTML = html;
      pop.hidden = false;
      guard(pop);
      say('', false); hint.hidden = true;
      invalidate();
    }

    // A touch that opens a card must not also press what appears under the finger.
    function guard(el) { el.style.pointerEvents = 'none'; setTimeout(function () { el.style.pointerEvents = ''; }, 380); }

    function stage(slug, r, c) {
      var d = def(slug), a = model.anchorFor(d.w, d.h, r, c, -1);
      pending = { slug: slug, r: a ? a.r : r - Math.floor(d.h / 2), c: a ? a.c : c - Math.floor(d.w / 2), w: d.w, h: d.h, ok: !!a };
      confirmBox.hidden = false;
      say('Drag to nudge it, then ✓', true);
      invalidate();
    }
    function accept() {
      if (!pending) return;
      if (!pending.ok) { say('Something is in the way there.'); return; }
      var slug = pending.slug, p = pending;
      model.edit(function () { model.place(slug, p.r, p.c, p.w, p.h); });
      remember(slug); taught();
      pending = null; confirmBox.hidden = true; hint.hidden = true;
      say(def(slug).name + ' placed');
      committed();
    }
    function reject() { pending = null; confirmBox.hidden = true; hint.hidden = true; invalidate(); }

    function openCard(id) {
      closeAll();
      cardId = id;
      renderCard();
      card.hidden = false;
      guard(card);
      node('strip').hidden = true;
      invalidate();
    }
    function renderCard() {
      var p = model.pieces.get(cardId);
      if (!p) { closeCard(); return; }
      var d = def(p.slug), placedN = model.counts()[p.slug] || 0, own = owned(p.slug);
      var notes = [];
      if (p.slug === FOUNTAIN) notes.push('Every island has one Fountain, in the middle.');
      else if (d.effect) notes.push(placedN > d.effect ? '<span class="is-warn">' + placedN + ' on this plan, and only ' + (d.effect === 1 ? 'the first adds' : 'the first ' + d.effect + ' add') + ' its buff.</span>' : 'The first ' + (d.effect === 1 ? 'copy adds' : d.effect + ' copies add') + ' its buff; more are decoration.');
      if (own !== null && placedN > own) notes.push('<span class="is-warn">You own ' + own + '; this plan uses ' + placedN + '.</span>');
      card.innerHTML = '<button type="button" class="island-close" data-action="island.closeCard" aria-label="Close">✕</button>'
        + '<div class="island-card-head">' + art(d) + '<h3>' + esc(d.name) + '</h3><p>' + d.w + '×' + d.h + (d.prosper ? ' · +' + fmt(d.prosper) + ' prosperity' : '') + ' · ' + (p.c + 45) + ', ' + (p.r + 45) + '</p></div>'
        + (notes.length ? '<p class="island-card-note">' + notes.join(' ') + '</p>' : '<p class="island-card-note">Decoration.</p>')
        + '<div class="island-card-foot">'
        + (store && p.slug !== FOUNTAIN ? '<span class="island-own">You own <span class="island-step"><button type="button" data-action="island.own" data-step="-1" aria-label="One fewer">−</button><output aria-live="polite">' + (own === null ? '?' : own) + '</output><button type="button" data-action="island.own" data-step="1" aria-label="One more">+</button></span></span>' : '')
        + '<button type="button" class="island-act" data-action="island.turn"' + (p.w === p.h ? ' disabled title="Square pieces keep their footprint"' : '') + '>⟳ Turn</button>'
        + (p.slug === FOUNTAIN ? '' : '<button type="button" class="island-act" data-action="island.more">Place more</button>'
        + '<button type="button" class="island-act is-warn" data-action="island.remove">Remove</button>')
        + '</div>';
    }
    function closeCard() { cardId = null; card.hidden = true; node('strip').hidden = false; invalidate(); }

    function loadBrush(slug) {
      closeAll();
      brush = slug;
      if (slug !== CLEAR) remember(slug);
      taught();
      syncStrip();
      say(slug === CLEAR ? 'Drag over pieces and paths to clear them' : paintable(slug) ? 'Drag to paint · two fingers to look around' : 'Tap open ground to place');
      invalidate();
    }
    function unloadBrush() { brush = null; hover = null; syncStrip(); invalidate(); }
    function clearCell(r, c) { var hit = model.pieceAt(r, c); if (!hit || hit.slug !== FOUNTAIN) model.clear(r, c); }
    function paintable(slug) { if (slug === CLEAR) return true; var d = def(slug); return d.w === 1 && d.h === 1; }

    function syncStrip() {
      node('undo').disabled = !model.canUndo;
      var rest = node('rest'), b = node('brush'), drop = node('drop');
      drop.hidden = !lifted;
      rest.hidden = !!brush || !!lifted;
      b.hidden = !brush || !!lifted;
      if (lifted) return;
      if (!brush) {
        node('recent').innerHTML = recent.map(function (s) {
          if (s === CLEAR) return '';
          var d = def(s);
          return '<li><button type="button" class="island-piece" data-action="island.load" data-slug="' + esc(s) + '" aria-label="' + esc(d.name) + '" data-own="' + (isYours(s) || !anyOwned() ? 'yes' : 'no') + '">' + art(d) + '</button></li>';
        }).join('') + '<li><button type="button" class="island-piece" data-action="island.load" data-slug="' + CLEAR + '" aria-label="Clear" title="Clear"><span class="island-eraser" aria-hidden="true">⌫</span></button></li>';
        return;
      }
      var line, name, pic;
      if (brush === CLEAR) { name = 'Clear'; pic = '<span class="island-eraser" aria-hidden="true">⌫</span>'; line = 'drag over pieces and paths'; }
      else {
        var d = def(brush), n = model.counts()[brush] || 0;
        name = d.name; pic = art(d);
        line = d.kind === 'surface' ? '<span class="' + (n > d.limit ? 'is-warn' : '') + '">' + fmt(n) + ' / ' + fmt(d.limit) + '</span> · drag to paint'
          : (paintable(brush) ? fmt(n) + ' placed · tap or drag' : fmt(n) + ' placed · tap open ground');
        var own = owned(brush);
        if (own !== null && n > own) line += ' · <span class="is-warn">you own ' + own + '</span>';
      }
      b.innerHTML = pic + '<div><b>' + esc(name) + '</b><small>' + line + '</small></div><button type="button" class="island-close" data-action="island.unload" aria-label="Put the brush down">✕</button>';
    }

    var sheet = node('sheet'), sheetKind = 'building';
    function openSheet() {
      closeAll();
      node('kinds').innerHTML = KINDS.map(function (k) { return '<button type="button" role="tab" data-action="island.kind" data-kind="' + k[0] + '" aria-selected="' + (k[0] === sheetKind) + '">' + k[1] + '</button>'; }).join('');
      node('search').value = '';
      renderSheet();
      if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
    }
    function renderSheet() {
      var q = node('search').value.trim().toLowerCase();
      var list = DATA.pieces.filter(function (d) { return d.slug !== FOUNTAIN; }).filter(function (d) { return q ? d.name.toLowerCase().indexOf(q) >= 0 : d.kind === sheetKind; });
      var counts = model.counts();
      function row(d) { var n = counts[d.slug] || 0, own = owned(d.slug); return pieceButton(d, 'island.load', (own > 0 ? 'yours ×' + own : own === 0 ? 'not owned' : '') + (n ? (own !== null ? ' · ' : '') + n + ' placed' : '')); }
      var yours = list.filter(function (d) { return isYours(d.slug); }), others = list.filter(function (d) { return !isYours(d.slug); });
      node('catalogue').innerHTML = (yours.length ? '<p class="island-label">Yours</p><ul class="island-pieces">' + yours.map(row).join('') + '</ul>' : '')
        + (others.length ? '<p class="island-label">' + (yours.length || anyOwned() ? 'Not yours yet' : 'Every piece') + '</p><ul class="island-pieces">' + others.map(row).join('') + '</ul>' : '')
        + (list.length ? '' : '<p class="island-empty">Nothing by that name.</p>');
    }
    function closeSheet() { if (sheet.open) { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); } }

    function closeAll() {
      ground = null; pop.hidden = true;
      if (cardId != null) closeCard();
      closeSheet();
      invalidate();
    }
    function refreshOpen() {
      if (cardId != null) renderCard();
      if (ground) openGround(ground.r, ground.c);
      if (sheet.open) renderSheet();
      syncStrip();
    }

    /* ─── Gestures ──────────────────────────────────────────── */
    var pts = new Map(), g = null, hover = null, pressTimer = 0;
    function local(e) { var r = board.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function inPending(r, c) { return pending && r >= pending.r && r < pending.r + pending.h && c >= pending.c && c < pending.c + pending.w; }

    function liftAt(id) {
      var p = model.pieces.get(id);
      if (!p) return;
      closeAll();
      lifted = { id: id, r: p.r, c: p.c, ok: true, overDrop: false };
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not allowed */ } }
      say('Drop it to move it, or on the bar to remove it', true);
      syncStrip(); invalidate();
    }
    function dragLifted(x, y, clientY) {
      var p = model.pieces.get(lifted.id), cell = cellAt(x, y);
      lifted.r = cell[0] - Math.floor(p.h / 2); lifted.c = cell[1] - Math.floor(p.w / 2);
      lifted.ok = model.fits(p.w, p.h, lifted.r, lifted.c, p.id);
      var dropRect = node('drop').getBoundingClientRect();
      lifted.overDrop = clientY >= dropRect.top - 12;
      node('drop').toggleAttribute('data-over', lifted.overDrop);
      invalidate();
    }
    function dropLifted() {
      var l = lifted, p = model.pieces.get(l.id);
      lifted = null; hint.hidden = true;
      if (l.overDrop) { model.edit(function () { model.remove(l.id); }); say(def(p.slug).name + ' removed · ↶ brings it back'); }
      else if (l.ok && (l.r !== p.r || l.c !== p.c)) { model.edit(function () { model.move(l.id, l.r, l.c); }); say(def(p.slug).name + ' moved'); }
      else if (!l.ok) say('No room there; it stayed where it was');
      node('drop').removeAttribute('data-over');
      committed();
    }

    function strokeTo(r, c) {
      var from = g.last || [r, c], n = Math.max(Math.abs(r - from[0]), Math.abs(c - from[1]), 1);
      for (var i = 0; i <= n; i++) {
        var rr = Math.round(from[0] + (r - from[0]) * i / n), cc = Math.round(from[1] + (c - from[1]) * i / n);
        if (brush === CLEAR) clearCell(rr, cc); else model.paint(brush, rr, cc);
      }
      g.last = [r, c];
      hover = { slug: brush, r: r, c: c, w: 1, h: 1, ok: brush !== CLEAR };
      syncStrip(); invalidate();
    }

    function tap(r, c) {
      if (ground || (cardId != null && !model.pieceAt(r, c))) { closeAll(); return; }
      if (pending) {
        if (model.inside(r, c)) { var d = def(pending.slug), a = model.anchorFor(d.w, d.h, r, c, -1); pending.r = a ? a.r : r - Math.floor(d.h / 2); pending.c = a ? a.c : c - Math.floor(d.w / 2); pending.ok = !!a; invalidate(); }
        return;
      }
      if (brush) {
        if (paintable(brush)) {
          model.edit(function () { if (brush === CLEAR) clearCell(r, c); else model.paint(brush, r, c); });
        } else {
          var b = def(brush), at = model.anchorFor(b.w, b.h, r, c, -1);
          if (!at) { say('No room for ' + b.name + ' here'); return; }
          model.edit(function () { model.place(brush, at.r, at.c); });
        }
        committed(); return;
      }
      var hit = model.pieceAt(r, c);
      if (hit) openCard(hit.id);
      else if (model.inside(r, c)) openGround(r, c);
      else closeAll();
    }

    canvas.addEventListener('pointerdown', function (e) {
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      var at = local(e);
      pts.set(e.pointerId, { x: at[0], y: at[1] });
      clearTimeout(pressTimer);
      if (pts.size === 2) {
        if (g && g.type === 'stroke') { model.cancel(); syncStrip(); }
        if (g && g.type === 'lift') { lifted = null; hint.hidden = true; syncStrip(); }
        var v = Array.from(pts.values());
        g = { type: 'pinch', d0: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), s0: cam.s, w0: toWorld((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2) };
        hover = null; invalidate();
        return;
      }
      if (pts.size > 2) return;
      var cell = cellAt(at[0], at[1]), hit = model.pieceAt(cell[0], cell[1]);
      g = { type: 'down', x: at[0], y: at[1], cam: { x: cam.x, y: cam.y }, r: cell[0], c: cell[1], slop: e.pointerType === 'mouse' ? SLOP_MOUSE : SLOP_TOUCH };
      if (inPending(cell[0], cell[1])) g.nudge = { r: pending.r - cell[0], c: pending.c - cell[1] };
      else if (hit && hit.slug !== FOUNTAIN && !brush && !pending) pressTimer = setTimeout(function () { if (g && g.type === 'down') { g.type = 'lift'; liftAt(hit.id); } }, LONG_PRESS);
    });

    canvas.addEventListener('pointermove', function (e) {
      var at = local(e), pt = pts.get(e.pointerId);
      if (!pt) {
        // A mouse hovering with a brush shows where it would land.
        if (e.pointerType === 'mouse' && brush) {
          var hc = cellAt(at[0], at[1]);
          if (paintable(brush)) hover = model.inside(hc[0], hc[1]) ? { slug: brush, r: hc[0], c: hc[1], w: 1, h: 1, ok: brush !== CLEAR } : null;
          else { var bd = def(brush), ha = model.anchorFor(bd.w, bd.h, hc[0], hc[1], -1); hover = { slug: brush, r: ha ? ha.r : hc[0] - Math.floor(bd.h / 2), c: ha ? ha.c : hc[1] - Math.floor(bd.w / 2), w: bd.w, h: bd.h, ok: !!ha }; }
          invalidate();
        }
        return;
      }
      pt.x = at[0]; pt.y = at[1];
      if (!g) return;
      if (g.type === 'pinch' && pts.size === 2) {
        var v = Array.from(pts.values());
        cam.s = clampScale(g.s0 * Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) / g.d0);
        cam.x = g.w0[0] - ((v[0].x + v[1].x) / 2 - vw / 2) / cam.s;
        cam.y = g.w0[1] - ((v[0].y + v[1].y) / 2 - vh / 2) / cam.s;
        invalidate(); return;
      }
      if (g.type === 'lift') { dragLifted(at[0], at[1], e.clientY); return; }
      if (g.type === 'down' && Math.hypot(at[0] - g.x, at[1] - g.y) > g.slop) {
        clearTimeout(pressTimer);
        if (g.nudge) g.type = 'nudge';
        else if (brush && paintable(brush)) { g.type = 'stroke'; model.begin(); g.last = null; strokeTo(g.r, g.c); }
        else g.type = 'pan';
      }
      var cell = cellAt(at[0], at[1]);
      if (g.type === 'pan') { cam.x = g.cam.x - (at[0] - g.x) / cam.s; cam.y = g.cam.y - (at[1] - g.y) / cam.s; invalidate(); }
      else if (g.type === 'stroke') strokeTo(cell[0], cell[1]);
      else if (g.type === 'nudge') {
        pending.r = cell[0] + g.nudge.r; pending.c = cell[1] + g.nudge.c;
        pending.ok = model.fits(pending.w, pending.h, pending.r, pending.c, -1);
        invalidate();
      }
    });

    function release(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      clearTimeout(pressTimer);
      if (!g) return;
      if (g.type === 'pinch') { g = pts.size ? { type: 'done' } : null; return; }
      if (e.type === 'pointercancel') {
        if (g.type === 'stroke') model.cancel();
        if (g.type === 'lift') { lifted = null; hint.hidden = true; }
        g = null; syncStrip(); invalidate(); return;
      }
      if (g.type === 'down') tap(g.r, g.c);
      else if (g.type === 'stroke') { model.end(); committed(); }
      else if (g.type === 'lift') dropLifted();
      g = null;
      if (e.pointerType !== 'mouse') { hover = null; invalidate(); }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !pts.size && hover) { hover = null; invalidate(); } });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); var at = local(e); zoomAt(at[0], at[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

    /* ─── Keyboard: a cell cursor on the focused board ──────── */
    canvas.addEventListener('keydown', function (e) {
      var k = e.key, moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey ? model.redo() : model.undo()) { closeAll(); committed(); } return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); if (model.redo()) { closeAll(); committed(); } return; }
      if (moves[k]) {
        e.preventDefault();
        if (!cursor) cursor = { r: 29, c: 29 };
        cursor.r = Math.max(0, Math.min(N - 1, cursor.r + moves[k][0]));
        cursor.c = Math.max(0, Math.min(N - 1, cursor.c + moves[k][1]));
        var s = toScreen(gx(cursor.r + 0.5, cursor.c + 0.5), gy(cursor.r + 0.5, cursor.c + 0.5));
        if (s[0] < 40 || s[0] > vw - 40 || s[1] < 60 || s[1] > vh - 100) { cam.x = gx(cursor.r + 0.5, cursor.c + 0.5); cam.y = gy(cursor.r + 0.5, cursor.c + 0.5); }
        var under = model.pieceAt(cursor.r, cursor.c);
        status.textContent = (cursor.c + 45) + ', ' + (cursor.r + 45) + (under ? ': ' + def(under.slug).name : '');
        invalidate(); return;
      }
      if (k === 'Enter' || k === ' ') { if (cursor) { e.preventDefault(); if (pending) accept(); else tap(cursor.r, cursor.c); } return; }
      if (k === 'Escape') { if (pending) reject(); else if (brush) unloadBrush(); else closeAll(); return; }
      if (k === '+' || k === '=') { zoomAt(vw / 2, vh / 2, 1.3); return; }
      if (k === '-') { zoomAt(vw / 2, vh / 2, 1 / 1.3); return; }
      var at = cursor && model.pieceAt(cursor.r, cursor.c);
      if ((k === 'Delete' || k === 'Backspace') && at && at.slug !== FOUNTAIN) { model.edit(function () { model.remove(at.id); }); closeAll(); committed(); say(def(at.slug).name + ' removed'); }
      if (k.toLowerCase() === 'r' && at) { if (!model.edit(function () { return model.turn(at.id); })) say('No room to turn it'); committed(); }
    });

    /* ─── Presets ───────────────────────────────────────────── */
    var examples = null;
    function loadExamples(then) {
      if (examples) { then(); return; }
      var s = document.createElement('script');
      s.src = root.dataset.examples;
      s.onload = function () { examples = window.ISLAND_EXAMPLES || []; then(); };
      document.body.appendChild(s);
    }
    function thumb(cv, ex) {
      var x = cv.getContext('2d'), w = cv.width / (N * 2 + 4), h = w / 2, ox = cv.width / 2, oy = (cv.height - N * 2 * h) / 2;
      function cell(r, c, col) { var px = ox + (c - r) * w, py = oy + (c + r) * h; x.fillStyle = col; x.beginPath(); x.moveTo(px, py); x.lineTo(px + w, py + h); x.lineTo(px, py + 2 * h); x.lineTo(px - w, py + h); x.fill(); }
      x.fillStyle = '#0C1A2B'; x.fillRect(0, 0, cv.width, cv.height);
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) cell(r, c, '#5D7A3C');
      ex.surfaces.forEach(function (e) { cell(Math.floor(e[0] / N), e[0] % N, def(e[1]).swatch); });
      ex.pieces.forEach(function (e) {
        var d = def(e[1]), r0 = Math.floor(e[0] / N), c0 = e[0] % N;
        for (var r = r0; r < r0 + d.h; r++) for (var c = c0; c < c0 + d.w; c++) cell(r, c, e[1] === 'build_7000' ? '#F1E3C2' : shade(d.swatch, d.kind === 'tree' ? 0.8 : 1));
      });
    }
    function renderPresets() {
      var list = examples.slice().sort(function (a, b) { return (b.authored ? 1 : 0) - (a.authored ? 1 : 0); });
      node('presets').innerHTML = list.map(function (ex) {
        return '<li><button type="button" class="island-preset" data-action="island.preset" data-slug="' + esc(ex.slug) + '"><canvas width="380" height="240" data-thumb="' + esc(ex.slug) + '"></canvas>'
          + '<span class="island-tag' + (ex.authored ? ' is-ours' : '') + '">' + (ex.authored ? 'Ours' : 'Game layout') + '</span><b>' + esc(ex.name) + '</b><small>' + esc(ex.note) + '</small></button></li>';
      }).join('');
      context.nodes('[data-thumb]').forEach(function (cv) { thumb(cv, examples.filter(function (e) { return e.slug === cv.dataset.thumb; })[0]); });
    }
    function openPreset(slug) {
      var ex = examples.filter(function (e) { return e.slug === slug; })[0];
      if (!ex) return;
      if (owner.mine) save();
      closeAll(); unloadBrush(); reject();
      owner = { mine: false, name: ex.name };
      model.load({ pieces: ex.pieces.map(function (e) { return [e[0], e[1], 0]; }), surfaces: ex.surfaces });
      syncOwner(); committed();
      fit(true);
      board.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' });
    }
    function syncOwner() {
      node('owner').innerHTML = owner.mine ? '<b>Your plan</b> · saved on this device'
        : '<b>' + esc(owner.name) + '</b> · a copy, not saved <button type="button" data-action="island.keep">Keep it</button> <button type="button" data-action="island.mine">Back to mine</button>';
    }
    function ownedNote() {
      var n = Object.keys(owns).filter(function (s) { return owns[s] > 0; }).length;
      node('ownedNote').textContent = store ? (n ? 'You have marked ' + n + ' kind' + (n === 1 ? '' : 's') + ' of piece as yours. It is kept with the rest of your save.' : 'Nothing marked yet.') : 'Your save cannot be read in this browser, so ownership is not kept.';
    }

    /* ─── Boot ──────────────────────────────────────────────── */
    if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(board); context.cleanup(function () { ro.disconnect(); }); }
    else context.listen(window, 'resize', resize);
    resize();
    syncOwner(); syncStrip(); ownedNote();
    if (store && store.subscribe) context.cleanup(store.subscribe(ownedNote));
    var later = window.requestIdleCallback || function (fn) { return setTimeout(fn, 400); };
    later(function () { loadExamples(renderPresets); });

    return {
      actions: {
        fit: { run: function () { fit(true); } },
        undo: { run: function () { if (model.undo()) { closeAll(); committed(); } } },
        pick: { run: function (b) { var at = ground; closeAll(); stage(b.dataset.slug, at.r, at.c); } },
        pathHere: { run: function (b) { var at = ground; loadBrush(b.dataset.slug); model.edit(function () { model.paint(brush, at.r, at.c); }); committed(); } },
        accept: { run: accept },
        reject: { run: reject },
        catalogue: { run: openSheet },
        closeSheet: { run: closeSheet },
        kind: { run: function (b) { sheetKind = b.dataset.kind; node('search').value = ''; context.nodes('[data-action="island.kind"]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); renderSheet(); } },
        search: { events: ['input'], run: renderSheet },
        load: { run: function (b) { loadBrush(b.dataset.slug); } },
        unload: { run: unloadBrush },
        closeCard: { run: closeCard },
        turn: { run: function () { var id = cardId; if (!model.edit(function () { return model.turn(id); })) say('No room to turn it here'); committed(); renderCard(); } },
        more: { run: function () { var p = model.pieces.get(cardId); if (p) loadBrush(p.slug); } },
        remove: { run: function () { var p = model.pieces.get(cardId); if (!p) return; model.edit(function () { model.remove(p.id); }); closeCard(); say(def(p.slug).name + ' removed · ↶ brings it back'); committed(); } },
        own: { run: function (b) {
          var p = model.pieces.get(cardId); if (!p || !store) return;
          var d = def(p.slug), now = owned(p.slug), next = Math.max(0, (now === null ? 0 : now) + Number(b.dataset.step));
          if (now === null && Number(b.dataset.step) > 0) next = 1;
          try { store.setBalance(ownKey(d), next, 'manual'); } catch (e) { say('Your save could not be updated'); }
          readOwns(); refreshOpen(); ownedNote();
        } },
        preset: { run: function (b) { loadExamples(function () { openPreset(b.dataset.slug); }); } },
        keep: { run: function () {
          if (!window.confirm('Replace your saved plan with this copy?')) return;
          owner = { mine: true }; save(); syncOwner(); say('Kept as your plan');
        } },
        mine: { run: function () { owner = { mine: true }; model.load(read(PLAN_KEY, { pieces: [[27 * N + 27, 'build_7000', 0]], surfaces: [] })); closeAll(); syncOwner(); committed(); fit(false); } }
      }
    };
  });
})();
