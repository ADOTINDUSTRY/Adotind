// Both comparison images use the same rectangle in the editor's SVG coordinates.
(() => {
  'use strict';

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }

  function cropFor(batch, vb, singleBatch) {
    const [x,y,w,h] = vb;
    if (singleBatch && batch.length > 1 && !batch.some(p => p.target.focus)) return vb.slice();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    function include([px,py]) {
      left = Math.min(left,px); right = Math.max(right,px);
      top = Math.min(top,py); bottom = Math.max(bottom,py);
    }
    for (const {data,target} of batch) {
      if (data.focus) {
        const i = data.focus.index, a = data.nodes[i];
        const b = data.focus.type === 'segment' ? data.nodes[(i+1)%data.nodes.length] : a;
        include(a); include(b);
      } else {
        data.nodes.forEach(include);
        for (const s of data.segments) if (s[0] === 'C') { include([s[1],s[2]]); include([s[3],s[4]]); }
        // Arc endpoints alone do not bound an ellipse.
        if (target.source.segs.some(s => s.t === 'A')) return vb.slice();
      }
    }
    const pad = Math.max(Math.max(w,h)*.035, Math.max(right-left,bottom-top)*.14);
    left = Math.max(x,left-pad); right = Math.min(x+w,right+pad);
    top = Math.max(y,top-pad); bottom = Math.min(y+h,bottom+pad);
    return right>left && bottom>top ? [left,top,right-left,bottom-top] : vb.slice();
  }

  async function load(src, vb) {
    const image = new Image();
    image.src = src; await image.decode();
    const scale = Math.min(1,1536/Math.max(image.naturalWidth,image.naturalHeight));
    const guideCanvas = makeCanvas(Math.max(1,Math.round(image.naturalWidth*scale)),Math.max(1,Math.round(image.naturalHeight*scale)));
    const ctx = guideCanvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(image,0,0,guideCanvas.width,guideCanvas.height);
    const pixels = ctx.getImageData(0,0,guideCanvas.width,guideCanvas.height);
    const guide = window.SvgTraceRefine.createRasterGuide(pixels,vb);
    let transparent = 0, bright = 0, visible = 0;
    for (let i=0;i<pixels.data.length;i+=4*17) {
      const d = pixels.data;
      if (d[i+3]<128) { transparent++; continue; }
      visible++;
      if (.299*d[i]+.587*d[i+1]+.114*d[i+2] > 165) bright++;
    }
    const background = transparent && visible && bright/visible>.55 ? '#30343a' : '#fff';

    function evidence(batch, pathData, singleBatch) {
      const frame = cropFor(batch,vb,singleBatch);
      const [x,y,w,h] = frame;
      const s = Math.min(800/Math.max(w,h), Math.max(1,image.naturalWidth/vb[2])*3);
      const canvas = makeCanvas(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s)));
      const c = canvas.getContext('2d');
      c.fillStyle = background; c.fillRect(0,0,canvas.width,canvas.height);
      const sx = canvas.width/w, sy = canvas.height/h;
      c.setTransform(sx,0,0,sy,-x*sx,-y*sy);
      c.drawImage(image,vb[0],vb[1],vb[2],vb[3]);
      const jpeg = () => canvas.toDataURL('image/jpeg',.77).split(',')[1];
      const original = jpeg();
      for (const p of batch) {
        const sp = p.target.source;
        const segs = (p.data.closed ? p.ids : p.ids.slice(0,-1)).map(i => sp.segs[i]);
        const path = new Path2D(pathData([{nodes:p.data.nodes,segs,closed:p.data.closed}]));
        c.strokeStyle = '#fff'; c.lineWidth = 2.8/sx; c.stroke(path);
        c.strokeStyle = '#b80a73'; c.lineWidth = 1.4/sx; c.stroke(path);
      }
      c.resetTransform();
      let labels = 0;
      for (const p of batch) {
        const indices = p.data.focus ? [p.data.focus.index] : p.data.candidates.map(a=>a.index);
        for (const i of [...new Set(indices)].slice(0,3)) {
          const q = p.data.nodes[i], px = (q[0]-x)*sx, py = (q[1]-y)*sy;
          if (labels >= 12 || px<0 || py<0 || px>canvas.width || py>canvas.height) continue;
          c.fillStyle = '#095b82'; c.beginPath(); c.arc(px,py,2.5,0,2*Math.PI); c.fill();
          const caption = p.data.id + '#' + i;
          c.font = '11px sans-serif';
          const width = c.measureText(caption).width+4;
          const lx = Math.max(0,Math.min(canvas.width-width,px+4));
          const ly = Math.max(13,Math.min(canvas.height-1,py-5));
          c.fillStyle = '#fff'; c.fillRect(lx,ly-12,width,14);
          c.fillStyle = '#063950'; c.fillText(caption,lx+2,ly-1); labels++;
        }
      }
      return {image:original, overlay:jpeg(), imageViewBox:frame};
    }
    return {guide,evidence,background};
  }
  window.svgTraceReviewReference = {load};
})();
