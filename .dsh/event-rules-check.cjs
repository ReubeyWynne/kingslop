const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const rules=require('../js/event-rules.js'), Ledger=require('../js/player-ledger.js');
const Troops=require('../js/troop-spend.js');
const digest=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
count('bread',580e9);assert.equal(rules.calculate(store.snapshot(),'prep',4,{},0).complete,false);
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
assert.equal(digest(rules.data.legacy),'0835875489704a03a5592ba0dc89e7cca4e512722bcb0b045b0a01c0295b0e2c');
const originalEvents=Object.fromEntries(Object.entries(rules.data.events).map(([event,days])=>[event,days.map(day=>({day:day.day,rows:day.rows.map(({label,points,items})=>items?{label,points,items}:{label,points})}))]));
assert.equal(digest(originalEvents),'8721a4c4609901f237be1ac1bea4b89025e354023113c84038558cb28c26e500');
for(const [event,key] of [['sg','SG_TASKS'],['armament','ARM_TASKS'],['officer','OFF_TASKS']]){
 const groups=rules.data.legacy[key];
 for(const group of Object.keys(groups)){
  const tasks=rules.tasks(event,event==='sg'?Number(group)+1:group);
  assert.deepEqual(tasks.map(task=>[task.label,task.points]),groups[group]);
  for(const task of tasks){assert(task.id);assert(task.category===null||rules.data.legacy.VITEMS.includes(task.category));assert.equal(typeof task.copyLabel,'string');}
 }
}
assert.throws(()=>rules.tasks('prep',1));assert.throws(()=>rules.tasks('sg',0));
const dictionaries=fs.readdirSync('i18n').filter(x=>x.endsWith('.js')).map(name=>{const context={window:{}};vm.runInNewContext(fs.readFileSync('i18n/'+name,'utf8'),context);return Object.values(context.window.__BH_I18N_DATA)[0];});
const keys=Object.keys(dictionaries.find(d=>d['ks.available.title']==='Your available points')).filter(k=>k.startsWith('ks.available.'));
for(const dictionary of dictionaries)for(const key of keys)assert.equal(typeof dictionary[key],'string',key);
// The 28-day wheel on UTC: cycle day 1 is Monday 2026-08-17, the same anchor the Event Cycle page uses.
assert.equal(rules.EPOCH,Date.UTC(2026,7,17));
assert.deepEqual([rules.cycleDay('brawl',4),rules.cycleDay('sg',4),rules.cycleDay('sg',6),rules.cycleDay('prep',4)],[4,11,13,25]);
const saturday=Date.UTC(2026,9,17,13);assert.equal(rules.opens('sg',4,saturday),Date.UTC(2026,9,22));assert.equal(rules.opens('brawl',4,saturday),Date.UTC(2026,10,12));assert.equal(rules.opens('prep',4,saturday),Date.UTC(2026,10,5));
assert.equal(rules.opens('sg',4,Date.UTC(2026,9,22,23)),Date.UTC(2026,9,22),'an open day is its own opening');
function scoring(){return Object.entries(rules.data.events).flatMap(([event,days])=>days.map(day=>({event,day:day.day,total:rules.calculate(store.snapshot(),event,day.day,{},null).total,speedups:day.rows.map(row=>[rules.speedupKinds(row),rules.governorKind(row),rules.rate(row)]),troops:Troops.rates(day.rows,event)?.rates??null})));}
const before=scoring(), troopRates=before.map(day=>[day.event,day.day,day.troops]);
assert.equal(digest(troopRates),'9557b3d4d118d5e6878331945233eb75d6188a6d3a4f2cc76571c3f872f56df2');
for(const [event,days] of Object.entries(rules.data.events))for(const day of days){
 const ids=new Set();
 for(const row of day.rows){
  assert(row.id&&!ids.has(row.id));ids.add(row.id);
  assert(row.category===null||row.category==='free'||rules.data.legacy.VITEMS.includes(row.category));
  if(row.scoring){
   const s=row.scoring;assert(['speedup','governor','troops'].includes(s.type));
   if(s.type==='speedup'){assert.deepEqual(rules.speedupKinds(row),s.kinds);assert(s.kinds.includes('general'));assert.equal(new Set(s.kinds).size,s.kinds.length);assert(s.kinds.every(kind=>['general','construction','research','training','learning','healing'].includes(kind)));}
   if(s.type==='governor')assert(['gear','charms'].includes(s.kind));
   if(s.type!=='troops'){if(s.rate===null)assert.equal(rules.rate(row),null);else assert.equal(rules.rate(row),Number(row.points.replace(/,/g,'')));}
   else{assert(!s.rateSet||['kvk','sg'].includes(s.rateSet));for(const[tier,rate]of Object.entries(s.rates)){assert(Number(tier)>=1&&Number(tier)<=11);assert(Number.isSafeInteger(rate)&&rate>0);}}
  }
 }
}
assert.equal(rules.speedupKinds({label:'1 min speedups',points:'30'}),null);
assert.equal(rules.governorKind({label:'Governor Charm max score +1',points:'70'}),null);
assert.equal(rules.rate({points:'30'}),null);
assert.equal(Troops.rates([{label:'T10 troop',points:'999'}],'sg'),null);
assert.equal(rules.governorKind(rules.rules('prep',5).rows[0]),'gear');
assert.equal(rules.rate(rules.rules('prep',5).rows[0]),null,'unpriced governor gear remains unquantified');
const sgTroops=rules.rules('sg',4).rows.filter(row=>row.scoring?.type==='troops');
assert.equal(Troops.rates(sgTroops,'brawl').rates[10],39,'rate sets belong to rows');
assert.equal(Troops.rates([{scoring:{type:'troops',rates:{10:41},rateSet:'sg'}}],'sg').rates[10],41,'explicit rates override a verified rate set');

function cycleCards(engine){
 const nodes={};
 for(const id of ['ks-prev','ks-next','ks-today','ks-view-title','ks-date','ks-next-day','ks-card','ks-copy-out','ks-copy-meta','ks-copy-btn','ks-copy-status','ks-copy-preview','ks-copy-link'])nodes[id]={textContent:'',innerHTML:'',value:'',handlers:{},setAttribute(){},addEventListener(key,fn){this.handlers[key]=fn;}};
 const document={getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 const BH={tr:(key,fallback)=>fallback,fmt:n=>n.toLocaleString('en-GB'),tpl:(key,fallback,values)=>fallback.replace(/\{(\w+)\}/g,(_,key)=>values[key]),registerPage(page){this.page=page;}};
 const clock=class extends Date{constructor(...args){super(...args.length?args:[rules.EPOCH]);}};
 vm.runInNewContext(fs.readFileSync('js/kvk.js','utf8'),{document,BH,Date:clock,window:{EventRules:engine,BH,addEventListener(){}}});BH.page.boot(BH);
 const copies=[],cards=[];
 for(let day=1;day<=rules.CYCLE;day++){copies.push(nodes['ks-copy-out'].value);cards.push(nodes['ks-card'].innerHTML);nodes['ks-next'].handlers.click();}
 return {copies,cards};
}
const cycle=cycleCards(rules);
assert.equal(digest(cycle.copies),'6ae8291336a06093987fcccb7acd4a18f293cd514cf053eb0a2f576e0832e70b');
assert.equal(digest(cycle.cards),'67fdc91830eea4b97ac82c15c4c2dabeeeb325167817ed91cfb6786b9905b434','28 days preserve cards and copy without reference DOM');
const altered=JSON.parse(JSON.stringify(rules.data));
for(const days of Object.values(altered.events))for(const day of days)for(const row of day.rows){row.label='翻訳された表示';row.points='display only';}
for(const key of ['SG_TASKS','ARM_TASKS','OFF_TASKS'])for(const rows of Object.values(altered.legacy[key]))for(const row of rows)row[0]='翻訳された表示';
const context={window:{EventRuleData:altered}};
vm.runInNewContext(fs.readFileSync('js/event-rules.js','utf8'),context);
const renamed=context.window.EventRules;
for(const day of before){
 const rows=renamed.rules(day.event,day.day).rows;
 assert.equal(renamed.calculate(store.snapshot(),day.event,day.day,{},null).total,day.total);
 assert.equal(digest(rows.map(row=>[renamed.speedupKinds(row),renamed.governorKind(row),renamed.rate(row)])),digest(day.speedups));
 assert.equal(digest(Troops.rates(rows,day.event)?.rates??null),digest(day.troops));
}
const translated=cycleCards(renamed);
assert.deepEqual(translated.copies,cycle.copies,'display label changes cannot change chat labels, icons or roulette warnings');
function advisory(cards){return cards.map(card=>[...card.matchAll(/class="trow ([^"]*v-(?:best|ok|low|hold))"[^]*?<span class="tname">([^]*?)<\/span>/g)].map(match=>[match[1],match[2]]));}
assert.deepEqual(advisory(translated.cards),advisory(cycle.cards),'display labels cannot change recommendations');
assert.equal(cycleCards(Object.assign({},rules,{CYCLE:7})).copies[7],cycle.copies[0],'the clock uses the shared cycle length');
assert.equal(cycleCards(Object.assign({},rules,{EPOCH:rules.EPOCH+rules.DAY_MS})).copies[0],cycle.copies[27],'the clock uses the shared UTC epoch');
console.log('Event rules: metadata, label-independent scoring, preserved rates, 28-day cards/copy, UTC dates, inventory and translations pass.');
