/* The upgrade priority page: paints UpgradePriority.evaluate over the shared save. The stage
   comes from the saved Town Centre level and can be previewed without saving; the role is a
   ledger preference (`preferences.priority.role`), so it travels with the player save. */
(function () {
  'use strict';
  var SHOWN = 5;
  window.Interactions.register('upgrade-priority', function (context) {
    var api = context.api, engine = window.UpgradePriority, preview = null, store = null;
    try { store = window.PlayerLedger.shared(); store.snapshot(); } catch (cause) { store = null; }
    var say = window.UpgradePriorityWords(api), t = say.t, tpl = say.tpl, words = say.words, tool = say.tool;
    function item(step, n) {
      var node = context.targets('item')[0].content.firstElementChild.cloneNode(true), text = words(step), link = node.querySelector('[data-part="link"]');
      node.dataset.kind = step.kind;
      node.querySelector('.rule-num').textContent = api.fmt(n);
      node.querySelector('[data-part="title"]').textContent = text[0];
      node.querySelector('[data-part="why"]').textContent = text[1];
      node.querySelector('[data-part="scores"]').hidden = !step.scores;
      var target = step.href && tool(step.href);
      if (target) { link.href = '../' + step.href; link.textContent = api.fill(t('openIn'), { tool: api.tr(target[1], target[2]) }); } else link.remove();
      return node;
    }
    function fill(list, steps, from) {
      list.textContent = '';
      steps.forEach(function (step, at) { list.appendChild(item(step, from + at + 1)); });
    }
    function render() {
      var snapshot = store ? store.snapshot() : { inventory: {}, preferences: {} };
      var result = engine.evaluate(snapshot, { stage: preview });
      var status = context.targets('status')[0];
      status.removeAttribute('data-i18n');
      if (!store) status.textContent = t('saveFailed');
      else if (result.townCenter === null) status.textContent = t('tcUnknown');
      else status.textContent = tpl('tcKnown', { level: result.townCenter, stage: t('stage.' + result.own) });
      if (preview && preview !== result.own) status.textContent += ' ' + tpl('previewing', { stage: t('stage.' + preview) });
      context.targets('stage').forEach(function (node) {
        var id = node.dataset.stage, button = node.querySelector('button');
        node.dataset.state = id === result.own ? 'current' : id === result.stage ? 'preview' : '';
        button.disabled = false;
        button.setAttribute('aria-pressed', String(id === result.stage));
      });
      context.targets('role').forEach(function (node) {
        node.disabled = !store;
        node.setAttribute('aria-pressed', String(node.dataset.role === result.role));
        node.dataset.default = String(!result.roleSaved && node.dataset.role === result.role);
      });
      fill(context.targets('list')[0], result.actions.slice(0, SHOWN), 0);
      var rest = result.actions.slice(SHOWN), more = context.targets('more')[0];
      more.hidden = !rest.length;
      fill(context.targets('rest')[0], rest, SHOWN);
      var label = context.targets('moreLabel')[0]; label.removeAttribute('data-i18n'); label.textContent = tpl('moreN', { n: api.fmt(rest.length) });
      var at = engine.rules.stages.findIndex(function (s) { return s.id === (result.stage || 'foundation'); });
      function later(stage) { return Boolean(stage) && engine.rules.stages.findIndex(function (s) { return s.id === stage; }) > at; }
      context.targets('ladder').forEach(function (ladder) {
        ladder.dataset.later = String(later(ladder.dataset.stage));
        ladder.querySelectorAll('li').forEach(function (rung) { rung.dataset.later = String(later(rung.dataset.stage) || Boolean(rung.dataset.role) && rung.dataset.role !== result.role); });
      });
    }
    if (store) context.cleanup(store.subscribe(render));
    context.listen(document, 'ks:kingdom-change', render);
    return { refresh: render, actions: {
      preview: { run: function (node) {
        var snapshot = store ? store.snapshot() : null, own = snapshot && snapshot.buildings && snapshot.buildings.levels ? engine.stageAt(snapshot.buildings.levels['town-center'] || '') : null;
        preview = node.dataset.stage === (own && own.id) || node.dataset.stage === preview ? null : node.dataset.stage;
        render();
      } },
      role: { run: function (node) {
        var saved = context.targets('saved')[0];
        try { store.setPriorityRole(node.dataset.role); saved.textContent = t('saved'); } catch (cause) { saved.textContent = t('saveFailed'); render(); }
      } }
    } };
  });
})();
