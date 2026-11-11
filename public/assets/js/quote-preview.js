(() => {
  const input = document.querySelector('.quote-prototype input[name="vector_file"]');
  const preview = document.querySelector('.quote-file-preview');
  if (!input || !preview) return;

  const imageBox = preview.querySelector('.quote-preview-image');
  const image = imageBox.querySelector('img');
  const renderBox = imageBox.querySelector('.quote-preview-render');
  const name = preview.querySelector('.quote-preview-name');
  const size = preview.querySelector('.quote-preview-size');
  const dimensions = preview.querySelector('.quote-preview-dimensions');
  const message = preview.querySelector('.quote-preview-message');
  let objectUrl = null;
  let dispose = null;
  let selection = 0;
  const vendorUrl = new URL('quote-vendor/preview.js?v=1', document.currentScript.src).href;

  const dimensionInMm = (value) => {
    const match = /^\s*((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc)\s*$/i.exec(value);
    if (!match) return null;
    const factors = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
    const result = Number(match[1]) * factors[match[2].toLowerCase()];
    return Number.isFinite(result) && result > 0 ? result : null;
  };
  const formatMm = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

  input.addEventListener('change', async () => {
    const current = ++selection;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (dispose) dispose();
    dispose = null;
    objectUrl = null;
    image.removeAttribute('src');
    image.hidden = true;
    renderBox.replaceChildren();
    renderBox.hidden = true;
    imageBox.hidden = true;
    dimensions.textContent = '';
    message.textContent = '';
    const file = input.files[0];
    preview.hidden = !file;
    if (!file) return;

    name.textContent = file.name;
    size.textContent = `File size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    if (file.size > 50 * 1024 * 1024) {
      message.textContent = 'This file exceeds the 50 MB upload limit. Please choose a smaller file.';
      return;
    }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['svg', 'dxf', 'pdf', 'ai', 'eps'].includes(extension)) {
      message.textContent = 'Preview and document dimensions are not available for this file type. Enter the actual part dimensions below.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.textContent = 'This file is too large to preview here. Enter the actual part dimensions below.';
      return;
    }

    message.textContent = 'Preparing your preview…';
    try {
      const signature = await file.slice(0, 16).text();
      if (current !== selection) return;
      if (extension === 'eps' || (extension === 'ai' && signature.startsWith('%!PS'))) {
        const text = await file.text();
        if (current !== selection) return;
        if (!signature.startsWith('%!PS')) {
          message.textContent = 'This EPS format cannot be previewed here. Enter the actual part dimensions below.';
          return;
        }
        const boxes = [...text.matchAll(/^%%(HiResBoundingBox|BoundingBox):\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gm)];
        const hiRes = boxes.filter((box) => box[1] === 'HiResBoundingBox');
        const box = (hiRes.length ? hiRes : boxes).at(-1);
        if (box) {
          const coords = box.slice(2).map(Number);
          const width = (coords[2] - coords[0]) * 25.4 / 72;
          const height = (coords[3] - coords[1]) * 25.4 / 72;
          if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            dimensions.textContent = `Declared bounding box: ${formatMm(width)} × ${formatMm(height)} mm`;
          }
        }
        if (!dimensions.textContent) dimensions.textContent = 'A physical bounding box was not found in this file.';
        message.textContent = 'Visual preview is not available for PostScript files. The bounding box may include empty space; enter the actual cut-part dimensions below.';
        return;
      }
      if (extension !== 'svg') {
        const box = document.createElement('div');
        box.className = 'quote-preview-canvas';
        renderBox.append(box);
        imageBox.hidden = false;
        renderBox.hidden = false;
        const { previewPdf, previewDxf } = await import(vendorUrl);
        if (current !== selection) return;
        const result = await (extension === 'dxf' ? previewDxf(file, box) : previewPdf(file, box));
        if (current !== selection) {
          if (result.dispose) result.dispose();
          return;
        }
        dispose = result.dispose || null;
        dimensions.textContent = result.dimensions;
        message.textContent = result.message;
        return;
      }
      const text = await file.text();
      if (current !== selection) return;
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const root = doc.documentElement;
      if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || doc.querySelector('parsererror')) {
        message.textContent = 'This file could not be read as an SVG. Please check the file.';
        return;
      }

      const width = dimensionInMm(root.getAttribute('width') || '');
      const height = dimensionInMm(root.getAttribute('height') || '');
      dimensions.textContent = width !== null && height !== null
        ? `Declared document size: ${formatMm(width)} × ${formatMm(height)} mm`
        : 'Document dimensions in physical units are not available.';
      message.textContent = 'Document size is not necessarily the cut part size. Check and enter the actual part dimensions below.';
      objectUrl = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
      image.onerror = () => {
        if (current !== selection) return;
        imageBox.hidden = true;
        message.textContent = 'The SVG image could not be displayed. Check and enter the actual part dimensions below.';
      };
      image.src = objectUrl;
      image.hidden = false;
      imageBox.hidden = false;
    } catch (error) {
      if (current !== selection) return;
      console.error('Quote file preview failed:', error);
      imageBox.hidden = true;
      message.textContent = 'The preview could not be opened. Check the file and enter the actual part dimensions below. Older AI and some DXF files may not be supported.';
    }
  });
})();
