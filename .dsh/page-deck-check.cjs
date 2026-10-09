const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const nav = JSON.parse(fs.readFileSync(path.join(root, '_data/nav.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, '_data/pages.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'js/common.js'), 'utf8');

class Element {
  constructor(name, attrs = {}) {
    this.name = name;
    this.attrs = { ...attrs };
    this.listeners = {};
    this.children = [];
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.offsetWidth = 281;
    this.clientWidth = 390;
    this.textContent = '';
    this.isConnected = true;
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value)
    };
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  addEventListener(name, callback, options) { (this.listeners[name] ??= []).push(callback); (this.passive ??= new Map()).set(callback, !!options?.passive); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] ?? []).filter(fn => fn !== callback); }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  matches(selector) {
    return selector.split(',').some(raw => {
      const s = raw.trim();
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      if (s.startsWith('#')) return this.attrs.id === s.slice(1);
      const attr = s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
      return s === this.name;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null; }
  focus() { this.owner.activeElement = this; }
}

function setup(current = 'home', reduced = false) {
  let time = 0;
  let nextFrame = 0;
  const frames = new Map();
  const timers = new Map();
  const document = new Element('document');
  const html = new Element('html', { 'data-page': pages[current].token, 'data-prev-url': pages[current].swipePrev.url, 'data-next-url': pages[current].swipeNext.url });
  html.scrollTop = 0;
  html.clientHeight = 844;
  html.scrollHeight = 2000;
  document.documentElement = html;
  document.body = new Element('body');
  document.head = new Element('head');
  document.readyState = 'complete';
  document.activeElement = document.body;
  document.appendChild(document.body);
  const ledgerButton = new Element('button', { id: 'ledger-btn' });
  const ledger = new Element('nav', { id: 'ledger' });
  const deck = new Element('dialog', { id: 'page-deck' });
  deck.open = false;
  const element = (name, cls, parent = deck, attrs = {}) => {
    const el = new Element(name, attrs);
    if (cls) el.classList.add(cls);
    parent.appendChild(el);
    return el;
  };
  const close = element('button', 'deck-close');
  const groupButtons = ['home', 'events', 'tools'].map(group => element('button', '', deck, { 'data-deck-group': group }));
  const viewport = element('div', 'deck-viewport');
  viewport.scrollLeft = 0;
  const cards = nav.map((n, i) => {
    const card = element('a', 'deck-card', viewport, { 'data-page': pages[n.self].token, 'data-group': n.group, ...(n.self === current ? { 'aria-current': 'page' } : {}) });
    card.offsetLeft = (viewport.clientWidth - card.offsetWidth) / 2 + i * 305;
    card.href = 'https://dey.ci/' + n.tail;
    element('span', 'deck-card-title', card).textContent = n.label;
    element('span', 'deck-card-lede', card).textContent = pages[n.self].metaDesc;
    return card;
  });
  const status = element('span', 'deck-position');
  const previous = element('button', 'deck-prev');
  const next = element('button', 'deck-next');
  const main = new Element('main');
  const input = element('input', '', main);
  const toc = element('nav', '', main, { id: 'toc' });
  const link = element('a', '', main);
  const button = element('button', '', main);
  document.body.appendChild(ledgerButton);
  document.body.appendChild(ledger);
  document.body.appendChild(main);
  document.body.appendChild(deck);
  function own(node) { node.owner = document; node.children.forEach(own); }
  own(document);
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = name => new Element(name);
  const fire = (target, type, extra = {}) => {
    const event = { target, type, detail: 1, cancelable: true, defaultPrevented: false, ...extra,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; }
    };
    for (let node = target; node; node = node.parentNode) {
      for (const handler of node.listeners[type] ?? []) { handler(event); if (event.stopped) return event; }
    }
    return event;
  };
  viewport.scrollTo = args => { viewport.scrollLeft = args.left; fire(viewport, 'scroll'); fire(viewport, 'scrollend'); };
  deck.showModal = () => { deck.open = true; close.focus(); };
  deck.close = () => { deck.open = false; fire(deck, 'close'); };
  const media = { matches: reduced, addEventListener() {} };
  const compact = { matches: true, addEventListener() {} };
  const storage = new Map();
  const window = new Element('window');
  const location = { href: 'https://dey.ci' + pages[current].canonicalPath, origin: 'https://dey.ci', hash: '' };
  const scope = {
    document, window, location, URL, Intl, console, performance: { now: () => time }, navigator: {},
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    setTimeout: (fn, ms) => { const id = ++nextFrame; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  Object.assign(window, {
    getComputedStyle: card => ({ getPropertyValue: token => {
      const accent = { home: '#F5C851', bearhunt: '#AEC878', vikings: '#E08A3C', swordland: '#E05555', vip: '#C5A3EE', sim: '#88A8F0', kvksg: '#5FC8A6', gear: '#72CBDD', heroes: '#E68AB4' }[card.getAttribute('data-page')];
      return token === '--signal-line' ? accent + '55' : accent;
    } }),
    I18N: { locale: 'en-GB', tr: (k, fallback) => fallback, onReady: fn => { window.boot = fn; } },
    matchMedia: query => query.includes('reduced') ? media : compact,
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: scope.setTimeout, clearTimeout: scope.clearTimeout,
    scrollTo: args => { html.scrollTop = args.top; },
    requestIdleCallback() {}
  });
  scope.fetch = () => Promise.resolve({ ok: false });
  vm.runInNewContext(source, scope, { filename: 'common.js' });
  window.boot();
  function advance(ms) {
    const end = time + ms;
    while (time < end) {
      time = Math.min(end, time + 16);
      const running = [...frames.values()]; frames.clear(); running.forEach(fn => fn(time));
      for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); }
    }
  }
  const touch = (target, type, x, y = 300, count = 1) => fire(target, type, {
    touches: type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: count }, () => ({ clientX: x, clientY: y })),
    changedTouches: [{ clientX: x, clientY: y }]
  });
  function swipe(target, duration, dx = -220, dy = 0, hold = 0) {
    touch(target, 'touchstart', 300);
    for (let i = 1; i <= 10; i++) { advance(duration / 10); touch(target, 'touchmove', 300 + dx * i / 10, 300 + dy * i / 10); }
    advance(hold);
    touch(target, 'touchend', 300 + dx, 300 + dy);
  }
  const selected = () => cards.findIndex(card => card.classList.contains('is-selected'));
  return { deck, viewport, cards, main, input, toc, link, button, ledgerButton, close, status, groupButtons, previous, next, location, media, window, storage, document, fire, touch, swipe, advance, selected, frames };
}

test('an opening swipe browses one neighbour without scheduling animation frames', () => {
  for (const duration of [80, 1200]) {
    const s = setup(); s.swipe(s.main, duration); s.advance(1000);
    assert.equal(s.selected(), 1);
    assert.equal(s.frames.size, 0);
    assert.equal(s.deck.open, true);
    assert.equal(s.location.href, 'https://dey.ci/');
  }
});

test('native scroll position selects the centred cover as the strip moves', () => {
  const s = setup(); s.fire(s.ledgerButton, 'click');
  s.viewport.scrollLeft = 305 * 4;
  s.fire(s.viewport, 'scroll');
  assert.equal(s.selected(), 4, 'selection follows the strip, so nothing changes when it stops');
  s.fire(s.viewport, 'scrollend');
  assert.equal(s.selected(), 4);
  assert.match(s.status.textContent, /Swordland/);
  assert.equal(s.frames.size, 0);
});

test('vertical reading, calculator controls and TOC interactions never open the deck', () => {
  for (const target of ['main', 'input', 'toc', 'link', 'button']) {
    const s = setup(); s.swipe(s[target], 500, target === 'main' ? 20 : -220, target === 'main' ? 220 : 0); s.advance(1000);
    assert.equal(s.deck.open, false, target);
  }
});

test('dragging a cover cannot activate its link; a settled tap can', () => {
  const s = setup(); s.fire(s.ledgerButton, 'click');
  const card = s.cards[0]; s.swipe(card, 1200); s.advance(100);
  s.viewport.scrollLeft = 305; s.fire(s.viewport, 'scroll'); s.fire(s.viewport, 'scrollend');
  assert.equal(s.fire(card, 'click').defaultPrevented, true);
  s.advance(1000);
  const destination = s.cards[s.selected()];
  assert.equal(s.fire(destination, 'click').defaultPrevented, false);
  assert.equal(s.storage.get('bh:deck'), new URL(destination.href).pathname);
});

test('ledger, groups, keyboard and Escape share a modal and restore focus and scroll', () => {
  const s = setup('bear'); s.ledgerButton.focus(); s.document.documentElement.scrollTop = 540;
  s.fire(s.ledgerButton, 'click');
  assert.equal(s.selected(), 2);
  assert.equal(s.ledgerButton.getAttribute('aria-controls'), 'page-deck');
  s.fire(s.groupButtons[2], 'click'); s.advance(1000);
  assert.equal(s.selected(), 5);
  const url = s.location.href;
  s.fire(s.next, 'keydown', { key: 'ArrowRight' }); s.advance(1000);
  assert.equal(s.selected(), 6);
  assert.equal(s.document.activeElement, s.cards[6]);
  assert.equal(s.location.href, url);
  s.fire(s.deck, 'cancel');
  assert.equal(s.deck.open, false);
  assert.equal(s.document.activeElement, s.ledgerButton);
  assert.equal(s.document.documentElement.scrollTop, 540);
  assert.equal(s.document.documentElement.classList.contains('deck-open'), false);
});

test('ring browsing works in both directions and reduced motion settles immediately', () => {
  const s = setup('home', true); s.swipe(s.main, 1200, 220);
  assert.equal(s.selected(), nav.length - 1);
  assert.equal(s.frames.size, 0);
  assert.equal(s.deck.open, true);
  s.fire(s.next, 'click');
  assert.equal(s.selected(), 0);
  assert.equal(s.fire(s.cards[0], 'click', { detail: 0 }).defaultPrevented, true);
  assert.equal(s.deck.open, false);
});

test('cancelled and multitouch gestures leave a usable deck and history restores close it', () => {
  const s = setup(); s.touch(s.main, 'touchstart', 300); s.advance(50); s.touch(s.main, 'touchmove', 160);
  s.touch(s.main, 'touchcancel', 160); s.advance(1000);
  assert.equal(s.deck.open, true);
  assert.ok(s.status.textContent);
  s.touch(s.cards[s.selected()], 'touchstart', 200, 300, 2);
  s.touch(s.cards[s.selected()], 'touchend', 200); s.advance(1000);
  s.fire(s.window, 'pageshow', { persisted: true });
  assert.equal(s.deck.open, false);
});

test('all dictionaries carry plain-text deck labels and the template covers the nav data', () => {
  const template = fs.readFileSync(path.join(root, '_includes/page-deck.html'), 'utf8');
  const keys = [...template.matchAll(/data-i18n(?:-key)?="(ev\.deck\.[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(keys).size, 6);
  for (const file of fs.readdirSync(path.join(root, 'i18n')).filter(name => name.endsWith('.js'))) {
    const scope = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', file), 'utf8'), scope);
    const dictionary = Object.values(scope.window.__BH_I18N_DATA)[0];
    for (const key of keys) { assert.ok(dictionary[key], file + ': ' + key); assert.equal(/<[^>]+>/.test(dictionary[key]), false); }
    for (const n of nav) { assert.ok(dictionary[n.labelKey], file + ': ' + n.labelKey); assert.ok(dictionary[n.ledeKey], file + ': ' + pages[n.self].metaDescKey); }
  }
  assert.ok(template.includes('for n in site.data.nav'));
  assert.ok(template.includes('site.data.pages[n.self]'));
  assert.ok(fs.readFileSync(path.join(root, '_layouts/page.html'), 'utf8').includes('include page-deck.html'));
});

test('background taps dismiss and pagehide cleans up synchronously before bfcache freezes', () => {
  const s = setup(); s.fire(s.ledgerButton, 'click'); s.fire(s.status, 'click');
  assert.equal(s.deck.open, false);
  s.fire(s.ledgerButton, 'click');
  s.deck.close = () => { s.deck.open = false; };
  s.fire(s.window, 'pagehide');
  assert.equal(s.document.documentElement.classList.contains('deck-open'), false);
  assert.equal(s.ledgerButton.getAttribute('aria-expanded'), 'false');
});

test('deck touch movement is left to native scrolling and keyboard direction stays physical in RTL', () => {
  const s = setup(); s.fire(s.ledgerButton, 'click');
  s.touch(s.cards[0], 'touchstart', 300);
  const move = s.touch(s.cards[0], 'touchmove', 100);
  assert.equal(move.defaultPrevented, false);
  assert.deepEqual([...s.document.passive.entries()].filter(([fn]) => s.document.listeners.touchmove.includes(fn)).map(([, passive]) => passive), [true], 'an open deck never holds touch scrolling for script');
  s.fire(s.deck, 'cancel');
  assert.deepEqual([...s.document.passive.entries()].filter(([fn]) => s.document.listeners.touchmove.includes(fn)).map(([, passive]) => passive), [false]);
  s.fire(s.ledgerButton, 'click');
  assert.equal(s.frames.size, 0);
  s.document.documentElement.setAttribute('dir', 'rtl');
  s.fire(s.next, 'keydown', { key: 'Home' });
  s.fire(s.next, 'keydown', { key: 'ArrowRight' });
  assert.equal(s.selected(), 1);
});

test('deck navigation retains the cover for capture and cleans it on history restore', () => {
  const s = setup();
  s.fire(s.ledgerButton, 'click');
  s.fire(s.cards[1], 'click');
  assert.equal(s.document.documentElement.getAttribute('data-entry'), 'deck');
  s.fire(s.window, 'pagehide');
  assert.equal(s.deck.open, true);
  s.fire(s.window, 'pageshow', { persisted: true });
  assert.equal(s.deck.open, false);
  assert.equal(s.document.documentElement.getAttribute('data-entry'), null);
});

test('modified cover clicks do not mark the current tab as navigating', () => {
  const s = setup();
  s.fire(s.ledgerButton, 'click');
  s.fire(s.cards[1], 'click', { ctrlKey: true });
  assert.equal(s.storage.get('bh:deck'), undefined);
  s.fire(s.window, 'pagehide');
  assert.equal(s.deck.open, false);
});

test('palette selection is declared in CSS without JavaScript colour writes or frame loops', () => {
  const css = fs.readFileSync(path.join(root, 'css/events.css'), 'utf8');
  assert.match(css, /@property --deck-accent/);
  // The ground fades on its own empty layer; the dialog itself and the
  // inherited accent never transition, so a change never repaints or
  // restyles the whole deck frame by frame.
  assert.match(css, /\.deck-ground \{[^}]*transition: background-color 0\.6s ease;/);
  assert.doesNotMatch(css.match(/\.page-deck \{[^}]*\}/)[0], /transition/);
  assert.doesNotMatch(css, /transition:[^;]*--deck-accent/);
  assert.doesNotMatch(css, /\.page-deck:has\(/, 'a :has() rule on the dialog restyles the whole deck on any text change');
  assert.match(css.match(/\.page-deck \{[^}]*\}/)[0], /-webkit-tap-highlight-color: transparent/);
  assert.ok(css.includes('html.deck-open body > :not(.page-deck) { visibility: hidden; }'));
  assert.ok(css.includes('html.deck-open, html.deck-open body { background: #090d14; }'));
  assert.ok(fs.readFileSync(path.join(root, '_includes/page-deck.html'), 'utf8').includes('<div class="deck-ground" aria-hidden="true"></div>'));
  assert.doesNotMatch(css, /^\.deck-card[^{]*is-selected/m, 'covers look the same whichever is selected');
  assert.doesNotMatch(css, /deck-wash/);
  for (const n of nav) {
    assert.ok(css.includes(`.page-deck[data-selected="${pages[n.self].token}"] :is(.deck-ground, .deck-atmosphere, .deck-header, .deck-groups, .deck-footer, #deck-hint)`));
    assert.ok(css.includes(`.deck-card[data-page="${pages[n.self].token}"] { --deck-accent:`));
  }
  assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame|getComputedStyle/);
  const s = setup(); s.fire(s.ledgerButton, 'click'); s.fire(s.next, 'click');
  assert.equal(s.document.documentElement.getAttribute('data-page'), 'home');
  assert.equal(s.deck.getAttribute('data-selected'), s.cards[s.selected()].getAttribute('data-page'));
  assert.equal(s.deck.style['--deck-accent'], undefined);
});

test('every cover has an ASCII HTML scene with a static fallback and reduced-motion styling', () => {
  const css = fs.readFileSync(path.join(root, 'css/ascii.css'), 'utf8');
  const frames = fs.readFileSync(path.join(root, 'css/ascii-frames.css'), 'utf8');
  const head = fs.readFileSync(path.join(root, '_includes/head.html'), 'utf8');
  const scene = fs.readFileSync(path.join(root, '_includes/ascii/deck-scene.html'), 'utf8');
  const template = fs.readFileSync(path.join(root, '_includes/page-deck.html'), 'utf8');
  assert.ok(head.includes('css/ascii.css') && head.includes('css/ascii-frames.css'));
  assert.ok(template.indexOf('deck-card-title') < template.indexOf('class="deck-ascii"'));
  assert.ok(template.includes('include ascii/deck-scene.html'));
  for (const entry of nav) {
    const token = pages[entry.self].token;
    assert.ok(scene.includes(`when '${token}'`));
  }
  assert.equal(/[^\x00-\x7F]/.test(scene), false);
  assert.match(css, /\.deck-ascii \{[\s\S]*?top: 50%;[\s\S]*?left: 50%;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  const flame = frames.match(/@keyframes ascii-fire\{([\s\S]*?)\n\}/)[1];
  assert.equal([...flame.matchAll(/content:/g)].length, 72);
  const campfire = fs.readFileSync(path.join(root, '_includes/ascii/campfire.html'), 'utf8');
  assert.equal([...campfire.matchAll(/class="patch patch-/g)].length, 6);
  assert.equal([...campfire.matchAll(/class="spark"/g)].length, 18);
  assert.ok(campfire.includes('class="logs-back"') && campfire.includes('class="logs-front"'));
  for (const kind of ['bear', 'crown', 'dice', 'moon', 'banner']) assert.ok(scene.includes(`ascii-mini--${kind}`));
  assert.ok(scene.includes('include ascii/campfire.html') && scene.includes('include ascii/forge.html'));
});

