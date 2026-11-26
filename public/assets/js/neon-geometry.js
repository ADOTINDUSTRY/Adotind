/* Millimetre geometry shared by the browser editor and the server-side proof generator. */
(() => {
  'use strict';

  const TUBE = 6;
  const fonts = [
    {id:'signature', label:'Signature', category:'Script'},
    {id:'atelier', label:'Atelier Brush', category:'Script'},
    {id:'velvet', label:'Velvet Script', category:'Script'},
    {id:'gala', label:'Gala Script', category:'Script'},
    {id:'invitation', label:'Invitation', category:'Script'},
    {id:'flourish', label:'Flourish', category:'Script'},
    {id:'capitol', label:'Capitol Script', category:'Script'},
    {id:'hand', label:'Handwritten', category:'Handwritten'},
    {id:'terrace', label:'Terrace Hand', category:'Handwritten'},
    {id:'notebook', label:'Notebook', category:'Handwritten'},
    {id:'architect', label:'Architect', category:'Handwritten'},
    {id:'boardwalk', label:'Boardwalk', category:'Handwritten'},
    {id:'festival', label:'Festival', category:'Display'},
    {id:'parlour', label:'Parlour', category:'Display'},
    {id:'deco', label:'Art Deco', category:'Display'},
    {id:'orbit', label:'Orbit', category:'Display'},
    {id:'slab', label:'Marquee Slab', category:'Serif'},
    {id:'studio', label:'Studio Sans', category:'Sans'},
    {id:'aegean', label:'Aegean Greek', category:'Sans', sample:'Καλημέρα'}
  ];
  const parsed = new Map();
  const kernMaps = new Map();
  const number = value => String(Math.round(value * 10000) / 10000);
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // Expand the commands used by the bundled SVG fonts into absolute M/L/C commands.
  function readPath(d) {
    const tokens = d.match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) || [];
    const commands = [];
    let x = 0, y = 0, startX = 0, startY = 0, command;
    let i = 0;
    while (i < tokens.length) {
      if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
      const type = command.toUpperCase();
      const relative = command !== type;
      const coordinate = origin => Number(tokens[i++]) + (relative ? origin : 0);
      if (type === 'M' || type === 'L') {
        x = coordinate(x);
        y = coordinate(y);
        commands.push([type, x, y]);
        if (type === 'M') {
          startX = x; startY = y;
          command = relative ? 'l' : 'L';
        }
      } else if (type === 'H' || type === 'V') {
        if (type === 'H') x = coordinate(x); else y = coordinate(y);
        commands.push(['L', x, y]);
      } else if (type === 'C' || type === 'S') {
        const previous = commands[commands.length - 1];
        const reflected = previous && previous[0] === 'C';
        const x1 = type === 'C' ? coordinate(x) : reflected ? 2*x - previous[3] : x;
        const y1 = type === 'C' ? coordinate(y) : reflected ? 2*y - previous[4] : y;
        const x2 = coordinate(x), y2 = coordinate(y);
        x = coordinate(x); y = coordinate(y);
        commands.push(['C', x1, y1, x2, y2, x, y]);
      } else if (type === 'Z') {
        x = startX; y = startY;
        commands.push(['L', x, y]);
      } else {
        throw new Error('Unexpected stroke font path command: ' + type);
      }
    }
    return commands;
  }

  function cubicAt(p, a, b, q, t) {
    const u = 1 - t;
    return u*u*u*p + 3*u*u*t*a + 3*u*t*t*b + t*t*t*q;
  }

  // All interior extrema of one coordinate; control points are generally outside the ink.
  function extrema(p, a, b, q) {
    const A = -p + 3*a - 3*b + q, B = 2*(p - 2*a + b), C = a - p;
    if (Math.abs(A) < 1e-9) return Math.abs(B) < 1e-9 ? [] : [-C/B];
    const disc = B*B - 4*A*C;
    if (disc < 0) return [];
    const s = Math.sqrt(disc);
    return [(-B+s)/(2*A), (-B-s)/(2*A)];
  }

  function emptyBounds() { return {left:Infinity, right:-Infinity, bottom:Infinity, top:-Infinity}; }
  function include(box, x, y) {
    box.left = Math.min(box.left, x); box.right = Math.max(box.right, x);
    box.bottom = Math.min(box.bottom, y); box.top = Math.max(box.top, y);
  }

  // Detect proper crossings between two strokes. Shared endpoints and pen
  // retraces are valid in the original lettering.
  function crossingCount(a,b,hits) {
    let count=0;
    for (let i=1;i<a.length;i++) {
      const p=a[i-1], dx=a[i][0]-p[0], dy=a[i][1]-p[1];
      for (let j=1;j<b.length;j++) {
        const q=b[j-1], ex=b[j][0]-q[0], ey=b[j][1]-q[1];
        const det=dx*ey-dy*ex;
        if (Math.abs(det)<1e-8) continue;
        const x=q[0]-p[0], y=q[1]-p[1], t=(x*ey-y*ex)/det, u=(x*dy-y*dx)/det;
        if (t>1e-8 && t<1-1e-8 && u>1e-8 && u<1-1e-8) {
          count++;
          if (hits) hits.push([p[0]+t*dx,p[1]+t*dy]);
        }
      }
    }
    return count;
  }

  // A script can come within a pen sample of a previous stroke; a fitting
  // tolerance alone cannot preserve that clearance. Constrain the source
  // edges only where fitted spans have introduced an actual new crossing.
  function protectCrossings(parts, points, stems, em) {
    const bounds=parts.map(({first,command}) => {
      const box=emptyBounds();
      include(box,...points[first]);
      for (let k=1;k<command.length;k+=2) include(box,command[k],command[k+1]);
      return box;
    });
    const samples=new Map();
    function flattened(part) {
      if (samples.has(part)) return samples.get(part);
      const {first,last,command}=part, p=points[first], q=points[last], line=[p];
      if (command[0]==='C') flattenCubic(line,p,command.slice(1,3),command.slice(3,5),q,0,em*.0001);
      else line.push(q);
      samples.set(part,line);
      return line;
    }
    let changed=false;
    for (let i=0;i<parts.length;i++) for (let j=i+1;j<parts.length;j++) {
      const a=parts[i], b=parts[j], u=bounds[i], v=bounds[j];
      if ((a.command[0]==='L' && b.command[0]==='L') || u.right<v.left || v.right<u.left ||
          u.top<v.bottom || v.top<u.bottom) continue;
      const hits=[];
      const fitted=crossingCount(flattened(a),flattened(b),hits);
      if (!fitted) continue;
      const originalHits=[];
      crossingCount(points.slice(a.first,a.last+1),points.slice(b.first,b.last+1),originalHits);
      // A pen tip meeting an earlier stroke within the source's coordinate
      // precision is a contact; don't enlarge it into an overhanging tail.
      const original=originalHits.filter(hit => distance(hit,points[0])>em*.0001 &&
        distance(hit,points.at(-1))>em*.0001).length;
      if (fitted<=original) continue;
      for (const part of [a,b]) {
        if (part.command[0]!=='C') continue;
        for (const hit of hits) {
          let best=Infinity, edge=part.first;
          for (let k=part.first;k<part.last;k++) {
            const p=points[k], q=points[k+1], dx=q[0]-p[0], dy=q[1]-p[1];
            const t=Math.max(0,Math.min(1,((hit[0]-p[0])*dx+(hit[1]-p[1])*dy)/(dx*dx+dy*dy)));
            const gap=Math.hypot(hit[0]-p[0]-t*dx,hit[1]-p[1]-t*dy);
            if (gap<best) {best=gap;edge=k;}
          }
          if (!stems[edge]) {stems[edge]=true;changed=true;}
        }
      }
    }
    return changed;
  }

  // Sampled centreline fonts use chords between pen positions. Fit a cubic
  // through each smooth span in font coordinates. Tangents agree at internal
  // splits; genuine corners end the span and keep their own incoming/outgoing
  // direction. The original endpoints and pen lifts remain authoritative.
  function smoothPenPaths(commands, em) {
    const result = [];
    // Pen samples were digitised on a coarse grid. Treat them as observations,
    // not vertices which a stroke must pass through to a fraction of a grid cell.
    const tolerance = em * 0.009;
    const direction = (p, q) => {
      const length = distance(p, q);
      return length ? [(q[0] - p[0]) / length, (q[1] - p[1]) / length] : [0, 0];
    };
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1];
    const moved = (p, v, k) => [p[0] + v[0]*k, p[1] + v[1]*k];
    function fit(points) {
      if (points.length < 2) return;
      const end = points.length - 1;
      const closed = end > 2 && distance(points[0], points[end]) < 1e-7;
      const edges = [], lengths = [], cumulative = [0];
      for (let i = 0; i < end; i++) {
        edges.push(direction(points[i], points[i+1]));
        lengths.push(distance(points[i], points[i+1]));
        cumulative.push(cumulative[i] + lengths[i]);
      }
      // A stroke font describes a stem with one long chord, then uses much
      // shorter chords on the shoulder/bowl. Preserve that straight segment
      // exactly and constrain the neighbouring curve's tangent at the join.
      const stems = lengths.map((length, i) => {
        const prev = i>0 || closed ? (i+end-1)%end : -1;
        const next = i+1<end || closed ? (i+1)%end : -1;
        const neighbours = [prev,next].filter(j => j>=0).map(j => lengths[j]);
        const [dx,dy]=edges[i];
        const axial = Math.min(Math.abs(dx),Math.abs(dy))*length <= em*.001;
        // Engraving alphabets often retrace a serif or crossbar before
        // lifting the pen. A fitted curve here would create a second outline.
        if ([prev,next].some(j => j>=0 && dot(edges[j],edges[i])<-.97)) return true;
        const meetsCorner = [prev,next].some(j => j>=0 && dot(edges[j],edges[i])<.38);
        if (axial && (length>=em*.14 || (length>=em*.055 && meetsCorner))) return true;
        if (length>=em*.12 && neighbours.length && neighbours.every(n => length>=n*1.85)) return true;
        if (length<em*.30) return false;
        // Long diagonals can be adjacent to another equally long diagonal
        // (M/W) or a serif. Only round through a long chord when both sides
        // give evidence that it is part of the same, sparsely sampled arc.
        if (prev<0 || next<0 || neighbours.some(n => n<length*.53)) return true;
        const before=edges[prev], after=edges[next];
        const turnIn=Math.atan2(before[0]*dy-before[1]*dx,dot(before,edges[i]));
        const turnOut=Math.atan2(dx*after[1]-dy*after[0],dot(edges[i],after));
        return !(turnIn*turnOut>0 && Math.min(Math.abs(turnIn),Math.abs(turnOut))>.10 &&
          Math.max(Math.abs(turnIn),Math.abs(turnOut))<1);
      });
      function incoming(i) { return edges[i > 0 ? i-1 : end-1]; }
      function outgoing(i) { return edges[i < end ? i : 0]; }
      function corner(i) {
        if (!closed && (i === 0 || i === end)) return true;
        const a = incoming(i), b = outgoing(i), turn = dot(a,b);
        if (turn < 0.04) return true;
        if (turn < .58 && (stems[(i-1+end)%end] || stems[i%end])) return true;
        // Protect V, W, diagonals and right-angled display lettering. A gentle
        // arc may cross the angle threshold at coarse, widely spaced samples.
        const pre = i > 1 ? edges[i-2] : closed ? edges[(i-2+end)%end] : null;
        const post = i+1 < end ? edges[i+1] : closed ? edges[(i+1)%end] : null;
        const longA = distance(points[i],points[i === 0 ? end-1 : i-1]) > em*.055;
        const longB = distance(points[i],points[i === end ? 1 : i+1]) > em*.055;
        return turn < 0.78 && (longA || longB) && (!pre || dot(pre,a)>.987) && (!post || dot(b,post)>.987);
      }
      function tangent(i) {
        const a = incoming(i), b = outgoing(i);
        if (stems[(i-1+end)%end] && (i!==0 || closed)) return a;
        if (stems[i%end] && (i!==end || closed)) return b;
        return direction([0,0],[a[0]+b[0],a[1]+b[1]]);
      }
      let parts;
      function add(first,last,command) { parts.push({first,last,command}); }
      function segment(first, last, startTangent, endTangent) {
        const p = points[first], q = points[last], baseline = distance(p,q);
        let turning = 0;
        for (let i=first+1;i<last;i++) {
          turning += Math.acos(Math.max(-1,Math.min(1,dot(incoming(i),outgoing(i)))));
        }
        // Divide broad bowls and loops before fitting. A nearly half-circle
        // fitted with a single cubic is underconstrained between samples.
        if ((!baseline || turning>Math.PI*.75) && last-first>1) {
          const centre = (cumulative[first]+cumulative[last])/2;
          let mid=first+1;
          while (mid<last-1 && cumulative[mid]<centre) mid++;
          const join = tangent(mid);
          segment(first,mid,startTangent,join);
          segment(mid,last,join,endTangent);
          return;
        }
        const chord = direction(p,q);
        const exactLine = dot(startTangent,chord)>.99999 && dot(endTangent,chord)>.99999 &&
          points.slice(first+1,last).every(v => Math.abs((v[1]-p[1])*chord[0] - (v[0]-p[0])*chord[1])<.01);
        if (exactLine) { add(first,last,['L',...q]); return; }
        const span = cumulative[last] - cumulative[first];
        const parameters = points.slice(first,last+1).map((_, j) => (cumulative[first+j]-cumulative[first])/span);
        // Orthogonal fitting prevents uneven digitiser spacing from creating
        // another, visibly kinked cubic on what is actually one continuous arc.
        function controls() {
          let aa=0, ab=0, bb=0, ar=0, br=0;
          for (let i=first+1;i<last;i++) {
            const t=parameters[i-first], u=1-t, b1=3*u*u*t, b2=3*u*t*t;
            const a=moved([0,0],startTangent,b1), b=moved([0,0],endTangent,-b2);
            const residual = [
              points[i][0] - ((u*u*u+b1)*p[0] + (t*t*t+b2)*q[0]),
              points[i][1] - ((u*u*u+b1)*p[1] + (t*t*t+b2)*q[1])
            ];
            aa+=dot(a,a); ab+=dot(a,b); bb+=dot(b,b); ar+=dot(a,residual); br+=dot(b,residual);
          }
          const det=aa*bb-ab*ab;
          let left=span/3, right=span/3;
          if (det>1e-10) {
            const l=(ar*bb-br*ab)/det, r=(aa*br-ab*ar)/det;
            if (l>0 && r>0 && l<span*.85 && r<span*.85) { left=l; right=r; }
          }
          return [moved(p,startTangent,left),moved(q,endTangent,-right)];
        }
        let [a,b] = controls();
        for (let pass=0;pass<3 && last-first>2;pass++) {
          const next = parameters.slice();
          for (let j=1;j<parameters.length-1;j++) {
            const t=parameters[j], u=1-t;
            let error=0, slope=0;
            for (let axis=0;axis<2;axis++) {
              const at=cubicAt(p[axis],a[axis],b[axis],q[axis],t);
              const derivative=3*(u*u*(a[axis]-p[axis])+2*u*t*(b[axis]-a[axis])+t*t*(q[axis]-b[axis]));
              error+=(at-points[first+j][axis])*derivative;
              slope+=derivative*derivative;
            }
            if (slope>1e-8) next[j]=Math.max((parameters[j-1]+t)/2,Math.min((t+parameters[j+1])/2,t-error/slope));
          }
          for (let j=1;j<parameters.length-1;j++) parameters[j]=next[j];
          [a,b]=controls();
        }
        let worst=Math.min(tolerance,span*.055), split=-1;
        for (let i=first+1;i<last;i++) {
          const t=parameters[i-first];
          const error=distance(points[i],[cubicAt(p[0],a[0],b[0],q[0],t),cubicAt(p[1],a[1],b[1],q[1],t)]);
          if (error>worst) { worst=error; split=i; }
        }
        if (split>=0) {
          const join=tangent(split);
          segment(first,split,startTangent,join);
          segment(split,last,join,endTangent);
        } else {
          add(first,last,['C',...a,...b,...q]);
        }
      }
      do {
        parts=[];
        let first=0;
        for (let i=1;i<=end;i++) {
          if (i<end && !corner(i) && !stems[i-1] && !stems[i]) continue;
          if (i===first+1 && stems[first]) add(first,i,['L',...points[i]]);
          else segment(first,i,corner(first) ? outgoing(first) : tangent(first),corner(i) ? incoming(i) : tangent(i));
          first=i;
        }
      } while (protectCrossings(parts,points,stems,em));
      for (const {command} of parts) result.push(command);
    }
    let run = [];
    function finish() {
      if (!run.length) return;
      // Preserve native Béziers exactly, including their straight tangents.
      // An accent with authored curves should not prevent smoothing the base.
      if (run.some(c => c[0] === 'C')) { result.push(...run); return; }
      result.push(run[0]);
      const points=[];
      for (const [,x,y] of run) {
        if (!points.length || distance(points.at(-1),[x,y])>1e-7) points.push([x,y]);
      }
      fit(points);
    }
    for (const command of commands) {
      if (command[0]==='M') { finish(); run=[]; }
      run.push(command);
    }
    finish();
    return result;
  }

  function cleanStudioTerminals(commands) {
    // Some Relief stems include a separate 2/1000-em cross-tick centred
    // exactly on their endpoint. It would otherwise be quoted as another tube.
    const endpoints = new Set(commands.filter(c => c[0] !== 'M').map(c => c.at(-2)+','+c.at(-1)));
    const output = [];
    for (let i = 0; i < commands.length; i++) {
      const p = commands[i], q = commands[i+1];
      if (p[0] === 'M' && q?.[0] === 'L' && (!commands[i+2] || commands[i+2][0] === 'M') &&
          Math.hypot(q[1]-p[1],q[2]-p[2]) <= 2 && endpoints.has((p[1]+q[1])/2+','+(p[2]+q[2])/2)) {
        i++;
      } else {
        output.push(p);
      }
    }
    return output;
  }

  function simplifyDots(commands, character, em) {
    const parts = [];
    for (const command of commands) {
      if (command[0] === 'M') parts.push([]);
      parts.at(-1).push(command);
    }
    const decomposed = character.normalize('NFD');
    const letterDot = /^[ij]$/u.test(character) || /[\u0307\u0308]/u.test(decomposed);
    const punctuation = /^[.!?:;…]$/u.test(character);
    if (!letterDot && !punctuation) return commands;
    const bounds = parts.map(part => {
      const box = emptyBounds();
      for (const command of part) {
        for (let i=1;i<command.length;i+=2) include(box,command[i],command[i+1]);
      }
      return box;
    });
    const base = Math.min(...bounds.map(box=>box.bottom));
    const crown = Math.max(...bounds.map(box=>box.top));
    return parts.flatMap((part,index)=>{
      const {left,right,bottom,top}=bounds[index];
      const width=right-left,height=top-bottom;
      if (part.length<3 || Math.max(width,height)>em*.19 || Math.max(width,height)===0) return part;
      if (letterDot && (parts.length<2 || bottom<base+(crown-base)*.58)) return part;
      if (/[!?;]/u.test(character) && (parts.length<2 || top>base+(crown-base)*.34)) return part;
      const x=(left+right)/2,y=(bottom+top)/2;
      // Retain the dot's original vertical extent and give the tool a single open stroke.
      if (height>=width*.65) return [['M',x,bottom],['L',x,top]];
      return [['M',left,y],['L',right,y]];
    });
  }

  function glyphGeometry(fontId, ch, glyph) {
    const cacheKey = fontId + ch;
    if (parsed.has(cacheKey)) return parsed.get(cacheKey);
    let commands = readPath(glyph[1]);
    if (fontId === 'studio') commands = cleanStudioTerminals(commands);
    commands = simplifyDots(commands, ch, globalThis.NeonStrokeFonts[fontId].em);
    if (fontId !== 'orbit') commands = smoothPenPaths(commands, globalThis.NeonStrokeFonts[fontId].em);
    const box = emptyBounds();
    let x = 0, y = 0;
    for (const c of commands) {
      if (c[0] !== 'M') {
        include(box, x, y);
        include(box, c.at(-2), c.at(-1));
      }
      if (c[0] === 'C') {
        for (const t of [...extrema(x, c[1], c[3], c[5]), ...extrema(y, c[2], c[4], c[6])]) {
          if (0 < t && t < 1) include(box, cubicAt(x,c[1],c[3],c[5],t), cubicAt(y,c[2],c[4],c[6],t));
        }
      }
      x = c.at(-2); y = c.at(-1);
    }
    const g = {commands, box, advance:glyph[0]};
    parsed.set(cacheKey, g);
    return g;
  }

  function kerning(fontId, font) {
    if (!kernMaps.has(fontId)) {
      const table = new Map();
      for (const [left, right, k] of font.kerning) {
        for (const l of left) for (const r of right) table.set(l+r, k);
      }
      kernMaps.set(fontId, table);
    }
    return kernMaps.get(fontId);
  }

  // De Casteljau subdivision; both control points must fit inside a 0.01 mm
  // capsule around the chord. The control polygon excess also detects reversals.
  function flattenCubic(out, p, a, b, q, depth = 0, tolerance = 0.01) {
    const dx = q[0]-p[0], dy = q[1]-p[1], chord = distance(p,q);
    const lineDistance = r => chord ? Math.abs(dx*(p[1]-r[1]) - dy*(p[0]-r[0])) / chord : distance(p,r);
    const excess = distance(p,a) + distance(a,b) + distance(b,q) - chord;
    if (depth >= 18 || (excess < tolerance && Math.max(lineDistance(a),lineDistance(b)) < tolerance)) {
      out.push(q);
      return;
    }
    const pa = midpoint(p,a), ab = midpoint(a,b), bq = midpoint(b,q);
    const l = midpoint(pa,ab), r = midpoint(ab,bq), mid = midpoint(l,r);
    flattenCubic(out, p, pa, l, mid, depth+1,tolerance);
    flattenCubic(out, mid, r, bq, q, depth+1,tolerance);
  }

  function sharpBends(commands) {
    let bends=0, start, previous, incoming, firstDirection;
    const direction=(a,b)=>[b[0]-a[0],b[1]-a[1]];
    const angleIsSharp=(a,b)=>{
      if (!a || !b) return false;
      const size=Math.hypot(...a)*Math.hypot(...b);
      return size>0 && (a[0]*b[0]+a[1]*b[1])/size<=Math.SQRT1_2+1e-9;
    };
    function closeRun() {
      if (start && previous && distance(start,previous)<1e-7 && angleIsSharp(incoming,firstDirection)) bends++;
    }
    for (const [type,...coords] of commands) {
      const end=coords.slice(-2);
      if (type==='M') {
        closeRun();
        start=previous=end;
        incoming=firstDirection=null;
        continue;
      }
      const points=[previous];
      for (let i=0;i<coords.length;i+=2) points.push(coords.slice(i,i+2));
      const vectors=points.slice(1).map((point,index)=>direction(points[index],point))
        .filter(vector=>Math.hypot(...vector)>1e-7);
      if (vectors.length) {
        if (angleIsSharp(incoming,vectors[0])) bends++;
        firstDirection ||= vectors[0];
        incoming=vectors.at(-1);
      }
      previous=end;
    }
    closeRun();
    return bends;
  }

  function layout(options = {}) {
    const text = String(options.text ?? '').replace(/\r\n?/g,'\n').normalize('NFC');
    const fontId = options.font ?? fonts[0].id;
    const font = Object.hasOwn(globalThis.NeonStrokeFonts, fontId) ? globalThis.NeonStrokeFonts[fontId] : null;
    const width = Number(options.widthMm ?? 600);
    const tracking = Number(options.letterSpacing ?? 0), leading = Number(options.lineSpacing ?? 1.25);
    const align = options.align ?? 'center';
    const rows = text.split('\n');
    const errors = [], warnings = [], unsupported = [];
    const result = {valid:false, widthMm:0, heightMm:0, lengthMm:0, bendCount:0, tubeMm:TUBE, lineCount:rows.length,
      paths:[], bounds:{x:0,y:0,width:0,height:0}, unsupported, errors, warnings};
    function fail(message) { errors.push(message); warnings.push(message); }
    if (!font) fail('Choose a supported lettering style.');
    if (!text.trim()) fail('Enter the lettering for your sign.');
    if (Array.from(text).length > 80 || rows.length > 4) fail('Use up to 80 characters on a maximum of four lines.');
    if (!(width >= 100 && width <= 3000)) fail('Choose a width from 100 to 3000 mm.');
    if (!(tracking >= 0 && tracking <= 0.30 && leading >= 1 && leading <= 2)) fail('Choose a valid letter and line spacing.');
    if (!['left','center','right'].includes(align)) fail('Choose left, centre or right alignment.');
    if (errors.length) return result;

    const kern = kerning(fontId, font);
    const lines = rows.map(row => {
      const glyphs = [], box = emptyBounds();
      let x = 0, previous = '';
      for (const ch of row) {
        const raw = font.glyphs[ch];
        if (!raw) {
          if (!unsupported.includes(ch)) unsupported.push(ch);
          continue;
        }
        if (previous) x += tracking * font.em - (kern.get(previous + ch) || 0);
        const g = glyphGeometry(fontId, ch, raw);
        if (Number.isFinite(g.box.left)) {
          glyphs.push({x, g, ch});
          include(box, x+g.box.left, g.box.bottom); include(box, x+g.box.right, g.box.top);
        }
        x += g.advance;
        previous = ch;
      }
      return {glyphs, box, span:glyphs.length ? box.right - box.left : 0};
    });
    if (unsupported.length) {
      const greek = fontId !== 'aegean' &&
        unsupported.every(ch => Object.hasOwn(globalThis.NeonStrokeFonts.aegean.glyphs, ch)) &&
        unsupported.some(ch => /\p{Script=Greek}/u.test(ch));
      fail('This style does not contain: ' + unsupported.join(' ') + '. ' +
        (greek ? 'Choose Aegean Greek for Greek lettering.' : 'Change the text or style.'));
      return result;
    }
    const span = Math.max(...lines.map(line => line.span));
    if (span <= 0) {
      fail('This lettering has no measurable horizontal stroke span. Add a character to set its width.');
      return result;
    }
    const scale = (width - TUBE) / span;
    const smallLetter = lines.some(line => line.glyphs.some(({g,ch}) =>
      /[\p{L}\p{N}]/u.test(ch) && (g.box.top-g.box.bottom)*scale < 2*TUBE));
    if (smallLetter) warnings.push('Some lettering has less than 12 mm of stroke height for the 6 mm tube. Increase the width or ask for a shop review.');
    const bounds = emptyBounds();
    for (const [index,line] of lines.entries()) {
      if (!line.glyphs.length) continue;
      const spare = span - line.span;
      line.x = -line.box.left + (align === 'left' ? 0 : align === 'right' ? spare : spare/2);
      line.y = -index * leading * font.em;
      include(bounds, 0, line.y + line.box.bottom);
      include(bounds, span, line.y + line.box.top);
    }
    const height = (bounds.top - bounds.bottom) * scale + TUBE;
    // Limit pathological aspect ratios (e.g. a nearly vertical glyph at 3 m wide).
    // The shop machine dimensions are independent of this numerical safeguard.
    if (height > 100000) {
      fail('This wording produces a sign over 100 metres tall. Choose another style or add lettering.');
      return result;
    }
    const runs = [];
    for (const [index, line] of lines.entries()) {
      for (const {x, g} of line.glyphs) {
        result.bendCount += sharpBends(g.commands);
        let run = null, d = '';
        function finish() {
          if (run && run.length >= 2) {
            runs.push(run);
            result.paths.push({line:index, d});
          }
        }
        for (const cmd of g.commands) {
          const type = cmd[0], coords = [];
          for (let j = 1; j < cmd.length; j += 2) {
            coords.push((line.x+x+cmd[j])*scale+TUBE/2, (bounds.top-line.y-cmd[j+1])*scale+TUBE/2);
          }
          if (type === 'M') { finish(); run = [coords]; d = ''; }
          if (type === 'L' && distance(run.at(-1),coords) > 1e-8) run.push(coords);
          if (type === 'C') flattenCubic(run, run.at(-1), coords.slice(0,2), coords.slice(2,4), coords.slice(4,6));
          d += type + coords.map(number).join(' ');
        }
        finish();
      }
    }
    let minRun = Infinity;
    for (const run of runs) {
      let length = 0;
      for (let i = 1; i < run.length; i++) length += distance(run[i-1],run[i]);
      result.lengthMm += length; minRun = Math.min(minRun, length);
    }
    if (minRun < TUBE) warnings.push('A separate stroke is shorter than 6 mm. The shop should review this detail.');
    result.widthMm = width; result.heightMm = height;
    result.bounds.width = width; result.bounds.height = height;
    result.valid = result.lengthMm > 0;
    if (!result.valid) fail('The lettering has no measurable tube length.');
    // Keep the flattened millimetre runs for CAD export, out of public JSON summaries.
    Object.defineProperty(result, 'runs', {value:runs});
    return result;
  }

  const CUT_STEP = 25;
  function acrylicMargin(widthMm, spec) {
    if (!spec.backing || spec.backing === 'none') return 0;
    const base = spec.boardShape === 'contour' ? (spec.boardGap ?? 30) : 22;
    // The margin doubles between 500 and 3000 mm of nominal finished width.
    const growth = Math.max(0,widthMm+2*base-500)/(2500-2*base);
    return base*(1+Math.min(1,growth));
  }

  function spacerTargets(left,top,right,bottom,inset) {
    const width=right-left, height=bottom-top;
    const columns=width<=800.01?2:width<=2000.01?3:4;
    const targets=[];
    for (let i=0;i<columns;i++) {
      const x=left+inset+(width-2*inset)*i/(columns-1);
      targets.push([x,top+inset],[x,bottom-inset]);
    }
    if (height>1000.01) for (const x of [left+inset,right-inset]) {
      for (const fraction of [1/3,2/3]) targets.push([x,top+height*fraction]);
    }
    return targets;
  }

  function contourPanels(art, gap, factor) {
    const clipper = typeof module === 'object' && module.exports
      ? require('./neon-clipper.js') : globalThis.ClipperLib;
    const scale=100;
    const offset=new clipper.ClipperOffset(2, 0.05*scale);
    for (const run of art.runs) {
      const path=run.map(([x,y])=>({X:Math.round(x*scale),Y:Math.round(y*scale)}));
      offset.AddPath(path,clipper.JoinType.jtRound,clipper.EndType.etOpenRound);
    }
    const result=[];
    // Offset the centreline by the tube radius plus the acrylic clearance.
    offset.Execute(result,(gap+3)*scale);
    const islands = result.filter(clipper.Clipper.Orientation);
    const joined = islands.splice(0,1);
    while (islands.length && joined.length) {
      let closest, shortest = Infinity;
      for (const [index,island] of islands.entries()) {
        for (const path of joined) for (const a of path) for (const b of island) {
          const squared = (a.X-b.X)**2+(a.Y-b.Y)**2;
          if (squared < shortest) { shortest = squared; closest = {index,a,b}; }
        }
      }
      const {index,a,b} = closest;
      const bridge = new clipper.ClipperOffset(2,0.05*scale);
      bridge.AddPath([a,b],clipper.JoinType.jtRound,clipper.EndType.etOpenRound);
      const connection = [];
      bridge.Execute(connection,15*scale);
      const union = new clipper.Clipper();
      union.AddPaths([...joined,islands.splice(index,1)[0],...connection],clipper.PolyType.ptSubject,true);
      const merged = [];
      union.Execute(clipper.ClipType.ctUnion,merged,clipper.PolyFillType.pftNonZero,clipper.PolyFillType.pftNonZero);
      joined.splice(0,joined.length,...merged.filter(clipper.Clipper.Orientation));
    }
    const outlines=[], holes=[];
    let requestedSpacers=0;
    for(const path of joined) {
      outlines.push(path.map(({X,Y})=>[X/scale,Y/scale]));
      const inset=new clipper.ClipperOffset(2,0.05*scale);
      inset.AddPath(path,clipper.JoinType.jtRound,clipper.EndType.etClosedPolygon);
      const mountArea=[];
      const edge=15*factor;
      inset.Execute(mountArea,-edge*scale);
      const points=outlines.at(-1);
      const xs=points.map(point=>point[0]), ys=points.map(point=>point[1]);
      const targets=spacerTargets(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys),edge);
      requestedSpacers+=targets.length;
      const candidates=mountArea.flat().map(({X,Y})=>[X/scale,Y/scale]);
      // Search nearer points first because contoured edges may have valleys or no acrylic at a nominal corner.
      for (const target of targets) {
        candidates.sort((a,b)=>distance(a,target)-distance(b,target));
        const point=candidates.find(([X,Y])=>holes.every(hole=>distance(hole,[X,Y])>=20*factor) &&
          art.runs.every(run=>run.every(([x,y],i)=>{
            const [ax,ay]=run[i-1] || run[i], dx=x-ax, dy=y-ay;
            const t=Math.max(0,Math.min(1,((X-ax)*dx+(Y-ay)*dy)/(dx*dx+dy*dy || 1)));
            return Math.hypot(X-ax-t*dx,Y-ay-t*dy)>=11*factor;
          })));
        if (point) holes.push(point);
      }
    }
    return {outline:outlines[0] || [],outlines,holes,wall:true,pad:gap+15,requestedSpacers};
  }

  function backboard(art, spec) {
    if (!spec.backing || spec.backing === 'none') return null;
    const w=art.widthMm, h=art.heightMm, pad=acrylicMargin(w,spec);
    const base=spec.boardShape==='contour' ? (spec.boardGap ?? 30) : 22;
    const factor=pad/base;
    if (spec.boardShape === 'contour') return contourPanels(art,pad,factor);
    const radius=20;
    const corners=[[-pad+radius,-pad+radius],[w+pad-radius,-pad+radius],
      [w+pad-radius,h+pad-radius],[-pad+radius,h+pad-radius]];
    function corner([x,y],i) {
      return Array.from({length:17},(_,j)=>{
        const angle=Math.PI/2*(i+2+j/16);
        return [x+radius*Math.cos(angle),y+radius*Math.sin(angle)];
      });
    }
    const outline=corners.flatMap(corner);
    const wall=spec.mount==='wall', holes=[];
    if (wall) {
      holes.push(...spacerTargets(-pad,-pad,w+pad,h+pad,15*factor));
    } else if (spec.mount==='suspended') {
      for (const x of [w*.16,w*.84]) holes.push([x,-pad+15]);
    }
    return {outline,outlines:[outline],holes,wall,pad};
  }

  function finishedSize(art, board, spec) {
    let left=0, top=0, right=art.widthMm, bottom=art.heightMm, areaMm2=0;
    if (board) {
      left=Infinity; top=Infinity; right=-Infinity; bottom=-Infinity;
      for (const outline of board.outlines) {
        let signedArea=0;
        for (const [index,[x,y]] of outline.entries()) {
          const [nextX,nextY]=outline[(index+1)%outline.length];
          signedArea+=x*nextY-nextX*y;
          left=Math.min(left,x); top=Math.min(top,y);
          right=Math.max(right,x); bottom=Math.max(bottom,y);
        }
        areaMm2+=Math.abs(signedArea)/2;
      }
    }
    const widthMm=right-left, heightMm=bottom-top;
    const finishedHeight=heightMm+(board && spec.mount==='freestanding' ? 13 : 0);
    const withinLimit=widthMm<=3000.00001 && finishedHeight<=2000.00001;
    const tier=widthMm<=1200.00001 ? 120 : widthMm<=2400.00001 ? 240 : 300;
    return {left,top,right,bottom,widthMm,heightMm,finishedHeight,areaMm2,withinLimit,tier};
  }

  function svg(design, spec = {}) {
    let {color = '#262626', cover, power = true} = spec;
    if (!design.valid) throw new Error('Complete the design before exporting it.');
    if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) color = '#262626';
    const hasCover = typeof cover === 'string' && /^#[0-9a-f]{6}$/i.test(cover);
    const stroke = hasCover && !power ? cover : color;
    const layer = 'TUBE_CENTERLINE_6MM';
    const description = [];
    if (hasCover) description.push('Indoor use only. Silicone cover: ' + cover + '. LED colour: ' + color + '.');
    const board = backboard(design,spec);
    const pad = board?.pad ?? 0;
    const w = number(design.widthMm+2*pad), h = number(design.heightMm+2*pad);
    const boardSvg = board ? '<g id="ACRYLIC_OUTLINE" fill="none" stroke="#718398" stroke-width="0.4">' +
      board.outlines.map(outline=>'<polygon points="'+outline.map(([x,y])=>number(x)+','+number(y)).join(' ')+'"/>').join('')+'<g id="MOUNT_HOLES">'+
      board.holes.map(([x,y])=>'<circle cx="'+number(x)+'" cy="'+number(y)+'" r="'+(board.wall?5.5:2.5)+'"/>').join('')+'</g></g>' : '';
    // A CSS backdrop makes white LEDs and silicone visible in standalone proofs
    // without adding an object that a cutting program could interpret as a path.
    const backdrop = hasCover ? ' style="background-color:#25272c"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'mm" height="'+h+'mm" viewBox="'+(-pad)+' '+(-pad)+' '+w+' '+h+'"'+backdrop+'>\n'
      + (description.length ? '<desc>' + description.join(' ') + '</desc>\n' : '')
      + boardSvg + '<g id="'+layer+'" fill="none" stroke="'+stroke+'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">\n'
      + design.paths.map(path => {
          const selected = spec.lineColors?.[path.line];
          const lineStroke = power && /^#[0-9a-f]{6}$/i.test(selected || '') ? ' stroke="'+selected+'"' : '';
          return '  <path d="'+path.d+'"'+lineStroke+'/>';
        }).join('\n')+'\n</g>\n</svg>\n';
  }

  function dxf(design, spec = {}) {
    if (!design.valid || !design.runs) throw new Error('Complete the design before exporting it.');
    const tubeLayer = 'TUBE_CENTERLINE_6MM';
    const board = backboard(design,spec);
    const layers = ['0',tubeLayer];
    if (board) layers.push('ACRYLIC_OUTLINE');
    if (board?.holes.length) layers.push('MOUNT_HOLES');
    const groups = [0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',9,'$LUNITS',70,2,
      9,'$MEASUREMENT',70,1,0,'ENDSEC',
      0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',70,1,
      0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',
      0,'TABLE',2,'LAYER',70,layers.length];
    for (const [index,layer] of layers.entries()) groups.push(0,'LAYER',2,layer,70,0,62,[7,7,3,4][index],6,'CONTINUOUS');
    groups.push(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
    function polyline(points,layer,closed) {
      groups.push(0,'POLYLINE',8,layer,66,1,10,0,20,0,30,0,70,closed?1:0);
      for (const [x,y] of points) groups.push(0,'VERTEX',8,layer,10,number(x),20,number(design.heightMm-y),30,0,70,0);
      groups.push(0,'SEQEND',8,layer);
    }
    for (const run of design.runs) {
      const closed = run.length>2 && distance(run[0],run.at(-1)) < 0.00001;
      polyline(closed ? run.slice(0,-1) : run,tubeLayer,closed);
    }
    if (board) {
      for (const outline of board.outlines) polyline(outline,'ACRYLIC_OUTLINE',true);
      for (const [x,y] of board.holes) {
        groups.push(0,'CIRCLE',8,'MOUNT_HOLES',10,number(x),20,number(design.heightMm-y),30,0,40,board.wall?5.5:2.5);
      }
    }
    groups.push(0,'ENDSEC',0,'EOF');
    return groups.join('\r\n')+'\r\n';
  }

  globalThis.NeonGeometry = {fonts, layout, svg, dxf, backboard, finishedSize, acrylicMargin};
})();
