/* Helpers shared by the multiline editor and tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NeonLines=factory();})(globalThis,function(){
  'use strict';
  function autoGreek(spec,fonts,library) {
    const next=spec.lineFonts.slice();let switched=false;
    for(const [index,row] of spec.text.normalize('NFC').split('\n').entries()) {
      if(!/\p{Script=Greek}/u.test(row))continue;
      const available=library[next[index] || spec.font]?.glyphs || {};
      if([...row].every(ch=>Object.hasOwn(available,ch)))continue;
      if(fonts.some(f=>f.id==='aegean') && [...row].every(ch=>Object.hasOwn(library.aegean?.glyphs || {},ch))) {next[index]='aegean';switched=true;}
    }
    return {next,switched};
  }
  function reconcile(previous,next,arrays) {
    let prefix=0;while(prefix<previous.length && prefix<next.length && previous[prefix]===next[prefix])prefix++;
    let oldEnd=previous.length,newEnd=next.length;
    while(oldEnd>prefix && newEnd>prefix && previous[oldEnd-1]===next[newEnd-1]){oldEnd--;newEnd--;}
    const inserted=next.slice(prefix,newEnd), removed=previous.slice(prefix,oldEnd);
    const delta=(inserted.match(/\n/g)||[]).length-(removed.match(/\n/g)||[]).length;
    const startLine=(previous.slice(0,prefix).match(/\n/g)||[]).length;
    const atLineStart=(prefix===0 || previous[prefix-1]==='\n') && (delta>0?inserted:removed).endsWith('\n');
    const position=startLine+(atLineStart?0:1);
    return arrays.map(values=>{const result=values.slice();if(delta>0)result.splice(position,0,...Array(delta).fill(null));else if(delta<0)result.splice(position,-delta);return result.slice(0,8);});
  }
  // Changing the bounds should not resize the other lines.
  function preserveScale(spec, transforms, layout, limits) {
    const before=layout(spec), candidate={...spec,lineTransforms:transforms}, after=layout(candidate);
    if (!before.valid || !after.valid || !(before.lineOffsetMmPerPercent>0) || !(after.lineOffsetMmPerPercent>0)) return candidate;
    const width=6+(spec.widthMm-6)*before.lineOffsetMmPerPercent/after.lineOffsetMmPerPercent;
    if (width < limits.min-1e-7 || width > limits.max+1e-7) return null;
    return {...candidate,widthMm:Math.max(limits.min,Math.min(limits.max,width))};
  }
  const CLEARANCE=22.02; // 16 mm clear between two 6 mm tubes, plus curve tolerance.
  function limitMovement(spec,transforms,index,engine,limits) {
    const start=engine.layout(spec), from={x:0,y:0,rotation:0,...spec.lineTransforms[index]}, to={x:0,y:0,rotation:0,...transforms[index]};
    const target=preserveScale(spec,transforms,engine.layout,limits);
    if (!start.valid) return {design:target,blocked:!target};
    const lineRuns=start.runs.filter((_,i)=>start.runWords[i].startsWith(index+':'));
    if (!lineRuns.length) return {design:target,blocked:!target};
    if (!start.runWords.some(word=>!word.startsWith(index+':'))) return {design:target,blocked:!target};
    const points=lineRuns.flat(), xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    const radius=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
    const motion=Math.hypot(to.x-from.x,to.y-from.y)*start.lineOffsetMmPerPercent+Math.abs(to.rotation-from.rotation)*Math.PI/180*radius;
    let t=0, accepted=spec, dist=engine.lineClearance(start).distance, iterations=0;
    if(motion<1e-8)return {design:target,blocked:!target};
    function at(fraction) {
      const next=spec.lineTransforms.slice();
      next[index]={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,rotation:from.rotation+(to.rotation-from.rotation)*fraction};
      const draft=preserveScale(spec,next,engine.layout,limits);
      if(!draft)return null;
      const proof=engine.layout(draft);
      return proof.valid ? {design:draft,distance:engine.lineClearance(proof).distance} : null;
    }
    while(t<1 && iterations++<300) {
      // Distance between moving and stationary geometry cannot shrink faster
      // than the distance travelled by the moving line.
      const step=Math.max(.2,Math.min(12,Math.max(0,dist-CLEARANCE)*.7));
      const nextT=Math.min(1,t+step/motion), next=at(nextT);
      const acceptable=next && (dist<CLEARANCE ? next.distance>=dist-1e-5 : next.distance>=CLEARANCE-1e-7);
      if(!acceptable) {
        let low=t,high=nextT,best=accepted;
        for(let i=0;i<12;i++){const mid=(low+high)/2,c=at(mid);if(c && (dist<CLEARANCE ? c.distance>=dist-1e-5 : c.distance>=CLEARANCE-1e-7)){low=mid;best=c.design;}else high=mid;}
        return {design:best,blocked:true};
      }
      t=nextT;accepted=next.design;dist=next.distance;
    }
    return {design:accepted,blocked:t<1};
  }
  return {autoGreek,reconcile,preserveScale,limitMovement,CLEARANCE};
});
