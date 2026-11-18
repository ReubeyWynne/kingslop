// Planner, text-only care, and the shared 3D habitat in Chromium.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const { withBrowser } = require('./lib/browser-harness.cjs');
const pets=require('../_data/pets.json').pets;
const root=path.resolve('_site'),output=path.resolve('.dsh/pets-preview');
withBrowser({ root, launchOptions: { args: ['--disable-3d-apis'] } }, async ({ browser, origin, launch }) => {fs.mkdirSync(output,{recursive:true});
// The care and layout runs exercise the no-WebGL path.
const errors=[];

 // Six in the morning on the page's clock, so nobody is asleep yet.
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'UTC'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('bh:guide','{"swipe":"done","door":"done"}'));
 await page.clock.install({time:new Date('2026-10-17T06:00:00Z')});
 const ready=async()=>page.waitForFunction(()=>document.querySelector('.pet-card:not([hidden])')&&![...document.querySelectorAll('.pet-profile [data-field="owned"]')].some(f=>f.disabled));
 const openPen=async(p=page)=>{await p.locator('#pet-pen-tab').click();await p.locator('#pet-play').waitFor();};
 const pen=id=>page.locator('#pen-'+id);
 const feed=()=>page.locator('.pet-feed');
 const pet=id=>page.locator('#pen-'+id+' .pet-stroke');
 const back=()=>page.getByRole('button',{name:'Back to habitat'});
 const stroke=()=>page.getByRole('button',{name:'Pet Gray Wolf',exact:true});
 const openCare=async()=>{const list=page.locator('#pet-care-list');if(await list.getAttribute('open')===null)await list.locator('summary').click();};
 const care=id=>page.evaluate(id=>PetCare.load(localStorage)[id],id);
 await page.goto(origin+'/pets/?lang=en');await ready();
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.pet-profile:visible').count(),pets.length);
 assert.deepEqual(await page.locator('.pet-band').evaluateAll(n=>n.map(x=>x.dataset.generation)),['1','2','3','4','5','6','7']);
 await page.screenshot({path:path.join(output,'roster-390.png')});
 for(const p of pets){
  const card=page.locator('#pet-'+p.id);
  assert.equal(await card.locator('.pet-name').textContent(),p.name);
  const image=card.locator('img');
  await image.scrollIntoViewIfNeeded();await image.evaluate(n=>n.decode());
  assert.equal(await image.evaluate(n=>n.naturalWidth),128);
 }
 await openPen();
 await openCare();
 assert.equal(await page.locator('#pet-care-list .pet-stroke:visible').count(),pets.length);
 await page.getByText('The 3D habitat is unavailable.',{exact:false}).waitFor();
 assert.equal(await page.locator('.pet-profile:visible').count(),0);
 assert.equal(await page.locator('#pet-play select, #pet-play [role="meter"]').count(),0);
 await pet('lynx').click();
 assert.equal(await pen('lynx').getAttribute('data-picked'),'true');
 assert.equal(await pen('lynx').getAttribute('data-react'),null,'choosing a pet is not care');
 assert.equal(await feed().getAttribute('aria-label'),'Feed Lynx');
 await feed().click();
 assert.equal(await pen('lynx').getAttribute('data-react'),'feed');
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),null);
 assert.equal(await care('lynx'),undefined);
 assert.deepEqual(await page.evaluate(()=>PlayerLedger.shared().pets().roster),{});
 await back().click();
 await pet('regal-white-lion').click();
 assert.equal(await feed().getAttribute('aria-label'),'Feed Regal White Lion');
 await feed().click();
 assert.equal(await pen('regal-white-lion').getAttribute('data-react'),'feed');
 await page.goto(origin+'/pets/?lang=en#pet-moose');await ready();await page.locator('#pet-moose .pet-ladder').waitFor();
 await page.locator('#pet-gray-wolf .pet-heading').click();
 assert.equal(await page.locator('.pet-dossier[open]').count(),1);
 // Taming writes the shared save and opens the pen's care.
 await page.locator('#pet-gray-wolf [data-field="owned"]').check();await page.waitForFunction(()=>PlayerLedger.shared().pets().roster['gray-wolf']);
 assert.equal(await page.locator('[data-pen]:visible').count(),0);
 const level=page.locator('#pet-gray-wolf [data-field="level"]');await level.fill('20');await level.press('Tab');
 assert.equal(await page.locator('#pet-gray-wolf [data-roster="advanced"]').isVisible(),true);
 assert.match(await page.locator('#pet-gray-wolf [data-roster="next"]').textContent(),/level 20: 30 Growth Manuals\. Worth 50,000 KvK prep points/);
 await page.locator('#pet-gray-wolf [data-field="advanced"]').check();
 assert.deepEqual((await page.evaluate(()=>PlayerLedger.shared().pets().roster))['gray-wolf'],{level:20,advanced:true});
 assert.equal(await page.locator('#pet-gray-wolf .pet-ladder td[data-reached]').count(),2);
 assert.match(await page.locator('#pet-gray-wolf [data-roster="next"]').textContent(),/level 30:/);
 await openPen();
 assert.equal(await feed().isVisible(),false);
 assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'content');
 await openCare();await pet('gray-wolf').click();
 await stroke().click();
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'pet');
 assert.equal(Math.round((await care('gray-wolf')).affection.value),70);
 await feed().click();
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'feed');
 assert.match(await page.locator('#pen-gray-wolf [data-care-status]').textContent(),/Eating/);
 assert.equal(Math.round((await care('gray-wolf')).fullness.value),90);
 await feed().press('Enter');await feed().press('Enter');
 assert.equal(await pen('gray-wolf').getAttribute('data-react'),'full');
 assert.match(await page.locator('#pen-gray-wolf [data-care-status]').textContent(),/Full/);
 assert.equal((await care('gray-wolf')).fullness.value,100);
 assert.deepEqual(await page.evaluate(()=>PlayerLedger.shared().pets().roster),{'gray-wolf':{level:20,advanced:true}});
 await page.clock.fastForward(17*3600000 + 30*60000);
 assert.equal(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
 assert.match(await page.locator('#pen-gray-wolf [data-care-status]').textContent(),/Asleep/);
 await stroke().press('Enter');
 assert.notEqual(await pen('gray-wolf').getAttribute('data-mood'),'asleep');
 await page.locator('#pet-play').screenshot({path:path.join(output,'pen-390.png')});
 // The Advances table counts the next Advance of each tamed pet with a level.
 await page.locator('#pet-roster-tab').click();
 await page.locator('#pet-lion .pet-heading').click();await page.locator('#pet-lion [data-field="owned"]').check();
 assert.equal(await page.locator('[data-answer="coverage"] li').textContent(),'Lion');
 assert.equal(await page.locator('[data-answer="total"]').getAttribute('data-open'),'');
 assert.equal(await page.locator('[data-answer="rows"] tr').count(),1);
 assert.match(await page.locator('[data-answer="total"]').textContent(),/100,000 KvK prep points/);
 assert.equal(await page.locator('[data-answer="total"]').isVisible(),true);
 assert.equal(await page.locator('#advances [data-answer="rows"]').isVisible(),false);
 await page.locator('#advances > summary').click();await page.locator('#advances').screenshot({path:path.join(output,'advances-390.png')});
 // Corrupt care in storage starts the pen again rather than breaking the page.
 await page.evaluate(()=>localStorage.setItem('ks.pet-care.v1','{oops'));await page.reload();await ready();await openPen();
 assert.equal((await care('gray-wolf')).fullness.value,60);
 await page.clock.setSystemTime(new Date('2026-10-20T12:00:00Z'));
 await openCare();await pet('gray-wolf').click();
 await stroke().focus();await stroke().press('ArrowDown');await stroke().press('ArrowDown');await stroke().press('Enter');
 assert.equal(await pen('gray-wolf').getAttribute('data-favourite'),'');
 assert.equal((await care('gray-wolf')).bond.days,1);
 await page.reload();await ready();await openPen();
 assert.equal((await care('gray-wolf')).bond.favourite,true);
 await context.close();
 // Every language at every width: nothing overflows.
 const wide=await browser.newContext({viewport:{width:390,height:900}}),view=await wide.newPage();view.on('pageerror',e=>errors.push(e.message));
 const langs=fs.readdirSync('i18n').filter(f=>f.endsWith('.js')).map(f=>f.slice(0,-3));
 for(const lang of langs){await view.goto(origin+'/pets/?lang='+lang+'#pet-lion');await view.waitForFunction(lang=>document.documentElement.lang===lang,lang);
  await view.locator('#pet-lion [data-field="owned"]').check();
  assert.equal(await view.locator('h1').textContent(),await view.evaluate(()=>I18N.tr('pets.title')));
  for(const width of [320,390,768,1280,1920]){await view.setViewportSize({width,height:900});assert(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' roster at '+width);}
  await view.setViewportSize({width:320,height:900});await openPen(view);
  assert(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' pen at 320');
 }
 await wide.close();
 // Without JavaScript the roster and dossiers still read.
 const nojs=await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce'});const plain=await nojs.newPage();await plain.goto(origin+'/pets/');assert.equal(await plain.locator('.pet-profile:visible').count(),pets.length);assert.equal(await plain.locator('[data-field="owned"]').first().isDisabled(),true);await plain.locator('#pet-bison .pet-heading').click();assert.equal(await plain.locator('#pet-bison .pet-ladder').isVisible(),true);await nojs.close();
 const home=await browser.newPage();await home.goto(origin+'/?lang=en');assert.equal(await home.locator('#tools a[href="pets/"]').count(),1);await home.close();
 // WebGL 2 is loaded on entry to the pen, not in the planner.
 const gpu=await launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 try{
  const ctx=await gpu.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),live=await ctx.newPage();live.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>{
   localStorage.setItem('bh:guide','{"swipe":"done","door":"done"}');
   const read=WebGL2RenderingContext.prototype.readPixels;
   WebGL2RenderingContext.prototype.readPixels=function(...args){
    const w=this.drawingBufferWidth,h=this.drawingBufferHeight,buf=new Uint8Array(w*h*4), points={};
    read.call(this,0,0,w,h,this.RGBA,this.UNSIGNED_BYTE,buf);
    if(this.getError()!==this.NO_ERROR)throw Error('ID buffer read failed: '+w+'×'+h+' / '+this.checkFramebufferStatus(this.FRAMEBUFFER));
    for(let i=0;i<buf.length;i+=4) if(buf[i]>0&&!buf[i+1]&&!buf[i+2]){
     const x=(i/4)%w,y=Math.floor(i/4/w),p=points[buf[i]]??={n:0,x:0,y:0,minX:w,minY:h,maxX:0,maxY:0};
     p.n++;p.x+=x;p.y+=y;p.minX=Math.min(x,p.minX);p.minY=Math.min(y,p.minY);p.maxX=Math.max(x,p.maxX);p.maxY=Math.max(y,p.maxY);
    }
    for(const p of Object.values(points)){p.x/=p.n;p.y/=p.n;p.distance=Infinity;}
    for(let i=0;i<buf.length;i+=4){
     const p=points[buf[i]];if(!p)continue;
     const x=(i/4)%w,y=Math.floor(i/4/w),distance=(x-p.x)**2+(y-p.y)**2;
     if(distance<p.distance){p.distance=distance;p.tapX=x;p.tapY=y;}
    }
    window.pickPoints=Object.fromEntries(Object.entries(points).map(([id,p])=>[id,{x:(p.tapX+.5)/w,y:1-(p.tapY+.5)/h,n:p.n,fits:p.minX>0&&p.minY>0&&p.maxX<w-1&&p.maxY<h-1}]));
    return read.apply(this,args);
   };
  });
  const requested=[];live.on('request',r=>{if(r.url().includes('/pets/models/'))requested.push(r.url());});
  await live.goto(origin+'/pets/?lang=en&shader=1');await live.locator('#pet-roster-tab').waitFor();
  assert.equal(requested.length,0);
  await openPen(live);const canvas=live.locator('.pet-world-canvas[data-ready]');
  await canvas.waitFor({timeout:12000});await canvas.scrollIntoViewIfNeeded();
  assert.equal(await live.getByRole('button',{name:/^Feed /}).count(),0);
  await canvas.screenshot({path:path.join(output,'habitat-3d-390.png')});
  await canvas.tap({position:{x:8,y:8}});
  const points=await live.evaluate(()=>window.pickPoints);
  assert.equal(Object.keys(points).length,pets.length,`all meshes visible: ${JSON.stringify(points)}`);
  assert(Object.values(points).every(p=>p.n>20&&p.fits),`whole meshes fit default framing: ${JSON.stringify(points)}`);
  assert.deepEqual(requested.filter(url=>url.endsWith('.bin')).map(url=>path.basename(url,'.bin')).sort(),pets.map(p=>p.id).sort());
  assert.equal(await live.locator('#pet-play canvas').count(),1);
  assert.equal(await live.locator('#pet-play .ascii-mini--portrait').count(),0);
  const box=await canvas.boundingBox(), lynx=points[pets.findIndex(p=>p.id==='lynx')+1];
  await canvas.tap({position:{x:lynx.x*box.width,y:lynx.y*box.height}});
  const visit=live.getByRole('button',{name:'Back to habitat'});
  await visit.waitFor();
  assert.equal(await live.locator('#pen-lynx').getAttribute('data-react'),null);
  await canvas.tap({position:{x:8,y:8}});
  const focused=await live.evaluate(()=>window.pickPoints), lynxId=pets.findIndex(p=>p.id==='lynx')+1;
  assert.deepEqual(Object.keys(focused),[String(lynxId)],'the visit renders just the selected animal');
  assert(focused[lynxId].fits&&focused[lynxId].n>lynx.n*2);
  await live.getByRole('button',{name:'Feed Lynx'}).tap();
  assert.equal(await live.locator('#pen-lynx').getAttribute('data-react'),'feed');
  await live.getByRole('button',{name:'Pet Lynx',exact:true}).tap();
  assert.equal(await live.locator('#pen-lynx').getAttribute('data-react'),'pet');
  await live.getByRole('button',{name:'Play with Lynx'}).tap();
  assert.match(await live.locator('.pet-visit [aria-live]').textContent(),/Playing/);
  await canvas.screenshot({path:path.join(output,'companion-390.png')});
  await visit.tap();
  assert.equal(await live.getByRole('button',{name:'Feed Lynx'}).count(),0);
  const rows=live.getByRole('slider',{name:'Glyph rows'}), cols=live.getByRole('slider',{name:'Glyph columns'});
  const preset=()=>live.getByRole('textbox',{name:'Shader settings JSON'}).inputValue().then(JSON.parse);
  await rows.press('Home');
  assert.equal((await preset()).rows,16);
  assert.equal((await preset()).columns,210);
  await cols.press('End');
  assert.equal((await preset()).columns,280);
  await ctx.close();
 }finally{await gpu.close();}
 assert.deepEqual(errors,[]);console.log('Pets UI: planning, care, mobile 3D world, all fourteen visible meshes, touch picking and camera pass.');
}).catch(e=>{console.error(e);process.exitCode=1;});
