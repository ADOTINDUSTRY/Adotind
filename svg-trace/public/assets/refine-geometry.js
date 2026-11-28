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
  // Compare premultiplied colour and alpha. This detects pale artwork on a
  // transparent background as well as boundaries between two opaque colours.
  function createRasterGuide(image, viewBox) {
    const {width,height,data} = image || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width<3 || height<3 ||
        !data || data.length!==width*height*4 || !Array.isArray(viewBox) ||
        viewBox.length!==4 || !viewBox.every(Number.isFinite) || viewBox[2]<=0 || viewBox[3]<=0) return null;
    const [left,top,w,h]=viewBox, sx=width/w,sy=height/h;
    const pixelSize=Math.max(1/sx,1/sy);
    // All probes stay on this small cross-section of the edge. Two equally
    // plausible boundaries on either side (such as a thin stroke) are ambiguous.
    function sample(x,y,out) {
      const px=x-.5, py=y-.5, ix=Math.floor(px), iy=Math.floor(py);
      if (ix<0 || iy<0 || ix+1>=width || iy+1>=height) return false;
      const dx=px-ix,dy=py-iy, row=width*4, base=(iy*width+ix)*4;
      const a00=(1-dx)*(1-dy), a10=dx*(1-dy), a01=(1-dx)*dy, a11=dx*dy;
      const v0=a00*data[base+3]/255, v1=a10*data[base+7]/255;
      const v2=a01*data[base+row+3]/255, v3=a11*data[base+row+7]/255;
      for (let c=0;c<3;c++) out[c]=v0*data[base+c]+v1*data[base+4+c]+v2*data[base+row+c]+v3*data[base+row+4+c];
      out[3]=(v0+v1+v2+v3)*255;
      return true;
    }
    const first=[0,0,0,0], second=[0,0,0,0];
    function match(point,tangent,radius=5) {
      const x=(point[0]-left)*sx,y=(point[1]-top)*sy;
      const t=unit([tangent[0]*sx,tangent[1]*sy]), nx=-t[1],ny=t[0];
      if (Math.abs(nx)+Math.abs(ny)<.9 || x<1 || y<1 || x>=width-1 || y>=height-1) return null;
      const steps=Math.min(12,Math.floor(radius*2));
      if (steps<2) return null;
      const values=[];
      for (let k=-steps-1;k<=steps+1;k++) {
        const p=k*.5;
        if (!sample(x+(p-.65)*nx,y+(p-.65)*ny,first) ||
            !sample(x+(p+.65)*nx,y+(p+.65)*ny,second)) { values.push(0); continue; }
        values.push(Math.hypot(first[0]-second[0],first[1]-second[1],first[2]-second[2],first[3]-second[3]));
      }
      const peaks=[];
      let best=null;
      for (let k=1;k<values.length-1;k++) {
        const v=values[k],a=values[k-1],b=values[k+1];
        if (v<28 || v<a || v<b || (a===v && b===v)) continue;
        const bend=2*v-a-b;
        const d=(k-steps-1 + (bend>1e-5 ? .5*(b-a)/bend : 0))*.5;
        const score=v/(1+.06*d*d);
        const hit={d,score};
        peaks.push(hit);
        if (!best || score>best.score) best=hit;
      }
      if (!best || Math.abs(best.d)>radius-.1 ||
          peaks.some(other=>Math.abs(other.d-best.d)>1.4 && other.score>best.score*.72)) return null;
      const d=best.d;
      return {point:[point[0]+nx*d/sx,point[1]+ny*d/sy],normal:[nx,ny],distance:d};
    }
    return {match,pixelSize,
      pixels: (a,b) => [(a[0]-b[0])*sx,(a[1]-b[1])*sy]};
  }
  const pair = p => Array.isArray(p) && p.length===2 && p.every(Number.isFinite);
  const tangentAt = (c,t) => {
    const sub=split(c,t);
    return t===1 ? direction(sub[0],true) : direction(sub[1],false);
  };
  function matchedSamples(curves,samples,guide,radius) {
    const matches=[];
    for (const [k,t] of samples) {
      const c=curves[k], p=at(c,t), hit=guide.match(p,tangentAt(c,t),radius);
      if (hit) matches.push({...hit,k,t});
    }
    return matches;
  }
  function improvement(matches,curves,guide) {
    let before=0,after=0;
    for (const m of matches) {
      before+=m.distance*m.distance;
      const residual=dot(guide.pixels(at(curves[m.k],m.t),m.point),m.normal);
      after+=residual*residual;
    }
    if (!matches.length) return 0;
    before=Math.sqrt(before/matches.length); after=Math.sqrt(after/matches.length);
    return before>.55 && after<before*.72 ? before-after : 0;
  }
  const moveHandle = (g,which,d) => g.t!=='C'?g:{...g,[which]:offset(g[which],d,1)};
  function cornerEvidence(c,side,guide,radius,k) {
    const line=minus(c[3],c[0]), extent=length(guide.pixels(c[3],c[0]));
    if (extent<9) return null;
    const probeLength=Math.min(36,extent*.72);
    const samples=[];
    for (const fraction of [.18,.36,.56,.78,1]) {
      const t=side==='end'?1-fraction*probeLength/extent:fraction*probeLength/extent;
      if (dot(unit(line),tangentAt(c,t))<.976) return null;
      const hit=guide.match(at(c,t),tangentAt(c,t),radius);
      if (hit) samples.push({...hit,k,t});
    }
    if (samples.length<4) return null;
    const center=samples.reduce((mean,m)=>offset(mean,m.point,1/samples.length),[0,0]);
    let xx=0,xy=0,yy=0;
    for (const {point} of samples) {
      const [x,y]=minus(point,center); xx+=x*x; xy+=x*y; yy+=y*y;
    }
    const angle=.5*Math.atan2(2*xy,xx-yy);
    let v=[Math.cos(angle),Math.sin(angle)];
    if (dot(v,line)<0) v=[-v[0],-v[1]];
    if (dot(v,unit(line))<.95 || samples.some(m=>Math.abs(cross(v,minus(m.point,center)))>.55*guide.pixelSize)) return null;
    return {center,v,samples};
  }
  // Generate geometric edits only for closed outlines with a recognisable
  // image boundary. An open centreline deliberately sits between two edges.
  function rasterEdit(sp,i,action,source,ids,options) {
    const {guide,geometry}=options;
    if (!sp.closed || (!guide && !geometry)) return null;
    const n=sp.nodes.length, j=next(sp,i), left=(i+n-1)%n;
    const p=sp.nodes[i], b=sp.nodes[j];
    if (!p || next(source,ids[i])!==ids[j] || sp.segs[i]?.t==='A') return null;
    const c=curve(sp,i), chord=dist(p,b);
    if (chord<1e-6) return null;
    if (geometry?.from && (!pair(geometry.from) || dist(geometry.from,p)>1e-6)) return null;
    if (geometry?.end && (!pair(geometry.end) || dist(geometry.end,b)>1e-6)) return null;
    // Stored previews are validated again when accepted, including when the
    // raster is being decoded after a tab reload. Local scale bounds protect
    // tiny detail independently of the overall dimensions of the artwork.
    const maxWorld=guide ? 5*guide.pixelSize : Infinity;
    if (action==='align') {
      if (next(source,ids[left])!==ids[i] || sp.segs[left].t==='A') return null;
      const A=sp.segs[left], B=sp.segs[i], a=sp.nodes[left], incoming=curve(sp,left);
      const sharp=dot(direction(incoming,true),direction(c,false))<Math.cos(Math.PI*.24);
      const bound=Math.min(.23*Math.min(dist(a,p),chord),maxWorld);
      const before=region([a,p,b],[A,B]); let to=geometry?.to, matches;
      if (!geometry) {
        const r=Math.min(5,bound/guide.pixelSize);
        if (r<1) return null;
        if (sharp) {
          // The gradient AT a corner mixes both sides. Measure away from
          // its tip and intersect two independently supported straight edges.
          if (A.t!=='L' || B.t!=='L') return null;
          const first=cornerEvidence(incoming,'end',guide,r,0),second=cornerEvidence(c,'start',guide,r,1);
          if (!first || !second) return null;
          const det=cross(first.v,second.v);
          if (Math.abs(det)<.45) return null;
          to=offset(first.center,first.v,cross(minus(second.center,first.center),second.v)/det);
          if (length(guide.pixels(to,p))<.72) return null;
          matches=first.samples.concat(second.samples);
        } else {
          matches=matchedSamples([incoming,c],[[0,.5],[0,.78],[0,1],[1,.22],[1,.5]],guide,r);
          const anchor=matches.find(m=>m.k===0 && m.t===1);
          if (!anchor || Math.abs(anchor.distance)<.72 || matches.length<4 ||
              !matches.some(m=>m.k===1) || !matches.some(m=>m.k===0 && m.t<1)) return null;
          to=anchor.point;
        }
      }
      if (!pair(to) || dist(to,p)<1e-6 || dist(to,p)>bound || dist(to,source.nodes[ids[i]])>bound) return null;
      if (sharp && (A.t!=='L' || B.t!=='L' ||
          Math.sign(cross(minus(p,a),minus(b,p)))!==Math.sign(cross(minus(to,a),minus(b,to))) ||
          dot(unit(minus(p,a)),unit(minus(to,a)))<.96 || dot(unit(minus(b,p)),unit(minus(b,to)))<.96)) return null;
      const d=minus(to,p),after=region([a,to,b],[moveHandle(A,'c2',d),moveHandle(B,'c1',d)]);
      const gain=matches?improvement(matches,[curve(after,0),curve(after,1)],guide):0;
      if (matches && gain<.28) return null;
      return {point:p,before,after,start:left,tol:dist(to,p),geometry:{to,from:p},improvement:gain};
    }
    if (action!=='fit') return null;
    const axis=unit(minus(b,p)),bound=Math.min(.25*chord,1.8*maxWorld);
    let c1=geometry?.c1,c2=geometry?.c2,matches;
    if (!geometry) {
      const radius=Math.min(5,.22*chord/guide.pixelSize);
      if (radius<1.5) return null;
      matches=matchedSamples([c],[[0,0],[0,.125],[0,.25],[0,.375],[0,.5],[0,.625],[0,.75],[0,.875],[0,1]],guide,radius);
      const ends=matches.filter(m=>m.t===0 || m.t===1);
      if (ends.length!==2 || ends.some(m=>Math.abs(m.distance)>1.2) || matches.length<8) return null;
      let h11=.015,h12=0,h22=.015;
      const v1=[0,0],v2=[0,0];
      for (const {t,point} of matches) {
        const u=1-t,h1=3*u*u*t,h2=3*u*t*t,delta=minus(point,at(c,t));
        h11+=h1*h1; h12+=h1*h2; h22+=h2*h2;
        for (let dim=0;dim<2;dim++) { v1[dim]+=h1*delta[dim]; v2[dim]+=h2*delta[dim]; }
      }
      const det=h11*h22-h12*h12;
      c1=c[1].map((v,k)=>v+(h22*v1[k]-h12*v2[k])/det);
      c2=c[2].map((v,k)=>v+(h11*v2[k]-h12*v1[k])/det);
      // Keep a tangent shared with an existing smooth cubic neighbour.
      const nextSeg=sp.segs[j],prevSeg=sp.segs[left];
      if (prevSeg.t==='C' && dot(direction(curve(sp,left),true),direction(c,false))>.996) {
        const u=direction(c,false); c1=offset(p,u,dot(minus(c1,p),u));
      }
      if (nextSeg.t==='C' && dot(direction(curve(sp,j),false),direction(c,true))>.996) {
        const v=direction(c,true); c2=offset(b,v,dot(minus(c2,b),v));
      }
    }
    if (!pair(c1) || !pair(c2)) return null;
    const delta=Math.max(dist(c1,c[1]),dist(c2,c[2]));
    if (delta>bound || delta<1e-6) return null;
    const cp=[p,c1,c2,b];
    // Monotone projection rules out loops/backtracking; endpoint tangent
    // limits preserve deliberate corners and the way adjacent edges join.
    if (cp.slice(1).some((q,k)=>dot(minus(q,cp[k]),axis)<-1e-8) ||
        dot(direction(cp,false),direction(c,false))<.75 || dot(direction(cp,true),direction(c,true))<.75) return null;
    const gain=matches?improvement(matches,[cp],guide):0;
    if (matches && gain<.30) return null;
    const tol=Math.max(delta*.75,1e-6);
    return {point:at(c,.5),before:region([p,b],[sp.segs[i]]),after:region([p,b],[cubic(cp)]),
      start:i,tol,geometry:{c1,c2,from:p,end:b},improvement:gain};
  }
  function edit(sp,i,action,source,ids,tolerance,options={}) {
    const n=sp.nodes.length, p=sp.nodes[i];
    if (action==='align' || action==='fit') return rasterEdit(sp,i,action,source,ids,options);
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
    for (const {action,index,geometry} of actions) {
      const i=ids.indexOf(index), key=action+'#'+index;
      const e=i<0 || seen.has(key) ? null : edit(contour,i,action,source,ids,tol,{guide:options.guide,geometry});
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
      } else if (action==='smooth' || action==='align') {
        contour.segs[i]=after.segs[1];
        if (action==='align') contour.nodes[i]=after.nodes[1];
      }
      seen.add(key);
      applied.push({action,index,point,before,after,...(e.geometry?{geometry:e.geometry,improvement:e.improvement}:{})});
    }
    return {contour,applied,skipped};
  }
  function createReviewer(sp,options={}) {
    const ids=sp.nodes.map((_,i)=>i);
    const tol=Number.isFinite(options.tolerance)?options.tolerance:defaultTolerance(sp);
    const allows=clearance(sp,options.obstacles||[]);
    const origin=sp.nodes[0], areaLimit=sp.closed ? Math.abs(area2(sp,origin))*.08+1e-10 : Infinity;
    function preview({action,index,geometry}) {
      if (!Number.isInteger(index) || index<0 || index>=ids.length) return null;
      const change=edit(sp,index,action,sp,ids,tol,{guide:options.guide,geometry});
      if (!change || !allows(change,ids) ||
          (sp.closed && Math.abs(area2(change.after,origin)-area2(change.before,origin))>areaLimit)) return null;
      return {action,index,point:change.point,before:change.before,after:change.after,
        ...(change.geometry?{geometry:change.geometry,improvement:change.improvement}:{})};
    }
    function candidates(start=0,end=ids.length) {
      const result=[];
      for (let index=start;index<Math.min(end,ids.length);index++) {
        if (!options.guide && result.length >= (options.limit ?? Infinity)) break;
        if (options.guide) {
          for (const action of ['align','fit']) {
            const change=preview({action,index});
            if (change) result.push({action,index,point:change.point,geometry:change.geometry,improvement:change.improvement});
          }
        }
        for (const action of ['remove','smooth','straighten']) {
          const change=preview({action,index});
          if (change) {
            result.push({action,index,point:change.point});
            break;
          }
        }
      }
      if (!options.guide) return result;
      return result.sort((a,b)=>(b.improvement||0)-(a.improvement||0)).slice(0,options.limit ?? result.length);
    }
    return {preview,candidates};
  }
  const candidates=(sp,options)=>createReviewer(sp,options).candidates();
  const api={apply,candidates,createReviewer,defaultTolerance,createRasterGuide};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.SvgTraceRefine=api;
})(typeof window==='undefined'?globalThis:window);
