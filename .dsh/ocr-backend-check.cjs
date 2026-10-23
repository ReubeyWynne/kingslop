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
// The page-side client every reader shares: one worker, matched replies, the
// useful-or-retry-on-wasm rule, hang-breaking and the backend in the worker URL.
async function client() {
  const OcrClient = require('../js/ocr-client.js');
  const made = [];
  class FakeWorker {
    constructor(url) { this.url = url; this.wasm = false; this.closed = false; made.push(this); }
    postMessage(m) {
      if (this.silent) return;
      setImmediate(() => {
        if (m.type === 'useWasm') this.wasm = true;
        const preview = { closed: false, close() { this.closed = true; } };
        const items = m.type === 'predict' && (this.wasm || this.url.includes('backend=wasm')) ? [{ text: '12' }] : [];
        this.onmessage({ data: m.type === 'predict' ? { id: m.id, ok: true, items, preview } : { id: m.id, ok: true } });
      });
    }
    terminate() { this.closed = true; }
  }
  const base = 'https://dey.ci/js/ocr-client.js?v=9';
  const auto = OcrClient.create({ Worker: FakeWorker, base });
  const useful = res => res.items.length > 0;
  const res = await auto.read({}, { useful });
  assert.equal(res.items[0].text, '12', 'an empty GPU read retries on wasm');
  assert.equal(auto.backend, 'wasm');
  assert.equal(made.length, 1, 'one worker serves every read');
  assert.equal(new URL(made[0].url).searchParams.get('v'), '9', 'the worker keeps the cache-busting query');
  const wasm = OcrClient.create({ Worker: FakeWorker, base, backend: 'wasm' });
  assert.equal((await wasm.read({})).items[0].text, '12');
  assert.equal(new URL(made[1].url).searchParams.get('backend'), 'wasm');
  const stalled = OcrClient.create({ Worker: class extends FakeWorker { constructor(u) { super(u); this.silent = true; } }, base, timeout: 20 });
  await assert.rejects(stalled.read({}), /timed out/);
  assert.equal(made[2].closed, true, 'a stalled worker is terminated');
  const closing = OcrClient.create({ Worker: class extends FakeWorker { constructor(u) { super(u); this.silent = true; } }, base });
  const pending = closing.read({});
  closing.close();
  await assert.rejects(pending, /closed/);
}

// The worker fetches the models itself into Cache Storage: the first engine
// reports the download's progress, a later one finds them cached and says nothing.
async function models() {
  const store = new Map(), fetched = [];
  const caches = { open: async () => ({ match: async url => store.get(url), put: async (url, res) => { store.set(url, res); } }) };
  const fetch = async url => { fetched.push(url); const body = new Uint8Array(1000); return new Response(body, { headers: { 'content-length': '1000' } }); };
  async function engine() {
    const answers = [], assets = [];
    const engineModule = { PaddleOCR: { create: async options => { assets.push(options.textDetectionModelAsset.url, options.textRecognitionModelAsset.url); return { predict: async () => [{ items: [] }] }; } } };
    const scope = { URL: class extends URL { static createObjectURL() { return 'blob:model'; } }, Promise, Response, Blob, fetch, caches, engineModule, OffscreenCanvas: class { getContext() { return { fillRect() {} }; } transferToImageBitmap() { return { close() {} }; } }, self: { caches, location: { href: 'https://dey.ci/js/ocr-worker.js' }, postMessage: out => answers.push(out) } };
    vm.runInNewContext(source, scope);
    scope.self.onmessage({ data: { id: 1, type: 'warm' } });
    while (!answers.some(a => a.id === 1)) await new Promise(resolve => setImmediate(resolve));
    assert.equal(answers.find(a => a.id === 1).ok, true);
    assert.equal(assets.join(), 'blob:model,blob:model', 'the engine reads the fetched models');
    return answers.filter(a => a.progress).map(a => a.progress);
  }
  const first = await engine();
  assert.equal(JSON.stringify(first.at(-1)), JSON.stringify({ loaded: 2000, total: 2000 }), 'the download counts both models');
  assert.equal(fetched.length, 2);
  assert.equal((await engine()).length, 0, 'cached models are not downloaded or announced again');
  assert.equal(fetched.length, 2);
}

(async () => {
  await client();
  await models();
  await check('?build=123&backend=wasm', false);
  await check('', false);
  await check('', true);
  console.log('OCR client: one worker, wasm retry, hang-breaker and close pass. Models download once with progress, then come from the cache. A WASM client starts on WASM; the automatic backend and silent/throwing GPU recovery remain intact.');
})().catch(error => { console.error(error); process.exitCode = 1; });
