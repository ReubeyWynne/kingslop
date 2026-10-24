/* The master roster: each master's "Your master" form, read from and written to the shared
   ledger (masters.roster and the master-emblems-{master} balances), and the tile it paints.
   Shared by the Masters page and the Town Centre's Masters shelf. */
(function () {
  'use strict';
  var EN = {
    count: '{n} masters', owned: '{n} yours', level: 'Lv {n}', next: 'Next class: {name} at affinity {level}, {cost} emblems.', waiting: 'Next class: {name} at affinity {level}, {cost} emblems. Waiting on emblems now.',
    soul: 'Kindred Soul reached. Special Research takes emblems from here.', locked: 'Not unlocked yet.', talentNow: 'Yours now, level {n} of 11: {effects}', talentNone: 'Starts at affinity 1.'
  };
  function t(api, key) { return api.tr('masters.' + key, EN[key]); }
  window.Interactions.register('master-directory', function (context) {
    var Ledger = window.PlayerLedger, Spend = window.MasterSpend, editor = window.RosterEditor, api = context.api, store = null, mine = { roster: {}, emblems: {} };
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    var records = context.nodes('[data-master]').map(function (node) {
      return { node: node, id: node.dataset.master, master: Spend.find(node.dataset.master), data: window.MasterData.masters.find(function (entry) { return entry.id === node.dataset.master; }),
        form: node.querySelector('[data-target~="master-directory.form"]'), badge: node.querySelector('[data-target~="master-directory.badge"]') };
    });
    records.forEach(function (record) { if (record.form) record.form.disabled = !store; });
    function part(record, name) { return record.node.querySelector('[data-portrait="' + name + '"]'); }
    function target(record, name) { return Array.from(record.node.querySelectorAll('[data-target~="master-directory.' + name + '"]')); }
    // Values only, in the order of the talent sentence above them: "6% · 6%".
    function effects(list) { return list.map(function (effect) { return api.fmt(effect.value) + (effect.percent ? '%' : ''); }).join(' · '); }
    function paint(record) {
      var copy = mine.roster[record.id] || null, affinity = copy ? copy.affinity : null, data = record.data;
      record.node.dataset.owned = String(Boolean(copy));
      var talent = Spend.classAt(record.master, affinity), parts = [];
      if (copy && affinity !== null) parts.push(api.fill(t(api, 'level'), { n: api.fmt(affinity) }));
      if (copy && talent) parts.push(data.affinity.classes[talent - 1].name);
      if (record.badge) record.badge.textContent = parts.join('\n');
      var level = part(record, 'affinity'), soul = part(record, 'soul');
      if (level) { level.hidden = !copy || affinity === null; level.textContent = copy && affinity !== null ? api.fmt(affinity) : ''; }
      if (soul) soul.hidden = !copy || affinity !== 100;
      target(record, 'talent').forEach(function (node) {
        node.textContent = !copy || affinity === null ? '' : talent ? api.fill(t(api, 'talentNow'), { n: api.fmt(talent), effects: effects(data.talent.levels[talent - 1]) }) : t(api, 'talentNone');
      });
      record.node.querySelectorAll('.master-classes li').forEach(function (li) { li.toggleAttribute('data-reached', Boolean(copy) && affinity !== null && Number(li.dataset.level) <= affinity); });
      target(record, 'next').forEach(function (node) {
        if (!copy) { node.textContent = t(api, 'locked'); return; }
        if (affinity === null) { node.textContent = ''; return; }
        if (affinity >= 100) { node.textContent = t(api, 'soul'); return; }
        var next = data.affinity.classes.find(function (entry) { return entry.level > affinity; });
        node.textContent = api.fill(t(api, copy.ready ? 'waiting' : 'next'), { name: next.name, level: api.fmt(next.level), cost: api.fmt(next.emblems) });
      });
      target(record, 'ready').forEach(function (node) { node.hidden = !copy || affinity === null || affinity % 10 !== 9; });
      target(record, 'skillLevel').forEach(function (node) {
        var at = Number(node.dataset.skill), value = copy ? copy.skills[at] : null;
        node.textContent = !value ? '' : api.fill(t(api, 'level'), { n: api.fmt(value) });
      });
      if (!record.form) return;
      record.form.querySelectorAll('[data-field]').forEach(function (input) {
        var field = input.dataset.field;
        if (input === document.activeElement && input.type !== 'checkbox') return;
        if (field === 'owned') input.checked = Boolean(copy);
        else if (field === 'emblems') input.value = Object.hasOwn(mine.emblems, record.id) ? mine.emblems[record.id] : '';
        else if (field === 'ready') { input.checked = Boolean(copy && copy.ready); input.disabled = !copy; }
        else {
          var value = !copy ? null : field === 'skill' ? copy.skills[Number(input.dataset.skill)] : copy[field];
          input.value = value === null || value === undefined ? '' : value;
          input.disabled = !copy;
        }
      });
    }
    function render() {
      try { mine = store ? store.masters() : mine; } catch (cause) { mine = { roster: {}, emblems: {} }; }
      var owned = 0;
      context.root.toggleAttribute('data-collection', Object.keys(mine.roster).length > 0);
      records.forEach(function (record) {
        paint(record);
        if (mine.roster[record.id]) owned++;
        var need = {}; Object.keys(record.node.dataset).forEach(function (key) { var m = /^kingdom(Generation|Truegold)$/.exec(key); if (m) need[m[1].toLowerCase()] = Number(record.node.dataset[key]); });
        var badge = record.node.querySelector('[data-kingdom-upcoming]');
        if (badge) badge.hidden = window.KingdomProgression.availability(need) !== 'upcoming';
      });
      context.root.querySelectorAll('[data-number]').forEach(function (node) { node.textContent = api.fmt(Number(node.dataset.number)); });
      var text = api.fill(t(api, 'count'), { n: api.fmt(records.length) });
      if (owned) text += ' · ' + api.fill(t(api, 'owned'), { n: api.fmt(owned) });
      context.targets('count').forEach(function (node) { node.textContent = text; });
    }
    function edit(input) {
      var record = editor.recordOf(records, input);
      if (!record || !store || (input.matches('input[type="number"]') && !input.validity.valid)) return;
      var key = record.id, field = input.dataset.field, saved = record.form.querySelector('[data-target~="master-directory.saved"]');
      editor.save(api, saved, render, function () {
        if (field === 'emblems') store.setBalance(Ledger.masterEmblemId(key), editor.number(input));
        else if (field === 'owned') store.setMaster(key, input.checked ? (mine.roster[key] || {}) : null);
        else {
          var copy = Object.assign({ affinity: null, ready: false, skills: [null, null, null, null] }, mine.roster[key]);
          copy.skills = copy.skills.slice();
          if (field === 'skill') copy.skills[Number(input.dataset.skill)] = editor.number(input);
          else if (field === 'ready') copy.ready = input.checked;
          else copy.affinity = editor.number(input);
          store.setMaster(key, copy);
        }
      });
    }
    editor.dossiers(context, records, '.master-dossier');
    editor.onChange(context, 'master-directory', '.master-mine [data-field]', edit);
    context.listen(document, 'ks:kingdom-change', render);
    if (store) context.cleanup(store.subscribe(render));
    render();
    return { refresh: render };
  });
})();
