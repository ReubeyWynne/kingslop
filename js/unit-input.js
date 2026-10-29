/* unit-input.js — one number box with a unit beside it, for figures the game
   prints in millions or days. Mark an input `data-unit-input="count"` (×1, K,
   M, B) or `data-unit-input="duration"` (minutes, hours, days); its `min` and
   `max` stay in raw units.

   The input keeps its own hooks, so page modules and checks are unchanged:
   reading `input.value` gives the raw whole number ("805510000", minutes for a
   duration), and setting it shows that figure in the unit that reads best
   ("805.51" M, "17" day). What the reader types is read in the chosen unit,
   and a typed suffix wins ("1.2m", "3d", "90 min"). A select is added after
   the input; changing it rescales what is shown, not the stored figure.
   `data-unit-default` names the unit an empty box starts in.
   Pure parts (pick, parse, format) are exported for checks. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UnitInput = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var UNITS = {
    count: [{ id: '1', label: '×1', size: 1, key: 'unit.one' }, { id: 'k', label: 'K', size: 1e3, key: 'unit.thousand' }, { id: 'm', label: 'M', size: 1e6, key: 'unit.million' }, { id: 'b', label: 'B', size: 1e9, key: 'unit.billion' }],
    duration: [{ id: 'min', label: 'min', size: 1, key: 'unit.min' }, { id: 'hr', label: 'hr', size: 60, key: 'unit.hr' }, { id: 'day', label: 'day', size: 1440, key: 'unit.day' }]
  };
  var SUFFIX = {
    count: { k: 'k', m: 'm', b: 'b', g: 'b' },
    duration: { m: 'min', min: 'min', mins: 'min', minute: 'min', minutes: 'min', h: 'hr', hr: 'hr', hrs: 'hr', hour: 'hr', hours: 'hr', d: 'day', day: 'day', days: 'day' }
  };

  function unit(kind, id) { return UNITS[kind].filter(function (u) { return u.id === id; })[0] || UNITS[kind][0]; }

  // The largest unit that shows the figure as at least 1 without losing any of
  // it: two decimals at most for counts, whole numbers for durations.
  function pick(kind, raw) {
    var list = UNITS[kind];
    if (raw === null || raw === undefined || raw === '' || !isFinite(raw) || Number(raw) === 0) return list[0].id;
    raw = Math.abs(Number(raw));
    for (var i = list.length - 1; i > 0; i--) {
      var shown = raw / list[i].size;
      var exact = kind === 'count' ? Math.abs(Math.round(shown * 100) / 100 * list[i].size - raw) < 0.5 : raw % list[i].size === 0;
      if (shown >= 1 && exact) return list[i].id;
    }
    return list[0].id;
  }

  function format(kind, raw, id) {
    if (raw === null || raw === undefined || raw === '') return '';
    var shown = Number(raw) / unit(kind, id).size;
    return String(Math.round(shown * 100) / 100);
  }

  // Typed text to a raw whole number, or null for blank, or NaN for nonsense.
  // "1,5" reads as 1.5 only where a thousands group can't be meant.
  function parse(kind, text, id) {
    var t = String(text === undefined || text === null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
    if (t === '') return null;
    var m = t.match(/^(-?\d+(?:[.,]\d+)*)([a-z]*)$/);
    if (!m) return NaN;
    var digits = m[1], suffix = m[2];
    if (/^-?\d{1,3}(,\d{3})+$/.test(digits)) digits = digits.replace(/,/g, '');
    else digits = digits.replace(/,(?=\d+$)/, '.').replace(/,/g, '');
    var n = parseFloat(digits);
    if (!isFinite(n)) return NaN;
    var chosen = id;
    if (suffix) { chosen = SUFFIX[kind][suffix]; if (!chosen) return NaN; }
    return Math.round(n * unit(kind, chosen).size);
  }

  var NATIVE = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;

  function label(u) {
    var I = typeof window !== 'undefined' && window.I18N;
    return I && I.tr ? I.tr(u.key, u.label) : u.label;
  }

  function enhance(input) {
    if (!NATIVE || input.dataset.unitReady) return;
    var kind = input.dataset.unitInput === 'duration' ? 'duration' : 'count';
    var min = input.min === '' ? -Infinity : Number(input.min), max = input.max === '' ? Infinity : Number(input.max);
    var raw = NATIVE.get.call(input), select = document.createElement('select');
    input.dataset.unitReady = 'true';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    select.className = 'unit-select';
    select.setAttribute('aria-label', label({ key: kind === 'duration' ? 'unit.durationLabel' : 'unit.countLabel', label: 'unit' }));
    select.setAttribute('data-i18n-key', kind === 'duration' ? 'unit.durationLabel' : 'unit.countLabel');
    select.setAttribute('data-i18n-attr', 'aria-label');
    UNITS[kind].forEach(function (u) {
      var option = document.createElement('option');
      option.value = u.id; option.textContent = label(u); option.setAttribute('data-i18n', u.key);
      select.appendChild(option);
    });
    input.insertAdjacentElement('afterend', select);

    function current() { return parse(kind, NATIVE.get.call(input), select.value); }
    function check() {
      var n = current();
      input.setCustomValidity(n === null || (Number.isSafeInteger(n) && n >= min && n <= max) ? '' : 'out of range');
    }
    // An empty box starts in data-unit-default when given ("k" for troop counts typed in thousands).
    var fallback = input.dataset.unitDefault && unit(kind, input.dataset.unitDefault).id === input.dataset.unitDefault ? input.dataset.unitDefault : null;
    var before;
    function show(next) {
      select.value = before = next === null && fallback ? fallback : pick(kind, next);
      NATIVE.set.call(input, format(kind, next, select.value));
      check();
    }
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { var n = current(); return n === null ? '' : isNaN(n) ? NATIVE.get.call(input) : String(n); },
      set: function (next) { show(next === '' || next === null || next === undefined ? null : Number(next)); }
    });
    input.addEventListener('input', check);
    // A typed suffix settles into the select once the reader moves on.
    input.addEventListener('change', function () { var n = current(); if (n !== null && !isNaN(n)) show(n); });
    // Rescaling keeps the figure; the box shows it in the new unit.
    select.addEventListener('focus', function () { before = select.value; });
    select.addEventListener('change', function () {
      var n = parse(kind, NATIVE.get.call(input), before);
      before = select.value;
      if (n !== null && !isNaN(n)) NATIVE.set.call(input, format(kind, n, select.value));
      check();
    });
    show(raw === '' ? null : Number(raw));
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches('input[data-unit-input]')) enhance(node);
    node.querySelectorAll('input[data-unit-input]').forEach(enhance);
  }

  if (typeof document !== 'undefined') {
    scan(document.documentElement);
    new MutationObserver(function (list) { list.forEach(function (m) { m.addedNodes.forEach(scan); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  return { UNITS: UNITS, pick: pick, parse: parse, format: format, enhance: enhance };
});
