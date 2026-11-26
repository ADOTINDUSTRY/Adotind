/* Preview-only illustrations for a freestanding sign. Never used for CAD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonStandingScenes = factory();
})(globalThis, function () {
  'use strict';

  const options = Object.freeze(['table', 'shelf', 'floor']);

  // Return SVG elements as data, so the editor can paint them behind the sign
  // without changing its dimensions, the base cut profile, pricing or export.
  // Illustrations are deliberately schematic and not intended as scale models.
  function build(mode, finished, base, chartSize, technical = false) {
    if (!options.includes(mode) || !finished || !base ||
        ![finished.left,finished.right,finished.bottom,base.left,base.widthMm,base.top,chartSize]
          .every(Number.isFinite) || finished.right <= finished.left ||
        base.widthMm <= 0 || chartSize <= 0) return [];

    const width=finished.right-finished.left;
    const spread=Math.min(width*.08,chartSize*1.5);
    const left=finished.left-spread, right=finished.right+spread;
    const baseY=finished.bottom, baseThickness=8;
    const surfaceY=baseY+baseThickness;
    const room=Math.max(0,base.top-surfaceY-chartSize*.8);
    const thickness=mode==='floor'
      ? Math.min(Math.max(4,chartSize*.8),18,room*.65)
      : Math.min(Math.max(4,chartSize*.6),16,room*.38);
    // Use the available space while keeping the separate base plan clear.
    const supportHeight=Math.max(0,room-thickness);
    const outline=technical?'#74869b':'#c1cdd7';
    const face=technical?'none':'#d6e7f2';
    const strokeWidth=Math.max(1,chartSize*.12);
    const rect=(x,y,w,h,fill,opacity=1)=>({tag:'rect',attrs:{x,y,width:w,height:h,fill,
      'fill-opacity':opacity,stroke:outline,'stroke-width':strokeWidth}});
    const elements=[rect(base.left,baseY,base.widthMm,baseThickness,face,.22)];
    if (!(thickness>0)) return elements;

    const surfaceFill=technical?'none':mode==='table'?'#a47b59':mode==='shelf'?'#9baeb9':'#758b92';
    elements.push(rect(left,surfaceY,right-left,thickness,surfaceFill,technical?1:.76));
    const bottom=surfaceY+thickness;
    if (mode==='table' && supportHeight>1) {
      const legWidth=Math.max(3,Math.min(chartSize*.8,(right-left)*.06));
      const inset=Math.min((right-left)*.12,chartSize*2);
      elements.push(rect(left+inset,bottom,legWidth,supportHeight,surfaceFill,technical?1:.7));
      elements.push(rect(right-inset-legWidth,bottom,legWidth,supportHeight,surfaceFill,technical?1:.7));
    } else if (mode==='shelf' && supportHeight>1) {
      const depth=Math.min(chartSize*.8,(right-left)*.12);
      for (const [x,direction] of [[left+depth,1],[right-depth,-1]]) elements.push({tag:'path',attrs:{
        d:`M${x} ${bottom}V${bottom+supportHeight}H${x+direction*depth}`,
        fill:'none',stroke:outline,'stroke-width':strokeWidth}});
    } else if (mode==='floor') {
      const center=(left+right)/2;
      elements.push({tag:'line',attrs:{x1:center,y1:surfaceY,x2:center,y2:surfaceY+thickness,
        stroke:outline,'stroke-width':strokeWidth,opacity:.65}});
    }
    return elements;
  }

  return {options, build};
});
