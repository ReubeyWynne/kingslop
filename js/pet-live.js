/* Pets drawn live from their model: a small WebGL 2 text shader in the pen.

   A pet listed in PETS gets a canvas in its pen that draws its model as character cells,
   twelve times a second. The model (pets/models/<id>.bin, from .dsh/pet-portrait/mesh.cjs) is
   skinned to a six-bone skeleton (body, neck, head, both ears, nose), so the head can follow
   the pointer, tilt, droop and perk, the ears flick and fold, and the nose twitch. Each frame:
     1. the posed model is rendered small, with its light, fur colour, depth and fur region;
     2. every character cell is reduced to one glyph and one ink: line glyphs where the
        silhouette (or the muzzle's depth) runs through it, otherwise a glyph from how bright
        the fur is, in the nearest of seven inks;
     3. the cells are drawn from a glyph atlas, with the face (eyes, brows, mouth, blush) and
        anything floating above it (z's, hearts, a thought) laid over them.
   The art only ever changes whole glyphs in a fixed grid: nothing is scaled, rotated or slid.

   The pen's own attributes drive it: data-mood, data-react and data-sniff, set by pet-den.
   Without WebGL 2, with reduced motion, or if anything fails, the canvas never appears and
   the pen keeps its baked frames (PETS.md, "Page"). Off screen, it stops drawing. */
(function () {
  'use strict';
  const script = document.currentScript;
  if (!script || !window.WebGL2RenderingContext) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const FPS = 12;                                    // the pen steps like the baked frames, never smoothly
  const COLS = 72, ROWS = 24, ART = 20, SX = 4, SY = 8;   // the model fills the lower 20 rows; z's and hearts rise into the rest
  const GLYPHS = " .:-=+*#%@|/_\\o-^w●ωzZO()><♥~vu,'‾";
  const G = c => GLYPHS.indexOf(c);
  // Overlay inks after the seven fur inks: eye, blush, sky, dim sky, coral, tongue.
  const EYE = 6, BLUSH = 8, SKY = 9, DIM = 10, CORAL = 11, TONGUE = 12;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Per pet: inks, fur regions, the face's anchor points and the skeleton's weights, all in
  // model space (fits -1..1, snout towards +z, up +y), and the camera shade.py framed it with.
  const PETS = {
    'grizzly-bear': {
      inks: ['#6E4636', '#93604A', '#B67F5A', '#D49C6C', '#EDBC86', '#F8DDB0', '#FFF5E2'],
      fur: [0.62, 0.40, 0.27],
      regions: [                                     // later regions paint over earlier ones; 3 is the nose
        [1, 'p.y>=0.44', [0.84, 0.54, 0.36]],
        [2, 'p.z>=0.74 && p.y<=0.12', [1.0, 0.86, 0.64]],
        [3, 'p.z>=0.96 && p.y>=-0.03', [0.10, 0.07, 0.07]]
      ],
      headZ: 0.3,
      eyes: [[-0.14, 0.16, 0.80], [0.14, 0.16, 0.80]], mouth: [0, -0.07, 0.99], top: [0, 0.6, 0.5], cheeks: [[-0.26, 0.0, 0.72], [0.26, 0.0, 0.72]],
      pivots: { neck: [0, 0.12, 0.0], head: [0, 0.22, 0.32], ear: [0.22, 0.47, 0.52], nose: [0, 0.0, 0.92] },
      // body ← neck ← head ← (left ear, right ear, nose): nested masks keep every weight >= 0 and the sum at 1
      weights: ([x, y, z]) => {
        const neck = smooth(-0.15, 0.2, z), head = smooth(0.15, 0.42, z) * neck;
        const ear = s => smooth(0.45, 0.52, y) * smooth(0.12, 0.17, s * x) * smooth(0.2, 0.12, Math.hypot(s * x - 0.24, z - 0.53)) * head;
        const el = ear(-1), er = ear(1), nose = smooth(0.9, 0.97, z) * smooth(-0.06, 0.0, y) * head;
        return [1 - neck, neck - head, head - el - er - nose, el, er, nose];
      },
      camera: { yaw: -0.5, pitch: 0.05, fov: 26, dist: 2.3705, target: [-0.1628, 0.3354, 0.5033] },
      lights: { key: [-0.6, 2.4, 0.4], rim: [2, 0.6, -1.5] }
    }
  };
  // How each mood holds the head: lift (negative raises the chin), how closely it follows you.
  const POSTURE = { content: [-0.4, 1], delighted: [-0.44, 1], restless: [-0.36, 0.7], lonely: [-0.32, 1], hungry: [-0.34, 0.4], asleep: [-0.3, 0], happy: [-0.45, 1] };

  // ── column-major 4x4 matrices ──
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; };
  const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const T = ([x, y, z]) => { const m = I(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const Sc = k => { const m = I(); m[0] = m[5] = m[10] = k; return m; };
  const R = (axis, a) => { const c = Math.cos(a), s = Math.sin(a), m = I();
    if (axis === 'x') { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; } else if (axis === 'y') { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; } else { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; } return m; };
  const about = (p, ...ops) => [T(p), ...ops, T(p.map(v => -v))].reduce(mul);
  const apply = (m, [x, y, z]) => [0, 1, 2].map(i => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function skeleton(cfg, s) {
    const P = cfg.pivots;
    const neck = about(P.neck, R('y', s.turn * 0.4), R('x', s.lift * 0.4));
    const head = mul(neck, about(P.head, R('y', s.turn * 0.6), R('x', s.lift * 0.6), R('z', s.tilt), Sc(1.12)));
    const ear = (side, flick) => mul(head, about([P.ear[0] * side, P.ear[1], P.ear[2]], R('x', s.earBack), R('z', flick * side)));
    return [I(), neck, head, ear(-1, s.earL), ear(1, s.earR), mul(head, about(P.nose, Sc(s.sniff)))];
  }

  // ── shaders ──
  const quadVS = `#version 300 es
const vec2 v[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3)); void main(){gl_Position=vec4(v[gl_VertexID],0,1);}`;
  const sceneVS = `#version 300 es
in vec3 aPos, aW0, aW1; uniform mat4 uView, uProj, uBone[6]; out vec3 vRest; out vec3 vView;
void main(){
  vec4 r=vec4(aPos,1.);
  vec3 p=(aW0.x*(uBone[0]*r) + aW0.y*(uBone[1]*r) + aW0.z*(uBone[2]*r) + aW1.x*(uBone[3]*r) + aW1.y*(uBone[4]*r) + aW1.z*(uBone[5]*r)).xyz;
  vRest=aPos; vec4 v=uView*vec4(p,1.); vView=v.xyz; gl_Position=uProj*v; }`;
  const vec = a => `vec3(${a.map(v => v.toFixed(3)).join(',')})`;
  const sceneFS = cfg => `#version 300 es
precision highp float; in vec3 vRest; in vec3 vView;
uniform vec3 uKey, uFill, uRim; uniform float uNear, uFar;
layout(location=0) out vec4 oCol; layout(location=1) out vec4 oData;
void main(){
  vec3 n=normalize(cross(dFdx(vView), dFdy(vView)));
  float lum=0.25 + 2.2*max(dot(n,uKey),0.) + 0.66*max(dot(n,uFill),0.) + 0.35*max(dot(n,uRim),0.);
  float L=clamp((lum-0.35)/2.0, 0., 1.);
  vec3 p=vRest; vec3 alb=${vec(cfg.fur)}; float reg=0.;
  ${cfg.regions.map(([id, cond, c]) => `if (${cond}) { alb=${vec(c)}; reg=${id}.; }`).join('\n  ')}
  vec3 col=alb*(0.3+0.95*L); float head=p.z>${cfg.headZ.toFixed(2)} ? 1. : 0.; if (head<.5) col*=0.8;
  float d=clamp((-vView.z-uNear)/(uFar-uNear), 0., 1.); float hi=floor(d*255.)/255.;
  oCol=vec4(min(col,1.), 1.); oData=vec4(hi, (d-hi)*255., reg/4., head);
}`;
  const cellsFS = `#version 300 es
precision highp float; uniform sampler2D uCol, uData; uniform vec3 uInk[7]; out vec4 o;
const int SX=${SX}, SY=${SY};
float dep(ivec2 t){ vec4 d=texelFetch(uData,t,0); return d.r + d.g/255.; }
bool cov(ivec2 t){ return texelFetch(uCol,t,0).a>0.5; }
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy); ivec2 b=c*ivec2(SX,SY);
  float hy=0.; int n=0, nose=0, edges=0; vec3 col=vec3(0); int hist[4]=int[4](0,0,0,0);
  for(int j=0;j<SY;j++) for(int i=0;i<SX;i++){
    ivec2 t=b+ivec2(i,j); if(!cov(t)) continue; n++;
    vec4 dt=texelFetch(uData,t,0); col+=texelFetch(uCol,t,0).rgb; if(dt.b>0.7) nose++;
    if(dt.a<0.5) continue;                         // lines only on the head: the body sinks back
    bool l=cov(t-ivec2(1,0)), r=cov(t+ivec2(1,0)), u=cov(t+ivec2(0,1)), dn=cov(t-ivec2(0,1));
    float d=dep(t); float fl=l?dep(t-ivec2(1,0)):1., fr=r?dep(t+ivec2(1,0)):1., fu=u?dep(t+ivec2(0,1)):1., fd=dn?dep(t-ivec2(0,1)):1.;
    bool sil=!(l&&r&&u&&dn); bool step=dt.b>0.4 && abs(fl+fr+fu+fd-4.*d)>0.03;   // creases on the muzzle only: on the brow they read as a frown
    if(sil||step){ edges++; float gx=fr-fl, gy=fu-fd; float a=mod(degrees(atan(gy,gx))+180.,180.);
      int k=(a<22.5||a>=157.5)?0:(a<67.5?3:(a<112.5?2:1)); hist[k]++; if(k==2) hy+=gy; }   // the line runs across the gradient
  }
  if(float(n)<0.2*float(SX*SY)){ o=vec4(0); return; }
  col/=float(n); int ink=0; float best=9.;
  for(int k=0;k<7;k++){ vec3 dd=uInk[k]-col; float e=dot(dd,dd); if(e<best){best=e;ink=k;} }
  int g;
  if(float(nose)>0.3*float(n)){ g=9; ink=0; }
  else if(float(edges)>0.1*float(SX*SY)){ int k=0; for(int m=1;m<4;m++) if(hist[m]>hist[k]) k=m; g=(k==2 && hy>0.) ? 33 : 10+k; ink=min(ink+2,6); }   // a top edge hangs from the cell's top
  else { float t=min(0.999,dot(col,vec3(.5,.35,.15))/.82); g=clamp(int(t*10.),1,8); }   // '@' is kept for the nose
  o=vec4(float(g)/255., float(ink)/255., 1., 1.);
}`;
  const screenFS = `#version 300 es
precision highp float; uniform sampler2D uCells, uAtlas, uOver; uniform vec2 uCell; uniform vec3 uAll[13]; uniform vec4 uMono; uniform float uGlyphs; out vec4 o;
void main(){
  vec2 f=gl_FragCoord.xy; ivec2 c=ivec2(floor(f/uCell)); vec2 local=fract(f/uCell);
  vec4 cell=texelFetch(uCells,c,0); int g=int(cell.r*255.+.5), ink=int(cell.g*255.+.5);
  vec4 ov=texelFetch(uOver,c,0); int om=int(ov.b*255.+.5);
  if(om==2 || (om==1 && cell.b>0.5)){ g=int(ov.r*255.+.5); ink=int(ov.g*255.+.5); }
  if(g==0){ o=vec4(0); return; }
  float a=texture(uAtlas, vec2((float(g)+local.x)/uGlyphs, local.y)).r;
  vec3 col=uMono.a>0.5 ? uMono.rgb : uAll[ink];
  o=vec4(col*a, a);
}`;

  function Pen(pen, cfg, mesh) {
    const card = pen.closest('[data-owned]'), canvas = document.createElement('canvas');
    canvas.className = 'pet-live'; canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const scene = prog(sceneVS, sceneFS(cfg)), cells = prog(quadVS, cellsFS), screen = prog(quadVS, screenFS);
    const locations = new Map(), u = (p, name) => { const key = p === scene ? 's' + name : p === cells ? 'c' + name : 'q' + name;
      if (!locations.has(key)) locations.set(key, gl.getUniformLocation(p, name)); return locations.get(key); };

    // the mesh, unindexed (flat faces), with each corner's bone weights painted from its rest position
    const { pos, tri } = mesh, flat = new Float32Array(tri.length * 3), W = new Float32Array(tri.length * 6);
    tri.forEach((v, k) => { const p = pos.subarray(v * 3, v * 3 + 3); flat.set(p, k * 3); W.set(cfg.weights(p), k * 6); });
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = (data, attrs) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      attrs.forEach(([name, stride, off]) => { const l = gl.getAttribLocation(scene, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, stride, off); }); };
    buffer(flat, [['aPos', 0, 0]]); buffer(W, [['aW0', 24, 0], ['aW1', 24, 12]]);
    const empty = gl.createVertexArray();
    const tex = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)); return t; };
    const W1 = COLS * SX, H1 = ROWS * SY;
    const tCol = tex(W1, H1), tData = tex(W1, H1), tCells = tex(COLS, ROWS), tOver = tex(COLS, ROWS), tAtlas = gl.createTexture();
    const over = new Uint8Array(COLS * ROWS * 4);
    const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W1, H1);
    const fbScene = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tCol, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tData, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const fbCells = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbCells);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tCells, 0);
    const inkRGB = new Float32Array(cfg.inks.flatMap(rgb));
    const allRGB = new Float32Array(cfg.inks.concat(['#2B1B19', '#F49A9A', '#CFEAF6', '#7FA3B3', '#F0907A', '#EA7F86']).flatMap(rgb));

    // the camera shade.py framed the model with, its art pushed into the bottom ART rows
    const cam = cfg.camera;
    const eye = [cam.target[0] + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    const zf = norm(sub(eye, cam.target)), xr = norm(cross([0, 1, 0], zf)), yu = cross(zf, xr);
    const view = new Float32Array([xr[0], yu[0], zf[0], 0, xr[1], yu[1], zf[1], 0, xr[2], yu[2], zf[2], 0, -dot(xr, eye), -dot(yu, eye), -dot(zf, eye), 1]);
    const near = cam.dist - 1.5, far = cam.dist + 1.5, aspect = (COLS * 0.6) / (ART * 1.25), ft = 1 / Math.tan(cam.fov * Math.PI / 360);
    const ky = ART / ROWS, oy = (ROWS - ART) / ROWS;
    const proj = new Float32Array([ft / aspect, 0, 0, 0, 0, ft * ky, 0, 0, 0, oy, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    const toView = d => { const n = norm(d); return [dot(xr, n), dot(yu, n), dot(zf, n)]; };
    const key = norm(toView(cfg.lights.key)), rim = norm(toView(cfg.lights.rim)), fill = norm([0, toView([0, -0.8, 0])[1] * 0.3, 1]);
    const cellOf = p => { const v = [dot(xr, sub(p, eye)), dot(yu, sub(p, eye)), dot(zf, sub(p, eye))];
      return [Math.floor(((v[0] * ft / aspect) / -v[2] + 1) / 2 * COLS), Math.floor(((v[1] * ft * ky) / -v[2] - oy + 1) / 2 * ROWS)]; };

    // the glyph atlas, in the pen's own font, rebuilt when the pen changes size
    let cellPx = [8, 16];
    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1), width = canvas.clientWidth || pen.clientWidth;
      const cw = Math.max(3, Math.round(width * dpr / COLS)), ch = Math.round(cw * 1.25 / 0.6);
      if (canvas.width === cw * COLS && canvas.height === ch * ROWS) return;
      canvas.width = cw * COLS; canvas.height = ch * ROWS; cellPx = [cw, ch];
      const atlas = document.createElement('canvas'); atlas.width = cw * GLYPHS.length; atlas.height = ch;
      const g2 = atlas.getContext('2d'); g2.fillStyle = '#fff'; g2.textBaseline = 'middle'; g2.textAlign = 'center';
      g2.font = `${Math.round(cw / 0.6)}px ${getComputedStyle(pen).fontFamily}`;
      [...GLYPHS].forEach((c, i) => g2.fillText(c, i * cw + cw / 2, ch / 2));
      gl.bindTexture(gl.TEXTURE_2D, tAtlas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    }

    // ── behaviour ──
    const st = { look: [0, 0], aim: [0, 0], lift: -0.4, turn: -0.45, tilt: 0, ear: 0, earL: 0, earBack: 0,
      blinkUntil: 0, nextBlink: 2000, earUntil: 0, nextEar: 5000, sniffUntil: 0, nextSniff: 3500, tiltUntil: 0, nextTilt: 6000,
      sighUntil: 0, nextSigh: 4000, lickUntil: 0, nextLick: 2500, grrUntil: 0, nextGrr: 5000, glanceAt: 0, nextSpark: 0, moodAt: 0, mood: '', react: '', sparks: [] };
    let mono = null, owned = null;
    function point(event) {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
      st.aim = x < -0.5 || x > 1.5 || y < -0.5 || y > 1.5 ? [0, 0] : [Math.max(-1, Math.min(1, (x - 0.55) * 2.2)), Math.max(-1, Math.min(1, (y - 0.5) * 2.2))];
    }

    let last = 0, raf = 0, visible = false;
    function frame(now) {
      raf = 0; if (!visible) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / FPS - 1) return;
      const dt = Math.min(0.2, (now - last) / 1000); last = now;
      const react = pen.dataset.react || '', sniffing = pen.hasAttribute('data-sniff'), base = pen.dataset.mood || 'content';
      if (base !== st.mood || react !== st.react) { st.mood = base; st.react = react; st.moodAt = now; st.nextSpark = 0; }
      const happy = react === 'pet' || react === 'feed' || sniffing, full = react === 'full';
      const mood = happy ? 'happy' : base, asleep = mood === 'asleep', hungry = mood === 'hungry', lonely = mood === 'lonely', low = hungry || lonely;
      const isOwned = card ? card.dataset.owned !== 'false' : true;
      if (isOwned !== owned) { owned = isOwned; const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(pen).color); mono = owned || !m ? null : [m[1] / 255, m[2] / 255, m[3] / 255]; }

      const [lift, follow] = POSTURE[mood] || POSTURE.content, k = 1 - Math.exp(-dt * 4);
      if (mood === 'restless' && now > st.glanceAt) { st.aim = [Math.random() * 2 - 1, Math.random() - 0.5]; st.glanceAt = now + 1200 + Math.random() * 1500; }   // can't settle
      st.look = st.look.map((v, i) => v + (st.aim[i] * follow - v) * k);
      if (low && now > st.nextSigh) { st.sighUntil = now + 1400; st.nextSigh = now + 6000 + Math.random() * 3000; }
      const breath = asleep ? Math.sin(now / 1500) * 0.035 : 0, sigh = low && now < st.sighUntil ? 0.08 : 0;
      st.lift += (lift + st.look[1] * 0.18 + breath + sigh - st.lift) * k;
      st.turn += (-0.45 + st.look[0] * 0.35 + (full ? 0.5 : 0) - st.turn) * k;   // turns its nose up at food when full
      if (mood === 'content' && now > st.nextTilt) { st.tiltUntil = now + 1800; st.nextTilt = now + 6000 + Math.random() * 6000; }
      st.tilt += ((asleep ? 0.14 : happy ? 0.12 : low ? -0.06 : full ? -0.1 : now < st.tiltUntil ? 0.18 : 0) - st.tilt) * k;   // a curious head tilt
      if (now > st.nextBlink) { st.blinkUntil = now + 140; st.nextBlink = now + 2500 + Math.random() * 3500; }
      if (now > st.nextEar && !asleep) { st.earUntil = now + 260; st.nextEar = now + (mood === 'restless' ? 1500 : 4000) + Math.random() * 5000; }
      st.ear = now < st.earUntil ? 0.28 : 0;
      st.earL = happy || mood === 'delighted' ? 0.12 : 0;                                       // ears perk when it's pleased
      st.earBack += ((asleep ? 0.35 : low ? 0.25 : 0) - st.earBack) * k;                          // and fold back when it's low
      if ((sniffing || (now > st.nextSniff && !asleep)) && now > st.sniffUntil) { st.sniffUntil = now + 300; st.nextSniff = now + 5000 + Math.random() * 6000; }
      const sniff = now < st.sniffUntil && Math.floor((st.sniffUntil - now) / 100) % 2 === 0 ? 1.12 : 1;
      const bones = skeleton(cfg, { lift: st.lift, turn: st.turn, tilt: st.tilt, earL: st.earL, earR: Math.max(st.earL, st.ear), earBack: st.earBack, sniff: sniff });
      const boneData = new Float32Array(96); bones.forEach((m, i) => boneData.set(m, i * 16));

      gl.bindVertexArray(vao); gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene); gl.viewport(0, 0, W1, H1);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      gl.useProgram(scene);
      gl.uniformMatrix4fv(u(scene, 'uView'), false, view); gl.uniformMatrix4fv(u(scene, 'uProj'), false, proj); gl.uniformMatrix4fv(u(scene, 'uBone'), false, boneData);
      gl.uniform3fv(u(scene, 'uKey'), key); gl.uniform3fv(u(scene, 'uFill'), fill); gl.uniform3fv(u(scene, 'uRim'), rim);
      gl.uniform1f(u(scene, 'uNear'), near); gl.uniform1f(u(scene, 'uFar'), far);
      gl.drawArrays(gl.TRIANGLES, 0, flat.length / 3); gl.disable(gl.DEPTH_TEST);

      gl.bindVertexArray(empty); gl.bindFramebuffer(gl.FRAMEBUFFER, fbCells); gl.viewport(0, 0, COLS, ROWS); gl.useProgram(cells);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tCol); gl.uniform1i(u(cells, 'uCol'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tData); gl.uniform1i(u(cells, 'uData'), 1);
      gl.uniform3fv(u(cells, 'uInk'), inkRGB); gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ── the face, and whatever floats above it, laid over the shaded cells ──
      over.fill(0);
      const put = (c, r, ch, ink, anywhere) => { if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return; const i = (r * COLS + c) * 4; over[i] = G(ch); over[i + 1] = ink; over[i + 2] = anywhere ? 2 : 1; };
      const text = (c, r, str, inks) => [...str].forEach((ch, i) => ch !== ' ' && put(c + i, r, ch, Array.isArray(inks) ? inks[i] : inks, true));
      const eyes = cfg.eyes.map(p => cellOf(apply(bones[2], p))).sort((a, b) => a[0] - b[0]);
      const mouth = cellOf(apply(bones[5], cfg.mouth)); mouth[1] -= 1;
      const top = cellOf(apply(bones[2], cfg.top)), t = now - st.moodAt;
      const glyph = asleep || full || now < st.blinkUntil ? '-' : happy ? '^' : '●';
      eyes.forEach(([c, r]) => put(c, r, glyph, EYE));
      if (low) { put(eyes[0][0], eyes[0][1] + 1, '/', 7); put(eyes[1][0], eyes[1][1] + 1, '\\', 7); }   // worried brows
      if (happy) cfg.cheeks.forEach(p => { const [c, r] = cellOf(apply(bones[2], p)); put(c, r, '~', BLUSH); });
      const chew = react === 'feed' && Math.floor(t / 150) % 2 === 0;
      put(mouth[0], mouth[1], asleep ? '.' : full ? '~' : chew ? 'o' : happy ? 'ω' : 'w', EYE);
      if (hungry) {                                                   // licks its lips, dreams of fish, tummy rumbles
        if (now > st.nextLick) { st.lickUntil = now + 700; st.nextLick = now + 3500 + Math.random() * 2500; }
        if (now < st.lickUntil) put(mouth[0] + (Math.floor((st.lickUntil - now) / 230) % 2), mouth[1] - 1, 'u', TONGUE, true);
        const b = t % 7000;
        if (b > 600) put(top[0] + 3, top[1] + 1, 'o', 5, true);
        if (b > 1100) put(top[0] + 4, top[1] + 2, 'O', 5, true);
        if (b > 1600 && b < 5200) text(top[0] + 5, top[1] + 3, '( ><> )', [5, 0, CORAL, CORAL, CORAL, 0, 5]);
        if (now > st.nextGrr) { st.grrUntil = now + 1300; st.nextGrr = now + 7000 + Math.random() * 4000; }
        if (now < st.grrUntil) text(6 + (Math.floor(now / 160) % 2), 2, 'grr', CORAL);
      }
      if (now > st.nextSpark && (asleep || react === 'pet')) {
        st.sparks.push({ kind: asleep ? 'z' : 'heart', t: now, dc: Math.round(Math.random() * 6 - 3) });
        st.nextSpark = now + (asleep ? 900 : 500);
      }
      st.sparks = st.sparks.filter(p => {                             // z's and hearts rise a whole cell at a time
        const age = Math.floor((now - p.t) / (p.kind === 'z' ? 420 : 260)), life = p.kind === 'z' ? 6 : 4;
        if (age >= life) return false;
        if (p.kind === 'z') put(top[0] + 3 + Math.floor(age / 2) + (age % 2), top[1] + age, age < 3 ? 'z' : 'Z', age < 4 ? SKY : DIM, true);
        else put(top[0] + p.dc + (age % 2), top[1] + 1 + age, '♥', age < 2 ? BLUSH : CORAL, true);
        return true;
      });
      gl.bindTexture(gl.TEXTURE_2D, tOver); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RGBA, gl.UNSIGNED_BYTE, over);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(screen);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tCells); gl.uniform1i(u(screen, 'uCells'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tAtlas); gl.uniform1i(u(screen, 'uAtlas'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tOver); gl.uniform1i(u(screen, 'uOver'), 2);
      gl.uniform2f(u(screen, 'uCell'), cellPx[0], cellPx[1]); gl.uniform3fv(u(screen, 'uAll'), allRGB); gl.uniform1f(u(screen, 'uGlyphs'), GLYPHS.length);
      gl.uniform4f(u(screen, 'uMono'), ...(mono || [0, 0, 0]), mono ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function wake() { if (visible && !raf) raf = requestAnimationFrame(frame); }

    pen.appendChild(canvas);
    layout();
    pen.dataset.live = '';                           // css/pets.css hides the baked frames under it
    const resize = new ResizeObserver(layout); resize.observe(pen);
    const seen = new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; wake(); });
    seen.observe(pen);
    document.addEventListener('pointermove', point, { passive: true });
    canvas.addEventListener('webglcontextlost', () => {   // back to the baked frames
      visible = false; seen.disconnect(); resize.disconnect(); document.removeEventListener('pointermove', point);
      delete pen.dataset.live; canvas.remove();
    });
    return canvas;
  }

  function load(id) {
    return fetch(new URL(`../pets/models/${id}.bin`, script.src)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => {
      const head = new DataView(buf), nv = head.getUint32(0, true), ni = head.getUint32(4, true), at = 8 + Math.ceil(nv * 6 / 4) * 4;
      const q = new Int16Array(buf, 8, nv * 3), tri = new Uint16Array(buf, at, ni), pos = new Float32Array(nv * 3);
      q.forEach((v, i) => { pos[i] = v / 32767; });
      return { pos: pos, tri: tri };
    });
  }

  function start() {
    document.querySelectorAll('[data-pen][data-pet]').forEach(pen => {
      const cfg = PETS[pen.dataset.pet];
      if (!cfg) return;
      load(pen.dataset.pet).then(mesh => { try { Pen(pen, cfg, mesh); } catch (cause) { delete pen.dataset.live; pen.querySelectorAll('.pet-live').forEach(c => c.remove()); } }, () => {});
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
