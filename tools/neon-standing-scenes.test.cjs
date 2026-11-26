const {test} = require('node:test');
const assert = require('node:assert/strict');
const scenes = require('../public/assets/js/neon-standing-scenes.js');

const finished={left:-20,right:1020,bottom:400};
const base={left:84,widthMm:832,top:540,depthMm:140,thicknessMm:8};

test('table, shelf and floor are distinct preview-only surface illustrations',()=>{
  assert.deepEqual(scenes.options,['table','shelf','floor']);
  const input=JSON.stringify({finished,base});
  const table=scenes.build('table',finished,base,20);
  const shelf=scenes.build('shelf',finished,base,20);
  const floor=scenes.build('floor',finished,base,20);
  assert.equal(table.length,4);
  assert.equal(shelf.length,4);
  assert.equal(floor.length,3);
  assert.ok(table.slice(2).every(e=>e.tag==='rect'));
  assert.ok(shelf.slice(2).every(e=>e.tag==='path'));
  assert.equal(floor[2].tag,'line');
  for(const drawing of [table,shelf,floor]) {
    assert.equal(drawing[0].attrs.x,base.left);
    assert.equal(drawing[0].attrs.width,base.widthMm);
    assert.equal(drawing[0].attrs.height,8);
    assert.equal(drawing[1].attrs.y,finished.bottom+8);
    // The furniture illustration is above the separately dimensioned base plan.
    for(const e of drawing) if(e.tag==='rect') assert.ok(e.attrs.y+e.attrs.height<base.top);
  }
  assert.equal(JSON.stringify({finished,base}),input,'preview must not mutate production geometry');
});

test('drawing mode remains a line illustration and invalid inputs create nothing',()=>{
  const drawing=scenes.build('table',finished,base,20,true);
  assert.ok(drawing.filter(e=>e.tag==='rect').every(e=>e.attrs.fill==='none'));
  assert.deepEqual(scenes.build('unknown',finished,base,20),[]);
  assert.deepEqual(scenes.build('table',finished,null,20),[]);
  assert.deepEqual(scenes.build('table',{...finished,right:NaN},base,20),[]);
  assert.deepEqual(scenes.build('table',finished,base,0),[]);
});

test('surface selection is saved but never changes cutting files or base dimensions',()=>{
  const {measure}=require('../app/cli/neon-measure.cjs');
  const spec={version:2,text:'Hello',font:'signature',widthMm:700,align:'center',letterSpacing:0,lineSpacing:1.25,
    color:'#ff488d',cover:'#ffffff',lineColors:[],backing:'clear',boardShape:'rectangle',boardGap:30,
    mount:'freestanding',brightness:85,scene:'studio',power:true};
  const legacy=measure(spec),table=measure({...spec,standSurface:'table'}),
    shelf=measure({...spec,standSurface:'shelf'}),floor=measure({...spec,standSurface:'floor'});
  assert.equal(legacy.design.standSurface,'table');
  for (const result of [table,shelf,floor]) {
    assert.equal(result.error,undefined);
    assert.equal(result.dxf,table.dxf);
    assert.equal(result.svg,table.svg);
    assert.deepEqual(result.standingBase,table.standingBase);
  }
  assert.equal(shelf.design.standSurface,'shelf');
  assert.equal(floor.design.standSurface,'floor');
  assert.match(measure({...spec,standSurface:'invalid'}).error,/standSurface/);
});
