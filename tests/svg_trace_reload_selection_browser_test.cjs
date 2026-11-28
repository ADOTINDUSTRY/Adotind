'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (ok, message) => { if (!ok) throw Error(message); };
  const wait = async (check, message) => {
    for (let i = 0; i < 180; i++) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error(message + ' (' + $('status').textContent + ')');
  };
  await wait(() => $('ws').dataset.draftReady === '1', 'Workspace did not finish restoring');
  if (location.search === '?fresh') {
    expect($('ed').hidden && $('edit').hidden && $('view').hidden, 'A newly opened tab inherited the previous drawing');
    window.opener.postMessage('trace-fresh-ok', location.origin);
    return false;
  }
  const stage = sessionStorage.getItem('test-stage');
  const reload = stage => { sessionStorage.setItem('test-stage', stage); location.reload(); return false; };
  function editorPaths() { return [...document.querySelectorAll('#ed-svg .ed-path')].map(p => p.getAttribute('d')); }
  async function downloaded() {
    const xml = await (await fetch($('download').href)).text();
    return [...new DOMParser().parseFromString(xml, 'image/svg+xml').querySelectorAll('path')].map(p => p.getAttribute('d'));
  }
  const countMidpoints = paths => paths.filter(d => /L\s*60[ ,]+(?:12|76)(?=\s*[A-Z])/.test(d)).length;
  if (!stage) {
    if ($('auto').checked) $('auto').click();
    $('preset').value = 'font'; $('preset').dispatchEvent(new Event('change'));
    const threshold = document.querySelector('[name=threshold]');
    threshold.value = '151'; threshold.dispatchEvent(new Event('input'));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1216;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(1216, 1216);
    for (let i = 0; i < pixels.data.length; i += 65536) {
      crypto.getRandomValues(pixels.data.subarray(i, Math.min(i + 65536, pixels.data.length)));
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    expect(blob.size > 4 * 1024 * 1024, 'The raster should exceed ordinary session storage when base64-encoded');
    const data = new DataTransfer();
    data.items.add(new File([blob],'two-parts.png',{type:'image/png'}));
    $('file').files = data.files;
    $('file').dispatchEvent(new Event('change', {bubbles:true}));
    $('go').click();
    await wait(() => !$('edit').hidden, 'Initial test conversion failed');
    $('edit').click();
    await wait(() => !$('ed').hidden && $('ed-svg').getAttribute('viewBox'), 'Point editor did not open');
    const svg = $('ed-svg');
    $('ed-box-select').click();
    expect($('ed-box-select').getAttribute('aria-pressed') === 'true', 'Selection tool did not activate');
    function pointer(type, x, y) {
      const pos = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
      svg.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,buttons:type === 'pointerup' ? 0 : 1,
        pointerType:'mouse',pointerId:1,isPrimary:true,clientX:pos.x,clientY:pos.y}));
    }
    pointer('pointerdown',65,80); pointer('pointermove',55,8); pointer('pointerup',55,8);
    expect(svg.querySelectorAll('.ed-box-selected').length === 2, 'Reverse-direction drag across two contours should select two points');
    svg.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
    expect(editorPaths().length === 2 && countMidpoints(editorPaths()) === 0, 'Delete must edit both shapes in the selection');
    $('ed-undo').click();
    expect(countMidpoints(editorPaths()) === 2, 'One undo must restore both deleted points');
    $('ed-redo').click();
    expect(countMidpoints(editorPaths()) === 0, 'One redo must remove both points');
    $('ed-in').click();
    sessionStorage.setItem('test-viewbox',svg.getAttribute('viewBox'));
    return reload('editor');
  }
  expect($('preset').value === 'font' && document.querySelector('[name=threshold]').value === '151' && !$('auto').checked,
    'Trace style, threshold or auto preference changed across reload');
  await wait(() => $('img-original').naturalWidth === 1216, 'The original raster could not be decoded after refresh');
  if (stage === 'editor') {
    await wait(() => !$('ed').hidden && editorPaths().length === 2, 'Refresh should reopen the unfinished point editor');
    expect(countMidpoints(editorPaths()) === 0, 'Refresh lost the unapplied changes');
    expect($('ed-svg').getAttribute('viewBox') === sessionStorage.getItem('test-viewbox'), 'Refresh changed the editor zoom');
    $('ed-undo').click();
    expect(countMidpoints(editorPaths()) === 2, 'Refresh lost the grouped undo history');
    $('ed-redo').click(); $('ed-apply').click();
    expect($('ed').hidden && countMidpoints(await downloaded()) === 0, 'Done must update the downloadable SVG');
    return reload('workspace');
  }
  expect($('ed').hidden && !$('edit').hidden, 'Workspace mode should survive refresh after Done');
  const paths = await downloaded();
  expect(paths.length === 2 && countMidpoints(paths) === 0, 'The editable export changed after refresh');
  const independent = new Promise(resolve => window.addEventListener('message', e => {
    if (e.origin === location.origin && e.data === 'trace-fresh-ok') resolve();
  }, {once:true}));
  const other = window.open('/?fresh', '_blank');
  expect(other, 'New test tab did not open');
  await independent; other.close();
  $('go').click();
  await wait(() => !$('go').disabled && !$('edit').hidden, 'Could not retrace the restored source file');
  expect(countMidpoints(await downloaded()) === 2, 'Re-tracing should use the original upload');
}

async function run() {
  const images = [];
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="1216" height="1216" viewBox="0 0 120 120">' +
    '<path d="M12 12 L60 12 L108 12 L108 44 L12 44 Z"/><path d="M12 76 L60 76 L108 76 L108 108 L12 108 Z"/></svg>';
  await runTraceBrowser(exercise, async (req, body) => {
    assert.equal(req.url,'/online-quote/svg-trace/convert');
    assert.equal(req.headers['x-csrf-token'],'test-token');
    const form = await new Response(body, {headers:{'Content-Type':req.headers['content-type']}}).formData();
    const file = form.get('image');
    assert.equal(file.name,'two-parts.png');
    assert.equal(form.get('preset'),'font');
    images.push(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'));
    return {svg:source,width:1216,height:1216,duration_ms:10};
  });
  assert.equal(images.length,2, 'Only explicit convert and retrace should upload the image');
  assert.equal(images[0],images[1], 'The original file must be byte-identical after two reloads');
  console.log('Box selection, grouped history, unsaved editor refresh, SVG export, independent tab and original raster retrace passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
