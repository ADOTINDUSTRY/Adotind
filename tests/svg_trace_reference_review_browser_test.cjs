'use strict';

const assert = require('node:assert/strict');
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (condition, message) => { if (!condition) throw Error(message); };
  const wait = async (check, message) => {
    for (let attempt=0; attempt<150; attempt++) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error(message + ' (' + $('ed-refine-status').textContent + ')');
  };
  const paths = () => Array.from(document.querySelectorAll('#ed-svg .ed-path'), p => p.getAttribute('d'));
  const clickDrawing = element => {
    const rect = element.getBoundingClientRect();
    const pointer = {bubbles:true, button:0, pointerId:1, clientX:rect.x+rect.width/2, clientY:rect.y+rect.height/2};
    element.dispatchEvent(new PointerEvent('pointerdown', pointer));
    $('ed-svg').dispatchEvent(new PointerEvent('pointerup', pointer));
  };
  const stageKey = 'test-reference-review-stage';
  await wait(() => $('ws').dataset.draftReady === '1', 'Reload did not restore the workspace');
  if (!sessionStorage.getItem(stageKey)) {
    if ($('auto').checked) $('auto').click();
    $('preset').value = 'font'; $('preset').dispatchEvent(new Event('change'));
    const canvas = document.createElement('canvas');
    canvas.width=256; canvas.height=144;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='white'; ctx.fillRect(0,0,256,144);
    ctx.fillStyle='#222'; ctx.fillRect(24,30,112,80); ctx.fillRect(180,40,42,60);
    const file = await new Promise(resolve => canvas.toBlob(resolve));
    const files = new DataTransfer();
    files.items.add(new File([file],'two-blocks.png',{type:'image/png'}));
    $('file').files = files.files;
    $('file').dispatchEvent(new Event('change',{bubbles:true}));
    $('go').click();
    await wait(() => !$('edit').hidden,'Conversion did not return a trace');
    $('edit').click();
    await wait(() => paths().length === 2,'Trace did not open in point editor');
    clickDrawing(document.querySelector('.ed-path'));
    clickDrawing(document.querySelector('.ed-node[data-ni="0"]'));
    expect($('ed-refine-scope').value === 'auto', 'The canvas selection should set review scope automatically');
    $('ed-refine-instruction').value='Put the misplaced top left corner back on the black rectangle, keeping the adjoining edges straight.';
    sessionStorage.setItem('test-reference-originals',JSON.stringify(paths()));
    $('ed-refine-run').click();
    await wait(() => !$('ed-refine-review').hidden && !$('ed-refine-apply').disabled,'No usable source-alignment suggestion');
    expect(document.querySelector('#ed-svg .ed-review-overlay path'), 'No on-canvas proposed outline');
    const detail=$('ed-refine-detail');
    expect(detail.viewBox.baseVal.width < 256, 'The corner close-up should frame the error and adjoining edges');
    document.querySelector('[data-detail="original"]').click();
    expect(detail.querySelector('image') && !detail.querySelector('path'), 'Original close-up should show just the source artwork');
    document.querySelector('[data-detail="before"]').click();
    const currentDetail=detail.querySelector('path')?.getAttribute('d');
    document.querySelector('[data-detail="after"]').click();
    const proposedDetail=detail.querySelector('path')?.getAttribute('d');
    expect(currentDetail && proposedDetail && currentDetail!==proposedDetail,'Close-up should reveal a different proposed edge');
    expect(JSON.stringify(paths()) === sessionStorage.getItem('test-reference-originals'), 'Review altered the trace before approval');
    sessionStorage.setItem(stageKey,'restore');
    location.reload(); return false;
  }
  const before=JSON.parse(sessionStorage.getItem('test-reference-originals'));
  expect(!$('ed').hidden && !$('ed-refine-review').hidden, 'Source-aware suggestion was lost on refresh');
  expect(paths().every((d,i)=>d===before[i]), 'Reload changed the unapproved paths');
  $('ed-refine-apply').click();
  const after=paths();
  expect(after[0]!==before[0] && after[1]===before[1], 'Applying the point correction must only touch its contour');
  const coordinates = d => {
    const points=[...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/gi)].map(m=>[+m[1],+m[2]]);
    if (points.length>1 && Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.001) points.pop();
    return points;
  };
  const current=coordinates(after[0]);
  const original=coordinates(before[0]);
  const cornerError=Math.hypot(current[0][0]-96,current[0][1]-120);
  expect(cornerError<=7, 'New corner misses its source by '+cornerError+' SVG units (four units per bitmap pixel)');
  expect(original.slice(1,4).every((p,i)=>current[i+1] && Math.hypot(current[i+1][0]-p[0],current[i+1][1]-p[1])<.01),
    'Unselected corners moved');
  $('ed-undo').click();
  expect(paths()[0] === before[0] || JSON.stringify(coordinates(paths()[0]))===JSON.stringify(original),'Undo did not restore faulty corner');
  $('ed-redo').click(); $('ed-apply').click();
  const svg = await (await fetch($('download').href)).text();
  const exported = [...new DOMParser().parseFromString(svg,'image/svg+xml').querySelectorAll('path')].map(p=>p.getAttribute('d'));
  expect(exported[0]===after[0] && JSON.stringify(coordinates(exported[1]))===JSON.stringify(coordinates(after[1])),
    'Downloaded SVG must contain approved source alignment and preserve the neighbor');
  $('edit').click(); $('ed-box-select').click();
  const drawing=$('ed-svg');
  function box(x,y,shiftKey) {
    function pointer(type,dx,dy) {
      const point=new DOMPoint(x+dx,y+dy).matrixTransform(drawing.getScreenCTM());
      drawing.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,buttons:type==='pointerup'?0:1,
        pointerType:'mouse', isPrimary:true, pointerId:1, shiftKey, clientX:point.x, clientY:point.y}));
    }
    pointer('pointerdown',-10,-10); pointer('pointermove',10,10); pointer('pointerup',10,10);
  }
  box(current[0][0],current[0][1],false); box(733,170,true);
  expect(drawing.querySelectorAll('.ed-box-selected').length===2,'Shift-drag did not add a point from the second shape');
  $('ed-refine-run').click();
  await wait(() => !$('ed-refine-review').hidden && !$('ed-refine-apply').disabled, 'Boxed anchors could not be reviewed');
  $('ed-refine-all').click();
  const boxed=paths(), restoredNeighbor=coordinates(boxed[1]);
  expect(boxed[0]===after[0],'Box review changed an already corrected contour');
  expect(Math.hypot(restoredNeighbor[0][0]-720,restoredNeighbor[0][1]-160)<=7,'The boxed corner of the second shape was not aligned');
  $('ed-undo').click();
  if ($('ed-box-select').getAttribute('aria-pressed')==='true') $('ed-box-select').click();
  clickDrawing(document.querySelectorAll('.ed-path')[1]);
  clickDrawing(document.querySelector('.ed-node[data-ni="0"]'));
  const prior=paths();
  $('ed-refine-run').click();
  await wait(() => !$('ed-refine-review').hidden && !$('ed-refine-apply').disabled,'No measured alternative after AI returned no edits');
  const description=$('ed-refine-status').textContent+' '+$('ed-refine-reason').textContent;
  expect(/image comparison|locally measured|measured.*(?:image|original)|(?:image|original).*measured/i.test(description),'Measured alternative needs an explicit source label');
  expect(paths().every((d,i)=>d===prior[i]),'The image comparison must wait for approval');
  $('ed-refine-apply').click();
  const replacement=coordinates(paths()[1])[0];
  expect(Math.hypot(replacement[0]-720,replacement[1]-160)<=7,'The independently measured change could not be applied');
}

async function run() {
  // The lettering preset traces a 256 x 144 bitmap in a 1024 x 576 SVG.
  // The two top-left corners are displaced. Only the first is selected initially.
  const bad = 'M111 131L95 438L542 438L542 119Z', neighbor = 'M733 170L720 400L888 400L888 160Z';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576"><path fill="#222" d="'+bad+'"/><path fill="#222" d="'+neighbor+'"/></svg>';
  let reviews=0;
  await runTraceBrowser(exercise,async (req,body)=>{
    if (req.url.endsWith('/convert')) return {svg,width:256,height:144,duration_ms:1};
    assert.equal(req.url,'/online-quote/svg-trace/ai');
    const data=JSON.parse(body); reviews++;
    assert.equal(data.mode,'review');
    assert.match(data.image,/^\/9j\//,'Original artwork was missing from AI review');
    assert.ok(data.overlay,'Review must also show the traced outline to the model');
    if (reviews===3) {
      assert.equal(data.contours.length,1);
      assert.deepEqual(data.contours[0].focus,{type:'node',index:0});
      assert.ok(data.contours[0].candidates.some(edit=>edit.index===0 && edit.action==='align'));
      return {summary:'I have no edits to propose.',proposals:[]};
    }
    if (reviews===2) {
      assert.equal(data.contours.length,2, 'The additive box selection spans two shapes');
      for (const c of data.contours) assert.deepEqual(c.selected,[0], 'Box scope must send only selected anchors');
      const neighbor=data.contours[1];
      assert.ok(neighbor.candidates.some(edit=>edit.action==='align' && edit.index===0));
      return {summary:'The second corner still misses its edge.',proposals:[{id:neighbor.id,edits:[
        {index:0,action:'align',reason:'Place the boxed corner on its original boundary.'},
        {index:1,action:'remove',reason:'Out-of-selection suggestion that must be ignored.'}]}]};
    }
    assert.equal(data.contours.length,1,'Point scope included unrelated contours');
    const contour=data.contours[0];
    assert.deepEqual(contour.focus,{type:'node',index:0});
    assert.ok(contour.candidates.some(edit=>edit.index===0 && edit.action==='align'),'Source edge detection failed to find the offset corner');
    return {summary:'The top left corner is offset from the dark rectangle.',proposals:[{id:contour.id,
      edits:[{index:0,action:'align',reason:'Restore the rectangular corner in the original.'}]}]};
  });
  assert.equal(reviews,3,'Only the three explicit reviews should send an AI request');
  console.log('Point/box scope, scaled artwork, close-up comparison, refresh, undo, SVG export and no-proposal image fallback passed.');
}
run().catch(e=>{ console.error(e); process.exitCode=1; });
