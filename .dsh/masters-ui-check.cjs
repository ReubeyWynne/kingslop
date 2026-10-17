// Masters page and the Town Centre's Masters shelf in a browser: roster, dossiers as links, the shared save, KvK points and layout in every language.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const masters=require('../_data/masters.json').masters;
const root=path.resolve('_site'),output=path.resolve('.dsh/masters-preview');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;fs.mkdirSync(output,{recursive:true});
const ready=p=>p.waitForFunction(()=>![...document.querySelectorAll('.master-mine')].some(f=>f.disabled));
const ledger=()=>page.evaluate(()=>PlayerLedger.shared().masters());
try{
 await page.goto(origin+'/masters/?lang=en');await ready(page);
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('[data-master]').count(),masters.length);
 for(const m of masters){const card=page.locator('#master-'+m.id);assert.equal(await card.locator('h3').textContent(),m.name);assert.equal(await card.locator('.master-classes li').count(),11);assert.equal(await card.locator('.master-skills li').count(),4);assert.equal(await card.getAttribute('data-verified'),String(m.verified));}
 const images=await page.locator('.master-roster img, .master-where img').evaluateAll(n=>n.map(i=>i.getAttribute('src')));for(const src of images)assert(fs.existsSync(path.resolve(root,'masters',src)),src);
 assert.deepEqual(await page.locator('.master-band').evaluateAll(n=>n.map(x=>x.dataset.day)),['113','155','197','281']);
 assert.equal(await page.locator('.master-dossier[open]').count(),0);
 // Every dossier is a link, and one is open at a time.
 await page.goto(origin+'/masters/?lang=en#master-cassia');await ready(page);assert.equal(await page.locator('#master-cassia .master-dossier').getAttribute('open'),'');
 await page.locator('#master-valora summary').click();assert.equal(await page.locator('.master-dossier[open]').count(),1);assert.match(page.url(),/#master-valora$/);
 // Recording a master writes the shared save.
 const form=page.locator('#master-valora .master-mine');assert.equal(await form.locator('[data-field="affinity"]').isDisabled(),true);
 await form.locator('[data-field="owned"]').check();await page.waitForFunction(()=>PlayerLedger.shared().masters().roster.valora);
 await form.locator('[data-field="affinity"]').fill('29');await form.locator('[data-field="affinity"]').press('Tab');
 assert.equal(await page.locator('#master-valora [data-target="master-directory.ready"]').isVisible(),true);
 await form.locator('[data-field="ready"]').check();
 for(const [i,l] of [[0,'3'],[1,'2'],[2,'0'],[3,'0']])await form.locator('[data-field="skill"][data-skill="'+i+'"]').selectOption(l);
 await form.locator('[data-field="emblems"]').fill('10');await form.locator('[data-field="emblems"]').press('Tab');
 assert.deepEqual((await ledger()).roster.valora,{affinity:29,ready:true,skills:[3,2,0,0]});assert.equal((await ledger()).emblems.valora,10);
 assert.match(await page.locator('#master-valora .master-mine-line').textContent(),/Lv 29\s*Acquaintance 2/);assert.equal(await page.locator('#master-valora [data-portrait="affinity"]').textContent(),'29');
 assert.match(await page.locator('#master-valora [data-target="master-directory.next"]').textContent(),/Acquaintance 3 at affinity 30, 15 emblems. Waiting/);
 assert.equal(await page.locator('#master-valora .master-classes li[data-reached]').count(),3);
 await form.locator('[data-field="affinity"]').fill('30');await form.locator('[data-field="affinity"]').press('Tab');assert.equal((await ledger()).roster.valora.ready,false);assert.equal(await page.locator('#master-valora [data-target="master-directory.ready"]').isVisible(),false);
 await form.locator('[data-field="affinity"]').fill('29');await form.locator('[data-field="affinity"]').press('Tab');await form.locator('[data-field="ready"]').check();
 assert.match(await page.locator('[data-target="master-directory.count"]').textContent(),/8 masters · 1 yours/);
 // KvK points: only what the masters can take.
 assert.match(await page.locator('[data-target="master-points.coverage"]').textContent(),/General Master Emblems|Master's Manuscript/);
 await page.locator('.master-bag [data-bind="inventory.general-master-emblem"]').fill('100');await page.locator('.master-bag [data-bind="inventory.masters-manuscript"]').fill('1000');await page.locator('.master-bag [data-bind="inventory.masters-manuscript"]').press('Tab');
 const plan=await page.evaluate(()=>MasterSpend.plan(PlayerLedger.shared().snapshot()));const expected=15*6000+plan.items['masters-manuscript'].amount*60;
 await page.waitForFunction(n=>document.querySelector('[data-target="master-points.total"]').textContent.replace(/\D/g,'')===String(n),expected);
 assert.equal(await page.locator('[data-target="master-points.rows"] tr').count(),1);assert.match(await page.locator('[data-target="master-points.coverage"]').textContent(),/Every master count/);
 assert.match(await page.locator('[data-target="master-points.left"]').textContent(),/95 general emblems/);
 await page.setViewportSize({width:390,height:844});await page.locator('#roster').screenshot({path:path.join(output,'masters-open-390.png')});
 await page.locator('#master-valora summary').click();await page.setViewportSize({width:1280,height:900});await page.locator('#roster').screenshot({path:path.join(output,'masters-1280.png')});await page.setViewportSize({width:390,height:844});
 // The Town Centre shelf shows the same save and scores the same pieces.
 const town=await context.newPage();town.on('pageerror',e=>errors.push(e.message));await town.goto(origin+'/town-centre/?lang=en#town-masters');await ready(town);
 assert.equal(await town.locator('#town-masters').isVisible(),true);assert.equal(await town.locator('#town-masters [data-master]').count(),masters.length);
 assert.equal(await town.locator('#town-masters .master-bag').count(),0);assert.equal(await town.locator('#town-bag [data-count="master-emblem"]').count(),0);
 assert.equal(await town.locator('#town-masters [data-count="general-master-emblem"] [data-amount]').textContent(),'100');
 assert.equal(await town.locator('#master-valora').getAttribute('data-owned'),'true');
 const best=await town.evaluate(()=>TownCentre.best(PlayerLedger.shared().snapshot(),'prep').lines.filter(l=>/^master/.test(l.id)).map(l=>l.points).reduce((a,b)=>a+b,0));assert.equal(best,expected);
 await town.locator('#master-roman summary').click();await town.locator('#master-roman [data-field="owned"]').check();await page.waitForFunction(()=>document.querySelector('#master-roman').dataset.owned==='true');
 await town.locator('#town-masters').screenshot({path:path.join(output,'town-masters-390.png')});await town.close();
 // Every language at every width: nothing overflows.
 const langs=fs.readdirSync('i18n').filter(f=>f.endsWith('.js')).map(f=>f.slice(0,-3));
 for(const lang of langs){await page.goto(origin+'/masters/?lang='+lang+'#master-cassia');await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);await ready(page);
  assert.equal(await page.locator('h1').textContent(),await page.evaluate(()=>I18N.tr('masters.title')));
  for(const width of [320,390,768,1280,1920]){await page.setViewportSize({width,height:900});const failures=await page.evaluate(()=>[...document.querySelectorAll('.master-roster,.master-card,.master-bag,.master-dossier-body,.hero-points-total,.master-where,.topbar,.ev-switch')].filter(el=>el.getClientRects().length&&el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(failures,[],lang+' at '+width);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' page at '+width);}
  if(lang==='ar'){await page.setViewportSize({width:390,height:844});await page.locator('#roster').screenshot({path:path.join(output,'ar.png')});}
 }
 // Without JavaScript the roster and dossiers still read.
 const nojs=await browser.newContext({javaScriptEnabled:false});const plain=await nojs.newPage();await plain.goto(origin+'/masters/');assert.equal(await plain.locator('[data-master]').count(),masters.length);assert.equal(await plain.locator('.master-mine [data-field="owned"]').first().isDisabled(),true);await plain.locator('#master-pan summary').click();assert.equal(await plain.locator('#master-pan .master-skills').isVisible(),true);await nojs.close();
 await page.goto(origin+'/?lang=en');assert.equal(await page.locator('#tools a[href="masters/"]').count(),1);
 assert.deepEqual(errors,[]);console.log('Masters UI: roster, deep-linked dossiers, the shared save, class gates, KvK points, the Town Centre shelf and totals, static fallback and 17 languages at 5 widths pass.');
}finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
