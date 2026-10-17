(function () {
  'use strict';
  window.Interactions.register('kingdom-context', function (context) {
    function render() {
      var profile = window.KingdomProgression.get();
      context.targets('summary').forEach(function (node) {
        node.removeAttribute('data-i18n');
        node.textContent = !window.KingdomProgression.writable() ? context.api.tr('kingdom.saveFailed', 'Could not save kingdom progression. Check browser storage or your player save.') : profile.generation === null ? context.api.tr('kingdom.unset', 'Set progression') : context.api.tr('directory.genShort', 'Gen') + ' ' + context.api.fmt(profile.generation);
      });
    }
    context.listen(document, 'ks:kingdom-change', render);
    return { refresh: render };
  });
  window.Interactions.register('kingdom-timeline', function (context) {
    var progression = window.KingdomProgression, fields = {}, stages = window.KingdomData.stages;
    ['generation', 'truegold', 'warAcademy'].forEach(function (key) { fields[key] = context.targets(key)[0]; });
    function text(key) { return context.api.tr('kingdom.' + key, key); }
    function status(message) { context.targets('status')[0].textContent = text(message); }
    function render() {
      var profile = progression.get(), hasProfile = Object.keys(fields).some(function (key) { return profile[key] !== null; });
      Object.keys(fields).forEach(function (key) {
        var value = profile[key]; fields[key].value = value === null ? '' : String(value);
        fields[key].disabled = !progression.writable();
      });
      context.targets('choose').forEach(function (node) { node.disabled = !progression.writable(); });
      context.targets('reset').forEach(function (node) { node.disabled = !progression.writable(); });
      context.targets('card').forEach(function (node) {
        var stage = stages.find(function (entry) { return entry.id === node.dataset.stage; }), requirements = { generation: stage.profile.generation };
        if (stage.profile.truegold) requirements.truegold = stage.profile.truegold;
        if (stage.profile.warAcademy) requirements.warAcademy = true;
        var state = profile.position === stage.id ? 'current' : progression.availability(requirements, profile);
        node.dataset.progress = state;
        var button = node.querySelector('[data-action="kingdom-timeline.choose"]'); button.setAttribute('aria-pressed', String(profile.position === stage.id));
        node.querySelector('[data-milestone-status]').textContent = hasProfile ? text(state) : '';
      });
      if (!progression.writable()) status('saveFailed');
    }
    function save(profile) {
      try { progression.set(profile); status('saved'); } catch (cause) { status('saveFailed'); render(); }
    }
    context.listen(document, 'ks:kingdom-change', render);
    return { refresh: render, actions: {
      choose: { run: function (node) {
        var stage = stages.find(function (entry) { return entry.id === node.dataset.stage; });
        save(stage.profile);
      } },
      edit: { events: ['change'], run: function (node) {
        var profile = progression.get(), key = node.dataset.field;
        profile.position = null;
        profile[key] = node.value === '' ? null : key === 'warAcademy' ? node.value === 'true' : Number(node.value);
        save(profile);
      } },
      reset: { run: function () { save(progression.blank()); } }
    } };
  });
})();
