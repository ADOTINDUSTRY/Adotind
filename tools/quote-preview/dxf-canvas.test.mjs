import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDxfCanvas } from './dxf-canvas.mjs';

test('2D fallback draws and disposes a DXF without WebGL', async (t) => {
  const calls = [];
  const context = {
    setTransform() {}, clearRect() {}, beginPath() {}, closePath() {}, fill() {}, fillRect() {},
    moveTo(x, y) { calls.push(['move', x, y]); },
    lineTo(x, y) { calls.push(['line', x, y]); },
    stroke() {},
  };
  let removed = false;
  const canvas = { style: {}, getContext: () => context, remove: () => { removed = true; } };
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldObserver = globalThis.ResizeObserver;
  let disconnected = false;
  globalThis.document = { createElement: () => canvas };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() { disconnected = true; }
  };
  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.ResizeObserver = oldObserver;
  });
  const dxf = [
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LINE', 10, 0, 20, 0, 11, 100, 21, 50,
    0, 'ENDSEC', 0, 'EOF',
  ].join('\n');
  const container = { clientWidth: 200, clientHeight: 100, append: () => {} };
  const result = await previewDxfCanvas(`data:text/plain,${encodeURIComponent(dxf)}`, container);
  assert.deepEqual(result.bounds, { minX: 0, maxX: 100, minY: 0, maxY: 50 });
  assert.deepEqual(calls, [['move', 10, 95], ['line', 190, 5]]);
  result.dispose();
  assert.equal(removed, true);
  assert.equal(disconnected, true);
});
