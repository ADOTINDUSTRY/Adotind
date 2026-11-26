'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../public/assets/js/neon-fonts.js');
require('../public/assets/js/neon-geometry.js');
const {prepare,prepareForSpec}=require('../public/assets/js/neon-acute-fit.js');
const geometry=globalThis.NeonGeometry;
const make=widthMm=>geometry.layout({text:'Hello',font:'signature',widthMm});
function cadLines(dxf){
  const a=dxf.trim().split(/\r?\n/),lines=[];let current=null,kind='';
  for(let i=0;i<a.length;i+=2){const code=+a[i],v=a[i+1];if(code===0){kind=v;if(v==='POLYLINE'){current=[];lines.push(current);}else if(v!=='VERTEX')current=null;}if(current&&kind==='VERTEX'&&code===10)current.push([+v]);if(current&&kind==='VERTEX'&&code===20)current.at(-1).push(+v);}
  return lines;
}
const len=p=>p.slice(1).reduce((v,x,i)=>v+Math.hypot(x[0]-p[i][0],x[1]-p[i][1]),0);
function dist(p,a,b){let x=b[0]-a[0],y=b[1]-a[1],d=x*x+y*y,t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/d));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);}

test('600 mm H repair is reflected in exported DXF with 25 mm cut positions and whole-path clearance',()=>{
  const art=make(600),before=art.runs[0].map(p=>[...p]);let calls=0;
  const result=prepare(art,full=>{calls++;return full.runs.length===art.runs.length+1;});
  assert.equal(result.applied,true,result.reason);assert.ok(calls>0);
  assert.deepEqual(art.runs[0],before);
  assert.deepEqual(result.artwork.runs[1].at(-1),before.at(-1));
  assert.match(result.artwork.paths[0].d,/^M.*L/);
  assert.ok(geometry.svg(result.artwork).includes(result.artwork.paths[0].d));
  const cad=cadLines(geometry.dxf(result.artwork));
  assert.ok(Math.abs(len(cad[0])-50)<.001);assert.ok(Math.abs(len(cad[1])-25)<.001);
  const preview=[...result.artwork.paths[0].d.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m=>[+m[1],+m[2]]);
  assert.equal(preview.length,cad[0].length);
  for(let i=0;i<preview.length;i++) {
    assert.ok(Math.abs(preview[i][0]-cad[0][i][0])<.00011);
    assert.ok(Math.abs(preview[i][1]-(art.heightMm-cad[0][i][1]))<.00011);
  }
  const gap=Math.min(...cad[0].map(p=>dist(p,cad[1][0],cad[1].at(-1))))-6;
  assert.ok(gap>=10 && gap<10.001,`clear gap ${gap}`);
});
test('alternate size is independently calculated, and unsupported size leaves artwork untouched',()=>{
  const large=prepare(make(800),()=>true);assert.equal(large.applied,true,large.reason);
  const cad=cadLines(geometry.dxf(large.artwork));
  for(const p of cad.slice(0,2))assert.ok(Math.abs(len(p)/25-Math.round(len(p)/25))<.00004);
  const small=make(200),before=small.paths.map(p=>p.d),result=prepare(small,()=>true);
  assert.equal(result.applied,false);assert.strictEqual(result.artwork,small);assert.deepEqual(small.paths.map(p=>p.d),before);
});
test('mandatory validator can reject a complete candidate, with no replacement of original artwork',()=>{
  const art=make(600);assert.throws(()=>prepare(art,null),/validator/);
  let calls=0;const result=prepare(art,()=>{calls++;return false;},{maxChecks:2000000});
  assert.equal(result.applied,false);assert.strictEqual(result.artwork,art);assert.ok(calls>0);
});
test('bounded search never returns an unchecked result',()=>{
  const art=make(600),result=prepare(art,()=>true,{maxChecks:100});
  assert.equal(result.applied,false);assert.equal(result.reason,'search_limit');assert.strictEqual(result.artwork,art);
});
test('existing neighboring strokes prevent an unsafe clearance repair',()=>{
  const original=make(600), art={...original,paths:[...original.paths,{line:0,d:'M100 8.84L200 8.84'}]};
  Object.defineProperty(art,'runs',{value:[...original.runs,[[100,8.84],[200,8.84]]]});
  const result=prepare(art,()=>true,{maxChecks:2000000});
  assert.equal(result.applied,false);assert.strictEqual(result.artwork,art);
});
test('repeated Hello is processed within budget or safely left unchanged',()=>{
  const art=geometry.layout({text:'Hello Hello\nHello',font:'signature',widthMm:1000});
  assert.ok(art.runs.reduce((n,r)=>n+r.length,0)>1200);
  const result=prepare(art,()=>true,{maxChecks:1000000});
  if(!result.applied)assert.strictEqual(result.artwork,art);
  else assert.equal(result.artwork.runs.length,art.runs.length+1);
});
test('shared browser/server wrapper recomputes accounting and preserves the full manufacturing screen',()=>{
  const art=make(600),engine={...geometry,countBends:()=>17};
  const result=prepareForSpec(art,{backing:'none'},engine);
  assert.equal(result.applied,true,result.reason);
  assert.equal(result.artwork.bendCount,17);
  assert.deepEqual(result.artwork.manufacturing,geometry.inspectManufacturing(result.artwork.runs));
  assert.deepEqual(result.artwork.acuteRepair.ledLengthsMm,[50,25]);
  assert.strictEqual(art.acuteRepair,undefined);
});
test('wrapper refuses unavailable validation or an invalid finished board',()=>{
  const art=make(600),missing=prepareForSpec(art,{backing:'none'},{});
  assert.equal(missing.applied,false);assert.strictEqual(missing.artwork,art);
  const engine={...geometry,countBends:()=>0,finishedSize:()=>({withinLimit:false})};
  const result=prepareForSpec(art,{backing:'none'},engine,{maxChecks:2000000});
  assert.equal(result.applied,false);assert.strictEqual(result.artwork,art);
});
