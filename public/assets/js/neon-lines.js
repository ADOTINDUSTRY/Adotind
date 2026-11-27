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
  return {autoGreek,reconcile,preserveScale};
});
