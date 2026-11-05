/* The motif glossary (/motifs/): the few specimens that answer a click. */
(function () {
  var gear = document.querySelector('[data-glossary="gear"]');
  var toast = document.querySelector('[data-glossary="toast"]');
  var timer;
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-glossary]');
    if (!el) return;
    var kind = el.getAttribute('data-glossary');
    if (kind === 'bump') {
      var n = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
      el.textContent = 'Lv ' + (n % 10 + 1);
    } else if (kind === 'reset' && gear && toast) {
      gear.textContent = 'nothing set';
      toast.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { toast.hidden = true; }, 6000);
    } else if (kind === 'undo' && gear && toast) {
      gear.textContent = '12 pieces set';
      toast.hidden = true;
      clearTimeout(timer);
    }
  });
})();
