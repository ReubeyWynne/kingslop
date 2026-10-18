// Bake a pet's model into the small mesh the live pen draws (js/pet-live.js).
// shade.py runs this for you; by hand:
//
//   npm i --no-save meshoptimizer@0.22.0
//   node .dsh/pet-portrait/mesh.cjs grizzly-bear path/to/model.stl '{"up":[0,0,1],"fwd":[0,-1,0],"tris":1000}'
//
// Writes pets/models/<pet>.bin: the model turned so it stands up +y and faces +z, scaled to
// fit -1..1 (as render.cjs frames it for shade.py), welded, simplified to about `tris`
// triangles and quantised. Layout, little-endian:
//   uint32 vertices, uint32 indices, int16 x/y/z per vertex (padded to 4 bytes), uint16 indices.
const fs = require('node:fs');
const path = require('node:path');
const { MeshoptSimplifier } = require(require.resolve('meshoptimizer', { paths: [process.cwd(), __dirname] }));

const [pet, stl, json = '{}'] = process.argv.slice(2);
if (!pet || !stl) { console.error('usage: node .dsh/pet-portrait/mesh.cjs <pet> <model.stl> [\'{"up":[0,0,1],"fwd":[0,-1,0],"tris":1000}\']'); process.exit(1); }
const opt = Object.assign({ up: [0, 0, 1], fwd: [0, -1, 0], tris: 1000 }, JSON.parse(json));

// The model's own up and forward become +y and +z.
const unit = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const up = unit(opt.up), f0 = opt.fwd.map((v, i) => v - up[i] * dot(opt.fwd, up)), fwd = unit(f0);
const right = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];

(async () => {
  await MeshoptSimplifier.ready;
  const buf = fs.readFileSync(stl), count = buf.readUInt32LE(80);
  const raw = new Float64Array(count * 9);
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const o = 84 + t * 50 + 12 + k * 12, v = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
    raw.set([dot(v, right), dot(v, up), dot(v, fwd)], t * 9 + k * 3);
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < raw.length; i++) { const a = i % 3; lo[a] = Math.min(lo[a], raw[i]); hi[a] = Math.max(hi[a], raw[i]); }
  const centre = lo.map((v, a) => (v + hi[a]) / 2), scale = 2 / Math.max(...hi.map((v, a) => v - lo[a]));
  // Weld on the fitted model, so the tolerance doesn't depend on the file's units.
  const seen = new Map(), pos = [], idx = new Uint32Array(count * 3);
  for (let c = 0; c < count * 3; c++) {
    const v = [0, 1, 2].map(a => (raw[c * 3 + a] - centre[a]) * scale), key = v.map(x => Math.round(x * 1e5)).join();
    let i = seen.get(key);
    if (i === undefined) { i = pos.length / 3; seen.set(key, i); pos.push(...v); }
    idx[c] = i;
  }
  const P = new Float32Array(pos);
  const [kept] = count > opt.tris ? MeshoptSimplifier.simplify(idx, P, 3, opt.tris * 3, 0.05, ['LockBorder']) : [idx];
  const remap = new Map(), q = [], ind = new Uint16Array(kept.length);
  for (let i = 0; i < kept.length; i++) {
    let j = remap.get(kept[i]);
    if (j === undefined) { j = remap.size; remap.set(kept[i], j); for (let a = 0; a < 3; a++) q.push(Math.round(Math.max(-1, Math.min(1, P[kept[i] * 3 + a])) * 32767)); }
    ind[i] = j;
  }
  const head = Buffer.alloc(8); head.writeUInt32LE(remap.size, 0); head.writeUInt32LE(ind.length, 4);
  const verts = Buffer.from(new Int16Array(q).buffer), pad = Buffer.alloc((4 - verts.length % 4) % 4);
  const out = path.resolve(__dirname, '../../pets/models', pet + '.bin');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([head, verts, pad, Buffer.from(ind.buffer)]));
  console.log(`${pet}: ${ind.length / 3} triangles, ${remap.size} vertices, ${fs.statSync(out).size} bytes`);
})();
