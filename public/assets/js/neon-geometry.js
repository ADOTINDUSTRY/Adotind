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

  function glyphGeometry(fontId, ch, glyph) {
    const cacheKey = fontId + ch;
    if (parsed.has(cacheKey)) return parsed.get(cacheKey);
    let commands = readPath(glyph[1]);
    if (fontId === 'studio') commands = cleanStudioTerminals(commands);
    if (fontId !== 'studio' && fontId !== 'atelier' && fontId !== 'orbit') commands = smoothPenPaths(commands, globalThis.NeonStrokeFonts[fontId].em);
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

  // De Casteljau subdivision; both control points must fit inside a 0.025 mm
  // capsule around the chord. The control polygon excess also detects reversals.
  function flattenCubic(out, p, a, b, q, depth = 0, tolerance = 0.025) {
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

  function layout(options = {}, cutStrokes = null) {
    const text = String(options.text ?? '').replace(/\r\n?/g,'\n').normalize('NFC');
    const fontId = options.font ?? fonts[0].id;
    const font = Object.hasOwn(globalThis.NeonStrokeFonts, fontId) ? globalThis.NeonStrokeFonts[fontId] : null;
    const width = Number(options.widthMm ?? 600);
    const tracking = Number(options.letterSpacing ?? 0), leading = Number(options.lineSpacing ?? 1.25);
    const align = options.align ?? 'center';
    const rows = text.split('\n');
    const errors = [], warnings = [], unsupported = [];
    const result = {valid:false, widthMm:0, heightMm:0, lengthMm:0, tubeMm:TUBE, lineCount:rows.length,
      paths:[], bounds:{x:0,y:0,width:0,height:0}, unsupported, errors, warnings};
    function fail(message) { errors.push(message); warnings.push(message); }
    if (!font) fail('Choose a supported lettering style.');
    if (!text.trim()) fail('Enter the lettering for your sign.');
    if (Array.from(text).length > 80 || rows.length > 4) fail('Use up to 80 characters on a maximum of four lines.');
    if (!(width >= 200 && width <= 3000)) fail('Choose a width from 200 to 3000 mm.');
    if (!(tracking >= 0 && tracking <= 0.30 && leading >= 1 && leading <= 2)) fail('Choose a valid letter and line spacing.');
    if (!['left','center','right'].includes(align)) fail('Choose left, centre or right alignment.');
    if (errors.length) return result;

    const kern = kerning(fontId, font);
    const lines = rows.map(row => {
      const glyphs = [], box = emptyBounds();
      let x = 0, previous = '';
      for (const [charIndex,ch] of Array.from(row).entries()) {
        const raw = font.glyphs[ch];
        if (!raw) {
          if (!unsupported.includes(ch)) unsupported.push(ch);
          continue;
        }
        if (previous) x += tracking * font.em - (kern.get(previous + ch) || 0);
        const g = glyphGeometry(fontId, ch, raw);
        if (Number.isFinite(g.box.left)) {
          glyphs.push({x, g, ch, charIndex});
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
      for (const {x, g, ch, charIndex} of line.glyphs) {
        let run = null, d = '', commands, runIndex=0;
        function finish() {
          if (cutStrokes && run) {
            cutStrokes.push({line:index, character:ch, charIndex, runIndex:runIndex++,
              commands, run, pathIndex:run.length>=2 ? runs.length : null});
          }
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
          if (type === 'M') { finish(); run = [coords]; d = ''; if(cutStrokes) commands=[]; }
          if (cutStrokes) commands.push([type,...coords]);
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
  const CUT_EPS = 0.0001; // Numerical tolerance in mm, never an allowance for rounding a cut.
  const MAX_TRIM = 3;

  function interpolate(a,b,t) {
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }

  // Gauss-Legendre integration of cubic speed. An identical curve measured at
  // another sign size must scale uniformly; reusing the coarser preview chords
  // here can put a closed loop on the wrong side of a cut mark.
  function arcLength(p,a,b,q) {
    function integrate(lo,hi) {
      const mid=(hi+lo)/2, half=(hi-lo)/2;
      function speed(t) {
        const u=1-t;
        return 3*Math.hypot(u*u*(a[0]-p[0])+2*u*t*(b[0]-a[0])+t*t*(q[0]-b[0]),
          u*u*(a[1]-p[1])+2*u*t*(b[1]-a[1])+t*t*(q[1]-b[1]));
      }
      const k1=.5384693101056831*half, k2=.9061798459386640*half;
      return half*(.5688888888888889*speed(mid)+
        .4786286704993665*(speed(mid-k1)+speed(mid+k1))+
        .2369268850561891*(speed(mid-k2)+speed(mid+k2)));
    }
    function refine(lo,hi,whole,depth) {
      const mid=(lo+hi)/2, left=integrate(lo,mid), right=integrate(mid,hi);
      if (depth>=14 || Math.abs(left+right-whole)<1e-9*(hi-lo)+1e-11*(left+right)) return left+right;
      return refine(lo,mid,left,depth+1)+refine(mid,hi,right,depth+1);
    }
    return refine(0,1,integrate(0,1),0);
  }

  function strokeLength(commands) {
    let at=commands[0].slice(1), length=0;
    for (const c of commands.slice(1)) {
      const end=c.slice(-2);
      length+=c[0]==='C' ? arcLength(at,c.slice(1,3),c.slice(3,5),end) : distance(at,end);
      at=end;
    }
    return length;
  }

  function pointSegmentDistance(p,a,b) {
    const dx=b[0]-a[0], dy=b[1]-a[1], square=dx*dx+dy*dy;
    const t=square ? Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/square)) : 0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }

  // Only the clear, straight portion of a free terminal can lose material.
  // Protect the four overall extents, junctions, adjacent letters, and any
  // returning portion of the same path. No curvature is fitted or moved.
  function freeTerminal(stroke,start,design) {
    const {commands,run}=stroke;
    if (commands.length<2 || distance(run[0],run.at(-1))<CUT_EPS) return null;
    if ((start ? commands[1] : commands.at(-1))[0]!=='L') return null;
    const from=start ? run[0] : run.at(-1);
    const toward=(start ? commands[1] : commands.at(-2)).slice(-2);
    if (distance(from,toward)<=CUT_EPS) return null;
    const width=design.widthMm, height=design.heightMm;
    if ([width,height].some((extent,axis) => Math.abs(from[axis]-toward[axis])>CUT_EPS &&
      (Math.abs(from[axis]-TUBE/2)<CUT_EPS || Math.abs(from[axis]-extent+TUBE/2)<CUT_EPS))) return null;
    return {from,toward};
  }

  function terminalCapacity(stroke,start,strokes,design) {
    const tip=freeTerminal(stroke,start,design);
    if (!tip) return 0;
    const {from,toward}=tip;
    let capacity=Math.min(MAX_TRIM,distance(from,toward)/2);
    for (const other of strokes) {
      const box=other.box, reach=TUBE+capacity+.025;
      if (from[0]+reach<box.left || from[0]-reach>box.right || from[1]+reach<box.bottom || from[1]-reach>box.top) continue;
      for (let i=1;i<other.run.length;i++) {
        if (other===stroke && i===(start ? 1 : stroke.run.length-1)) continue;
        capacity=Math.min(capacity,pointSegmentDistance(from,other.run[i-1],other.run[i])-TUBE-.025);
        if (capacity<=CUT_EPS) return 0;
      }
    }
    return Math.max(0,capacity);
  }

  // Preserve the same SVG curves while bounding the aggregate loss of arc
  // length introduced by tessellating a completed strip into DXF chords.
  function cutPolyline(commands) {
    const points=[commands[0].slice(1)];
    const budget=.003/Math.max(1,commands.filter(c=>c[0]==='C').length);
    function add(p,a,b,q,allowance,depth) {
      const chord=distance(p,q), excess=distance(p,a)+distance(a,b)+distance(b,q)-chord;
      if (depth>=22 || (excess<=allowance && Math.max(pointSegmentDistance(a,p,q),pointSegmentDistance(b,p,q))<=.025)) {
        points.push(q);return;
      }
      const pa=midpoint(p,a), ab=midpoint(a,b), bq=midpoint(b,q);
      const l=midpoint(pa,ab), r=midpoint(ab,bq), mid=midpoint(l,r);
      add(p,pa,l,mid,allowance/2,depth+1);add(mid,r,bq,q,allowance/2,depth+1);
    }
    for (const c of commands.slice(1)) {
      const q=c.slice(-2), p=points.at(-1);
      if(c[0]==='C') add(p,c.slice(1,3),c.slice(3,5),q,budget,0);
      else if(distance(p,q)>1e-10) points.push(q);
    }
    return points;
  }

  function cutLayout(options={}, limits={}) {
    const strokes=[], design=layout(options,strokes);
    if (!design.valid) return design;
    for (const stroke of strokes) {
      stroke.length=strokeLength(stroke.commands);
      stroke.box=emptyBounds();
      for (const [x,y] of stroke.run) include(stroke.box,x,y);
    }
    const pieces=strokes.map((stroke,index) => {
      const {character,line,charIndex,runIndex,length}=stroke;
      const modules=Math.max(1,Math.round(length/CUT_STEP));
      let cutMm=modules*CUT_STEP, ready=Math.abs(length-cutMm)<=CUT_EPS;
      const lower=CUT_STEP*Math.floor(length/CUT_STEP), excess=length-lower;
      if (!ready && lower>=CUT_STEP && excess<=Math.min(MAX_TRIM,length*.02)) {
        const start=terminalCapacity(stroke,true,strokes,design), end=terminalCapacity(stroke,false,strokes,design);
        if (excess<=start+end) {
          stroke.trimStart=Math.max(excess-end,Math.min(excess/2,start));
          stroke.trimEnd=excess-stroke.trimStart;
          cutMm=lower;ready=true;
        }
      }
      return {index,character,line,charIndex,runIndex,lengthMm:length,cutMm:ready ? cutMm : null,
        modules:ready ? cutMm/CUT_STEP : null,ready,reason:ready ? null : length<CUT_STEP ? 'too-short' : 'off-mark'};
    });
    const ready=pieces.every(piece=>piece.ready);
    const plan={stepMm:CUT_STEP,ready,pieces,suggestedWidthMm:null,totalCutMm:ready ? pieces.reduce((s,p)=>s+p.cutMm,0) : null};
    design.cutPlan=plan;
    if (!ready) {
      plan.error='Each separate LED strip needs a cut length of 25 mm or a whole multiple of 25 mm.';
      design.errors.push(plan.error);design.valid=false;
      if (limits.suggestions!==false) plan.suggestedWidthMm=suggestCutWidth(options,limits,strokes,design);
      return design;
    }
    for (const stroke of strokes) {
      const c=stroke.commands;
      const start=c[0].slice(1), end=c.at(-1).slice(-2);
      const startTowards=c.length>1 ? c[1].slice(-2) : start, endTowards=c.at(-2).slice(-2);
      if(stroke.trimStart) c[0]=['M',...interpolate(start,startTowards,stroke.trimStart/distance(start,startTowards))];
      if(stroke.trimEnd) c[c.length-1]=['L',...interpolate(end,endTowards,stroke.trimEnd/distance(end,endTowards))];
      design.paths[stroke.pathIndex].d=c.map(cmd=>cmd[0]+cmd.slice(1).map(cutNumber).join(' ')).join('');
      design.runs[stroke.pathIndex]=cutPolyline(c);
    }
    design.lengthMm=plan.totalCutMm;
    return design;
  }

  function cutNumber(value) { return String(Math.round(value*1e6)/1e6); }

  // Each run permits a sequence of scale intervals. A loop permits only the
  // exact scale for each cut mark; a clear straight tip permits a small trim.
  // Intersect these intervals before rebuilding any suggested production art.
  function suggestCutWidth(options,limits,strokes,design) {
    const min=Math.max(200,limits.minWidth??200), max=Math.min(3000,limits.maxWidth??3000);
    if (min>max || strokes.some(s=>s.length<=CUT_EPS)) return null;
    const span=design.widthMm-TUBE, minScale=(min-TUBE)/span, maxScale=(max-TUBE)/span;
    const constraints=strokes.map(s=>({
      length:s.length, rigid:!freeTerminal(s,true,design) && !freeTerminal(s,false,design)
    })).sort((a,b)=>Number(b.rigid)-Number(a.rigid) || a.length-b.length);
    const anchor=constraints[0];
    function maxLength(target,rigid) { return rigid ? target : Math.min(target+MAX_TRIM,target/.98); }
    function firstMark(length,rigid) {
      return Math.max(1,Math.ceil((length-(rigid ? 0 : MAX_TRIM)-CUT_EPS)/CUT_STEP));
    }
    function lastMark(length) { return Math.floor((length+CUT_EPS)/CUT_STEP); }
    const low=firstMark(anchor.length*minScale,anchor.rigid), high=lastMark(anchor.length*maxScale);
    const midpointMark=anchor.length/CUT_STEP;
    let left=Math.min(high,Math.floor(midpointMark)), right=Math.max(low,Math.floor(midpointMark)+1);
    const attempted=new Set();
    // Traverse outwards so either end of the configured range is reachable.
    // Extremely tall, narrow signs may have thousands of possible cut marks.
    for (let examined=0; examined<2000 && (left>=low || right<=high); examined++) {
      const useLeft=left>=low && (right>high || midpointMark-left<=right-midpointMark);
      const target=(useLeft ? left-- : right++)*CUT_STEP;
      const from=Math.max(minScale,target/anchor.length);
      const to=Math.min(maxScale,maxLength(target,anchor.rigid)/anchor.length);
      if (from>to+1e-12) continue;
      let intervals=[[from,to]];
      for (const {length,rigid} of constraints.slice(1)) {
        const shared=[];
        for (const [lo,hi] of intervals) {
          const last=lastMark(hi*length);
          for (let n=firstMark(lo*length,rigid);n<=last;n++) {
            const start=Math.max(lo,n*CUT_STEP/length);
            const end=Math.min(hi,maxLength(n*CUT_STEP,rigid)/length);
            if (start<=end+1e-12) shared.push([start,end]);
          }
        }
        intervals=shared;
        if (!intervals.length) break;
      }
      for (const [lo,hi] of intervals) {
        // Try the closest point to the chosen sign size, then the point that
        // requires the least trimming. Final checks enforce actual clearances.
        for (const scale of [Math.max(lo,Math.min(1,hi)),lo]) {
          const proposed=Number((TUBE+span*scale).toFixed(7));
          if (proposed<min || proposed>max || proposed===design.widthMm || attempted.has(proposed)) continue;
          attempted.add(proposed);
          if (cutLayout({...options,widthMm:proposed},{suggestions:false}).cutPlan?.ready) return proposed;
          if (attempted.size>=30) return null;
        }
      }
    }
    return null;
  }

  function svg(design, {color = '#262626', cover, power = true, reviewOnly = false} = {}) {
    if (!design.valid) throw new Error('Complete the design before exporting it.');
    if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) color = '#262626';
    const hasCover = typeof cover === 'string' && /^#[0-9a-f]{6}$/i.test(cover);
    const stroke = hasCover && !power ? cover : color;
    const layer = reviewOnly ? 'VISUAL_REVIEW_ONLY' : 'TUBE_CENTERLINE_6MM';
    const description = [];
    if (hasCover) description.push('Indoor use only. Silicone cover: ' + cover + '. LED colour: ' + color + '.');
    if (reviewOnly) description.push('Strip lengths require review before cutting.');
    const w = number(design.widthMm), h = number(design.heightMm);
    // A CSS backdrop makes white LEDs and silicone visible in standalone proofs
    // without adding an object that a cutting program could interpret as a path.
    const backdrop = hasCover ? ' style="background-color:#25272c"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'mm" height="'+h+'mm" viewBox="0 0 '+w+' '+h+'"'+backdrop+'>\n'
      + (reviewOnly ? '<title>Artwork for shop review only</title>\n' : '')
      + (description.length ? '<desc>' + description.join(' ') + '</desc>\n' : '')
      + '<g id="'+layer+'" fill="none" stroke="'+stroke+'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">\n'
      + design.paths.map(path => '  <path d="'+path.d+'"/>').join('\n')+'\n</g>\n</svg>\n';
  }

  function dxf(design) {
    if (!design.valid || !design.runs) throw new Error('Complete the design before exporting it.');
    const layer = 'TUBE_CENTERLINE_6MM';
    const groups = [0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,0,'ENDSEC',
      0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',5,'2',330,'0',100,'AcDbSymbolTable',70,1,0,'LAYER',5,'31',330,'2',100,'AcDbSymbolTableRecord',
      100,'AcDbLayerTableRecord',2,layer,70,0,62,7,6,'CONTINUOUS',0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
    for (const [index,run] of design.runs.entries()) {
      const closed = run.length>2 && distance(run[0],run.at(-1)) < 0.00001;
      const points = closed ? run.slice(0,-1) : run;
      groups.push(0,'LWPOLYLINE',5,(0x100+index).toString(16),100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,points.length,70,closed ? 1 : 0);
      const format=design.cutPlan ? cutNumber : number;
      for (const p of points) groups.push(10,format(p[0]),20,format(design.heightMm-p[1]));
    }
    groups.push(0,'ENDSEC',0,'EOF');
    return groups.join('\r\n')+'\r\n';
  }

  globalThis.NeonGeometry = {fonts, layout, cutLayout, svg, dxf};
})();
