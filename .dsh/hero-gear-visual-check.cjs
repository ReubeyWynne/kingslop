const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
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
    await page.locator('.gear-row[data-select="inf-helm"]').click();
    await page.locator('[data-piece="inf-helm"][data-field="level"]').fill('100');
    await page.locator('[data-piece="inf-helm"][data-field="level"]').press('Tab');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').fill('10');
    await page.locator('[data-piece="inf-helm"][data-field="mastery"]').press('Tab');
    await page.locator('#gear-close-edit').click();
    const cells=await page.locator('.gear-cost-row').allTextContents();
    assert.match(cells[0],/52,650/);assert.match(cells[1],/110/);assert.match(cells[2],/6/);assert.match(cells[3],/10/);
    for(const [id,value]of [['xp','52650'],['hammers','110'],['mythic','6'],['mithril','10']])await page.locator('#gear-'+id).fill(value);
    assert.match(await page.locator('#gear-milestone-out').textContent(),/you have every resource/);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);
    assert.equal(await page.locator('#gear-xp').inputValue(),'52650');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-helm'].level),100);
    await page.locator('#gear-troops [data-troop="cav"]').click();
    assert.equal(await page.locator('#gear-include').isChecked(),true);
    await page.locator('#gear-include').uncheck();
    await page.locator('#gear-tab-cav').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#gear-tab-arc').getAttribute('aria-selected'),'true');
    await page.locator('#gear-mode-plan').click();
    await page.locator('#gear-piece-select summary').click();
    await page.locator('#gear-selected').selectOption('inf-helm');
    await page.locator('#gear-target').fill('200');
    await page.locator('#gear-target-mastery').fill('20');
    assert.match(await page.locator('.gear-cost-ledger').textContent(),/501,050/);
    await page.locator('#gear-mode-optimise').click();await page.locator('#gear-run').click();
    await page.locator('#gear-apply-result').waitFor();
    await page.locator('#gear-apply-result').click();
    await page.locator('#gear-undo').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-helm'].level),100);
    await page.route('**/js/ocr-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{let texts=['Infantry Helm','Lv. +19','Forge Mastery 10'];self.postMessage({id:e.data.id,ok:true,items:texts.map((text,i)=>({text,poly:[[0,i*30],[250,i*30],[250,i*30+20],[0,i*30+20]]}))});};`}));
    await page.locator('#gear-import').click();
    await page.locator('#gear-images').setInputFiles({name:'gear.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vGQAAAAASUVORK5CYII=','base64')});
    await page.locator('[data-import-field="level"]').waitFor();
    assert.equal(await page.locator('[data-import-field="level"]').inputValue(),'119');
    assert.equal(await page.locator('[data-import-field="quality"]').inputValue(),'red');
    await page.locator('#gear-apply-import').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-helm'].level),119);
    await page.locator('#gear-mode-milestones').click();
    await page.locator('#gear-apply-milestone').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-helm'].level),120);
    await page.locator('#gear-undo').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-helm'].level),119);
    const fixture=E.defaults();
    fixture.pieces['inf-helm']={quality:'mythic',level:69,mastery:2};
    fixture.pieces['inf-gloves']={quality:'red',level:120,mastery:11};
    fixture.pieces['inf-chest']={quality:'mythic',level:100,mastery:6};
    fixture.pieces['inf-boots']={quality:'mythic',level:72,mastery:3};
    fixture.selected='inf-gloves';fixture.resources={xp:52650,hammers:110,mythic:6,mithril:10};
    await page.locator('.gear-save-tools summary').click();
    await page.locator('#gear-load').click();
    await page.locator('#gear-save-file').setInputFiles({name:'gear.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bh:hero-gear:v1')).pieces['inf-gloves'].level===120);
    await page.locator('.gear-save-tools summary').click();
    assert.match(await page.locator('[data-cost-resource="xp"]').textContent(),/74,100/);
    assert.match(await page.locator('[data-cost-resource="mithril"]').textContent(),/10 missing/);
    await page.waitForFunction(()=>[...document.querySelectorAll('.gear-main img')].every(img=>img.complete&&img.naturalWidth>0));
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
        await page.locator('#gear-view-plan').click();
        assert.equal(await page.locator('.gear-answer').isVisible(),true);
        assert.equal(await page.locator('.gear-editor').isVisible(),false);
        await fits(page,'plan '+width);
        if(width===390){
          await page.evaluate(()=>scrollTo(0,0));
          const ledger=await page.locator('.gear-cost-ledger').boundingBox();
          const views=await page.locator('#gear-views').boundingBox();
          assert.ok(ledger.y+ledger.height<=views.y,'upgrade resource costs remain above mobile view controls');
          await page.screenshot({path:path.join(output,'mobile-plan.png')});
        }
        await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);
        assert.equal(await page.locator('#gear-forge').getAttribute('data-view'),'plan');
        await page.locator('#gear-view-gear').click();
        await page.locator('.gear-row[data-select="inf-gloves"]').click();await fits(page,'edit '+width);
        await page.locator('#gear-close-edit').click();
        const bottom=await page.locator('#gear-views').evaluate(el=>el.getBoundingClientRect().bottom);
        assert.ok(bottom<=height,'gear controls fit viewport at '+width);
      }
      if(width===390)await page.screenshot({path:path.join(output,'mobile.png')});
    }
    await page.setViewportSize({width:1440,height:900});
    for(const lang of langs){
      await page.goto(origin+'/hero-gear/?lang='+lang);await page.waitForFunction(()=>document.querySelectorAll('.gear-row').length===4);await fits(page,'language '+lang);
      await page.setViewportSize({width:320,height:900});await fits(page,'narrow '+lang);
      await page.locator('#gear-view-plan').click();await fits(page,'narrow plan '+lang);
      await page.locator('#gear-view-gear').click();await page.setViewportSize({width:1440,height:900});
    }
    assert.deepEqual(errors,[]);
    console.log('Visual gear, original assets, edit dialogs, resource bars, persistence, exclusions, keyboard tabs, worker search, milestone/search apply and undo, screenshot review, JSON import, mobile Gear/Plan, 5 widths and 17 language layouts passed. OCR delivery was stubbed; parser fixtures use real worker item shapes.');
  }catch(error){
    if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.txt'),page.url()+'\n'+error.stack);}
    throw error;
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
