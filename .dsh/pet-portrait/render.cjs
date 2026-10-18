// Renders a pet's model offline for shade.py: node render.cjs '{"stl":"bear.stl","w":576,"h":408,"yaw":-0.5,...,"out":"/tmp/x"}'
// writes <out>-lit.png, -normal.png, -depth.png and -pos.png (the model-space position before any posing).
// Needs three (npm i --no-save three@0.169.0) and playwright; nothing here runs on the site.
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const threeDir=path.resolve(path.dirname(require.resolve('three',{paths:[process.cwd(),__dirname]})),'..');
const o=Object.assign({w:640,h:640,yaw:0.5,pitch:0.15,fov:30,dist:2.6,target:[0,0,0],out:'r',modes:['lit','normal','depth','pos'],key:2.6,amb:0.06,rim:0.7,keypos:[-1.4,1.6,1.8]},JSON.parse(process.argv[2]||'{}'));
const page=`<html><body style="margin:0"><canvas id=c width=${o.w} height=${o.h}></canvas>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three';import {STLLoader} from 'three/addons/loaders/STLLoader.js';
const o=${JSON.stringify(o)};
const r=new THREE.WebGLRenderer({canvas:c,preserveDrawingBuffer:true,antialias:false});
const g=new STLLoader().parse(await (await fetch('/model.stl')).arrayBuffer());
// turn the model so its own up is +y and its forward +z (as mesh.cjs does), then fit it to -1..1
{const up=new THREE.Vector3(...(o.up||[0,0,1])).normalize(),f=new THREE.Vector3(...(o.fwd||[0,-1,0]));f.addScaledVector(up,-f.dot(up)).normalize();const x=new THREE.Vector3().crossVectors(up,f);
 g.applyMatrix4(new THREE.Matrix4().makeBasis(x,up,f).transpose());}
g.computeBoundingBox();const b=g.boundingBox,ctr=new THREE.Vector3();b.getCenter(ctr);const s=2/Math.max(...b.getSize(new THREE.Vector3()).toArray());
g.translate(-ctr.x,-ctr.y,-ctr.z);g.scale(s,s,s);
// a variant's own shape (bigger horns, say) is part of its rest pose; the poses bend that
const bend=list=>{for(const d of list){const P=g.attributes.position,v=new THREE.Vector3(),pv=new THREE.Vector3(...d.pivot),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...(d.axis||[0,0,1])).normalize(),d.angle||0);
 for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);const s=d.sel;if(v.y<(s.ymin??-9)||v.y>(s.ymax??9)||v.x<(s.xmin??-9)||v.x>(s.xmax??9)||v.z<(s.zmin??-9))continue;
  let w=1;if(d.soft){const a=v.getComponent(d.softAxis??2);const t=Math.min(1,Math.max(0,(a-d.soft[0])/(d.soft[1]-d.soft[0])));w=t*t*(3-2*t);}
  const qw=new THREE.Quaternion().slerp(q,w);
  v.sub(pv);if(d.scale)v.multiplyScalar(1+(d.scale-1)*w);v.applyQuaternion(qw);v.add(pv);if(d.move)v.add(new THREE.Vector3(...d.move).multiplyScalar(w));P.setXYZ(i,v.x,v.y,v.z);}}};
bend(o.shape||[]);g.setAttribute('rest',g.attributes.position.clone());bend(o.deform||[]);
g.computeVertexNormals();
const scene=new THREE.Scene();const cam=new THREE.PerspectiveCamera(o.fov,o.w/o.h,0.1,20);
const t=new THREE.Vector3(...o.target);cam.position.set(t.x+o.dist*Math.sin(o.yaw)*Math.cos(o.pitch),t.y+o.dist*Math.sin(o.pitch),t.z+o.dist*Math.cos(o.yaw)*Math.cos(o.pitch));cam.lookAt(t);cam.near=Math.max(0.05,o.dist-1.5);cam.far=o.dist+1.5;cam.updateProjectionMatrix();
const mats={
 lit:new THREE.MeshLambertMaterial({color:0x8c8c8c,flatShading:true}),
 normal:new THREE.MeshNormalMaterial({flatShading:true}),
 depth:new THREE.MeshDepthMaterial(),
 pos:new THREE.ShaderMaterial({vertexShader:'attribute vec3 rest;varying vec3 p;void main(){p=rest;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){gl_FragColor=vec4(p*0.5+0.5,1.);}'}),
};
const m=new THREE.Mesh(g,mats.lit);scene.add(m);
const key=new THREE.DirectionalLight(0xffffff,o.key);key.position.set(...o.keypos);scene.add(key);
const rim=new THREE.DirectionalLight(0xffffff,o.rim);rim.position.set(2,0.6,-1.5);scene.add(rim);
const fill=new THREE.DirectionalLight(0xffffff,o.fill||0);fill.position.copy(cam.position).add(new THREE.Vector3(0,-0.8,0));scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff,o.amb));
const out={};
for(const k of o.modes.filter(k=>mats[k])){m.material=mats[k];r.setClearColor(0x000000,0);r.render(scene,cam);out[k]=c.toDataURL('image/png');}
window.done=out;
</script></body></html>`;
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await br.newPage({viewport:{width:o.w,height:o.h}});
p.on('console',m=>console.log('page:',m.text()));p.on('pageerror',e=>console.log('err',e.message));
await p.route('http://x/**',rt=>{const u=new URL(rt.request().url()).pathname;if(u==='/')return rt.fulfill({body:page,contentType:'text/html'});
 const f=u==='/model.stl'?o.stl:path.join(threeDir,u.replace(/^\/three\//,''));rt.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript':'application/octet-stream'});});
await p.goto('http://x/');await p.waitForFunction('window.done',null,{timeout:120000});const d=await p.evaluate('window.done');
for(const [k,v] of Object.entries(d))fs.writeFileSync(`${o.out}-${k}.png`,Buffer.from(v.split(',')[1],'base64'));await br.close();})();
