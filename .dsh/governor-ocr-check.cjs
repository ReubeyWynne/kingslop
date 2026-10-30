// The Governor Profile reader against players' screenshots (.dsh/governor-fixtures, player
// panels blanked), in the browser so the images decode as they do for a visitor.
//   node .dsh/governor-ocr-check.cjs              check every reading against truth.json
//   node .dsh/governor-ocr-check.cjs --signatures print the charm outlines for SEEN in js/governor-ocr.js
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), fixtures = path.resolve('.dsh/governor-fixtures');
const truth = JSON.parse(fs.readFileSync(path.join(fixtures, 'truth.json'), 'utf8'));
const shots = Object.keys(truth).filter(name => !name.startsWith('_')), signatures = process.argv.includes('--signatures');

withBrowser({ root, mounts: { '/fixtures/': fixtures } }, async ({ browser, origin }) => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/governor-gear/?lang=en');
  await page.addScriptTag({ url: origin + '/js/governor-ocr.js' });
  const readings = await page.evaluate(async ({ shots, order, signatures }) => {
    const O = window.GovernorOCR, data = window.GovernorData;
    const pixels = img => { const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
    const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(pixels(img)); img.onerror = () => reject(new Error(src)); img.src = src; });
    const art = { gear: {}, charms: {} }, jobs = [], looks = [...new Set(data.gear.levels.map(row => row.tier + '-' + row.grade))];
    data.gear.pieces.forEach(piece => { art.gear[piece.id] = {}; looks.forEach(look => jobs.push(load('/img/governor/gear/' + piece.id + '-' + look + '.webp').then(px => { art.gear[piece.id][look] = px; }))); });
    data.troops.forEach(troop => { art.charms[troop] = {}; data.charms.levels.forEach((row, i) => jobs.push(load('/img/governor/charms/' + troop + '-' + (i + 1) + '.webp').then(px => { art.charms[troop][i + 1] = px; }))); });
    await Promise.all(jobs);
    const prepared = O.prepare(art), out = {};
    // Outlines are measured against the art alone, so a level's own SEEN entry cannot vouch for itself.
    if (signatures) O.outlines({});
    for (const name of shots.concat('gear-screen.jpg')) {
      const shot = await load('/fixtures/' + name), small = document.createElement('canvas');
      small.width = 360; small.height = Math.round(shot.height * 360 / shot.width);
      const c = document.createElement('canvas'); c.width = shot.width; c.height = shot.height; c.getContext('2d').putImageData(shot, 0, 0);
      small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
      const probe = O.find(small.getContext('2d').getImageData(0, 0, small.width, small.height), prepared), r = O.read(shot, prepared);
      out[name] = { probe, found: r.found, gear: order.map(id => r.gear[id]).map(g => ({ got: g.tier + '-' + g.grade + '-' + g.stars, sure: g.confidence })),
        charms: order.map(id => [1, 2, 3].map(c => { const x = r.charms[id + '-' + c]; return { got: x.level, sure: x.confidence, outline: signatures && x.outline ? Array.from(x.outline) : null }; })) };
    }
    return out;
  }, { shots, order: truth._order, signatures });

  if (signatures) {
    const sum = {}, count = {};
    shots.forEach(name => truth[name].charms.forEach((levels, i) => levels.forEach((level, c) => {
      const outline = readings[name].charms[i][c].outline;
      if (!outline) return;
      sum[level] = sum[level] || new Array(outline.length).fill(0); count[level] = (count[level] || 0) + 1;
      outline.forEach((v, k) => { sum[level][k] += v; });
    })));
    const hex = {};
    Object.keys(sum).forEach(level => {
      const bits = sum[level].map(v => v / count[level] >= 0.5 ? 1 : 0);
      let h = ''; for (let k = 0; k < bits.length; k += 4) h += ((bits[k] << 3) | (bits[k + 1] << 2) | (bits[k + 2] << 1) | bits[k + 3]).toString(16);
      hex[level] = h;
    });
    console.log(JSON.stringify(hex, null, 1));
    return;
  }

  const DOUBT = 0.75;
  let gearRight = 0, gearAll = 0, charmRight = 0, charmAll = 0;
  const sureWrong = [];
  shots.forEach(name => {
    const r = readings[name];
    assert.ok(r.probe > 0.5, name + ' is known as a Governor Profile at the dock\'s 360px');
    assert.equal(r.found, 6, name + ' places all six cards');
    truth[name].gear.forEach((want, i) => { const g = r.gear[i]; gearAll++; if (g.got === want) gearRight++; else if (g.sure >= DOUBT) sureWrong.push(name + ' ' + truth._order[i] + ' ' + g.got + ' for ' + want); });
    truth[name].charms.forEach((levels, i) => levels.forEach((want, c) => { const x = r.charms[i][c]; charmAll++; if (x.got === want) charmRight++; else if (x.sure >= DOUBT) sureWrong.push(name + ' ' + truth._order[i] + '-' + (c + 1) + ' ' + x.got + ' for ' + want); }));
  });
  assert.equal(readings['gear-screen.jpg'].probe, 0, 'the Governor Gear screen is not a profile');
  assert.equal(readings['gear-screen.jpg'].found, 0);
  assert.deepEqual(sureWrong, [], 'a wrong reading is always flagged for a second look');
  assert.ok(gearRight / gearAll >= 0.95, 'gear ' + gearRight + '/' + gearAll);
  assert.ok(charmRight / charmAll >= 0.95, 'charms ' + charmRight + '/' + charmAll);
  assert.deepEqual(errors, []);
  console.log('Governor Profile reader: ' + shots.length + ' screenshots, gear ' + gearRight + '/' + gearAll + ', charms ' + charmRight + '/' + charmAll + ', every miss flagged, the Gear screen turned away.');
}).catch(error => { console.error(error); process.exitCode = 1; });
