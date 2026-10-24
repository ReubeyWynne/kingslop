const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Editor = require('../js/roster-editor.js');

assert.equal(Editor.number({ value: '' }), null);
assert.equal(Editor.number({ value: '0' }), 0);
assert.equal(Editor.number({ value: '22' }), 22);
assert.ok(Number.isNaN(Editor.number({ value: 'unread' })));
const input = {}, other = {};
const first = { node: { contains: node => node === input } }, second = { node: { contains: node => node === other } };
assert.equal(Editor.recordOf([first, second], input), first);
assert.equal(Editor.recordOf([first, second], other), second);
assert.equal(Editor.recordOf([first, second], {}), undefined);

const events = [], api = { tr: key => key === 'gear.saved' ? 'saved' : 'failed' };
const status = { textContent: 'before' }, failure = new Error('write rejected');
Editor.save(api, status, () => events.push('refresh'), () => events.push('write'));
assert.deepEqual(events, ['write']);
assert.equal(status.textContent, 'saved');
assert.throws(() => Editor.save(api, status, () => events.push('refresh:' + status.textContent), () => { throw failure; }), cause => cause === failure);
assert.deepEqual(events, ['write', 'refresh:failed']);
assert.equal(status.textContent, 'failed');
assert.throws(() => Editor.save(api, null, () => events.push('refresh without status'), () => { throw failure; }), cause => cause === failure);
assert.equal(events.at(-1), 'refresh without status');

function context() {
  const listeners = [], emitted = [], root = { ownerDocument: { defaultView: { innerHeight: 1000 } } };
  return { root, listeners, emitted,
    listen: (node, event, handler) => listeners.push({ node, event, handler }),
    emit: (type, detail) => emitted.push({ type, detail }) };
}
const change = context();
let edits = 0;
Editor.onChange(change, 'hero-directory', '.hero-mine [data-field]', node => { assert.equal(node, input); edits += 1; if (edits === 2) throw failure; });
assert.equal(change.listeners[0].node, change.root);
assert.equal(change.listeners[0].event, 'change');
const dispatch = change.listeners[0].handler;
dispatch({ target: {} });
dispatch({ target: { closest: () => null } });
assert.equal(edits, 0);
const event = { target: { closest: selector => { assert.equal(selector, '.hero-mine [data-field]'); return input; } } };
dispatch(event); dispatch(event);
assert.equal(edits, 2);
assert.deepEqual(change.emitted, [{ type: 'module:error', detail: { module: 'hero-directory', message: 'write rejected' } }]);

function record(top) {
  const dossier = { open: false }, scrolls = [];
  return { dossier, scrolls, node: {
    querySelector: () => dossier,
    getBoundingClientRect: () => ({ top }),
    scrollIntoView: options => scrolls.push(options)
  } };
}
for (const top of [-1, 0, 600, 601]) {
  const ctx = context(), a = record(top), b = record(10), missing = { node: { querySelector: () => null } };
  Editor.dossiers(ctx, [a, b, missing], '.hero-dossier');
  assert.equal(ctx.listeners.length, 2);
  assert.equal(ctx.listeners[0].node, a.dossier);
  assert.equal(ctx.listeners[0].event, 'toggle');
  b.dossier.open = true;
  ctx.listeners[0].handler();
  assert.equal(b.dossier.open, true);
  assert.equal(a.scrolls.length, 0);
  a.dossier.open = true;
  ctx.listeners[0].handler();
  assert.equal(b.dossier.open, false);
  assert.deepEqual(a.scrolls, top < 0 || top > 600 ? [{ block: 'start' }] : []);
}

const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../js/roster-editor.js'), 'utf8'), browser);
assert.equal(browser.window.RosterEditor.number({ value: '0' }), 0);
console.log('Roster editor: unknown/zero inputs, record ownership, failed-write refresh and rethrow, delegated error events and dossier visibility pass.');
