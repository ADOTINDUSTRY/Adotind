'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {measure}=require('../app/cli/neon-measure.cjs');
const geometry=globalThis.NeonGeometry;
const base={version:2,text:'Hello',font:'signature',align:'center',letterSpacing:0,lineSpacing:1.25,
  color:'#ff488d',cover:'#ffffff',lineColors:[],backing:'none',boardShape:'rectangle',boardGap:30,
  mount:'freestanding',brightness:85,scene:'studio',power:true};

test('freestanding width limit uses the actual finished width, including acrylic',()=>{
  assert.equal(measure({...base,widthMm:1200}).error,undefined);
  assert.match(measure({...base,widthMm:1200.1}).error,/1,200 mm finished width/);
  assert.equal(measure({...base,widthMm:1200.1,mount:'wall'}).error,undefined);
  const acrylic={...base,backing:'clear'};
  let low=100,high=1200;
  for(let i=0;i<35;i++) {
    const widthMm=(low+high)/2,art=geometry.layout({...acrylic,widthMm});
    const board=geometry.backboard(art,acrylic);
    if (geometry.finishedSize(art,board,acrylic).widthMm<=1200) low=widthMm; else high=widthMm;
  }
  const accepted=measure({...acrylic,widthMm:low-0.01});
  assert.equal(accepted.error,undefined);
  assert.ok(accepted.finished.widthMm<=1200);
  assert.match(measure({...acrylic,widthMm:high+0.01}).error,/1,200 mm finished width/);
});

test('separate freestanding base uses adjustable dimensions in preview and DXF',()=>{
  const proof=measure({...base,widthMm:700,backing:'clear'});
  assert.equal(proof.error,undefined);
  const part=proof.standingBase;
  assert.equal(part.thicknessMm,8);
  assert.equal(part.material,'clear acrylic');
  assert.ok(Math.abs(part.widthMm-proof.finished.widthMm*.8)<.00001);
  assert.ok(Math.abs(part.depthMm-proof.finished.heightMm*.35)<.00001);
  assert.ok(part.top>proof.finished.bottom);
  assert.match(proof.svg,/id="BASE_CLEAR_ACRYLIC_8MM"/);
  assert.match(proof.svg,/clear acrylic 8 mm thick/);
  const groups=proof.dxf.trim().split(/\r?\n/);
  const polys=[];let item=null,kind='';
  for(let i=0;i<groups.length;i+=2){
    const code=Number(groups[i]),v=groups[i+1];
    if(code===0){kind=v;if(kind==='POLYLINE'){item={points:[]};polys.push(item);}else if(kind!=='VERTEX')item=null;}
    if(!item)continue;
    if(kind==='POLYLINE'&&code===8)item.layer=v;
    if(kind==='VERTEX'&&code===10)item.points.push([Number(v)]);
    if(kind==='VERTEX'&&code===20)item.points.at(-1).push(Number(v));
  }
  const basePaths=polys.filter(p=>p.layer==='BASE_CLEAR_ACRYLIC_8MM');
  assert.equal(basePaths.length,1);
  assert.equal(basePaths[0].points.length,4);
  for(let i=0;i<4;i++){
    assert.ok(Math.abs(basePaths[0].points[i][0]-part.outline[i][0])<.00011);
    assert.ok(Math.abs(basePaths[0].points[i][1]-(proof.heightMm-part.outline[i][1]))<.00011);
  }
  const custom=measure({...base,widthMm:700,baseWidthMm:500,baseDepthMm:175});
  assert.equal(custom.standingBase.widthMm,500);
  assert.equal(custom.standingBase.depthMm,175);
  assert.match(measure({...base,widthMm:700,baseDepthMm:.1}).error,/at least 1 mm/);
  assert.match(measure({...base,widthMm:700,baseWidthMm:-1}).error,/limits/);
  const wall=measure({...base,widthMm:700,mount:'wall'});
  assert.equal(wall.standingBase,null);
  assert.doesNotMatch(wall.dxf,/BASE_CLEAR_ACRYLIC_8MM/);
});
