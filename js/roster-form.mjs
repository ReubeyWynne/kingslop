/* roster-form.mjs — what every "Your copy" form on a roster shares: the hero roster, the
   master roster and the pet den. Each card's controller writes through `save`, which leaves
   the seal under the form saying saved or failed. */

/** A number field's value: blank is unread (null), anything else a number. */
export function number(input) { return input.value === '' ? null : Number(input.value); }

/** True when a change should not be written: a number the field itself refuses. */
export function refused(input) { return input.matches('input[type="number"]') && !input.validity.valid; }

/** Runs one write. The card's `seal` then holds the key of the line under the form, and its
    `redraw` moves on a failure so the fields read the save back. A failure is reported as
    module:error, as every page module's are. */
export function save(card, root, module, write) {
  try { write(); card.seal = 'saved'; }
  catch (cause) {
    card.seal = 'failed'; card.redraw++;
    root.dispatchEvent(new CustomEvent('module:error', { bubbles: true, detail: { module, message: cause.message || String(cause) } }));
  }
}

/** One dossier open at a time (for browsers without <details name>), scrolled into view when
    its card starts off screen. */
export function opened(details) {
  if (!details.open) return;
  details.ownerDocument.querySelectorAll('details[name="' + details.name + '"][open]').forEach(other => { if (other !== details) other.open = false; });
  const card = details.parentElement, top = card.getBoundingClientRect().top;
  if (top < 0 || top > details.ownerDocument.defaultView.innerHeight * 0.6) card.scrollIntoView({ block: 'start' });
}

export default { number, refused, save, opened };
