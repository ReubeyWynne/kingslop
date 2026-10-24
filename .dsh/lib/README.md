# Browser checks

Run the existing scripts from the repository root after building `_site`. Their
arguments, assertions, screenshot paths and report paths are unchanged.

`withBrowser({ root, launchOptions }, async ({ browser, origin, launch }) => { … })`
serves the directory on an ephemeral loopback port and launches headless Chromium.
On completion or failure it closes every remaining context, every browser it
launched, and the HTTP server. Use the supplied `launch(options)` for a second
browser with different GPU flags. Context options stay in each check so its
viewport, motion, storage, touch and JavaScript scenarios remain explicit.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium` to use a local
browser. `launchOptions.executablePath` (or `launch({ executablePath })` for an
additional browser) overrides that environment variable. Other Playwright launch
options, including `args`, pass through unchanged. Without either override,
Playwright uses its installed Chromium. No browser is downloaded by the harness.
For a local browser needing extra flags, set `PLAYWRIGHT_CHROMIUM_ARGS` to a JSON
array of strings, for example `'["--no-sandbox"]'`. These flags are prepended to
each browser's explicit `args`, preserving each scenario's GPU flags. Leaving
both environment variables unset keeps the standard CI launch behavior.

`mounts: { '/fx/': directory }` exposes fixture directories under explicit URL
prefixes; the longest matching prefix wins. `pages: { '/': markup }` provides
small HTML fixtures without writing into the site build. Omitting `root` serves
only these explicit mounts and pages. Paths are decoded once; malformed paths,
traversal, and symlinks escaping their mount are rejected. Directories serve
`index.html`. Only GET and HEAD are accepted.

`startServer(options)` exposes the same serving behavior without launching a
browser and returns `{ origin, close }`. Await `close()`; it is idempotent and
closes active connections as well as idle ones.

Run the server/security and lifecycle tests with Node's built-in test runner:

```sh
NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES" node --test .dsh/lib/browser-harness.test.cjs
```

The tests use temporary fixtures and mock browser launches; they need Playwright
on the module path but do not require `_site`, Jekyll, or a Chromium binary.
