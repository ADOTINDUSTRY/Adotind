'use strict';

const assert = require('node:assert/strict');
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (ok, message) => { if (!ok) throw Error(message); };
  const wait = async (check, message) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error(message);
  };
  const stageKey = 'test-review-stage';
  const reload = stage => { sessionStorage.setItem(stageKey, stage); location.reload(); return false; };
  await wait(() => $('ws').dataset.draftReady === '1', 'Draft was not ready');
  const stage = sessionStorage.getItem(stageKey);
  if (!stage) {
    $('auto').click();
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillRect(10, 10, 80, 65); ctx.fillRect(120, 10, 80, 65);
    const image = await new Promise(resolve => canvas.toBlob(resolve));
    const data = new DataTransfer();
    data.items.add(new File([image], 'shapes.png', {type:'image/png'}));
    $('file').files = data.files; $('file').dispatchEvent(new Event('change', {bubbles:true}));
    $('go').click();
    await wait(() => !$('edit').hidden, 'Initial conversion failed');
    $('edit').click();
    $('ed-refine-instruction').value = 'Keep the corners.';
    $('ed-refine-run').click();
    await wait(() => $('ed-refine-count').textContent.includes('of 2'), 'Two review suggestions were expected');
    $('ed-refine-apply').click();
    expect($('ed-refine-status').textContent.includes('1 applied'), 'First suggestion was not accepted');
    return reload('pending-review');
  }
  if (stage === 'pending-review') {
    expect(!$('ed').hidden && !$('ed-refine-review').hidden, 'Active point review should reopen');
    expect($('ed-refine-instruction').value === 'Keep the corners.', 'Review instruction was lost');
    expect($('ed-refine-status').textContent.includes('1 applied'), 'Accepted edit count was lost');
    expect($('ed-refine-count').textContent.includes('1 of 1'), 'Expected one remaining suggestion');
    $('ed-refine-all').click();
    expect($('ed-refine-status').textContent.includes('2 applied'), 'Remaining edit could not be applied after reload');
    $('ed-apply').click(); $('ai-trace').click();
    await wait(() => $('trace-ai-dialog').open && !$('trace-ai-apply').disabled, 'Redrawn curves were not available');
    sessionStorage.setItem('test-ai-path', $('trace-ai-after').querySelector('path').getAttribute('d'));
    return reload('pending-redraw');
  }
  expect($('trace-ai-dialog').open && !$('trace-ai-apply').disabled, 'The unapproved redraw should reopen');
  const candidate = sessionStorage.getItem('test-ai-path');
  expect($('trace-ai-after').querySelector('path').getAttribute('d') === candidate, 'Redrawn path changed');
  $('trace-ai-apply').click();
  const svg = await (await fetch($('download').href)).text();
  expect(new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('path')?.getAttribute('d') === candidate,
    'Restored redraw could not be applied and downloaded');
}

async function run() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90">' +
    '<path d="M10 10 L50 10 L90 10 L90 75 L10 75 Z"/><path d="M120 10 L160 10 L200 10 L200 75 L120 75 Z"/></svg>';
  const requests = [];
  await runTraceBrowser(exercise, async (req, body) => {
    if (req.url.endsWith('/convert')) {
      requests.push('convert'); return {svg, width:220, height:90, duration_ms:1};
    }
    assert.equal(req.url, '/online-quote/svg-trace/ai');
    const data = JSON.parse(body);
    requests.push(data.mode);
    if (data.mode === 'trace') return {paths:[{d:'M10 10L90 10L90 75Z', fill:'#254492'}]};
    assert.equal(data.mode,'review');
    return {proposals:data.contours.map(c => ({id:c.id, edits:[{index:1, action:'remove', reason:'Straight edge.'}]}))};
  });
  assert.deepEqual(requests,['convert','review','trace'], 'Refreshing must not send the file or repeat an AI request');
  console.log('Pending point review, accepted edit count and unapproved AI redraw survived reload.');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
