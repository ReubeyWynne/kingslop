/* One depth-tested world for all fourteen full-body pets. The same pass also picks the
   frontmost animal on touch or click. Art and controls are separate from the planner. */
(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const slots = [[-3.45,3.3],[.45,3.65],[3.45,2.65],[-3.9,.55],[-1.65,1.03],[1.25,.1],[4.2,.05],[-3.1,-2.2],[-.35,-1.75],[2.6,-2.5],[-3.7,-4.9],[-.95,-4.6],[1.95,-5.15],[4.35,-4.4]];
  const sizes = [1,.89,1.12,1.14,.94,1.13,1.2,1.19,1.26,.98,1.24,1.16,1.35,1.26];
  const turns = [-.35,.42,-.96,.85,-.57,.88,-.75,.72,-.89,.56,.53,-.62,.87,-.65];
  const specs = [
    ['ambient','Ambient light',.5,0,1.5], ['key','Key light',1.12,0,2], ['rim','Rim light',.55,0,1],
    ['saturation','Scene saturation',2.31,0,2.5], ['exposure','Scene brightness',1.28,.2,2.5], ['gamma','Scene gamma',1.01,.3,2],
    ['columns','Glyph columns',210,45,280,1], ['rows','Glyph rows',242,16,280,1],
    ['ramp','Glyph ramp',.72,.15,1.5],
    ['edge','Edge strength',.75,0,1], ['opacity','Glyph opacity',1,0,1],
  ];
  const defaults = Object.fromEntries(specs.map(([key,,value]) => [key,value]));
  defaults.sky = '#051445';
  const look = { ...defaults };
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

  function lab(panel, enabled, redraw) {
    if (new URLSearchParams(location.search).get('shader') !== '1') return;
    const key = 'ks.pet-habitat-shader.v1';
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      for (const [name,,,min,max] of specs) if (Number.isFinite(saved?.[name])) look[name] = clamp(saved[name], min, max);
      if (/^#[a-f\d]{6}$/i.test(saved?.sky)) look.sky = saved.sky;
    } catch { /* optional browser storage */ }
    const add = (parent, tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; parent.append(n); return n; };
    const box = add(panel,'section'); box.className = 'pet-shader-lab'; box.lang = 'en';
    box.setAttribute('aria-label','Shader controls');
    add(box,'h2','Shader controls');
    const message = add(box,'p', enabled ? '' : panel.querySelector('[data-habitat-status]').textContent); message.setAttribute('role','status');
    const fields = add(box,'div'), inputs = []; fields.className = 'pet-shader-fields';
    const actions = add(box,'div'); actions.className = 'pet-shader-actions';
    const reset = add(actions,'button','Reset defaults'), copy = add(actions,'button','Copy JSON');
    const json = add(box,'textarea'); json.readOnly = true; json.rows = 3; json.setAttribute('aria-label','Shader settings JSON');
    const remember = () => { try { localStorage.setItem(key,json.value); } catch { /* optional browser storage */ } };
    const sync = () => { for (const [name,input,value] of inputs) { input.value = look[name]; if (value) value.value = look[name]; } json.value = JSON.stringify(look,null,2); redraw(); };
    for (const [name,title,,min,max,step=.01] of [...specs,['sky','Haze color']]) {
      const label = add(fields,'label'); add(label,'span',title);
      const input = add(label,'input'); input.name = name; input.type = name === 'sky' ? 'color' : 'range'; input.disabled = !enabled;
      if (name !== 'sky') { input.min = min; input.max = max; input.step = step; }
      inputs.push([name,input,name === 'sky' ? null : add(label,'output')]);
      input.oninput = () => { look[name] = name === 'sky' ? input.value : input.valueAsNumber; sync(); };
      input.onchange = remember;
    }
    reset.onclick = () => { Object.assign(look,defaults); sync(); remember(); };
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(json.value); message.textContent = 'Settings copied.'; }
      catch { json.focus(); json.select(); message.textContent = 'Settings selected.'; }
    };
    panel.dataset.shaderLab = ''; sync();
  }

  const vs = `#version 300 es
  in vec3 aPosition, aColor;
  in float aHead;
  uniform mat4 uVP;
  uniform vec3 uOffset, uAnchor;
  uniform vec2 uHeading, uPose;
  uniform float uScale;
  uniform vec3 uGait;
  out vec3 vWorld, vColor;
  void main(){
    vec3 p=aPosition-uAnchor; float pitch=aHead*uPose.x, yaw=aHead*uPose.y;
    float c=cos(pitch), s=sin(pitch); p.yz=mat2(c,s,-s,c)*p.yz;
    c=cos(yaw); s=sin(yaw); p.xz=mat2(c,-s,s,c)*p.xz;
    p+=uAnchor;
    float foot=1.-smoothstep(0.,.45*max(.05,uAnchor.y-uGait.x),aPosition.y-uGait.x);
    float leg=sign(aPosition.x*aPosition.z)*uGait.y;
    p.y+=foot*max(0.,leg)*.045;
    p.z+=foot*leg*.085;
    p.y+=(aPosition.y-uGait.x)*uGait.z;
    p.xz=mat2(uHeading.x,-uHeading.y,uHeading.y,uHeading.x)*p.xz;
    vWorld=p*uScale+uOffset; vColor=aColor;
    gl_Position=uVP*vec4(vWorld,1.);
  }`;
  const fs = `#version 300 es
  precision highp float;
  in vec3 vWorld, vColor;
  uniform vec3 uLight, uGrade, uSky;
  uniform float uPick, uTime;
  uniform bool uAnimal;
  out vec4 frag;
  void main(){
    if(uPick>=0.) {frag=vec4(uPick/255.,0.,0.,1.);return;}
    vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
    if(!gl_FrontFacing)n=-n;
    float key=max(0.,dot(n,normalize(vec3(-.5,1.,.55))));
    float rim=max(0.,dot(n,normalize(vec3(.6,.45,-1.))));
    vec3 color=vColor*(uLight.x+key*uLight.y*vec3(1.,.93,.81)+rim*uLight.z*vec3(.62,.82,1.));
    if(!uAnimal&&vColor.b-vColor.r>.22&&vWorld.y<.01)
      color+=vec3(.04,.08,.09)*pow(.5+.5*sin(vWorld.z*8.8+sin(vWorld.x*25.)-uTime*3.4),6.);
    float luma=dot(color,vec3(.299,.587,.114));
    color=pow(clamp(mix(vec3(luma),color,uGrade.x)*uGrade.y,0.,1.),vec3(uGrade.z));
    frag=vec4(mix(color,uSky,smoothstep(4.,24.,-vWorld.z)*.65),uAnimal?1.:.5);
  }`;
  // The old pen's brightness ramp and line glyphs, now sampled from one depth-tested world.
  const glyphs = " .:-=+*#%@|/_\\";
  const screenVS = `#version 300 es
  void main(){gl_Position=vec4(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.,0.,1.);}`;
  const cellsFS = `#version 300 es
  precision highp float;
  uniform sampler2D uScene;
  uniform vec2 uGlyphStyle;
  out vec4 cell;
  void main(){
    ivec2 base=ivec2(gl_FragCoord.xy)*3;
    vec3 scenery=vec3(0.), animals=vec3(0.);
    vec2 animalEdge=vec2(0.), terrainEdge=vec2(0.);
    float surroundings=0., bodies=0.;
    vec2 gradient=vec2(0.);
    for(int y=0;y<3;y++)for(int x=0;x<3;x++){
      vec4 s=texelFetch(uScene,base+ivec2(x,y),0);
      vec2 sampleOffset=vec2(x-1,y-1);
      float signal=dot(s.rgb,vec3(.299,.587,.114))+.28*float(s.a>.75)+.2*float(s.a>0.);
      gradient+=signal*sampleOffset*(2.-abs(sampleOffset.yx));
      if(s.a>.75){animals+=s.rgb;bodies++;animalEdge+=vec2(x-1,y-1);}
      else if(s.a>0.){scenery+=s.rgb;surroundings++;terrainEdge+=vec2(x-1,y-1);}
    }
    if(bodies+surroundings==0.){cell=vec4(0.);return;}
    bool animal=bodies>=2.||surroundings==0.;
    vec3 color=animal?animals/max(1.,bodies):scenery/max(1.,surroundings);
    float luma=dot(color,vec3(.5,.35,.15));
    float tone=clamp(luma/uGlyphStyle.x,0.,.899);
    int glyph=clamp(int(tone*10.),1,8);
    // Luma supplies fill; a Sobel gradient from luma and coverage selects line glyphs.
    vec2 boundary=animal?animalEdge:terrainEdge;
    vec2 direction=gradient*.25+boundary*.15;
    if(length(direction)*uGlyphStyle.y>.085){
      vec2 d=abs(direction);
      glyph=d.x>2.414*d.y?10:d.y>2.414*d.x?12:direction.x*direction.y>0.?13:11;
    }
    cell=vec4(clamp(color*(animal?1.65:1.25),0.,1.),float(glyph)/255.);
  }`;
  const screenFS = `#version 300 es
  precision highp float;
  uniform sampler2D uCells;
  uniform highp sampler2DArray uAtlas;
  uniform vec2 uSize;
  uniform float uOpacity;
  out vec4 frag;
  void main(){
    vec2 cellStep=vec2(textureSize(uCells,0))/uSize;
    vec2 pos=gl_FragCoord.xy*cellStep;
    vec4 cell=texelFetch(uCells,ivec2(pos),0);
    float glyph=round(cell.a*255.);
    if(glyph==0.){frag=vec4(0.);return;}
    vec2 local=fract(pos);
    float mask=textureGrad(uAtlas,vec3(local.x,1.-local.y,glyph),vec2(cellStep.x,0.),vec2(0.,cellStep.y)).a*uOpacity;
    frag=vec4(cell.rgb*mask,mask);
  }`;
  function program(gl, vertex, fragment) {
    const p=gl.createProgram();
    for (const [type,src] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
      const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    return p;
  }
  function glyphAtlas(gl) {
    const atlas=document.createElement('canvas'), width=24, height=42;
    atlas.width=width;atlas.height=height;
    const ctx=atlas.getContext('2d');
    ctx.font='700 35px monospace';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    // Per-glyph mipmaps prevent neighboring atlas characters from bleeding at dense settings.
    const target=gl.TEXTURE_2D_ARRAY, texture=gl.createTexture();
    gl.bindTexture(target,texture);
    gl.texStorage3D(target,6,gl.RGBA8,width,height,glyphs.length);
    for(let i=0;i<glyphs.length;i++){
      ctx.clearRect(0,0,width,height);ctx.fillText(glyphs[i],width/2,height/2);
      gl.texSubImage3D(target,0,0,0,i,width,height,1,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
    }
    gl.generateMipmap(target);
    gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return texture;
  }
  const normal = (x,y,z) => { const d=Math.hypot(x,y,z);return [x/d,y/d,z/d]; };
  function camera(out, yaw, pitch, distance, aspect, tx, ty, tz) {
    const [zx,zy,zz]=normal(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    const [xx,xy,xz]=normal(zz,0,-zx), yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    const f=1/Math.tan(.64/2), q=-(90+.1)/(90-.1), d=-18/(90-.1);
    const shiftX=-xx*tx-xz*tz, shiftY=-yx*tx-yy*ty-yz*tz, shiftZ=-distance-zx*tx-zy*ty-zz*tz;
    out[0]=xx*f/aspect;out[1]=yx*f;out[2]=zx*q;out[3]=-zx;
    out[4]=xy*f/aspect;out[5]=yy*f;out[6]=zy*q;out[7]=-zy;
    out[8]=xz*f/aspect;out[9]=yz*f;out[10]=zz*q;out[11]=-zz;
    out[12]=shiftX*f/aspect;out[13]=shiftY*f;out[14]=shiftZ*q+d;out[15]=-shiftZ;
  }

  function toyMesh() {
    const data=[];
    const vertex=(lat,lon,color)=>data.push(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat),...color,0);
    for(let y=0;y<8;y++)for(let x=0;x<12;x++){
      const a=(y/8-.5)*Math.PI,b=a+Math.PI/8,c=x*Math.PI/6,d=c+Math.PI/6;
      const color=(x<4||x>=8)?[.94,.31,.24]:[.97,.68,.27];
      vertex(a,c,color);vertex(b,c,color);vertex(b,d,color);
      vertex(a,c,color);vertex(b,d,color);vertex(a,d,color);
    }
    return new Float32Array(data);
  }

  // Ground, stream banks, low-poly spruce, rocks and a clearing, all world geometry.
  function landscape() {
    const data=[];
    const tri=(a,b,c,color)=>{for(const p of [a,b,c])data.push(...p,...color,0);};
    const quad=(a,b,c,d,color)=>{tri(a,b,c,color);tri(a,c,d,color);};
    const river=z=>-5.95+.47*Math.sin(z*.72);
    const grass=(x,z)=>{
      const tint=.94+.055*Math.sin(x*.73+z*.36)*Math.cos(z*.46-x*.24)+.025*Math.sin(z*1.8+x*2.6);
      return [.22*tint,.31*tint,.23*tint];
    };
    for(let z=-25;z<12;z++) for(let x=-23;x<23;x++) {
      const a=grass(x,z),b=grass(x,z+1),c=grass(x+1,z+1),d=grass(x+1,z);
      data.push(x,-.022,z,...a,0,x,-.022,z+1,...b,0,x+1,-.022,z+1,...c,0,
        x,-.022,z,...a,0,x+1,-.022,z+1,...c,0,x+1,-.022,z,...d,0);
    }
    for(let z=-23;z<11;z++) {
      const a=river(z),b=river(z+1);
      quad([a-.86,-.012,z],[b-.86,-.012,z+1],[b+.86,-.012,z+1],[a+.86,-.012,z],[.44,.42,.29]);
      quad([a-.66,0,z],[b-.66,0,z+1],[b+.66,0,z+1],[a+.66,0,z],[.19,.43,.49]);
      if(z%2===0) quad([a-.35,.005,z],[a-.25,.005,z+.37],[a+.12,.005,z+.37],[a+.04,.005,z],[.36,.61,.61]);
    }
    function cone(x,z,base,h,r,color,sides=7){
      for(let i=0;i<sides;i++){
        const a=i/sides*2*Math.PI,b=(i+1)/sides*2*Math.PI;
        tri([x+r*Math.cos(b),base,z+r*Math.sin(b)],[x+r*Math.cos(a),base,z+r*Math.sin(a)],[x,base+h,z],color);
      }
    }
    for(const [x,z,h] of [[-7.6,3,2.3],[6.5,2,2.3],[6.3,-1,2.7],[-7.5,-1,2.5],[-7.5,-4,3],[6.6,-4.7,2.6],[-6,-8,3.1],[-3.5,-8,2.8],[.1,-8.8,3.3],[3,-8.6,2.8],[6.4,-8,3.5],[-8,-8,3.4],[-1.4,-10.6,3.7],[7,-11,4]]) {
      cone(x,z,0,h*.53,h*.11,[.36,.26,.16]);
      for(let i=0;i<3;i++) cone(x,z,h*(.23+i*.17),h*.48,h*(.32-i*.067),[.19+i*.032,.32+i*.043,.22+i*.021]);
    }
    for(const [x,z,r] of [[-5.05,4,.39],[-4.9,1.8,.24],[5.7,3.6,.46],[5.8,-2.6,.35],[-4.95,-3.2,.33],[-5.05,-6.6,.52],[3.8,-7,.39],[1.1,4.4,.24]]) cone(x,z,0,r*.7,r,[.42,.46,.44],5);
    for(let i=0;i<95;i++) {
      const x=Math.sin(i*12.9898)*7.8,z=Math.cos(i*5.716)*7.2-1;
      if(Math.abs(x-river(z))<1 || slots.some(([a,b])=>Math.hypot(x-a,z-b)<.8)) continue;
      const h=.11+(i%4)*.044;
      tri([x,0,z],[x+.11,0,z],[x+.035,h,z-.025],[.39,.49,.26]);
      tri([x,0,z-.1],[x+.07,0,z+.07],[x-.07,h*.8,z],[.33,.43,.24]);
    }
    return new Float32Array(data);
  }

  async function model(id) {
    const get=async(ext,as)=>{const r=await fetch(new URL(`models/${id}.${ext}`,document.baseURI));if(!r.ok) throw Error(`${id}: ${r.status}`);return r[as]();};
    const [cfg,bin]=await Promise.all([get('json','json'),get('bin','arrayBuffer')]);
    const header=new DataView(bin), n=header.getUint32(0,true), count=header.getUint32(4,true), at=8+Math.ceil(n*6/4)*4;
    const pos=new Int16Array(bin,8,n*3), indices=new Uint16Array(bin,at,count);
    const color=cfg.vertexRGB && new Uint8Array(bin,at+count*2,n*3);
    const skin=cfg.vertexSkin && new Uint8Array(bin,at+count*2+(color?color.length:0),n*6);
    const data=new Float32Array(n*7), scale=(cfg.range||1)/32767;
    let floor=Infinity, top=-Infinity, radius=0;
    for(let i=0;i<n;i++) {
      const j=i*3,k=i*7,x=pos[j]*scale,y=pos[j+1]*scale,z=pos[j+2]*scale;
      floor=Math.min(floor,y);top=Math.max(top,y);radius=Math.max(radius,x*x+z*z);
      data[k]=x;data[k+1]=y;data[k+2]=z;
      for(let c=0;c<3;c++) data[k+3+c]=color?color[j+c]/255:cfg.fur[c];
      data[k+6]=skin?1-skin[i*6]/255:clamp((z-cfg.pivots.neck[2]+.12)*2.8,0,1)*clamp((y-cfg.pivots.neck[1]+.37)*3,0,1);
    }
    return {data,indices,floor,height:top-floor,radius:Math.sqrt(radius),anchor:cfg.pivots.neck};
  }

  function launch(panel, canvas, gl, entries, status) {
    const p=program(gl,vs,fs), reduce=program(gl,screenVS,cellsFS), screen=program(gl,screenVS,screenFS);
    const locations=(program,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,'u'+name)]));
    const uniforms=locations(p,['VP','Offset','Anchor','Heading','Pose','Scale','Gait','Light','Grade','Sky','Pick','Animal','Time']);
    const reduction=locations(reduce,['Scene','GlyphStyle']), output=locations(screen,['Cells','Atlas','Size','Opacity']);
    const atlas=glyphAtlas(gl), quad=gl.createVertexArray();
    gl.disable(gl.DITHER);
    const attributes=['aPosition','aColor','aHead'].map(name=>gl.getAttribLocation(p,name));
    function upload(data, indices) {
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      for(let i=0;i<3;i++){gl.enableVertexAttribArray(attributes[i]);gl.vertexAttribPointer(attributes[i],i===2?1:3,gl.FLOAT,false,28,i*12);}
      if(indices){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);}
      return {vao, count:indices?indices.length:data.length/7, indexed:Boolean(indices)};
    }
    const ground=upload(landscape()), toy=upload(toyMesh()), pets=[], pixel=new Uint8Array(4), vp=new Float32Array(16), zero=[0,0,0];
    const pickingBuffer=gl.createFramebuffer(), pickingColor=gl.createRenderbuffer(), pickingDepth=gl.createRenderbuffer();
    function target(withDepth){
      const fbo=gl.createFramebuffer(), color=gl.createTexture(), depth=withDepth?gl.createRenderbuffer():null;
      gl.bindTexture(gl.TEXTURE_2D,color);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      return {fbo,color,depth,width:0,height:0};
    }
    const scene=target(true), cells=target(false);
    function allocate(t,w,h){
      if(t.width===w&&t.height===h)return;
      t.width=w;t.height=h;
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);
      gl.bindTexture(gl.TEXTURE_2D,t.color);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.color,0);
      if(t.depth){
        gl.bindRenderbuffer(gl.RENDERBUFFER,t.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,t.depth);
      }
    }
    const cameraControls=panel.querySelector('.pet-camera');
    let frame=0,last=-Infinity,visible=false,yaw=-.13,pitch=.63,zoom=1,focus=-1,pointer,sky=rgb(look.sky),clear=look.sky;
    let entered=-Infinity, reacted=-Infinity, reactionToken, originX=0, originZ=0;
    const ease=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
    const stride=(now,i,mood)=>motion.matches||mood==='asleep'?0:Math.sin(now/(1500+i*90)+i*2.17)*(.19+i%3*.13);
    const draw=(object,id,x,y,z,heading,scale,pitch=0,yaw=0,step=0,breath=0)=>{
      gl.uniform1f(uniforms.Pick,id);gl.uniform1i(uniforms.Animal,Number(object!==ground&&object!==toy));
      gl.uniform3f(uniforms.Offset,x,y,z);gl.uniform3fv(uniforms.Anchor,object.anchor||zero);
      gl.uniform2f(uniforms.Heading,Math.cos(heading),Math.sin(heading));gl.uniform2f(uniforms.Pose,pitch,yaw);gl.uniform1f(uniforms.Scale,scale);
      gl.uniform3f(uniforms.Gait,object.floor??0,step,breath);
      gl.bindVertexArray(object.vao);
      if(object.indexed)gl.drawElements(gl.TRIANGLES,object.count,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLES,0,object.count);
    };
    function world(now,picking=false){
      if(clear!==look.sky){clear=look.sky;sky=rgb(clear);}
      const aspect=canvas.width/canvas.height, overview=Math.max(16.2,19/aspect);
      const close=focus>=0, blend=close?(motion.matches?1:ease((now-entered)/330)):0;
      if(close){
        const {height,radius}=pets[focus], scale=sizes[focus];
        const bound=Math.hypot(height*.5,radius)*scale;
        const distance=bound*(.8+3.45/Math.min(1,aspect));
        camera(vp,yaw,pitch,(overview+(distance-overview)*blend)/zoom,aspect,originX*blend,.38+(height*scale*.5-.38)*blend,-.8+(originZ+.8)*blend);
      }else camera(vp,yaw,pitch,overview/zoom,aspect,0,.38,-.8);
      gl.useProgram(p);gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uniforms.VP,false,vp);gl.uniform3f(uniforms.Light,look.ambient,look.key,look.rim);
      gl.uniform3f(uniforms.Grade,look.saturation,look.exposure,look.gamma);gl.uniform3f(uniforms.Sky,...sky);
      gl.uniform1f(uniforms.Time,motion.matches?0:now/1000);
      draw(ground,picking?0:-1,0,0,0,0,1);
      const still=motion.matches;
      for(let i=close?focus:0;i<(close?focus+1:pets.length);i++){
        const pet=pets[i], scale=sizes[i], entry=entries[i], [homeX,homeZ]=slots[i];
        const mood=entry.dataset.mood, react=entry.dataset.react, elapsed=clamp((now-reacted)/2200,0,1);
        const idle=still?0:Math.sin(now/(510+i*47)+i*2.2), wander=close?0:stride(now,i,mood);
        const awake=mood==='asleep'?0:1, glance=still?0:Math.sin(now/(1200+i*109)+i*1.1)*awake;
        const playful=close&&react==='play', chase=playful?(still?.22:ease((elapsed-.12)*2.8)*(1-ease((elapsed-.65)*3))):0;
        const heading=turns[i]+(close?.22:glance*.2), forwardX=Math.sin(heading), forwardZ=Math.cos(heading);
        const tilt=react==='feed'?.28+idle*.1:react==='pet'?-.17+idle*.075:react==='full'?-.24:playful?-.12+chase*.22:
          mood==='asleep'?.32+idle*.025:mood==='hungry'?.12+idle*.13:idle*(.06+(i%4)*.025);
        const reach=pet.radius*scale, x=close?originX:homeX+wander, z=close?originZ:homeZ+wander*(i%2?.58:-.44);
        const hop=playful&&!still?Math.max(0,Math.sin(elapsed*4*Math.PI))*.13*(1-elapsed):0;
        const gait=still||!awake?0:Math.sin(now/147+i*1.7)*(.18+Math.abs(wander)*.9+chase*.8);
        draw(pet,picking?i+1:-1,x+forwardX*chase*reach*.4,hop-pet.floor*scale,z+forwardZ*chase*reach*.4,heading,scale,tilt,glance*(close?.23:.36),gait,idle*.018);
        if(playful){
          const roll=(.64+(still?.32:ease(elapsed*2.7)*.63))*reach;
          const ball=Math.max(.12,Math.min(.22,reach*.22));
          draw(toy,picking?0:-1,x+forwardX*roll,ball+hop*.35,z+forwardZ*roll,elapsed*12,ball);
        }
      }
    }
    function paint(now){
      const w=canvas.width,h=canvas.height,cols=Math.round(look.columns),rows=Math.round(look.rows);
      gl.activeTexture(gl.TEXTURE0);
      allocate(scene,cols*3,rows*3);allocate(cells,cols,rows);
      gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fbo);gl.viewport(0,0,scene.width,scene.height);
      world(now);
      gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(quad);
      gl.bindFramebuffer(gl.FRAMEBUFFER,cells.fbo);gl.viewport(0,0,cols,rows);
      gl.useProgram(reduce);gl.bindTexture(gl.TEXTURE_2D,scene.color);
      gl.uniform1i(reduction.Scene,0);gl.uniform2f(reduction.GlyphStyle,look.ramp,look.edge);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
      gl.useProgram(screen);gl.bindTexture(gl.TEXTURE_2D,cells.color);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,atlas);
      gl.uniform1i(output.Cells,0);gl.uniform1i(output.Atlas,1);
      gl.uniform2f(output.Size,w,h);gl.uniform1f(output.Opacity,look.opacity);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function tick(now){
      frame=0;if(!visible||document.hidden)return;
      if(now-last>=1000/12-1 || motion.matches){paint(now);last=now;}
      if(!motion.matches) redraw();
    }
    function redraw(){if(visible&&!frame)frame=requestAnimationFrame(tick);}
    function resize(){
      const dpr=Math.min(1.75,devicePixelRatio||1),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
      if(!w||!h)return;
      if(canvas.width===w&&canvas.height===h)return;
      canvas.width=w;canvas.height=h;
      gl.bindFramebuffer(gl.FRAMEBUFFER,pickingBuffer);
      gl.bindRenderbuffer(gl.RENDERBUFFER,pickingColor);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.RGBA8,w,h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,pickingColor);
      gl.bindRenderbuffer(gl.RENDERBUFFER,pickingDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickingDepth);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      redraw();
    }
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;redraw();}).observe(canvas);
    new MutationObserver(()=>{
      const now=performance.now(), next=pets.length?entries.findIndex(el=>el.dataset.picked==='true'):-1;
      if(focus!==next){
        focus=next;zoom=1;entered=now;reactionToken=null;
        if(next>=0){
          const [x,z]=slots[next], w=stride(last===-Infinity?now:last,next,entries[next].dataset.mood);
          originX=x+w;originZ=z+w*(next%2?.58:-.44);
        }else{yaw=-.13;pitch=.63;}
      }
      const reaction=entries[focus]?.dataset.reaction;
      if(reaction!==reactionToken){reactionToken=reaction;reacted=now;}
      redraw();
    }).observe(panel,{subtree:true,attributes:true,attributeFilter:['data-mood','data-reaction','data-picked']});
    document.addEventListener('visibilitychange',redraw);motion.addEventListener('change',redraw);
    panel.addEventListener('pet:camera',e=>{
      zoom=clamp(zoom+e.detail,.65,1.75);
      redraw();
    });
    canvas.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch,moved:false};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{
      if(pointer?.id!==e.pointerId)return;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
      if(Math.hypot(dx,dy)>7)pointer.moved=true;
      if(pointer.moved){yaw=pointer.yaw-dx*.009;pitch=clamp(pointer.pitch+dy*.004,.39,1.18);redraw();}
    });
    canvas.addEventListener('pointercancel',()=>{pointer=null;});
    canvas.addEventListener('pointerup',e=>{
      const tap=pointer?.id===e.pointerId&&!pointer.moved;pointer=null;
      if(!tap||!pets.length)return;
      const r=canvas.getBoundingClientRect(), x=Math.floor((e.clientX-r.left)*canvas.width/r.width),y=canvas.height-1-Math.floor((e.clientY-r.top)*canvas.height/r.height);
      if(x<0||y<0||x>=canvas.width||y>=canvas.height)return;
      gl.bindFramebuffer(gl.FRAMEBUFFER,pickingBuffer);gl.viewport(0,0,canvas.width,canvas.height);
      world(last===-Infinity?performance.now():last,true);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      const index=pixel[0]-1;
      if(!entries[index])return;
      if(focus===index) entries[index].dispatchEvent(new CustomEvent('pet:care',{detail:'pat'}));
      else if(focus<0) entries[index].dispatchEvent(new CustomEvent('pet:choose',{detail:true}));
    });
    function unavailable(message=status.dataset.failed) {
      visible=false;canvas.hidden=true;cameraControls.hidden=true;status.hidden=false;status.textContent=message;
    }
    resize();
    Promise.all(entries.map(el=>model(el.dataset.pet))).then(models=>{
      for(const {data,indices,...bounds} of models)pets.push({...upload(data,indices),...bounds});
      focus=entries.findIndex(el=>el.dataset.picked==='true');
      if(focus>=0){[originX,originZ]=slots[focus];entered=-Infinity;}
      lab(panel,true,redraw);
      canvas.dataset.ready='';cameraControls.hidden=false;status.hidden=true;redraw();
      canvas.dispatchEvent(new Event('pet:habitat-ready'));
    }).catch(error=>{console.error(error);unavailable('The habitat models did not load. Open this page through the site server.');lab(panel,false,()=>{});});
    canvas.addEventListener('webglcontextlost',()=>{
      unavailable();
      panel.querySelectorAll('.pet-shader-fields input').forEach(input=>{input.disabled=true;});
    });
  }

  function start(){
    const panel=document.getElementById('pet-play');if(!panel)return;
    const canvas=panel.querySelector('canvas'), status=panel.querySelector('[data-habitat-status]');
    const observer=new IntersectionObserver(([entry])=>{
      if(!entry.isIntersecting)return;observer.disconnect();
      if(location.protocol==='file:'){
        canvas.hidden=true;status.textContent='Serve the site over HTTP to load the habitat models.';lab(panel,false,()=>{});return;
      }
      const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false});
      if(!gl){canvas.hidden=true;status.textContent=status.dataset.failed;lab(panel,false,()=>{});return;}
      try { launch(panel,canvas,gl,[...panel.querySelectorAll('[data-pet]')],status); }
      catch (error) { console.error(error);canvas.hidden=true;status.textContent=status.dataset.failed;lab(panel,false,()=>{}); }
    });
    observer.observe(canvas);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
