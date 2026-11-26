const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/neon-fonts.js');
require('../public/assets/js/neon-geometry.js');
const geometry = globalThis.NeonGeometry;
const clipper = require('../public/assets/js/neon-clipper.js');

const spec = {text:'Hello Hello\nHello',font:'signature',widthMm:1000,align:'center',
  letterSpacing:0,lineSpacing:1.25,backing:'clear',boardShape:'contour',boardGap:30,mount:'wall'};

test('row panel blends into the lettering without cutting away acrylic', () => {
  const drawing=geometry.layout(spec), board=geometry.backboard(drawing,spec);
  assert.equal(board.outlines.length,1);
  const outline=board.outlines[0];
  // The photographed ledge occurred at this joint on the exact example.
  // Do not allow its former near-reversal, while retaining the broad panel.
  let sharpInwardTurns=0;
  for(let i=0;i<outline.length;i++) {
    const a=outline[(i+outline.length-1)%outline.length],b=outline[i],c=outline[(i+1)%outline.length];
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
    const size=Math.hypot(ux,uy)*Math.hypot(vx,vy);
    if (b[0]>300 && b[0]<350 && b[1]>245 && b[1]<285 && size &&
        (ux*vx+uy*vy)/size<.5 && ux*vy-uy*vx<0) sharpInwardTurns++;
  }
  assert.equal(sharpInwardTurns,0);
  const lower=drawing.runs.flatMap((run,index)=>drawing.runWords[index].startsWith('1:')?run:[]);
  const upper=drawing.runs.flatMap((run,index)=>drawing.runWords[index].startsWith('0:')?run:[]);
  const middle=(Math.max(...upper.map(p=>p[1]))+Math.min(...lower.map(p=>p[1])))/2;
  const crossings=[];
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    if ((a[1]-middle)*(b[1]-middle)<0) crossings.push(a[0]+(b[0]-a[0])*(middle-a[1])/(b[1]-a[1]));
  }
  crossings.sort((a,b)=>a-b);
  assert.equal(crossings.length,2);
  assert.ok(crossings[1]-crossings[0] >= .9*(Math.max(...lower.map(p=>p[0]))-Math.min(...lower.map(p=>p[0]))));

  // The local blend is additive: it cannot remove the underlying acrylic.
  const reference={...drawing};
  Object.defineProperty(reference,'runs',{value:drawing.runs});
  const initial=geometry.backboard(reference,spec);
  const asPaths=shape=>shape.outlines.map(path=>path.map(([x,y])=>({X:Math.round(x*100),Y:Math.round(y*100)})));
  const difference=new clipper.Clipper(),missing=[];
  difference.AddPaths(asPaths(initial),clipper.PolyType.ptSubject,true);
  difference.AddPaths(asPaths(board),clipper.PolyType.ptClip,true);
  difference.Execute(clipper.ClipType.ctDifference,missing,clipper.PolyFillType.pftNonZero,clipper.PolyFillType.pftNonZero);
  assert.ok(missing.reduce((area,path)=>area+Math.abs(clipper.Clipper.Area(path)),0)/10000 < .1);
});

test('single-line acrylic remains unchanged and exported outline matches the preview', () => {
  const drawing=geometry.layout({...spec,text:'Hello',widthMm:600});
  const reference={...drawing};Object.defineProperty(reference,'runs',{value:drawing.runs});
  assert.deepEqual(geometry.backboard(drawing,spec).outlines,geometry.backboard(reference,spec).outlines);

  const art=geometry.layout(spec), board=geometry.backboard(art,spec);
  const groups=geometry.dxf(art,spec).trim().split(/\r?\n/);
  const paths=[];let path=null,kind='';
  for(let i=0;i<groups.length;i+=2) {
    const code=Number(groups[i]),value=groups[i+1];
    if(code===0){kind=value;if(kind==='POLYLINE'){path={layer:'',points:[]};paths.push(path);}else if(kind!=='VERTEX')path=null;}
    if(!path)continue;
    if(kind==='POLYLINE'&&code===8)path.layer=value;
    if(kind==='VERTEX'&&code===10)path.points.push([Number(value)]);
    if(kind==='VERTEX'&&code===20)path.points.at(-1).push(Number(value));
  }
  const acrylic=paths.filter(path=>path.layer==='ACRYLIC_OUTLINE');
  assert.equal(acrylic.length,board.outlines.length);
  for(let i=0;i<acrylic.length;i++) {
    assert.equal(acrylic[i].points.length,board.outlines[i].length);
    for(let j=0;j<acrylic[i].points.length;j++) {
      assert.ok(Math.abs(acrylic[i].points[j][0]-board.outlines[i][j][0])<.00011);
      assert.ok(Math.abs(acrylic[i].points[j][1]-(art.heightMm-board.outlines[i][j][1]))<.00011);
    }
  }
});
