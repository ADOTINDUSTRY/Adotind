const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {measure} = require('../app/cli/neon-measure.cjs');
const geometry = globalThis.NeonGeometry;

const design = {
  version: 1, text: 'Café\nOpen', font: 'signature', widthMm: 700, align: 'center',
  letterSpacing: 0, lineSpacing: 1.25, color: '#FF488D', backing: 'clear',
  mount: 'wall', brightness: 85, scene: 'studio', power: true,
};

function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual-expected) <= tolerance, actual + ' differs from ' + expected);
}

// Read exported CAD entities without access to the layout engine's point lists.
function polylines(dxf) {
  const groups = dxf.trim().split(/\r?\n/);
  const entities = [];
  let current = null;
  let record = '';
  for (let i = 0; i < groups.length; i += 2) {
    const code = Number(groups[i]), value = groups[i+1];
    if (code === 0) {
      record = value;
      if (record === 'POLYLINE') {
        current = {points: []};
        entities.push(current);
      } else if (record !== 'VERTEX') current = null;
    }
    if (!current) continue;
    if (record === 'POLYLINE' && code === 8) current.layer = value;
    if (record === 'POLYLINE' && code === 70) current.closed = Number(value) === 1;
    if (record === 'VERTEX' && code === 10) current.points.push([Number(value)]);
    if (record === 'VERTEX' && code === 20) current.points.at(-1).push(Number(value));
    current.count = current.points.length;
  }
  return entities;
}

test('all fonts keep a physical 6 mm tube at every sign size and export matching CAD', () => {
  const samples = new Set();
  for (const {id} of geometry.fonts) {
    for (const widthMm of [200, 657.3, 3000]) {
      const layout = geometry.layout({...design, font: id, widthMm});
      assert.equal(layout.valid, true, id);
      assert.equal(layout.tubeMm, 6);
      const svg = geometry.svg(layout, {color: '#ff488d'});
      assert.match(svg, /fill="none" stroke="#ff488d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/);
      assert.ok(svg.includes('width="' + widthMm + 'mm"'));
      assert.doesNotMatch(svg, /<text|<use|transform=/);
      assert.equal((svg.match(/<path /g) || []).length, layout.paths.length);
      const cad = geometry.dxf(layout);
      assert.match(cad, /\$MEASUREMENT\r\n70\r\n1\r\n/);
      const entities = polylines(cad);
      assert.equal(entities.length, layout.paths.length);
      let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity, length = 0;
      for (const line of entities) {
        assert.equal(line.layer, 'TUBE_CENTERLINE_6MM');
        assert.equal(line.count, line.points.length);
        const points = line.closed ? [...line.points, line.points[0]] : line.points;
        for (let i = 0; i < points.length; i++) {
          const [x, y] = points[i];
          left = Math.min(left,x); bottom = Math.min(bottom,y);
          right = Math.max(right,x); top = Math.max(top,y);
          if (i) length += Math.hypot(x-points[i-1][0], y-points[i-1][1]);
        }
      }
      near(left, 3, 0.026); near(right + 3, widthMm, 0.026);
      near(bottom, 3, 0.026); near(top + 3, layout.heightMm, 0.026);
      near(length, layout.lengthMm, 0.02);
      const first = /^M([-\d.]+) ([-\d.]+)/.exec(layout.paths[0].d);
      near(entities[0].points[0][0], Number(first[1]), 0.0002);
      near(entities[0].points[0][1], layout.heightMm - Number(first[2]), 0.0002);
      if (widthMm === 200) samples.add(layout.paths[0].d);
    }
  }
  assert.equal(samples.size, geometry.fonts.length);
});

test('spacing, alignment, profiles and curves use the physical path geometry', () => {
  function firstX(align) {
    const layout = geometry.layout({...design, text:'Happy\nA', align});
    return Number(/^M([-\d.]+)/.exec(layout.paths.find(p => p.line === 1).d)[1]);
  }
  const left = firstX('left'), middle = firstX('center'), right = firstX('right');
  assert.ok(left < middle && middle < right);
  near(middle, (left+right)/2, 0.0002);
  const base = geometry.layout(design);
  assert.ok(geometry.layout({...design,lineSpacing:2}).heightMm > base.heightMm);
  assert.ok(geometry.layout({...design,letterSpacing:0.25}).lengthMm < base.lengthMm);
  for (const id of ['signature','studio','capitol','hand']) {
    assert.ok(geometry.layout({...design,text:'Hello',font:id}).paths.some(p => p.d.includes('C')), id);
  }
  const crowded = geometry.layout({...design,text:'Wide'.repeat(20),widthMm:200});
  assert.equal(crowded.valid, true);
  assert.ok(crowded.warnings.some(w => w.includes('12 mm')));
  assert.equal(geometry.layout({...design,text:'Hi',font:'studio'}).paths.length,5);
  assert.equal(measure({...design,text:'Cafe\u0301'},'review').design.text, 'Café');
  assert.ok(!geometry.svg(base, {color:'" onload="alert(1)'}).includes('onload'));
});

test('fitted round letters have tangent-continuous curves while display corners and pen lifts survive', () => {
  const lettering = (font,text) => geometry.layout({...design,font,text});
  const round = lettering('deco','O').paths[0].d;
  const commands = Array.from(round.matchAll(/([MLC])([^MLC]+)/g), match => ({
    type:match[1], coords:match[2].trim().split(/\s+/).map(Number)
  }));
  assert.equal(commands[0].type,'M');
  assert.ok(commands.length > 3 && commands.slice(1).every(c => c.type === 'C'));
  let at = commands[0].coords, lastControl;
  for (const {coords} of commands.slice(1)) {
    if (lastControl) {
      const incoming = [at[0]-lastControl[0],at[1]-lastControl[1]];
      const outgoing = [coords[0]-at[0],coords[1]-at[1]];
      const cosine = (incoming[0]*outgoing[0] + incoming[1]*outgoing[1]) /
        (Math.hypot(...incoming)*Math.hypot(...outgoing));
      assert.ok(cosine > 0.99999, 'smooth join');
    }
    lastControl=coords.slice(2,4);
    at=coords.slice(4);
  }
  assert.equal(lettering('deco','V').paths[0].d.match(/[MLC]/g).join(''),'MLL');
  assert.equal(lettering('aegean','Λ').paths[0].d.match(/[MLC]/g).join(''),'MLL');
  assert.doesNotMatch(lettering('orbit','O').paths[0].d,/C/);
  const accented=lettering('signature','é').paths;
  assert.equal(accented.length,2);
  assert.ok(accented[0].d.includes('C') && accented[1].d.includes('L'));
});

test('the expanded font catalogue contains distinct, selectable shop proofs and picker categories', () => {
  const examples=new Set();
  for (const font of geometry.fonts) {
    assert.ok(font.category && font.label);
    const artwork=geometry.layout({...design,text:font.sample || 'Good Vibes',font:font.id});
    assert.ok(artwork.valid, font.id);
    examples.add(geometry.svg(artwork));
  }
  assert.ok(geometry.fonts.length >= 19);
  assert.equal(examples.size,geometry.fonts.length);
});

// Evaluate the visible SVG independently of the CAD subdivision code.
function svgSamples(d) {
  const points = [];
  let start;
  for (const [,type,values] of d.matchAll(/([MLC])([^MLC]+)/g)) {
    const coordinates = values.trim().split(/\s+/).map(Number);
    const end = coordinates.slice(-2);
    if (type === 'C') {
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1-t;
        points.push(start.map((a,i) => u**3*a + 3*u*u*t*coordinates[i] +
          3*u*t*t*coordinates[i+2] + t**3*end[i]));
      }
    }
    points.push(end);
    start = end;
  }
  return points;
}

function liesOnPolyline([x,y], vertices, tolerance) {
  for (let i=1; i<vertices.length; i++) {
    const [ax,ay]=vertices[i-1], [bx,by]=vertices[i];
    const dx=bx-ax, dy=by-ay;
    const length2=dx*dx+dy*dy;
    const t=length2 ? Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length2)) : 0;
    if ((x-ax-t*dx)**2 + (y-ay-t*dy)**2 <= tolerance*tolerance) return true;
  }
  return false;
}

test('every catalogue glyph retains its ink and its preview matches its exported cutting paths at three sizes', () => {
  for (const {id} of geometry.fonts) {
    const glyphs=Object.entries(globalThis.NeonStrokeFonts[id].glyphs);
    const punctuation=geometry.layout({...design,font:id,text:'!!'}).paths.length;
    for (let i=0; i<glyphs.length; i+=22) {
      const batch=glyphs.slice(i,i+22);
      let expectedPaths=0;
      let text='';
      for (const [ch,[,ink]] of batch) {
        // Punctuation provides an extent for vertical strokes and a neutral base
        // for combining marks. Letter sentinels can NFC-compose into another glyph.
        const single=geometry.layout({...design,font:id,text:'!'+ch+'!'});
        const count=single.paths.length-punctuation;
        assert.ok(single.valid, id+' U+'+ch.codePointAt(0).toString(16));
        assert.equal(count>0, Boolean(ink), id+' '+JSON.stringify(ch));
        expectedPaths+=count+punctuation/2;
        text+=ch+'!';
      }
      for (const widthMm of [200,600,3000]) {
        const spec={...design,font:id,text,widthMm};
        const proof=geometry.layout(spec);
        const label=id+' at '+widthMm+' mm, entries '+i+'–'+(i+batch.length-1);
        assert.ok(proof.valid && proof.tubeMm===6 && proof.lengthMm>0, label);
        const artwork=geometry.svg(proof);
        const paths=Array.from(artwork.matchAll(/<path d="([^"]+)"/g), match=>match[1]);
        const cad=polylines(geometry.dxf(proof));
        assert.equal(paths.length,expectedPaths,label);
        assert.equal(cad.length,paths.length,label);
        for (const [index,d] of paths.entries()) {
          const {points,closed,layer}=cad[index];
          assert.equal(layer,'TUBE_CENTERLINE_6MM',label);
          const vertices=points.map(([x,y])=>[x,proof.heightMm-y]);
          if (closed) vertices.push(vertices[0]);
          for (const sample of svgSamples(d)) {
            assert.ok(liesOnPolyline(sample,vertices,0.026),label+' stroke '+index);
          }
        }
      }
    }
  }
});

test('Art Deco lowercase ll has a straight stem and turns continuously through its foot', () => {
  const proof=geometry.layout({...design,font:'deco',text:'ll',widthMm:600});
  assert.equal(proof.paths.length,2);
  for (const stroke of polylines(geometry.dxf(proof))) {
    const points=stroke.points.map(([x,y])=>[x,proof.heightMm-y]);
    const first=points[0], last=points.at(-1);
    const height=last[1]-first[1], footWidth=last[0]-first[0];
    assert.ok(height>0 && footWidth>0);
    const stemY=first[1]+0.70*height;
    assert.ok(liesOnPolyline([first[0],stemY],points,0.026),
      'the source vertical must stay straight down the stem');
    const directions=[];
    let length=0;
    for (let i=1; i<points.length; i++) {
      const dx=points[i][0]-points[i-1][0], dy=points[i][1]-points[i-1][1];
      const segment=Math.hypot(dx,dy);
      directions.push({at:length+segment/2,angle:Math.atan2(dx,dy)*180/Math.PI});
      length+=segment;
    }
    const middle=directions.filter(({angle})=>angle>=25 && angle<=65);
    assert.ok(middle.length>=3,'the rounded part of the hook must contain a curve');
    for (const {at,angle} of middle) {
      const next=middle.find(other=>other.at>=at+0.20*footWidth);
      if (next) assert.ok(next.angle-angle>2,'the lower bend must keep turning through its diagonal');
    }
  }
});

test('long stems and diagonals of geometric lettering retain their designed straight edges', () => {
  const samples={deco:'MY',slab:'KkM',terrace:'Y'};
  for (const [font, letters] of Object.entries(samples)) {
    for (const text of letters) {
      const source=globalThis.NeonStrokeFonts[font].glyphs[text][1];
      // These particular shop alphabets draw these angular glyphs with one
      // unbroken polygon, including their serif returns and pointed junctions.
      assert.match(source,/^M[\d. -]+(?:L[\d. -]+)+$/);
      const points=svgSamples(source);
      const minX=Math.min(...points.map(p=>p[0])), maxX=Math.max(...points.map(p=>p[0]));
      const maxY=Math.max(...points.map(p=>p[1]));
      const proof=geometry.layout({...design,font,text,widthMm:600});
      const scale=(proof.widthMm-proof.tubeMm)/(maxX-minX);
      const original=points.map(([x,y])=>[3+(x-minX)*scale,3+(maxY-y)*scale]);
      const entities=polylines(geometry.dxf(proof));
      assert.equal(entities.length,1);
      const cad=entities[0].points.map(([x,y])=>[x,proof.heightMm-y]);
      for (const point of cad) assert.ok(liesOnPolyline(point,original,0.026),
        font+' '+text+' bowed away from its straight source stroke');
      for (const point of original) assert.ok(liesOnPolyline(point,cad,0.026),
        font+' '+text+' lost a corner or a serif');
    }
  }
});

test('close return strokes in Velvet and Flourish keep their original open paths', () => {
  function crossesItself(points) {
    // Endpoints and retraced segments may touch. Only a strict change of side
    // for both non-adjacent segments introduces a crossing in this pen stroke.
    const side=([ax,ay],[bx,by],[x,y])=>(bx-ax)*(y-ay)-(by-ay)*(x-ax);
    for (let i=1; i<points.length; i++) {
      const a=points[i-1], b=points[i];
      for (let j=i+2; j<points.length; j++) {
        const c=points[j-1], d=points[j];
        if (side(a,b,c)*side(a,b,d)<0 && side(c,d,a)*side(c,d,b)<0) return true;
      }
    }
    return false;
  }
  for (const [font,text] of [['velvet','a'],['velvet','p'],['flourish','M']]) {
    const source=globalThis.NeonStrokeFonts[font].glyphs[text][1];
    assert.equal(crossesItself(svgSamples(source)),false,text+' source');
    for (const widthMm of [200,600,3000]) {
      const proof=geometry.layout({...design,font,text,widthMm});
      const strokes=polylines(geometry.dxf(proof));
      assert.equal(strokes.length,1);
      assert.equal(strokes[0].closed,false);
      assert.equal(crossesItself(strokes[0].points),false,text+' at '+widthMm+' mm');
    }
  }
});

test('invalid values and unsupported glyphs never generate a submission or partial export', () => {
  const invalid = geometry.layout({...design,text:'Hello 🦩'});
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.unsupported,['🦩']);
  assert.deepEqual(invalid.paths,[]);
  assert.throws(() => geometry.dxf(invalid));
  assert.throws(() => geometry.svg(invalid));
  for (const patch of [
    {version:2}, {text:''}, {text:'a'.repeat(81)}, {text:'a\nb\nc\nd\ne'}, {text:'Open\tNow'},
    {font:'__proto__'}, {text:'🦩'}, {widthMm:'700'}, {widthMm:3001}, {widthMm:99},
    {color:'red'}, {align:'top'}, {letterSpacing:-0.1}, {lineSpacing:2.1}, {brightness:101},
    {scene:'foo'}, {power:1}, {backing:'wood'}, {mount:'no'}, {svg:'trusted client path'}, {lengthMm:1},
    {cutPlan:{ready:true,totalCutMm:25}}, {intent:'review'},
  ]) assert.deepEqual(Object.keys(measure({...design, ...patch})), ['error'], JSON.stringify(patch));
  const accepted={...design,text:'-',font:'studio',widthMm:606};
  const proof = measure(accepted);
  assert.equal(proof.design.color, '#ff488d');
  assert.equal(proof.widthMm, 606);
  assert.ok(proof.dxf);
  assert.ok(measure(accepted,'review').dxf);
  assert.ok(measure(accepted,'unexpected').error);
  assert.ok(measure({...design,text:'🦩'},'review').error);
});

test('silicone and LEDs obey the same indoor product rules on quotes and shop reviews', () => {
  const white = '#ffffff', warmWhite = '#ffedcc', red = '#ff3030', blue = '#356bff';
  const leds = [white, warmWhite, red, blue, '#ff488d', '#ff6248', '#ffb149', '#caff63', '#58ebcc', '#68c7ff', '#bc8bff'];
  const sign = {...design, version: 2, text: '-', font: 'studio', widthMm: 606};
  const original = measure({...sign, version: 1, color: blue});
  assert.equal(original.design.cover, white);
  for (const cover of leds) {
    for (const color of leds) {
      const label = 'cover ' + cover + ' with LED ' + color;
      const proof = measure({...sign, cover, color});
      if (cover === white || (cover !== warmWhite && cover === color)) {
        assert.equal(proof.error, undefined, label);
        assert.equal(proof.design.cover, cover, label);
        assert.equal(proof.design.color, color, label);
        assert.equal(proof.dxf, original.dxf, label);
      } else {
        assert.ok(proof.error, label);
      }
    }
  }
  const draft = {...sign, text: 'Hello', widthMm: 600, cover: white, color: warmWhite};
  const shop = measure(draft, 'review');
  assert.equal(shop.reviewOnly, shop.manufacturing.requiresReview);
  assert.equal(shop.design.cover, white);
  assert.equal(shop.design.color, warmWhite);
  assert.match(shop.svg, /Indoor use only/);
  assert.ok(shop.dxf);
  const powerOn = measure({...sign, cover: white, color: blue, power: true});
  const powerOff = measure({...sign, cover: white, color: blue, power: false});
  assert.ok(powerOn.svg.includes('stroke="' + blue + '"'));
  assert.ok(powerOff.svg.includes('stroke="' + white + '"'));
  assert.equal(powerOn.dxf, powerOff.dxf);
  assert.ok(measure({...draft, cover: red}, 'review').error);
  for (const patch of [{cover: undefined}, {cover:'#123456'}, {color:'#123456'}, {cover:42}, {version:3}]) {
    assert.ok(measure({...sign, cover:white, color:blue, ...patch}).error);
  }
});

test('Aegean Greek uses distinct native Greek strokes, final sigma and composed Greek accents', () => {
  const alphabet = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ\nαβγδεζηθικλμνξοπρστυφχψως\nΆΈΉΊΌΎΏΪΫάέήίόύώϊϋΐΰ';
  assert.equal(geometry.layout({...design,text:alphabet,font:'aegean'}).valid,true);
  const text = 'Καλημέρα Κύπρος · Café';
  const proof = measure({...design,text,font:'aegean'},'review');
  const decomposed = measure({...design,text:text.normalize('NFD'),font:'aegean'},'review');
  assert.equal(proof.design.text,text);
  assert.ok(proof.svg.includes('<path'));
  assert.equal(proof.svg,decomposed.svg);
  const letters = char => geometry.layout({...design,text:char,font:'aegean'}).paths.map(p => p.d);
  assert.notDeepEqual(letters('ς'),letters('σ'));
  assert.ok(letters('ά').length > letters('α').length);
  assert.match(measure({...design,text:'Κύπρος'}).error,/Aegean Greek/);
});

test('HTTP helper can send UTF-8 JSON to the bounded stdin CLI', () => {
  const cli = require.resolve('../app/cli/neon-measure.cjs');
  const accepted={...design,text:'-',font:'studio',widthMm:606};
  for (const [input, valid] of [[JSON.stringify(accepted),true], [JSON.stringify(design),true],
    ['{bad',false], [' '.repeat(8193),false]]) {
    const run = spawnSync(process.execPath,[cli], {input, encoding:'utf8'});
    assert.equal(run.status, 0);
    const proof = JSON.parse(run.stdout);
    assert.equal(Boolean(proof.error), !valid);
    if (valid) assert.equal(proof.design.text, JSON.parse(input).text);
  }
});

test('100 mm shop geometry and contoured spacer hardware use true drawing units', () => {
  const small=geometry.layout({...design,text:'A',widthMm:100});
  assert.ok(small.valid);
  const model=geometry.layout({...design,text:'Hello',widthMm:600});
  const spec={...design,backing:'clear',boardShape:'contour',mount:'wall'};
  const board=geometry.backboard(model,spec);
  assert.equal(board.outlines.length,1);
  assert.ok(board.outline.length>20);
  const dxf=geometry.dxf(model,spec);
  assert.equal((dxf.match(/\r\nCIRCLE\r\n/g)||[]).length,board.holes.length);
  assert.equal((dxf.match(/\r\n40\r\n5\.5\r\n/g)||[]).length,board.holes.length);
  assert.ok(dxf.includes('ACRYLIC_OUTLINE'));
  assert.ok(geometry.svg(model,spec).includes('MOUNT_HOLES'));
  const separated=geometry.layout({...design,text:'Hello   Hello\nHello',widthMm:1000});
  assert.equal(geometry.backboard(separated,spec).outlines.length,1);
  assert.equal(geometry.backboard(separated,{...spec,boardGap:50}).outlines.length,1);
  assert.ok(measure({...design,boardGap:29}).error);
  assert.equal(geometry.backboard(model,{...spec,backing:'none'}),null);
});

test('Hello across two lines exports original strokes at non-multiple lengths', () => {
  const spec={...design,text:'Hello   Hello\\nHello',font:'signature',widthMm:1000};
  const drawing=geometry.layout(spec);
  const proof=measure(spec);
  assert.equal(proof.lengthMm,drawing.lengthMm);
  assert.equal(proof.dxf,geometry.dxf(drawing,spec));
  assert.ok(Math.abs(proof.lengthMm/25-Math.round(proof.lengthMm/25))>.001);
});

test('dot marks export as open strokes throughout the neon font catalogue', () => {
  for (const font of geometry.fonts) {
    const sign=geometry.layout({...design,font:font.id,text:'I. : ! ? i j I',widthMm:1400});
    assert.ok(sign.valid,font.id);
    assert.ok(polylines(geometry.dxf(sign)).every(path=>!path.closed),font.id);
  }
});
test('a two-colour neon proof saves both colours and retains the same cutting geometry', () => {
  const draft={...design,version:2,text:'NEON\neffect',cover:'#ffffff'};
  const mixed=measure({...draft,lineColors:['#68c7ff','#bc8bff']});
  assert.deepEqual(mixed.design.lineColors,['#68c7ff','#bc8bff']);
  assert.match(mixed.svg,/stroke="#68c7ff"/);
  assert.match(mixed.svg,/stroke="#bc8bff"/);
  assert.equal(mixed.dxf,measure(draft).dxf);
  assert.ok(measure({...draft,cover:'#ff488d',lineColors:['#68c7ff']}).error);
});
test('finished acrylic controls pricing tiers and the 3 by 2 metre limit', () => {
  const spec={...design,text:'Hello',boardShape:'rectangle'};
  for (const [width,tier] of [[1100,120],[1200,240],[2300,240],[2400,300],[2912,300]]) {
    const proof=measure({...spec,widthMm:width});
    near(proof.finished.widthMm,width+2*geometry.acrylicMargin(width,spec),.001);
    assert.equal(proof.finished.tier,tier);
    assert.ok(proof.finished.areaMm2>0);
  }
  assert.match(measure({...spec,widthMm:2913}).error,/3,000 × 2,000/);
  const high=geometry.finishedSize({widthMm:1000,heightMm:2001},null,spec);
  assert.equal(high.withinLimit,false);
});

test('acrylic and spacer inset scale, with width tiers and extra rows above one metre', () => {
  const spec={...design,boardShape:'rectangle',mount:'wall'};
  assert.equal(geometry.acrylicMargin(456,spec),22);
  assert.equal(geometry.acrylicMargin(2912,spec),44);
  for (const [width,height,count] of [[700,400,4],[1000,400,6],[2000,400,8],[1000,1100,10],[2400,1100,12]]) {
    const board=geometry.backboard({widthMm:width,heightMm:height},spec);
    assert.equal(board.holes.length,count);
    near(board.holes[0][0]+board.pad,15*board.pad/22,.001);
  }
  for (const [widthMm,count] of [[700,4],[1000,6],[2100,8]]) {
    const contour={...spec,boardShape:'contour',text:'Hello Hello',widthMm};
    const drawing=geometry.layout(contour);
    assert.equal(geometry.backboard(drawing,contour).holes.length,count);
  }
});
test('labour counts separate pen paths and sharp joins without charging for a smooth loop', () => {
  const spec={...design,font:'studio',widthMm:600,backing:'none'};
  const h=measure({...spec,text:'H'});
  const o=measure({...spec,text:'O'});
  const l=measure({...spec,text:'L'});
  assert.equal(h.strokeCount,3);
  assert.equal(h.bendCount,0);
  assert.equal(o.bendCount,0);
  assert.equal(l.bendCount,1);
});
test('manufacturing screening flags tight separate paths and short strokes while allowing terminal junctions', () => {
  const audit=geometry.inspectManufacturing;
  assert.equal(audit([[[0,0],[50,0]],[[0,5],[50,5]]]).closePaths,true);
  assert.equal(audit([[[0,0],[50,0]],[[0,15],[50,15]]]).requiresReview,true);
  assert.equal(audit([[[0,0],[50,0]],[[0,16],[50,16]]]).requiresReview,false);
  assert.equal(audit([[[0,0],[50,0]],[[50,0],[50,50]]]).requiresReview,false);
  assert.equal(audit([[[0,0],[2,0]]]).shortStrokes,1);
  assert.equal(audit([[[0,0],[50,50]],[[0,50],[50,0]]]).requiresReview,true);
});

test('U-bend screening uses ten millimetres clear between tube faces', () => {
  const u=radius=>Array.from({length:101},(_,i)=>{
    const angle=Math.PI*i/100;
    return [radius*Math.cos(angle),radius*Math.sin(angle)];
  });
  assert.equal(geometry.inspectManufacturing([u(7)]).requiresReview,true);
  assert.equal(geometry.inspectManufacturing([u(8)]).tightCurves,false);
  assert.equal(geometry.inspectManufacturing([u(8.1)]).requiresReview,false);
});