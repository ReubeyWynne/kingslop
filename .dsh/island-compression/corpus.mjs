import fs from 'node:fs';
import crypto from 'node:crypto';
import { canonical } from './core.mjs';
const dir = new URL('.', import.meta.url);
export const catalogue = JSON.parse(fs.readFileSync(new URL('catalogue-v1.json', dir)));
const id = s => { const n = catalogue.indexOf(s); if (n < 0) throw new Error(s); return n; };
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function make(name, split, build) {
  const maps = [new Map(), new Map()], random = rng(0x750013 + [...name].reduce((s, c) => s * 31 + c.charCodeAt(0) | 0, 0));
  const put = (layer, x, y, slug, d = 0, v = 0) => { if (x >= 0 && x < 60 && y >= 0 && y < 60) maps[layer].set(y * 60 + x, [y * 60 + x, typeof slug === 'number' ? slug : id(slug), d, v]); };
  build(put, random);
  return { name, split, layout: canonical({ board: 0, pieces: [...maps[0].values()], surfaces: [...maps[1].values()] }) };
}
export function synthetics() {
  return [
    make('empty', 'development', () => {}),
    make('sparse-25', 'development', (p, r) => { for (let i = 0; i < 25; i++) p(0, Math.floor(r() * 60), Math.floor(r() * 60), i % 12, Math.floor(r() * 4)); }),
    make('independent-100', 'development', (p, r) => { for (let y = 0; y < 60; y += 6) for (let x = 0; x < 60; x += 6) p(0, x, y, Math.floor(r() * 104), Math.floor(r() * 4), Math.floor(r() * 3)); }),
    make('dense-decorations', 'development', p => { for (let y = 2; y < 58; y++) for (let x = 2; x < 58; x++) if ((x + y) % 3) p(0, x, y, ['tree_fir', 'tree_bush', 'purple_fantasy'][(x + 2 * y) % 3]); }),
    make('paths-grid', 'development', p => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (x % 6 < 2 || y % 9 === 0) p(1, x, y, 'garden_path'); }),
    make('borders-diagonals', 'development', p => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) { if (x === y || x + y === 59) p(1, x, y, 'paved_road'); else if ([3, 56].includes(x) || [3, 56].includes(y)) p(1, x, y, 'pond'); } }),
    make('symmetric-garden', 'development', p => { for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if ((x * 3 + y * 5) % 7 < 2) for (const xx of [x, 59 - x]) for (const yy of [y, 59 - y]) p(0, xx, yy, 'tree_round'); }),
    make('repeated-rows', 'development', p => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) p(1, x, y, ['pond', 'meadow', 'paved_road'][(x % 7 + y % 4) % 3]); }),
    make('random-binary-surface', 'development', (p, r) => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (r() < 0.5) p(1, x, y, 'garden_path'); }),
    make('random-six-surfaces', 'development', (p, r) => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) p(1, x, y, ['pond', 'meadow', 'paved_road', 'garden_path', 'whispering_path', 'gravel_road'][Math.floor(r() * 6)]); }),
    make('random-dual-layers', 'development', (p, r) => { for (let l = 0; l < 2; l++) for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) p(l, x, y, Math.floor(r() * 104), Math.floor(r() * 4), Math.floor(r() * 8)); }),
    make('heldout-meandering-paths', 'held-out', (p, r) => { for (let j = 0; j < 7; j++) { let x = Math.floor(r() * 60), y = Math.floor(r() * 60); for (let i = 0; i < 220; i++) { p(1, x, y, j % 2 ? 'paved_road' : 'garden_path'); const d = Math.floor(r() * 4); x = Math.max(0, Math.min(59, x + (d === 0 ? 1 : d === 1 ? -1 : 0))); y = Math.max(0, Math.min(59, y + (d === 2 ? 1 : d === 3 ? -1 : 0))); } } }),
    make('heldout-offset-motifs', 'held-out', p => { for (let by = 1; by < 55; by += 7) for (let bx = 2; bx < 55; bx += 8) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (x === 0 || y === 0 || x === 4 || y === 4) p(0, bx + x, by + y, 'lush_elegy', (bx + by) % 4, by % 2); }),
    make('heldout-irregular-districts', 'held-out', (p, r) => { for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) { const zone = Math.floor((x + y * 0.23) / 13); if (r() < 0.85) p(1, x, y, ['pond', 'meadow', 'garden_path'][zone % 3]); if (r() < 0.08) p(0, x, y, 'tree_fir', Math.floor(r() * 4)); } }),
    make('heldout-rotated-variants', 'held-out', p => { for (let y = 0; y < 25; y += 3) for (let x = 0; x < 25; x += 3) for (const [xx, yy, d] of [[x, y, 0], [59 - x, y, 1], [x, 59 - y, 2], [59 - x, 59 - y, 3]]) p(0, xx, yy, 'streetlight', d, (x + y) % 5); }),
  ];
}
export function sourceLayouts() {
  const path = new URL('../../docs/research/islands/data/source-game-layouts.json', dir), raw = fs.readFileSync(path);
  const fixtures = JSON.parse(raw).map(t => {
    if (t.grid_width !== 60 || t.grid_height !== 60 || t.cells_rle !== 'rle:3600x255' || t.island_template_roles.length) throw new Error('Revisit source adapter');
    const layer = key => Object.entries(t[key]).map(([p, s]) => [Number(p), id(s), t.default_directions[p] ?? 0, 0]);
    const used = new Set([...Object.keys(t.default_pieces), ...Object.keys(t.default_surfaces)]);
    if (Object.keys(t.default_directions).some(p => !used.has(p))) throw new Error('Unattached source orientation');
    return { name: t.slug, split: 'recovered', layout: canonical({ board: 0, pieces: layer('default_pieces'), surfaces: layer('default_surfaces') }) };
  });
  return { fixtures, sourceSha256: crypto.createHash('sha256').update(raw).digest('hex') };
}
export function corpus() { return [...sourceLayouts().fixtures, ...synthetics()]; }
