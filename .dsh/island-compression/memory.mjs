import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { FORMATS } from './structural.mjs';
import { COMPRESSORS } from './node-codec.mjs';
const results = [];
for (const layout of ['kingshot-8901', 'random-dual-layers']) {
  for (const format of [...FORMATS, 'production']) run(format, 'none', layout);
  for (const compressor of COMPRESSORS.filter(c => c !== 'none')) run('delta', compressor, layout);
}
function run(format, compressor, layout) {
  const r = spawnSync(process.execPath, ['--expose-gc', new URL('memory-worker.mjs', import.meta.url).pathname, format, compressor, layout], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(r.stderr); results.push(JSON.parse(r.stdout));
}
fs.writeFileSync(new URL('memory-results.json', import.meta.url), JSON.stringify({ measurement: 'Fresh Node process per candidate and fixture; peak RSS includes V8, corpus, encoder and decoder. RSS growth and retained heap deltas are descriptive, not exact allocations or Android memory predictions.', results }, null, 2) + '\n');
console.log(`Measured ${results.length} isolated memory cases`);
