import math, random, html
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
random.seed(17)
W,H=52,22
FIRE=' .,:;=+*#%@'
TONGUES=[(-7.4,9.5,3.4,2.4),(-4.4,12.5,3.5,0),(-1.4,15,3.5,1.7),(1.7,15.5,3.5,3.1),(4.7,12.5,3.5,4.4),(7.6,10,3.4,5.6)]
def hash2(x,y):
 h=((x*0x27d4eb2d) ^ (y*0x165667b1))&0xffffffff
 h=((h^(h>>15))*0x85ebca6b)&0xffffffff
 h=((h^(h>>13))*0xc2b2ae35)&0xffffffff
 return ((h^(h>>16))&0xffffffff)/4294967296

def noise(x,y):
 i,j=math.floor(x),math.floor(y); u=x-i;v=y-j;u=u*u*(3-2*u);v=v*v*(3-2*v)
 a=hash2(i,j);b=hash2(i+1,j);c=hash2(i,j+1);d=hash2(i+1,j+1)
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v

def fire(t):
 phase=t*math.tau/6
 arr=[[' ']*W for _ in range(H)]
 breath=.85+.3*noise(2*math.cos(phase),7.5+2*math.sin(phase))
 for r in range(19):
  for c in range(W):
   x=c+.5-W/2;v=0
   for sub in (.25,.75):
    h=18.4-(r+sub);low=h/(5.5*breath)
    m=(1-(x/(10.5*math.sqrt(1-low)+.5))**2)*(.85-low*.5) if 0<=low<1 else 0
    top=low*.5 if 0<=low<1 else 0
    for x0,h0,w0,ph in TONGUES:
     lift=h/(h0*(.72+.5*noise(ph*3+1.5*math.cos(phase),ph*5+1.5*math.sin(phase)))*breath)
     if lift>=1:continue
     sway=1.4*max(0,lift)**1.4*math.sin(h*.55-phase*5+ph)+.5*lift*math.sin(phase*8+ph*2)
     q=(x-x0*(1-.45*lift)-sway)/(w0*max(.0001,1-lift)**.6+.5)
     f=(1-q*q)*(1-lift*.6)
     if f>m:m,top=f,lift
    n=noise(x*.45+2*math.cos(phase*3),h*.35+2*math.sin(phase*3))*.6+noise(x*.9+9+2*math.cos(phase*5),h*.7+2*math.sin(phase*5))*.4
    v+=m-.55*n*(.35+top*.65)
   v/=2
   if v>.035:
    ix=max(1,min(len(FIRE)-1,1+int(((v-.03)/.85)*(len(FIRE)-1))))
    arr[r][c]=FIRE[ix]
 return arr

def logs():
 far=[[' ']*W for _ in range(H)]; near=[[' ']*W for _ in range(H)]
 for side in (1,-1):
  for c in range(4,48):
   x=c+.5-W/2;y=16.8+.115*x*side; front=x*side>0
   r0=math.floor(y-1.4);r1=math.floor(y+1.4)
   e=min(c-4,47-c)
   layer=near if front else far
   for r in range(max(0,r0),min(H-1,r1)+1):
    if r==r0 or r==r1:ch='_' if r==r1 else '.'
    elif e<=1:ch='\\' if x>0 else '/'
    else:
     n=hash2(math.floor((x*side+40)/2.6),3 if side>0 else 8)
     ch=('#' if n<.45 else '=') if r==r0+1 else ('=' if n<.5 else '-')
    layer[r][c]=ch
 return far,near

def content(rows):
 return '"'+r'\A '.join(''.join(row).rstrip().replace('\\','\\\\').replace('"',r'\"') for row in rows)+'"'

def animation(selector,name,frames,duration):
 return f'{selector}{{content:{content(frames[0])};animation:{name} {duration}s steps(1,end) infinite}}\n@keyframes {name}{{\n'+''.join(f'{100*i/len(frames):.5f}%{{content:{content(frame)}}}\n' for i,frame in enumerate(frames))+'}\n'

def write(path,text):
 (ROOT/path).write_text(text)

def grid(w,h):
 return [[' ']*w for _ in range(h)]

def put(arr,x,y,text):
 if 0<=y<len(arr):
  for j,ch in enumerate(text):
   if 0<=x+j<len(arr[y]): arr[y][x+j]=ch

def campfire():
 frames=[fire(i/12) for i in range(72)]
 css='''.ascii-campfire{position:relative;display:block;width:52ch;height:22em;max-width:100%;overflow:hidden;font:clamp(9px,.87vw,11px)/1 ui-monospace,Consolas,monospace;font-variant-ligatures:none;direction:ltr;white-space:pre;isolation:isolate}
.ascii-campfire pre{position:absolute;inset:0;margin:0;font:inherit;letter-spacing:0;white-space:pre}
.ascii-campfire .ascii-logs-back{z-index:0;color:#6c5139}
.ascii-campfire .ascii-logs-front{z-index:3;color:#ae8155}
.ascii-campfire .ascii-coal-bed{z-index:2;color:#e08a3c;animation:ascii-coal-pulse 2.2s steps(1,end) infinite alternate}
.ascii-campfire .ascii-main-flame{position:absolute;left:8ch;top:0;z-index:2}
.ascii-main-flame::before{display:block;white-space:pre;color:transparent;background:linear-gradient(to bottom,#c65c29 8%,#e08a3c 48%,#f5c851 88%);background-clip:text;-webkit-background-clip:text}
@keyframes ascii-coal-pulse{from{opacity:.48}to{opacity:1}}
.ascii-campfire .ascii-cell-spark{position:absolute;z-index:4;color:#f5c851;animation-duration:var(--dur);animation-delay:var(--delay);animation-timing-function:steps(1,end);animation-iteration-count:infinite;opacity:0}
'''
 css+=animation('.ascii-main-flame::before','ascii-fire-main',[[row[8:44] for row in frame[:19]] for frame in frames],6)
 far,near=logs()
 coals=grid(W,H)
 rng=random.Random(17)
 for r in range(18,22):
  for c in range(16,36):
   if far[r][c]==' ' and near[r][c]==' ' and hash2(c,r+60)<.45: coals[r][c]=rng.choice(':;+*#')
 def pre(cls,arr):
  return f'<pre class="{cls}" aria-hidden="true">'+html.escape('\n'.join(''.join(row).rstrip() for row in arr))+'</pre>\n'
 markup='<figure class="ascii-campfire" role="img" aria-label="A flickering ASCII campfire with crossed logs and rising sparks">\n'
 markup+=pre('ascii-logs-back',far)+pre('ascii-coal-bed',coals)+'<span class="ascii-main-flame" aria-hidden="true"></span>\n'+pre('ascii-logs-front',near)
 for i in range(12):
  c=rng.randrange(19,34);r=rng.randrange(12,17);dur=3.8+(i%7)*.43
  css+=f'@keyframes ascii-spark-{i}'+'{'
  for j in range(13):
   u=j/12;dc=round(1.5*math.sin(u*5.5+i*1.7)+u*(i%5-2))
   opacity=0 if j==0 or j>=11 else (1 if j<5 else .55)
   css+=f'{100*u:.5f}%{{left:{c+dc}ch;top:{r-round(12*u)}em;opacity:{opacity}}}'
  css+='}\n'
  markup+=f'<span class="ascii-cell-spark" style="--dur:{dur:.2f}s;--delay:-{i*.79:.2f}s;animation-name:ascii-spark-{i}" aria-hidden="true">{html.escape(rng.choice([".","\x27","+","*"]))}</span>\n'
 css+='@media(prefers-reduced-motion:reduce){.ascii-main-flame::before,.ascii-campfire .ascii-cell-spark,.ascii-campfire .ascii-coal-bed{animation:none!important}.ascii-campfire .ascii-cell-spark{opacity:0}}\n'
 write('css/ascii-campfire.css',css)
 write('_includes/ascii/campfire.html',markup+'</figure>\n')

def hammer(w,h,pivot,reach,angle):
 arr=grid(w,h);a=math.radians(angle);ca=math.cos(a);sa=math.sin(a)
 px,py=pivot;cx=px-reach*ca;cy=py+reach*sa
 for r in range(h):
  for c in range(w):
   dx=c*.6-cx;dy=r-cy
   u=dx*ca-dy*sa;v=dx*sa+dy*ca
   if abs(u)<=1.8 and abs(v)<=1.05:
    ch=('#' if v<.2 else '=')
    if abs(v)>.65: ch='_' if abs(angle)<10 else ('/' if angle<0 else '\\')
    elif abs(u)>1.25: ch='|'
    arr[r][c]=ch
 def line(u0,v0,u1,v1,ch):
  count=math.ceil(math.hypot(u1-u0,v1-v0)*6)
  for j in range(count+1):
   u=u0+(u1-u0)*j/count;v=v0+(v1-v0)*j/count
   put(arr,round((cx+u*ca+v*sa)/.6),round(cy-u*sa+v*ca),ch)
 line(1.8,0,reach,0,'=' if abs(angle)<10 else '\\')
 for v in [-1.05,1.05]: line(-1.8,v,1.8,v,'_' if abs(angle)<10 else '\\')
 for u in [-1.8,1.8]: line(u,-1.05,u,1.05,'|' if abs(angle)<10 else '/')
 return arr

def strike_phase(t):
 if t<.32: return -30-8*math.sin(math.pi*t/.32)
 if t<.48: return -30*(1-((t-.32)/.16)**2)
 if t<.56: return -6*math.sin(math.pi*(t-.48)/.08)
 if t<.64: return 0
 if t<.88: return -30*math.sin((t-.64)/.24*math.pi/2)
 return -30

def strike_sparks(w,h,cx,cy,t):
 arr=grid(w,h)
 if not .48<=t<.8: return arr
 u=(t-.48)/.32
 for j,(dx,dy) in enumerate([(-8,-3),(-5,-4),(-3,-2),(4,-3),(7,-4),(10,-2)]):
  if u<.65 or j%2:
   put(arr,round(cx+dx*u),round(cy+dy*u+2*u*u),('*' if u<.25 else '+' if u<.55 else '.'))
 return arr

def forge():
 path=ROOT/'css/ascii-animations.css'
 import re
 css=re.split(r'/\* The full forge|\.ascii-scene\s*\{',path.read_text())[0]
 css+='''.ascii-scene{position:relative;display:block;width:32ch;height:13em;overflow:hidden;color:#e08a3c;font:10px/1 ui-monospace,Consolas,monospace;font-variant-ligatures:none;direction:ltr;white-space:pre;isolation:isolate}
.ascii-scene pre{position:absolute;margin:0;font:inherit;white-space:pre}
.ascii-scene span{position:absolute;white-space:pre;pointer-events:none}
.ascii-scene span::before,.ascii-hammer-loader>span::before{display:block;white-space:pre}
.ascii-anvil{left:6ch;bottom:0;color:#c7bc9d;z-index:2}
.ascii-hammer{left:0;top:0;color:#d3a33e;z-index:1}
.ascii-impact{left:14ch;top:5em;color:#f5c851;z-index:4}
.ascii-forge-sparks{left:0;top:0;color:#e08a3c;z-index:4}
.ascii-hammer-loader{display:none;position:relative;width:17ch;height:9em;margin:.25rem 0;color:#d3a33e;font:9px/1 ui-monospace,Consolas,monospace;font-variant-ligatures:none;direction:ltr;white-space:pre;isolation:isolate}
.ascii-hammer-loader>span{position:absolute;white-space:pre;pointer-events:none}
.ascii-loader-anvil{position:absolute;left:0;bottom:0;margin:0;color:#c7bc9d;font:inherit;white-space:pre;z-index:2}
.ascii-loader-hammer{left:0;top:0;z-index:1}
.ascii-loader-impact{left:0;top:0;color:#f5c851;z-index:3}
.gear-import-dialog[aria-busy="true"] .ascii-hammer-loader,#sim-ocr-status.busy + .ascii-hammer-loader{display:inline-block}
'''
 phases=[i/32 for i in range(32)]
 css+=animation('.ascii-hammer::before','ascii-hammer',[hammer(32,7,(26*.6,4),6,strike_phase(t)) for t in phases],2.4)
 css+=animation('.ascii-impact::before','ascii-impact',[[list(' +*+ ' if .48<=t<.55 else ' .:. ' if .55<=t<.61 else ' ')] for t in phases],2.4)
 css+=animation('.ascii-forge-sparks::before','ascii-forge-sparks',[strike_sparks(32,7,16,5,t) for t in phases],2.4)
 css+=animation('.ascii-loader-hammer::before','ascii-loader-strike',[hammer(17,5,(15*.6,2),5,strike_phase(t)*.65) for t in phases],1.6)
 css+=animation('.ascii-loader-impact::before','ascii-loader-sparks',[strike_sparks(17,5,7,3,t) for t in phases],1.6)
 css+='@media(prefers-reduced-motion:reduce){.ascii-scene span::before,.ascii-hammer-loader span::before{animation:none!important}}\n'
 write('css/ascii-animations.css',css)

MINI = {'charm': ['         .     *             ', '          \\   /              ', '           \\ /               ', '         .-=#=-.             ', '        /  /@\\  \\            ', '       |  <#@#>  |           ', '        \\  \\#/  /            ', "         '.___.'             ", "           '                 "], 'bear': ['         .--.   .--.         ', "        /    `-'    \\        ", '       /             \\       ', '      |  (o)     (o)  |      ', '      |       ^       |      ', '      |     .---.     |      ', "       \\    '---'    /       ", "        '._       _.'        ", "           '-----'           "], 'banner': ['      ||                     ', '      ||\\_________.          ', '      || |  \\ /   |          ', '      || |   X    |          ', "      ||/ '-------'          ", '      ||                     ', '      ||                     ', '     _||_                    ', '    |____|                   '], 'crown': ['     .      .      .         ', '     /\\     /\\     /\\        ', '    /  \\   /  \\   /  \\       ', '   /    \\_/    \\_/    \\      ', '   |  <>   <>   <>    |      ', '   |==================|      ', '    \\________________/       ', "      '------------'         ", '         .   .               '], 'dice': ['                             ', '    .------.      .------.   ', '   / o  o /|     / o  o /|   ', '  +-------+ |   +-------+ |  ', '  |o      |o|   |o    o |o|  ', '  |       | |   |   o   | |  ', '  |     o | /   |o    o | /  ', "  '-------'/    '-------'/   ", '                             ']}

def motifs():
 import re
 path=ROOT/'css/ascii-motifs.css';old=path.read_text()
 css=old.split('.ascii-mini--charm::before')[0]
 css=css.replace('content:".";animation:ascii-mote','content:" ";animation:ascii-mote')
 css=css.replace('height:9em;', 'height:11.25em;').replace('vw,11px)/1 ', 'vw,11px)/1.25 ')
 css=re.sub(r'\.ascii-mini--crown\{[^}]*\}\n', '', css)
 css+='.ascii-mini--crown{height:16.25em}\n'
 MINI['crown']=[row.ljust(29) for row in '''             .
            /\\
           /  \\
     .    /    \\    .
    /\\   /      \\   /\\
   /  \\_/        \\_/  \\
  /                    \\
  |   <>     <>     <> |
  |     .--------.     |
  |=====|########|=====|
  |     '--------'     |
   \\__________________/
     '--------------' '''.splitlines()]
 for kind in ['charm','bear','banner','crown','dice']:
  rows=[list(row) for row in MINI[kind]]
  frames=[]
  for i in range(32):
   arr=[row[:] for row in rows]
   if kind in ['charm','crown']:
    if kind=='charm':
     for r in [0,8]: arr[r]=list(' '*29)
     for r,c in [(4,12),(5,12),(6,12)]: arr[r][c]='#'
    if 8<=i<20:
     col=8+(i-8)
     for r in ([3,4,5,6] if kind=='charm' else [7,9]):
      if arr[r][col] not in ' /\\|<>': arr[r][col]='+' if (i+r)%3 else '*'
   elif kind=='bear':
    if i in [22,23]:
     put(arr,9,3,'(-)');put(arr,17,3,'(-)')
    if i in [24,25]:
     put(arr,9,3,'(.)');put(arr,17,3,'(.)')
    if 7<=i<16: put(arr,12,6,'---')
   elif kind=='banner':
    phase=math.tau*i/32
    for r in range(1,5):
     arr[r]=list(' '*29);put(arr,6,r,'||')
    for c in range(9,20):
     wave=round(.7*math.sin(phase-(c-9)*.48))
     put(arr,c,1+wave,'_' if wave==0 else '~')
     put(arr,c,4+wave,'-' if wave==0 else '~')
    end=round(.7*math.sin(phase-10*.48))
    for r in range(2+end,4+end): put(arr,20,r,'|')
    put(arr,12,2,'\\ /');put(arr,13,3,'X')
   elif kind=='dice':
    if 18<=i<28:
     for r in range(1,8):
      for c in range(29):
       if arr[r][c]=='o': arr[r][c]=' '
     for x in [5,19]:
      face=((i-18)//2+x)%3
      put(arr,x,4,'o' if face!=1 else ' ')
      put(arr,x+4,6,'o')
      if face==2: put(arr,x+2,5,'o')
     if i%2:
      arr=[list(' '*29)]+arr[:8]
   frames.append(arr)
  css+=animation('.ascii-mini--'+kind+'::before','ascii-mini-'+kind,frames,{'charm':6.4,'bear':7.2,'banner':6,'crown':8,'dice':5.6}[kind])
 deck=ROOT/'css/ascii-deck.css'
 deck_css=deck.read_text()
 deck_css=re.sub(r'^\.deck-card\[data-page="vip"\] \.deck-ascii::before[^\n]*\n?', '', deck_css, flags=re.M)
 deck_css=re.sub(r'^@keyframes deck-ascii-vip[^\n]*\n?', '', deck_css, flags=re.M)
 deck_css=deck_css.rstrip()+'\n.deck-card[data-page="vip"] .deck-ascii::before{content:'+content(MINI['crown'])+';animation:ascii-mini-crown 8s steps(1,end) infinite}\n'
 write('css/ascii-deck.css',deck_css)
 css+='''.ascii-march-band{display:block;margin:.6rem 0 1rem;padding:.5rem 0;border-block:1px solid var(--signal-line);overflow:hidden;width:100%;direction:ltr}
.ascii-march-track{display:flex;width:max-content}
.ascii-march{display:block;width:40ch;height:10em;overflow:hidden;color:var(--amber);white-space:pre;flex:none;font:clamp(9px,2.6vw,11px)/1.25 ui-monospace,Consolas,monospace;font-variant-ligatures:none}
.ascii-march::before{display:block;white-space:pre}
@media(max-width:700px){.ascii-march-band{width:100vw;margin-inline:calc(50% - 50vw)}}
'''
 for hunt in [False,True]:
  frames=[]
  for i in range(40):
   arr=grid(40,8)
   for origin in range(0,60,10):
    x=origin-i%10
    stride=(i//2+origin//10+i//10)%4
    head=[' .--. ', ' /__\\', ' <o  ', ' (|\\ '] if hunt else ['  _  ', ' /_\\ ', ' <o  ', '[#|\\ ']
    legs=[[' / \\','/   |'],['  ||','  ||'],[' \\ /','  X '],[' / \\',' |   \\']][stride]
    for r,text in enumerate(head+['  |  ']+legs+['']): put(arr,x,r,text)
   frames.append(arr)
  css+=animation('.ascii-march--hunt::before' if hunt else '.ascii-march::before','ascii-hunt-march' if hunt else 'ascii-march',frames,14)
 css+='@media(prefers-reduced-motion:reduce){.ascii-march::before{animation:none!important}}\n'
 write('css/ascii-motifs.css',css)

if __name__=='__main__':
 campfire()
 forge()
 motifs()


