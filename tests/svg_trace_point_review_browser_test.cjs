'use strict';
const assert = require('node:assert/strict');
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (condition, message) => { if (!condition) throw Error(message); };
  const wait = async (test, message) => {
    for (let i = 0; i < 120; i++) {
      if (test()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error(message + ' (' + $('ed-refine-status').textContent + ')');
  };
  const coordinates = [10, 120];
  const rectangles = coordinates.map(x => '<path fill="#284777" d="M' + x + ' 10 L' + (x + 40) + ' 10 L' +
    (x + 80) + ' 10 L' + (x + 80) + ' 75 L' + x + ' 75 Z"/>');
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90">' + rectangles.join('') + '</svg>';
  const image = document.createElement('canvas');
  image.width = 220; image.height = 90;
  const context = image.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 220, 90);
  context.fillStyle = '#284777'; coordinates.forEach(x => context.fillRect(x, 10, 80, 65));
  $('img-original').src = image.toDataURL();
  $('ws').dispatchEvent(new CustomEvent('st:result', {detail:{text:source, original:$('img-original').src}}));
  // Count the two redundant midpoint nodes which remain in the actual paths.
  function midpoints(paths) {
    return Array.from(paths).filter((p, i) => {
      const commands = p.getAttribute('d').matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g);
      return Array.from(commands).some(m => +m[1] === coordinates[i] + 40 && +m[2] === 10);
    }).length;
  }
  const editorCount = () => midpoints(document.querySelectorAll('#ed-svg .ed-path'));
  async function findSuggestions() {
    $('ed-refine-run').click();
    await wait(() => !$('ed-refine-review').hidden && !$('ed-refine-apply').disabled, 'Suggestions did not appear');
    expect(!$('trace-ai-dialog').open, 'The new-image tracing dialog must stay closed during a node review');
  }
  let saved;
  $('ws').addEventListener('st:edited', e => { saved = e.detail.text; });
  $('edit').click();
  await wait(() => !$('ed').hidden && !$('ed-refine-panel').hidden, 'Edit points did not open its review dock');
  expect($('ed-refine-scope').value === 'auto', 'With no points selected, automatic scope reviews the whole drawing');
  expect(editorCount() === 2, 'Both synthetic paths must start with a redundant midpoint');
  const pick = element => {
    const box = element.getBoundingClientRect();
    const pointer = {bubbles:true, button:0, pointerId:1, clientX:box.x + box.width/2, clientY:box.y + box.height/2};
    element.dispatchEvent(new PointerEvent('pointerdown',pointer));
    $('ed-svg').dispatchEvent(new PointerEvent('pointerup',pointer));
  };
  pick(document.querySelector('.ed-path'));
  pick(document.querySelector('.ed-node[data-ni="1"]'));
  const scope = $('ed-refine-scope');
  scope.value = 'point'; scope.dispatchEvent(new Event('change'));
  expect(!scope.selectedOptions[0].disabled, 'Selecting an actual node must enable the point scope');
  $('ed-refine-local').click();
  await wait(() => !$('ed-refine-review').hidden, 'Local selected-point review did not find the redundant midpoint');
  $('ed-refine-all').click();
  expect(editorCount() === 1, 'Point-scoped cleanup may change only the selected node');
  $('ed-undo').click();
  scope.value = 'drawing'; scope.dispatchEvent(new Event('change'));
  $('ed-refine-instruction').value = 'Remove unnecessary points on the straight edges.';

  await findSuggestions();
  const first = $('ed-refine-count').textContent + $('ed-refine-reason').textContent;
  $('ed-refine-next').click();
  expect(first !== $('ed-refine-count').textContent + $('ed-refine-reason').textContent, 'Next must change the active suggestion');
  $('ed-refine-prev').click();
  expect(first === $('ed-refine-count').textContent + $('ed-refine-reason').textContent, 'Previous must return to the first suggestion');
  $('ed-refine-skip').click();
  expect(editorCount() === 2, 'Reviewing and skipping must preserve the source paths');
  $('ed-refine-apply').click();
  expect(editorCount() === 1, 'Apply this should remove just one midpoint');
  $('ed-undo').click();
  expect(editorCount() === 2, 'Undo should restore the edited shape');

  await findSuggestions();
  $('ed-refine-all').click();
  expect(editorCount() === 0, 'Apply all should remove both redundant nodes');
  $('ed-undo').click();
  expect(editorCount() === 2, 'One undo should reverse both edits in the batch');
  $('ed-redo').click();
  expect(editorCount() === 0, 'One redo should restore the full batch');
  window.confirm = () => true;
  $('ed-cancel').click(); $('edit').click();
  expect(editorCount() === 2 && saved === undefined, 'Cancel must discard all uncommitted edits');

  await findSuggestions();
  $('ed-refine-all').click(); $('ed-apply').click();
  expect($('ed').hidden && !!saved, 'Done must apply the approved geometry to the trace workspace');
  const downloaded = await (await fetch($('download').href)).text();
  const exportedPaths = new DOMParser().parseFromString(downloaded, 'image/svg+xml').querySelectorAll('path');
  expect(exportedPaths.length === 2 && midpoints(exportedPaths) === 0, 'The downloadable SVG must contain both corrected paths');
}

async function run() {
  const requests = [];
  await runTraceBrowser(exercise, async (req,body) => {
    assert.equal(req.url, '/online-quote/svg-trace/ai');
    const data = JSON.parse(body);
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['x-csrf-token'], 'test-token');
    assert.equal(data.mode, 'review');
    assert.match(data.image, /^\/9j\//, 'A reduced JPEG of the reference artwork accompanies the traced contours');
    assert.equal(data.contours.length, 2);
    assert.equal(new Set(data.contours.map(c => c.id)).size, 2);
    requests.push(data);
    const proposals = data.contours.map(c => ({
      id:c.id, edits:[{action:'remove',index:1,reason:'Remove the midpoint on shape ' + c.id + '.'}],
    }));
    return {proposals};
  });
  assert.equal(requests.length, 3, 'Only explicit review requests may contact the AI service');
  console.log('In-canvas review, individual edits, batch undo/redo, cancellation and SVG download passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
