from pathlib import Path
import json,difflib,unicodedata as u,collections,math,base64
p=Path(__file__).resolve().parent
a=(p/'layout-8901-root.txt').read_text();b=(p/'returned-game-message.txt').read_text();ops=difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes()
tail=ops[-1][1] if ops[-1][0]=='delete' and ops[-1][2]==len(a) else len(a)
def kind(c):
 name=u.name(c,'')
 if c.isascii():return 'ASCII prefix'
 if 0xac00<=ord(c)<=0xd7a3:return 'Hangul syllables'
 if 'CJK' in name and 'IDEOGRAPH' in name:return 'CJK ideographs'
 if u.category(c)[0]=='S':return 'Other symbols'
 return 'Other scripts and punctuation'
counts=collections.defaultdict(collections.Counter);occurrences=collections.defaultdict(list);bad=set()
for tag,i,j,k,l in ops:
 for pos in range(i,min(j,tail)):
  c=a[pos];counts[kind(c)]['total']+=1;counts[kind(c)]['unchanged' if tag=='equal' else 'changed']+=1
  occurrences[c].append({'position':pos,'unchanged':tag=='equal'})
  if tag!='equal':bad.add(c)
profiles=json.loads((p/'alphabets-v1.json').read_text())['profiles'];alphabet=[cp for start,end in profiles['assigned']['ranges'] for cp in range(start,end+1)]
is_han=lambda cp:'CJK' in u.name(chr(cp),'') and 'IDEOGRAPH' in u.name(chr(cp),'')
sets={
 'observed-blacklist':([cp for cp in alphabet if chr(cp) not in bad],'(','^'),
 'no-ideographs':([cp for cp in alphabet if not is_han(cp) and chr(cp) not in bad],')','+'),
 'no-ideographs-symbols':([cp for cp in alphabet if not is_han(cp) and u.category(chr(cp))[0]!='S'],'{','}'),
 'hangul':(list(range(0xac00,0xd7a4)),'[',']')
}
def ranges(cps):
 out=[]
 for cp in cps:
  if out and out[-1][1]+1==cp:out[-1][1]=cp
  else:out.append([cp,cp])
 return out
new_profiles={};sizes=[]
for name,(cps,marker,compact_marker) in sets.items():
 base={'marker':marker,'ranges':ranges(cps),'size':len(cps),'bitsPerUnit':math.log2(len(cps)),'risk':'Unverified game-chat candidate. Derived from one failed sample, not a validated whitelist.'}
 new_profiles[name]=base;new_profiles[name+'-ic1']={**base,'marker':compact_marker,'compactIc1':True,'fallback':name}
 sizes.append({'profile':name+'-ic1','alphabetSize':len(cps),'bitsPerUnit':math.log2(len(cps)),'guaranteedCompactBytesWithRoot':math.floor((504*math.log2(len(cps))-1)/8)})
prior=json.loads((p.parent/'results.json').read_text())
headrooms=[]
for fixture in prior['reference']:
 if fixture['nativeCompression'] or not fixture['layout'].startswith('kingshot-'):continue
 wire=base64.urlsafe_b64decode(fixture['payload']+'='*((-len(fixture['payload']))%4));offset=4
 while wire[offset]&128:offset+=1
 offset+=1
 assert wire[:4]==b'IC\x01\x00'
 value=int.from_bytes(b'\x01'+wire[offset:],'big');lo,hi=2,50865
 while lo<hi:
  mid=(lo+hi)//2
  if mid**504>value:hi=mid
  else:lo=mid+1
 headrooms.append({'layout':fixture['layout'],'minimumAlphabetFor504Digits':lo,'maximumRemovalsFrom50864':50864-lo,'remainingRemovalsAfterObservedBlacklist':50864-lo-len(bad)})
analysis={
 'basis':'SequenceMatcher alignment, excluding the final unmatched tail. Counts describe this sample only and are not independent estimates of character error rates.',
 'originalUnits':len(a),'returnedUnits':len(b),'excludedTailStart':tail,'excludedTailUnits':len(a)-tail,
 'byClass':dict(counts),'observedBlacklist':''.join(sorted(bad)),
 'blacklistCodePoints':[{'character':c,'codePoint':f'U+{ord(c):04X}','category':u.category(c),'name':u.name(c,'UNKNOWN'),'occurrencesBeforeTail':len(occurrences[c])} for c in sorted(bad)],
 'charactersBothChangedAndUnchanged':[c for c,items in occurrences.items() if any(x['unchanged'] for x in items) and any(not x['unchanged'] for x in items)],
 'allChangedCharactersSeenOnlyOnce':all(len(occurrences[c])==1 for c in bad),
 'patterns':{'traditionalSimplifiedPairs':[['鈄','钭'],['關','关'],['謫','谪'],['靆','叇'],['隉','陧'],['確','确']],'semanticExamples':[['秤','scale'],['胆','gall'],['墻','wall'],['欬','cough'],['漲','rise']],'removedSymbols':['⤈','⤅','⬔','❒','⏼','⌕']},
 'chineseConversionReference':{'url':'https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt','accessed':'2026-10-30','result':'All six listed traditional/simplified pairs were checked against this dictionary. This is not evidence the game uses OpenCC.'},
 'scenarios':sizes,'alphabetHeadroomForCurrentSpecimens':headrooms,
 'limits':['A single changed occurrence cannot prove a fixed character substitution.','Semantic conversion may depend on neighbouring characters, language detection and message context.','Loss of the tail is analysed separately and must not blacklist every character in that suffix.','Unchanged Hangul and other-script characters are promising observations, not an exhaustive safe alphabet.']
}
(p/'blacklist-analysis.json').write_text(json.dumps(analysis,ensure_ascii=False,indent=2)+'\n')
(p/'blacklist-alphabets-v1.mjs').write_text('export default '+json.dumps({'unicodeDataVersion':u.unidata_version,'profiles':new_profiles},ensure_ascii=False,separators=(',',':'))+';\n')
source=(p/'transport.mjs').read_text();(p/'blacklist-transport-v1.mjs').write_text(source.replace("'./alphabets-v1.mjs'","'./blacklist-alphabets-v1.mjs'"))
