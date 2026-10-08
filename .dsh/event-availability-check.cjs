const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');const rules=require('../js/event-rules.js');
const root=path.resolve('_site'), output=path.resolve('.dsh/event-preview');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true}), context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;fs.mkdirSync(output,{recursive:true});
 const select=(key)=>page.locator('[data-target="event-availability.'+key+'"]');const owned=id=>page.locator('[data-bind="inventory.'+id+'"]');const held=id=>page.locator('[data-held="'+id+'"]');
 try{
  await page.goto(origin+'/events/?lang=en');await page.waitForFunction(()=>window.EventRules&&document.querySelector('[data-target="event-availability.total"]').textContent==='0');
  await select('day').selectOption('4');assert.equal(await owned('mithril').inputValue(),'');assert.equal(await held('mithril').isDisabled(),true);
  assert.equal(await page.locator('[data-item="mithril"] [data-points]').textContent(),'Unknown');
  await owned('mithril').fill('10');await owned('forgehammer').fill('25');await owned('hero-widget').fill('3');assert.equal(await select('total').textContent(),'524,000');
  await held('mithril').fill('2');await held('forgehammer').fill('5');await select('target').fill('1000000');
  assert.equal(await select('total').textContent(),'424,000');assert.equal(await select('reserved').textContent(),'100,000');assert.equal(await select('shortfall').textContent(),'576,000');
  assert.equal(await page.evaluate(()=>PlayerLedger.shared().balance('mithril').amount),10,'scenario does not deduct inventory');
  await held('mithril').fill('99');await held('mithril').press('Tab');assert.equal(await held('mithril').inputValue(),'2','invalid reserve restores previous amount');
  await owned('mithril').fill('-1');await owned('mithril').press('Tab');assert.equal(await owned('mithril').inputValue(),'10');
  await select('event').selectOption('brawl');assert.equal(await select('total').textContent(),'198,750');
  await select('event').selectOption('sg');await select('day').selectOption('6');assert.equal(await select('total').textContent(),'0');assert.equal(await select('shortfall').textContent(),'1,000,000');
  await select('event').selectOption('prep');assert.equal(await select('day').inputValue(),'5','day clamps when changing event');await select('day').selectOption('4');
  const other=await context.newPage();await other.goto(origin+'/hero-gear/?lang=en');await other.locator('#gear-mithril').fill('7');await page.waitForFunction(()=>document.querySelector('[data-bind="inventory.mithril"]').value==='7');assert.equal(await select('total').textContent(),'304,000');
  await owned('mithril').fill('8');await other.waitForFunction(()=>document.getElementById('gear-mithril').value==='8');await other.close();
  const save=page.locator('#availability details');await save.locator('summary').click();
  const [download]=await Promise.all([page.waitForEvent('download'),save.locator('[data-action="save-transfer.export"]').click()]);const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.inventory.mithril.amount,8);assert.equal(backup.reservations,undefined);
  backup.inventory.mithril.amount=11;await save.locator('input[type="file"]').setInputFiles({name:'player.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>PlayerLedger.shared().balance('mithril').amount===11);assert.equal(await select('total').textContent(),'464,000');
  backup.schemaVersion=99;await save.locator('input[type="file"]').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#availability [data-target="result-panel.message"]').textContent.length>0);assert.equal(await page.evaluate(()=>PlayerLedger.shared().balance('mithril').amount),11);
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-held="mithril"]').value==='0');assert.equal(await owned('mithril').inputValue(),'11');
  // Built reference tables are byte-equivalent task/rate pairs from the shared data.
  for(const [event,id]of [['prep','days'],['sg','governor'],['brawl','brawl']]){
   const actual=await page.locator('#'+id+' details.day').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('table.pt tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()))));assert.deepEqual(actual,rules.days(event).map(day=>day.rows.map(row=>[row.label,row.points])));
  }
  for(let day=1;day<=28;day++){await page.locator('#ks-cycle [data-cycle-day="'+day+'"]').click();assert((await page.locator('#ks-card').textContent()).trim().length>0);}
  const langs=fs.readdirSync('i18n').filter(name=>name.endsWith('.js')).map(name=>name.slice(0,-3));
  for(const lang of langs){await page.goto(origin+'/events/?lang='+lang);await page.waitForFunction(lang=>document.documentElement.lang===lang&&window.I18N&&document.querySelector('[data-target="event-availability.coverage"]').textContent.length>0,lang);
   for(const width of [320,768]){await page.setViewportSize({width,height:900});const overflow=await page.locator('#availability').evaluate(el=>[el,...el.querySelectorAll('.availability-item,.availability-controls,.availability-result')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(overflow,[],lang+' at '+width);}
   assert.equal(await page.locator('#availability h2').textContent(),await page.evaluate(()=>I18N.tr('ks.available.title')));
   if(lang==='en'||lang==='ar')await page.locator('#availability').screenshot({path:path.join(output,lang+'.png')});
  }
  assert.deepEqual(errors,[]);console.log('Event availability: ledger, cross-tab changes, reserves, targets, save transfer, reference tables, 28 cycle days, 17 languages and responsive layouts pass.');
 }finally{await context.close();await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
