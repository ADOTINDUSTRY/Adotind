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
  for (let i = 0; i < groups.length; i += 2) {
    const code = Number(groups[i]), value = groups[i+1];
    if (code === 0) {
      current = value === 'LWPOLYLINE' ? {points: []} : null;
      if (current) entities.push(current);
    }
    if (!current) continue;
    if (code === 8) current.layer = value;
    if (code === 70) current.closed = Number(value) === 1;
    if (code === 90) current.count = Number(value);
    if (code === 10) current.points.push([Number(value)]);
    if (code === 20) current.points.at(-1).push(Number(value));
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
      assert.match(cad, /\$INSUNITS\r\n70\r\n4\r\n/);
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
  assert.equal(measure({...design,text:'Cafe\u0301'}).design.text, 'Café');
  assert.ok(!geometry.svg(base, {color:'" onload="alert(1)'}).includes('onload'));
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
    {font:'__proto__'}, {text:'🦩'}, {widthMm:'700'}, {widthMm:3001}, {widthMm:199},
    {color:'red'}, {align:'top'}, {letterSpacing:-0.1}, {lineSpacing:2.1}, {brightness:101},
    {scene:'foo'}, {power:1}, {backing:'wood'}, {mount:'no'}, {svg:'trusted client path'}, {lengthMm:1},
  ]) assert.deepEqual(Object.keys(measure({...design, ...patch})), ['error'], JSON.stringify(patch));
  const proof = measure(design);
  assert.equal(proof.design.color, '#ff488d');
  assert.equal(proof.widthMm, 700);
  assert.deepEqual(proof.warnings, geometry.layout(design).warnings);
});

test('Aegean Greek uses distinct native Greek strokes, final sigma and composed Greek accents', () => {
  const alphabet = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ\nαβγδεζηθικλμνξοπρστυφχψως\nΆΈΉΊΌΎΏΪΫάέήίόύώϊϋΐΰ';
  assert.equal(geometry.layout({...design,text:alphabet,font:'aegean'}).valid,true);
  const text = 'Καλημέρα Κύπρος · Café';
  const proof = measure({...design,text,font:'aegean'});
  const decomposed = measure({...design,text:text.normalize('NFD'),font:'aegean'});
  assert.equal(proof.design.text,text);
  assert.equal(proof.dxf,decomposed.dxf);
  const letters = char => geometry.layout({...design,text:char,font:'aegean'}).paths.map(p => p.d);
  assert.notDeepEqual(letters('ς'),letters('σ'));
  assert.ok(letters('ά').length > letters('α').length);
  assert.match(measure({...design,text:'Κύπρος'}).error,/Aegean Greek/);
});

test('HTTP helper can send UTF-8 JSON to the bounded stdin CLI', () => {
  const cli = require.resolve('../app/cli/neon-measure.cjs');
  for (const [input, valid] of [[JSON.stringify(design),true], ['{bad',false], [' '.repeat(8193),false]]) {
    const run = spawnSync(process.execPath,[cli], {input, encoding:'utf8'});
    assert.equal(run.status, 0);
    const proof = JSON.parse(run.stdout);
    assert.equal(Boolean(proof.error), !valid);
    if (valid) assert.equal(proof.design.text, design.text);
  }
});
