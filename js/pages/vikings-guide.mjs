/* The Vikings guide's wave map: twenty waves, each hitting every city, online cities only, or
   HQ; choosing one shows what to do before it. vikings-vengeance/guide/index.html binds to it
   with x-data="vikingsGuide". */
import { Alpine } from '../alpine.mjs';

const ONLINE = [7, 14, 17], HQ = [10, 20];
const KINDS = {
  city: { short: 'City', label: 'every city', detail: w => 'Wave ' + w + ': every city. Reinforce your assigned towns before the hit.' },
  online: { short: 'On', label: 'online cities only', detail: w => 'Wave ' + w + ': online cities only. Offline cities are skipped, so their cover waits for the next wave.' },
  hq: { short: 'HQ', label: 'HQ', detail: w => 'HQ wave ' + w + ': send the agreed share after the wave before it. Return after the hit.' }
};
const kindOf = w => HQ.includes(w) ? 'hq' : ONLINE.includes(w) ? 'online' : 'city';
const WAVES = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1, kind = kindOf(n);
  return { n, kind, short: KINDS[kind].short, label: 'Wave ' + n + ', ' + KINDS[kind].label };
});

Alpine.data('vikingsGuide', () => ({
  waves: WAVES,
  wave: 1,
  get detail() { return KINDS[kindOf(this.wave)].detail(this.wave); }
}));
