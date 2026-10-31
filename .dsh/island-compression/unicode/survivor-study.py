from pathlib import Path
import json,difflib,collections,unicodedata as u,math,hashlib
p=Path(__file__).resolve().parent
pairs=[('layout-8901-root.txt','returned-game-message.txt'),('blacklist-layout-8901-root.txt','returned-blacklist-v1-game-message.txt')]
passed=collections.Counter();failed=collections.Counter();trials=[];evidence=collections.defaultdict(list)
for source,returned in pairs:
 a=(p/source).read_text();b=(p/returned).read_text();ops=difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes();tail=ops[-1][1] if ops[-1][0]=='delete' and ops[-1][2]==len(a) else len(a)
 good=collections.Counter();bad=collections.Counter();start=a.index('#')+2
 for tag,i,j,k,l in ops:
  for pos in range(max(i,start),min(j,tail)):
   c=a[pos];assert 0<=ord(c)<0xd800 or 0xe000<=ord(c)<0x10000
   (good if tag=='equal' else bad)[c]+=1;evidence[c].append({'trial':source,'position':pos,'unchanged':tag=='equal'})
 passed.update(good);failed.update(bad)
 trials.append({'source':source,'returned':returned,'sourceSha256':hashlib.sha256(a.encode()).hexdigest(),'returnedSha256':hashlib.sha256(b.encode()).hexdigest(),'unchangedPayloadOccurrences':sum(good.values()),'distinctUnchangedPayloadCharacters':len(good),'changedPayloadOccurrences':sum(bad.values()),'excludedTailUnits':len(a)-tail,'excludedPrefixUnits':start})
conflicts={c for c in passed if failed[c]};survivors=sorted(c for c in passed if not failed[c]);assert len(survivors)==919 and not conflicts
letters=sorted(c for c in survivors if u.category(c)[0] in 'LN');assert len(letters)==867
selected=sorted(sorted(letters,key=lambda c:(-passed[c],ord(c)))[:512])
def ranges(chars):
 out=[]
 for cp in sorted(map(ord,chars)):
  if out and out[-1][1]+1==cp:out[-1][1]=cp
  else:out.append([cp,cp])
 return out
profiles={}
for name,chars,marker,compact_marker in [('survivors512',selected,'.','?'),('survivors919',survivors,'|',';'),('survivors867',letters,',','/')]:
 n=len(chars);v={'marker':marker,'ranges':ranges(chars),'size':n,'bitsPerUnit':math.log2(n),'risk':'Observed unchanged in at least one supplied game return, with no observed failures. Arbitrary sequences and new contexts remain unverified.'}
 if n==512:v['bits']=9
 profiles[name]=v;profiles[name+'-ic1']={**v,'marker':compact_marker,'compactIc1':True,'fallback':name}
(p/'survivor-alphabets-v1.mjs').write_text('export default '+json.dumps({'unicodeDataVersion':u.unidata_version,'profiles':profiles},separators=(',',':'))+';\n')
source=(p/'transport.mjs').read_text();generated=source.replace("'./alphabets-v1.mjs'","'./survivor-alphabets-v1.mjs'").replace('MAX_UNITS = 40000','MAX_UNITS = 60000');(p/'survivor-transport-v1.mjs').write_text(generated)
result={'basis':'Exact aligned payload occurrences from two user-returned specimens. URL prefixes, transport markers and the missing first-trial tail are excluded. A changed occurrence overrides any unchanged occurrence.','trials':trials,'distinctObservedUnchanged':len(passed),'conflictingCharacters':sorted(conflicts),'observedSurvivors':len(survivors),'observations':sum(passed.values()),'alphabet919':''.join(survivors),'alphabet512':''.join(selected),'alphabet867':''.join(letters),'selection512':'Observed letters and numbers only; most unchanged observations first, then numeric code-point order; selected digits are then sorted by code point. This is a deterministic size/speed comparison, not a predictive safety ranking.','neededFor1024':1024-len(survivors),'evidence':[{'character':c,'codePoint':f'U+{ord(c):04X}','unicodeName':u.name(c,'UNKNOWN'),'unchangedObservations':passed[c],'failedObservations':failed[c],'occurrences':evidence[c]} for c in survivors],'capacity':[{'symbols':n,'bitsPerUnit':math.log2(n),'originalRouteByteCapacity':math.floor((497*math.log2(n)-1)/8),'rootRouteByteCapacity':math.floor((504*math.log2(n)-1)/8),'evidence':'observed pool' if n==919 else 'observed subset' if n in [512,867] else 'capacity calculation only; not a tested alphabet'} for n in [512,867,919,1024,2048]],'notClaimed':'Character-level observations are not proof of arbitrary-message preservation. Neither candidate has yet been sent as a newly encoded layout.'}
(p/'survivor-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
