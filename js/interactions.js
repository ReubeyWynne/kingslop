(function () {
  'use strict';
  var factories = new Map(), mounted = new Map(), api, started = false, observer;
  function names(node, attribute) { return (node.getAttribute(attribute) || '').trim().split(/\s+/).filter(Boolean); }
  function emit(node, name, detail) { node.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); }
  function error(root, name, cause) { emit(root, 'module:error', { module: name, message: cause.message || String(cause) }); }
  function mount(root) {
    var modules = mounted.get(root);
    if (!modules) { modules = new Map(); mounted.set(root, modules); }
    names(root, 'data-module').forEach(function (name) {
      if (modules.has(name) || !factories.has(name)) return;
      var cleanups = [], context = {
        root: root, api: api,
        owns: function (node) { return node.closest('[data-module]') === root; },
        nodes: function (selector) { return [root].concat(Array.from(root.querySelectorAll(selector))).filter(function (node) { return node.matches(selector) && context.owns(node); }); },
        targets: function (key) { return context.nodes('[data-target]').filter(function (node) { return names(node, 'data-target').includes(name + '.' + key); }); },
        emit: function (event, detail) { emit(root, event, detail); },
        listen: function (node, event, listener) { node.addEventListener(event, listener); cleanups.push(function () { node.removeEventListener(event, listener); }); },
        cleanup: function (fn) { cleanups.push(fn); }
      };
      try {
        var instance = factories.get(name)(context) || {};
        modules.set(name, { context: context, instance: instance, dispose: function () { cleanups.reverse().forEach(function (fn) { fn(); }); if (instance.dispose) instance.dispose(); } });
        if (instance.refresh) instance.refresh();
      } catch (cause) { cleanups.reverse().forEach(function (fn) { fn(); }); error(root, name, cause); }
    });
  }
  function scan(node) {
    if (node.nodeType === 1 && node.matches('[data-module]')) mount(node);
    if (node.querySelectorAll) node.querySelectorAll('[data-module]').forEach(mount);
  }
  function dispose(root) { var modules = mounted.get(root); if (!modules) return; modules.forEach(function (entry) { entry.dispose(); }); mounted.delete(root); }
  function dispatch(event) {
    var node = event.target.closest && event.target.closest('[data-action]');
    if (!node) return;
    var root = node.closest('[data-module]'), modules = mounted.get(root);
    if (!modules) return;
    names(node, 'data-action').forEach(function (token) {
      var at = token.indexOf('.'), name = token.slice(0, at), action = token.slice(at + 1), entry = modules.get(name);
      if (at < 1 || !entry || !Object.hasOwn(entry.instance.actions || {}, action)) return;
      var handler = entry.instance.actions[action];
      if (!(handler.events || ['click']).includes(event.type)) return;
      try {
        if (handler.preventDefault) event.preventDefault();
        Promise.resolve(handler.run(node, event)).catch(function (cause) { error(root, name, cause); });
      } catch (cause) { error(root, name, cause); }
    });
  }
  var modules = {
    register: function (name, factory) {
      if (!/^[a-z][a-z0-9-]*$/.test(name) || factories.has(name)) throw new Error('Invalid or duplicate module: ' + name);
      factories.set(name, factory); if (started) scan(document);
    },
    start: function (pageAPI) {
      if (started) return;
      api = pageAPI; started = true;
      ['click', 'input', 'change', 'submit'].forEach(function (event) { document.addEventListener(event, dispatch); });
      scan(document);
      observer = new MutationObserver(function (records) {
        records.forEach(function (record) { record.addedNodes.forEach(scan); });
        mounted.forEach(function (_, root) { if (!root.isConnected) dispose(root); });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
    refresh: function () { mounted.forEach(function (entries, root) { entries.forEach(function (entry, name) { try { if (entry.instance.refresh) entry.instance.refresh(); } catch (cause) { error(root, name, cause); } }); }); },
    destroy: function () { if (observer) observer.disconnect(); mounted.forEach(function (_, root) { dispose(root); }); ['click', 'input', 'change', 'submit'].forEach(function (event) { document.removeEventListener(event, dispatch); }); started = false; },
    emit: emit
  };
  window.Interactions = modules;
})();
