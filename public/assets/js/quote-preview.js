(() => {
  const input = document.querySelector('.quote-prototype input[name="vector_file"]');
  const preview = document.querySelector('.quote-file-preview');
  if (!input || !preview) return;

  const imageBox = preview.querySelector('.quote-preview-image');
  const image = imageBox.querySelector('img');
  const name = preview.querySelector('.quote-preview-name');
  const size = preview.querySelector('.quote-preview-size');
  const dimensions = preview.querySelector('.quote-preview-dimensions');
  const message = preview.querySelector('.quote-preview-message');
  let objectUrl = null;
  let selection = 0;

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
    objectUrl = null;
    image.removeAttribute('src');
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
    if (!/\.svg$/i.test(file.name)) {
      message.textContent = 'Preview and document dimensions are not available for this file type. Enter the actual part dimensions below.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.textContent = 'This SVG is too large to preview here. Enter the actual part dimensions below.';
      return;
    }

    message.textContent = 'Reading your SVG…';
    try {
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
      imageBox.hidden = false;
    } catch (error) {
      if (current !== selection) return;
      message.textContent = 'The file could not be read. Please choose it again.';
    }
  });
})();
