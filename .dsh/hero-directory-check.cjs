const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const heroes=require('../_data/heroes.json').heroes,roles=require('../_data/hero_roles.json'),engine=require('../js/hero-directory-engine.js');
const records=heroes.map(h=>({...h,roles:roles.heroes[h.key].recommendations.map(r=>r.role)}));
assert.equal(heroes.length,34);assert.equal(new Set(heroes.map(h=>h.key)).size,34);assert.deepEqual(Object.keys(roles.heroes).sort(),heroes.map(h=>h.key).sort());
const filter=f=>records.filter(h=>engine.matches(h,f));
assert.equal(filter({}).length,34);assert.deepEqual(filter({query:'  ChEnKo '}).map(h=>h.key),['chenko']);
assert.deepEqual(filter({query:'HILDE'}).map(h=>h.key),['hilde']);assert.equal(filter({generation:2}).length,3);assert.equal(filter({generation:2,troop:'cav'})[0].key,'hilde');assert.equal(filter({server:1,generation:2}).length,0);
assert(filter({server:3}).every(h=>h.generation<=3));assert.equal(filter({role:'defence-joiner'}).length,6);
assert.deepEqual(filter({role:'bear-joiner',server:1,troop:'cav'}).map(h=>h.key),['chenko']);assert.equal(filter({query:'<script>'}).length,0);
assert.equal(filter({role:'unknown'}).length,0);assert.equal(filter({server:99}).length,34);
const allowed=['garrison-lead','defence-joiner','rally-lead','attack-joiner','bear-lead','bear-joiner'];
for(const hero of records){const meta=roles.heroes[hero.key];assert.equal(new Set(meta.recommendations.map(r=>r.role)).size,meta.recommendations.length);
 assert.equal(meta.portrait,hero.key+'.webp');assert(fs.existsSync('img/heroes/'+meta.portrait));assert(meta.wiki.startsWith('https://kingshotwiki.com/heroes/'));assert.equal(meta.skillNotes.length,hero.skills.length);for(const skill of meta.skillNotes){assert(skill.name);assert(skill.summary);}
 for(const r of meta.recommendations){assert(allowed.includes(r.role));assert(roles.sources[r.source]);assert(['inferred','community','policy','conditional'].includes(r.confidence));if(r.reason==='defenderWidget')assert.equal(hero.widget.role,'defender');if(r.reason==='rallyWidget')assert.equal(hero.widget.role,'rally');}
}
assert.equal(roles.heroes.hilde.recommendations.find(r=>r.role==='bear-joiner').confidence,'conditional');assert.equal(roles.heroes.petra.recommendations.find(r=>r.role==='bear-joiner').reason,'petra');
const nav=require('../_data/nav.json'),pages=require('../_data/pages.json');assert.equal(nav.filter(n=>n.self==='heroes').length,1);
for(let i=0;i<nav.length;i++){const p=pages[nav[i].self],previous=pages[nav[(i-1+nav.length)%nav.length].self],next=pages[nav[(i+1)%nav.length].self];assert.equal(p.swipePrev.page,previous.token);assert.equal(p.swipeNext.page,next.token);}
const dictionaries=fs.readdirSync('i18n').filter(x=>x.endsWith('.js')).map(file=>{const ctx={window:{}};vm.runInNewContext(fs.readFileSync('i18n/'+file,'utf8'),ctx);return Object.values(ctx.window.__BH_I18N_DATA)[0];});
const keys=Object.keys(dictionaries.find(d=>d['directory.title']==='Hero directory')).filter(k=>k.startsWith('directory.'));assert.equal(keys.length,57);
for(const dictionary of dictionaries){for(const key of keys)assert.equal(typeof dictionary[key],'string',key);assert(dictionary['directory.count'].includes('{n}')&&dictionary['directory.count'].includes('{total}'));}
const html=fs.readFileSync('heroes/index.html','utf8');assert(html.includes('site.data.heroes.heroes'));assert(!html.includes('window.HeroData'));
console.log('Hero directory: canonical metadata, sources, filters, conditional guidance, navigation cycle and 17 dictionaries pass.');
