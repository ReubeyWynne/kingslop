/* ═══════════════════════════════════════════════════════════
   The planner frame (css/sheet.css, INTERACTIONS.md)

   A calculator laid out as yours beside the answer: the section binds
   x-data="planner('heroes|masters|pets')". Its `tabs` row (data-tabs-bind="view")
   picks which half a phone shows, as the section's data-view ("mine" or
   "answer"). It opens on the answer when the save already owns something of
   its kind, and a link into either half opens that one; later edits never move
   the reader. While nothing is owned, the shelf points to the roster in your
   half (_includes/planner.html).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  document.addEventListener('alpine:init', function () {
    window.Alpine.data('planner', function (kind) {
      return {
        view: null,
        // How many entries of this kind the save owns.
        get owned() {
          var saved = window.Alpine.store('ledger').snapshot, roster = (saved && saved[kind] && saved[kind].roster) || {};
          return Object.keys(roster).filter(function (key) { return roster[key]; }).length;
        },
        init() { if (!this.follow()) this.view = this.owned ? 'answer' : 'mine'; },
        // A link to anything inside one half opens that half on a phone.
        follow() {
          var id = decodeURIComponent(location.hash.slice(1)), target = id && document.getElementById(id);
          var half = target && this.$root.contains(target) && target.closest('[data-half]');
          if (half) this.view = half.dataset.half;
          return Boolean(half);
        },
        pick(detail) {
          if (detail.binding !== 'view') return;
          this.view = detail.value;
          var tabs = this.$root.querySelector('.sheet-views');
          if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
        }
      };
    });
  });
})();
