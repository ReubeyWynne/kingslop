/* island-board.mjs — the Island page's board: one canvas that draws the plan, its camera, and the
   gestures and keys that act on it. It is the widget js/pages/island.mjs drives: it reads what is
   picked, staged or lifted from the page's state (`ui`), calls back into it for what a tap or a key
   means, and places the floating controls (the ground card, the ✓/✕ box, the quick remove) against
   the piece or cell they belong to. Everything you read or press besides the canvas is markup. */
var DATA = globalThis.ISLAND_DATA, N = DATA.size, TW = 32, TH = 16;
var CLEAR = '__clear', FOUNTAIN = 'build_7000';
var LONG_PRESS = 420, SLOP_TOUCH = 9, SLOP_MOUSE = 4;
// Bare ground is beach sand; grass is only ever painted meadow.
var SAND = '#DCC38C', WET_SAND = '#C4A770', SEA = '#0D4E86', SEA_MID = '#1772B0', SHALLOWS = '#2FA4CF', LAGOON = '#55CBDA';
function shade(hex, k) {
  var n = parseInt(hex.slice(1), 16);
  function f(v) { return Math.max(0, Math.min(255, Math.round(v * k))); }
  return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}

// A preset's or a saved plan's small picture, for the carousel and the preset list.
export function thumb(cv, ex, def) {
  var x = cv.getContext("2d"), w = cv.width / (N * 2 + 16), h = w / 2, ox = cv.width / 2, oy = (cv.height - N * 2 * h) / 2;
  function cell(r, c, col) { var px = ox + (c - r) * w, py = oy + (c + r) * h; x.fillStyle = col; x.beginPath(); x.moveTo(px, py); x.lineTo(px + w, py + h); x.lineTo(px, py + 2 * h); x.lineTo(px - w, py + h); x.fill(); }
  function diamond(m, col) { x.fillStyle = col; x.beginPath(); x.moveTo(ox + 0 * w, oy - 2 * m * h); x.lineTo(ox + (N + 2 * m) * w, oy + N * h); x.lineTo(ox, oy + (2 * N + 2 * m) * h); x.lineTo(ox - (N + 2 * m) * w, oy + N * h); x.fill(); }
  x.fillStyle = SEA_MID; x.fillRect(0, 0, cv.width, cv.height);
  diamond(6, LAGOON); diamond(3, SAND);
  (ex.surfaces || []).forEach(function (e) { if (!def(e[1])) return; cell(Math.floor(e[0] / N), e[0] % N, def(e[1]).swatch); });
  (ex.pieces || []).forEach(function (e) {
    var d = def(e[1]); if (!d) return;
    var r0 = Math.floor(e[0] / N), c0 = e[0] % N;
    for (var r = r0; r < r0 + d.h; r++) for (var c = c0; c < c0 + d.w; c++) cell(r, c, e[1] === 'build_7000' ? '#F1E3C2' : shade(d.swatch, d.kind === 'tree' ? 0.8 : 1));
  });
}

// The presets file is large and only needed once someone looks at presets.
export function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.body.appendChild(s);
  });
}

/* board: the .island-board element; canvas: its canvas; ui: the page's state; model: the plan
   (js/island-model.mjs); artBase: where piece art lives; parts: the floating controls by name. */
export function islandBoard(board, canvas, ui, model, artBase, parts) {
  var def = model.def;
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
    }    var ctx = canvas.getContext('2d');
    var cam = { x: 0, y: N * TH / 2, s: 1 }, vw = 0, vh = 0, dpr = 1, queued = false;
    var cursor = null;
    var deck = parts.deck;

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
      // With the preset carousel open, fit the island into the space above it.
      var below = deck && !deck.hidden ? deck.offsetHeight + 8 : 0;
      var w = vw / (N * TW * 1.3), h = (vh - 80 - below) / (N * TH * 1.4); // the plot and the beach round it
      cam.s = whole || vw >= vh ? Math.min(w, h) : Math.min(h, w * 3);
      cam.x = 0; cam.y = N * TH / 2 + below / 2 / cam.s;
      invalidate();
    }
    function zoomAt(sx, sy, k) {
      var w = toWorld(sx, sy);
      cam.s = clampScale(cam.s * k);
      cam.x = w[0] - (sx - vw / 2) / cam.s; cam.y = w[1] - (sy - vh / 2) / cam.s;
      invalidate();
    }
    // Redraws are batched per task, not per frame: the site keeps scripts free of frame loops.
    function look(p) { cam.x = gx(p.r + p.h / 2, p.c + p.w / 2); cam.y = gy(p.r + p.h / 2, p.c + p.w / 2); cam.s = Math.max(cam.s, 1); invalidate(); }
    function invalidate() { if (!queued) { queued = true; queueMicrotask(draw); } }

    function draw() {
      queued = false;
      if (!vw) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = SEA;
      ctx.fillRect(0, 0, vw, vh);
      ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (vw / 2 - cam.x * cam.s), dpr * (vh / 2 - cam.y * cam.s));
      drawSea();

      var tl = toWorld(-TW * cam.s, -TH * 8 * cam.s), br = toWorld(vw + TW * cam.s, vh + TH * 2 * cam.s);
      function visible(r, c) { var x = gx(r, c + 0.5), y = gy(r, c + 0.5); return x > tl[0] - TW && x < br[0] + TW && y > tl[1] - TH * 8 && y < br[1] + TH; }

      model.surfaces.forEach(function (slug, idx) {
        var r = Math.floor(idx / N), c = idx % N;
        if (!visible(r, c)) return;
        ctx.fillStyle = def(slug).swatch;
        poly(corners(r, c)); ctx.fill();
      });

      // Grid lines while something is being placed or the view is close.
      if (cam.s > 1.3 || ui.brush || ui.pending || ui.lifted) {
        ctx.strokeStyle = 'rgba(10,16,24,0.18)'; ctx.lineWidth = 1 / cam.s;
        ctx.beginPath();
        for (var i = 0; i <= N; i++) {
          ctx.moveTo(gx(i, 0), gy(i, 0)); ctx.lineTo(gx(i, N), gy(i, N));
          ctx.moveTo(gx(0, i), gy(0, i)); ctx.lineTo(gx(N, i), gy(N, i));
        }
        ctx.stroke();
      }

      drawShore(false);
      var list = Array.from(model.pieces.values()).sort(function (a, b) { return (a.r + a.h + a.c + a.w) - (b.r + b.h + b.c + b.w) || a.c - b.c; });
      list.forEach(function (p) {
        if (!visible(p.r + p.h - 1, p.c + p.w - 1) && !visible(p.r, p.c)) return;
        drawPiece(p, ui.lifted && ui.lifted.id === p.id ? 0.25 : 1);
      });

      drawShore(true);
      if (ui.cardId != null && model.pieces.has(ui.cardId)) {
        var sp = model.pieces.get(ui.cardId);
        outline(sp.r, sp.c, sp.h, sp.w, 'rgba(125,189,240,0.22)', '#7DBDF0');
        drawPiece(sp, 1); // over its neighbours, so a selected piece is never hidden
      }
      if (ui.ground) outline(ui.ground.r, ui.ground.c, 1, 1, 'rgba(125,189,240,0.3)', '#7DBDF0');
      if (ui.pending) ghost(ui.pending.slug, ui.pending.r, ui.pending.c, ui.pending.w, ui.pending.h, ui.pending.ok);
      if (ui.lifted) { var lp = model.pieces.get(ui.lifted.id); ghost(lp.slug, ui.lifted.r, ui.lifted.c, lp.w, lp.h, ui.lifted.ok && !ui.lifted.overDrop); }
      if (hover) ghost(hover.slug, hover.r, hover.c, hover.w, hover.h, hover.ok);
      if (cursor) outline(cursor.r, cursor.c, 1, 1, null, '#F1E3C2');
      place();
    }
    /* ─── The island round the plot ─────────────────────────────
       The 60×60 plot sits inside a larger beach, as it does in the game. Nothing outside the plot
       can be built on, so the coast, palms, rocks, islets and jetty are scenery: a fixed,
       seeded drawing, the same on every visit. */
    var shore = (function () {
      var seed = 7;
      function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
      var mid = N / 2;
      // How far the beach reaches past the plot, by direction: wide bays and points, a little ripple.
      function reach(t) { return 8.5 + 3.2 * Math.sin(2 * t + 0.9) + 2.1 * Math.sin(3 * t + 2.4) + 1.1 * Math.sin(5 * t + 0.3) + 0.5 * Math.sin(11 * t + 1.7); }
      // A rounded square (p = 5) wrapping the plot, pushed out by reach() and then by `out` more.
      function ring(out) {
        var pts = [];
        for (var i = 0; i < 240; i++) {
          var t = i / 240 * Math.PI * 2, dr = Math.sin(t), dc = Math.cos(t);
          var k = Math.pow(Math.pow(Math.abs(dr), 5) + Math.pow(Math.abs(dc), 5), -1 / 5);
          var rad = mid * k + reach(t) + out;
          var r = mid + dr * rad, c = mid + dc * rad;
          pts.push([gx(r, c), gy(r, c)]);
        }
        return pts;
      }
      function onBeach(r, c, pad) {
        var t = Math.atan2(r - mid, c - mid), dr = Math.sin(t), dc = Math.cos(t);
        var k = Math.pow(Math.pow(Math.abs(dr), 5) + Math.pow(Math.abs(dc), 5), -1 / 5);
        var d = Math.hypot(r - mid, c - mid), coast = mid * k + reach(t);
        var outside = r < -1 || c < -1 || r > N + 1 || c > N + 1;
        return outside && d < coast - pad;
      }
      var things = [];
      for (var n = 0; n < 900 && things.length < 120; n++) {
        var r = -16 + rand() * (N + 32), c = -16 + rand() * (N + 32);
        if (!onBeach(r, c, 1.6)) continue;
        if (things.some(function (o) { return Math.hypot(o.r - r, o.c - c) < 2.2; })) continue;
        var roll = rand();
        things.push({ r: r, c: c, kind: roll < 0.68 ? 'palm' : roll < 0.9 ? 'rock' : 'shell', size: 0.8 + rand() * 0.5, lean: rand() * 2 - 1, turn: rand() * Math.PI * 2 });
      }
      things.sort(function (a, b) { return (a.r + a.c) - (b.r + b.c); });
      var islets = [[-24, -2, 3.4], [-6, 78, 2.6], [70, -14, 2.2], [84, 52, 1.6]].map(function (e) {
        var pts = [];
        for (var i = 0; i < 36; i++) {
          var t = i / 36 * Math.PI * 2, rad = e[2] * (1 + 0.18 * Math.sin(3 * t + e[0]) + 0.1 * Math.sin(5 * t + e[1]));
          pts.push([e[0] + Math.sin(t) * rad, e[1] + Math.cos(t) * rad]);
        }
        return { r: e[0], c: e[1], size: e[2], pts: pts };
      });
      return {
        sea: ring(30), mid: ring(16), shallows: ring(7), lagoon: ring(2.2), foam: ring(0.7), wet: ring(0), beach: ring(-1.1),
        front: things.filter(function (o) { return o.r > N || o.c > N; }),
        back: things.filter(function (o) { return !(o.r > N || o.c > N); }),
        islets: islets,
        jetty: (function () { var t = 1.75, k = Math.pow(Math.pow(Math.abs(Math.sin(t)), 5) + Math.pow(Math.abs(Math.cos(t)), 5), -1 / 5), rad = mid * k + reach(t); return { r: mid + Math.sin(t) * (rad - 2), c: mid + Math.cos(t) * (rad - 2) }; })()
      };
    })();

    function fillPts(pts, style) { ctx.fillStyle = style; poly(pts); ctx.fill(); }
    function drawSea() {
      fillPts(shore.sea, SEA_MID);
      fillPts(shore.mid, SHALLOWS);
      fillPts(shore.shallows, LAGOON);
      ctx.globalAlpha = 0.55; fillPts(shore.lagoon, '#9FE3E6'); ctx.globalAlpha = 1;
      fillPts(shore.foam, 'rgba(255,255,255,0.85)');
      fillPts(shore.wet, WET_SAND);
      fillPts(shore.beach, SAND);
      shore.islets.forEach(function (o) {
        var lift = function (k) { return o.pts.map(function (q) { var r = o.r + (q[0] - o.r) * k, c = o.c + (q[1] - o.c) * k; return [gx(r, c), gy(r, c)]; }); };
        ctx.globalAlpha = 0.6; fillPts(lift(1.9), '#9FE3E6'); ctx.globalAlpha = 1;
        fillPts(lift(1.15), 'rgba(255,255,255,0.8)');
        fillPts(lift(1), SAND);
        if (o.size > 2) {
          var top = lift(0.62).map(function (q) { return [q[0], q[1] - 7]; });
          fillPts(lift(0.62), '#8A6F4E'); fillPts(top, '#6FA63A');
        }
      });
      // The plot's edge: building stops here, the beach goes on.
      ctx.save();
      ctx.setLineDash([6 / cam.s, 5 / cam.s]);
      ctx.lineWidth = 1.5 / cam.s; ctx.strokeStyle = 'rgba(110,84,44,0.45)';
      poly(corners(0, 0, N, N)); ctx.stroke();
      ctx.restore();
      var j = shore.jetty;
      // A plank jetty running straight out to sea.
      for (var i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? '#8B6440' : '#9C7349';
        poly(corners(j.r + i * 0.7, j.c - 0.75, 0.62, 1.5)); ctx.fill();
      }
      ctx.fillStyle = '#5E4128';
      [0, 3, 6].forEach(function (i) { poly(corners(j.r + i * 0.7 + 0.2, j.c + 0.75, 0.25, 0.25)); ctx.fill(); });
    }
    function drawShore(front) {
      (front ? shore.front : shore.back).forEach(function (o) {
        var x = gx(o.r, o.c), y = gy(o.r, o.c), u = TW * o.size;
        if (o.kind === 'rock') {
          ctx.fillStyle = '#7D6E62';
          ctx.beginPath(); ctx.ellipse(x, y - u * 0.08, u * 0.36, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#9A8B7E';
          ctx.beginPath(); ctx.ellipse(x - u * 0.05, y - u * 0.15, u * 0.26, u * 0.13, 0, 0, Math.PI * 2); ctx.fill();
          return;
        }
        if (o.kind === 'shell') {
          ctx.fillStyle = o.lean > 0 ? '#E98A5B' : '#F2E6D2';
          ctx.beginPath(); ctx.ellipse(x, y, u * 0.09, u * 0.06, o.turn, 0, Math.PI * 2); ctx.fill();
          return;
        }
        // A palm: a shadow, a leaning trunk, and a crown of fronds.
        var h = u * 1.25, tx = x + o.lean * u * 0.3, ty = y - h;
        ctx.fillStyle = 'rgba(60,40,10,0.18)';
        ctx.beginPath(); ctx.ellipse(x + u * 0.3, y, u * 0.5, u * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7A5634'; ctx.lineWidth = u * 0.11; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + o.lean * u * 0.05, y - h * 0.55, tx, ty); ctx.stroke();
        for (var f = 0; f < 6; f++) {
          var a = o.turn + f * Math.PI / 3, fx = tx + Math.cos(a) * u * 0.55, fy = ty + Math.sin(a) * u * 0.28 + u * 0.12;
          ctx.fillStyle = f % 2 ? '#3E8A3A' : '#4FA444';
          ctx.beginPath(); ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo((tx + fx) / 2 - Math.sin(a) * u * 0.12, (ty + fy) / 2 - u * 0.22, fx, fy);
          ctx.quadraticCurveTo((tx + fx) / 2 + Math.sin(a) * u * 0.1, (ty + fy) / 2 - u * 0.02, tx, ty);
          ctx.fill();
        }
        ctx.fillStyle = '#5C3F22';
        ctx.beginPath(); ctx.arc(tx, ty + u * 0.02, u * 0.07, 0, Math.PI * 2); ctx.fill();
      });
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
    var pop = parts.pop, confirmBox = parts.confirm, quick = parts.quick;
    function place() {
      if (ui.ground && !pop.hidden) {
        var s = toScreen(gx(ui.ground.r + 0.5, ui.ground.c + 0.5), gy(ui.ground.r + 0.5, ui.ground.c + 0.5));
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var x = Math.max(8, Math.min(vw - pw - 8, s[0] - pw / 2)), below = s[1] - ph - 16 < 50;
        pop.style.left = x + 'px';
        pop.style.top = (below ? s[1] + 18 : s[1] - ph - 14) + 'px';
        pop.style.setProperty('--tip', Math.max(14, Math.min(pw - 14, s[0] - x)) + 'px');
        pop.toggleAttribute('data-below', below);
      }
      if (ui.cardId != null && !quick.hidden) {
        var q = model.pieces.get(ui.cardId);
        if (q) {
          // Beside the piece's right-hand corner, raised to clear its art.
          var rc = toScreen(gx(q.r, q.c + q.w), gy(q.r, q.c + q.w)), qs = quick.offsetWidth;
          quick.style.left = Math.max(8, Math.min(vw - qs - 8, rc[0] + 4)) + 'px';
          quick.style.top = Math.max(56, Math.min(vh - qs - 8, rc[1] - (q.w + q.h) * TW / 2 * cam.s * 0.6 - qs / 2)) + 'px';
        }
      }
      if (ui.pending && !confirmBox.hidden) {
        var e = toScreen(gx(ui.pending.r + ui.pending.h, ui.pending.c + ui.pending.w), gy(ui.pending.r + ui.pending.h, ui.pending.c + ui.pending.w));
        var cw = confirmBox.offsetWidth;
        confirmBox.style.left = Math.max(8, Math.min(vw - cw - 8, e[0] - cw / 2)) + 'px';
        confirmBox.style.top = Math.min(vh - 140, e[1] + 10) + 'px';
      }
    }
    var pts = new Map(), g = null, hover = null, pressTimer = 0;
    // A lifted piece follows the finger; over the strip's drop bar it will be removed.
    function dragLifted(x, y, clientY) {
      var l = ui.lifted, p = model.pieces.get(l.id), cell = cellAt(x, y);
      l.r = cell[0] - Math.floor(p.h / 2); l.c = cell[1] - Math.floor(p.w / 2);
      l.ok = model.fits(p.w, p.h, l.r, l.c, p.id);
      l.overDrop = clientY >= parts.drop.getBoundingClientRect().top - 12;
      invalidate();
    }
    function local(e) { var r = board.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function inPending(r, c) { return ui.pending && r >= ui.pending.r && r < ui.pending.r + ui.pending.h && c >= ui.pending.c && c < ui.pending.c + ui.pending.w; }


    function strokeTo(r, c) {
      var from = g.last || [r, c], n = Math.max(Math.abs(r - from[0]), Math.abs(c - from[1]), 1);
      for (var i = 0; i <= n; i++) {
        var rr = Math.round(from[0] + (r - from[0]) * i / n), cc = Math.round(from[1] + (c - from[1]) * i / n);
        if (ui.brush === CLEAR) ui.clearCell(rr, cc); else model.paint(ui.brush, rr, cc);
      }
      g.last = [r, c];
      if (ui.brush !== CLEAR && model.room(ui.brush) <= 0 && !g.told) { g.told = true; ui.noRoom(ui.brush); }
      hover = { slug: ui.brush, r: r, c: c, w: 1, h: 1, ok: ui.brush !== CLEAR && model.room(ui.brush) > 0 };
      ui.touched(); invalidate();
    }


    canvas.addEventListener('pointerdown', function (e) {
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      var at = local(e);
      pts.set(e.pointerId, { x: at[0], y: at[1] });
      clearTimeout(pressTimer);
      if (pts.size === 2) {
        if (g && g.type === 'stroke') { model.cancel(); ui.touched(); }
        if (g && g.type === 'lift') { ui.lifted = null; ui.hush(); ui.touched(); }
        var v = Array.from(pts.values());
        g = { type: 'pinch', d0: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), s0: cam.s, w0: toWorld((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2) };
        hover = null; invalidate();
        return;
      }
      if (pts.size > 2) return;
      var cell = cellAt(at[0], at[1]), hit = model.pieceAt(cell[0], cell[1]);
      g = { type: 'down', x: at[0], y: at[1], cam: { x: cam.x, y: cam.y }, r: cell[0], c: cell[1], slop: e.pointerType === 'mouse' ? SLOP_MOUSE : SLOP_TOUCH };
      if (inPending(cell[0], cell[1])) g.nudge = { r: ui.pending.r - cell[0], c: ui.pending.c - cell[1] };
      else if (hit && hit.slug !== FOUNTAIN && !ui.brush && !ui.pending) pressTimer = setTimeout(function () { if (g && g.type === 'down') { g.type = 'lift'; ui.liftAt(hit.id); } }, LONG_PRESS);
    });

    canvas.addEventListener('pointermove', function (e) {
      var at = local(e), pt = pts.get(e.pointerId);
      if (!pt) {
        // A mouse hovering with a ui.brush shows where it would land.
        if (e.pointerType === 'mouse' && ui.brush) {
          var hc = cellAt(at[0], at[1]);
          if (ui.paintable(ui.brush)) hover = model.inside(hc[0], hc[1]) ? { slug: ui.brush, r: hc[0], c: hc[1], w: 1, h: 1, ok: ui.brush !== CLEAR } : null;
          else { var bd = def(ui.brush), ha = model.anchorFor(bd.w, bd.h, hc[0], hc[1], -1); hover = { slug: ui.brush, r: ha ? ha.r : hc[0] - Math.floor(bd.h / 2), c: ha ? ha.c : hc[1] - Math.floor(bd.w / 2), w: bd.w, h: bd.h, ok: !!ha }; }
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
        else if (ui.brush && ui.paintable(ui.brush)) { g.type = 'stroke'; model.begin(); g.last = null; strokeTo(g.r, g.c); }
        else g.type = 'pan';
      }
      var cell = cellAt(at[0], at[1]);
      if (g.type === 'pan') { cam.x = g.cam.x - (at[0] - g.x) / cam.s; cam.y = g.cam.y - (at[1] - g.y) / cam.s; invalidate(); }
      else if (g.type === 'stroke') strokeTo(cell[0], cell[1]);
      else if (g.type === 'nudge') {
        ui.pending.r = cell[0] + g.nudge.r; ui.pending.c = cell[1] + g.nudge.c;
        ui.pending.ok = model.fits(ui.pending.w, ui.pending.h, ui.pending.r, ui.pending.c, -1);
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
        if (g.type === 'lift') { ui.lifted = null; ui.hush(); }
        g = null; ui.touched(); invalidate(); return;
      }
      if (g.type === 'down') ui.tap(g.r, g.c);
      else if (g.type === 'stroke') { model.end(); ui.committed(); }
      else if (g.type === 'lift') ui.dropLifted();
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
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey ? model.redo() : model.undo()) { ui.closeAll(); ui.committed(); } return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); if (model.redo()) { ui.closeAll(); ui.committed(); } return; }
      if (moves[k]) {
        e.preventDefault();
        if (!cursor) cursor = { r: 29, c: 29 };
        cursor.r = Math.max(0, Math.min(N - 1, cursor.r + moves[k][0]));
        cursor.c = Math.max(0, Math.min(N - 1, cursor.c + moves[k][1]));
        var s = toScreen(gx(cursor.r + 0.5, cursor.c + 0.5), gy(cursor.r + 0.5, cursor.c + 0.5));
        if (s[0] < 40 || s[0] > vw - 40 || s[1] < 60 || s[1] > vh - 100) { cam.x = gx(cursor.r + 0.5, cursor.c + 0.5); cam.y = gy(cursor.r + 0.5, cursor.c + 0.5); }
        var under = model.pieceAt(cursor.r, cursor.c);
        ui.status = (cursor.c + 45) + ', ' + (cursor.r + 45) + (under ? ': ' + def(under.slug).name : '');
        invalidate(); return;
      }
      if (k === 'Enter' || k === ' ') { if (cursor) { e.preventDefault(); if (ui.pending) ui.accept(); else ui.tap(cursor.r, cursor.c); } return; }
      if (k === 'Escape') { if (ui.deckOpen) ui.closeDeck(); else if (ui.pending) ui.reject(); else if (ui.brush) ui.unloadBrush(); else if (ui.ground || ui.cardId != null) ui.closeAll(); else if (ui.full) ui.setFull(false); return; }
      if (k === '+' || k === '=') { zoomAt(vw / 2, vh / 2, 1.3); return; }
      if (k === '-') { zoomAt(vw / 2, vh / 2, 1 / 1.3); return; }
      if ((k === 'Delete' || k === 'Backspace') && ui.cardId != null && !cursor) { e.preventDefault(); ui.removeSelected(); return; }
      var at = cursor && model.pieceAt(cursor.r, cursor.c);
      if ((k === 'Delete' || k === 'Backspace') && at && at.slug !== FOUNTAIN) { model.edit(function () { model.remove(at.id); }); ui.closeAll(); ui.committed(); ui.say(def(at.slug).name + ' removed'); }
      if (k.toLowerCase() === 'r' && at) { if (!model.edit(function () { return model.turn(at.id); })) ui.say('No room to turn it'); ui.committed(); }
    });


    if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(board); }
    else window.addEventListener('resize', resize);
    resize();

    return {
      invalidate: invalidate, fit: fit, resize: resize, look: look,
      // Puts down whatever a hovering mouse showed.
      forget: function () { hover = null; invalidate(); },
      destroy: function () { if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); }
    };
}
