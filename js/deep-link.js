/* deep-link.js — #id links open the disclosure they name, and opening one
   puts its id in the address bar so the link can be copied.

   Disclosures opt in through markup; there is no registry:
   - details[id] is its own link.
   - [data-deep-link="id"] on a details or an aria-expanded button links it
     under that id, usually the section or card around it.
   - section[data-collapse][id] sections are opened for a hash by common.js;
     this writes their hash back.
   - A tab panel with an id is selected through its role="tab" button. Selecting
     a tab writes the panel's id when that tab is the panel's only one, and
     otherwise clears a hash left pointing into another panel of its tablist.
   Opening a target also opens every linked disclosure around it, so a link
   into a closed panel inside a collapsed section still lands. The page's own
   scripts wire their buttons first; this starts after them and presses them. */
(function () {
  'use strict';

  function find(id) {
    return id ? document.getElementById(id) : null;
  }

  function escape(id) {
    return window.CSS && CSS.escape ? CSS.escape(id) : id;
  }

  function controls(id) {
    return document.querySelectorAll('[data-deep-link="' + escape(id) + '"]');
  }

  function tabs(id) {
    return document.querySelectorAll('[role="tab"][aria-controls="' + escape(id) + '"]');
  }

  function expand(control) {
    if (control.tagName === 'DETAILS') {
      if (control.open) return false;
      control.open = true;
      return true;
    }
    if (control.getAttribute('aria-expanded') === 'true') return false;
    control.click();
    return true;
  }

  // Open the target and every linked disclosure around it; true if anything changed.
  function open(target) {
    var changed = false;
    for (var node = target; node && node !== document.body; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && expand(node)) changed = true;
      if (!node.id) continue;
      Array.prototype.forEach.call(controls(node.id), function (control) {
        if (expand(control)) changed = true;
      });
      var panelTabs = Array.prototype.slice.call(tabs(node.id));
      if (panelTabs.length && !panelTabs.some(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })) {
        panelTabs[0].click();
        changed = true;
      }
    }
    return changed;
  }

  function reveal(instant) {
    var target = find(decodeURIComponent(location.hash.slice(1)));
    if (!target || !open(target)) return;
    // A panel scrolls to the button that opens it, so its heading shows too.
    var anchor = document.querySelector('[aria-controls="' + escape(target.id) + '"]:not([role="tab"])') || target;
    function scroll() {
      if (anchor && anchor.offsetParent !== null) anchor.scrollIntoView({ block: 'start', behavior: instant ? 'instant' : 'auto' });
    }
    scroll();
    // Content above can still settle before load; land on the target again then.
    if (instant && document.readyState !== 'complete') window.addEventListener('load', scroll, { once: true });
  }

  // Opening a disclosure writes its id, unless the hash already points inside
  // it: a link to a details in a section stays when its section opens.
  // Closing one clears the hash when the hash points inside it.
  function remember(id, isOpen) {
    if (!id) return;
    var current = find(decodeURIComponent(location.hash.slice(1)));
    var element = find(id);
    if (isOpen === Boolean(current && element && element.contains(current))) return;
    history.replaceState(history.state, '', location.pathname + location.search + (isOpen ? '#' + id : ''));
  }

  // A selected tab writes its panel's id when it is that panel's only tab. A panel
  // with several tabs has no single link, so selecting it clears a hash that still
  // names a sibling panel; otherwise a reload would reopen the panel just left.
  function selected(tab) {
    var id = tab.getAttribute('aria-controls');
    if (tabs(id).length === 1) { remember(id, true); return; }
    var current = find(decodeURIComponent(location.hash.slice(1))), panel = find(id), list = tab.closest('[role="tablist"]');
    if (!current || !panel || panel.contains(current) || !list) return;
    var sibling = Array.prototype.some.call(list.querySelectorAll('[role="tab"][aria-controls]'), function (other) {
      var otherPanel = find(other.getAttribute('aria-controls'));
      return otherPanel && otherPanel !== panel && otherPanel.contains(current);
    });
    if (sibling) history.replaceState(history.state, '', location.pathname + location.search);
  }

  function start() {
    reveal(true);
    window.addEventListener('hashchange', function () { reveal(false); });

    // toggle does not bubble; capture hears every details on the page,
    // including ones a page script renders later.
    document.addEventListener('toggle', function (event) {
      var details = event.target;
      if (details.tagName === 'DETAILS') remember(details.getAttribute('data-deep-link') || details.id, details.open);
    }, true);

    // A button can close its panel without a click (the march builder closes
    // on submit), so watch aria-expanded and aria-selected rather than clicks.
    // Scripts re-set these to the same value on a repaint; only changes count.
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        var node = record.target, value = node.getAttribute(record.attributeName);
        if (value === record.oldValue) return;
        if (record.attributeName === 'aria-expanded') remember(node.getAttribute('data-deep-link'), value === 'true');
        else if (value === 'true') selected(node);
      });
    });
    document.querySelectorAll('[data-deep-link][aria-expanded], [role="tab"][aria-controls]').forEach(function (node) {
      observer.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ['aria-expanded', 'aria-selected'] });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest) return;
      // Sections are watched by click: common.js also opens them for a hash.
      var toggle = event.target.closest('section[data-collapse][id] > h2 .section-toggle');
      if (toggle) remember(toggle.closest('section').id, toggle.getAttribute('aria-expanded') === 'true');
      // A link to the hash already in the bar fires no hashchange; reveal anyway,
      // in case its disclosure was closed since.
      var link = event.target.closest('a[href^="#"]');
      if (link && link.getAttribute('href') === location.hash) reveal(false);
    });
  }

  if (window.I18N && window.I18N.onReady) window.I18N.onReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
