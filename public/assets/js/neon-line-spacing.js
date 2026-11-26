/* Choose a visual default from the actual lettering, without changing its paths. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonLineSpacing = factory();
})(globalThis, function () {
  'use strict';

  function lineBounds(artwork, count) {
    const result = Array.from({length:count},()=>({top:Infinity,bottom:-Infinity}));
    artwork.runs.forEach((run,index)=>{
      const box=result[artwork.paths[index]?.line];
      if (!box) return;
      for (const point of run) {
        box.top=Math.min(box.top,point[1]);
        box.bottom=Math.max(box.bottom,point[1]);
      }
    });
    return result;
  }

  // A numeric result is saved with the design. The calculation is purely a
  // typographic default: customers may select another value at any time.
  function recommend(engine, spec) {
    if (!engine || typeof engine.layout !== 'function' || !spec || typeof spec.text !== 'string') return null;
    const rows=spec.text.replace(/\r\n?/g,'\n').split('\n');
    let text=rows.join('\n');
    if (!rows.some((row,i)=>i>0 && row.trim() && rows[i-1].trim())) {
      const font=engine.fonts?.find(item=>item.id===spec.font);
      const sample=Array.from(rows.find(row=>row.trim()) || font?.sample || 'Aa').slice(0,39).join('');
      text=sample+'\n'+sample;
    }
    let one,two;
    try {
      one=engine.layout({...spec,text,lineSpacing:1});
      two=engine.layout({...spec,text,lineSpacing:2});
    } catch { return null; }
    if (!one.valid || !two.valid || !one.runs || !two.runs) return null;
    const lines=text.split('\n'), a=lineBounds(one,lines.length), b=lineBounds(two,lines.length);
    let recommended=-Infinity;
    for (let i=1;i<lines.length;i++) {
      const first=a[i-1], second=a[i], first2=b[i-1], second2=b[i];
      if (![first.top,first.bottom,second.top,second.bottom,first2.bottom,second2.top].every(Number.isFinite)) continue;
      const gap1=second.top-first.bottom-6;
      const gap2=second2.top-first2.bottom-6;
      const perEm=gap2-gap1;
      if (!(perEm>0.001)) continue;
      const averageHeight=((first.bottom-first.top)+(second.bottom-second.top))/2+6;
      const desiredGap=Math.max(6,averageHeight*.15);
      recommended=Math.max(recommended,1+(desiredGap-gap1)/perEm);
    }
    if (!Number.isFinite(recommended)) return null;
    // Round upward to the editor's .05 step, keeping the visible gap.
    return Math.max(.5,Math.min(2,Math.ceil((recommended-1e-8)*20)/20));
  }

  return {recommend};
});
