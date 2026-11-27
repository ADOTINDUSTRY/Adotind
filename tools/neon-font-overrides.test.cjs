const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const cli=require.resolve('../app/cli/neon-measure.cjs');
const design={version:1,text:'A',font:'studio',widthMm:700,align:'center',letterSpacing:0,lineSpacing:1.25,color:'#ff488d',backing:'none',mount:'wall',brightness:85,scene:'studio',power:true};
const run=(payload)=>{const p=spawnSync(process.execPath,[cli,'production'],{input:JSON.stringify(payload),encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
test('edited glyph appears identically in browser geometry and server DXF',()=>{
  const original=run(design);assert.ok(!original.error,original.error);
  const overrides={studio:{'g:A':[['M',0,0],['C',100,500,400,900,500,900],['L',1000,0],['M',200,250],['L',800,250]]}};
  const edited=run({design,fontOverrides:overrides});assert.ok(!edited.error,edited.error);
  assert.notEqual(edited.dxf,original.dxf);
  require('../public/assets/js/neon-fonts.js');require('../public/assets/js/neon-font-overrides.js');
  globalThis.applyNeonFontOverrides(overrides);require('../public/assets/js/neon-geometry.js');
  const geometry=globalThis.NeonGeometry;
  const preview=geometry.layout(edited.design);
  assert.ok(preview.valid);
  assert.equal(geometry.dxf(preview,edited.design),edited.dxf);
  assert.deepEqual(geometry.editingGlyph('studio','A').commands,overrides.studio['g:A']);
  globalThis.applyNeonDisabledGlyphs({studio:{'g:A':true}});
  assert.equal(geometry.layout(edited.design).valid,false,'browser preview must reject disabled letters');
});
test('disabled glyph is rejected by server and other fonts remain available',()=>{
  const disabled={studio:{'g:A':true}};
  const blocked=run({design,fontDisabled:disabled});assert.match(blocked.error,/does not contain/i);
  const other=run({design:{...design,font:'signature'},fontDisabled:disabled});assert.ok(!other.error,other.error);
});
test('a joined loop exports as a closed neon polyline',()=>{
  const proof=run({design,fontOverrides:{studio:{'g:A':[['M',0,0],['L',800,0],['L',800,800],['L',0,800],['L',0,0]]}}});
  assert.ok(!proof.error,proof.error);
  assert.match(proof.dxf,/POLYLINE\r\n8\r\nTUBE_CENTERLINE_6MM\r\n66\r\n1\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n70\r\n1\r\n/);
});
