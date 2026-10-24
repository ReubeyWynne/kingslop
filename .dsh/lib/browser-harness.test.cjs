const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const { beforeEach, test } = require('node:test');
const { chromium } = require('playwright');
const { startServer, withBrowser } = require('./browser-harness.cjs');

beforeEach(t => {
  for (const name of ['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', 'PLAYWRIGHT_CHROMIUM_ARGS']) {
    const previous = process.env[name];
    delete process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
});

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(__dirname, '.browser-harness-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'site');
  const extra = path.join(directory, 'site-extra');
  await fs.mkdir(root);
  await fs.mkdir(extra);
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Ledger ❧</h1>');
  await fs.writeFile(path.join(extra, 'secret.txt'), 'outside the mount');
  return { directory, root, extra };
}

function request(origin, pathname = '/', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(origin + '/', { path: pathname, method, agent: false }, response => {
      const chunks = [];
      response.on('error', reject);
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function serve(t, options) {
  const server = await startServer(options);
  t.after(() => server.close());
  return server;
}

test('serves root and directory indexes, encoded names, queries, HEAD and missing files', async t => {
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, 'nested'));
  await fs.mkdir(path.join(root, 'empty'));
  await fs.writeFile(path.join(root, 'nested', 'index.html'), 'nested index');
  await fs.writeFile(path.join(root, 'field notes.txt'), 'notes');
  const { origin } = await serve(t, { root });
  const home = await request(origin);
  assert.equal(home.status, 200);
  assert.equal(home.body.toString(), '<h1>Ledger ❧</h1>');
  assert.match(home.headers['content-type'], /^text\/html; charset=utf-8$/);
  for (const pathname of ['/nested', '/nested/', '/nested/?lang=ar']) {
    assert.equal((await request(origin, pathname)).body.toString(), 'nested index');
  }
  assert.equal((await request(origin, '/field%20notes.txt?revision=2')).body.toString(), 'notes');
  const head = await request(origin, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), home.body.length);
  for (const pathname of ['/missing', '/empty/', '/index.html/child']) {
    assert.equal((await request(origin, pathname)).status, 404, pathname);
  }
  const post = await request(origin, '/', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('serves browser, OCR and binary assets without changing bytes', async t => {
  const { root } = await fixture(t);
  const cases = [
    ['worker.js', 'text/javascript; charset=utf-8'], ['module.mjs', 'text/javascript; charset=utf-8'],
    ['styles.css', 'text/css; charset=utf-8'], ['data.json', 'application/json'],
    ['source.map', 'application/json'], ['engine.wasm', 'application/wasm'],
    ['model.onnx', 'application/octet-stream'], ['weights.bin', 'application/octet-stream'],
    ['image.png', 'image/png'], ['photo.jpg', 'image/jpeg'], ['photo.jpeg', 'image/jpeg'],
    ['pet.webp', 'image/webp'], ['scene.gif', 'image/gif'], ['icon.svg', 'image/svg+xml'],
    ['picture.avif', 'image/avif'], ['favicon.ico', 'image/x-icon'],
    ['font.woff', 'font/woff'], ['font.woff2', 'font/woff2'], ['font.ttf', 'font/ttf'],
    ['font.otf', 'font/otf'], ['archive.gz', 'application/gzip'], ['PHOTO.JPG', 'image/jpeg'],
  ];
  const bytes = Buffer.from([0, 255, 128, 13, 10, 1, 0, 254]);
  for (const [name] of cases) await fs.writeFile(path.join(root, name), bytes);
  const { origin } = await serve(t, { root });
  for (const [name, type] of cases) {
    const response = await request(origin, '/' + name);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers['content-type'], type, name);
    assert.deepEqual(response.body, bytes, name);
  }
});

test('rejects raw and encoded traversal, malformed encoding and symlink escapes without killing the server', async t => {
  const { root, extra } = await fixture(t);
  await fs.symlink(path.join(extra, 'secret.txt'), path.join(root, 'leak.txt'));
  await fs.symlink(extra, path.join(root, 'outside'));
  await fs.mkdir(path.join(root, 'index-escape'));
  await fs.symlink(path.join(extra, 'secret.txt'), path.join(root, 'index-escape', 'index.html'));
  await fs.symlink(path.join(root, 'index.html'), path.join(root, 'inside.html'));
  const { origin } = await serve(t, { root });
  for (const pathname of [
    '/../site-extra/secret.txt', '/%2e%2e/site-extra/secret.txt', '/nested/../../site-extra/secret.txt',
    '/..%2fsite-extra%2fsecret.txt', '/%2E%2E%2Fsite-extra/secret.txt',
    '//site-extra/secret.txt', '/leak.txt', '/outside/secret.txt', '/index-escape/',
  ]) {
    const response = await request(origin, pathname);
    assert.equal(response.status, 403, pathname);
    assert.ok(!response.body.includes('outside the mount'), pathname);
  }
  for (const pathname of ['/%', '/%ZZ', '/%E0%A4%A', '/%00', '/..%5csite-extra/secret.txt']) {
    assert.equal((await request(origin, pathname)).status, 400, pathname);
  }
  assert.equal((await request(origin, '/inside.html')).status, 200);
  assert.equal((await request(origin)).status, 200);
});

test('mounts fixture directories and inline pages without exposing the rest of the repository', async t => {
  const { root, extra } = await fixture(t);
  await fs.writeFile(path.join(root, 'example.jpg'), Buffer.from([255, 216, 255]));
  await fs.symlink(path.join(extra, 'secret.txt'), path.join(root, 'escape.jpg'));
  const { origin } = await serve(t, { mounts: { '/fx/': root }, pages: { '/': '<p>Fixture</p>' } });
  assert.equal((await request(origin, '/?lang=en')).body.toString(), '<p>Fixture</p>');
  assert.equal((await request(origin, '/', 'HEAD')).body.length, 0);
  const image = await request(origin, '/fx/example.jpg?rev=2');
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.deepEqual(image.body, Buffer.from([255, 216, 255]));
  for (const pathname of ['/example.jpg', '/fx-other/example.jpg', '/_config.yml']) {
    assert.equal((await request(origin, pathname)).status, 404, pathname);
  }
  for (const pathname of ['/fx/../site-extra/secret.txt', '/fx/escape.jpg']) {
    assert.equal((await request(origin, pathname)).status, 403, pathname);
  }
  const both = await serve(t, { root: extra, mounts: { '/fx/': root, '/fx/special/': extra } });
  assert.equal((await request(both.origin, '/fx/example.jpg')).status, 200);
  assert.equal((await request(both.origin, '/fx/special/secret.txt')).status, 200);
  assert.equal((await request(both.origin, '/secret.txt')).status, 200);
});

test('close is awaitable and idempotent, including with an incomplete HTTP request', { timeout: 5000 }, async t => {
  const { root } = await fixture(t);
  const server = await serve(t, { root });
  const socket = net.connect(new URL(server.origin).port, '127.0.0.1');
  const errors = [];
  socket.on('error', error => errors.push(error.code));
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
  const disconnected = new Promise(resolve => socket.once('close', resolve));
  await Promise.all([server.close(), server.close()]);
  await disconnected;
  assert.ok(errors.every(code => code === 'ECONNRESET'));
  await assert.rejects(request(server.origin), { code: 'ECONNREFUSED' });
});

function browserFixture(events, name, contextError, browserError) {
  const contexts = [{ close: async () => { events.push(name + ':context'); if (contextError) throw contextError; } }];
  return {
    contexts: () => contexts,
    close: async () => { events.push(name + ':browser'); if (browserError) throw browserError; },
  };
}

test('returns callback results and closes contexts, additional browsers and server after success', async t => {
  const { root } = await fixture(t);
  const events = [], launches = [];
  t.mock.method(chromium, 'launch', async options => {
    launches.push(options);
    return browserFixture(events, String(launches.length));
  });
  let origin;
  const result = await withBrowser({ root }, async harness => {
    origin = harness.origin;
    assert.equal((await request(origin)).status, 200);
    await harness.launch({ args: ['--use-angle=swiftshader'] });
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(events, ['2:context', '2:browser', '1:context', '1:browser']);
  assert.equal(launches[0].headless, true);
  assert.equal(launches[1].headless, true);
  assert.deepEqual(launches[1].args, ['--use-angle=swiftshader']);
  await assert.rejects(request(origin), { code: 'ECONNREFUSED' });
});

test('cleans up after scenario or context setup failure and preserves the original error', async t => {
  const { root } = await fixture(t);
  const events = [];
  const failure = new Error('context setup failed');
  t.mock.method(chromium, 'launch', async () => ({
    ...browserFixture(events, 'primary'),
    newContext: async () => { throw failure; },
  }));
  let origin;
  await assert.rejects(withBrowser({ root }, async harness => {
    origin = harness.origin;
    await harness.browser.newContext();
  }), error => error === failure);
  assert.deepEqual(events, ['primary:context', 'primary:browser']);
  await assert.rejects(request(origin), { code: 'ECONNREFUSED' });
  await assert.rejects(withBrowser({ root }, async () => { throw failure; }), error => error === failure);
});

test('closes the server when the browser launch fails before the callback runs', async t => {
  const { root } = await fixture(t);
  const createServer = http.createServer;
  let server;
  t.mock.method(http, 'createServer', (...args) => { server = createServer(...args); return server; });
  const failure = new Error('no browser executable');
  t.mock.method(chromium, 'launch', async () => { throw failure; });
  await assert.rejects(withBrowser({ root }, async () => assert.fail('callback must not run')), error => error === failure);
  assert.equal(server.listening, false);
});

test('closes existing browsers and server if an additional launch fails', async t => {
  const { root } = await fixture(t);
  const events = [], failure = new Error('GPU browser unavailable');
  let launches = 0, origin;
  t.mock.method(chromium, 'launch', async () => {
    if (launches++) throw failure;
    return browserFixture(events, 'primary');
  });
  await assert.rejects(withBrowser({ root }, async harness => {
    origin = harness.origin;
    await harness.launch();
  }), error => error === failure);
  assert.deepEqual(events, ['primary:context', 'primary:browser']);
  await assert.rejects(request(origin), { code: 'ECONNREFUSED' });
});

test('attempts every cleanup after failures and reports the scenario error with cleanup errors', async t => {
  const { root } = await fixture(t);
  const events = [];
  const failure = new Error('assertion failed'), contextError = new Error('context close failed'), browserError = new Error('browser close failed');
  t.mock.method(chromium, 'launch', async () => browserFixture(events, 'primary', contextError, browserError));
  let origin;
  await assert.rejects(withBrowser({ root }, async harness => {
    origin = harness.origin;
    throw failure;
  }), error => {
    assert.equal(error.cause, failure);
    assert.deepEqual(error.errors, [failure, contextError, browserError]);
    return true;
  });
  assert.deepEqual(events, ['primary:context', 'primary:browser']);
  await assert.rejects(request(origin), { code: 'ECONNREFUSED' });
});

test('honors the executable environment override and explicit launch options for every browser', async t => {
  const { root } = await fixture(t);
  const previous = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const previousArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS;
  t.after(() => {
    if (previous === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = previous;
    if (previousArgs === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_ARGS;
    else process.env.PLAYWRIGHT_CHROMIUM_ARGS = previousArgs;
  });
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/local/chromium';
  process.env.PLAYWRIGHT_CHROMIUM_ARGS = '["--no-sandbox"]';
  const launches = [];
  t.mock.method(chromium, 'launch', async options => {
    launches.push(options);
    return browserFixture([], 'browser');
  });
  await withBrowser({ root }, async ({ launch }) => { await launch(); });
  await withBrowser({ root, launchOptions: { executablePath: '/explicit/chromium', args: ['--disable-3d-apis'] } }, async ({ launch }) => {
    await launch({ executablePath: '/gpu/chromium', headless: false, args: ['--use-angle=swiftshader'] });
  });
  assert.deepEqual(launches.map(options => options.executablePath), ['/local/chromium', '/local/chromium', '/explicit/chromium', '/gpu/chromium']);
  assert.deepEqual(launches[0].args, ['--no-sandbox']);
  assert.deepEqual(launches[1].args, ['--no-sandbox']);
  assert.deepEqual(launches[2].args, ['--no-sandbox', '--disable-3d-apis']);
  assert.deepEqual(launches[3].args, ['--no-sandbox', '--use-angle=swiftshader']);
  assert.equal(launches[3].headless, false);
});
