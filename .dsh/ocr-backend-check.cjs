const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ocr-worker.js', 'utf8').replace('import(PADDLE_ESM)', 'Promise.resolve(engineModule)');
async function check(query, throwGpu) {
  const backends = [], disposed = [], answers = [];
  const bitmap = () => ({ width: 320, height: 220, close() {} });
  const engineModule = { PaddleOCR: { create: async options => {
    const backend = options.ortOptions.backend; backends.push(backend);
    return { dispose: async () => disposed.push(backend), predict: async () => {
      if (backend === 'auto' && throwGpu) throw new Error('device GPU failure');
      return [{ items: backend === 'wasm' ? [{text:'+69'}, {text:'Lv. 2'}] : [] }];
    } };
  } } };
  const scope = { URL, Promise, engineModule, createImageBitmap: async () => bitmap(), self: { location: { href: 'https://dey.ci/js/ocr-worker.js' + query }, postMessage: out => answers.push(out) } };
  vm.runInNewContext(source, scope);
  async function ask(type) {
    const index = answers.length;
    scope.self.onmessage({ data: { id: index + 1, type, blob: {} } });
    while (answers.length === index) await new Promise(resolve => setImmediate(resolve));
    assert.equal(answers[index].ok, true);
    return answers[index];
  }
  const first = await ask('predict');
  if (query) {
    assert.deepEqual(backends, ['wasm']);
    assert.equal(first.items[0].text, '+69');
    await ask('predict');
    assert.deepEqual(backends, ['wasm']);
  } else if (throwGpu) {
    assert.deepEqual(backends, ['auto', 'wasm']);
    assert.deepEqual(disposed, ['auto']);
    assert.equal(first.items[0].text, '+69');
  } else {
    assert.equal(first.items.length, 0);
    await ask('useWasm');
    const second = await ask('predict');
    assert.equal(second.items[0].text, '+69');
    assert.deepEqual(backends, ['auto', 'wasm']);
    assert.deepEqual(disposed, ['auto']);
  }
}
(async () => {
  await check('?build=123&backend=wasm', false);
  await check('', false);
  await check('', true);
  console.log('Gear selects WASM before its first read; simulator automatic backend and silent/throwing GPU recovery remain intact.');
})().catch(error => { console.error(error); process.exitCode = 1; });
