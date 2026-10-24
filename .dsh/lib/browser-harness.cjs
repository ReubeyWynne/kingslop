const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.pdf': 'application/pdf', '.gz': 'application/gzip',
};

function contains(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function startServer({ root, mounts = {}, pages = {} } = {}) {
  const directories = Object.entries(mounts);
  if (root) directories.push(['/', root]);
  const roots = await Promise.all(directories.map(async ([prefix, directory]) => {
    if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('Mount paths must start and end with /');
    const resolved = await fs.promises.realpath(directory);
    if (!(await fs.promises.stat(resolved)).isDirectory()) throw new Error('Server root must be a directory: ' + directory);
    return { prefix, root: resolved };
  }));
  roots.sort((a, b) => b.prefix.length - a.prefix.length);

  async function respond(request, response) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(request.url.split('?')[0]);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!pathname.startsWith('/') || /[\0\\]/.test(pathname)) {
      response.writeHead(400).end();
      return;
    }
    if (pathname.split('/').includes('..')) {
      response.writeHead(403).end();
      return;
    }
    if (Object.hasOwn(pages, pathname)) {
      const body = Buffer.from(pages[pathname]);
      response.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const mount = roots.find(({ prefix }) => pathname.startsWith(prefix));
    if (!mount) { response.writeHead(404).end(); return; }
    let file = path.resolve(mount.root, pathname.slice(mount.prefix.length));
    if (!contains(mount.root, file)) { response.writeHead(403).end(); return; }
    file = await fs.promises.realpath(file);
    if (!contains(mount.root, file)) { response.writeHead(403).end(); return; }
    let stat = await fs.promises.stat(file);
    if (stat.isDirectory()) {
      file = await fs.promises.realpath(path.join(file, 'index.html'));
      if (!contains(mount.root, file)) { response.writeHead(403).end(); return; }
      stat = await fs.promises.stat(file);
    }
    if (!stat.isFile()) { response.writeHead(404).end(); return; }
    if (response.destroyed) return;
    const headers = {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
    };
    if (request.method === 'HEAD') { response.writeHead(200, headers).end(); return; }
    const stream = fs.createReadStream(file);
    response.on('close', () => stream.destroy());
    stream.on('error', error => fail(response, error));
    stream.on('open', () => { response.writeHead(200, headers); stream.pipe(response); });
  }

  function fail(response, error) {
    if (response.destroyed) return;
    if (response.headersSent) { response.destroy(error); return; }
    const status = { ENOENT: 404, ENOTDIR: 404, EACCES: 403, EPERM: 403 }[error.code] || 500;
    response.writeHead(status).end();
  }

  const server = http.createServer((request, response) => {
    respond(request, response).catch(error => fail(response, error));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  let closing;
  return {
    origin: 'http://127.0.0.1:' + server.address().port,
    close() {
      if (!closing) closing = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

async function withBrowser({ launchOptions = {}, ...serverOptions }, run) {
  const server = await startServer(serverOptions);
  const browsers = [];
  async function launch(options = {}) {
    const args = JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]');
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('PLAYWRIGHT_CHROMIUM_ARGS must be a JSON array of strings');
    const browser = await require('playwright').chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      ...options,
      args: [...args, ...(options.args || [])],
    });
    browsers.push(browser);
    return browser;
  }
  let result, failure, failed = false;
  try {
    const browser = await launch(launchOptions);
    result = await run({ browser, origin: server.origin, launch });
  } catch (error) {
    failed = true;
    failure = error;
  }
  const cleanupErrors = [];
  for (const browser of browsers.reverse()) {
    for (const context of browser.contexts()) {
      try { await context.close(); } catch (error) { cleanupErrors.push(error); }
    }
    try { await browser.close(); } catch (error) { cleanupErrors.push(error); }
  }
  try { await server.close(); } catch (error) { cleanupErrors.push(error); }
  if (failed && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], 'Browser check and cleanup failed', { cause: failure });
  if (failed) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Browser cleanup failed');
  return result;
}

module.exports = { startServer, withBrowser };
