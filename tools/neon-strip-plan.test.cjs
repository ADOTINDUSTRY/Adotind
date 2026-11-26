const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planStripStock, fitIndependentPaths} = require('../public/assets/js/neon-strip-plan.js');
require('../public/assets/js/neon-fonts.js');
require('../public/assets/js/neon-geometry.js');
const geometry = globalThis.NeonGeometry;

test('reports actual paths and 25 mm stock allocations separately', () => {
  const plan = planStripStock([
    [[0, 0], [25, 0]],
    [[0, 0], [30, 0]],
    [[0, 0], [0, 3]],
    [[0, 0], [3, 4], [0, 0]],
  ]);
  assert.deepEqual(plan.pieces.map(piece => piece.lengthMm), [25, 30, 3, 10]);
  assert.deepEqual(plan.pieces.map(piece => piece.cutLengthMm), [25, 50, 25, 25]);
  assert.deepEqual(plan.pieces.map(piece => piece.differenceMm), [0, 20, 22, 15]);
  assert.equal(plan.pathsMatchCutMarks, false);
  assert.equal(plan.electricalRoutingVerified, false);
  assert.equal(plan.allocatedMm, 125);
  assert.equal(plan.pathLengthMm, 68);
});

test('does not pass an above-mark path by rounding its displayed length', () => {
  const plan = planStripStock([[[0, 0], [25.01, 0]]]);
  assert.equal(plan.pieces[0].cutLengthMm, 50);
  assert.equal(plan.pieces[0].fitsWithinTolerance, false);
  assert.ok(plan.pieces[0].differenceMm > 24.98);
});

test('measures the same rounded coordinates written to the DXF', () => {
  const plan = planStripStock([[[0.00004, 0.00004], [15.00004, 20.00004]]]);
  assert.equal(plan.pieces[0].lengthMm, 25);
  assert.equal(plan.pieces[0].fitsWithinTolerance, true);
  assert.equal(plan.pathsMatchCutMarks, true);
});

test('rejects incomplete or non-finite paths', () => {
  assert.throws(() => planStripStock([[[0, 0]]]));
  assert.throws(() => planStripStock([[[0, 0], [NaN, 2]]]));
  assert.throws(() => planStripStock([[[1, 1], [1, 1]]]));
});

test('fits an isolated stroke on a real 25 mm cut mark without changing the sign size', () => {
  const drawing = {
    valid: true, widthMm: 106, heightMm: 100,
    paths: [
      {line: 0, d: 'M3 3L103 3'},
      {line: 0, d: 'M30 50L57 50'},
      {line: 0, d: 'M3 97L103 97'},
    ],
    runs: [
      [[3, 3], [103, 3]],
      [[30, 50], [57, 50]],
      [[3, 97], [103, 97]],
    ],
  };
  const original = JSON.stringify(drawing);
  const fitted = fitIndependentPaths(drawing, geometry.inspectManufacturing);
  assert.equal(fitted.applied, true);
  assert.equal(fitted.plan.pathsMatchCutMarks, true);
  assert.equal(fitted.plan.pieces.length, 3);
  assert.ok(Math.abs(fitted.plan.pieces[1].lengthMm - 25) <= fitted.plan.toleranceMm);
  assert.match(fitted.artwork.paths[1].d, /^M31 50L56 50$/);
  assert.equal(JSON.stringify(drawing), original);

  // Independently re-read each vertex from the exported DXF.
  const dxf = geometry.dxf(fitted.artwork);
  const tags = dxf.trim().split(/\r?\n/);
  const polylines = [];
  let current = null, entity = '';
  for (let i = 0; i < tags.length; i += 2) {
    const code = Number(tags[i]), value = tags[i + 1];
    if (code === 0) {
      entity = value;
      if (entity === 'POLYLINE') { current = []; polylines.push(current); }
      else if (entity !== 'VERTEX') current = null;
    }
    if (current && entity === 'VERTEX' && code === 10) current.push([Number(value)]);
    if (current && entity === 'VERTEX' && code === 20) current.at(-1).push(Number(value));
  }
  assert.equal(polylines.length, 3);
  for (const path of polylines) {
    const length = path.slice(1).reduce((sum, point, i) =>
      sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);
    assert.ok(Math.abs(length - Math.round(length / 25) * 25) <= 0.001);
  }
});

test('does not distort connected junctions or accept failed clearance checks', () => {
  const crossing = {
    valid: true, widthMm: 106, heightMm: 100,
    paths: [{d: 'M30 20L57 20'}, {d: 'M43 3L43 97'}],
    runs: [[[30, 20], [57, 20]], [[43, 3], [43, 97]]],
  };
  const result = fitIndependentPaths(crossing, () => ({requiresReview: false}));
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'connected_paths');
  assert.equal(crossing.paths[0].d, 'M30 20L57 20');
});

test('retains original geometry if the final clearance check fails', () => {
  const drawing = {
    valid: true, widthMm: 106, heightMm: 100,
    paths: [{d: 'M3 3L103 3'}, {d: 'M30 50L57 50'}, {d: 'M3 97L103 97'}],
    runs: [[[3, 3], [103, 3]], [[30, 50], [57, 50]], [[3, 97], [103, 97]]],
  };
  const original = JSON.stringify(drawing);
  const result = fitIndependentPaths(drawing, () => ({requiresReview: true}));
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'clearance_review');
  assert.equal(JSON.stringify(drawing), original);
});

test('stops before quadratic collision checks for dense drawings', () => {
  const points = Array.from({length: 1201}, (_, index) => [index / 40, 3]);
  const drawing = {valid: true, widthMm: 50, heightMm: 50,
    paths: [{d: 'M0 3L30 3'}], runs: [points]};
  assert.equal(fitIndependentPaths(drawing, () => ({requiresReview: false})).reason, 'too_complex');
});
