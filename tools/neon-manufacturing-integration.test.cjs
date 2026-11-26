const {test} = require('node:test');
const assert = require('node:assert/strict');
const {measure} = require('../app/cli/neon-measure.cjs');
const geometry = globalThis.NeonGeometry;
const planner = require('../public/assets/js/neon-strip-plan.js');
const acute = require('../public/assets/js/neon-acute-fit.js');

const design = {
  version: 2, text: 'Hello Hello\nHello', font: 'signature', widthMm: 1000,
  align: 'center', letterSpacing: 0, lineSpacing: 1.25, color: '#ff488d',
  cover: '#ffffff', lineColors: [], backing: 'clear', boardShape: 'rectangle',
  boardGap: 30, mount: 'wall', brightness: 85, scene: 'studio', power: true,
};

test('server and editor produce the same adjusted preview and DXF', () => {
  for (const spec of [design, {...design,text:'-',font:'studio',widthMm:606}, {...design,text:'Hello',widthMm:600}]) {
    const proof = measure(spec);
    assert.equal(proof.error, undefined);
    let drawing = geometry.repairLayout(proof.design);
    const correction = acute.prepareForSpec(drawing, proof.design, geometry);
    if (correction.applied) drawing = correction.artwork;
    const fit = planner.fitIndependentPaths(drawing, geometry.inspectManufacturing);
    if (fit.applied) drawing = fit.artwork;
    assert.equal(proof.svg, geometry.svg(drawing, proof.design));
    assert.equal(proof.dxf, geometry.dxf(drawing, proof.design));
    assert.equal(proof.lengthMm, drawing.lengthMm);
    assert.equal(proof.stripFit.pathsMatchCutMarks, fit.plan.pathsMatchCutMarks);
  }
});

test('photographed Hello H is reshaped in the preview and DXF while remaining review-only', () => {
  const proof = measure({...design,text:'Hello',widthMm:600});
  assert.equal(proof.error, undefined);
  assert.ok(proof.acuteRepair);
  assert.deepEqual(proof.acuteRepair.ledLengthsMm, [50,25]);
  assert.ok(proof.acuteRepair.clearanceMm >= 10);
  assert.equal(proof.reviewOnly, true);
  assert.match(proof.warnings.join(' '), /sharp return was reshaped/);
  const initial = geometry.repairLayout(proof.design);
  const corrected = acute.prepareForSpec(initial, proof.design, geometry);
  assert.equal(corrected.applied, true);
  assert.equal(geometry.inspectManufacturing(corrected.artwork.runs,true).locations.some(item=>item.point[0]<175),false,
    'The corrected H or its normal continuation was incorrectly marked.');
});

test('matching length is not treated as verified electrical routing or cover manufacture', () => {
  const proof = measure({...design,text:'-',font:'studio',widthMm:606}, 'production');
  assert.equal(proof.error, undefined);
  assert.equal(proof.stripFit.electricalRoutingVerified, false);
  assert.equal(proof.stripFit.coverCrossingsVerified, false);
  assert.equal(proof.reviewOnly, true);
  assert.ok(proof.dxf);
  assert.match(proof.warnings.join(' '), /LED routing and silicone-cover joins need shop review/);
});

test('uncorrected multi-letter design remains a downloadable review drawing', () => {
  const proof = measure(design, 'production');
  assert.equal(proof.error, undefined);
  assert.equal(proof.stripFit.pathsMatchCutMarks, false);
  assert.equal(proof.reviewOnly, true);
  assert.match(proof.warnings.join(' '), /25 mm multiples/);
  assert.match(proof.dxf, /TUBE_CENTERLINE_6MM/);
});
