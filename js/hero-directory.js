(function () {
  'use strict';
  window.Interactions.register('hero-directory', function (context) {
    var nodes = context.nodes('[data-hero]'), fields = {}, currentGeneration = window.KS_SERVER_AGE.getGeneration();
    ['query', 'troop', 'generation', 'server', 'role'].forEach(function (key) { fields[key] = context.targets(key)[0]; });
    var records = nodes.map(function (node) { return { node: node, hero: { key: node.dataset.hero, name: node.dataset.name, type: node.dataset.troop, generation: Number(node.dataset.generation), roles: (node.dataset.roles || '').split(' ').filter(Boolean) } }; });
    context.targets('filters').forEach(function (node) { node.disabled = false; });
    function serverValue() {
      var generation = currentGeneration;
      Array.from(fields.server.querySelectorAll('[data-extra]')).forEach(function (node) { node.remove(); });
      if (generation && !Array.from(fields.server.options).some(function (option) { return Number(option.value) === generation; })) {
        var option = document.createElement('option'); option.value = generation; option.dataset.extra = 'true';
        option.textContent = context.api.tr('directory.generation', 'Generation') + ' ' + context.api.fmt(generation); fields.server.appendChild(option);
      }
      fields.server.value = generation || '';
    }
    function render() {
      var filters = {}, count = 0;
      Object.keys(fields).forEach(function (key) { filters[key] = fields[key].value; });
      records.forEach(function (record) { var visible = window.HeroDirectory.matches(record.hero, filters); record.node.hidden = !visible; if (visible) count++; });
      context.targets('count').forEach(function (node) { node.textContent = context.api.fill(context.api.tr('directory.count', '{n} of {total} heroes'), { n: context.api.fmt(count), total: context.api.fmt(records.length) }); });
      context.targets('empty').forEach(function (node) { node.hidden = count !== 0; });
      context.emit('hero-directory:filtered', { count: count, filters: filters });
    }
    context.listen(document, 'ks:server-age-change', function (event) { currentGeneration = event.detail ? event.detail.generation : null; serverValue(); render(); });
    serverValue();
    return { refresh: function () { serverValue(); render(); }, actions: {
      filter: { events: ['input', 'change'], run: render },
      server: { events: ['change'], run: function () { if (fields.server.value === '') window.KS_SERVER_AGE.clear(); else window.KS_SERVER_AGE.setGeneration(fields.server.value); } },
      reset: { run: function () { ['query', 'troop', 'generation', 'role'].forEach(function (key) { fields[key].value = ''; }); render(); } }
    } };
  });
})();
