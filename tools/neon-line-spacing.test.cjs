'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../public/assets/js/neon-fonts.js');
require('../public/assets/js/neon-geometry.js');
const {recommend}=require('../public/assets/js/neon-line-spacing.js');
const engine=globalThis.NeonGeometry;

function verticalGap(art) {
  const points=line=>art.runs.flatMap((run,i)=>art.paths[i].line===line?run:[]);
  const first=points(0),second=points(1);
  return Math.min(...second.map(point=>point[1]))-Math.max(...first.map(point=>point[1]))-6;
}

test('font-specific automatic spacing avoids overlapping descenders and ascenders',()=>{
  const seen=new Set();
  for (const font of engine.fonts) {
    const text=font.id==='aegean'?'Καλημέρα\nκόσμος':'Agypq\nAgypq';
    const spec={text,font:font.id,widthMm:1000,align:'center',letterSpacing:0};
    const spacing=recommend(engine,spec);
    assert.ok(Number.isFinite(spacing),font.id);
    assert.ok(spacing>=.5 && spacing<=2,font.id);
    assert.ok(Math.abs(spacing*20-Math.round(spacing*20))<1e-8,font.id);
    const art=engine.layout({...spec,lineSpacing:spacing});
    assert.equal(art.valid,true,font.id);
    assert.ok(verticalGap(art)>=0,font.id+' overlaps its next row');
    seen.add(spacing);
  }
  assert.ok(seen.size>=4,'different fonts should not all receive the same setting');
});

test('single-line text gets a font-specific suggestion for a later second line',()=>{
  const a=recommend(engine,{text:'Hello',font:'atelier',widthMm:800});
  const b=recommend(engine,{text:'Hello',font:'invitation',widthMm:800});
  assert.ok(a<1,'a short font should not have an oversized gap');
  assert.ok(b>1,'a tall font needs more spacing');
});

test('unsupported and incomplete layouts fail without altering the draft',()=>{
  assert.equal(recommend(engine,{text:'☃\n☃',font:'signature',widthMm:600}),null);
  assert.equal(recommend(engine,{text:'Hello\nHello',font:'not-a-font',widthMm:600}),null);
  assert.equal(recommend(null,{text:'Hello'}),null);
});
