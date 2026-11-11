(() => {
  const input = document.querySelector('.quote-prototype input[name="vector_file"]');
  const preview = document.querySelector('.quote-file-preview');
  if (!input || !preview) return;

  const imageBox = preview.querySelector('.quote-preview-image');
  const image = imageBox.querySelector('img');
  const renderBox = imageBox.querySelector('.quote-preview-render');
  const measurements = imageBox.querySelector('.quote-preview-measurements');
  const previewWidth = measurements.querySelector('.quote-preview-width');
  const previewHeight = measurements.querySelector('.quote-preview-height');
  const previewLength = measurements.querySelector('.quote-preview-length');
  const expand = imageBox.querySelector('.quote-preview-expand');
  const dialog = document.querySelector('.quote-preview-dialog');
  const dialogContent = dialog.querySelector('.quote-preview-dialog-content');
  const close = dialog.querySelector('.quote-preview-close');
  const name = preview.querySelector('.quote-preview-name');
  const size = preview.querySelector('.quote-preview-size');
  const dimensions = preview.querySelector('.quote-preview-dimensions');
  const message = preview.querySelector('.quote-preview-message');
  const software = document.querySelector('#quote-drawing-software');
  const softwareHelp = document.querySelector('.quote-software-help');
  const drawingContents = document.querySelector('.quote-drawing-contents');
  const partsHelp = document.querySelector('.quote-parts-help');
  const form = input.closest('form');
  let objectUrl = null;
  let dispose = null;
  let epsWorker = null;
  let epsTimeout = null;
  let svgWorker = null;
  let svgTimeout = null;
  let selection = 0;
  const vendorUrl = new URL('quote-vendor/preview.js?v=2', document.currentScript.src).href;
  const epsWorkerUrl = new URL('quote-vendor/eps-worker.js?v=1', document.currentScript.src).href;
  const svgWorkerUrl = new URL('quote-vendor/svg-worker.js?v=1', document.currentScript.src).href;

  const dimensionInMm = (value) => {
    const match = /^\s*((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc)\s*$/i.exec(value);
    if (!match) return null;
    const factors = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
    const result = Number(match[1]) * factors[match[2].toLowerCase()];
    return Number.isFinite(result) && result > 0 ? result : null;
  };
  const formatMm = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const hideImage = () => {
    imageBox.hidden = true;
    if (dialog.open) dialog.close();
  };

  software.addEventListener('change', () => {
    const help = {
      cad: 'In your CAD program, look for Export or Save As and choose DXF. Export the 2D cutting outlines at the intended size in millimetres. Check the exported file before uploading.',
      vector: 'In your design program, convert the cutting artwork to paths, then look for Export or Save As DXF. Export at the intended size in millimetres and check the resulting file.',
      other: 'Tell us which program or app you used and send us what you have. We can help you prepare a DXF drawing.',
    };
    softwareHelp.textContent = help[software.value] || 'Choose an option for a starting point, or contact us and we will help.';
  });
  drawingContents.addEventListener('change', () => {
    partsHelp.textContent = drawingContents.value === 'single'
      ? 'Include any holes or internal cuts in that one part. Enter its finished size and the number of copies below.'
      : 'For multiple parts or if you are unsure, please contact us. We will review your file and help work out sheet requirements.';
  });
  form.addEventListener('submit', (event) => {
    if (drawingContents.value !== 'single') {
      event.preventDefault();
      partsHelp.textContent = 'Please contact us for help with multiple parts or if you are unsure. We will review the drawing and sheet requirements.';
      drawingContents.focus();
    }
  });

  expand.addEventListener('click', () => {
    dialog.showModal();
    dialogContent.append(imageBox);
    close.focus();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    preview.insertBefore(imageBox, preview.querySelector('.quote-preview-details'));
    if (!imageBox.hidden) expand.focus();
  });

  input.addEventListener('change', async () => {
    const current = ++selection;
    if (dialog.open) dialog.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (epsWorker) epsWorker.terminate();
    if (svgWorker) svgWorker.terminate();
    clearTimeout(epsTimeout);
    clearTimeout(svgTimeout);
    epsWorker = null;
    svgWorker = null;
    if (dispose) dispose();
    dispose = null;
    objectUrl = null;
    image.removeAttribute('src');
    image.hidden = true;
    renderBox.replaceChildren();
    renderBox.hidden = true;
    hideImage();
    measurements.hidden = true;
    previewWidth.textContent = '';
    previewHeight.textContent = '';
    previewLength.textContent = '';
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
    if (extension !== 'dxf') {
      message.textContent = 'Please choose a DXF file. Contact us if you need help preparing your drawing.';
      return;
    }
    message.textContent = 'Preparing your preview…';
    try {
      const signatureBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const signature = new TextDecoder().decode(signatureBytes);
      if (current !== selection) return;
      const binaryEps = signatureBytes[0] === 0xc5 && signatureBytes[1] === 0xd0 && signatureBytes[2] === 0xd3 && signatureBytes[3] === 0xc6;
      if (extension === 'eps' || (extension === 'ai' && (signature.startsWith('%!PS') || binaryEps))) {
        const bytes = await file.arrayBuffer();
        if (current !== selection) return;
        const worker = new Worker(epsWorkerUrl, { type: 'module' });
        epsWorker = worker;
        let response;
        try {
          response = await new Promise((resolve, reject) => {
            epsTimeout = setTimeout(() => reject(new Error('Preview timed out')), 8000);
            worker.onmessage = (event) => resolve(event.data);
            worker.onerror = () => reject(new Error('Preview worker failed'));
            worker.postMessage(bytes, [bytes]);
          });
        } finally {
          clearTimeout(epsTimeout);
          worker.terminate();
          if (epsWorker === worker) epsWorker = null;
        }
        if (current !== selection) return;
        if (response.box && response.box.length === 4 && response.box.every(Number.isFinite)
            && response.box[2] > response.box[0] && response.box[3] > response.box[1]) {
          dimensions.textContent = `Declared bounding box: ${formatMm((response.box[2] - response.box[0]) * 25.4 / 72)} × ${formatMm((response.box[3] - response.box[1]) * 25.4 / 72)} mm`;
        }
        if (response.error) {
          console.error('PostScript preview failed:', response.error);
          message.textContent = 'This PostScript file could not be previewed. Verify the artwork and enter the actual cut-part dimensions below.';
          return;
        }
        objectUrl = URL.createObjectURL(response.blob);
        image.src = objectUrl;
        image.alt = 'Preview of the selected PostScript design';
        image.onerror = () => {
          if (current !== selection) return;
          hideImage();
          message.textContent = 'The preview image could not be displayed. Verify the artwork and actual cut-part dimensions.';
        };
        image.hidden = false;
        imageBox.hidden = false;
        message.textContent = 'Illustrative preview only: PostScript features or fonts may be missing. Verify the artwork and actual cut-part dimensions.';
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
        if (result.measurements) {
          previewWidth.textContent = result.measurements.width;
          previewHeight.textContent = result.measurements.height;
          previewLength.textContent = result.measurements.pathLength;
          measurements.hidden = false;
        }
        message.textContent = result.message;
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        objectUrl = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
        image.src = objectUrl;
        image.alt = 'Preview of the selected SVG design';
        image.hidden = false;
        imageBox.hidden = false;
        dimensions.textContent = 'Reading document dimensions…';
        message.textContent = 'Check and enter the actual part dimensions below.';
        image.onerror = () => {
          if (current !== selection) return;
          hideImage();
          message.textContent = 'The SVG image could not be displayed. Check and enter the actual part dimensions below.';
        };
        const worker = new Worker(svgWorkerUrl, { type: 'module' });
        svgWorker = worker;
        try {
          const response = await new Promise((resolve, reject) => {
            svgTimeout = setTimeout(() => reject(new Error('SVG dimensions timed out')), 8000);
            worker.onmessage = (event) => resolve(event.data);
            worker.onerror = () => reject(new Error('SVG dimensions worker failed'));
            worker.postMessage(file);
          });
          if (current !== selection) return;
          if (response.error) throw new Error(response.error);
          const width = dimensionInMm(response.width);
          const height = dimensionInMm(response.height);
          dimensions.textContent = width !== null && height !== null
            ? `Declared document size: ${formatMm(width)} × ${formatMm(height)} mm`
            : 'Document dimensions in physical units are not available.';
        } catch (error) {
          if (current !== selection) return;
          console.error('SVG dimensions could not be read:', error);
          dimensions.textContent = 'Document dimensions could not be read.';
        } finally {
          clearTimeout(svgTimeout);
          worker.terminate();
          if (svgWorker === worker) svgWorker = null;
        }
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
        hideImage();
        message.textContent = 'The SVG image could not be displayed. Check and enter the actual part dimensions below.';
      };
      image.src = objectUrl;
      image.alt = 'Preview of the selected SVG design';
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
