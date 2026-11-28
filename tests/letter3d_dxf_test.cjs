'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{
 const {buildLetter3dDxf}=await import('../public/assets/js/letter3d-dxf.js');
 const loop=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const fixture={face:[loop(0,0,100,50),loop(30,10,20,20)],groove:[loop(2,2,96,46),loop(28,8,24,24)],bounds_mm:{width:100,height:50},settings:{overhang_reference:'outside',overhang_mm:1,side_thickness_mm:.6,groove_width_mm:1.2,groove_depth_mm:1.2,face_thickness_mm:3,edge_remaining_mm:.8}};
 const result=buildLetter3dDxf(fixture),dxf=result.dxf;
 assert.match(dxf,/\r\n0\r\nEOF\r\n$/,'Complete DXF terminator and CRLF pairs');
 assert.ok(result.instructions.some(s=>s.includes('1.2 mm')&&s.includes('depth')));assert.ok(result.instructions.some(s=>s.includes('mirror')));assert.ok(result.instructions.some(s=>s.includes('Vectors only')));
 const rows=dxf.trimEnd().split(/\r\n/);assert.equal(rows.length%2,0,'Every DXF code must have a value');const pairs=[];for(let i=0;i<rows.length;i+=2)pairs.push([Number(rows[i]),rows[i+1]]);
 const findHeader=(key)=>{let i=pairs.findIndex(p=>p[0]===9&&p[1]===key);return pairs[i+1]};assert.deepEqual(findHeader('$ACADVER'),[1,'AC1015']);assert.deepEqual(findHeader('$INSUNITS'),[70,'4']);
 let section='',entries=[],active=null;for(let i=0;i<pairs.length;i++){const [code,v]=pairs[i];if(code===0&&v==='SECTION'&&pairs[i+1]?.[0]===2){section=pairs[i+1][1];continue}if(code===0&&v==='ENDSEC'){section='';continue}if(section!=='ENTITIES')continue;if(code===0){if(active)entries.push(active);active={type:v,attrs:[]}}else if(active)active.attrs.push([code,v]);}if(active)entries.push(active);
 assert.equal(entries.length,4);for(const e of entries){assert.equal(e.type,'LWPOLYLINE');assert.ok(e.attrs.some(([c,v])=>c===70&&v==='1'),'Closed flag');assert.ok(e.attrs.some(([c,v])=>c===90&&v==='4'),'Correct vertex count');}
 assert.equal(entries.filter(e=>e.attrs.some(([c,v])=>c===8&&v==='FACE_CUT')).length,2,'Outer and inner face contours preserved');assert.equal(entries.filter(e=>e.attrs.some(([c,v])=>c===8&&v==='GROOVE_REFERENCE')).length,2,'Outer and inner groove contours preserved');
 for(const change of [g=>delete g.settings.groove_width_mm,g=>delete g.settings.overhang_reference,g=>g.settings.groove_depth_mm=3,g=>g.settings.groove_width_mm=.2,g=>g.face[0][0].x=NaN,g=>g.bounds_mm.width=101,g=>g.groove=[],g=>g.face[0]=[{x:0,y:0},{x:1,y:1},{x:2,y:2}]]){const clone=structuredClone(fixture);change(clone);assert.throws(()=>buildLetter3dDxf(clone),'Unsafe or ambiguous export must fail');}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'letter3d-dxf-'));const file=path.join(temp,'fixture.dxf');fs.writeFileSync(file,dxf);
 const php=process.platform==='win32'?path.resolve(__dirname,'../../php-test/runtime/php.exe'):'php';
 const code=`require ${JSON.stringify(path.join(__dirname,'../app/lib/quote_dxf_bounds.php').replace(/\\/g,'/'))}; echo json_encode(quote_dxf_bounds_mm($argv[1]));`;
 const proc=spawnSync(php,['-r',code,file],{encoding:'utf8'});assert.equal(proc.status,0,proc.stderr);const b=JSON.parse(proc.stdout);assert.ok(Math.abs(b.width_mm-100)<.001&&Math.abs(b.height_mm-50)<.001,'Existing DXF reader sees exact mm');
 fs.unlinkSync(file);fs.rmdirSync(temp);
 console.log('3D DXF units, closed layers, counters, guards and independent dimensions passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
