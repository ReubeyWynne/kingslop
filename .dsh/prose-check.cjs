#!/usr/bin/env node
/* Prose check for the English dictionary (i18n/en.js).

   Flags the patterns docs/prose-standard.md calls the worst offenders:
   stiff uncontracted negatives, runs of short clipped sentences, verb lists
   used as an instruction, semicolons, label-colon openers on prose, and
   very long sentences. It is a ratchet: keys that already broke a rule are
   listed in .dsh/prose-baseline.json and only warn, so old copy can be fixed
   bit by bit while new or edited copy must pass.

     node .dsh/prose-check.cjs            check (fails on new problems)
     node .dsh/prose-check.cjs --report   list every problem, baseline or not
     node .dsh/prose-check.cjs --update   rewrite the baseline to match today
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'prose-baseline.json');

function loadEnglish() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'i18n/en.js'), 'utf8'), sandbox);
  return sandbox.window.__BH_I18N_DATA.en;
}

// Plain text of a value: no tags, no {placeholders}, no entities.
function plain(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, 'N')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentences(text) {
  return text
    .split(/(?<=[.!?…])\s+(?=[A-Z“"‘'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

// Only real sentences are checked: labels, chips and short fragments are not prose.
function isProse(text) {
  return words(text).length >= 8 && /[.!?]$/.test(text);
}

const STIFF = /\b(cannot|can not|do not|does not|did not|is not|are not|was not|were not|will not|would not|should not|could not|has not|have not|it is|there is|you are|you will|you have not)\b/i;

const RULES = {
  // "A report cannot compare…" reads like a contract. Contract it, or rephrase.
  stiff(text) {
    const m = text.match(STIFF);
    return m && `uncontracted “${m[0]}”`;
  },
  // Three or more short sentences in a row, none over 12 words: telegraphic.
  choppy(text) {
    const s = sentences(text);
    let run = 0;
    for (const sentence of s) {
      run = words(sentence).length <= 12 ? run + 1 : 0;
      if (run >= 3) return `${run} short sentences in a row`;
    }
    return null;
  },
  // "Pick, drop or paste them." Say the one thing most people do.
  verbList(text) {
    const m = text.match(/(?:^|[.!?]\s+)([A-Z][a-z]+), ([a-z]+),? (?:or|and) ([a-z]+) (?:them|it|one|a|an|the)\b/);
    return m && `verb list “${m[1]}, ${m[2]} or ${m[3]}”`;
  },
  // Semicolons in UI copy are a sign two sentences were jammed together.
  semicolon(text) {
    return text.includes(';') ? 'semicolon' : null;
  },
  // "Bear: the expected damage of…" – a label stuck on the front of a sentence.
  labelColon(text) {
    const m = text.match(/^([A-Z][\w’']*(?: [\w’']+){0,3}): [a-z]/);
    return m && `label opener “${m[1]}:”`;
  },
  // Over 32 words is hard to hold in your head on a phone.
  long(text) {
    const n = Math.max(...sentences(text).map((s) => words(s).length));
    return n > 32 ? `${n}-word sentence` : null;
  },
};

function problems(dict) {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue;
    const text = plain(value);
    if (!isProse(text)) continue;
    for (const [rule, test] of Object.entries(RULES)) {
      const hit = test(text);
      if (hit) (out[key] ||= {})[rule] = hit;
    }
  }
  return out;
}

const dict = loadEnglish();
const found = problems(dict);
const mode = process.argv[2] || '';

if (mode === '--update') {
  const baseline = {};
  for (const key of Object.keys(found).sort()) baseline[key] = Object.keys(found[key]).sort();
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 1) + '\n');
  console.log(`Baseline written: ${Object.keys(baseline).length} keys.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const fresh = [];
const known = [];
for (const [key, hits] of Object.entries(found)) {
  for (const [rule, why] of Object.entries(hits)) {
    ((baseline[key] || []).includes(rule) ? known : fresh).push(`${key}: ${why}`);
  }
}
const fixed = Object.entries(baseline).flatMap(([key, rules]) =>
  rules.filter((rule) => !(found[key] && found[key][rule])).map((rule) => `${key}: ${rule}`));

if (mode === '--report') {
  for (const line of [...fresh, ...known].sort()) console.log(line);
  console.log(`\n${fresh.length + known.length} problems (${fresh.length} new, ${known.length} in the baseline).`);
  process.exit(0);
}

if (fixed.length) {
  console.log(`Fixed since the baseline (run with --update to drop them):\n  ${fixed.join('\n  ')}\n`);
}
if (fresh.length) {
  console.error('English copy breaks the prose standard (docs/prose-standard.md):');
  for (const line of fresh.sort()) console.error('  ' + line);
  console.error('\nRewrite the copy. Only if a rule is wrong for that string, run with --update and say why in the PR.');
  process.exit(1);
}
console.log(`Prose check passed. ${known.length} older problems remain in the baseline.`);
