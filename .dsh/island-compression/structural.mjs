import { arithmeticEncode, arithmeticDecode } from './arithmetic.mjs';
import { Writer, Reader, canonical, fail, MAX_BODY } from './core.mjs';
export const FORMATS = ['fixed', 'delta', 'groups-sparse', 'groups-rice', 'groups-rle', 'groups-bitmap', 'groups-quadtree', 'groups-rows', 'groups-geometry', 'groups-adaptive', 'grid-rle', 'grid-palette', 'grid-blocks', 'grid-rows', 'context-pairs', 'context-ranks', 'context-bitplanes'];
const width = n => n <= 1 ? 0 : Math.ceil(Math.log2(n));
const key = r => `${r[1]},${r[2]},${r[3]}`;
const groups = a => {
  const m = new Map();
  for (const r of a) { const k = key(r); if (!m.has(k)) m.set(k, { sym: r.slice(1), ps: [] }); m.get(k).ps.push(r[0]); }
  return [...m.values()].sort((a, b) => a.sym[0] - b.sym[0] || a.sym[1] - b.sym[1] || a.sym[2] - b.sym[2]);
};
function runs(ps) {
  const a = [];
  for (const p of ps) { const last = a.at(-1); if (last && last[0] + last[1] === p) last[1]++; else a.push([p, 1]); }
  return a;
}
function quad(w, set, x = 0, y = 0, size = 64) {
  let n = 0;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (x + dx < 60 && y + dy < 60 && set.has((y + dy) * 60 + x + dx)) n++;
  if (!n) { w.bit(0); return; }
  w.bit(1); if (n === size * size) { w.bit(0); return; }
  w.bit(1); const half = size / 2;
  for (const [dx, dy] of [[0, 0], [half, 0], [0, half], [half, half]]) quad(w, set, x + dx, y + dy, half);
}
function unquad(r, out, x = 0, y = 0, size = 64) {
  if (!r.bits(1)) return;
  if (!r.bits(1)) {
    if (x + size > 60 || y + size > 60) fail();
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push((y + dy) * 60 + x + dx);
    return;
  }
  if (size === 1) fail(); const half = size / 2;
  for (const [dx, dy] of [[0, 0], [half, 0], [0, half], [half, half]]) unquad(r, out, x + dx, y + dy, half);
}
function shapes(ps) {
  const set = new Set(ps), out = [];
  for (const p of ps) {
    if (!set.has(p)) continue;
    const x = p % 60, y = Math.floor(p / 60);
    let best = [0, p, 1, 1], saving = 0, maxw = 60 - x;
    for (let h = 1; y + h <= 60; h++) {
      let w = 0; while (w < maxw && set.has(p + (h - 1) * 60 + w)) w++;
      maxw = Math.min(maxw, w); if (!maxw) break;
      const score = maxw * h - 4;
      if (score > saving) { saving = score; best = [1, p, maxw, h]; }
    }
    for (const [dx, dy] of [[1, 1], [-1, 1]]) {
      let n = 1; while (x + dx * n >= 0 && x + dx * n < 60 && y + n < 60 && set.has(p + (60 + dx) * n)) n++;
      if (n - 3 > saving) { saving = n - 3; best = [dx === 1 ? 2 : 3, p, n, 1]; }
    }
    out.push(best);
    const [op, start, w, h] = best;
    if (op < 2) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set.delete(start + dy * 60 + dx);
    else for (let i = 0; i < w; i++) set.delete(start + i * (op === 2 ? 61 : 59));
  }
  return out;
}
function positionEncode(ps, method) {
  const w = new Writer();
  if (method === 0) { let prev = -1; for (const p of ps) { w.u(p - prev - 1); prev = p; } }
  if (method === 1) {
    let best;
    for (let k = 0; k <= 11; k++) {
      const t = new Writer(); t.bits(k, 4); let prev = -1;
      for (const p of ps) { const d = p - prev - 1; for (let q = d >>> k; q > 0; q--) t.bit(0); t.bit(1); t.bits(d & ((1 << k) - 1), k); prev = p; }
      const a = t.end(); if (!best || a.length < best.length) best = a;
    }
    return best;
  }
  if (method === 2) { let prev = -1; const a = runs(ps); w.u(a.length); for (const [p, n] of a) { w.u(p - prev - 1); w.u(n); prev = p + n - 1; } }
  if (method === 3) { const set = new Set(ps); for (let p = 0; p < 3600; p++) w.bit(+set.has(p)); }
  if (method === 4) quad(w, new Set(ps));
  if (method === 5) {
    const rows = Array.from({ length: 60 }, () => []); for (const p of ps) rows[Math.floor(p / 60)].push(p % 60);
    const dict = [...new Set(rows.map(a => a.join(',')))]; w.u(dict.length);
    for (const row of dict) { const xs = row ? row.split(',').map(Number) : []; w.u(xs.length); for (const x of xs) w.bits(x, 6); }
    for (const row of rows) w.bits(dict.indexOf(row.join(',')), width(dict.length));
  }
  if (method === 6) {
    const a = shapes(ps); w.u(a.length);
    for (const [op, p, x, y] of a) { w.bits(op, 2); w.bits(p, 12); if (op) w.bits(x - 1, 6); if (op === 1) w.bits(y - 1, 6); }
  }
  return w.end();
}
function positionDecode(bytes, method, n) {
  const r = new Reader(bytes), out = [];
  if (method === 0 || method === 1) {
    const k = method === 1 ? r.bits(4) : 0; if (k > 11) fail(); let prev = -1;
    for (let i = 0; i < n; i++) {
      let d; if (!method) d = r.u(3599); else { let q = 0; while (!r.bits(1)) if (++q > 3599) fail(); d = q * 2 ** k + r.bits(k); }
      prev += d + 1; if (prev >= 3600) fail(); out.push(prev);
    }
  }
  if (method === 2) { const count = r.u(3600); let prev = -1; for (let i = 0; i < count; i++) { const p = prev + 1 + r.u(3599), len = r.u(3600); if (!len || p + len > 3600 || out.length + len > n) fail(); for (let j = 0; j < len; j++) out.push(p + j); prev = p + len - 1; } }
  if (method === 3) for (let p = 0; p < 3600; p++) if (r.bits(1)) out.push(p);
  if (method === 4) unquad(r, out);
  if (method === 5) {
    const d = r.u(60); if (!d) fail(); const dict = [];
    for (let i = 0; i < d; i++) { const len = r.u(60), a = []; for (let j = 0; j < len; j++) { const x = r.bits(6); if (x >= 60 || (j && x <= a[j - 1])) fail(); a.push(x); } dict.push(a); }
    for (let y = 0; y < 60; y++) { const index = r.bits(width(d)); if (index >= d) fail(); for (const x of dict[index]) out.push(y * 60 + x); }
  }
  if (method === 6) {
    const count = r.u(3600);
    for (let i = 0; i < count; i++) {
      const op = r.bits(2), p = r.bits(12), x = p % 60, y = Math.floor(p / 60), w = op ? r.bits(6) + 1 : 1, h = op === 1 ? r.bits(6) + 1 : 1;
      if (p >= 3600 || w > 60 || h > 60) fail();
      if (op < 2) { if (x + w > 60 || y + h > 60 || out.length + w * h > n) fail(); for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(p + dy * 60 + dx); }
      else { if (y + w > 60 || (op === 2 ? x + w > 60 : x - w + 1 < 0) || out.length + w > n) fail(); for (let j = 0; j < w; j++) out.push(p + j * (op === 2 ? 61 : 59)); }
    }
  }
  if (method > 6 || out.length !== n || new Set(out).size !== n) fail(); r.end(); return out.sort((a, b) => a - b);
}
function symmetry(ps, flags) {
  const transform = p => { const x = p % 60, y = Math.floor(p / 60); return (flags & 2 ? Math.min(y, 59 - y) : y) * 60 + (flags & 1 ? Math.min(x, 59 - x) : x); };
  const representatives = [...new Set(ps.map(transform))].sort((a, b) => a - b);
  const full = expandSymmetry(representatives, flags);
  return full.length === ps.length && full.every((p, i) => p === ps[i]) ? representatives : null;
}
function expandSymmetry(ps, flags) {
  const set = new Set(); for (const p of ps) { const x = p % 60, y = Math.floor(p / 60); for (const xx of flags & 1 ? [x, 59 - x] : [x]) for (const yy of flags & 2 ? [y, 59 - y] : [y]) set.add(yy * 60 + xx); }
  return [...set].sort((a, b) => a - b);
}
function packGroup(ps, method) {
  let best;
  for (let flags = 0; flags < (method === 7 ? 4 : 1); flags++) {
    const points = flags ? symmetry(ps, flags) : ps; if (!points) continue;
    for (const m of method === 7 ? [0, 1, 2, 3, 4, 5, 6] : [method]) {
      const a = positionEncode(points, m), w = new Writer(); w.u(m | (flags << 3)); w.u(points.length); w.u(a.length); w.bytes(a); const b = w.end();
      if (!best || b.length < best.length) best = b;
    }
  }
  return best;
}
function flagsFor(a) { return (a.some(r => r[2]) ? 1 : 0) | (a.some(r => r[3]) ? 2 : 0); }
function writeSym(w, sym, flags) { w.u(sym[0]); if (flags & 1) w.bits(sym[1], 2); if (flags & 2) w.u(sym[2]); }
function readSym(r, flags) { return [r.u(), flags & 1 ? r.bits(2) : 0, flags & 2 ? r.u() : 0]; }
function grid(a) { const gs = groups(a), palette = gs.map(g => g.sym), m = new Map(palette.map((s, i) => [s.join(','), i + 1])); const cells = new Array(3600).fill(0); for (const r of a) cells[r[0]] = m.get(key(r)); return { palette, cells }; }
function writeGrid(w, a, f, flags) {
  const { palette, cells } = grid(a); w.u(palette.length); for (const sym of palette) writeSym(w, sym, flags); const bits = width(palette.length + 1);
  if (f === 10) {
    const rs = []; for (const v of cells) { if (rs.at(-1)?.[0] === v) rs.at(-1)[1]++; else rs.push([v, 1]); }
    w.u(rs.length); for (const [v, n] of rs) { w.bits(v, bits); w.u(n); }
  }
  if (f === 11) for (const v of cells) w.bits(v, bits);
  if (f === 12) for (let by = 0; by < 60; by += 10) for (let bx = 0; bx < 60; bx += 10) {
    const c = []; for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) c.push(cells[(by + y) * 60 + bx + x]);
    const p = [...new Set(c)].sort((a, b) => a - b); w.u(p.length); for (const v of p) w.bits(v, bits); for (const v of c) w.bits(p.indexOf(v), width(p.length));
  }
  if (f >= 14) {
    if (palette.length > 63) { w.u(0); for (const v of cells) w.bits(v, bits); }
    else { const encoded = arithmeticEncode(cells, palette.length + 1, f - 14); w.u(encoded.length); w.bytes(encoded); }
  }
  if (f === 13) {
    const rows = Array.from({ length: 60 }, (_, y) => cells.slice(y * 60, y * 60 + 60)); const dict = [...new Set(rows.map(a => a.join(',')))];
    w.u(dict.length); for (const s of dict) for (const v of s.split(',').map(Number)) w.bits(v, bits); for (const row of rows) w.bits(dict.indexOf(row.join(',')), width(dict.length));
  }
}
function readGrid(r, f, flags) {
  const n = r.u(3600), palette = Array.from({ length: n }, () => readSym(r, flags)), bits = width(n + 1), cells = [];
  const symbol = () => { const v = r.bits(bits); if (v > n) fail(); return v; };
  if (f === 10) { const count = r.u(3600); for (let i = 0; i < count; i++) { const v = symbol(), len = r.u(3600); if (!len || cells.length + len > 3600) fail(); for (let j = 0; j < len; j++) cells.push(v); } }
  if (f === 11) for (let i = 0; i < 3600; i++) cells.push(symbol());
  if (f === 12) {
    cells.length = 3600;
    for (let by = 0; by < 60; by += 10) for (let bx = 0; bx < 60; bx += 10) {
      const len = r.u(100); if (!len) fail(); const p = Array.from({ length: len }, symbol);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const index = r.bits(width(len)); if (index >= len) fail(); cells[(by + y) * 60 + bx + x] = p[index]; }
    }
  }
  if (f === 13) {
    const len = r.u(60); if (!len) fail(); const rows = Array.from({ length: len }, () => Array.from({ length: 60 }, symbol));
    for (let y = 0; y < 60; y++) { const index = r.bits(width(len)); if (index >= len) fail(); cells.push(...rows[index]); }
  }
  if (f >= 14) { const len = r.u(20000); if (!len) for (let i = 0; i < 3600; i++) cells.push(symbol()); else { if (n > 63) fail(); cells.push(...arithmeticDecode(r.bytes(len), n + 1, f - 14)); } }
  if (cells.length !== 3600) fail(); return cells.flatMap((v, p) => v ? [[p, ...palette[v - 1]]] : []);
}
export function encodeStructural(layout, format = 'groups-adaptive') {
  const l = canonical(layout), f = FORMATS.indexOf(format); if (f < 0) fail(); const w = new Writer(); w.u(f); w.u(l.board);
  for (const a of [l.pieces, l.surfaces]) {
    const flags = flagsFor(a); w.u(flags);
    if (f < 2) {
      w.u(a.length); let prev = -1;
      for (const r of a) {
        if (!f) { w.bits(r[0], 12); w.bits(Math.min(r[1], 127), 7); if (r[1] >= 127) w.u(r[1]); if (flags & 1) w.bits(r[2], 2); if (flags & 2) w.u(r[3]); }
        else { w.u(r[0] - prev - 1); writeSym(w, r.slice(1), flags); } prev = r[0];
      }
    } else if (f < 10) {
      const gs = groups(a); w.u(gs.length);
      for (const g of gs) { writeSym(w, g.sym, flags); w.bytes(packGroup(g.ps, f - 2)); }
    } else writeGrid(w, a, f, flags);
  }
  return w.end();
}
export function decodeStructural(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BODY) fail(); const r = new Reader(bytes), f = r.u(16), board = r.u(255), layers = [];
  for (let layer = 0; layer < 2; layer++) {
    const flags = r.u(3), a = [];
    if (f < 2) {
      const n = r.u(3600); let prev = -1;
      for (let i = 0; i < n; i++) {
        const p = f ? prev + 1 + r.u(3599) : r.bits(12); let sym;
        if (!f) { let id = r.bits(7); if (id === 127) { id = r.u(); if (id < 127) fail(); } sym = [id, flags & 1 ? r.bits(2) : 0, flags & 2 ? r.u() : 0]; } else sym = readSym(r, flags);
        a.push([p, ...sym]); prev = p;
      }
    } else if (f < 10) {
      const count = r.u(3600);
      for (let i = 0; i < count; i++) {
        const sym = readSym(r, flags), code = r.u(31), n = r.u(3600), len = r.u(MAX_BODY); if (!n || (code & 7) > 6) fail();
        const ps = expandSymmetry(positionDecode(r.bytes(len), code & 7, n), code >> 3); if (a.length + ps.length > 3600) fail(); for (const p of ps) a.push([p, ...sym]);
      }
    } else a.push(...readGrid(r, f, flags));
    layers.push(a);
  }
  r.end(); return canonical({ board, pieces: layers[0], surfaces: layers[1] });
}
export function encodeHybrid(layout) {
  const modes = ['delta', 'groups-adaptive', 'grid-rle', 'grid-blocks', 'grid-rows', 'context-pairs', 'context-ranks', 'context-bitplanes']; let best;
  for (const mode of modes) { const body = encodeStructural(layout, mode); if (!best || body.length < best.length) best = body; }
  return best;
}
export function groupDiagnostics(layout) {
  return ['pieces', 'surfaces'].flatMap(layer => groups(canonical(layout)[layer]).map(g => {
    const bytes = packGroup(g.ps, 7), r = new Reader(bytes), code = r.u(31), representatives = r.u(3600), size = r.u(MAX_BODY);
    const xs = g.ps.map(p => p % 60), ys = g.ps.map(p => Math.floor(p / 60));
    return { layer, symbol: g.sym, count: g.ps.length, bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], horizontalRuns: runs(g.ps).length, method: ['sparse', 'rice', 'rle', 'bitmap', 'quadtree', 'rows', 'geometry'][code & 7], mirrorFlags: code >> 3, representatives, positionBytes: size, framedBytes: bytes.length };
  }));
}
