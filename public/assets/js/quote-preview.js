(() => {
  const input = document.querySelector('.quote-prototype input[name="vector_file"]');
  const preview = document.querySelector('.quote-file-preview');
  if (!input || !preview) return;

  const imageBox = preview.querySelector('.quote-preview-image');
  const renderBox = imageBox.querySelector('.quote-preview-render');
  const measurements = imageBox.querySelector('.quote-preview-measurements');
  const previewWidth = measurements.querySelector('.quote-preview-width');
  const previewHeight = measurements.querySelector('.quote-preview-height');
  const previewLength = measurements.querySelector('.quote-preview-length');
  const expand = imageBox.querySelector('.quote-preview-expand');
  const dialog = preview.querySelector('.quote-preview-dialog');
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
  const widthInput = form.elements.part_width_mm;
  const heightInput = form.elements.part_height_mm;
  const measureStatus = document.querySelector('[data-cutting-measure-status]');
  const vendorUrl = new URL('quote-vendor/preview.js?v=3', document.currentScript.src).href;
  let dispose = null;
  let selection = 0;
  let measureAbort = null;
  const edits = new Map([[widthInput, 0], [heightInput, 0]]);
  // Remember whether a value came from the last automatic measurement. Never
  // overwrite an entry that the customer has typed, including while waiting.
  for (const field of [widthInput, heightInput]) field.addEventListener('input', () => { delete field.dataset.autoMeasured; edits.set(field, edits.get(field) + 1); });

  async function measureDrawing(file, current) {
    const controller = new AbortController();
    measureAbort = controller;
    const fields = [widthInput, heightInput];
    const before = fields.map(field => ({value:field.value, edits:edits.get(field)}));
    const body = new FormData();
    body.append('csrf_token', form.elements.csrf_token.value);
    body.append('vector_file', file);
    measureStatus.textContent = 'Checking the drawing dimensions…';
    try {
      const response = await fetch('/online-quote/measure', {method:'POST', credentials:'same-origin', body, signal:controller.signal});
      const data = await response.json();
      if (current !== selection) return;
      const values = [Number(data.width_mm), Number(data.height_mm)];
      if (!response.ok || !values.every(value => Number.isFinite(value) && value > 0)) throw new Error('Not measured');
      let filled = false;
      fields.forEach((field, index) => {
        if (window.QuoteCuttingOptions?.canAutofill(before[index], {edits:edits.get(field), value:field.value, autoMeasured:field.dataset.autoMeasured})) {
          field.value = values[index].toFixed(1);
          field.dataset.autoMeasured = '1';
          filled = true;
        }
      });
      measureStatus.textContent = filled
        ? 'Drawing size measured and added to your part details. Please check it before requesting a price.'
        : 'Drawing size measured. Your manually entered dimensions were kept; please check they match.';
    } catch (error) {
      if (error.name === 'AbortError' || current !== selection) return;
      measureStatus.textContent = 'We could not measure this drawing automatically. Check the DXF units and geometry or contact us for review.';
    } finally {
      if (measureAbort === controller) measureAbort = null;
    }
  }
  function report(type, reason = '') {
    document.dispatchEvent(new CustomEvent('site-tracking:quote-preview', {detail:{type,reason}}));
  }

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
      report('quote_blocked', 'manual_quote_required');
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
    if (measureAbort) measureAbort.abort();
    for (const field of [widthInput, heightInput]) {
      if (field.dataset.autoMeasured === '1') { field.value = ''; delete field.dataset.autoMeasured; }
    }
    measureStatus.textContent = '';
    if (dialog.open) dialog.close();
    if (dispose) dispose();
    dispose = null;
    renderBox.replaceChildren();
    renderBox.hidden = true;
    imageBox.hidden = true;
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
      report('quote_preview_error', 'file_too_large');
      return;
    }
    if (file.name.split('.').pop().toLowerCase() !== 'dxf') {
      message.textContent = 'Please choose a DXF file. Contact us if you need help preparing your drawing.';
      return;
    }
    measureDrawing(file, current);
    message.textContent = 'Preparing your preview…';
    try {
      const box = document.createElement('div');
      box.className = 'quote-preview-canvas';
      renderBox.append(box);
      imageBox.hidden = false;
      renderBox.hidden = false;
      const { previewDxf } = await import(vendorUrl);
      if (current !== selection) return;
      const result = await previewDxf(file, box);
      if (current !== selection) {
        result.dispose();
        return;
      }
      dispose = result.dispose;
      dimensions.textContent = result.dimensions;
      previewWidth.textContent = result.measurements.width;
      previewHeight.textContent = result.measurements.height;
      previewLength.textContent = result.measurements.pathLength;
      measurements.hidden = false;
      message.textContent = result.message;
      report('quote_preview_ready');
    } catch (error) {
      if (current !== selection) return;
      console.error('DXF preview failed:', error);
      report('quote_preview_error', 'drawing_unreadable');
      imageBox.hidden = true;
      if (dialog.open) dialog.close();
      message.textContent = 'We could not open this drawing for preview. Please contact us and share the DXF file so we can help.';
    }
  });
})();
