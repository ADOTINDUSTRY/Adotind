'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{
 const root=path.join(__dirname,'..'),ot=require('../public/assets/js/quote-vendor/opentype-1.3.4.min.js'),clipper=require('../public/assets/js/neon-clipper.js');
 const bytes=fs.readFileSync(path.join(root,'public/assets/fonts/letter3d/AlegreyaSans-Regular.ttf')),font=ot.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const {buildLetter3DManufacturing}=await import('../public/assets/js/letter3d-manufacturing.js'),{buildLetter3dDxf}=await import('../public/assets/js/letter3d-dxf.js');
 const fontDirectory=path.join(root,'public/assets/fonts/letter3d');
 const catalogue=JSON.parse(fs.readFileSync(path.join(fontDirectory,'catalog.json'),'utf8'));
 assert.equal(Object.keys(catalogue).length,30);
 for(const [key,{name,file}] of Object.entries(catalogue)){
   const bytes=fs.readFileSync(path.join(fontDirectory,file));
   const chosen=ot.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
   for(const text of ['CAFE','O8B','Shop 24']){
     const plan=buildLetter3DManufacturing({
       lines:[{text,font:key,x:0,y:0,rotation:0}],width_mm:650,
       settings:{overhang_reference:'outside',overhang_mm:1,side_thickness_mm:.6,groove_width_mm:1.2,groove_depth_mm:1.2,face_thickness_mm:3},
       fonts:{[key]:chosen},clipper
     });
     if(text==='O8B') for(const layer of [plan.face,plan.groove]){
       assert.equal(layer.length,8,name+' must keep three outer profiles and five openings for O8B');
     }
     assert.ok(buildLetter3dDxf(plan).dxf.includes('EOF'), name+' DXF');
   }
 }
 const geometry=buildLetter3DManufacturing({lines:[{text:'O8B',font:'sans',x:0,y:0,rotation:0}],width_mm:500,settings:{overhang_reference:'outside',overhang_mm:1,side_thickness_mm:.6,groove_width_mm:1.2,groove_depth_mm:1.2,face_thickness_mm:3},fonts:{sans:font},clipper});
 assert.ok(geometry.face.length>=8&&geometry.groove.length>=8,'Real glyph holes must be retained');
 const {dxf,instructions}=buildLetter3dDxf(geometry);assert.ok(instructions.some(x=>x.includes('mirror')));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'letter3d-realfont-')),file=path.join(dir,'realfont.dxf');const {normalizeDxf}=await import('../public/assets/js/cutting-import.js');fs.writeFileSync(file,normalizeDxf(dxf,'4').dxf);
 try{const php=process.platform==='win32'?path.resolve(__dirname,'../../php-test/runtime/php.exe'):'php';const code=`require ${JSON.stringify(path.join(root,'app/lib/quote_dxf_bounds.php').replace(/\\/g,'/'))}; echo json_encode(quote_dxf_bounds_mm($argv[1]));`;const p=spawnSync(php,['-r',code,file],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);const read=JSON.parse(p.stdout);assert.ok(Math.abs(read.width_mm-500)<.02&&Math.abs(read.height_mm-geometry.bounds_mm.height)<.02,'Independent DXF reader reproduces actual design dimensions');}finally{fs.unlinkSync(file);fs.rmdirSync(dir)}
 console.log('Real-font manufacturing geometry and DXF round trip passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
