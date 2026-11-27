const {test}=require('node:test');const assert=require('node:assert/strict');
const {measure}=require('../app/cli/neon-measure.cjs');const geometry=globalThis.NeonGeometry;
const lines=require('../public/assets/js/neon-lines.js');
const base={version:2,text:'Hello\nΓειά',font:'signature',widthMm:1000,align:'center',letterSpacing:0,lineSpacing:1.25,color:'#ff488d',cover:'#ffffff',lineColors:['#ff488d','#68c7ff'],lineFonts:[null,'aegean'],lineTransforms:[null,{x:15,y:-5,rotation:25}],backing:'none',mount:'wall',brightness:85,scene:'studio',power:true};
test('mixed Greek and Latin fonts, colours and positioning share the preview and DXF geometry',()=>{
  const proof=measure(base);assert.ok(!proof.error,proof.error);
  const preview=geometry.layout(proof.design);assert.ok(preview.valid,preview.errors.join('; '));
  assert.ok(preview.paths.some(p=>p.line===0));assert.ok(preview.paths.some(p=>p.line===1));
  assert.equal(geometry.dxf(preview,proof.design),proof.dxf);
  const svg=geometry.svg(preview,proof.design);assert.ok(svg.toLowerCase().includes('#ff488d'));assert.ok(svg.toLowerCase().includes('#68c7ff'));
  const straight=measure({...base,lineTransforms:[]});assert.ok(!straight.error,straight.error);assert.notEqual(proof.dxf,straight.dxf);
});
test('individual line fonts and transformations are validated and eight lines are supported',()=>{
  assert.ok(measure({...base,lineFonts:[null,'unknown']}).error);
  assert.ok(measure({...base,lineTransforms:[{x:0,y:0,rotation:181}]}).error);
  assert.ok(measure({...base,lineTransforms:[{x:0,y:0,rotation:0,extra:1}]}).error);
  assert.ok(!measure({...base,text:'A\nA\nA\nA\nA\nA\nA\nA',widthMm:100,lineFonts:[],lineColors:[],lineTransforms:[]}).error);
  assert.ok(measure({...base,text:'A\nA\nA\nA\nA\nA\nA\nA\nA',lineFonts:[],lineColors:[],lineTransforms:[]}).error);
});
test('existing single-font designs retain their original proof when line options are absent',()=>{
  const old={...base,text:'Hello\nWorld'};delete old.lineFonts;delete old.lineTransforms;old.lineColors=[];
  const before=measure(old), after=measure({...old,lineFonts:[],lineTransforms:[]});
  assert.ok(!before.error,before.error);assert.equal(before.dxf,after.dxf);
});
test('Greek auto-switches only affected lines when the Greek font supports the text',()=>{
  const choices=geometry.fonts, library=globalThis.NeonStrokeFonts;
  const result=lines.autoGreek({text:'Hello\nΓειά',font:'signature',lineFonts:[]},choices,library);
  assert.equal(result.switched,true);assert.equal(result.next[1],'aegean');assert.equal(result.next[0],undefined);
  assert.equal(lines.autoGreek({text:'Γειά',font:'signature',lineFonts:[]},choices.filter(f=>f.id!=='aegean'),library).switched,false);
  assert.equal(lines.autoGreek({text:'Γειά',font:'signature',lineFonts:['aegean']},choices,library).switched,false);
});
test('inserting and removing a line retains settings on the remaining lines',()=>{
  const original=[['studio','aegean'],['red','blue'],[{x:1}, {x:2}]];
  const inserted=lines.reconcile('Hello\nWorld','Hello\nNew\nWorld',original);
  assert.deepEqual(inserted[0],['studio',null,'aegean']);assert.deepEqual(inserted[1],['red',null,'blue']);
  const removed=lines.reconcile('Hello\nNew\nWorld','Hello\nWorld',inserted);
  assert.deepEqual(removed,original);
});
test('moving either line preserves the size of the other and updates the DXF',()=>{
  const original={...base,text:'Hello\nHello',lineFonts:[],lineColors:[],lineTransforms:[]};
  const before=geometry.layout(original);
  for(const index of [0,1]) for(const transform of [{x:20,y:0,rotation:0},{x:0,y:20,rotation:0},{x:0,y:0,rotation:25}]) {
    const changes=[];changes[index]=transform;
    const adjusted=lines.preserveScale(original,changes,geometry.layout,{min:100,max:3000});
    assert.ok(adjusted);
    const after=geometry.layout(adjusted);
    assert.ok(Math.abs(after.lineOffsetMmPerPercent-before.lineOffsetMmPerPercent)<1e-8);
    const other=index===0?1:0;
    const size=proof=>proof.runs.filter((_,i)=>proof.runWords[i].startsWith(other+':')).reduce((n,run)=>n+run.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-run[i][0],p[1]-run[i][1]),0),0);
    assert.ok(Math.abs(size(before)-size(after))<1e-6);
    assert.notEqual(measure(original).dxf,measure(adjusted).dxf);
  }
  assert.equal(lines.preserveScale({...original,widthMm:3000},[null,{x:100,y:0,rotation:0}],geometry.layout,{min:100,max:3000}),null);
});
test('clearance detects crossings and parallel strokes only between different rows',()=>{
  const drawing=(runs,words)=>({valid:true,runs,runWords:words});
  assert.equal(geometry.lineClearance(drawing([[[0,0],[100,0]],[[50,-50],[50,50]]],['0:0','1:0'])).distance,0);
  assert.equal(geometry.lineClearance(drawing([[[0,0],[100,0]],[[0,22],[100,22]]],['0:0','1:0'])).distance,22);
  assert.equal(geometry.lineClearance(drawing([[[0,0],[100,0]],[[0,1],[100,1]]],['0:0','0:1'])).lines,null);
});
test('a large movement stops at the 16 mm clear gap and can move away again',()=>{
  const s={...base,text:'Hello\nHello',widthMm:600,lineFonts:[],lineColors:[],lineTransforms:[]};
  const moved=lines.limitMovement(s,[null,{x:0,y:-200,rotation:0}],1,geometry,{min:100,max:3000});
  assert.ok(moved.blocked);
  const clear=geometry.lineClearance(geometry.layout(moved.design));
  assert.ok(clear.distance>=lines.CLEARANCE-1e-7);
  assert.ok(clear.distance<lines.CLEARANCE+.05);
  const away=lines.limitMovement(moved.design,[null,{x:0,y:0,rotation:0}],1,geometry,{min:100,max:3000});
  assert.equal(away.blocked,false);
  assert.ok(geometry.lineClearance(geometry.layout(away.design)).distance>clear.distance);
  assert.ok(!measure(moved.design).error);
  assert.match(measure({...s,lineTransforms:[null,{x:0,y:-30,rotation:0}]}).error,/16 mm/);
});
test('rotation also stops before a different line comes within the required gap',()=>{
  const s={...base,text:'Hello\nHello',widthMm:600,lineFonts:[],lineColors:[],lineTransforms:[]};
  const moved=lines.limitMovement(s,[null,{x:0,y:0,rotation:180}],1,geometry,{min:100,max:3000});
  assert.ok(moved.blocked);
  assert.ok(moved.design.lineTransforms[1].rotation>0 && moved.design.lineTransforms[1].rotation<180);
  assert.ok(geometry.lineClearance(geometry.layout(moved.design)).distance>=lines.CLEARANCE-1e-7);
});
