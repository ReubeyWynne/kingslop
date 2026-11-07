// Every dictionary against English (i18n/en.js, the source):
// - each file registers itself under its own code;
// - a key every language shares carries the same {tokens} as English, so a translated
//   sentence never drops or invents one of the reader's numbers;
// - a key English gains is translated in every language, unless it is listed in
//   .dsh/i18n-baseline.json as untranslated (the keys that were untranslated when this
//   check was added; translating one means taking it off the list);
// - a dictionary holds no key English has dropped, other than Bear Hunt's generated
//   `bh.dynamic.*` keys and the ones listed as unused.
// Run: node .dsh/i18n-parity-check.cjs   (--write rewrites the baseline from today's files)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dir = path.join(__dirname, '..', 'i18n'), baselineFile = path.join(__dirname, 'i18n-baseline.json');

const dicts = {};
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
  const code = file.slice(0, -3), sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, file), 'utf8'), sandbox, { filename: file });
  const data = sandbox.window.__BH_I18N_DATA || {};
  assert.deepEqual(Object.keys(data), [code], file + ' registers itself as "' + code + '"');
  dicts[code] = data[code];
}
const en = dicts.en, langs = Object.keys(dicts).filter(c => c !== 'en');
assert(en && langs.length, 'English and at least one translation load');

const tokens = v => typeof v === 'string' ? [...new Set(v.match(/\{[A-Za-z0-9_]+\}/g) || [])].sort().join(' ') : '';
const generated = k => k.startsWith('bh.dynamic.');

const missing = new Set(), unused = new Set(), errors = [];
for (const code of langs) {
  const d = dicts[code];
  for (const k of Object.keys(en)) if (!(k in d)) missing.add(k);
  for (const k of Object.keys(d)) {
    if (!(k in en)) { if (!generated(k)) unused.add(k); continue; }
    if (tokens(d[k]) !== tokens(en[k])) errors.push(code + ' ' + k + ': tokens {' + tokens(d[k]) + '} but English has {' + tokens(en[k]) + '}');
  }
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(baselineFile, JSON.stringify({
    note: 'Keys left untranslated, or unused, when .dsh/i18n-parity-check.cjs was added. Shrink these lists; never grow them by hand.',
    untranslated: [...missing].sort(), unused: [...unused].sort()
  }, null, 1) + '\n');
  console.log('wrote', path.relative(process.cwd(), baselineFile), missing.size, 'untranslated,', unused.size, 'unused');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const allowMissing = new Set(baseline.untranslated), allowUnused = new Set(baseline.unused);
for (const code of langs) {
  const d = dicts[code];
  for (const k of Object.keys(en)) if (!(k in d) && !allowMissing.has(k)) errors.push(code + ' has no "' + k + '": translate it in every dictionary');
  for (const k of Object.keys(d)) if (!(k in en) && !generated(k) && !allowUnused.has(k)) errors.push(code + ' still has "' + k + '", which English no longer has: remove it');
}
const done = [...allowMissing].filter(k => !missing.has(k));
const gone = [...allowUnused].filter(k => !unused.has(k));
if (done.length) errors.push('now translated everywhere, take off .dsh/i18n-baseline.json "untranslated": ' + done.join(', '));
if (gone.length) errors.push('now removed everywhere, take off .dsh/i18n-baseline.json "unused": ' + gone.join(', '));

if (errors.length) {
  console.error(errors.slice(0, 40).join('\n') + (errors.length > 40 ? '\n… and ' + (errors.length - 40) + ' more' : ''));
  process.exit(1);
}
console.log('i18n parity:', langs.length, 'translations of', Object.keys(en).length, 'English keys;', missing.size, 'untranslated and', unused.size, 'unused, as in the baseline');
