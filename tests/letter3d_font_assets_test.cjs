'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('../public/assets/js/quote-vendor/opentype-1.3.4.min.js');
const cases = [
  ['AlegreyaSans-Regular.ttf', '8fab634196007afca839f1e5a6fb300976daff55d8528b590ef032f01b14ea10', true],
  ['LibertinusSerif-Regular.ttf', '81ea17858245163742c9f5ddf19e9c54667ee5e026708556fb1bf5dce7f92fae', true],
  ['GreatVibes-Regular.ttf', '8d509802186f1b51572531ecf313e8098f9a5bfdfaca93f0c9b34467f9982d15', false]
];
for (const [name, expectedHash, greek] of cases) {
  const file = path.join(__dirname, '../public/assets/fonts/letter3d', name);
  const buffer = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), expectedHash, `${name} provenance`);
  const font = parser.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  for (const char of 'HelloМосква') assert.notEqual(font.charToGlyphIndex(char), 0, `${name} missing ${char}`);
  const greekMissing = [...'Αθήνα'].some(char => font.charToGlyphIndex(char) === 0);
  assert.equal(greekMissing, !greek, `${name} Greek coverage expectation`);
  assert.ok(font.getPath('A', 0, 0, 100).commands.length > 0, `${name} must produce outlines`);
  if (name !== 'GreatVibes-Regular.ttf') {
    for (const [glyph, count] of [['O',2],['B',3],['8',3]]) {
      assert.equal(font.getPath(glyph,0,0,100).commands.filter(command => command.type === 'M').length, count, `${name} must preserve counters for ${glyph}`);
    }
  }
}
const parserBytes = fs.readFileSync(path.join(__dirname, '../public/assets/js/quote-vendor/opentype-1.3.4.min.js'));
assert.equal(crypto.createHash('sha256').update(parserBytes).digest('hex'), 'c0f9c7ca85e18075a8819e5fe2dee6e1d535f9a2269f5314f36cce94a183adba');
console.log('3D lettering font provenance, outline parsing and glyph coverage checks passed.');
