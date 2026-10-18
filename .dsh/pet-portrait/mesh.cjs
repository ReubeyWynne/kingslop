// Bake a pet's model into the small mesh the live pen draws (js/pet-live.js).
//
//   npm i --no-save meshoptimizer@0.22.0
//   node .dsh/pet-portrait/mesh.cjs grizzly-bear path/to/model.stl
//
// Writes pets/models/<pet>.bin: the model welded, simplified to about 1,000
// triangles, framed the way shade.py frames it (centred, scaled to fit -1..1,
// snout towards +z) and quantised. Layout, little-endian:
//   uint32 vertices, uint32 indices, int16 x/y/z per vertex (padded to 4 bytes), uint16 indices.
const fs = require('node:fs');
const path = require('node:path');
const { MeshoptSimplifier } = require(require.resolve('meshoptimizer', { paths: [process.cwd(), __dirname] }));

const [pet, stl, target = '1000'] = process.argv.slice(2);
if (!pet || !stl) { console.error('usage: node .dsh/pet-portrait/mesh.cjs <pet> <model.stl> [triangles]'); process.exit(1); }

(async () => {
  await MeshoptSimplifier.ready;
  const buf = fs.readFileSync(stl), count = buf.readUInt32LE(80);
  const seen = new Map(), pos = [], idx = new Uint32Array(count * 3);
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const o = 84 + t * 50 + 12 + k * 12, v = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
    const key = v.map(x => x.toFixed(4)).join();
    let i = seen.get(key);
    if (i === undefined) { i = pos.length / 3; seen.set(key, i); pos.push(...v); }
    idx[t * 3 + k] = i;
  }
  // Frame from the whole model, before simplifying, so the live pen and the baked frames agree.
  const lo = [0, 1, 2].map(a => Math.min(...pos.filter((_, i) => i % 3 === a)));
  const hi = [0, 1, 2].map(a => Math.max(...pos.filter((_, i) => i % 3 === a)));
  const centre = lo.map((v, a) => (v + hi[a]) / 2), scale = 2 / Math.max(...hi.map((v, a) => v - lo[a]));
  const P = new Float32Array(pos);
  const [kept] = MeshoptSimplifier.simplify(idx, P, 3, Number(target) * 3, 0.05, ['LockBorder']);
  const remap = new Map(), q = [], ind = new Uint16Array(kept.length);
  for (let i = 0; i < kept.length; i++) {
    let j = remap.get(kept[i]);
    if (j === undefined) {
      j = remap.size; remap.set(kept[i], j);
      const [x, y, z] = [0, 1, 2].map(a => (P[kept[i] * 3 + a] - centre[a]) * scale);
      q.push(...[x, z, -y].map(v => Math.round(Math.max(-1, Math.min(1, v)) * 32767)));   // snout to +z, up to +y
    }
    ind[i] = j;
  }
  const head = Buffer.alloc(8); head.writeUInt32LE(remap.size, 0); head.writeUInt32LE(ind.length, 4);
  const verts = Buffer.from(new Int16Array(q).buffer), pad = Buffer.alloc((4 - verts.length % 4) % 4);
  const out = path.resolve(__dirname, '../../pets/models', pet + '.bin');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([head, verts, pad, Buffer.from(ind.buffer)]));
  console.log(`${pet}: ${ind.length / 3} triangles, ${remap.size} vertices, ${fs.statSync(out).size} bytes -> ${path.relative(process.cwd(), out)}`);
})();
