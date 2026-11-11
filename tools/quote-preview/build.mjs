import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, '../../public/assets/js/quote-vendor');
await mkdir(out, { recursive: true });
await build({
  entryPoints: [resolve(root, 'preview.js'), resolve(root, 'dxf-worker.js'), resolve(root, 'eps-worker.js'), resolve(root, 'svg-worker.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  legalComments: 'external',
  outdir: out,
});
await copyFile(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve(out, 'pdf.worker.min.js'));
for (const [pkg, license] of [
  ['dxf-viewer', 'LICENSE'], ['pdfjs-dist', 'LICENSE'], ['three', 'LICENSE'],
  ['earcut', 'LICENSE'], ['loglevel', 'LICENSE-MIT'], ['opentype.js', 'LICENSE'],
  ['string.prototype.codepointat', 'LICENSE-MIT.txt'], ['tiny-inflate', 'LICENSE'], ['eps2img', 'LICENSE'],
  ['xmlchars', 'LICENSE'],
]) {
  await copyFile(resolve(root, `node_modules/${pkg}/${license}`), resolve(out, `${pkg}.LICENSE.txt`));
}
await copyFile(resolve(root, 'saxes.LICENSE.txt'), resolve(out, 'saxes.LICENSE.txt'));
