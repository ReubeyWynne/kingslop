const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { devices } = require('playwright');
const { withBrowser } = require('./lib/browser-harness.cjs');
const E = require('../js/hero-gear-engine.js');
const root = path.resolve('_site');
const output = path.resolve('.dsh/gear-preview');
const langs = ['en','es','pt-BR','de','fr','it','ru','pl','tr','zh-Hans','zh-Hant','ko','ja','th','id','vi','ar'];
async function fits(page, label) {
  const failures = await page.evaluate(() => [...document.querySelectorAll('.gear-main,.gear-bag,.gear-workspace,.gear-editor,.gear-answer,.gear-row,.topbar,.ev-switch,.gear-dialog[open]')].filter(el=>el.getClientRects().length && el.scrollWidth>el.clientWidth+2).map(el=>el.className));
  assert.deepEqual(failures, [], label);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), label);
}
const pctOf=share=>(Math.floor(share*1000+1e-6)/10).toFixed(1).replace(/\.0$/,'')+'%';
const loaded=()=>document.querySelectorAll('.gear-card .gear-row').length===12;
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output,{recursive:true});
  let page;
  try {
    page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/hero-gear/?lang=en');
    await page.waitForFunction(loaded);
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('h1').textContent(),'Hero gear');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('.topbar .brand').count(),1);
    // The same frame as Governor gear: title, the upload box above your gear, the answer beside it.
    // Your own save needs no bar; sharing and starting over are small links under your gear.
    assert.equal(await page.locator('.sheet-hero h1').count(),1);
    assert.equal(await page.locator('#gear-sheet').isHidden(),true,'your own save shows no sheet notice');
    assert.equal(await page.locator('.sheet-bar').count(),0);
    assert.equal(await page.locator('.gear-editor .sheet-tools #gear-share').isVisible(),true);
    assert.equal(await page.locator('.gear-editor #gear-import.sheet-drop[data-screen-import-drop]').count(),1);
    // Three troop cards, four pieces each; one answer with no tabs; custom weights fold away under Advanced.
    assert.equal(await page.locator('.gear-card').count(),3);
    assert.equal(await page.locator('.gear-card .gear-card-grid .gear-row').count(),12);
    assert.equal(await page.locator('.gear-main [role="tab"]').count(),0,'no tabs');
    assert.equal(await page.locator('#weights').evaluate(d=>d.open),false);
    assert.equal(await page.locator('#gear-profile').isVisible(),true,'the priority stays in view');
    assert.equal(await page.locator('#gear-reforge').isVisible(),true,'XP reforge is a normal setting');
    await page.locator('.gear-row[data-select="inf-helm"]').click();
    await page.locator('[data-piece="inf-helm"][data-field="level"]').fill('100');
    await page.locator('[data-piece="inf-helm"][data-field="level"]').press('Tab');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').fill('10');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').press('Tab');
    assert.equal(await page.locator('.gear-edit-art .gear-item-level').textContent(),'+100');
    assert.equal(await page.locator('.gear-edit-art .gear-item-mastery').textContent(),'10');
    // The piece's sheet carries what its next steps cost: ascension first, then the next mithril use.
    const helm={quality:'mythic',level:100,mastery:10};
    assert.deepEqual(await page.locator('#gear-edit-dialog .gear-step').evaluateAll(s=>s.map(x=>x.dataset.goal)),['red','mithril']);
    const toMithril=E.cost(helm,E.milestone(helm,'mithril'));
    const step=page.locator('#gear-edit-dialog .gear-step[data-goal="mithril"]');
    assert.match(await step.textContent(),new RegExp(new Intl.NumberFormat('en-GB').format(toMithril.xp)));
    assert.equal(await step.locator('.gear-kvk-points').getAttribute('data-kvk-points'),String(E.kvkPoints(toMithril)));
    assert.equal(await step.locator('[data-apply-goal]').count(),0,'nothing to mark done without the materials');
    await page.locator('#gear-close-edit').click();
    assert.match(await page.locator('.gear-row[data-select="inf-helm"]').textContent(), /\+100/);
    const parts100=Math.floor(toMithril.xp/100), parts10=Math.ceil((toMithril.xp-parts100*100)/10);
    for(const [id,value]of [['parts10',String(parts10)],['parts100',String(parts100)],['hammers',String(toMithril.hammers)],['mythic',String(toMithril.mythic)],['mithril',String(toMithril.mithril)]])await page.locator('#gear-'+id).fill(value);
    await page.locator('.gear-row[data-select="inf-helm"]').click();
    assert.equal(await step.locator('[data-apply-goal]').count(),1,'a step the bag pays for can be marked done');
    await page.locator('#gear-close-edit').click();
    await page.reload();await page.waitForFunction(loaded);
    assert.equal(await page.locator('#gear-xp-total').textContent(),new Intl.NumberFormat('en-GB').format(parts100*100+parts10*10));
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),100);
    // A troop's own view: helm and chest on the left, gloves and boots on the right, its share of optimal between.
    await page.locator('[data-open="cav"]').click();
    assert.equal(await page.locator('#gear-cards').isHidden(),true);
    assert.deepEqual(await page.locator('#gear-detail .gear-board-side').evaluateAll(s=>s.map(x=>[...x.querySelectorAll('[data-select]')].map(b=>b.dataset.select))),[['cav-helm','cav-chest'],['cav-gloves','cav-boots']]);
    assert.match(await page.locator('#gear-detail .gear-board-centre').textContent(),/of optimal/i);
    assert.equal(await page.locator('#gear-detail [data-include="cav"]').isChecked(),true);
    await page.locator('#gear-detail [data-include="cav"]').uncheck();
    await page.locator('#gear-detail .gear-back').click();
    assert.equal(await page.locator('.gear-card[data-troop="cav"]').getAttribute('data-included'),'false');
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).included.cav),false);
    await page.locator('#gear-apply-result').waitFor();
    await page.locator('#gear-apply-result').click();
    await page.locator('#gear-undo').click();
    assert.equal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level),100);
    await page.route('**/js/ocr-worker.js**',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{let texts=['Infantry Helm','Lv. +19','Forge Mastery 10'];self.postMessage({id:e.data.id,ok:true,items:texts.map((text,i)=>({text,poly:[[0,i*30],[250,i*30],[250,i*30+20],[0,i*30+20]]}))});};`}));
    // The page's button hands screenshots to the site-wide import panel.
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#gear-import').click()]);
    await chooser.setFiles({name:'gear.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vGQAAAAASUVORK5CYII=','base64')});
    const detailLevel=page.locator('#screen-import [data-key="gear-inf-helm-level"] [data-field="value"]');
    await detailLevel.waitFor();
    assert.equal(await detailLevel.inputValue(),'19','a red level reviews as its +N');
    assert.equal(await page.locator('#screen-import [data-key="gear-inf-helm-mastery"] [data-field="value"]').inputValue(),'10');
    assert.match(await page.locator('#screen-import [data-key="gear-inf-helm-level"] [data-field="note"]').textContent(),/^enhancement$/);
    // The piece is named once, above its two values, with its quality.
    assert.equal(await page.locator('#screen-import [data-key="crop:inf-helm"] .import-crop-name').textContent(),'Infantry Helm · red');
    assert.equal(await page.locator('#screen-import .import-crop').count(),1,'one piece, one heading');
    await page.locator('#screen-import [data-action="screen-import.apply"]').click();
    await page.waitForFunction(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm'].level===119);
    assert.deepEqual(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm']),{quality:'red',level:119,mastery:10});
    await page.locator('#screen-import [data-target="screen-import.chip"]').click();
    await page.unroute('**/js/ocr-worker.js**');
    // Marking a step done from the piece's sheet, then undoing it.
    await page.locator('.gear-row[data-select="inf-helm"]').click();
    const redHelm=await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm']);
    const nextHelm=E.milestone(redHelm,'mithril');
    await page.locator('#gear-edit-dialog .gear-step[data-goal="mithril"] [data-apply-goal]').click();
    assert.deepEqual(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-helm']),nextHelm);
    await page.locator('#gear-close-edit').click();
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
    await page.locator('#save-backups summary').click();
    await page.locator('#gear-load').click();
    await page.locator('#gear-save-file').setInputFiles({name:'gear.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(()=>window.PlayerLedger.shared().heroGear(window.HeroGear).pieces['inf-gloves'].level===120);
    await page.locator('.gear-row[data-select="inf-gloves"]').click();
    assert.match(await page.locator('#gear-edit-dialog .gear-step[data-goal="mithril"] [data-cost-resource="xp"]').textContent(),/74,100/);
    assert.match(await page.locator('#gear-edit-dialog .gear-step[data-goal="mithril"] [data-cost-resource="mithril"]').textContent(),/10 missing/);
    await page.locator('#gear-close-edit').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.gear-main img')].every(img=>img.complete&&img.naturalWidth>0));
    // Worth saving for: red a little out of reach, best stats for the cost first; each opens its piece.
    const forecasts=E.redPlans(fixture).routes;
    await page.locator('#gear-saving .gear-route').first().waitFor();
    assert.equal(await page.locator('#gear-saving .gear-route').count(),forecasts.length);
    assert.equal(await page.locator('#gear-saving .gear-route').first().getAttribute('data-edit-piece'),forecasts[0].id);
    await page.locator('#gear-saving .gear-route').first().click();
    assert.equal(await page.locator('#gear-edit-dialog').evaluate(d=>d.open),true);
    await page.locator('#gear-close-edit').click();
    await page.locator('#weights > summary').click();
    await page.locator('#gear-profile').selectOption('rally');
    assert.match(await page.locator('#gear-saving .gear-route').first().textContent(),/Archer/);
    await page.locator('#gear-profile').selectOption('growth');
    await page.locator('#weights > summary').click();
    // % of optimal: all that's invested in the counted pieces, spent again by the same search.
    await page.locator('#gear-optimal .gear-headline').waitFor();
    const best=E.optimal(await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear)));
    assert.equal(await page.locator('#gear-optimal .gear-headline strong').textContent(),pctOf(best.share));
    assert.ok(best.changes.length>0);
    await page.locator('#gear-show-optimal').check();
    assert.equal(await page.locator('.gear-card .gear-row[data-moved="true"]').count(),best.changes.length,'the cards show the optimal gear');
    assert.equal(await page.locator('#gear-optimal-rows .gear-change').count(),best.changes.length,'each moved piece compares now and optimal');
    assert.match(await page.locator('#gear-optimal-rows .gear-change').first().textContent(),/now.*optimal/s);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,'desktop-optimal.png'),fullPage:true});
    await page.locator('#gear-show-optimal').uncheck();
    assert.equal(await page.locator('.gear-row[data-moved]').count(),0);
    await page.screenshot({path:path.join(output,'desktop.png')});
    for(const width of [320,390,768,1280,1440]){
      const height=width===390?844:900;
      await page.setViewportSize({width,height});await fits(page,'width '+width);
      await Promise.all([page.waitForEvent('filechooser'),page.locator('#gear-import').click()]);await fits(page,'import panel '+width);await page.locator('#screen-import [data-target="screen-import.chip"]').click();
      await page.locator('[data-open="inf"]').click();await fits(page,'troop view '+width);
      if(width===390)await page.locator('#gear-detail').screenshot({path:path.join(output,'mobile-troop.png')});
      await page.locator('#gear-detail [data-select="inf-gloves"]').click();await fits(page,'piece sheet '+width);
      if(width===390)await page.screenshot({path:path.join(output,'mobile-piece.png')});
      await page.locator('#gear-close-edit').click();
      await page.locator('#gear-detail .gear-back').click();
      if(width===390){
        // On a phone the three cards fit in about one and a half screens, and the answer follows.
        await page.evaluate(()=>scrollTo(0,0));
        const cards=await page.locator('#gear-cards').boundingBox();
        assert.ok(cards.height<=height*1.6,'troop cards stay compact on a phone');
        await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#weights > summary').click();
    await page.locator('#gear-reforge').check();
    for(const [id,value]of [['parts10','2299'],['parts100','1'],['hammers','501'],['mythic','10'],['mithril','10']])await page.locator('#gear-'+id).fill(value);
    await page.locator('#gear-apply-result').waitFor();
    assert.equal(await page.locator('#gear-results > .gear-kvk-summary').getAttribute('data-kvk-points'),'2400000');
    const piecePoints=await page.locator('#gear-results .gear-change .gear-kvk-points').evaluateAll(items=>items.reduce((sum,item)=>sum+Number(item.dataset.kvkPoints),0));
    assert.equal(piecePoints,2400000,'per-piece scores sum to the batch total');
    assert.ok(await page.locator('#gear-results .gear-change[data-checkpoint="ascension"] .gear-item[data-quality="red"]').count()>0);
    await fits(page,'supplied gear red ascension');await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,'mobile-red-overview-spend.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:path.join(output,'desktop-red-overview-spend.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    for(const [id,value]of [['parts10','0'],['parts100','120'],['hammers','180'],['mythic','4'],['mithril','0']])await page.locator('#gear-'+id).fill(value);
    await page.locator('#gear-apply-result').waitFor();
    const resultRows=page.locator('#gear-results .gear-result-grid .gear-row');
    assert.ok(await resultRows.count() > 0);
    assert.equal(await page.locator('#gear-results .gear-result-grid .gear-item').count(),2 * await resultRows.count());
    assert.match(await page.locator('#gear-results .gear-result-grid').textContent(),/before.*after/s);
    assert.ok(await page.locator('#gear-results .gear-change[data-direction="down"]').count()>0);
    for(const row of await page.locator('#gear-results .gear-change[data-direction="down"]').all()){
      const [from,to]=(await row.locator('.gear-item-mastery').allTextContents()).map(Number);
      const hammerPoints=(to*(to+1)-from*(from+1))*5*4000;
      assert.equal(await row.locator('.gear-kvk-points').getAttribute('data-kvk-points'),String(hammerPoints),'reforge scores only any new mastery materials, never recovered XP');
    }
    assert.match(await page.locator('#gear-results .gear-change[data-direction="down"]').first().textContent(),/↓.*recover/);
    await fits(page,'mobile spend now');
    assert.ok(await resultRows.evaluateAll(rows=>rows.every(row=>{const box=row.getBoundingClientRect();return box.left>=-1&&box.right<=window.innerWidth+1;})),'changed-piece rows do not overflow the mobile viewport horizontally');
    await page.locator('#gear-results .gear-result-grid').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'mobile-optimise.png')});
    await page.setViewportSize({width:1280,height:900});await fits(page,'desktop spend now');
    await page.screenshot({path:path.join(output,'desktop-optimise.png')});
    await page.locator('#gear-apply-result').click();
    const applied=await page.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
    assert.equal(applied.resources.xp,applied.parts.ten*10+applied.parts.hundred*100+applied.parts.remainder);
    await page.reload();await page.waitForFunction(loaded);
    assert.equal(await page.locator('#gear-xp-total').textContent(),new Intl.NumberFormat('en-GB').format(applied.resources.xp));
    await page.setViewportSize({width:1440,height:900});
    for(const lang of langs){
      await page.goto(origin+'/hero-gear/?lang='+lang);await page.waitForFunction(loaded);await fits(page,'language '+lang);
      await page.setViewportSize({width:320,height:900});await fits(page,'narrow '+lang);
      await page.locator('[data-open="arc"]').click();await fits(page,'narrow troop view '+lang);
      await page.locator('#gear-detail .gear-back').click();await page.setViewportSize({width:1440,height:900});
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
      await overviewPage.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      const fixtures=['zoe','marlin','petra','jabel','diana','howard'];
      const dock=overviewPage.locator('#screen-import');
      const ledgerGear=()=>overviewPage.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
      async function pick(names){
        // The open panel can cover the page's button on a phone; minimise it first.
        if(await dock.locator('.import-sheet').isVisible())await dock.locator('[data-target="screen-import.chip"]').click();
        const [chooser]=await Promise.all([overviewPage.waitForEvent('filechooser'),overviewPage.locator('#gear-import').click()]);
        await chooser.setFiles(names.map(name=>path.resolve('.dsh/gear-fixtures/'+name+'.jpg')));
        await overviewPage.waitForFunction(()=>{const t=document.querySelector('[data-target="screen-import.count"]').textContent;return t&&!/reading/.test(t);},null,{timeout:240000});
        assert.equal(await dock.locator('[data-target="screen-import.count"]').textContent(),names.length+' to review',names.join(', ')+' all read as hero gear');
      }
      // Every shot's tiles, by file: troop, slot, quality, and the level as
      // the game shows it (red +20 reviews as 20).
      async function reads(n){
        const out={};
        for(let i=0;i<n;i++){
          const name=(await dock.locator('[data-target="screen-import.name"]').textContent()).replace(/\.jpg$/,'');
          const heads=await dock.locator('.import-crop').evaluateAll(rows=>Object.fromEntries(rows.map(li=>[li.dataset.key.slice(5),{name:li.querySelector('.import-crop-name').textContent,crop:!li.querySelector('img').hidden}])));
          out[name]=await dock.locator('.import-tile').evaluateAll(tiles=>tiles.map(li=>({key:li.dataset.key,value:li.querySelector('[data-field="value"]').value})));
          out[name].forEach(t=>{t.head=heads[/^gear-(\w+-\w+)-/.exec(t.key)[1]];});
          await dock.locator('[data-action="screen-import.next"]').click();
        }
        return out;
      }
      function pieces(tiles){
        const by={};
        for(const t of tiles){
          const [,troop,slot,field]=/^gear-(inf|cav|arc)-(\w+)-(level|mastery)$/.exec(t.key);
          const p=by[troop+'-'+slot]||(by[troop+'-'+slot]={troop,slot});
          if(field==='level'){p.quality=/· (\w+)$/.exec(t.head.name)[1];p.level=t.value;}else p.mastery=t.value;
          assert.ok(t.head.crop,'each piece shows its tile');
        }
        return Object.values(by).map(p=>({...p,level:p.quality==='red'&&p.level!==''?String(Number(p.level)+100):p.level}));
      }
      const expected=[
        ['inf',[['mythic',69,2],['red',120,11],['mythic',100,6],['mythic',72,3]]],
        ['arc',[['mythic',100,6],['mythic',69,2],['mythic',69,2],['mythic',100,6]]],
        ['cav',[['mythic',63,2],['mythic',39,1],['mythic',40,1],['mythic',63,1]]],
        ['cav',[['epic',0,0],['mythic',0,0],['mythic',0,0],['mythic',0,0]]],
        ['arc',[['mythic',0,0],['mythic',0,0],['mythic',0,0],['epic',0,0]]],
        ['inf',[['mythic',0,0],['mythic',0,0],['mythic',0,0],['mythic',0,0]]]
      ].map(([troop,list])=>list.map(([quality,level,mastery],i)=>({troop,slot:E.SLOTS[i],quality,level:String(level),mastery:String(mastery)})));
      await pick(fixtures.slice(0,3));
      assert.ok(await overviewPage.evaluate(()=>navigator.userAgent.includes('Android')));
      assert.ok(await overviewPage.evaluate(()=>window.__gearWorkerURLs.length>0&&window.__gearWorkerURLs.every(url=>new URL(url).searchParams.get('backend')==='wasm')),'gear number recognition bypasses mobile GPU inference, and overviews skip the whole-screen read');
      const first=await reads(3);
      fs.writeFileSync(path.join(output,'overview-reads.json'),JSON.stringify(first,null,2));
      fs.writeFileSync(path.join(output,'overview-ocr.json'),JSON.stringify(await overviewPage.evaluate(()=>window.__gearReads),null,2));
      for(let i=0;i<3;i++)assert.deepEqual(pieces(first[fixtures[i]]),expected[i],'real overview screenshot '+fixtures[i]+' using the production OCR worker');
      assert.equal((await ledgerGear()).pieces['inf-helm'].level,0,'review has not applied any values');
      await overviewPage.screenshot({path:path.join(output,'mobile-import-review.png')});
      for(const width of [320,390,768,1280]){
        await overviewPage.setViewportSize({width,height:844});await fits(overviewPage,'populated review '+width);
        const box=await dock.locator('.import-sheet').boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=845,'the review panel fits at '+width);
      }
      await overviewPage.setViewportSize({width:390,height:844});
      // A number the box refuses is never applied as the value read before it.
      while(!/^zoe/.test(await dock.locator('[data-target="screen-import.name"]').textContent()))await dock.locator('[data-action="screen-import.next"]').click();
      const helm=dock.locator('[data-key="gear-inf-helm-level"] [data-field="value"]');
      assert.equal(await helm.getAttribute('max'),'100');
      await helm.fill('101');await helm.dispatchEvent('change');
      await dock.locator('[data-action="screen-import.apply"]').click();
      assert.match(await dock.locator('[data-target="screen-import.status"]').textContent(),/can’t be saved/);
      assert.equal((await ledgerGear()).pieces['inf-helm'].level,0,'an invalid visible number applies nothing');
      await helm.fill('69');await helm.dispatchEvent('change');
      let beforeLast=null;
      for(let i=0;i<3;i++){
        beforeLast=(await ledgerGear()).pieces;
        const revision=await overviewPage.evaluate(()=>window.PlayerLedger.shared().snapshot().revision);
        await dock.locator('[data-action="screen-import.apply"]').click();
        await overviewPage.waitForFunction(r=>window.PlayerLedger.shared().snapshot().revision>r,revision);
      }
      const imported=await ledgerGear();
      for(const item of expected.slice(0,3).flat())assert.deepEqual(imported.pieces[item.troop+'-'+item.slot],{quality:item.quality,level:Number(item.level),mastery:Number(item.mastery)});
      assert.deepEqual(imported.resources,E.defaults().resources);
      assert.match(await overviewPage.locator('.gear-row[data-select="inf-gloves"]').textContent(),/\+20/,'the gear page repaints from the ledger');
      await dock.locator('[data-action="screen-import.undo"]').click();
      assert.deepEqual((await ledgerGear()).pieces,beforeLast,'undo restores the gear before the last shot');
      await pick(fixtures.slice(3));
      const second=await reads(3);
      for(let i=3;i<6;i++)assert.deepEqual(pieces(second[fixtures[i]]),expected[i],'real overview screenshot '+fixtures[i]);
      for(let i=0;i<3;i++){
        const revision=await overviewPage.evaluate(()=>window.PlayerLedger.shared().snapshot().revision);
        await dock.locator('[data-action="screen-import.apply"]').click();
        await overviewPage.waitForFunction(r=>window.PlayerLedger.shared().snapshot().revision>r,revision);
      }
      const unlevelled=await ledgerGear();
      for(const item of expected.slice(3).flat())assert.deepEqual(unlevelled.pieces[item.troop+'-'+item.slot],{quality:item.quality,level:0,mastery:0});
      // The upgrade arrow hides the 5 of the red gloves' +35: the reading is flagged, never trusted.
      await pick(['zoe-arrow']);
      assert.deepEqual(await dock.locator('.import-tile[data-state="doubt"]').evaluateAll(t=>t.map(li=>li.dataset.key)),['gear-inf-gloves-level'],'only the clipped level asks for a look');
      assert.deepEqual(await dock.locator('.import-tile').evaluateAll(t=>t.filter(li=>li.dataset.key!=='gear-inf-gloves-level').map(li=>li.querySelector('[data-field="value"]').value)),['61','3','11','100','7','65','3']);
      console.log('Production OCR: all 24 pieces in six supplied hero overviews matched rarity, troop, enhancement and mastery through the import panel; a level clipped by the upgrade arrow was flagged; review, invalid values, apply, unlevelled pieces and undo passed.');
    } catch(error) { await overviewPage.screenshot({path:path.join(output,'overview-failure.png')});throw error; } finally { await mobileContext.close(); }
    const guestContext=await browser.newContext({viewport:{width:1280,height:900}});
    try {
      await guestContext.grantPermissions(['clipboard-read','clipboard-write'],{origin});
      const owner=await guestContext.newPage();owner.on('pageerror',e=>errors.push(e.message));
      await owner.goto(origin+'/hero-gear/?lang=en');await owner.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      assert.equal(await owner.locator('#gear-load-mine').isHidden(),true,'your own gear is no separate sheet');
      await owner.locator('#gear-hammers').fill('500');
      await owner.locator('.gear-row[data-select="inf-helm"]').click();
      await owner.locator('[data-piece="inf-helm"][data-field="level"]').fill('90');await owner.locator('[data-piece="inf-helm"][data-field="level"]').press('Tab');
      await owner.locator('#gear-close-edit').click();
      await owner.locator('#gear-share').click();
      await owner.locator('#gear-share[data-copied]').waitFor();
      assert.equal(await owner.locator('#gear-share').textContent(),'Link copied','the button confirms the copy');
      assert.equal(await owner.locator('#gear-status').isHidden(),true,'no note lingers below the gear');
      await owner.locator('#gear-share:not([data-copied])').waitFor();
      assert.equal(await owner.locator('#gear-share').textContent(),'Copy share link');
      const shared=await owner.evaluate(()=>navigator.clipboard.readText());
      assert.match(shared,/\/hero-gear\/\?gear=m90\.0(-m0\.0){11}&w=growth$/);
      const visitor=await guestContext.newPage();visitor.on('pageerror',e=>errors.push(e.message));
      await visitor.goto(shared);await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      assert.match(await visitor.locator('#gear-sheet > span').textContent(),/A shared sheet\. Your save is untouched\./);
      assert.equal(await visitor.locator('#gear-save-mine').isVisible(),true);
      assert.equal(await visitor.locator('#gear-load-mine').isVisible(),true);
      assert.equal(await visitor.locator('#gear-hammers').inputValue(),'','a link carries gear, not the sender\'s bag');
      assert.match(await visitor.locator('.gear-row[data-select="inf-helm"]').textContent(),/\+90/);
      await visitor.locator('#gear-hammers').fill('999');
      await visitor.locator('.gear-row[data-select="inf-boots"]').click();
      await visitor.locator('[data-piece="inf-boots"][data-field="level"]').fill('50');await visitor.locator('[data-piece="inf-boots"][data-field="level"]').press('Tab');
      await visitor.locator('#gear-close-edit').click();
      assert.match(visitor.url(),/gear=m90\.0-m0\.0-m0\.0-m50\.0/,'the address bar follows edits to a sheet');
      assert.equal(await visitor.locator('#gear-save').textContent(),'on this sheet only');
      const saved=await owner.evaluate(()=>JSON.parse(localStorage.getItem('bh:player-ledger:v1')));
      assert.equal(saved.inventory.forgehammer.amount,500,'guest edits never reach the saved inventory');
      assert.equal(saved.heroGear.pieces['inf-boots'],undefined,'guest edits never reach the saved gear');
      await visitor.goto(origin+'/hero-gear/?lang=en&guest');await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      assert.equal(await visitor.locator('#gear-hammers').inputValue(),'500','plain guest mode starts from a copy of your save');
      assert.match(visitor.url(),/\?lang=en&gear=/);
      // Load mine goes back to your own gear; Start blank opens an empty sheet; Save as mine writes a sheet back.
      await Promise.all([visitor.waitForNavigation(),visitor.locator('#gear-load-mine').click()]);
      assert.match(visitor.url(),/\/hero-gear\/\?lang=en$/);
      await Promise.all([visitor.waitForNavigation(),visitor.locator('#gear-blank').click()]);await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      assert.match(await visitor.locator('#gear-sheet-source').textContent(),/A blank sheet\./);
      assert.equal(await visitor.locator('#gear-blank').isHidden(),true);
      assert.equal(await visitor.locator('#gear-save-mine').isHidden(),true,'nothing to save from a blank sheet');
      await visitor.goto(shared.replace('m90.0','m95.3'));await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      await visitor.locator('#gear-save-mine').click();
      await Promise.all([visitor.waitForNavigation(),visitor.locator('#gear-confirm-save').click()]);await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      const mine=await visitor.evaluate(()=>window.PlayerLedger.shared().heroGear(window.HeroGear));
      assert.deepEqual(mine.pieces['inf-helm'],{quality:'mythic',level:95,mastery:3},'Save as mine writes the sheet\'s gear');
      assert.equal(mine.resources.hammers,500,'a material the sheet left at 0 keeps your number');
      assert.equal(await visitor.locator('#gear-sheet').isHidden(),true,'back on your own save, the notice goes');
      await visitor.goto(origin+'/hero-gear/?gear=broken');await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      assert.match(await visitor.locator('#gear-sheet-source').textContent(),/That link could not be read, so this is a blank sheet\./);
      await visitor.goto(origin+'/hero-gear/?lang=en&gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth');
      await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
      await visitor.locator('#gear-optimal .gear-headline').waitFor({timeout:90000});
      const linked=E.optimal(Object.assign(E.defaults(),E.readLink('?gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth')));
      assert.equal(await visitor.locator('#gear-optimal .gear-headline strong').textContent(),pctOf(linked.share));
      assert.ok(linked.share<1&&linked.changes.length>0,'this sheet is short of optimal');
      // Old links to Settings and Theory open the fold they now sit in.
      for(const [hash,fold] of [['#kvk-points','#kvk-points'],['#maths-sources','#maths'],['#how-it-works','#how-it-works'],['#save-backups','#save-backups'],['#best-split-method','#best-split-method'],['#weights','#weights']]){
        await visitor.goto(origin+'/hero-gear/?lang=en'+hash);await visitor.waitForFunction(()=>document.querySelectorAll('.gear-card .gear-row').length===12);
        if(fold)assert.equal(await visitor.locator(fold).evaluate(d=>d.open),true,hash+' opens its fold');
        assert.equal(await visitor.locator('#gear-planner').isVisible(),true,'the planner stays in view');
      }
      await visitor.locator('#kvk-points').evaluate(d=>{d.open=false;});
      await visitor.locator('.gear-row[data-select="inf-helm"]').click();
      await visitor.locator('#gear-edit-dialog .gear-step .gear-kvk-points').first().waitFor();
      await visitor.locator('#gear-close-edit').click();
      await visitor.locator('#gear-results .gear-theory-link[href="#kvk-points"]').click();
      await visitor.locator('#kvk-points').waitFor();
      assert.match(await visitor.locator('#gear-kvk-formula').textContent(),/each Forgehammer you spend scores 4,000 points/);
      // A link to a note opens its fold.
      await visitor.waitForFunction(()=>document.getElementById('kvk-points').open);
    } finally { await guestContext.close(); }
    assert.deepEqual(errors,[]);
    console.log('Visual gear, original assets, edit dialogs, resource bars, persistence, exclusions, worker search, step/search apply and undo, screenshot review, JSON import, sheets and share links, % of optimal and Show optimal, troop cards and the troop view, piece sheets with their next steps, Worth saving for, Save as mine, Load mine, Start blank, the notes as folds and their old links, 5 widths and 17 language layouts passed. OCR delivery was stubbed; parser fixtures use real worker item shapes.');
  }catch(error){
    if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.txt'),page.url()+'\n'+error.stack);}
    throw error;
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

