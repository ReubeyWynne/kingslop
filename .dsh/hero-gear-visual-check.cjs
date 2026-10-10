const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, devices } = require('playwright');
const E = require('../js/hero-gear-engine.js');
const root = path.resolve('_site');
const output = path.resolve('.dsh/gear-preview');
const langs = ['en','es','pt-BR','de','fr','it','ru','pl','tr','zh-Hans','zh-Hant','ko','ja','th','id','vi','ar'];
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url,'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
async function fits(page, label) {
  const failures = await page.evaluate(() => [...document.querySelectorAll('.gear-main,.gear-bag,.gear-workspace,.gear-editor,.gear-answer,.gear-row,.topbar,.ev-switch,.gear-dialog[open]')].filter(el=>el.getClientRects().length && el.scrollWidth>el.clientWidth+2).map(el=>el.className));
  assert.deepEqual(failures, [], label);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), label);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const origin='http://127.0.0.1:'+server.address().port;
  fs.mkdirSync(output,{recursive:true});
  let page;
  try {
    page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/hero-gear/?lang=en');
    await page.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('h1').textContent(),'Hero gear');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('.topbar .brand').count(),1);
    assert.equal(await page.locator('.gear-hero').count(),0);
    assert.equal(await page.locator('.gear-editor #gear-import').count(),1);
    assert.equal(await page.locator('.gear-answer #gear-profile').count(),1);
    await page.locator('.gear-row[data-select="inf-helm"]').click();
    await page.locator('[data-piece="inf-helm"][data-field="level"]').fill('100');
    await page.locator('[data-piece="inf-helm"][data-field="level"]').press('Tab');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').fill('10');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').press('Tab');
    assert.equal(await page.locator('.gear-edit-art .gear-item-level').textContent(),'+100');
    assert.equal(await page.locator('.gear-edit-art .gear-item-mastery').textContent(),'10');
    assert.match(await page.locator('.gear-row[data-select="inf-helm"]').textContent(), /\+100/);
    await page.locator('#gear-close-edit').click();
    await page.locator('#gear-mode-milestones').click();
    const cells=await page.locator('.gear-cost-row').allTextContents();
    assert.match(cells[0],/52,650/);assert.match(cells[1],/110/);assert.match(cells[2],/6/);assert.match(cells[3],/10/);
    assert.equal(await page.locator('#gear-milestone-out .gear-kvk-summary').getAttribute('data-kvk-points'),'840000');
    assert.match(await page.locator('#gear-milestone-out .gear-kvk-summary').textContent(),/840,000.*KvK points.*4 \/ 5/);
    for(const [id,value]of [['parts10','5'],['parts100','526'],['hammers','110'],['mythic','6'],['mithril','10']])await page.locator('#gear-'+id).fill(value);
    assert.match(await page.locator('#gear-milestone-out').textContent(),/you have every resource/);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);
    assert.equal(await page.locator('#gear-xp-total').textContent(),'52,650');
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),100);
    await page.locator('#gear-troops [data-troop="cav"]').click();
    assert.equal(await page.locator('#gear-include').isChecked(),true);
    await page.locator('#gear-include').uncheck();
    await page.locator('#gear-tab-cav').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#gear-tab-arc').getAttribute('aria-selected'),'true');
    await page.locator('#gear-mode-plan').click();
    assert.ok(await page.locator('.gear-route').count()<=3);
    assert.equal(await page.locator('#gear-target').count(),0);
    assert.match(await page.locator('.gear-route-head').textContent(),/vs current gear/);
    await page.locator('#gear-mode-optimise').click();
    await page.locator('#gear-apply-result').waitFor();
    await page.locator('#gear-apply-result').click();
    await page.locator('#gear-undo').click();
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),100);
    await page.route('**/js/ocr-worker.js**',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{let texts=['Infantry Helm','Lv. +19','Forge Mastery 10'];self.postMessage({id:e.data.id,ok:true,items:texts.map((text,i)=>({text,poly:[[0,i*30],[250,i*30],[250,i*30+20],[0,i*30+20]]}))});};`}));
    await page.locator('#gear-import').click();
    await page.locator('#gear-images').setInputFiles({name:'gear.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vGQAAAAASUVORK5CYII=','base64')});
    await page.locator('[data-import-field="level"]').waitFor();
    assert.equal(await page.locator('[data-import-field="level"]').inputValue(),'19');
    assert.equal(await page.locator('[data-import-field="quality"]').inputValue(),'red');
    await page.locator('#gear-apply-import').click();
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),119);
    await page.locator('#gear-mode-milestones').click();
    await page.locator('#gear-piece-select summary').click();
    await page.locator('#gear-selected').selectOption('inf-helm');
    await page.locator('#gear-apply-milestone').click();
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),120);
    await page.locator('#gear-undo').click();
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),119);
    const fixture=E.defaults();
    fixture.pieces['inf-helm']={quality:'mythic',level:69,mastery:2};
    fixture.pieces['inf-gloves']={quality:'red',level:120,mastery:11};
    fixture.pieces['inf-chest']={quality:'mythic',level:100,mastery:6};
    fixture.pieces['inf-boots']={quality:'mythic',level:72,mastery:3};
    fixture.pieces['arc-helm']={quality:'mythic',level:100,mastery:6};
    fixture.pieces['arc-gloves']={quality:'mythic',level:69,mastery:2};
    fixture.pieces['arc-chest']={quality:'mythic',level:69,mastery:2};
    fixture.pieces['arc-boots']={quality:'mythic',level:100,mastery:6};
    fixture.pieces['cav-helm']={quality:'mythic',level:63,mastery:2};
    fixture.pieces['cav-gloves']={quality:'mythic',level:39,mastery:1};
    fixture.pieces['cav-chest']={quality:'mythic',level:40,mastery:1};
    fixture.pieces['cav-boots']={quality:'mythic',level:63,mastery:1};
    fixture.selected='inf-gloves';fixture.resources={xp:52650,hammers:110,mythic:6,mithril:10};
    await page.locator('.gear-save-tools summary').click();
    await page.locator('#gear-load').click();
    await page.locator('#gear-save-file').setInputFiles({name:'gear.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-gloves'].level===120);
    await page.locator('.gear-save-tools summary').click();
    await page.locator('#gear-mode-milestones').click();
    assert.match(await page.locator('[data-cost-resource="xp"]').textContent(),/74,100/);
    assert.match(await page.locator('[data-cost-resource="mithril"]').textContent(),/10 missing/);
    await page.waitForFunction(()=>[...document.querySelectorAll('.gear-main img')].every(img=>img.complete&&img.naturalWidth>0));
    await page.locator('#gear-mode-plan').click();
    assert.equal(await page.locator('.gear-route').count(),3);
    const forecasts=E.redPlans(fixture).routes;
    assert.equal(await page.locator('.gear-route .gear-kvk-points').count(),0);
    for(let i=0;i<3;i++){
      await page.locator('.gear-route[data-route="'+i+'"]').click();
      assert.equal(await page.locator('#gear-milestone-out > .gear-kvk-summary').getAttribute('data-kvk-points'),String(E.kvkPoints(forecasts[i].costs)));
    }
    await page.locator('.gear-route[data-route="0"]').click();
    assert.equal(await page.locator('#gear-milestone-out > .gear-kvk-summary').getAttribute('data-kvk-points'),'2200000','saving points cover the full cost, including resources already owned');
    await page.locator('.gear-route[data-route="1"]').click();
    assert.match(await page.locator('.gear-score-explainer').textContent(),/garrison lead/);
    assert.equal(await page.locator('.gear-score-explainer').getAttribute('open'),null);
    await page.locator('#gear-profile').selectOption('rally');
    assert.match(await page.locator('.gear-route').first().textContent(),/Archer/);
    await page.locator('#gear-profile').selectOption('growth');
    await page.locator('.gear-route[data-route="0"]').click();
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,'desktop.png')});
    for(const width of [320,390,768,1280,1440]){
      const height=width===390?844:900;
      await page.setViewportSize({width,height});await fits(page,'width '+width);
      await page.locator('#gear-import').click();await fits(page,'dialog '+width);await page.locator('#gear-close-import').click();
      if(width<=768){
        await page.locator('#gear-view-gear').click();
        assert.equal(await page.locator('.gear-answer').isVisible(),false);
        assert.equal(await page.locator('.gear-editor').isVisible(),true);
        assert.equal(await page.locator('#gear-import').isVisible(),true);
        assert.equal(await page.locator('#gear-profile').isVisible(),false);
        await page.locator('#gear-view-plan').click();
        assert.equal(await page.locator('.gear-answer').isVisible(),true);
        assert.equal(await page.locator('.gear-editor').isVisible(),false);
        assert.equal(await page.locator('#gear-profile').isVisible(),true);
        await fits(page,'plan '+width);
        if(width===390){
          await page.evaluate(()=>scrollTo(0,0));
          assert.equal(await page.locator('#gear-profile').isVisible(),true);
          assert.equal(await page.locator('.gear-route').count(),3);
          const costs=await page.locator('.gear-route-detail .gear-cost-strip').boundingBox();
          assert.ok(costs.y+costs.height<=height,'three recommendations and costs fit the mobile viewport');
          await page.screenshot({path:path.join(output,'mobile-plan.png')});
        }
        await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#gear-rows .gear-row').length===4);
        assert.equal(await page.locator('#gear-forge').getAttribute('data-view'),'plan');
        await page.locator('#gear-view-gear').click();
        await page.locator('.gear-row[data-select="inf-gloves"]').click();await fits(page,'edit '+width);
        await page.locator('#gear-close-edit').click();
        const bottom=await page.locator('#gear-views').evaluate(el=>el.getBoundingClientRect().bottom);
        assert.ok(bottom<=height,'gear controls fit viewport at '+width);
      }
      if(width===390)await page.screenshot({path:path.join(output,'mobile.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#gear-view-plan').click();
    await page.locator('#gear-settings summary').click();
    await page.locator('#gear-reforge').check();
    await page.locator('#gear-settings summary').click();
    for(const [id,value]of [['parts10','2299'],['parts100','1'],['hammers','501'],['mythic','10'],['mithril','10']])await page.locator('#gear-'+id).fill(value);
    await page.locator('#gear-mode-optimise').click();
    await page.locator('#gear-apply-result').waitFor();
    assert.equal(await page.locator('#gear-results > .gear-kvk-summary').getAttribute('data-kvk-points'),'2400000');
    let tabPoints=0;
    for(const type of E.TYPES){
      await page.locator('[data-result-troop="'+type+'"]').click();
      tabPoints+=await page.locator('.gear-change .gear-kvk-points').evaluateAll(items=>items.reduce((sum,item)=>sum+Number(item.dataset.kvkPoints),0));
      assert.equal(await page.locator('#gear-results > .gear-kvk-summary').getAttribute('data-kvk-points'),'2400000','batch total includes hidden troop tabs');
    }
    assert.equal(tabPoints,2400000,'per-piece scores sum to the batch total');
    await page.locator('[data-result-troop="arc"]').click();
    assert.equal(await page.locator('.gear-change').first().getAttribute('data-checkpoint'),'ascension');
    assert.equal(await page.locator('.gear-change').first().locator('.gear-item[data-quality="red"]').count(),1);
    await fits(page,'supplied gear red ascension');await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,'mobile-red-overview-spend.png')});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:path.join(output,'desktop-red-overview-spend.png')});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#gear-mode-plan').click();
    await page.screenshot({path:path.join(output,'mobile-red-overview-saving.png')});
    for(const [id,value]of [['parts10','0'],['parts100','120'],['hammers','180'],['mythic','4'],['mithril','0']])await page.locator('#gear-'+id).fill(value);
    await page.locator('#gear-mode-optimise').click();
    await page.locator('#gear-apply-result').waitFor();
    assert.ok(await page.locator('.gear-result-grid .gear-row').count() > 0);
    assert.equal(await page.locator('.gear-result-grid .gear-item').count(),2 * await page.locator('.gear-result-grid .gear-row').count());
    assert.match(await page.locator('.gear-result-grid').textContent(),/before.*after/s);
    await page.locator('[data-result-troop="cav"]').click();
    assert.ok(await page.locator('.gear-change[data-direction="down"]').count()>0);
    for(const row of await page.locator('.gear-change[data-direction="down"]').all()){
      const [from,to]=(await row.locator('.gear-item-mastery').allTextContents()).map(Number);
      const hammerPoints=(to*(to+1)-from*(from+1))*5*4000;
      assert.equal(await row.locator('.gear-kvk-points').getAttribute('data-kvk-points'),String(hammerPoints),'reforge scores only any new mastery materials, never recovered XP');
    }
    assert.match(await page.locator('.gear-change[data-direction="down"]').first().textContent(),/↓.*recover/);
    await fits(page,'mobile optimise');await page.evaluate(()=>scrollTo(0,0));
    const resultGrid=await page.locator('.gear-result-grid').boundingBox();
    assert.ok(resultGrid.width<=390,'changed-piece comparison rows fit the mobile viewport width');
    assert.ok(await page.locator('.gear-result-grid .gear-row').evaluateAll(rows =>
      rows.every(row => { const box=row.getBoundingClientRect(); return box.left>=-1 && box.right<=window.innerWidth+1; })
    ),'changed-piece rows do not overflow the mobile viewport horizontally');
    await page.locator('.gear-result-grid').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'mobile-optimise.png')});
    await page.setViewportSize({width:1280,height:900});await fits(page,'desktop optimise');
    await page.screenshot({path:path.join(output,'desktop-optimise.png')});
    await page.locator('#gear-apply-result').click();
    const applied=await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
    assert.equal(applied.resources.xp,applied.parts.ten*10+applied.parts.hundred*100+applied.parts.remainder);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#gear-rows .gear-row').length===4);
    assert.equal(await page.locator('#gear-xp-total').textContent(),new Intl.NumberFormat('en-GB').format(applied.resources.xp));
    await page.setViewportSize({width:1440,height:900});
    for(const lang of langs){
      await page.goto(origin+'/hero-gear/?lang='+lang);await page.waitForFunction(()=>document.querySelectorAll('#gear-rows .gear-row').length===4);await fits(page,'language '+lang);
      await page.setViewportSize({width:320,height:900});await fits(page,'narrow '+lang);
      await page.locator('#gear-view-plan').click();await fits(page,'narrow plan '+lang);
      await page.locator('#gear-view-gear').click();await page.setViewportSize({width:1440,height:900});
    }
    const mobileContext=await browser.newContext({...devices['Pixel 7'], viewport:{width:390,height:844}, reducedMotion:'reduce'});
    const overviewPage=await mobileContext.newPage();
    overviewPage.setDefaultTimeout(180000);
    await overviewPage.addInitScript(()=>{
      const NativeWorker=window.Worker;
      window.__gearReads=[];
      window.__gearWorkerURLs=[];
      window.Worker=class extends NativeWorker {
        constructor(url,options){super(url,options);if(String(url).includes('ocr-worker.js')){window.__gearWorkerURLs.push(String(url));this.addEventListener('message',event=>window.__gearReads.push({ok:event.data.ok,items:event.data.items,error:event.data.error}));}}
      };
    });
    try {
      await overviewPage.goto(origin+'/hero-gear/?lang=en');
      await overviewPage.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);
      await overviewPage.locator('#gear-import').click();
      const fixtures=['zoe','marlin','petra','jabel','diana','howard'];
      await overviewPage.locator('#gear-images').setInputFiles(fixtures.map(name=>path.resolve('.dsh/gear-fixtures/'+name+'.jpg')));
      await overviewPage.locator('#gear-apply-import:enabled').waitFor({timeout:240000});
      assert.ok(await overviewPage.evaluate(()=>navigator.userAgent.includes('Android')));
      assert.ok(await overviewPage.evaluate(()=>window.__gearWorkerURLs.every(url=>new URL(url).searchParams.get('backend')==='wasm')),'gear number recognition bypasses mobile GPU inference');
      const actual=await overviewPage.locator('.gear-import-item').evaluateAll(items=>items.map(item=>{
        const values=Object.fromEntries([...item.querySelectorAll('[data-import-field]')].filter(el=>el.type!=='checkbox').map(el=>[el.dataset.importField,el.value]));
        if(values.quality==='red' && values.level!=='')values.level=String(Number(values.level)+100);
        return values;
      }));
      fs.writeFileSync(path.join(output,'overview-reads.json'),JSON.stringify(actual,null,2));
      fs.writeFileSync(path.join(output,'overview-ocr.json'),JSON.stringify(await overviewPage.evaluate(()=>window.__gearReads),null,2));
      const expected=[
        ['inf',[['mythic',69,2],['red',120,11],['mythic',100,6],['mythic',72,3]]],
        ['arc',[['mythic',100,6],['mythic',69,2],['mythic',69,2],['mythic',100,6]]],
        ['cav',[['mythic',63,2],['mythic',39,1],['mythic',40,1],['mythic',63,1]]],
        ['cav',[['epic',0,0],['mythic',0,0],['mythic',0,0],['mythic',0,0]]],
        ['arc',[['mythic',0,0],['mythic',0,0],['mythic',0,0],['epic',0,0]]],
        ['inf',[['mythic',0,0],['mythic',0,0],['mythic',0,0],['mythic',0,0]]]
      ].flatMap(([troop,pieces])=>pieces.map(([quality,level,mastery],i)=>({troop,slot:E.SLOTS[i],quality,level:String(level),mastery:String(mastery)})));
      assert.deepEqual(actual,expected,'real overview screenshots using the production OCR worker');
      assert.equal(await overviewPage.locator('#gear-import-pick').isVisible(),false,'upload instructions yield to the gear review');
      assert.equal(await overviewPage.locator('#gear-replace-images').isVisible(),true);
      assert.equal(await overviewPage.locator('[data-import-index="1"][data-import-field="level"]').inputValue(),'20','red enhancement matches the crop');
      await overviewPage.locator('#gear-import-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
      const dialog=await overviewPage.locator('#gear-import-dialog').boundingBox();
      for(const selector of ['#gear-import-title','#gear-close-import','#gear-apply-import']){
        const box=await overviewPage.locator(selector).boundingBox();
        assert.ok(box.y>=dialog.y && box.y+box.height<=dialog.y+dialog.height,'review chrome remains visible while scrolling '+selector);
      }
      assert.equal(await overviewPage.locator('#gear-import-dialog').evaluate(el=>el.scrollTop),0,'only the list scrolls');
      await overviewPage.locator('#gear-import-scroll').evaluate(el=>el.scrollTop=0);
      await overviewPage.screenshot({path:path.join(output,'mobile-import-review.png')});
      for(const width of [320,390,768,1280]){
        await overviewPage.setViewportSize({width,height:844});await fits(overviewPage,'populated review '+width);
        await overviewPage.locator('.gear-import-identity').first().locator('summary').click();
        await fits(overviewPage,'identity controls '+width);
        await overviewPage.locator('.gear-import-identity').first().locator('summary').click();
      }
      await overviewPage.setViewportSize({width:390,height:500});
      await overviewPage.locator('[data-import-index="0"][data-import-field="level"]').focus();
      for(const selector of ['#gear-close-import','#gear-apply-import']){
        const box=await overviewPage.locator(selector).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=500,'short viewport actions '+selector);
      }
      await overviewPage.screenshot({path:path.join(output,'mobile-import-short.png')});
      await overviewPage.setViewportSize({width:390,height:844});
      await overviewPage.evaluate(()=>{
        Object.defineProperty(visualViewport,'height',{configurable:true,value:440});
        Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:40});
        visualViewport.dispatchEvent(new Event('resize'));
      });
      for(const selector of ['#gear-import-title','#gear-close-import','#gear-apply-import']){
        const box=await overviewPage.locator(selector).boundingBox();assert.ok(box.y>=40&&box.y+box.height<=480,'keyboard visual viewport '+selector);
      }
      await overviewPage.screenshot({path:path.join(output,'mobile-import-keyboard.png')});
      await overviewPage.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
      const enhancement=overviewPage.locator('[data-import-index="0"][data-import-field="level"]');
      await enhancement.fill('101');await overviewPage.locator('#gear-apply-import').click();
      assert.equal(await overviewPage.locator('#gear-import-dialog').evaluate(el=>el.open),true,'invalid visible numbers cannot apply a silently clamped value');
      await enhancement.fill('69');
      assert.equal(await overviewPage.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),0,'review has not applied any values');
      await fits(overviewPage,'real overview review');
      await overviewPage.locator('#gear-apply-import').click();
      assert.equal(await overviewPage.locator('#gear-import-dialog').evaluate(el=>el.open),true,'duplicate slots require selection');
      await overviewPage.locator('#gear-import-scroll').evaluate(el=>el.scrollTop=0);
      await overviewPage.screenshot({path:path.join(output,'overview-review.png')});
      for(let i=12;i<24;i++)await overviewPage.locator('[data-import-index="'+i+'"][data-import-field="included"]').uncheck();
      await overviewPage.locator('#gear-apply-import').click();
      const imported=await overviewPage.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
      for(const item of expected.slice(0,12))assert.deepEqual(imported.pieces[item.troop+'-'+item.slot],{quality:item.quality,level:Number(item.level),mastery:Number(item.mastery)});
      assert.deepEqual(imported.resources,E.defaults().resources);
      await overviewPage.locator('#gear-undo').click();
      assert.equal(await overviewPage.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),0);
      await overviewPage.locator('#gear-import').click();
      await overviewPage.locator('#gear-images').setInputFiles(fixtures.slice(3).map(name=>path.resolve('.dsh/gear-fixtures/'+name+'.jpg')));
      await overviewPage.locator('#gear-apply-import:enabled').waitFor({timeout:180000});
      await overviewPage.locator('#gear-apply-import').click();
      const unlevelled=await overviewPage.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
      for(const item of expected.slice(12))assert.deepEqual(unlevelled.pieces[item.troop+'-'+item.slot],{quality:item.quality,level:0,mastery:0});
      console.log('Production OCR: all 24 pieces in six supplied hero overviews matched rarity, troop, enhancement and mastery; duplicate selection, review, apply, unlevelled pieces and undo passed.');
      await overviewPage.locator('#gear-import').click();
      await overviewPage.route('**/js/ocr-worker.js**',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
      await overviewPage.locator('#gear-images').setInputFiles(path.resolve('.dsh/gear-fixtures/zoe.jpg'));
      await overviewPage.locator('#gear-import-dialog[aria-busy="true"]').waitFor();
      await overviewPage.locator('#gear-close-import').click();
      assert.equal(await overviewPage.locator('#gear-import-dialog').evaluate(el=>el.open),false,'a cold or stalled mobile read is cancellable');
      await overviewPage.locator('#gear-import').click();
      assert.equal(await overviewPage.locator('.gear-import-item').count(),0,'cancelled results cannot populate the next review');
      assert.equal(await overviewPage.locator('#gear-images').isEnabled(),true);
      await overviewPage.locator('#gear-cancel-import').click();
    } catch(error) { await overviewPage.screenshot({path:path.join(output,'overview-failure.png')});throw error; } finally { await mobileContext.close(); }
    assert.deepEqual(errors,[]);
    console.log('Visual gear, original assets, edit dialogs, resource bars, persistence, exclusions, keyboard tabs, worker search, milestone/search apply and undo, screenshot review, JSON import, mobile Gear/Plan, 5 widths and 17 language layouts passed. OCR delivery was stubbed; parser fixtures use real worker item shapes.');
  }catch(error){
    if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.txt'),page.url()+'\n'+error.stack);}
    throw error;
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});

