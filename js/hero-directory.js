(function () {
  'use strict';
  window.Interactions.register('hero-directory', function (context) {
    var nodes = context.nodes('[data-hero]'), fields = {}, currentGeneration = window.KS_SERVER_AGE.getGeneration();
    var Ledger = window.PlayerLedger, store = null, mine = { roster: {}, shards: {} };
    // Browsing still works when storage is blocked; only the collection forms stay disabled.
    try { store = Ledger.shared(); store.snapshot(); } catch (cause) { store = null; }
    ['query', 'troop', 'generation', 'server', 'role', 'mine'].forEach(function (key) { fields[key] = context.targets(key)[0]; });
    var records = nodes.map(function (node) { return { node: node, form: node.querySelector('[data-target~="hero-directory.form"]'), badge: node.querySelector('[data-target~="hero-directory.badge"]'), hero: { key: node.dataset.hero, name: node.dataset.name, type: node.dataset.troop, generation: Number(node.dataset.generation), roles: (node.dataset.roles || '').split(' ').filter(Boolean), owned: false } }; });
    context.targets('filters').forEach(function (node) { node.disabled = false; });
    records.forEach(function (record) { if (record.form) record.form.disabled = !store; });
    function serverValue() {
      var generation = currentGeneration;
      Array.from(fields.server.querySelectorAll('[data-extra]')).forEach(function (node) { node.remove(); });
      if (generation && !Array.from(fields.server.options).some(function (option) { return Number(option.value) === generation; })) {
        var option = document.createElement('option'); option.value = generation; option.dataset.extra = 'true';
        option.textContent = context.api.tr('directory.generation', 'Generation') + ' ' + context.api.fmt(generation); fields.server.appendChild(option);
      }
      fields.server.value = generation || '';
    }
    function starText(index) { var at = window.HeroDirectory.stars(index); return at.stars + '★' + (at.tier ? ' ' + at.tier + '/6' : ''); }
    // The saved roster and shards, read back into every hero's form and tile.
    function load() {
      try { mine = store ? store.heroes() : mine; } catch (cause) { mine = { roster: {}, shards: {} }; }
      var any = Object.keys(mine.roster).length > 0;
      context.root.toggleAttribute('data-collection', any);
      records.forEach(function (record) {
        var copy = mine.roster[record.hero.key], shards = Object.hasOwn(mine.shards, record.hero.key) ? mine.shards[record.hero.key] : null;
        record.hero.owned = Boolean(copy);
        record.node.dataset.owned = String(Boolean(copy));
        var parts = [];
        if (copy && copy.level !== null) parts.push(context.api.fill(context.api.tr('directory.lvl', 'Lv {n}'), { n: context.api.fmt(copy.level) }));
        if (copy && copy.stars !== null) parts.push(starText(copy.stars));
        if (!copy && shards) parts.push(context.api.fill(context.api.tr('directory.shardCount', '{n} shards'), { n: context.api.fmt(shards) }));
        if (record.badge) record.badge.textContent = parts.join(' · ');
        if (!record.form) return;
        record.form.querySelectorAll('[data-field]').forEach(function (input) {
          var field = input.dataset.field;
          if (input === document.activeElement && field !== 'owned') return;
          if (field === 'owned') input.checked = Boolean(copy);
          else if (field === 'shards') input.value = shards === null ? '' : shards;
          else {
            var value = !copy ? null : field === 'skill' ? (copy.skills ? copy.skills[Number(input.dataset.skill)] : null) : copy[field];
            input.value = value === null || value === undefined ? '' : value;
            input.disabled = !copy;
          }
        });
      });
    }
    function render() {
      var filters = {}, count = 0, owned = 0;
      Object.keys(fields).forEach(function (key) { filters[key] = fields[key].value; });
      records.forEach(function (record) { var visible = window.HeroDirectory.matches(record.hero, filters); record.node.hidden = !visible; if (visible) count++; if (record.hero.owned) owned++; });
      var text = context.api.fill(context.api.tr('directory.count', '{n} of {total} heroes'), { n: context.api.fmt(count), total: context.api.fmt(records.length) });
      if (owned) text += ' · ' + context.api.fill(context.api.tr('directory.ownedCount', '{n} yours'), { n: context.api.fmt(owned) });
      context.targets('count').forEach(function (node) { node.textContent = text; });
      context.targets('empty').forEach(function (node) { node.hidden = count !== 0; });
      context.emit('hero-directory:filtered', { count: count, filters: filters });
    }
    function number(input) { return input.value === '' ? null : Number(input.value); }
    function edit(input) {
      var record = records.filter(function (item) { return item.node.contains(input); })[0];
      if (!record || (input.matches('input[type="number"]') && !input.validity.valid)) return;
      var key = record.hero.key, field = input.dataset.field, saved = record.form.querySelector('[data-target~="hero-directory.saved"]');
      try {
        if (field === 'shards') store.setBalance(Ledger.heroShardId(key), number(input));
        else if (field === 'owned') { delete record.pending; store.setHero(key, input.checked ? (mine.roster[key] || {}) : null); }
        else {
          var copy = Object.assign({ level: null, stars: null, widget: null, skills: null }, mine.roster[key]);
          if (field === 'skill') {
            var skills = (copy.skills || record.pending || []).slice(), size = Number(record.node.dataset.skills), at = Number(input.dataset.skill);
            while (skills.length < size) skills.push(null);
            skills[at] = number(input);
            // A skill list stays whole: any unread level forgets the list rather than storing gaps.
            copy.skills = skills.every(function (level) { return level !== null; }) ? skills : null;
            if (copy.skills === null) record.pending = skills; else delete record.pending;
          } else copy[field] = number(input);
          store.setHero(key, copy);
        }
        if (saved) saved.textContent = context.api.tr('gear.saved', '');
      } catch (cause) {
        if (saved) saved.textContent = context.api.tr('gear.saveFailed', '');
        load(); throw cause;
      }
    }
    // One dossier open at a time (native via details[name]; this covers older browsers),
    // and the opened one is brought into view because the tiles reflow around it.
    records.forEach(function (record) {
      var dossier = record.node.querySelector('.hero-dossier');
      if (!dossier) return;
      context.listen(dossier, 'toggle', function () {
        if (!dossier.open) return;
        records.forEach(function (other) { var d = other.node.querySelector('.hero-dossier'); if (d && d !== dossier && d.open) d.open = false; });
        var top = record.node.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6) record.node.scrollIntoView({ block: 'start' });
      });
    });
    function openTarget() {
      var id = decodeURIComponent(location.hash.slice(1)), match = records.filter(function (record) { return record.node.id === id; })[0];
      if (match && !match.node.hidden) { var d = match.node.querySelector('.hero-dossier'); if (d) d.open = true; }
    }
    context.listen(window, 'hashchange', openTarget);
    openTarget();
    context.listen(document, 'ks:server-age-change', function (event) { currentGeneration = event.detail ? event.detail.generation : null; serverValue(); render(); });
    // Each dossier is its own disclosure module, so its form changes are heard here rather than as actions.
    context.listen(context.root, 'change', function (event) {
      var input = event.target.closest && event.target.closest('.hero-mine [data-field]');
      if (input && store) try { edit(input); } catch (cause) { context.emit('module:error', { module: 'hero-directory', message: cause.message }); }
    });
    if (store) context.cleanup(store.subscribe(function () { load(); restorePending(); render(); }));
    // Skill levels picked before the whole list is known stay on screen until the rest are chosen.
    function restorePending() {
      records.forEach(function (record) {
        if (!record.pending || !record.form || !mine.roster[record.hero.key]) return;
        record.form.querySelectorAll('[data-field="skill"]').forEach(function (input) { var level = record.pending[Number(input.dataset.skill)]; if (input !== document.activeElement) input.value = level === null ? '' : level; });
      });
    }
    serverValue(); load();
    return { refresh: function () { serverValue(); load(); restorePending(); render(); }, actions: {
      filter: { events: ['input', 'change'], run: render },
      server: { events: ['change'], run: function () { if (fields.server.value === '') window.KS_SERVER_AGE.clear(); else window.KS_SERVER_AGE.setGeneration(fields.server.value); } },
      reset: { run: function () { ['query', 'troop', 'generation', 'role', 'mine'].forEach(function (key) { fields[key].value = ''; }); render(); } }
    } };
  });
})();
