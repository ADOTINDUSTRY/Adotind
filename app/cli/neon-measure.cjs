'use strict';

require('../../public/assets/js/neon-fonts.js');
require('../../public/assets/js/neon-geometry.js');
const geometry = globalThis.NeonGeometry;
const palette = require('../data/neon-colors.json');
const white = '#ffffff';
const warmWhite = '#ffedcc';

const choices = {
  font: geometry.fonts.map(font => font.id),
  align: ['left', 'center', 'right'],
  boardShape: ['rectangle','contour'],
  backing: ['clear', 'black', 'none'],
  mount: ['wall', 'suspended', 'freestanding'],
  scene: ['studio', 'brick', 'concrete', 'drawing'],
};
const ranges = {widthMm: [100, 3000], boardGap: [30, 150], letterSpacing: [0, 0.30], lineSpacing: [1, 2], brightness: [10, 100]};
const fields = new Set(['version', 'text', 'color', 'cover', 'lineColors', 'power', ...Object.keys(choices), ...Object.keys(ranges)]);

function measure(input, intent = 'production') {
  if (!['production', 'review'].includes(intent)) return {error: 'Choose a valid request type.'};
  if (!input || Array.isArray(input) || typeof input !== 'object' || ![1, 2].includes(input.version) ||
      Object.keys(input).some(key => !fields.has(key)) || (input.version === 1 && Object.hasOwn(input, 'cover'))) {
    return {error: 'Choose a valid neon design file.'};
  }
  if (typeof input.text !== 'string') return {error: 'Enter the lettering for your sign.'};
  const text = input.text.replace(/\r\n?/g, '\n').normalize('NFC');
  if (!text.trim() || [...text].length > 80 || text.split('\n').length > 4 ||
      /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text)) return {error: 'Use up to 80 characters on a maximum of four lines.'};
  const color = typeof input.color === 'string' ? input.color.toLowerCase() : '';
  const cover = input.version === 1 ? white : typeof input.cover === 'string' ? input.cover.toLowerCase() : '';
  if (!Object.hasOwn(palette, color) || !Object.hasOwn(palette, cover) || typeof input.power !== 'boolean') {
    return {error: 'Choose a listed LED colour and silicone cover, and a valid power setting.'};
  }
  if (cover !== white && (cover === warmWhite || cover !== color)) {
    return {error: 'Use a white silicone cover with any LED colour, or match the cover to the LED. Warm white requires a white cover.'};
  }
  const lineColors = input.lineColors === undefined ? [] : input.lineColors;
  if (!Array.isArray(lineColors) || lineColors.length > 4 || lineColors.some(value =>
      value !== null && (typeof value !== 'string' || !Object.hasOwn(palette,value) || cover !== white))) {
    return {error:'Choose available line colours with a white silicone cover.'};
  }
  const design = {version: 2, text, color, cover, lineColors, power: input.power};
  for (const [key, values] of Object.entries(choices)) {
    const value = key === 'boardShape' && input[key] === undefined ? 'rectangle' : input[key];
    if (!values.includes(value)) return {error: 'Choose a valid ' + key + ' option.'};
    design[key] = value;
  }
  if (design.boardShape === 'contour' && design.mount !== 'wall') {
    return {error: 'Cut-around acrylic is available for wall mounting only.'};
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = key === 'boardGap' && input[key] === undefined ? 30 : input[key];
    if (!Number.isFinite(value) || value < min || value > max) return {error: 'Choose a value within the control limits.'};
    design[key] = value;
  }
  const proof = geometry.layout(design);
  if (!proof.valid) return {error: proof.errors[0] || 'Check the lettering before sending.'};
  const finished = geometry.finishedSize(proof,geometry.backboard(proof,design),design);
  if (!finished.withinLimit) return {error:'The finished sign must fit within 3,000 × 2,000 mm.'};
  return {
    finished, reviewOnly: false, design, widthMm: proof.widthMm, heightMm: proof.heightMm, lengthMm: proof.lengthMm,
    warnings: proof.warnings, svg: geometry.svg(proof, design), dxf: geometry.dxf(proof, design),
  };
}

// Read only the posted design from stdin. All dimensions and paths are rebuilt here.
async function main() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 8192) {
      process.stdout.write(JSON.stringify({error: 'Choose a design under 8 KB.'}));
      return;
    }
    chunks.push(chunk);
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.stdout.write(JSON.stringify({error: 'Choose a valid design.'}));
    return;
  }
  process.stdout.write(JSON.stringify(measure(input, process.argv[2] || 'production')));
}

if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = {measure};
