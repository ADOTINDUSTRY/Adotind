'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const assets = path.join(__dirname, '../../public/assets/js');
const hash = crypto.createHash('sha256');
for (const filename of ['neon-fonts.js', 'neon-geometry.js']) {
  const source = path.join(assets, filename);
  require(source);
  hash.update(fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n'));
}
// Changes to the quote path require a new edition even if the font geometry is unchanged.
hash.update('unchecked-neon-drawings-v1');
hash.update(fs.readFileSync(path.join(__dirname, '../data/neon-colors.json'), 'utf8').replace(/\r\n/g, '\n'));
const geometry = globalThis.NeonGeometry;
const fonts = geometry.fonts.map(font => {
  const words = font.id === 'aegean' ? ['Φως'] : ['Studio', 'Light', 'Aa'];
  for (const text of words) {
    const layout = geometry.layout({text, font: font.id, widthMm: 240});
    if (!layout.valid) continue;
    return {
      id: font.id, label: font.label, category: font.category || 'Lettering',
      sample: {width: layout.widthMm, height: layout.heightMm, d: layout.paths.map(p => p.d).join(' ')},
    };
  }
  throw new Error('Missing font specimen for ' + font.id);
});
const library = {edition: hash.digest('hex'), fonts};
fs.writeFileSync(path.join(__dirname, '../data/neon-library.json'), JSON.stringify(library) + '\n');
