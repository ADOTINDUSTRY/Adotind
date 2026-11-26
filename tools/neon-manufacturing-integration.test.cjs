const {test} = require('node:test');
const assert = require('node:assert/strict');
const {measure} = require('../app/cli/neon-measure.cjs');
const geometry = globalThis.NeonGeometry;

const design = {
  version: 2, text: 'Hello Hello\nHello', font: 'signature', widthMm: 1000,
  align: 'center', letterSpacing: 0, lineSpacing: 1.25, color: '#ff488d',
  cover: '#ffffff', lineColors: [], backing: 'clear', boardShape: 'rectangle',
  boardGap: 30, mount: 'wall', brightness: 85, scene: 'studio', power: true,
};

test('preview and exported artwork keep the original lettering without cut checks', () => {
  for (const spec of [design, {...design,text:'Hello',widthMm:600}, {...design,text:'-',font:'studio',widthMm:606}]) {
    const proof = measure(spec);
    assert.equal(proof.error, undefined);
    const original = geometry.layout(proof.design);
    assert.equal(proof.svg, geometry.svg(original, proof.design));
    assert.equal(proof.dxf, geometry.dxf(original, proof.design));
    assert.equal(proof.lengthMm, original.lengthMm);
    assert.equal(proof.strokeCount, original.paths.length);
    assert.equal(proof.reviewOnly, false);
    assert.equal(proof.stripFit, undefined);
    assert.equal(proof.acuteRepair, undefined);
    assert.deepEqual(proof.warnings, []);
  }
});

test('basic sign dimensions and product options remain validated', () => {
  assert.match(measure({...design,widthMm:3001}).error, /limits/);
  assert.ok(measure({...design,cover:'#ff488d',color:'#68c7ff'}).error);
});
