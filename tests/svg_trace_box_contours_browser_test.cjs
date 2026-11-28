'use strict';
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (ok, message) => { if (!ok) throw Error(message); };
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path id="compound" d="M10 10 H25 V25 H10 Z M40 10 H65 V25 H40 Z"/>' +
    '<path id="line" d="M10 65 L18 70 L25 65" fill="none" stroke="black"/>' +
    '<path id="redundant" d="M40 65 L55 65 L70 65 L70 80 L40 80 Z"/></svg>';
  $('ws').dispatchEvent(new CustomEvent('st:result',{detail:{text:source}}));
  $('edit').click();
  $('ed-box-select').click();
  const svg = $('ed-svg');
  const visiblePaths = () => [...svg.querySelectorAll('.ed-path')]
    .filter(el => el.style.display !== 'none').map(el => el.getAttribute('d'));
  const original = visiblePaths();
  function drag(x1,y1,x2,y2,add,pointerType) {
    for (const [type,x,y] of [['pointerdown',x1,y1],['pointermove',x2,y2],['pointerup',x2,y2]]) {
      const point = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
      svg.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,buttons:type === 'pointerup' ? 0 : 1,
        isPrimary:true,pointerType,pointerId:1,shiftKey:add,clientX:point.x,clientY:point.y}));
    }
  }
  const selected = () => svg.querySelectorAll('.ed-box-selected').length;
  drag(5,5,30,75,false,'touch'); // All of the left closed contour and the separate open line.
  drag(38,7,42,28,true,'pen'); // Two of four anchors of the adjacent closed contour.
  drag(52,62,58,68,true,'mouse'); // One removable point on the lower right shape.
  expect(selected() === 10,'Expected ten selected points across four contours');
  svg.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
  const edited = visiblePaths();
  expect(edited.length === 2 && edited[0].match(/M/g).length === 1 && !edited[0].includes('M10'),
    'The first contour and the whole open path should disappear');
  expect(!edited[1].includes('55') && selected() === 2,
    'The redundant point should disappear and the two protected points should stay selected');
  drag(62,7,68,28,true,'pen');
  expect(selected() === 4,'Remaining protected points must still reference their reindexed contour');
  $('ed-delete').click();
  expect(visiblePaths().length === 1,'Selecting the rest of the contour should allow removal');
  $('ed-undo').click();
  expect(visiblePaths().join('|') === edited.join('|'),'Undo should restore the neighboring contour');
  $('ed-undo').click();
  expect(visiblePaths().join('|') === original.join('|') && selected() === 10,
    'One grouped Undo should restore the compound path, open path, edited anchors and selection');
  $('ed-redo').click();
  $('ed-apply').click();
  const xml = await (await fetch($('download').href)).text();
  const doc = new DOMParser().parseFromString(xml,'image/svg+xml');
  expect(!doc.getElementById('line') && doc.querySelectorAll('path').length === 2,
    'The exported SVG should omit the fully deleted path');
  expect(doc.getElementById('compound').getAttribute('d') === edited[0] &&
    doc.getElementById('redundant').getAttribute('d') === edited[1],
    'The exported compound contour and partial point deletion must match the editor');
}

runTraceBrowser(exercise, () => { throw Error('Editing these contours should run locally'); })
  .then(() => console.log('Whole-contour deletion, protected anchors, grouped Undo and SVG export passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
