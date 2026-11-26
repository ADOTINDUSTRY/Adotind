'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('../public/assets/js/neon-fonts.js');
require('../public/assets/js/neon-geometry.js');
const geometry=globalThis.NeonGeometry;

const wall={backing:'clear',boardShape:'rectangle',mount:'wall',boardGap:30};
function rectangleAtHeight(letteringWidth,finishedHeight) {
  const pad=geometry.acrylicMargin(letteringWidth,wall);
  const artwork={widthMm:letteringWidth,heightMm:finishedHeight-2*pad};
  return {artwork,board:geometry.backboard(artwork,wall)};
}

test('side spacer bands use the finished acrylic height, including 900 and 1300 mm boundaries',()=>{
  for (const [height,extra] of [[899.9,0],[900,2],[900.1,2],[1299.9,2],[1300,2],[1300.1,4],[2000,4]]) {
    for (const [width,topBottom] of [[650,4],[1000,6],[2100,8]]) {
      const {artwork,board}=rectangleAtHeight(width,height);
      assert.ok(Math.abs(geometry.finishedSize(artwork,board,wall).heightMm-height)<.001);
      assert.equal(board.holes.length,topBottom+extra,`${height} mm, ${width} mm`);
      const minX=Math.min(...board.holes.map(p=>p[0])),maxX=Math.max(...board.holes.map(p=>p[0]));
      const inset=15*board.pad/22, top=-board.pad+inset, bottom=artwork.heightMm+board.pad-inset;
      const middle=board.holes.filter(p=>p[1]>top+.001 && p[1]<bottom-.001);
      assert.equal(middle.length,extra);
      for(const x of [minX,maxX]) {
        const side=middle.filter(p=>Math.abs(p[0]-x)<.001).map(p=>p[1]);
        assert.equal(side.length,extra/2);
        for(let i=0;i<side.length;i++) assert.ok(Math.abs(side[i]-(top+(bottom-top)*(i+1)/(side.length+1)))<.001);
      }
    }
  }
});

test('height bands do not add wall spacers to hanging or freestanding signs',()=>{
  const artwork=rectangleAtHeight(650,1500).artwork;
  assert.equal(geometry.backboard(artwork,{...wall,mount:'suspended'}).holes.length,2);
  assert.equal(geometry.backboard(artwork,{...wall,mount:'freestanding'}).holes.length,0);
});

test('cut-around acrylic can place intermediate holes on long straight sides',()=>{
  const spec={...wall,boardShape:'contour'}, width=650;
  const margin=geometry.acrylicMargin(width,spec)+3;
  for (const [height,count] of [[899,4],[900,6],[1300,6],[1301,8]]) {
    const h=height-2*margin;
    const art={widthMm:width,heightMm:h,runs:[[[0,0],[width,0],[width,h],[0,h],[0,0]]],runWords:['0:0']};
    const board=geometry.backboard(art,spec);
    assert.ok(Math.abs(geometry.finishedSize(art,board,spec).heightMm-height)<.001);
    assert.equal(board.requestedSpacers,count);
    assert.equal(board.holes.length,count,`all ${count} targets should be placeable at ${height} mm`);
    const side=board.holes.filter(([x,y])=>y>height*.2-margin && y<height*.8-margin);
    assert.equal(side.length,count-4);
    for (const [x,y] of side) assert.ok(x<0 || x>width,'intermediate hole belongs on a side');
  }
});

function mountHoles(dxf) {
  const lines=dxf.trim().split(/\r?\n/), holes=[];
  let circle=null;
  for(let i=0;i<lines.length;i+=2) {
    const code=Number(lines[i]),value=lines[i+1];
    if(code===0) {
      if(circle?.layer==='MOUNT_HOLES') holes.push(circle);
      circle=value==='CIRCLE'?{}:null;
    } else if(circle) {
      if(code===8) circle.layer=value;
      if(code===10) circle.x=Number(value);
      if(code===20) circle.y=Number(value);
      if(code===40) circle.radius=Number(value);
    }
  }
  if(circle?.layer==='MOUNT_HOLES') holes.push(circle);
  return holes;
}

function estimateWithSpacerCount(count) {
  // Exercise the quote UI's real calculation using a simple €3-per-spacer
  // price list, so the amount changes only when the design adds spacers.
  const rates={base:0,perMetre:0,wall:0,acrylic120:0,acrylic240:0,acrylic300:0,
    delivery120:0,delivery240:0,delivery300:0,perStroke:0,perBend:0,perSpacer:300};
  const nodes={price:{textContent:''},preview:{textContent:'',hidden:true,setAttribute(){}},
    label:{},submit:{},response:{dataset:{}},request:{value:'a'.repeat(32)},
    delivery:{value:'pickup',options:[{},{}],addEventListener(){}},
    address:{closest(){return {};}}};
  const handlers={};
  const form={elements:{namedItem(){return nodes.request;}},querySelector(s){return ({
    '[data-neon-submit]':nodes.submit,'[data-neon-response]':nodes.response,
    '[data-neon-delivery]':nodes.delivery,'[name="delivery_address"]':nodes.address})[s];},
    addEventListener(){},setAttribute(){},removeAttribute(){}};
  const root={querySelector(s){return ({'[data-neon-quote-form]':form,'[data-neon-price]':nodes.price,
    '[data-neon-request-label]':nodes.label,'[data-neon-preview-price]':nodes.preview})[s];},
    addEventListener(name,handler){handlers[name]=handler;}};
  const document={getElementById(){return {textContent:JSON.stringify({rates})};},querySelector(){return root;}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/neon-quote.js'),'utf8'),
    {document,window:{},Intl,Number,JSON,Map,Boolean,String});
  handlers['neon:design']({detail:{intent:'production',spec:{mount:'wall'},lengthMm:1000,
    finished:{withinLimit:true,tier:120,areaMm2:1000000},strokeCount:1,bendCount:0,spacerCount:count}});
  return nodes.price.textContent;
}

test('height-band spacer counts reach the server proof, DXF holes and live estimate',()=>{
  const {measure}=require('../app/cli/neon-measure.cjs');
  const base={version:2,text:'Hello\nHello',font:'signature',widthMm:1000,align:'center',
    letterSpacing:0,lineSpacing:1.25,color:'#ff488d',cover:'#ffffff',lineColors:[],
    backing:'clear',boardShape:'rectangle',boardGap:30,mount:'wall',brightness:85,scene:'studio',power:true};
  for(const [targetHeight,expectedCount] of [[899.5,6],[900.5,8],[1299.5,8],[1300.5,10]]) {
    // Find real lettering widths that place the finished board either side
    // of each threshold; avoid tests that replace the production layout.
    let low=100,high=2200;
    for(let i=0;i<35;i++) {
      const widthMm=(low+high)/2,spec={...base,widthMm},art=geometry.layout(spec);
      const height=geometry.finishedSize(art,geometry.backboard(art,spec),spec).heightMm;
      if(height<targetHeight)low=widthMm;else high=widthMm;
    }
    const proof=measure({...base,widthMm:(low+high)/2});
    assert.equal(proof.error,undefined);
    assert.ok(Math.abs(proof.finished.heightMm-targetHeight)<.001);
    assert.equal(proof.spacerCount,expectedCount);
    const holes=mountHoles(proof.dxf);
    assert.equal(holes.length,expectedCount);
    assert.ok(holes.every(hole=>hole.radius===5.5));
    const amount=new Intl.NumberFormat(undefined,{style:'currency',currency:'EUR'}).format(expectedCount*3);
    assert.ok(estimateWithSpacerCount(expectedCount).includes(amount));
  }
});
