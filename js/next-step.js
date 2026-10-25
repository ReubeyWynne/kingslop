/* A tool page's next step: the first UpgradePriority.evaluate steps of the kinds this page
   handles, with a link to the whole order. `data-kinds` lists step kinds; `record:<what>` names
   a step that asks for a missing fact, and `*` takes every kind (the home page). It reads the player's own save, so it stays hidden under
   a guest or shared-link store and when nothing on this page is due. Every page asks for an
   unknown Town Centre first. */
(function () {
  'use strict';
  var SHOWN = 2;
  window.Interactions.register('next-step', function (context) {
    var api = context.api, root = context.root, engine = window.UpgradePriority, say = window.UpgradePriorityWords(api), store = null;
    var kinds = (root.dataset.kinds || '').trim().split(/\s+/).filter(Boolean);
    try { store = context.ledger === window.PlayerLedger.shared() ? context.ledger : null; if (store) store.snapshot(); } catch (cause) { store = null; }
    function token(step) { return step.kind === 'record' ? 'record:' + step.params.what : step.kind; }
    function render() {
      if (!store) { root.hidden = true; return; }
      // The Town Centre sets the stage every page's steps are weighed by, so it is asked for first.
      var result = engine.evaluate(store.snapshot()), steps = result.actions.filter(function (step) { return token(step) === 'record:town-center' || kinds.includes('*') || kinds.includes(token(step)); });
      var list = context.targets('list')[0];
      list.textContent = '';
      steps.slice(0, SHOWN).forEach(function (step) {
        var node = context.targets('item')[0].content.firstElementChild.cloneNode(true), text = say.words(step);
        node.dataset.kind = step.kind;
        node.querySelector('[data-part="title"]').textContent = text[0];
        node.querySelector('[data-part="why"]').textContent = text[1];
        list.appendChild(node);
      });
      root.hidden = !steps.length;
    }
    if (store) context.cleanup(store.subscribe(render));
    context.listen(document, 'ks:kingdom-change', render);
    return { refresh: render };
  });
})();
