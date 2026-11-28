// Proposals address the original SVG nodes; changes are made on a copy for review.
(function (root) {
  'use strict';
  const length = v => Math.hypot(v[0], v[1]);
  const minus = (a,b) => [a[0]-b[0], a[1]-b[1]];
  const offset = (p,v,k) => [p[0]+v[0]*k, p[1]+v[1]*k];
  const mix = (a,b,t) => offset(a, minus(b,a), t);
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1];
  const dist = (a,b) => length(minus(a,b));
  const unit = v => { const n = length(v); return n > 1e-10 ? [v[0]/n,v[1]/n] : [0,0]; };
  const cube = (a,s,b) => s.t === 'C' ? [a,s.c1,s.c2,b] : [a,mix(a,b,1/3),mix(a,b,2/3),b];
  const split = (p,t) => {
    const [a,b,c,d] = p, e = mix(a,b,t), f = mix(b,c,t), g = mix(c,d,t);
    const h = mix(e,f,t), i = mix(f,g,t), m = mix(h,i,t);
    return [[a,e,h,m],[m,i,g,d]];
  };
  const at = (p,t) => split(p,t)[0][3];
  const line = () => ({t:'L'});
  const cubic = p => ({t:'C', c1:p[1], c2:p[2]});
  const next = (sp,i) => (i+1)%sp.nodes.length;
  const curve = (sp,k) => cube(sp.nodes[k],sp.segs[k],sp.nodes[next(sp,k)]);
  const region = (nodes,segs) => ({closed:false,nodes:nodes.slice(),segs:segs.slice()});
  // Bézier convex hull bounds. Subdivide the difference polynomial when the
  // control hull is inconclusive; a passing test bounds the whole curve.
  function withinDistance(d,tol,depth=0) {
    if (d.every(v => length(v) <= tol)) return true;
    if (length(d[0]) > tol || length(d[3]) > tol || depth === 5) return false;
    const [a,b] = split(d,.5);
    return withinDistance(a,tol,depth+1) && withinDistance(b,tol,depth+1);
  }
  function hugsLine(p,a,b,tol) {
    const axis = minus(b,a), n = length(axis);
    if (n < 1e-9) return false;
    const v = unit(axis);
    let prev = -Infinity;
    for (const q of p) {
      const w = minus(q,a), t = dot(v,w);
      if (Math.abs(v[0]*w[1]-v[1]*w[0]) > tol || t < -1e-8 || t > n+1e-8 || t+1e-8 < prev) return false;
      prev = t;
    }
    return true;
  }
  function sizes(source) {
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for (const p of source.nodes) {
      left=Math.min(left,p[0]); right=Math.max(right,p[0]); top=Math.min(top,p[1]); bottom=Math.max(bottom,p[1]);
    }
    return Math.max(right-left,bottom-top);
  }
  function defaultTolerance(sp) { return Math.max(.05,Math.min(1.5,sizes(sp)*.0015)); }
  function sourceSpan(source,start,end) {
    const curves=[];
    for (let i=start; i!==end; i=next(source,i)) {
      // Protect true SVG arcs. A long merged run can be simplified again on a later pass.
      if (!source.segs[i] || source.segs[i].t === 'A' || curves.length >= 64) return null;
      curves.push(curve(source,i));
    }
    return curves;
  }
  const weights = p => (dist(p[0],p[1])+dist(p[1],p[2])+dist(p[2],p[3])+dist(p[0],p[3]))/2;
  function staysNear(old,newCurve,isLine,tol) {
    if (!old?.length) return false;
    if (isLine && old.every(p=>hugsLine(p,newCurve[0],newCurve[3],tol))) return true;
    if (old.length===1) {
      const a=newCurve[0], b=newCurve[3];
      if (hugsLine(old[0],a,b,1e-9) && hugsLine(newCurve,a,b,tol)) return true;
      if (hugsLine(old[0],a,b,tol/2) && hugsLine(newCurve,a,b,tol/2)) return true;
    }
    const lengths=old.map(weights);
    let remaining=lengths.reduce((a,b)=>a+b,0), rest=newCurve;
    for (let j=0; j<old.length; j++) {
      let section=rest;
      if (j+1<old.length) {
        if (remaining <= 1e-10) return false;
        [section,rest] = split(rest,lengths[j]/remaining);
      }
      if (!withinDistance(old[j].map((q,i)=>minus(q,section[i])),tol)) return false;
      remaining-=lengths[j];
    }
    return true;
  }
  function direction(p,end) {
    const [a,b,c,d] = p, steps=end ? [minus(d,c),minus(d,b),minus(d,a)] : [minus(b,a),minus(c,a),minus(d,a)];
    return unit(steps.find(s=>length(s)>1e-9) || [0,0]);
  }
  // Fit one cubic to a run, with the two outer tangents fixed. The fitted
  // curve is subsequently checked against the original geometry.
  function fitRun(old) {
    const a=old[0][0], b=old[old.length-1][3], u=direction(old[0],false), v=direction(old[old.length-1],true);
    const lengths=old.map(weights), total=lengths.reduce((x,y)=>x+y,0);
    if (total < 1e-8) return null;
    let xx=0, xy=0, yy=0, bx=0, by=0, along=0;
    for (let k=0;k<old.length;k++) {
      for (let j=1;j<=6;j++) {
        const local=j/6, t=(along+local*lengths[k])/total, m=1-t;
        const h1=3*m*m*t, h2=3*m*t*t;
        const fixed=mix(a,b,h2+t*t*t), residual=minus(at(old[k],local),fixed);
        xx+=h1*h1; xy-=h1*h2*dot(u,v); yy+=h2*h2;
        bx+=h1*dot(u,residual); by-=h2*dot(v,residual);
      }
      along+=lengths[k];
    }
    const det=xx*yy-xy*xy;
    if (det < 1e-10) return null;
    const first=(bx*yy-by*xy)/det, second=(by*xx-bx*xy)/det;
    if (Math.min(first,second)<0 || Math.max(first,second)>total) return null;
    return [a,offset(a,u,first),offset(b,v,-second),b];
  }
  function edit(sp,i,action,source,ids,tolerance) {
    const n=sp.nodes.length, p=sp.nodes[i];
    if (!p || !['remove','smooth','straighten'].includes(action)) return null;
    if (action==='straighten') {
      const s=sp.segs[i], j=next(sp,i);
      if (s?.t!=='C' || next(source,ids[i])!==ids[j]) return null;
      const b=sp.nodes[j], tol=Math.min(tolerance,dist(p,b)*.025);
      if (!staysNear(sourceSpan(source,ids[i],ids[j]),cube(p,line(),b),true,tol)) return null;
      return {point:at(curve(sp,i),.5),before:region([p,b],[s]),after:region([p,b],[line()]),start:i,tol};
    }
    if ((!sp.closed && (i===0 || i===n-1)) || (action==='remove' && n<=(sp.closed?3:2))) return null;
    const left=(i+n-1)%n,j=next(sp,i),a=sp.nodes[left],b=sp.nodes[j],A=sp.segs[left],B=sp.segs[i];
    if (A.t==='A' || B.t==='A') return null;
    const first=curve(sp,left),second=curve(sp,i);
    const u=direction(first,true),v=direction(second,false), cosine=dot(u,v);
    if (cosine<Math.cos(36*Math.PI/180)) return null;
    const tol=Math.min(tolerance,.07*Math.min(weights(first),weights(second)));
    if (tol<1e-9) return null;
    const before=region([a,p,b],[A,B]);
    if (action==='remove') {
      const old=sourceSpan(source,ids[left],ids[j]);
      if (!old || dist(a,b)<tol) return null;
      let seg;
      if (staysNear(old,cube(a,line(),b),true,tol)) seg=line();
      else {
        const fit=fitRun(old);
        if (!fit || !staysNear(old,fit,false,tol)) return null;
        seg=cubic(fit);
      }
      return {point:p,before,after:region([a,b],[seg]),start:left,tol};
    }
    if (cosine>Math.cos(2*Math.PI/180)) return null;
    const tangent=unit([u[0]+v[0],u[1]+v[1]]);
    // A straight-run handle can be shortened to localise softening at its end.
    const sine=Math.max(.001,Math.sqrt((1-cosine)/2));
    const h1=dist(first[2],p), h2=dist(second[1],p);
    first[2]=offset(p,tangent,-(A.t==='L'?Math.min(h1,.95*tol/sine):h1));
    second[1]=offset(p,tangent,B.t==='L'?Math.min(h2,.95*tol/sine):h2);
    if (!staysNear(sourceSpan(source,ids[left],ids[i]),first,false,tol) ||
        !staysNear(sourceSpan(source,ids[i],ids[j]),second,false,tol)) return null;
    return {point:p,before,after:region([a,p,b],[cubic(first),cubic(second)]),start:left,tol};
  }
  const cross = (u,v) => u[0]*v[1]-u[1]*v[0];
  function pointLineDistance(p,a,b) {
    const v=minus(b,a), square=dot(v,v);
    const t=square ? Math.max(0,Math.min(1,dot(minus(p,a),v)/square)) : 0;
    return dist(p,offset(a,v,t));
  }
  function lineDistance(a,b,c,d) {
    const u=minus(b,a),v=minus(d,c);
    if (cross(u,minus(c,a))*cross(u,minus(d,a))<0 && cross(v,minus(a,c))*cross(v,minus(b,c))<0) return 0;
    return Math.min(pointLineDistance(a,c,d),pointLineDistance(b,c,d),pointLineDistance(c,a,b),pointLineDistance(d,a,b));
  }
  function box(points,pad=0) {
    return [Math.min(...points.map(p=>p[0]))-pad,Math.min(...points.map(p=>p[1]))-pad,
      Math.max(...points.map(p=>p[0]))+pad,Math.max(...points.map(p=>p[1]))+pad];
  }
  const boxesNear=(a,b,m)=>a[0]<=b[2]+m && b[0]<=a[2]+m && a[1]<=b[3]+m && b[1]<=a[3]+m;
  const union=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
  function bezierEdge(p) {
    const a=p[0], b=p[3];
    return {a,b,box:box(p),error:Math.max(pointLineDistance(p[1],a,b),pointLineDistance(p[2],a,b)),
      halves:()=>split(p,.5).map(bezierEdge)};
  }
  // SVG endpoint-to-centre transform, for measuring clearance to intact arcs.
  function arcEdge(a,s,b) {
    let rx=Math.abs(s.rx),ry=Math.abs(s.ry);
    if (!rx || !ry || dist(a,b)<1e-10) return bezierEdge(cube(a,line(),b));
    const rot=s.rot*Math.PI/180, co=Math.cos(rot),sn=Math.sin(rot);
    const dx=(a[0]-b[0])/2,dy=(a[1]-b[1])/2;
    const x=(co*dx+sn*dy)/rx,y=(-sn*dx+co*dy)/ry;
    const scale=Math.max(1,Math.hypot(x,y)); rx*=scale; ry*=scale;
    const u=x/scale,v=y/scale,mag=u*u+v*v;
    const k=(s.sweep===s.large ? -1 : 1)*Math.sqrt(Math.max(0,(1-mag)/mag));
    const cx=k*v,cy=-k*u;
    const center=[(a[0]+b[0])/2+co*rx*cx-sn*ry*cy,(a[1]+b[1])/2+sn*rx*cx+co*ry*cy];
    const angle=Math.atan2(v-cy,u-cx), end=Math.atan2(-v-cy,-u-cx);
    let delta=end-angle;
    if (s.sweep && delta<0) delta+=2*Math.PI;
    if (!s.sweep && delta>0) delta-=2*Math.PI;
    const point=t=>[center[0]+co*rx*Math.cos(t)-sn*ry*Math.sin(t),center[1]+sn*rx*Math.cos(t)+co*ry*Math.sin(t)];
    const interval=(t,d,a,b)=>{
      // Maximum interpolation error from the bound on the second derivative.
      const error=Math.max(rx,ry)*d*d/8;
      return {a,b,error,box:box([a,b],error),halves:()=>{
        const mid=point(t+d/2);
        return [interval(t,d/2,a,mid),interval(t+d/2,d/2,mid,b)];
      }};
    };
    return {...interval(angle,delta,a,b),center,sector:rx*ry*delta};
  }
  // Twice the signed area. Three-point Gauss quadrature exactly integrates
  // the polynomial x*y' - y*x' of a cubic Bézier; ellipse sectors are analytic.
  function area2(sp,origin) {
    let area=0;
    for (let i=0;i<sp.segs.length;i++) {
      const a=minus(sp.nodes[i],origin), b=minus(sp.nodes[next(sp,i)],origin), s=sp.segs[i];
      if (s.t==='L') { area+=cross(a,b); continue; }
      if (s.t==='A') {
        const arc=arcEdge(a,s,b);
        area+=arc.center ? cross(arc.center,minus(b,a))+arc.sector : cross(a,b);
        continue;
      }
      const p=[a,minus(s.c1,origin),minus(s.c2,origin),b], r=Math.sqrt(.6)/2;
      for (const [t,w] of [[.5-r,5/18],[.5,4/9],[.5+r,5/18]]) {
        const u=1-t, deriv=[0,1].map(j=>3*(u*u*(p[1][j]-p[0][j])+2*t*u*(p[2][j]-p[1][j])+t*t*(p[3][j]-p[2][j])));
        area+=w*cross(at(p,t),deriv);
      }
    }
    return area;
  }
  function edgesClose(a,b,margin,depth=0) {
    if (!boxesNear(a.box,b.box,margin)) return false;
    const distance=lineDistance(a.a,a.b,b.a,b.b), uncertainty=a.error+b.error;
    if (distance>margin+uncertainty) return false;
    if (distance+uncertainty<=margin || uncertainty<margin*.05 || depth>=16) return true;
    return a.error>=b.error ? a.halves().some(x=>edgesClose(x,b,margin,depth+1)) :
      b.halves().some(x=>edgesClose(a,x,margin,depth+1));
  }
  function tree(edges) {
    if (!edges.length) return null;
    const bounds=edges.reduce((b,e)=>union(b,e.box),edges[0].box);
    if (edges.length<=8) return {box:bounds,edges};
    const axis=bounds[2]-bounds[0]>=bounds[3]-bounds[1]?0:1;
    edges.sort((a,b)=>(a.box[axis]+a.box[axis+2])-(b.box[axis]+b.box[axis+2]));
    const mid=edges.length>>1;
    return {box:bounds,left:tree(edges.slice(0,mid)),right:tree(edges.slice(mid))};
  }
  // Do not soften into a neighbouring stroke or through an interior cutout.
  // An index over immutable originals makes review independent of the order in which edits are approved.
  function clearance(source,others) {
    let index;
    function build() {
      const edges=[];
      for (const sp of [source,...others.filter(other=>other!==source)]) {
        for (let k=0;k<sp.segs.length;k++) {
          const s=sp.segs[k],a=sp.nodes[k],b=sp.nodes[next(sp,k)];
          const edge=s.t==='A'?arcEdge(a,s,b):bezierEdge(cube(a,s,b));
          edges.push({...edge,sp,k});
        }
      }
      return tree(edges);
    }
    return (proposal,ids)=>{
      if (!index) index=build();
      const start=ids[proposal.start], end=ids[(proposal.start+proposal.before.segs.length)%ids.length];
      const ignored=new Set();
      for (let i=start; i!==end; i=next(source,i)) ignored.add(i);
      if (source.closed || start>0) ignored.add((start+source.nodes.length-1)%source.nodes.length);
      if (source.closed || end<source.segs.length) ignored.add(end);
      const obstructed=(branch,edge)=>{
        const margin=proposal.tol*2;
        if (!branch || !boxesNear(branch.box,edge.box,margin)) return false;
        if (!branch.edges) return obstructed(branch.left,edge)||obstructed(branch.right,edge);
        return branch.edges.some(other=>!(other.sp===source && ignored.has(other.k)) && edgesClose(edge,other,margin));
      };
      const replacement=proposal.after;
      for (let k=0;k<replacement.segs.length;k++) {
        if (obstructed(index,bezierEdge(curve(replacement,k)))) return false;
      }
      return true;
    };
  }
  function apply(source,actions,options={}) {
    const contour={...source,nodes:source.nodes.slice(),segs:source.segs.slice()};
    const ids=source.nodes.map((_,i)=>i), applied=[], skipped=[], seen=new Set();
    const tol=Number.isFinite(options.tolerance) ? options.tolerance : defaultTolerance(source);
    const allows=clearance(source,options.obstacles||[]);
    const origin=source.nodes[0], originalArea=source.closed ? area2(source,origin) : 0;
    let currentArea=originalArea;
    for (const {action,index} of actions) {
      const i=ids.indexOf(index), key=action+'#'+index;
      const e=i<0 || seen.has(key) ? null : edit(contour,i,action,source,ids,tol);
      if (!e) { skipped.push({action,index,reason:'The original corner, arc, endpoint or outline would change too much, or the target was already edited.'}); continue; }
      if (!allows(e,ids)) { skipped.push({action,index,reason:'The proposed edit is too close to another edge.'}); continue; }
      const {before,after,point,start}=e;
      if (source.closed) {
        const newArea=currentArea+area2(after,origin)-area2(before,origin);
        if (Math.abs(originalArea-newArea) > Math.abs(originalArea)*.08+1e-10) {
          skipped.push({action,index,reason:'The proposed edit would change too much of the enclosed area.'});
          continue;
        }
        currentArea=newArea;
      }
      contour.segs[start]=after.segs[0];
      if (action==='remove') {
        contour.nodes.splice(i,1); contour.segs.splice(i,1); ids.splice(i,1);
      } else if (action==='smooth') contour.segs[i]=after.segs[1];
      seen.add(key);
      applied.push({action,index,point,before,after});
    }
    return {contour,applied,skipped};
  }
  function createReviewer(sp,options={}) {
    const ids=sp.nodes.map((_,i)=>i);
    const tol=Number.isFinite(options.tolerance)?options.tolerance:defaultTolerance(sp);
    const allows=clearance(sp,options.obstacles||[]);
    const origin=sp.nodes[0], areaLimit=sp.closed ? Math.abs(area2(sp,origin))*.08+1e-10 : Infinity;
    function preview({action,index}) {
      if (!Number.isInteger(index) || index<0 || index>=ids.length) return null;
      const change=edit(sp,index,action,sp,ids,tol);
      if (!change || !allows(change,ids) ||
          (sp.closed && Math.abs(area2(change.after,origin)-area2(change.before,origin))>areaLimit)) return null;
      return {action,index,point:change.point,before:change.before,after:change.after};
    }
    function candidates() {
      const result=[];
      for (let index=0;index<ids.length;index++) {
        if (result.length >= (options.limit ?? Infinity)) break;
        for (const action of ['remove','smooth','straighten']) {
          const change=preview({action,index});
          if (change) {
            result.push({action,index,point:change.point});
            break;
          }
        }
      }
      return result;
    }
    return {preview,candidates};
  }
  const candidates=(sp,options)=>createReviewer(sp,options).candidates();
  const api={apply,candidates,createReviewer,defaultTolerance};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.SvgTraceRefine=api;
})(typeof window==='undefined'?globalThis:window);
