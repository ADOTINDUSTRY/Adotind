import * as THREE from './quote-vendor/three-0.160.1.module.min.js';
import {fontPathToShapes} from './letter3d-geometry.js';
import {prepareLetter3DAcrylicLayers} from './letter3d-technical.js?v=outside-groove-1';
import {prepareLetter3DSignLayers} from './letter3d-sign.js?v=outside-groove-1';

const FONT_URLS = Object.freeze({
  sans:'/public/assets/fonts/letter3d/AlegreyaSans-Regular.ttf',
  serif:'/public/assets/fonts/letter3d/LibertinusSerif-Regular.ttf',
  script:'/public/assets/fonts/letter3d/GreatVibes-Regular.ttf'
});
const PARSER_URL='/public/assets/js/quote-vendor/opentype-1.3.4.min.js';
const FONT_SIZE=100, LINE_HEIGHT=120, MAX_GLYPHS=120;
let parserPromise;
const fontPromises=new Map();

function unavailable(code) { const error=new Error('A dimensional preview is unavailable for this design.'); error.code=code; return error; }
function getParser() {
  if (globalThis.opentype?.parse) return Promise.resolve(globalThis.opentype);
  if (!parserPromise) parserPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src=PARSER_URL; script.async=true;
    script.onload=()=>globalThis.opentype?.parse ? resolve(globalThis.opentype) : reject(unavailable('font_parser'));
    script.onerror=()=>reject(unavailable('font_parser')); document.head.appendChild(script);
  }).catch(error=>{parserPromise=null;throw error;});
  return parserPromise;
}
async function getFont(name) {
  if (!Object.hasOwn(FONT_URLS,name)) throw unavailable('font');
  if (!fontPromises.has(name)) {
    const promise=Promise.all([getParser(),fetch(FONT_URLS[name],{credentials:'same-origin'})]).then(async ([parser,response])=>{
      if (!response.ok) throw unavailable('font');
      try { return parser.parse(await response.arrayBuffer()); } catch (_) { throw unavailable('font'); }
    }).catch(error=>{fontPromises.delete(name);throw error;});
    fontPromises.set(name,promise);
  }
  return fontPromises.get(name);
}
/** Load the same outline fonts used by the dimensional preview. */
export async function loadLetter3DOutlineFonts(lines) {
  const checked = validateLines(lines);
  return Object.fromEntries(await Promise.all([...new Set(checked.map(line => line.font))].map(async name => [name, await getFont(name)])));
}
function disposeObject(object) {
  object.traverse(node=>{
    if (node.geometry) node.geometry.dispose();
    if (Array.isArray(node.material)) node.material.forEach(m=>m.dispose());
    else if (node.material) { node.material.map?.dispose(); node.material.dispose(); }
  });
}
function validateLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length>8) throw unavailable('design');
  let glyphs=0;
  return lines.map(line=>{
    if (!line || typeof line.text!=='string' || /[\r\n]/.test(line.text) || !Object.hasOwn(FONT_URLS,line.font)
      || !/^#[0-9a-f]{6}$/i.test(line.colour || '')) throw unavailable('design');
    if (line.side_colour != null && (typeof line.side_colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(line.side_colour))) throw unavailable('design');
    for (const key of ['front_finish','side_finish']) if (line[key] != null && !['matt','gloss'].includes(line[key])) throw unavailable('design');
    glyphs+=Array.from(line.text).length;
    if (glyphs>MAX_GLYPHS) throw unavailable('complexity');
    // Complex shaping is intentionally left to the 2D browser fallback.
    if (/[\p{M}\p{Script=Arabic}\p{Script=Hebrew}]/u.test(line.text)) throw unavailable('shaping');
    const values={};
    for (const [key,limit] of [['x',200],['y',200],['rotation',180]]) {
      const n=Number(line[key]); if (!Number.isFinite(n) || Math.abs(n)>limit) throw unavailable('design'); values[key]=n;
    }
    return {text:line.text,font:line.font,colour:line.colour.toLowerCase(),side_colour:line.side_colour == null ? null : line.side_colour.toLowerCase(),front_finish:line.front_finish ?? null,side_finish:line.side_finish ?? null,...values};
  });
}
function assertGlyphs(font, text) {
  for (const char of text) if (!font.charToGlyphIndex(char)) throw unavailable('glyph');
}
function buildLine(font,line,index,lightsOn) {
  const width=font.getAdvanceWidth(line.text,FONT_SIZE,{kerning:true});
  if (!Number.isFinite(width)) throw unavailable('font');
  const shapes=[];
  font.forEachGlyph(line.text,-width/2,0,FONT_SIZE,{kerning:true},(glyph,x,y,size)=>{
    shapes.push(...fontPathToShapes(THREE,glyph.getPath(x,y,size).commands));
  });
  const group=new THREE.Group();
  if (shapes.length) {
    const depth=12;
    const geometry=new THREE.ExtrudeGeometry(shapes,{depth,bevelEnabled:false,curveSegments:10,steps:1});
    geometry.computeBoundingBox();
    if (geometry.boundingBox) geometry.translate(0,-(geometry.boundingBox.min.y+geometry.boundingBox.max.y)/2,0);
    // ExtrudeGeometry combines the two caps into one material group. Split
    // them so only the front emits light; the white rear cap represents the
    // PVC back visually, without claiming an exact manufacturing thickness.
    const positions=geometry.getAttribute('position');
    geometry.clearGroups();
    let start=0, previous=-1;
    for (let i=0;i<positions.count;i+=3) {
      const z0=positions.getZ(i),z1=positions.getZ(i+1),z2=positions.getZ(i+2);
      const material = z0>depth-.001 && z1>depth-.001 && z2>depth-.001 ? 0 :
        (z0<.001 && z1<.001 && z2<.001 ? 2 : 1);
      if (material!==previous) {
        if (previous>=0) geometry.addGroup(start,i-start,previous);
        start=i;previous=material;
      }
    }
    if (previous>=0) geometry.addGroup(start,positions.count-start,previous);
    const finish = (value, fallback) => value==='matt' ? {shininess:5,specular:0x080808} :
      value==='gloss' ? {shininess:90,specular:0x555555} : {shininess:fallback,specular:0x111111};
    // Visual approximation only: colour, gloss and light output are confirmed
    // by the shop and do not assert that any particular film transmits light.
    const front=new THREE.MeshPhongMaterial({color:line.colour,...finish(line.front_finish,28),emissive:line.colour,emissiveIntensity:lightsOn ? 1.25 : 0});
    const side=new THREE.MeshPhongMaterial({color:line.side_colour === null ? new THREE.Color(line.colour).multiplyScalar(.55) : new THREE.Color(line.side_colour),...finish(line.side_finish,22)});
    const back=new THREE.MeshPhongMaterial({color:0xeeeeee,shininess:8,specular:0x080808});
    group.add(new THREE.Mesh(geometry,[front,side,back]));
  }
  group.position.set(width*line.x/100,-(index*LINE_HEIGHT+LINE_HEIGHT*line.y/100),0);
  group.rotation.z=-line.rotation*Math.PI/180;
  return group;
}

/** Convert canonical mm polylines into filled Shapes with their counter holes. */
function technicalShapes(contours) {
  const commands=[];
  for (const contour of contours) {
    if (!Array.isArray(contour) || contour.length<3) throw unavailable('geometry');
    contour.forEach((p,index) => commands.push({type:index ? 'L' : 'M',x:p.x,y:-p.y}));
    commands.push({type:'Z'});
  }
  const shapes=fontPathToShapes(THREE,commands);
  if (!shapes.length) throw unavailable('geometry');
  return shapes;
}
/** Acrylic is 3 mm (or the ERP value), with a real rear groove removed. */
function technicalPiece(piece, line, settings, lightsOn, showGrooveMarker=true) {
  const full=technicalShapes(piece.face), back=technicalShapes(piece.back);
  const thickness=settings.face_thickness_mm, depth=settings.groove_depth_mm;
  const upper=new THREE.ExtrudeGeometry(full,{depth:thickness-depth,bevelEnabled:false,steps:1});
  upper.translate(0,0,depth);
  const points=upper.getAttribute('position'); upper.clearGroups();
  let start=0,previous=-1;
  for(let i=0;i<points.count;i+=3){
    const a=points.getZ(i),b=points.getZ(i+1),c=points.getZ(i+2);
    const index=a>thickness-.001 && b>thickness-.001 && c>thickness-.001 ? 0 :
      (a<depth+.001 && b<depth+.001 && c<depth+.001 ? 2 : 1);
    if(index!==previous){if(previous>=0)upper.addGroup(start,i-start,previous);start=i;previous=index;}
  }
  if(previous>=0)upper.addGroup(start,points.count-start,previous);
  const finish=(value,fallback)=>value==='matt'?{shininess:5,specular:0x080808}:
    value==='gloss'?{shininess:90,specular:0x555555}:{shininess:fallback,specular:0x111111};
  const front=new THREE.MeshPhongMaterial({color:line.colour,...finish(line.front_finish,28),emissive:line.colour,emissiveIntensity:lightsOn?1.25:0});
  const opal=new THREE.MeshPhongMaterial({color:0xeeeeee,shininess:8,specular:0x080808});
  // Neutral shading on the recessed floor makes the cut visible on the back.
  const floor=new THREE.MeshPhongMaterial({color:0xaab4bc,shininess:8,specular:0x080808});
  const lower=new THREE.ExtrudeGeometry(back,{depth,bevelEnabled:false,steps:1});
  const lowerOpal=new THREE.MeshPhongMaterial({color:0xeeeeee,shininess:8,specular:0x080808});
  const group=new THREE.Group();group.add(new THREE.Mesh(upper,[front,opal,floor]));group.add(new THREE.Mesh(lower,lowerOpal));
  // Cyan is a technical centreline marker, not a physical face colour.
  for(const contour of (showGrooveMarker ? piece.groove || [] : [])){
    const geometry=new THREE.BufferGeometry().setFromPoints(contour.map(p=>new THREE.Vector3(p.x,p.y,depth-.005)));
    group.add(new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:0x00b6ce})));
  }
  return group;
}

/** Build a technical acrylic-only model in millimetres; no aluminium height is inferred. */
export function buildLetter3DTechnicalModel(plan,rawLines,clipper,{lightsOn=true}={}) {
  const lines=validateLines(rawLines),layers=prepareLetter3DAcrylicLayers(plan,clipper),group=new THREE.Group();
  try {
    for(const piece of layers.pieces){
      if(!lines[piece.line]) throw unavailable('design');
      const source=plan.pieces.find(p=>p.line===piece.line);
      if(!source) throw unavailable('design');
      group.add(technicalPiece({...piece,groove:source.groove_center},lines[piece.line],layers,lightsOn));
    }
    return group;
  } catch(error){disposeObject(group);throw error;}
}

/** Soft, approximate face-only glow. It is not a measurement of film transmission. */
function faceGlow(contours, colour, z) {
  if (typeof document === 'undefined' || !Array.isArray(contours) || !contours.length) return null;
  let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
  for(const contour of contours)for(const p of contour){left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);}
  const w=right-left,h=top-bottom;if (!(w>0&&h>0)) return null;
  const scale=Math.min(768/w,384/h),pad=44;
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.ceil(w*scale)+2*pad);canvas.height=Math.max(2,Math.ceil(h*scale)+2*pad);
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.filter='blur(13px)';ctx.fillStyle=colour;ctx.globalAlpha=.8;ctx.beginPath();
  for(const contour of contours){contour.forEach((p,i)=>{const x=pad+(p.x-left)*scale,y=pad+(top-p.y)*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.closePath();}
  ctx.fill('evenodd');
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.55,depthWrite:false,depthTest:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(canvas.width/scale,canvas.height/scale),material);
  mesh.position.set((left+right)/2,(bottom+top)/2,z);mesh.renderOrder=10;mesh.userData.letterGlow=true;return mesh;
}

/** Measured face and wall with a preview-only model of the PVC fitting. */
export function buildLetter3DSignModel(plan,rawLines,clipper,{totalDepthMm,backThicknessMm,backVisible=true,backboard={shape:'none'},lightsOn=true}={}) {
  const lines=validateLines(rawLines), acrylic=prepareLetter3DAcrylicLayers(plan,clipper);
  const assembled=prepareLetter3DSignLayers(plan,clipper,{totalDepthMm,backThicknessMm,backboard});
  const group=new THREE.Group();
  try {
    for (const piece of acrylic.pieces) {
      const line=lines[piece.line], raw=plan.pieces.find(p=>p.line===piece.line), built=assembled.pieces.find(p=>p.line===piece.line);
      if(!line||!raw||!built)throw unavailable('design');
      group.add(technicalPiece({...piece,groove:raw.groove},line,acrylic,lightsOn,false));
      const sideColour=line.side_colour===null?new THREE.Color(line.colour).multiplyScalar(.55):new THREE.Color(line.side_colour);
      const sideMaterial=new THREE.MeshPhongMaterial({color:sideColour,shininess:line.side_finish==='gloss'?90:line.side_finish==='matt'?5:22});
      const wall=new THREE.ExtrudeGeometry(technicalShapes(built.wall),{depth:acrylic.groove_depth_mm-assembled.rear_z_mm,bevelEnabled:false,steps:1});
      wall.translate(0,0,assembled.rear_z_mm);group.add(new THREE.Mesh(wall,sideMaterial));
      const backGeometry=new THREE.ExtrudeGeometry(technicalShapes(built.back),{depth:assembled.back_thickness_mm,bevelEnabled:false,steps:1});
      backGeometry.translate(0,0,assembled.rear_z_mm);
      const pvc=new THREE.Mesh(backGeometry,new THREE.MeshPhongMaterial({color:0xf3f3f0,shininess:8}));pvc.userData.letterBack=true;pvc.visible=!!backVisible;group.add(pvc);
      const glow=faceGlow(raw.face,line.colour,acrylic.face_thickness_mm+.02);if(glow){glow.visible=!!lightsOn;group.add(glow);}
    }
    if(assembled.backboard.shape==='rectangle') {
      const board=assembled.backboard,bounds=plan.bounds_mm;
      if(!bounds || !Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<=0||bounds.height<=0)throw unavailable('geometry');
      const clear=board.colour==='clear',colour=clear?0xcbd8e3:board.colour;
      const material=new THREE.MeshPhongMaterial({color:colour,transparent:clear,opacity:clear?.28:1,shininess:50,depthWrite:!clear});
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(bounds.width+2*board.margin_mm,bounds.height+2*board.margin_mm,3),material);
      mesh.position.set(bounds.width/2,bounds.height/2,assembled.rear_z_mm-1.5);mesh.userData.letterBackboard=true;group.add(mesh);
    }
    return group;
  } catch(error) {disposeObject(group);throw error;}
}

/** Visual-only extrusion; dimensions and geometry require shop review. */
export async function createLetter3DRenderer(container, {onUnavailable} = {}) {
  if (!container || typeof container.appendChild!=='function') throw unavailable('container');
  let webgl;
  try { webgl=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'}); }
  catch (_) { throw unavailable('webgl'); }
  const canvas=webgl.domElement;
  canvas.setAttribute('aria-hidden','true'); canvas.style.width='100%'; canvas.style.height='100%';
  canvas.style.display='block'; canvas.style.pointerEvents='none';
  let disposed=false, lost=false, generation=0, current=null, zoom=1, observer=null, lightsOn=true, backVisible=true;
  // Camera-style preview orbit: drag deltas are CSS pixels. Angles are visual only.
  const initialPitch=.08, initialYaw=-.24, pitchLimit=80*Math.PI/180, radiansPerPixel=.008;
  let orbitPitch=initialPitch, orbitYaw=initialYaw;
  const scene=new THREE.Scene();
  // A modest environment keeps an unlit white opal face distinguishable from
  // an illuminated face while keeping the painted sides visible.
  scene.add(new THREE.AmbientLight(0xffffff,.35));
  const key=new THREE.DirectionalLight(0xffffff,.55); key.position.set(-2,4,8); scene.add(key);
  const fill=new THREE.DirectionalLight(0xbad4ff,.20); fill.position.set(5,-1,4); scene.add(fill);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10000);
  camera.position.set(0,0,1000); camera.lookAt(0,0,0);
  webgl.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  const contextLost=event=>{
    event.preventDefault(); lost=true; generation++;
    if (typeof onUnavailable==='function') onUnavailable('webgl_context_lost');
  };
  canvas.addEventListener('webglcontextlost',contextLost,false);
  container.appendChild(canvas);

  function draw() { if (!disposed && !lost) webgl.render(scene,camera); }
  function reframe() {
    if (disposed || lost) return;
    const w=container.clientWidth, h=container.clientHeight;
    if (!(w>0 && h>0)) return;
    webgl.setSize(w,h,false);
    const box=current ? new THREE.Box3().setFromObject(current) : new THREE.Box3();
    const size=new THREE.Vector3(),center=new THREE.Vector3();
    if (!box.isEmpty()) {box.getSize(size);box.getCenter(center);} else {size.set(100,100,1);}
    const aspect=w/h, frameHeight=Math.max(size.y,size.x/aspect,20)*1.2;
    camera.left=-frameHeight*aspect/2;camera.right=frameHeight*aspect/2;
    camera.top=frameHeight/2;camera.bottom=-frameHeight/2;camera.zoom=zoom;
    // Long rotated lettering can extend far in Z; keep the entire box between near and far planes.
    camera.position.set(center.x,center.y,center.z+Math.max(1000,size.z+100));
    camera.far=Math.max(10000,size.z*3+1000);camera.lookAt(center.x,center.y,center.z);camera.updateProjectionMatrix();
    draw();
  }
  if (typeof ResizeObserver!=='undefined') { observer=new ResizeObserver(reframe);observer.observe(container); }
  return {
    async update(rawLines) {
      if (disposed || lost) throw unavailable('webgl');
      const mine=++generation, lines=validateLines(rawLines);
      let loaded;
      try { loaded=await Promise.all([...new Set(lines.map(line=>line.font))].map(async name=>[name,await getFont(name)])); }
      catch (error) { if (disposed || lost || mine!==generation) return {stale:true}; throw error; }
      if (disposed || lost || mine!==generation) return {stale:true};
      const fonts=new Map(loaded), group=new THREE.Group();
      try {
        for (let i=0;i<lines.length;i++) {assertGlyphs(fonts.get(lines[i].font),lines[i].text);group.add(buildLine(fonts.get(lines[i].font),lines[i],i,lightsOn));}
        group.rotation.set(orbitPitch,orbitYaw,0);
        if (disposed || lost || mine!==generation) {disposeObject(group);return {stale:true};}
        if (current) {scene.remove(current);disposeObject(current);}
        current=group;scene.add(group);reframe();return {rendered:true};
      } catch(error) {disposeObject(group);throw error;}
    },
    /** Assembled 3D preview: face/wall dimensions share the DXF outline. */
    async updateSign(plan,rawLines,clipper,options={}) {
      if(disposed || lost) throw unavailable('webgl');
      const mine=++generation;
      if(typeof options.backVisible==='boolean') backVisible=options.backVisible;
      const group=buildLetter3DSignModel(plan,rawLines,clipper,{...options,backVisible,lightsOn});
      try {
        group.rotation.set(orbitPitch,orbitYaw,0);
        if(disposed || lost || mine!==generation){disposeObject(group);return {stale:true};}
        if(current){scene.remove(current);disposeObject(current);}
        current=group;scene.add(group);reframe();return {rendered:true,mode:'sign'};
      }catch(error){disposeObject(group);throw error;}
    },
    setBackVisible(value) {
      if(disposed || lost || typeof value!=='boolean')return;
      backVisible=value;current?.traverse(node=>{if(node.userData?.letterBack)node.visible=value;});draw();
    },
    /** Technical acrylic view: same canonical mm contours as the DXF. */
    async updateManufacturing(plan,rawLines,clipper) {
      if(disposed || lost) throw unavailable('webgl');
      const mine=++generation,group=buildLetter3DTechnicalModel(plan,rawLines,clipper,{lightsOn});
      try {
        group.rotation.set(orbitPitch,orbitYaw,0);
        if(disposed || lost || mine!==generation){disposeObject(group);return {stale:true};}
        if(current){scene.remove(current);disposeObject(current);}
        current=group;scene.add(group);reframe();return {rendered:true,mode:'technical'};
      } catch(error){disposeObject(group);throw error;}
    },
    resize:reframe,
    // Preview lighting never changes the saved design, geometry or estimate.
    setLights(value) {
      if (disposed || lost || typeof value !== 'boolean') return;
      lightsOn=value;
      current?.traverse(node=>{
        if(node.userData?.letterGlow) node.visible=lightsOn;
        if (node.isMesh && Array.isArray(node.material) && node.material[0]?.isMeshPhongMaterial) {
          node.material[0].emissiveIntensity = lightsOn ? 1.25 : 0;
        }
      });
      draw();
    },
    // Rotate the visual preview by pointer displacement in CSS pixels.
    orbitBy(dx,dy) {
      if (disposed || lost || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      orbitPitch=Math.max(-pitchLimit,Math.min(pitchLimit,orbitPitch+dy*radiansPerPixel));
      orbitYaw=((orbitYaw+dx*radiansPerPixel+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      if (current) current.rotation.set(orbitPitch,orbitYaw,0);
      reframe();
    },
    // Restore only the view angle; Fit remains responsible for preview zoom.
    resetOrbit() {
      if (disposed || lost) return;
      orbitPitch=initialPitch;orbitYaw=initialYaw;
      if (current) current.rotation.set(orbitPitch,orbitYaw,0);
      reframe();
    },
    setZoom(value) { if (Number.isFinite(Number(value))) zoom=Math.min(3,Math.max(.5,Number(value)));reframe(); },
    destroy() {
      if (disposed) return; disposed=true;generation++;observer?.disconnect();
      if (current) {scene.remove(current);disposeObject(current);current=null;}
      canvas.removeEventListener('webglcontextlost',contextLost,false);webgl.dispose();canvas.remove();
    }
  };
}
