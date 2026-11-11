import test from 'node:test';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';
import { measureDxf } from './dxf-measurements.mjs';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 5 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('measures parsed DXF lines, arcs, circles and bulged closed polylines', () => {
  const dxf = [
    0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LINE', 10, 0, 20, 0, 11, 3, 21, 4,
    0, 'CIRCLE', 10, 0, 20, 0, 40, 2,
    0, 'ARC', 10, 0, 20, 0, 40, 2, 50, 270, 51, 90,
    0, 'LWPOLYLINE', 90, 2, 70, 1, 10, 0, 20, 0, 42, 1, 10, 2, 20, 0,
    0, 'ENDSEC', 0, 'EOF',
  ].join('\n');
  const result = measureDxf(new DxfParser().parseSync(dxf), bounds);
  assert.equal(result.width, 10);
  assert.equal(result.height, 5);
  assert.equal(result.unit, 'mm');
  closeTo(result.pathLength, 5 + 4 * Math.PI + 2 * Math.PI + Math.PI + 2);
  assert.deepEqual(result.unsupported, []);
});

test('converts inches and keeps unspecified units as drawing units', () => {
  const entities = [{ type: 'LINE', vertices: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }];
  const inches = measureDxf({ header: { $INSUNITS: 1 }, entities }, bounds);
  closeTo(inches.width, 254);
  closeTo(inches.height, 127);
  closeTo(inches.pathLength, 127);
  const unitless = measureDxf({ entities }, bounds);
  assert.equal(unitless.unit, 'drawing units');
  assert.equal(unitless.unitsKnown, false);
  assert.equal(unitless.pathLength, 5);
});

test('does not present a partial total for unsupported or malformed geometry', () => {
  const line = { type: 'LINE', vertices: [{ x: 0, y: 0 }, { x: 3, y: 4 }] };
  const dxf = { entities: [line, { type: 'SPLINE' }, { type: 'INSERT' }] };
  const result = measureDxf(dxf, bounds);
  assert.equal(result.pathLength, null);
  assert.deepEqual(result.unsupported, ['INSERT', 'SPLINE']);
  const malformed = measureDxf({ entities: [{ type: 'LINE', vertices: [{ x: 0, y: 0 }] }] }, bounds);
  assert.equal(malformed.pathLength, null);
  assert.deepEqual(malformed.unsupported, ['LINE']);
});

test('ignores hidden entities and layers and rejects non-planar paths', () => {
  const line = { type: 'LINE', vertices: [{ x: 0, y: 0 }, { x: 3, y: 4 }] };
  const dxf = {
    tables: { layer: { layers: { off: { visible: false }, frozen: { frozen: true } } } },
    entities: [line, { type: 'SPLINE', hidden: true }, { type: 'INSERT', layer: 'off' },
      { type: 'SPLINE', layer: 'frozen' }],
  };
  assert.equal(measureDxf(dxf, bounds).pathLength, 5);
  const nonPlanar = measureDxf({ entities: [{ ...line, vertices: [{ x: 0, y: 0 }, { x: 3, y: 4, z: 2 }] }] }, bounds);
  assert.equal(nonPlanar.pathLength, null);
  assert.deepEqual(nonPlanar.unsupported, ['LINE']);
});
