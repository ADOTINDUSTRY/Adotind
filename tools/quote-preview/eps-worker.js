import { parseEPS, renderToCanvas } from 'eps2img';

self.onmessage = async ({ data }) => {
  let box = null;
  try {
    let bytes = new Uint8Array(data);
    if (bytes.length >= 30 && bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
      const header = new DataView(data);
      const offset = header.getUint32(4, true);
      const length = header.getUint32(8, true);
      if (!length || offset + length > bytes.length) throw new Error('Invalid EPS header');
      bytes = bytes.subarray(offset, offset + length);
    }

    const headerText = new TextDecoder('latin1').decode(bytes);
    if (!headerText.startsWith('%!PS')) throw new Error('Not a PostScript file');
    const previewSizes = [...headerText.matchAll(/%%BeginPreview:\s*(\d+)\s+(\d+)/g)];
    if (previewSizes.some((m) => Number(m[1]) * Number(m[2]) > 1_000_000)) {
      throw new Error('Embedded preview is too large');
    }
    const parsed = parseEPS(bytes);
    box = parsed.hiResBoundingBox || parsed.boundingBox;
    if (!box || box.some((n) => !Number.isFinite(n))) throw new Error('No usable bounding box');
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    if (width <= 0 || height <= 0 || width > 1_000_000 || height > 1_000_000) {
      throw new Error('Invalid bounding box');
    }
    const result = renderToCanvas(bytes, {
      scale: Math.min(1, 900 / Math.max(width, height)),
      maxPixels: 1_000_000,
      opBudget: 500_000,
    });
    if (!result.painted) throw new Error('No visible artwork could be rendered');
    const blob = await result.canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob, box, incomplete: result.warnings.length > 0 });
  } catch (error) {
    self.postMessage({ error: error.message || 'Unable to render this file', box });
  }
};
