// js/roster-form.mjs, what the hero, master and pet forms share: reading a number field,
// refusing a value the field itself refuses, the saved/failed seal, and one dossier at a time.
const assert = require('node:assert/strict');
const Form = require('../js/roster-form.mjs');

assert.equal(Form.number({ value: '' }), null);
assert.equal(Form.number({ value: '0' }), 0);
assert.equal(Form.number({ value: '22' }), 22);
const field = (number, valid) => ({ matches: selector => number && selector === 'input[type="number"]', validity: { valid } });
assert.equal(Form.refused(field(true, false)), true);
assert.equal(Form.refused(field(true, true)), false);
assert.equal(Form.refused(field(false, false)), false);

// A write that goes through seals the card; one that throws seals it failed, makes its fields
// read the save back, and is reported the way every page module's failures are.
const errors = [], root = { dispatchEvent: event => errors.push(event) }, card = { seal: null, redraw: 0 };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.bubbles = init.bubbles; this.detail = init.detail; } };
const writes = [];
Form.save(card, root, 'hero-directory', () => writes.push('write'));
assert.deepEqual(writes, ['write']);
assert.equal(card.seal, 'saved'); assert.equal(card.redraw, 0); assert.equal(errors.length, 0);
Form.save(card, root, 'hero-directory', () => { throw new Error('write rejected'); });
assert.equal(card.seal, 'failed'); assert.equal(card.redraw, 1);
assert.equal(errors.length, 1);
assert.equal(errors[0].type, 'module:error'); assert.equal(errors[0].bubbles, true);
assert.deepEqual(errors[0].detail, { module: 'hero-directory', message: 'write rejected' });

// Opening a dossier closes the others of its name and scrolls a card that starts off screen.
function dossier(top) {
  const scrolls = [], card = { getBoundingClientRect: () => ({ top }), scrollIntoView: options => scrolls.push(options) };
  return { open: false, name: 'hero-dossier', parentElement: card, scrolls, ownerDocument: null };
}
const near = dossier(100), far = dossier(900), above = dossier(-50), all = [near, far, above];
const doc = { defaultView: { innerHeight: 1000 }, querySelectorAll: selector => { assert.equal(selector, 'details[name="hero-dossier"][open]'); return all.filter(d => d.open); } };
all.forEach(d => { d.ownerDocument = doc; });
Form.opened(near);
near.open = true; Form.opened(near);
assert.deepEqual([near.open, far.open, above.open], [true, false, false]);
assert.deepEqual(near.scrolls, []);
far.open = true; Form.opened(far);
assert.deepEqual([near.open, far.open], [false, true]);
assert.deepEqual(far.scrolls, [{ block: 'start' }]);
above.open = true; Form.opened(above);
assert.deepEqual(above.scrolls, [{ block: 'start' }]);
console.log('Roster forms: number fields, refused values, the saved and failed seal, the error report and one dossier at a time pass.');
