'use strict';

require('../../public/assets/js/neon-fonts.js');
require('../../public/assets/js/neon-geometry.js');
const geometry = globalThis.NeonGeometry;

const choices = {
  font: geometry.fonts.map(font => font.id),
  align: ['left', 'center', 'right'],
  backing: ['clear', 'black', 'none'],
  mount: ['wall', 'suspended', 'freestanding'],
  scene: ['studio', 'brick', 'concrete', 'drawing'],
};
const ranges = {widthMm: [200, 3000], letterSpacing: [0, 0.30], lineSpacing: [1, 2], brightness: [10, 100]};
const fields = new Set(['version', 'text', 'color', 'power', ...Object.keys(choices), ...Object.keys(ranges)]);

function measure(input, intent = 'production') {
  if (!['production', 'review'].includes(intent)) return {error: 'Choose a valid request type.'};
  if (!input || Array.isArray(input) || typeof input !== 'object' || input.version !== 1 ||
      Object.keys(input).some(key => !fields.has(key))) return {error: 'Choose a valid version 1 design.'};
  if (typeof input.text !== 'string') return {error: 'Enter the lettering for your sign.'};
  const text = input.text.replace(/\r\n?/g, '\n').normalize('NFC');
  if (!text.trim() || [...text].length > 80 || text.split('\n').length > 4 ||
      /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text)) return {error: 'Use up to 80 characters on a maximum of four lines.'};
  if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color) || typeof input.power !== 'boolean') {
    return {error: 'Choose a valid tube colour and power setting.'};
  }
  const design = {version: 1, text, color: input.color.toLowerCase(), power: input.power};
  for (const [key, values] of Object.entries(choices)) {
    if (!values.includes(input[key])) return {error: 'Choose a valid ' + key + ' option.'};
    design[key] = input[key];
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = input[key];
    if (!Number.isFinite(value) || value < min || value > max) return {error: 'Choose a value within the control limits.'};
    design[key] = value;
  }
  const proof = geometry.cutLayout(design, {suggestions: false});
  if (!proof.cutPlan) return {error: proof.errors[0] || 'Check the lettering before sending.'};
  const cutPlan = proof.cutPlan;
  if (!cutPlan.ready && intent === 'production') {
    return {error: 'Each separate LED strip must fit a whole number of 25 mm sections. Change the design or request a shop review.'};
  }
  if (cutPlan.ready && intent === 'review') {
    return {error: 'This design fits the strip cuts. Review the current design and submit it from the editor.'};
  }
  if (!cutPlan.ready) {
    const artwork = geometry.layout(design);
    if (!artwork.valid) return {error: artwork.errors[0]};
    // Shop enquiries keep a visual reference. Only a verified production plan
    // receives a machine file or a cutting layer.
    const svg = geometry.svg(artwork, {color: design.color}).replace('<g id="TUBE_CENTERLINE_6MM"',
      '<title>Artwork for shop review only</title><desc>Strip lengths require review before cutting.</desc>\n<g id="VISUAL_REVIEW_ONLY"');
    return {reviewOnly: true, cutPlan, design, widthMm: artwork.widthMm, heightMm: artwork.heightMm,
      lengthMm: artwork.lengthMm, warnings: artwork.warnings, svg, dxf: ''};
  }
  if (!proof.valid) return {error: proof.errors[0] || 'The cutting geometry could not be verified.'};
  return {
    reviewOnly: false, cutPlan, design, widthMm: proof.widthMm, heightMm: proof.heightMm, lengthMm: cutPlan.totalCutMm,
    warnings: proof.warnings, svg: geometry.svg(proof, {color: design.color}), dxf: geometry.dxf(proof),
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
