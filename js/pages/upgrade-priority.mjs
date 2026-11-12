/* The upgrade priority page's list: UpgradePriority.evaluate over the shared save. The stage
   comes from the saved Town Centre level and can be previewed without saving; the role is a
   ledger preference (`preferences.priority.role`), so it travels with the player save.
   upgrade-priority/index.html binds to it with x-data="upgradePriority" on <main>; the goals
   and savings sections nest their own (js/pages/upgrade-goals.mjs, upgrade-savings.mjs).
   Each step's words are js/upgrade-priority-words.js. */
import { Alpine } from '../alpine.mjs';
import UpgradePriority from '../upgrade-priority.mjs';

const SHOWN = 5;
const BLANK = { inventory: {}, preferences: {} };
const stageAt = id => UpgradePriority.rules.stages.findIndex(s => s.id === id);

/* The list and its status line as plain text, from a ledger snapshot (null when the save
   cannot be read) and the previewed stage. */
function present(snapshot, preview) {
  const api = globalThis.BH, say = globalThis.UpgradePriorityWords(api), t = say.t, tpl = say.tpl;
  const result = UpgradePriority.evaluate(snapshot || BLANK, { stage: preview });
  let status = !snapshot ? t('saveFailed') : result.townCenter === null ? t('tcUnknown') : tpl('tcKnown', { level: result.townCenter, stage: t('stage.' + result.own) });
  if (preview && preview !== result.own) status += ' ' + tpl('previewing', { stage: t('stage.' + preview) });
  const steps = result.actions.map((step, at) => {
    const text = say.words(step), target = step.href && say.tool(step.href);
    return {
      key: at + ':' + step.kind, kind: step.kind, n: api.fmt(at + 1), title: text[0], why: text[1], scores: Boolean(step.scores),
      href: target ? '../' + step.href : null, link: target ? api.fill(t('openIn'), { tool: api.tr(target[1], target[2]) }) : ''
    };
  });
  return {
    status, own: result.own, stage: result.stage, role: result.role, roleSaved: result.roleSaved,
    top: steps.slice(0, SHOWN), rest: steps.slice(SHOWN),
    more: tpl('moreN', { n: api.fmt(Math.max(0, steps.length - SHOWN)) }),
    at: stageAt(result.stage || 'foundation')
  };
}

Alpine.data('upgradePriority', () => ({
  view: null, preview: null, kingdom: 0, seal: '', sealState: null,
  // Worked out once per save, language switch, preview or kingdom change.
  init() {
    Alpine.effect(() => {
      Alpine.store('i18n').v; this.kingdom;
      this.view = present(Alpine.store('ledger').snapshot, this.preview);
    });
  },
  get readable() { return Alpine.store('ledger').ready; },
  stageState(id) { return id === this.view.own ? 'current' : id === this.view.stage ? 'preview' : ''; },
  pressed(id) { return String(id === this.view.stage); },
  rolePressed(role) { return String(role === this.view.role); },
  roleDefault(role) { return String(!this.view.roleSaved && role === this.view.role); },
  // A rung or ladder for a later stage, or for the other role, is dimmed.
  later(stage, role) {
    const later = Boolean(stage) && stageAt(stage) > this.view.at;
    return String(later || (Boolean(role) && role !== this.view.role));
  },
  togglePreview(id) {
    const levels = (Alpine.store('ledger').snapshot || {}).buildings, own = levels && levels.levels ? UpgradePriority.stageAt(levels.levels['town-center'] || '') : null;
    this.preview = id === (own && own.id) || id === this.preview ? null : id;
  },
  setRole(role) {
    const t = key => globalThis.BH.tr('priority.' + key, key);
    try { globalThis.Interactions.ledger().setPriorityRole(role); this.seal = t('saved'); this.sealState = 'saved'; }
    catch (cause) { this.seal = t('saveFailed'); this.sealState = 'failed'; }
  }
}));
