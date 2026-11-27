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
