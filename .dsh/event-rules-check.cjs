const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const rules=require('../js/event-rules.js'), Ledger=require('../js/player-ledger.js');
const storage={getItem(k){return this[k]??null},setItem(k,v){this[k]=v}};
const store=Ledger.create(storage);
const count=(id,n)=>store.setBalance(id,n);
let result=rules.calculate(store.snapshot(),'prep',4,{},1e6);
assert.equal(result.total,0);assert.equal(result.complete,false);assert.deepEqual(result.unknown,['hero-widget','mithril','forgehammer']);assert.equal(result.items.find(x=>x.id==='mithril').points,null);
count('mithril',10);count('forgehammer',25);count('hero-widget',3);count('hero-gear-xp',5000);
result=rules.calculate(store.snapshot(),'prep',4,{mithril:2,forgehammer:5},1e6);
assert.equal(result.total,424000);assert.equal(result.reservedPoints,100000);assert.equal(result.inventoryPoints,524000);assert.equal(result.shortfall,576000);assert.equal(result.complete,true);
assert.equal(rules.calculate(store.snapshot(),'prep',1,{},0).items.find(x=>x.id==='mithril').eligible,false);
assert.equal(rules.calculate(store.snapshot(),'sg',2,{},0).total,524000);
assert.equal(rules.calculate(store.snapshot(),'brawl',4,{},0).total,245625);
assert.equal(rules.calculate(store.snapshot(),'brawl',6,{},0).total,245625);
assert.equal(rules.calculate(store.snapshot(),'sg',6,{},0).total,0);
assert.equal(rules.calculate(store.snapshot(),'prep',4,{mithril:999},0).items.find(x=>x.id==='mithril').reserved,10);
assert.equal(rules.calculate(store.snapshot(),'prep',4,{},null).shortfall,null);
count('mithril',0);assert.equal(rules.calculate(store.snapshot(),'prep',4,{},0).complete,true);
count('mithril',null);assert.equal(rules.calculate(store.snapshot(),'prep',4,{},0).complete,false);
for(const event of Object.keys(rules.data.events))for(const day of rules.days(event)){
 const r=rules.calculate(store.snapshot(),event,day.day,{},0);assert(Number.isSafeInteger(r.total));
 for(const row of day.rows)for(const item of row.items||[]){assert(rules.data.items.some(x=>x.id===item.id));assert(Number.isSafeInteger(item.rate)&&item.rate>0);}
 assert(r.unquantified.every(x=>!x.items));
}
assert.throws(()=>rules.calculate(store.snapshot(),'constructor',1,{},0));
assert.throws(()=>rules.calculate(store.snapshot(),'prep',0,{},0));assert.throws(()=>rules.calculate(store.snapshot(),'prep',6,{},0));
assert.throws(()=>rules.calculate(store.snapshot(),'prep',4,{mithril:-1},0));assert.throws(()=>rules.calculate(store.snapshot(),'prep',4,{},NaN));
assert.throws(()=>rules.calculate({inventory:{mithril:{status:'confirmed',amount:1.5}}},'prep',4,{},0));
// Golden digest of the original guide arrays at 313fbb2; preserves guide/copy output.
assert.equal(require("node:crypto").createHash("sha256").update(JSON.stringify(rules.data.legacy)).digest("hex"),"0835875489704a03a5592ba0dc89e7cca4e512722bcb0b045b0a01c0295b0e2c");
// The extracted arrays drive the same guide/copy code, not a second hard-coded table.
const page=fs.readFileSync('js/kvk.js','utf8');for(const key of Object.keys(rules.data.legacy))assert(page.includes('window.EventRules.data.legacy.'+key));
const html=fs.readFileSync('events/index.html','utf8');for(const event of Object.keys(rules.data.events))for(const day of rules.days(event))assert(html.includes('site.data.event_rules.events.'+event+'['+(day.day-1)+'].rows'));
assert.equal(rules.labelToItemId('Hero Gear Forgehammer'),'Forgehammer');assert.equal(rules.labelToItemId('Tempered Truegold'),'Tempered TG');assert.equal(rules.labelToItemId('Truegold Dust'),null);
const dictionaries=fs.readdirSync('i18n').filter(x=>x.endsWith('.js')).map(name=>{const context={window:{}};vm.runInNewContext(fs.readFileSync('i18n/'+name,'utf8'),context);return Object.values(context.window.__BH_I18N_DATA)[0];});
const keys=Object.keys(dictionaries.find(d=>d['ks.available.title']==='Your available points')).filter(k=>k.startsWith('ks.available.'));
for(const dictionary of dictionaries)for(const key of keys)assert.equal(typeof dictionary[key],'string',key);
console.log('Event rules: totals, unknowns, withholding, units, event days and translations pass.');
