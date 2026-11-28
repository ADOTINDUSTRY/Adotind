'use strict';const assert=require('node:assert/strict');
(async()=>{
 const C=require('../public/assets/js/neon-clipper.js'),THREE=await import('../public/assets/js/quote-vendor/three-0.160.1.module.min.js');
 const {prepareLetter3DAcrylicLayers}=await import('../public/assets/js/letter3d-technical.js'),{buildLetter3DTechnicalModel}=await import('../public/assets/js/letter3d-renderer.js');
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const face=[rect(0,0,100,50)],groove=[rect(1.3,1.3,97.4,47.4)];
 const settings={face_thickness_mm:3,groove_depth_mm:1.2,groove_width_mm:1.2,overhang_mm:1,side_thickness_mm:.6,overhang_reference:'outside'};
 const plan={face,groove,pieces:[{line:0,face,groove}],settings,bounds_mm:{width:100,height:50}};
 const prepared=prepareLetter3DAcrylicLayers(plan,C);assert.equal(prepared.face_thickness_mm,3);assert.equal(prepared.groove_depth_mm,1.2);assert.equal(prepared.groove_width_mm,1.2);assert.ok(prepared.pieces[0].back.length>=2,'Slot removes material from rear');
 const lines=[{text:'O',font:'sans',colour:'#ff0000',side_colour:'#0000ff',x:0,y:0,rotation:0}],model=buildLetter3DTechnicalModel(plan,lines,C,{lightsOn:true});model.updateMatrixWorld(true);
 const ray=(x,y,side)=>{let r=new THREE.Raycaster(new THREE.Vector3(x,y,side==='back'?-10:10),new THREE.Vector3(0,0,side==='back'?1:-1));return r.intersectObject(model,true).filter(h=>h.object.isMesh).map(h=>h.point.z).sort((a,b)=>side==='back'?a-b:b-a)[0]};
 assert.ok(Math.abs(ray(1.3,25,'front')-3)<.001,'Front face is 3 mm from the rear');
 assert.ok(Math.abs(ray(1.3,25,'back')-1.2)<.001,'Groove centre removes 1.2 mm from back');
 assert.ok(Math.abs(ray(1.3-.59,25,'back')-1.2)<.001,'Groove extends to 0.59 mm from centre');
 assert.ok(Math.abs(ray(1.3+.59,25,'back')-1.2)<.001,'Groove extends to other 0.59 mm');
 assert.ok(Math.abs(ray(1.3-.61,25,'back'))<.001,'Outside groove width back is intact');
 assert.ok(Math.abs(ray(1.3+.61,25,'back'))<.001,'Inside groove width back is intact');
 assert.ok(model.children[0].children.some(o=>o.isLineLoop),'Groove centreline is marked');
 const wideFace=[rect(0,0,400,200)],wideGroove=[rect(51,51,298,98)];
 const widePlan={face:wideFace,groove:wideGroove,pieces:[{line:0,face:wideFace,groove:wideGroove}],settings:{...settings,overhang_mm:50.7,groove_width_mm:20},bounds_mm:{width:400,height:200}};
 assert.equal(prepareLetter3DAcrylicLayers(widePlan,C).groove_width_mm,20,'Preview accepts valid ERP groove widths over 10 mm');
 const bad=structuredClone(plan);bad.settings.groove_depth_mm=3;assert.throws(()=>prepareLetter3DAcrylicLayers(bad,C));
 const breakthrough=structuredClone(plan);breakthrough.pieces[0].groove=[rect(.2,.2,99.6,49.6)];assert.throws(()=>prepareLetter3DAcrylicLayers(breakthrough,C),/break through/i);
 // An actual O glyph has a separate outside and counter groove; check both,
 // sampling segment midpoints to avoid assuming rectangle-like geometry.
 const opentype=require('../public/assets/js/quote-vendor/opentype-1.3.4.min.js');
 const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/assets/fonts/letter3d/AlegreyaSans-Regular.ttf'));
 const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const {buildLetter3DManufacturing}=await import('../public/assets/js/letter3d-manufacturing.js');
 const realLines=[{text:'O',font:'sans',colour:'#ffffff',side_colour:null,x:0,y:0,rotation:0}];
 const realPlan=buildLetter3DManufacturing({lines:realLines,width_mm:500,settings,fonts:{sans:font},clipper:C});
 assert.equal(realPlan.groove.length,2,'The real O has both outside and inside groove contours');
 const realModel=buildLetter3DTechnicalModel(realPlan,realLines,C);realModel.updateMatrixWorld(true);
 let checked=0;
 for(const contour of realPlan.groove){
   const stride=Math.max(1,Math.floor(contour.length/25));
   for(let i=0;i<contour.length;i+=stride){
     const a=contour[i],b=contour[(i+1)%contour.length];
     const raycaster=new THREE.Raycaster(new THREE.Vector3((a.x+b.x)/2,(a.y+b.y)/2,-10),new THREE.Vector3(0,0,1));
     const hit=raycaster.intersectObject(realModel,true).find(item=>item.object.isMesh);
     assert.ok(hit && Math.abs(hit.point.z-1.2)<.001,'Each real-font groove segment must expose the 1.2 mm recess floor');checked++;
   }
 }
 assert.ok(checked>=50,'Sample both complete contours at representative points');
 realModel.traverse(o=>{o.geometry?.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose())});
 model.traverse(o=>{o.geometry?.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose())});
 console.log('Technical acrylic mesh measured face thickness, groove depth and width passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
