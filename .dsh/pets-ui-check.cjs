// Pets page in a browser: pens, deep-linked dossiers, taming into the shared save, care that
// decays with the clock, petting by rubbing and feeding by dragging food onto the pet, the
// Advances table, and layout in every language.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const pets=require('../_data/pets.json').pets;
const root=path.resolve('_site'),output=path.resolve('.dsh/pets-preview');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;fs.mkdirSync(output,{recursive:true});
// The care and layout runs draw the baked frames (no WebGL here); the live pets get their own browser below.
const browser=await chromium.launch({headless:true,args:['--disable-3d-apis']});const errors=[];
try{
 // Six in the morning on the page's clock, so nobody is asleep yet.
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'UTC'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-17T06:00:00Z')});
 const ready=()=>page.waitForFunction(()=>![...document.querySelectorAll('.pet-card [data-field="owned"]')].some(f=>f.disabled));
 const pen=id=>page.locator('#pet-'+id+' [data-pen]');
 // Rub a pet back and forth with the mouse: three turns make a pat.
 const rub=async id=>{const card=page.locator('#pet-'+id);await card.scrollIntoViewIfNeeded();const box=await card.locator('.pet-stroke').boundingBox(),y=box.y+box.height*.45;
  await page.mouse.move(box.x+box.width*.3,y);for(const x of [.7,.3,.7,.3])await page.mouse.move(box.x+box.width*x,y,{steps:4});await page.mouse.move(1,1);};
 // Carry the food from the bowl and let it go over the pet (or anywhere else).
 const drag=async(id,onto=true)=>{const card=page.locator('#pet-'+id);await card.scrollIntoViewIfNeeded();const food=await card.locator('.pet-food').boundingBox(),box=await card.locator('[data-pen]').boundingBox();
  await page.mouse.move(food.x+food.width/2,food.y+food.height/2);await page.mouse.down();
  await page.mouse.move(onto?box.x+box.width*.8:food.x+food.width*3,onto?box.y+box.height*.4:food.y+food.height/2,{steps:8});
  if(onto)assert.equal(await pen(id).getAttribute('data-sniff'),'');assert.equal(await card.locator('.pet-food').getAttribute('data-carried'),'');
  assert.match(await card.locator('.pet-food').getAttribute('style'),/--cx: -?\d+; --cy: -?\d+;/);
  await page.mouse.up();assert.equal(await card.locator('.pet-food').getAttribute('style'),'');assert.equal(await pen(id).getAttribute('data-sniff'),null);};
 await page.goto(origin+'/pets/?lang=en');await ready();
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.pet-card').count(),pets.length);
 assert.deepEqual(await page.locator('.pet-band').evaluateAll(n=>n.map(x=>x.dataset.generation)),['1','2','3','4','5','6','7']);
 for(const p of pets){const card=page.locator('#pet-'+p.id);assert.equal(await card.locator('.pet-name b').textContent(),p.name);assert.equal(await card.locator('.pet-ladder tbody tr').count(),p.skill.ladder.length);assert.equal(await card.locator('.pet-ladder thead th[data-level]').count(),p.advances);}
 // Untamed pets stand in their pens without care controls.
 assert.equal(await page.locator('.pet-care:visible').count(),0);assert.equal(await pen('lion').getAttribute('data-mood'),'content');
 assert.equal(await page.locator('#pet-moose .ascii-mini--portrait > [data-ink="0"]').evaluate(n=>getComputedStyle(n,'::before').animationName),'ascii-portrait-moose-0');
 // Every dossier is a link, and one is open at a time.
 await page.goto(origin+'/pets/?lang=en#pet-moose');await ready();assert.equal(await page.locator('#pet-moose .pet-dossier').getAttribute('open'),'');
 await page.locator('#pet-gray-wolf summary').click();assert.equal(await page.locator('.pet-dossier[open]').count(),1);await page.waitForURL(/#pet-gray-wolf$/);
 // Taming writes the shared save and opens the pen's care.
 await page.locator('#pet-gray-wolf [data-field="owned"]').check();await page.waitForFunction(()=>PlayerLedger.shared().pets().roster['gray-wolf']);
 assert.equal(await page.locator('#pet-gray-wolf .pet-care').isVisible(),true);
 assert.equal(await page.locator('#pet-gray-wolf [data-meter="fullness"]').getAttribute('aria-valuenow'),'60');
 assert.equal(await page.locator('#pet-gray-wolf [data-meter="affection"]').getAttribute('aria-valuenow'),'50');
 assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'content');
 const level=page.locator('#pet-gray-wolf [data-field="level"]');await level.fill('20');await level.press('Tab');
 assert.equal(await page.locator('#pet-gray-wolf [data-target="pet-den.advanced"]').isVisible(),true);
 assert.match(await page.locator('#pet-gray-wolf [data-target="pet-den.next"]').textContent(),/level 20: 30 Growth Manuals\. Worth 50,000 KvK prep points/);
 await page.locator('#pet-gray-wolf [data-field="advanced"]').check();
 assert.deepEqual((await page.evaluate(()=>PlayerLedger.shared().pets().roster))['gray-wolf'],{level:20,advanced:true});
 assert.equal(await page.locator('#pet-gray-wolf .pet-ladder td[data-reached]').count(),2);
 assert.match(await page.locator('#pet-gray-wolf [data-target="pet-den.next"]').textContent(),/level 30:/);
 // There are no buttons to read: a click on the pet or its food does nothing.
 assert.deepEqual(await page.locator('#pet-gray-wolf .pet-care button:visible').evaluateAll(n=>n.map(b=>b.textContent.trim()+(b.querySelector('img')||{}).src)),[origin+'/img/items/stamina.webp']);
 await page.locator('#pet-gray-wolf .pet-stroke').click();await page.locator('#pet-gray-wolf .pet-food').click();
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),null);assert.equal(await page.locator('#pet-gray-wolf [data-meter="affection"]').getAttribute('aria-valuenow'),'50');
 // Rubbing the pet pets it and dragging food onto it feeds it; each shows a reaction, which clears on its own.
 await rub('gray-wolf');
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'pet');assert.equal(await page.locator('#pet-gray-wolf [data-meter="affection"]').getAttribute('aria-valuenow'),'70');
 assert.equal(await pen('gray-wolf').evaluate(n=>getComputedStyle(n,'::after').animationName),'ascii-pet-marks-pet');
 assert.equal(await page.locator('#pet-gray-wolf .ascii-mini--portrait > [data-ink="0"]').evaluate(n=>getComputedStyle(n,'::before').animationName),'ascii-portrait-gray-wolf-happy-0');
 await drag('gray-wolf',false);assert.equal(await page.locator('#pet-gray-wolf [data-meter="fullness"]').getAttribute('aria-valuenow'),'60');
 await drag('gray-wolf');assert.equal(await pen('gray-wolf').getAttribute('data-react'),'feed');
 assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'delighted');
 // From the keyboard the pen and the bowl are buttons; a full pet turns food down.
 await page.locator('#pet-gray-wolf .pet-food').press('Enter');await page.locator('#pet-gray-wolf .pet-food').press('Enter');
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'full');
 assert.match(await page.locator('#pet-gray-wolf .pet-stroke').getAttribute('aria-label'),/^Pet · Delighted$/);
 await page.clock.runFor(3000);assert.equal(await pen('gray-wolf').getAttribute('data-react'),null);
 await page.locator('#cage').screenshot({path:path.join(output,'cage-390.png')});
 // Real time: a few hours alone and the wolf is lonely, then hungry; it remembers across a reload.
 await page.clock.runFor(6*3600000);assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'lonely');
 assert.match(await page.locator('[data-target="pet-den.count"]').textContent(),/14 pets · 1 tamed · 1 need you/);
 await page.clock.runFor(7*3600000);await page.reload();await ready();assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'hungry');
 assert.equal(await page.locator('#pet-gray-wolf .ascii-mini--portrait > [data-ink="0"]').evaluate(n=>getComputedStyle(n,'::before').animationName),'ascii-portrait-gray-wolf-low-0');
 // Night: left alone it sleeps; a pat wakes it.
 await page.clock.runFor(4.5*3600000);await page.reload();await ready();assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
 assert.equal(await pen('gray-wolf').evaluate(n=>getComputedStyle(n,'::after').animationName),'ascii-pet-marks-asleep');
 await rub('gray-wolf');await page.clock.runFor(3000);assert.notEqual(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
 // The Advances table counts the next Advance of each tamed pet with a level.
 await page.locator('#pet-lion [data-field="owned"]').check();
 assert.match(await page.locator('[data-target="pet-advances.coverage"]').textContent(),/Unread levels: Lion/);
 assert.equal(await page.locator('[data-target="pet-advances.rows"] tr').count(),1);
 assert.match(await page.locator('[data-target="pet-advances.total"]').textContent(),/100,000 KvK prep points/);
 await page.locator('#advances').screenshot({path:path.join(output,'advances-390.png')});
 // Corrupt care in storage starts the pen again rather than breaking the page.
 await page.evaluate(()=>localStorage.setItem('ks.pet-care.v1','{oops'));await page.reload();await ready();assert.equal(await page.locator('#pet-gray-wolf [data-meter="fullness"]').getAttribute('aria-valuenow'),'60');
 await context.close();
 // Every language at every width: nothing overflows.
 const wide=await browser.newContext({viewport:{width:390,height:900}}),view=await wide.newPage();view.on('pageerror',e=>errors.push(e.message));
 const langs=fs.readdirSync('i18n').filter(f=>f.endsWith('.js')).map(f=>f.slice(0,-3));
 for(const lang of langs){await view.goto(origin+'/pets/?lang='+lang+'#pet-lion');await view.waitForFunction(lang=>document.documentElement.lang===lang,lang);
  assert.equal(await view.locator('h1').textContent(),await view.evaluate(()=>I18N.tr('pets.title')));
  for(const width of [320,390,768,1280,1920]){await view.setViewportSize({width,height:900});const failures=await view.evaluate(()=>[...document.querySelectorAll('.pet-roster,.pet-card,.pet-dossier-body,.topbar,.ev-switch')].filter(el=>el.getClientRects().length&&el.scrollWidth>el.clientWidth+2).map(el=>el.className+' '+el.scrollWidth+'>'+el.clientWidth+' '+(el.closest('.pet-card')||{}).id));assert.deepEqual(failures,[],lang+' at '+width);assert(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' page at '+width);}
  if(lang==='en'){await view.setViewportSize({width:1280,height:900});await view.locator('#cage').screenshot({path:path.join(output,'cage-1280.png')});}
 }
 await wide.close();
 // Without JavaScript the roster and dossiers still read.
 // Still frames here: fourteen stepping portraits can keep a slow runner from ever calling the dossier stable.
 const nojs=await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce'});const plain=await nojs.newPage();await plain.goto(origin+'/pets/');assert.equal(await plain.locator('.pet-card').count(),pets.length);assert.equal(await plain.locator('[data-field="owned"]').first().isDisabled(),true);await plain.locator('#pet-bison summary').click();assert.equal(await plain.locator('#pet-bison .pet-ladder').isVisible(),true);await nojs.close();
 const home=await browser.newPage();await home.goto(origin+'/?lang=en');assert.equal(await home.locator('#tools a[href="pets/"]').count(),1);await home.close();
 // The pets drawn live (js/pet-live.js): with WebGL 2 the grizzly's canvas covers the pen, draws, and reacts; the baked
 // frames stay underneath. With reduced motion, or with the script blocked, the baked frames show.
 const gpu=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 try{
  const ctx=await gpu.newContext({viewport:{width:390,height:900}}),live=await ctx.newPage();live.on('pageerror',e=>errors.push(e.message));
  await live.goto(origin+'/pets/?lang=en');const pen=live.locator('#pet-grizzly-bear [data-pen]');await pen.scrollIntoViewIfNeeded();
  await live.waitForFunction(()=>document.querySelector('#pet-grizzly-bear [data-pen]').hasAttribute('data-live'),null,{timeout:10000});
  assert.equal(await live.locator('#pet-grizzly-bear canvas.pet-live').count(),1);
  assert.equal(await live.locator('#pet-grizzly-bear .ascii-mini--portrait').evaluate(n=>getComputedStyle(n).visibility),'hidden');
  const box=await pen.boundingBox(),canvasBox=await live.locator('#pet-grizzly-bear canvas.pet-live').boundingBox();
  assert.ok(Math.abs(canvasBox.width-box.width)<1&&canvasBox.height<=box.height+1,'the live pet fits its pen');
  await live.waitForTimeout(600);const drawn=await live.locator('#pet-grizzly-bear canvas.pet-live').screenshot();assert.ok(drawn.length>3000,'the live pet draws');
  await pen.evaluate(n=>{n.dataset.mood='asleep';});await live.waitForTimeout(2500);
  await live.locator('#pet-grizzly-bear .pet-pen').screenshot({path:path.join(output,'live-asleep.png')});
  await pen.evaluate(n=>{n.dataset.mood='content';n.dataset.react='pet';});await live.waitForTimeout(1500);
  await live.locator('#pet-grizzly-bear .pet-pen').screenshot({path:path.join(output,'live-petted.png')});
  // every other pet with a model comes alive too, its canvas drawn over its pen
  for(const id of fs.readdirSync(path.join(__dirname,'pet-portraits')).map(f=>f.replace(/\.json$/,'')).filter(id=>id!=='grizzly-bear')){
   const other=live.locator('#pet-'+id+' [data-pen]');await other.scrollIntoViewIfNeeded();
   await live.waitForFunction(id=>document.querySelector('#pet-'+id+' [data-pen]').hasAttribute('data-live'),id,{timeout:10000});
   await live.waitForTimeout(400);assert.ok((await live.locator('#pet-'+id+' canvas.pet-live').screenshot()).length>3000,id+' draws live');}
  await ctx.close();
  const still=await gpu.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'}),calm=await still.newPage();
  await calm.goto(origin+'/pets/?lang=en');await calm.waitForTimeout(800);
  assert.equal(await calm.locator('canvas.pet-live').count(),0);assert.equal(await calm.locator('#pet-grizzly-bear .ascii-mini--portrait').evaluate(n=>getComputedStyle(n).visibility),'visible');
  await still.close();
 }finally{await gpu.close();}
 assert.deepEqual(errors,[]);console.log('Pets UI: pens, deep-linked dossiers, taming, petting by rubbing and feeding by dragging, care with real-time decay, sleep and reactions, the live pets and their baked fallback, the Advances table, static fallback and 17 languages at 5 widths pass.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
