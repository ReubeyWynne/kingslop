/* The motif glossary (/motifs/): the few specimens that answer a click. motifs/index.html
   binds an ink-well to x-data="glossaryLevel(n)", which counts 1 to 10 and round again, and
   the undo specimen to x-data="glossaryReset": Reset clears the gear and opens the toast for
   six seconds, Undo puts the gear back. The page is English only. */
import { Alpine } from '../alpine.mjs';

Alpine.data('glossaryLevel', start => ({
  level: start,
  bump() { this.level = this.level % 10 + 1; }
}));

Alpine.data('glossaryReset', () => ({
  set: true, toast: false, timer: null,
  get gear() { return this.set ? '12 pieces set' : 'nothing set'; },
  reset() {
    this.set = false; this.toast = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.toast = false; }, 6000);
  },
  undo() { this.set = true; this.toast = false; clearTimeout(this.timer); }
}));
