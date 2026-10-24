const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');const rules=require('../js/event-rules.js');
const root=path.resolve('_site'), output=path.resolve('.dsh/event-preview');
withBrowser({ root }, async ({ browser, origin }) => {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync(output,{recursive:true});
 const select=(key)=>page.locator('[data-target="event-availability.'+key+'"]');const owned=id=>page.locator('[data-bind="inventory.'+id+'"]');const held=id=>page.locator('[data-held="'+id+'"]');

  await page.goto(origin+'/events/?lang=en');await page.waitForFunction(()=>window.EventRules&&document.querySelector('[data-target="event-availability.total"]').textContent==='0');
  await select('day').selectOption('4');assert.equal(await owned('mithril').inputValue(),'');assert.equal(await held('mithril').isDisabled(),true);
  assert.equal(await page.locator('[data-item="truegold"]').isVisible(),false);await select('all').check();assert.equal(await page.locator('[data-item="truegold"]').isVisible(),true);await select('all').uncheck();
  assert.equal(await page.locator('[data-item="mithril"] [data-points]').textContent(),'Unknown');
  await owned('mithril').fill('10');await owned('forgehammer').fill('25');assert.equal(await select('total').textContent(),'0');
  assert.equal(await owned('hero-widget').count(),0);assert.equal(await owned('master-emblem').count(),0);
  await page.evaluate(()=>{const s=PlayerLedger.shared();s.setBalance('hero-gear-xp',1000000);s.setBalance('spare-mythic-gear',10);s.setBalance('forgehammer',200);const gear=s.heroGear(HeroGear);gear.pieces['inf-helm']=HeroGear.normalisePiece({quality:'mythic',level:100,mastery:10});s.writeHeroGear(gear,HeroGear,{piece:'inf-helm'});});
  assert.equal(await select('total').textContent(),'840,000');
  const town=await context.newPage();await town.goto(origin+'/town-centre/?lang=en');await town.waitForSelector('.town-daybar');
  assert.equal(await town.evaluate(()=>TownCentre.forLedger(PlayerLedger.shared()).day('prep',4).total),840000);await town.close();
  await held('mithril').fill('2');await held('forgehammer').fill('5');await select('target').fill('1000000');
  assert.equal(await select('total').textContent(),'440,000');assert.equal(await select('reserved').textContent(),'400,000');assert.equal(await select('shortfall').textContent(),'560,000');
  assert.equal(await page.evaluate(()=>PlayerLedger.shared().balance('mithril').amount),10,'scenario does not deduct inventory');
  await held('mithril').fill('99');await held('mithril').press('Tab');assert.equal(await held('mithril').inputValue(),'2','invalid reserve restores previous amount');
  await owned('mithril').fill('-1');await owned('mithril').press('Tab');assert.equal(await owned('mithril').inputValue(),'10');
  await select('event').selectOption('brawl');assert.equal(await select('total').textContent(),'206,250');
  await select('event').selectOption('sg');await select('day').selectOption('6');assert.equal(await select('total').textContent(),'0');assert.equal(await select('shortfall').textContent(),'1,000,000');
  await select('event').selectOption('prep');assert.equal(await select('day').inputValue(),'5','day clamps when changing event');await select('day').selectOption('4');
  const other=await context.newPage();await other.goto(origin+'/hero-gear/?lang=en');await other.locator('#gear-mithril').fill('7');await page.waitForFunction(()=>document.querySelector('[data-bind="inventory.mithril"]').value==='7');assert.equal(await select('total').textContent(),'440,000');
  await owned('mithril').fill('8');await other.waitForFunction(()=>document.getElementById('gear-mithril').value==='8');await other.close();
  const save=page.locator('#availability details');await save.locator('summary').click();
  const [download]=await Promise.all([page.waitForEvent('download'),save.locator('[data-action="save-transfer.export"]').click()]);const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.inventory.mithril.amount,8);assert.equal(backup.reservations,undefined);
  backup.inventory.mithril.amount=12;await save.locator('input[type="file"]').setInputFiles({name:'player.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>PlayerLedger.shared().balance('mithril').amount===12);assert.equal(await select('total').textContent(),'840,000');
  backup.schemaVersion=99;await save.locator('input[type="file"]').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#availability [data-target="result-panel.message"]').textContent===I18N.tr('gear.invalidSave'));assert.equal(await page.evaluate(()=>PlayerLedger.shared().balance('mithril').amount),12);
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-held="mithril"]').value==='0');assert.equal(await owned('mithril').inputValue(),'12');
  // Built reference tables are byte-equivalent task/rate pairs from the shared data.
  for(const [event,id]of [['prep','days'],['sg','governor'],['brawl','brawl']]){
   const actual=await page.locator('#'+id+' details.day').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('table.pt tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()))));assert.deepEqual(actual,rules.days(event).map(day=>day.rows.map(row=>[row.label,row.points])));
  }
  for(let day=1;day<=28;day++){await page.locator('#ks-cycle [data-cycle-day="'+day+'"]').click();assert((await page.locator('#ks-card').textContent()).trim().length>0);}
  // Troop days: the card says when to buy the capacity buff and start the tripled batch, from the saved training.
  const troopNotes=async iso=>{const p=await context.newPage();await p.clock.setFixedTime(new Date(iso));await p.goto(origin+'/events/?lang=en');await p.waitForFunction(()=>document.querySelector('#ks-card .today-title, #ks-card .today-kicker'));const out=await p.locator('#ks-card [data-troop-note]').allTextContents();return [p,out];};
  await page.evaluate(()=>{const s=PlayerLedger.shared();s.setTraining('speed',100);s.setTraining('capacity',1000);s.setTraining('inf',10);for(const r of ['bread','wood','stone','iron'])s.setBalance(r,1e9);});
  let [troopPage,notes]=await troopNotes('2026-10-19T00:30:00Z');
  // The weekday's punctuation depends on the runner's ICU data, so only the date and time are pinned.
  assert.equal(notes.length,1); assert.match(notes[0],/^Buy the capacity buff \(3,000 gems\) and start 3,000 troops in each camp by Mon,? 19 Oct, 08:40 UTC, ready for Strongest Governor day 4\. That batch scores 117,000 points, 78,000 more than a normal one\.$/,'3,000 T10 at 76 s each take 63h 20m before 22 Oct');
  await troopPage.close();[troopPage,notes]=await troopNotes('2026-10-20T06:00:00Z');
  assert.equal(notes.length,1); assert.match(notes[0],/^Too late for a tripled batch before Strongest Governor day 4\. Start a normal batch of 1,000 per camp by Wed,? 21 Oct, 02:53 UTC\.$/);
  await troopPage.locator('#ks-cycle [data-cycle-day="11"]').click();assert.deepEqual(await troopPage.locator('#ks-card [data-troop-note]').allTextContents(),['Troop day: collect the batch you started before today, then train with speedups.']);
  await troopPage.locator('#ks-cycle [data-cycle-day="13"]').click();assert.equal(await troopPage.locator('#ks-card [data-troop-note]').count(),0,'one batch per event, on its first best troop day');
  await troopPage.close();await page.evaluate(()=>{const s=PlayerLedger.shared();for(const k of ['speed','capacity','inf'])s.setTraining(k,null);});
  [troopPage,notes]=await troopNotes('2026-10-21T09:00:00Z');assert.match(notes.join(' '),/Strongest Governor day 4 tomorrow is a troop day/);assert.equal(await troopPage.locator('#ks-card [data-troop-note] a').getAttribute('href'),'../town-centre/#town-troops');await troopPage.close();
  const langs=fs.readdirSync('i18n').filter(name=>name.endsWith('.js')).map(name=>name.slice(0,-3));
  for(const lang of langs){await page.goto(origin+'/events/?lang='+lang);await page.waitForFunction(lang=>document.documentElement.lang===lang&&window.I18N&&document.querySelector('[data-target="event-availability.coverage"]').textContent.length>0,lang);
   for(const width of [320,768]){await page.setViewportSize({width,height:900});const overflow=await page.locator('#availability').evaluate(el=>[el,...el.querySelectorAll('.availability-item,.availability-controls,.availability-result')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(overflow,[],lang+' at '+width);}
   assert.equal(await page.locator('#availability h2').textContent(),await page.evaluate(()=>I18N.tr('ks.available.title')));
   if(lang==='en'||lang==='ar')await page.locator('#availability').screenshot({path:path.join(output,lang+'.png')});
  }
  assert.deepEqual(errors,[]);console.log('Event availability: ledger, cross-tab changes, reserves, targets, save transfer, reference tables, 28 cycle days, 17 languages and responsive layouts pass.');
}).catch(error=>{console.error(error);process.exitCode=1;});
