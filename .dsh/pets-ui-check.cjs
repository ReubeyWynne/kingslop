// Pets page in a browser: pens, deep-linked dossiers, taming into the shared save, care that
// decays with the clock and wakes with a pat, the Advances table, and layout in every language.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const pets=require('../_data/pets.json').pets;
const root=path.resolve('_site'),output=path.resolve('.dsh/pets-preview');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];
try{
 // Six in the morning on the page's clock, so nobody is asleep yet.
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'UTC'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-17T06:00:00Z')});
 const ready=()=>page.waitForFunction(()=>![...document.querySelectorAll('.pet-card [data-field="owned"]')].some(f=>f.disabled));
 const pen=id=>page.locator('#pet-'+id+' [data-pen]');
 await page.goto(origin+'/pets/?lang=en');await ready();
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.pet-card').count(),pets.length);
 assert.deepEqual(await page.locator('.pet-band').evaluateAll(n=>n.map(x=>x.dataset.generation)),['1','2','3','4','5','6','7']);
 for(const p of pets){const card=page.locator('#pet-'+p.id);assert.equal(await card.locator('.pet-name b').textContent(),p.name);assert.equal(await card.locator('.pet-ladder tbody tr').count(),p.skill.ladder.length);assert.equal(await card.locator('.pet-ladder thead th[data-level]').count(),p.advances);}
 // Untamed pets stand in their pens without care controls.
 assert.equal(await page.locator('.pet-care:visible').count(),0);assert.equal(await pen('lion').getAttribute('data-mood'),'content');
 assert.equal(await pen('lion').evaluate(n=>getComputedStyle(n,'::before').animationName),'ascii-pet-lion');
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
 // A pat and a meal lift the meters and show a reaction, which clears on its own.
 await page.locator('#pet-gray-wolf [data-action="pet-den.pat"]').click();
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'pet');assert.equal(await page.locator('#pet-gray-wolf [data-meter="affection"]').getAttribute('aria-valuenow'),'70');
 assert.equal(await pen('gray-wolf').evaluate(n=>getComputedStyle(n,'::after').animationName),'ascii-pet-marks-pet');
 await page.locator('#pet-gray-wolf [data-action="pet-den.feed"]').click();assert.equal(await pen('gray-wolf').getAttribute('data-react'),'feed');
 assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'delighted');
 await page.locator('#pet-gray-wolf [data-action="pet-den.feed"]').click();await page.locator('#pet-gray-wolf [data-action="pet-den.feed"]').click();
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'full');assert.match(await page.locator('#pet-gray-wolf [data-target="pet-den.why"]').textContent(),/Too full/);
 await page.clock.runFor(3000);assert.equal(await pen('gray-wolf').getAttribute('data-react'),null);
 await page.locator('#cage').screenshot({path:path.join(output,'cage-390.png')});
 // Real time: a few hours alone and the wolf is lonely, then hungry; it remembers across a reload.
 await page.clock.runFor(6*3600000);assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'lonely');
 assert.match(await page.locator('[data-target="pet-den.count"]').textContent(),/14 pets · 1 tamed · 1 need you/);
 await page.clock.runFor(7*3600000);await page.reload();await ready();assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'hungry');
 assert.equal(await pen('gray-wolf').evaluate(n=>getComputedStyle(n,'::before').animationName),'ascii-pet-gray-wolf-low');
 // Night: left alone it sleeps; a pat wakes it.
 await page.clock.runFor(4.5*3600000);await page.reload();await ready();assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
 assert.equal(await pen('gray-wolf').evaluate(n=>getComputedStyle(n,'::after').animationName),'ascii-pet-marks-asleep');
 await page.locator('#pet-gray-wolf [data-action="pet-den.pat"]').click();await page.clock.runFor(3000);assert.notEqual(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
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
 const nojs=await browser.newContext({javaScriptEnabled:false});const plain=await nojs.newPage();await plain.goto(origin+'/pets/');assert.equal(await plain.locator('.pet-card').count(),pets.length);assert.equal(await plain.locator('[data-field="owned"]').first().isDisabled(),true);await plain.locator('#pet-bison summary').click();assert.equal(await plain.locator('#pet-bison .pet-ladder').isVisible(),true);await nojs.close();
 const home=await browser.newPage();await home.goto(origin+'/?lang=en');assert.equal(await home.locator('#tools a[href="pets/"]').count(),1);await home.close();
 assert.deepEqual(errors,[]);console.log('Pets UI: pens, deep-linked dossiers, taming, care with real-time decay, sleep and reactions, the Advances table, static fallback and 17 languages at 5 widths pass.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
