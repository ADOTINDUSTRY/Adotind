(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonAcuteFit = factory();
})(globalThis, function () {
'use strict';

// Experimental correction for ONE free-ended flourish meeting a straight,
// connected stem in a sharp return. It is not a manufacturing proof. A caller
// must validate the complete proposed artwork and may reject it for any reason.
const EPS = 1e-9;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const round4 = n => Math.round(n*10000)/10000;
const cad = (p,h) => [round4(p[0]),round4(h-p[1])];
function length(points) { let d=0; for(let i=1;i<points.length;i++) d+=distance(points[i-1],points[i]); return d; }
function pointDistance(p,a,b) {
  const x=b[0]-a[0],y=b[1]-a[1],d=x*x+y*y;
  const t=d ? Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/d)) : 0;
  return Math.hypot(p[0]-a[0]-x*t,p[1]-a[1]-y*t);
}
function orientation(a,b,c) { return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }
function segmentDistance(a,b,c,d) {
  const ab1=orientation(a,b,c),ab2=orientation(a,b,d),cd1=orientation(c,d,a),cd2=orientation(c,d,b);
  if(ab1*ab2<=0 && cd1*cd2<=0 && Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+EPS && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+EPS) return 0;
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function clearance(a,b) { let min=Infinity; for(let i=1;i<a.length;i++) for(let j=1;j<b.length;j++) min=Math.min(min,segmentDistance(a[i-1],a[i],b[j-1],b[j])); return min; }
function bounds(run) { let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const [x,y] of run){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {left,right,top,bottom}; }
function boxesNear(a,b,limit) { return a.left<=b.right+limit && b.left<=a.right+limit && a.top<=b.bottom+limit && b.top<=a.bottom+limit; }
function cumulative(run) { const out=[0]; for(let i=1;i<run.length;i++) out.push(out[i-1]+distance(run[i-1],run[i])); return out; }
function at(run,dist,t) { if(t<=0)return [...run[0]]; for(let i=1;i<run.length;i++) if(dist[i]>=t){ const f=(t-dist[i-1])/(dist[i]-dist[i-1]);return [0,1].map(k=>run[i-1][k]+f*(run[i][k]-run[i-1][k])); }return [...run.at(-1)]; }
function bezier(p0,p1,p2,p3,count=80) {
  return Array.from({length:count+1},(_,i)=>{const t=i/count,s=1-t;return [0,1].map(k=>s*s*s*p0[k]+3*s*s*t*p1[k]+3*s*t*t*p2[k]+t*t*t*p3[k]);});
}
function repairAcuteFlourish(art, runIndex, validateComplete, options={}) {
  if(!art?.valid || !Array.isArray(art.runs) || !Array.isArray(art.paths) || art.paths.length !== art.runs.length || !Number.isInteger(runIndex) || typeof validateComplete!=='function') throw new TypeError('Artwork, run index and complete-artwork validator are required.');
  const original=art.runs[runIndex];
  if(!original || original.length<3 || original.length>1500 || !Number.isFinite(art.widthMm) || !Number.isFinite(art.heightMm)) return {applied:false,reason:'unsupported_artwork'};
  const all=art.runs, neighborBounds=all.map(bounds), endpointConnected=p=>all.some((run,i)=>i!==runIndex && (distance(p,run[0])<.01 || distance(p,run.at(-1))<.01));
  let run=original.map(p=>[...p]);
  const first=endpointConnected(run[0]),last=endpointConnected(run.at(-1));
  if(first===last) return {applied:false,reason:'requires_one_free_end'};
  if(first) run.reverse();
  const cum=cumulative(run),total=cum.at(-1), corners=[];
  for(let i=1;i<run.length-1;i++){
    const a=run[i-1],b=run[i],c=run[i+1],ab=distance(a,b),bc=distance(b,c);
    if(ab<.05||bc<.05) continue;
    const dot=((a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1]))/(ab*bc);
    if(dot>Math.SQRT1_2+1e-8) corners.push(i);
  }
  if(corners.length!==1) return {applied:false,reason:'requires_one_sharp_corner'};
  const apex=cum[corners[0]],left=Math.floor((apex+1e-7)/25)*25,right=Math.floor((total-apex+1e-7)/25)*25;
  if(left<25||right<25||(left+right)/total < .72) return {applied:false,reason:'too_much_artwork_removed'};
  const q=at(run,cum,total-right),B=run.at(-1),stem=[q,...run.filter((_,i)=>cum[i]>total-right+EPS)];
  if(stem.some(p=>pointDistance(p,q,B)>.04)) return {applied:false,reason:'stem_not_straight'};
  const stemCad=stem.map(p=>cad(p,art.heightMm));
  if(Math.abs(length(stemCad)-right)>.001) return {applied:false,reason:'stem_rounding'};
  const dir=[(B[0]-q[0])/right,(B[1]-q[1])/right],n=[-dir[1],dir[0]];
  if(orientation(q,B,run[0])<0){n[0]*=-1;n[1]*=-1;}
  // Leave a tiny digital tolerance so coordinate rounding never dips below 10 mm.
  const p3=[q[0]+16.0003*n[0],q[1]+16.0003*n[1]],free=run[0],freeDx=distance(free,p3);
  if(freeDx<EPS) return {applied:false,reason:'degenerate'};
  const towards=[(p3[0]-free[0])/freeDx,(p3[1]-free[1])/freeDx],startLen=distance(run[0],run[1]),startDir=[(run[1][0]-run[0][0])/startLen,(run[1][1]-run[0][1])/startLen];
  const tip=at(run,cum,left),prior=at(run,cum,Math.max(0,left-1)),baseAngle=Math.atan2(tip[1]-prior[1],tip[0]-prior[0]);
  const maxShift=Math.max(0,Math.min(options.maxShiftMm ?? 10,10,art.widthMm*.02)),maxChecks=Math.max(0,Math.min(options.maxChecks ?? 6000000,6000000));
  let checks=0,best=null;
  const fail=reason=>({applied:false,reason});
  // The search is bounded by an explicit operation count, not wall time, so
  // identical design settings produce identical browser/server results.
  for(let shift=0;shift<=maxShift+.01;shift+=.5){
    const p0=[free[0]+shift*towards[0],free[1]+shift*towards[1]];
    for(let angle=-90;angle<=90;angle+=15){
      const theta=baseAngle+angle*Math.PI/180,u=[Math.cos(theta),Math.sin(theta)];
      for(let b=2;b<=Math.min(left,50);b+=2){
        const p2=[p3[0]-b*u[0],p3[1]-b*u[1]];
        const make=a=>{checks+=81;return bezier(p0,[p0[0]+a*startDir[0],p0[1]+a*startDir[1]],p2,p3);};
        let lo=0,hi=left*2;if(length(make(lo).map(p=>cad(p,art.heightMm)))>left || length(make(hi).map(p=>cad(p,art.heightMm)))<left)continue;
        for(let k=0;k<18;k++){if(checks>maxChecks)return best?{...best,searchTruncated:true}:fail('search_limit');const a=(lo+hi)/2;if(length(make(a).map(p=>cad(p,art.heightMm)))<left)lo=a;else hi=a;}
        const a=(lo+hi)/2,p1=[p0[0]+a*startDir[0],p0[1]+a*startDir[1]],curve=make(a),rounded=curve.map(p=>cad(p,art.heightMm));
        if(Math.abs(length(rounded)-left)>.001 || curve.some(p=>p[0]<3||p[1]<3||p[0]>art.widthMm-3||p[1]>art.heightMm-3))continue;
        checks+=curve.length*stem.length;
        if(checks>maxChecks)return best?{...best,searchTruncated:true}:fail('search_limit');
        if(clearance(rounded,stemCad)<16 || Math.abs(distance(rounded.at(-1),stemCad[0])-16)>.0008)continue;
        // Reject loops, sudden reversals and local bends tighter than an 8 mm centreline radius.
        let unsuitable=false;for(let i=1;i<curve.length-1;i++){const x=curve[i-1],y=curve[i],z=curve[i+1],ab=distance(x,y),bc=distance(y,z),ca=distance(z,x),cross=Math.abs(orientation(x,y,z));if(ab<.01||bc<.01||((y[0]-x[0])*(z[0]-y[0])+(y[1]-x[1])*(z[1]-y[1]))<0 || (cross>1e-7 && ab*bc*ca/(2*cross)<7.95)){unsuitable=true;break;}}
        // Prevent an intermediate loop and limit the change over the whole flourish.
        checks+=curve.length*curve.length/2;
        if(checks>maxChecks)return best?{...best,searchTruncated:true}:fail('search_limit');
        if(!unsuitable){outer:for(let i=1;i<rounded.length;i++)for(let j=i+2;j<rounded.length;j++)if(segmentDistance(rounded[i-1],rounded[i],rounded[j-1],rounded[j])<1e-7){unsuitable=true;break outer;}}
        const maxDeviation=Math.min(20,art.widthMm*.03);
        if(unsuitable||curve.some((p,i)=>distance(p,at(run,cum,left*i/(curve.length-1)))>maxDeviation))continue;
        const box=bounds(curve),neighbors=all.map((other,i)=>({other,i})).filter(({i})=>i!==runIndex && boxesNear(box,neighborBounds[i],16));
        checks += curve.length * neighbors.reduce((sum,{other})=>sum+other.length,0);
        if(checks>maxChecks)return best?{...best,searchTruncated:true}:fail('search_limit');
        if(neighbors.some(({other})=>clearance(curve,other)<16))continue;
        const score=shift+distance(p3,tip)*.15;
        if(best && score>=best.score)continue;
        const paths=art.paths.map(p=>({...p})),runs=all.map(r=>r.map(p=>[...p]));
        const pathBase={...paths[runIndex]},fmt=p=>p.map(n=>round4(n)).join(' ');
        // Preview and CAD use the same sampled line segments, not different
        // cubic and polyline geometries with different measured lengths.
        paths.splice(runIndex,1,{...pathBase,d:curve.map((p,i)=>(i?'L':'M')+fmt(p)).join('')},{...pathBase,d:'M'+fmt(q)+stem.slice(1).map(p=>'L'+fmt(p)).join('')});
        runs.splice(runIndex,1,curve,stem);
        const proposed={...art,paths,lengthMm:art.lengthMm-length(original)+left+right};Object.defineProperty(proposed,'runs',{value:runs});
        // Reserve deterministic budget for the caller's complete-artwork check.
        checks+=250000;
        if(checks>maxChecks)return best?{...best,searchTruncated:true}:fail('search_limit');
        if(validateComplete(proposed)!==true)continue;
        best={applied:true,artwork:proposed,score,startShiftMm:shift,leftMm:left,rightMm:right,clearanceMm:clearance(rounded,stemCad)-6,sourceRun:runIndex};
      }
    }
    // The first accepted displacement is the smallest permitted by the
    // search grid; do not spend time distorting the flourish further.
    if(best)return best;
  }
  return best||fail('no_safe_candidate');
}
// Only the first eligible run is attempted. Every unhandled case returns the
// untouched artwork, and no result here asserts electrical/manufacturing readiness.
function prepare(art,validateComplete,options={}) {
  if(!art?.valid || !Array.isArray(art.runs) || !Array.isArray(art.paths) || art.runs.length!==art.paths.length || typeof validateComplete!=='function') throw new TypeError('Valid complete artwork and its validator are required.');
  if(art.runs.reduce((sum,run)=>sum+run.length,0)>5000) return {applied:false,reason:'too_complex',artwork:art};
  const all=art.runs;
  for(let i=0;i<all.length;i++) {
    const run=all[i];
    if(!Array.isArray(run)||run.length<3)continue;
    const connected=p=>all.some((other,j)=>j!==i && other.length>0 && (distance(p,other[0])<.01||distance(p,other.at(-1))<.01));
    if(connected(run[0])===connected(run.at(-1)))continue;
    let corners=0;
    for(let j=1;j<run.length-1;j++) {
      const a=run[j-1],b=run[j],c=run[j+1],ab=distance(a,b),bc=distance(b,c);
      if(ab>=.05&&bc>=.05&&((a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1]))/(ab*bc)>Math.SQRT1_2+1e-8)corners++;
    }
    if(corners!==1)continue;
    const result=repairAcuteFlourish(art,i,validateComplete,options);
    return result.applied?result:{...result,artwork:art};
  }
  return {applied:false,reason:'no_eligible_run',artwork:art};
}
// Common browser/server policy. The replacement has already been checked
// against every nearby path by prepare(); this validator checks the complete
// drawing, board, spacers, unchanged paths and current manufacturing screen.
// Other unverified strokes, electrical routing and cover cuts remain review-only.
function prepareForSpec(art,spec,engine,options={}) {
  if(!engine || typeof engine.countBends!=='function' || typeof engine.inspectManufacturing!=='function' ||
      typeof engine.backboard!=='function' || typeof engine.finishedSize!=='function') {
    return {applied:false,reason:'validator_unavailable',artwork:art};
  }
  const result=prepare(art,full=>{
    if(full.runs.length!==art.runs.length+1 || full.paths.length!==art.paths.length+1 ||
        full.widthMm!==art.widthMm || full.heightMm!==art.heightMm) return false;
    const changed=full.paths.findIndex((p,i)=>i>=art.paths.length || p.d!==art.paths[i].d);
    if(changed<0 || changed>=art.paths.length) return false;
    for(let i=0;i<art.paths.length;i++){
      if(i===changed)continue;
      const j=i<changed?i:i+1;
      if(full.paths[j].d!==art.paths[i].d || full.runs[j].length!==art.runs[i].length ||
          full.runs[j].some((p,k)=>distance(p,art.runs[i][k])>1e-9))return false;
    }
    const local=engine.inspectManufacturing(full.runs.slice(changed,changed+2));
    if(local.incomplete || local.shortStrokes || local.closePaths || local.tightCurves || local.sharpReturns)return false;
    const manufacturing=engine.inspectManufacturing(full.runs);
    if(manufacturing.incomplete)return false;
    const board=engine.backboard(full,spec);
    if(board?.wall && board.requestedSpacers && board.holes.length<board.requestedSpacers)return false;
    if(!engine.finishedSize(full,board,spec).withinLimit)return false;
    return true;
  },options);
  if(!result.applied)return result;
  const full=result.artwork;
  full.manufacturing=engine.inspectManufacturing(full.runs);
  full.bendCount=engine.countBends(full.paths);
  full.warnings=[...(art.warnings||[])];
  full.acuteRepair={sourceRun:result.sourceRun,clearanceMm:result.clearanceMm,
    ledLengthsMm:[result.leftMm,result.rightMm],startShiftMm:result.startShiftMm};
  return result;
}
return {prepare,prepareForSpec};
});
