(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RosterEditor = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function number(input) { return input.value === '' ? null : Number(input.value); }
  function recordOf(records, node) { return records.find(function (record) { return record.node.contains(node); }); }
  function save(api, status, refresh, write) {
    try {
      write();
      if (status) status.textContent = api.tr('gear.saved', '');
    } catch (cause) {
      if (status) status.textContent = api.tr('gear.saveFailed', '');
      refresh(); throw cause;
    }
  }
  function dossiers(context, records, selector) {
    records.forEach(function (record) {
      var dossier = record.node.querySelector(selector);
      if (!dossier) return;
      context.listen(dossier, 'toggle', function () {
        if (!dossier.open) return;
        records.forEach(function (other) { var node = other.node.querySelector(selector); if (node && node !== dossier && node.open) node.open = false; });
        var top = record.node.getBoundingClientRect().top;
        if (top < 0 || top > context.root.ownerDocument.defaultView.innerHeight * 0.6) record.node.scrollIntoView({ block: 'start' });
      });
    });
  }
  function onChange(context, module, selector, edit) {
    context.listen(context.root, 'change', function (event) {
      var input = event.target.closest && event.target.closest(selector);
      if (input) try { edit(input); } catch (cause) { context.emit('module:error', { module: module, message: cause.message }); }
    });
  }
  return { number: number, recordOf: recordOf, save: save, dossiers: dossiers, onChange: onChange };
});
