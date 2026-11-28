const assert = require('node:assert/strict');
const { apply, candidates, createReviewer, defaultTolerance, createRasterGuide } = require('../svg-trace/public/assets/refine-geometry.js');

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

function raster(w,h,rgba,box=[0,0,w,h]) {
  const data=new Uint8ClampedArray(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) data.set(rgba(x,y),(y*w+x)*4);
  return createRasterGuide({width:w,height:h,data},box);
}
// The real Font trace uses four SVG units per bitmap pixel. A hand-moved
// corner remains two straight segments meeting at the original image corner.
const black=[0,0,0,255], white=[255,255,255,255];
const ref=raster(256,144,(x,y)=>x>=24 && x<136 && y>=30 && y<110 ? black : white,[0,0,1024,576]);
const displaced=lines([[111,131],[95,438],[542,438],[542,119]],true);
const fix=createReviewer(displaced,{guide:ref}).candidates();
assert.deepEqual(fix.map(({action,index})=>[action,index]),[['align',0]]);
assert(fix[0].improvement>2 && Math.hypot(fix[0].geometry.to[0]-96,fix[0].geometry.to[1]-120)<.3);
const repaired=apply(displaced,fix,{guide:ref});
assert.deepEqual(repaired.contour.segs,displaced.segs);
assert.deepEqual(repaired.contour.nodes.slice(1),displaced.nodes.slice(1));
assert.deepEqual(apply(displaced,JSON.parse(JSON.stringify(fix))).contour,repaired.contour,
  'A saved review can be applied after restoring the tab');
assert.equal(createReviewer(repaired.contour,{guide:ref}).preview(edit('align',0)),null);
const nearbyHole=lines([[97,122],[100,122],[100,132],[97,132]],true);
assert.equal(apply(displaced,fix,{guide:ref,obstacles:[nearbyHole]}).applied.length,0);
assert.equal(apply(displaced,[{action:'align',index:0,geometry:{to:[408,400]}}]).applied.length,0);
assert.equal(apply(displaced,[{action:'fit',index:0,geometry:{c1:[NaN,100],c2:[100,300]}}]).applied.length,0);
assert.equal(createReviewer({...displaced,closed:false,segs:displaced.segs.slice(1)},{guide:ref}).preview(edit('align',1)),null);

// A bowed solid edge is visibly different from the straight segment of
// its trace. Fitting its handles preserves the endpoints and the three
// other segments, and reproduces the measured bend within half a pixel.
const bowed=raster(160,128,(x,y)=>{
  const t=(x+.5-20)/100, top=20+14*t*(1-t);
  const coverage=t<0 || t>1 || y>=92 ? 0 : Math.min(1,Math.max(0,y+1-top));
  const v=Math.round(255*(1-coverage)); return [v,v,v,255];
});
const rectangle=lines([[20,20],[120,20],[120,92],[20,92]],true);
const fitted=createReviewer(rectangle,{guide:bowed}).preview(edit('fit',0));
assert(fitted && fitted.improvement>2);
const {c1,c2}=fitted.geometry;
assert(Math.abs(.125*20+.375*(c1[1]+c2[1])+.125*20-23.5)<.5);
const shaped=apply(rectangle,[fitted],{guide:bowed}).contour;
assert.deepEqual(shaped.nodes,rectangle.nodes);
assert.deepEqual(shaped.segs.slice(1),rectangle.segs.slice(1));
assert.equal(createReviewer(shaped,{guide:bowed}).preview(edit('fit',0)),null);
assert.equal(createReviewer({...rectangle,segs:[{t:'A',rx:60,ry:40,rot:0,large:0,sweep:0},...rectangle.segs.slice(1)]},
  {guide:bowed}).preview(edit('fit',0)),null);

const lowContrast=raster(160,128,(x,y)=>y<23?[240,240,240,255]:[245,245,245,255]);
assert.equal(createReviewer(rectangle,{guide:lowContrast}).candidates().length,0);
const stripe=raster(60,60,(x,y)=>y>=27&&y<33?black:white);
assert.equal(stripe.match([28,30],[1,0],5),null,'Do not choose arbitrarily between two equally likely edges');
const transparent=raster(30,40,(_x,y)=>[255,255,255,y>=20?255:0]);
assert(Math.abs(transparent.match([15,18],[1,0]).point[1]-20)<.2);
console.log('Raster-matched corners, editable cubic fitting, dimensions, transparency, weak and ambiguous edges passed.');
