/* deep-link.js — #id links open the disclosure they name, and opening one
   puts its id in the address bar so the link can be copied.

   A disclosure is a details[id], a collapsible section[data-collapse][id], or
   a panel[id] whose button carries data-deep-link and aria-controls. common.js
   already opens collapsed sections for a hash; this adds the other two and the
   scroll that follows, and writes the hash back. It starts after the page's
   own scripts so their buttons are wired when it presses them. */
(function () {
  'use strict';

  function find(id) {
    return id ? document.getElementById(id) : null;
  }

  function controller(panel) {
    return panel.id ? document.querySelector('[data-deep-link][aria-controls="' + panel.id + '"]') : null;
  }

  // Open the target and any closed details around it; true if anything changed.
  function open(target) {
    var changed = false;
    for (var node = target; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && !node.open) { node.open = true; changed = true; }
    }
    var button = controller(target);
    if (button && button.getAttribute('aria-expanded') !== 'true') { button.click(); changed = true; }
    return changed;
  }

  function reveal(instant) {
    var target = find(decodeURIComponent(location.hash.slice(1)));
    if (!target || !open(target)) return;
    var anchor = controller(target) || target;
    function scroll() {
      if (anchor.offsetParent !== null) anchor.scrollIntoView({ block: 'start', behavior: instant ? 'instant' : 'auto' });
    }
    scroll();
    // Content above can still settle before load; land on the target again then.
    if (instant && document.readyState !== 'complete') window.addEventListener('load', scroll, { once: true });
  }

  function remember(id, isOpen) {
    var here = location.hash === '#' + id;
    if (isOpen === here) return;
    history.replaceState(history.state, '', location.pathname + location.search + (isOpen ? '#' + id : ''));
  }

  function start() {
    reveal(true);
    window.addEventListener('hashchange', function () { reveal(false); });

    // toggle does not bubble; capture hears every details on the page.
    document.addEventListener('toggle', function (event) {
      var details = event.target;
      if (details.tagName === 'DETAILS' && details.id) remember(details.id, details.open);
    }, true);

    // A panel's button can close it without a click (the allocator closes on
    // submit), so watch its aria-expanded rather than the click.
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        var button = record.target;
        remember(button.getAttribute('aria-controls'), button.getAttribute('aria-expanded') === 'true');
      });
    });
    document.querySelectorAll('[data-deep-link][aria-controls]').forEach(function (button) {
      observer.observe(button, { attributes: true, attributeFilter: ['aria-expanded'] });
    });

    // Sections are watched by click: common.js also opens them for a hash,
    // and that must not replace a details id with its section's.
    document.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('section[data-collapse][id] > h2 .section-toggle');
      if (button) remember(button.closest('section').id, button.getAttribute('aria-expanded') === 'true');
    });
  }

  if (window.I18N && window.I18N.onReady) window.I18N.onReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
