import { SaxesParser } from 'saxes';

self.onmessage = async ({ data: file }) => {
  const found = {};
  let dimensions;
  try {
    const first = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const encoding = (first[0] === 0xff && first[1] === 0xfe) || (first[0] === 0x3c && first[1] === 0) ? 'utf-16le'
      : (first[0] === 0xfe && first[1] === 0xff) || (first[0] === 0 && first[1] === 0x3c) ? 'utf-16be' : 'utf-8';
    const decoder = new TextDecoder(encoding, { fatal: true });
    const parser = new SaxesParser({ xmlns: true });
    parser.on('opentag', (tag) => {
      if (tag.local !== 'svg' || tag.uri !== 'http://www.w3.org/2000/svg') throw new Error('Invalid SVG root');
      dimensions = { width: tag.attributes.width?.value || '', height: tag.attributes.height?.value || '' };
      throw found;
    });
    const limit = Math.min(file.size, 1024 * 1024);
    for (let offset = 0; offset < limit; offset += 16384) {
      const bytes = await file.slice(offset, Math.min(offset + 16384, limit)).arrayBuffer();
      parser.write(decoder.decode(bytes, { stream: true }));
    }
    throw new Error('SVG root not found within the first megabyte');
  } catch (error) {
    if (error === found) {
      self.postMessage(dimensions);
    } else {
      self.postMessage({ error: error.message || 'Unable to read SVG dimensions' });
    }
  }
};
