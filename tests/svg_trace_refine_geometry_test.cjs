const assert = require('node:assert/strict');
const { apply, candidates, createReviewer, defaultTolerance } = require('../svg-trace/public/assets/refine-geometry.js');

function lines(nodes, closed = false) {
  return { closed, nodes, segs: Array.from({length:nodes.length - (closed ? 0 : 1)}, () => ({t:'L'})) };
}
const edit = (action,index) => ({action,index});

const crease = lines([[0,0],[20,.02],[40,0],[60,.03],[80,0]]);
const snapshot = structuredClone(crease);
const cleanup = apply(crease,[edit('remove',1),edit('remove',2),edit('remove',3),edit('remove',1)]);
assert.deepEqual(cleanup.contour, lines([[0,0],[80,0]]));
assert.deepEqual(cleanup.applied.map(c => c.index),[1,2,3]);
assert.equal(cleanup.skipped.length,1);
assert.deepEqual(crease,snapshot);
assert.deepEqual(cleanup.applied[0].before.nodes,crease.nodes.slice(0,3));
assert.deepEqual(cleanup.applied[0].after.nodes,[crease.nodes[0],crease.nodes[2]]);
assert.deepEqual(cleanup.applied.map(c=>c.point),crease.nodes.slice(1,4));

const turn = lines([[0,0],[10,0],[10,10]]);
assert.equal(apply(turn,[edit('smooth',1),edit('remove',1),edit('remove',0)]).applied.length,0);
const gentle = lines([[0,0],[10,0],[20,1]]);
const softened = apply(gentle,[edit('smooth',1)]);
assert.equal(softened.applied.length,1);
assert.deepEqual(softened.contour.nodes,gentle.nodes);
assert.deepEqual(softened.contour.segs.map(s=>s.t),['C','C']);
const [a,b] = softened.contour.segs;
const [x,y] = gentle.nodes[1];
assert(Math.abs((x-a.c2[0])*(b.c1[1]-y) - (y-a.c2[1])*(b.c1[0]-x)) < 1e-9);
assert.equal(apply(gentle,[edit('smooth',0),edit('smooth',2)]).applied.length,0);

const nearlyStraight = {closed:false,nodes:[[0,0],[25,0]],segs:[{t:'C',c1:[7,.02],c2:[18,-.02]}]};
assert.equal(apply(nearlyStraight,[edit('straighten',0)]).contour.segs[0].t,'L');
const bow = {...nearlyStraight, segs:[{t:'C',c1:[7,9],c2:[18,9]}]};
assert.equal(apply(bow,[edit('straighten',0)]).applied.length,0);

// Two exactly split cubic halves should simplify back to one shaped cubic.
const rounded = {closed:false,nodes:[[0,0],[10,7.5],[20,0]],segs:[
  {t:'C',c1:[0,5],c2:[5,7.5]}, {t:'C',c1:[15,7.5],c2:[20,5]}]};
const reunion = apply(rounded,[edit('remove',1)]);
assert.equal(reunion.contour.nodes.length,2);
assert.equal(reunion.contour.segs[0].t,'C');
assert(Math.abs(reunion.contour.segs[0].c1[1]-10)<1e-6);
assert(Math.abs(reunion.contour.segs[0].c2[1]-10)<1e-6);

// Closed wrapping index zero, sharp corners, and the last points of small loops.
const ring = lines([[10,0],[20,0],[20,20],[0,20],[0,0]],true);
const wrap = apply(ring,[edit('remove',0),edit('remove',1)]);
assert.deepEqual(wrap.contour, lines([[20,0],[20,20],[0,20],[0,0]],true));
const dot = lines([[2,3],[6,3],[3,7]],true);
assert.deepEqual(apply(dot,[edit('remove',1)]).contour,dot);

// A nearly straight edit beside a thin neighbouring contour must be held back.
const hole = lines([[9.8,-.02],[10.2,-.02],[10.2,.02],[9.8,.02]],true);
assert.equal(apply(gentle,[edit('smooth',1)],{obstacles:[hole]}).applied.length,0);
assert.equal(candidates(gentle,{obstacles:[hole]}).length,0);
const far = lines([[80,60],[90,70]]);
assert.equal(apply(gentle,[edit('smooth',1)],{obstacles:[far]}).applied.length,1);
const crosses = lines([[0,0],[10,.02],[20,0],[35,20],[12,20],[12,-5]]);
assert.equal(apply(crosses,[edit('remove',1)]).applied.length,0);

// Original SVG arcs are preserved as authored. They also protect nearby strokes.
const arc = {t:'A',rx:2,ry:2,rot:0,large:0,sweep:1};
const arched = {closed:false,nodes:[[8,2],[12,2]],segs:[arc]};
assert.equal(apply(arched,[edit('straighten',0)]).applied.length,0);
assert.equal(apply(gentle,[edit('smooth',1)],{obstacles:[arched]}).applied.length,0);

const available = candidates(crease);
assert(available.some(c => c.action==='remove'));
assert.equal(candidates(crease,{limit:1}).length,1);
assert.equal(defaultTolerance(crease),.12);
const reviewer = createReviewer(crease);
for (const option of reviewer.candidates()) {
  const view = reviewer.preview(option);
  assert.deepEqual(view,apply(crease,[option]).applied[0]);
}
assert.equal(reviewer.preview(edit('smooth',-1)),null);
assert.equal(reviewer.preview(edit('remove',1.2)),null);
const long = lines(Array.from({length:1200},(_,i)=>[2*i,24*Math.sin(i*.06)]));
const many = candidates(long);
const batch = apply(long,many);
assert(many.length>1000 && batch.applied.length>800);
assert.deepEqual(batch.contour.nodes[0],long.nodes[0]);
assert.deepEqual(batch.contour.nodes.at(-1),long.nodes.at(-1));
console.log('Local node edits, guarded batch refinement, counters and arc clearance passed.');
