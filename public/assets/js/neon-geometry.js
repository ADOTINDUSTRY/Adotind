/* Millimetre geometry shared by the browser editor and the server-side proof generator. */
(() => {
  'use strict';

  const TUBE = 6;
  const fonts = [
    {id:'signature', label:'Signature'}, {id:'studio', label:'Studio Sans'},
    {id:'capitol', label:'Capitol Script'}, {id:'hand', label:'Handwritten'},
    {id:'deco', label:'Art Deco'}, {id:'orbit', label:'Orbit'},
    {id:'aegean', label:'Aegean Greek'}
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

  // The plotted script faces sample pen curves as short chords. Interpolate
  // their shallow turns through the original points. Keep deliberate corners,
  // pen lifts and stroke endpoints, and limit handles beside short segments.
  function interpolatedScript(commands) {
    const result = [];
    let points = [];
    function finish() {
      if (!points.length) return;
      result.push(['M', ...points[0]]);
      const last = points.length - 1;
      const closed = last > 2 && distance(points[0], points[last]) < 1e-7;
      function handle(i, neighbour) {
        const p = points[i], edge = points[neighbour];
        const before = i > 0 ? points[i-1] : closed ? points[last-1] : null;
        const after = i < last ? points[i+1] : closed ? points[1] : null;
        const straight = [p[0] + (edge[0]-p[0])/3, p[1] + (edge[1]-p[1])/3];
        if (!before || !after) return straight;
        const a = distance(before, p), b = distance(p, after);
        const inX = (p[0]-before[0])/a, inY = (p[1]-before[1])/a;
        const outX = (after[0]-p[0])/b, outY = (after[1]-p[1])/b;
        const cosine = inX*outX + inY*outY;
        if (cosine < 0.26 || cosine > 0.99999) return straight;
        const tx = inX+outX, ty = inY+outY;
        const reach = Math.min(distance(p,edge), 2*Math.min(a,b)) / (3*Math.hypot(tx,ty));
        const k = neighbour > i ? reach : -reach;
        return [p[0]+tx*k, p[1]+ty*k];
      }
      for (let i = 1; i <= last; i++) {
        const p = points[i-1], q = points[i];
        const a = handle(i-1, i), b = handle(i, i-1);
        const cross = r => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]);
        if (Math.abs(cross(a)) + Math.abs(cross(b)) < 1e-7) result.push(['L', ...q]);
        else result.push(['C', ...a, ...b, ...q]);
      }
      points = [];
    }
    // Curves supplied by the type designer take precedence over interpolation.
    if (commands.some(c => c[0] === 'C')) return commands;
    for (const [op, x, y] of commands) {
      if (op === 'M') finish();
      if (!points.length || distance(points.at(-1), [x,y]) > 1e-7) points.push([x,y]);
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
    if (['signature','capitol','hand'].includes(fontId)) commands = interpolatedScript(commands);
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
  function flattenCubic(out, p, a, b, q, depth = 0) {
    const dx = q[0]-p[0], dy = q[1]-p[1], chord = distance(p,q);
    const lineDistance = r => chord ? Math.abs(dx*(p[1]-r[1]) - dy*(p[0]-r[0])) / chord : distance(p,r);
    const excess = distance(p,a) + distance(a,b) + distance(b,q) - chord;
    if (depth >= 18 || (excess < 0.025 && Math.max(lineDistance(a),lineDistance(b)) < 0.025)) {
      out.push(q);
      return;
    }
    const pa = midpoint(p,a), ab = midpoint(a,b), bq = midpoint(b,q);
    const l = midpoint(pa,ab), r = midpoint(ab,bq), mid = midpoint(l,r);
    flattenCubic(out, p, pa, l, mid, depth+1);
    flattenCubic(out, mid, r, bq, q, depth+1);
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

  function svg(design, {color = '#262626'} = {}) {
    if (!design.valid) throw new Error('Complete the design before exporting it.');
    if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) color = '#262626';
    const w = number(design.widthMm), h = number(design.heightMm);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'mm" height="'+h+'mm" viewBox="0 0 '+w+' '+h+'">\n'
      + '<g id="TUBE_CENTERLINE_6MM" fill="none" stroke="'+color+'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">\n'
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
      for (const p of points) groups.push(10,number(p[0]),20,number(design.heightMm-p[1]));
    }
    groups.push(0,'ENDSEC',0,'EOF');
    return groups.join('\r\n')+'\r\n';
  }

  globalThis.NeonGeometry = {fonts, layout, svg, dxf};
})();
