import * as THREE from './quote-vendor/three-0.160.1.module.min.js';

// A small, articulated model. The existing image remains the fallback if WebGL fails.
const assistant = document.querySelector('[data-quote-assistant]');
const holder = assistant?.querySelector('.quote-assistant-mascot');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
if (holder && !reduced.matches) {
  try { createMascot(holder, assistant); } catch (error) { console.warn('3D assistant unavailable', error); }
}

function createMascot(holder, assistant) {
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(180, 220, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  renderer.domElement.className = 'mascot-3d';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 2.2, -2.2, .1, 30);
  camera.position.set(0,2.1,10); camera.lookAt(0,2.0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x54668a,2.0));
  const key = new THREE.DirectionalLight(0xffffff,2.0); key.position.set(-3,7,7); scene.add(key);
  const fill = new THREE.DirectionalLight(0x92c8ff,1); fill.position.set(4,2,-5); scene.add(fill);
  const blue = new THREE.MeshStandardMaterial({color:0x004ac3,roughness:.33,metalness:.08});
  const deepBlue = new THREE.MeshStandardMaterial({color:0x002e8f,roughness:.32});
  const white = new THREE.MeshStandardMaterial({color:0xf9fafb,roughness:.32});
  const yellow = new THREE.MeshStandardMaterial({color:0xffcf00,roughness:.27});
  const black = new THREE.MeshStandardMaterial({color:0x080d18,roughness:.35});
  const iris = new THREE.MeshStandardMaterial({color:0x0056a4,roughness:.24});
  const mouth = new THREE.MeshStandardMaterial({color:0x240615,roughness:.42});
  const tongue = new THREE.MeshStandardMaterial({color:0xe82440,roughness:.4});
  const figure = new THREE.Group(); scene.add(figure);
  const upper = new THREE.Group(); figure.add(upper);
  const sph = new THREE.SphereGeometry(1,24,16);
  function ball(parent, mat, x,y,z,sx,sy,sz) { const m=new THREE.Mesh(sph,mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m; }
  function cyl(parent, mat, x,y,z,rt,rb,h) { const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,24),mat); m.position.set(x,y,z); parent.add(m); return m; }
  // The body is a real extruded, bevelled shape, with an open gap between its feet.
  const body = new THREE.Shape();
  body.moveTo(-.97,1.17); body.quadraticCurveTo(-1.04,1.17,-1.02,1.36);
  body.lineTo(-.73,3.04); body.quadraticCurveTo(-.71,3.19,-.55,3.19);
  body.lineTo(.55,3.19); body.quadraticCurveTo(.71,3.19,.73,3.04);
  body.lineTo(1.02,1.36); body.quadraticCurveTo(1.04,1.17,.97,1.17);
  body.lineTo(.43,1.17); body.quadraticCurveTo(.32,1.17,.32,1.28);
  body.lineTo(.27,1.56); body.quadraticCurveTo(.25,1.66,.15,1.66);
  body.lineTo(-.15,1.66); body.quadraticCurveTo(-.25,1.66,-.27,1.56);
  body.lineTo(-.32,1.28); body.quadraticCurveTo(-.32,1.17,-.43,1.17); body.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(body,{depth:.48,bevelEnabled:true,bevelThickness:.12,bevelSize:.10,bevelSegments:4,curveSegments:12}),blue);
  mesh.position.z=-.24; upper.add(mesh);
  // Face is built as geometry rather than painted on the body.
  for (const x of [-.32,.32]) {
    ball(upper,white,x,2.63,.38,.235,.31,.13);
    ball(upper,iris,x,2.62,.51,.137,.20,.075);
    ball(upper,black,x,2.63,.57,.085,.142,.045);
    ball(upper,white,x+.035,2.70,.61,.032,.047,.02);
    let brow=ball(upper,black,x,3.00,.38,.23,.065,.065); brow.rotation.z=x<0?.16:-.16;
  }
  ball(upper,mouth,0,2.12,.40,.39,.24,.065);
  ball(upper,white,0,2.22,.47,.28,.065,.025);
  ball(upper,tongue,0,2.03,.47,.16,.06,.025);
  ball(upper,deepBlue,.62,1.60,.38,.23,.23,.065);
  ball(upper,yellow,.62,1.60,.44,.185,.185,.07);
  // Hard hat: dome, brim and two raised crown ribs.
  let dome=ball(upper,white,0,3.30,0,.83,.49,.57);
  let brim=cyl(upper,white,0,3.25,0,.88,.88,.09); brim.scale.z=.70;
  for(const x of [-.28,.28]) { let rib=ball(upper,white,x,3.64,.10,.055,.13,.36); rib.rotation.z=x<0?-.14:.14; }
  const logoCanvas=document.createElement('canvas'); logoCanvas.width=256;logoCanvas.height=180;
  const ctx=logoCanvas.getContext('2d');ctx.fillStyle='#0750be';ctx.font='bold 118px Arial';ctx.textAlign='center';ctx.fillText('A',120,112);ctx.fillStyle='#ffd400';ctx.beginPath();ctx.arc(164,99,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dc2026';ctx.font='bold 21px Arial';ctx.fillText('A DOT INDUSTRY',128,151);
  const logoTex=new THREE.CanvasTexture(logoCanvas);logoTex.colorSpace=THREE.SRGBColorSpace;
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(.55,.38),new THREE.MeshBasicMaterial({map:logoTex,transparent:true,depthWrite:false}));logo.position.set(0,3.54,.50);upper.add(logo);
  function limb(x) {
    const pivot=new THREE.Group(); pivot.position.set(x,2.35,0); upper.add(pivot);
    const sign=Math.sign(x);
    const tube=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.60,5,12),blue);tube.position.set(sign*.12,-.35,0);tube.rotation.z=sign*.3;pivot.add(tube);
    ball(pivot,white,sign*.23,-.72,.02,.20,.24,.15);
    ball(pivot,white,sign*.13,-.70,.13,.095,.14,.10);
    return pivot;
  }
  const arms=[limb(-.92),limb(.92)];
  function leg(x) {
    const pivot=new THREE.Group();pivot.position.set(x,1.29,0);figure.add(pivot);
    cyl(pivot,blue,0,-.35,0,.16,.16,.70);
    cyl(pivot,white,0,-.69,0,.20,.20,.11);
    ball(pivot,deepBlue,0,-.84,.13,.26,.19,.41);
    ball(pivot,white,0,-.90,.19,.26,.095,.41);
    ball(pivot,white,0,-.82,.37,.23,.12,.17);
    return pivot;
  }
  const legs=[leg(-.48),leg(.48)];
  let state=assistant.dataset.mascotState || 'active', started=performance.now(), raf=0, lastTime=0;
  const observer=new MutationObserver(()=>{ const next=assistant.dataset.mascotState || 'active'; if(next!==state){state=next;started=performance.now();start();} });
  observer.observe(assistant,{attributes:true,attributeFilter:['data-mascot-state']});
  const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
  function draw(now) {
    raf=0;
    if(document.hidden || reduced.matches) return;
    if(now-lastTime < 1000/30) { raf=requestAnimationFrame(draw); return; }
    const t=(now-started)/1000;
    const walking=state==='leaving';
    const sit=state==='sitting-down'?ease(t/.7):(['settling','sitting'].includes(state)?1:0);
    figure.rotation.y=state==='turning' ? Math.PI*ease(t/1.4) : walking ? Math.PI : state==='turn-to-sit' ? Math.PI*(1-ease(t/1.4)) : 0;
    figure.position.y=walking ? .035*Math.abs(Math.sin(t*8)) : -sit*.25;
    upper.rotation.z=walking ? .035*Math.sin(t*8) : 0;
    const stride=walking ? Math.sin(t*8)*.48 : 0;
    legs[0].rotation.x=stride-sit*.9; legs[1].rotation.x=-stride-sit*.9;
    arms[0].rotation.x=-stride*.65; arms[1].rotation.x=stride*.65;
    const wave=-2.15 + .12*Math.sin(now/500);
    arms[0].rotation.z=state==='active' ? wave : state==='turning' ? wave+(-.08-wave)*ease(t/.4) : -.08;
    arms[1].rotation.z=.08;
    renderer.render(scene,camera);
    lastTime=now;
    if(!['sitting','settling'].includes(state)) raf=requestAnimationFrame(draw);
  }
  function start(){if(!raf&&!document.hidden&&!reduced.matches) raf=requestAnimationFrame(draw);}
  document.addEventListener('visibilitychange',start);
  reduced.addEventListener('change',()=>{
    if(reduced.matches){ assistant.removeAttribute('data-mascot-3d'); cancelAnimationFrame(raf); raf=0; }
    else { assistant.setAttribute('data-mascot-3d','ready'); start(); }
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();assistant.removeAttribute('data-mascot-3d');cancelAnimationFrame(raf);raf=0;});
  holder.appendChild(renderer.domElement);
  renderer.render(scene,camera);
  assistant.setAttribute('data-mascot-3d','ready');
  start();
}


