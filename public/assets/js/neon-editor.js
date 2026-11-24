/* The sign is drawn in millimetres. Camera zoom, wall scenes and lighting only
   affect the proof. Exports use the untouched geometry from NeonGeometry. */
(() => {
  'use strict';
  const root = document.querySelector('[data-neon-editor]');
  if (!root) return;
  const canvas = root.querySelector('[data-neon-canvas]');
  const engine = window.NeonGeometry;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_FILE_BYTES = 16384;
  const fields = Array.from(root.querySelectorAll('[data-neon-field]'));
  const choices = root.querySelector('[data-neon-fonts]');
  const fileInput = root.querySelector('[data-neon-import]');
  const spec = root.querySelector('[data-neon-spec]');
  const submit = root.querySelector('[data-neon-submit]');
  const outputs = new Map();
  for (const node of root.querySelectorAll('[data-neon-output]')) {
    const key = node.dataset.neonOutput;
    if (!outputs.has(key)) outputs.set(key, []);
    outputs.get(key).push(node);
  }
  function output(key, value) {
    for (const el of outputs.get(key) || []) el.textContent = value;
  }
  const shop = window.NeonShop || {};
  const fonts = (engine?.fonts || []).filter(font => !Array.isArray(shop.fonts) || shop.fonts.includes(font.id));
  const swatches = Array.from(root.querySelectorAll('[data-neon-choice="color"]'));
  const colors = swatches.map(sw => sw.dataset.value).filter(color => !Array.isArray(shop.colors) || shop.colors.includes(color));
  for (const swatch of swatches) {
    swatch.hidden = !colors.includes(swatch.dataset.value);
    swatch.disabled = swatch.hidden;
  }
  const minWidth = Number.isFinite(shop.minWidth) ? Math.max(200, shop.minWidth) : 200;
  const maxWidth = Number.isFinite(shop.maxWidth) ? Math.min(3000, shop.maxWidth) : 3000;
  if (!canvas || !engine || !engine.fonts.length) {
    output('warnings', 'The lettering engine could not load. Refresh the page to try again.');
    if (submit) submit.disabled = true;
    return;
  }
  if (!fonts.length || !colors.length || maxWidth < minWidth) {
    output('warnings', 'The shop has no lettering options available for this project.');
    if (submit) submit.disabled = true;
    return;
  }
  for (const node of fields.filter(el => el.dataset.neonField === 'widthMm')) {
    node.min = minWidth;
    node.max = maxWidth;
  }
  for (const btn of root.querySelectorAll('[data-neon-choice="widthMm"]')) {
    btn.disabled = Number(btn.dataset.value) < minWidth || Number(btn.dataset.value) > maxWidth;
  }
  const defaults = {
    version: 1, text: 'Hello', font: fonts[0].id, widthMm: Math.min(maxWidth, Math.max(minWidth, 600)),
    align: 'center', letterSpacing: 0, lineSpacing: 1.25, color: colors[0],
    backing: 'clear', mount: 'wall', scene: 'studio', power: true, brightness: 85,
  };
  const options = {
    font: fonts.map(f => f.id), color: colors, align: ['left', 'center', 'right'],
    backing: ['clear', 'black', 'none'], mount: ['wall', 'suspended', 'freestanding'],
    scene: ['brick', 'studio', 'concrete', 'drawing'],
  };
  const limits = {widthMm: [minWidth, maxWidth], letterSpacing: [0, 0.3], lineSpacing: [1, 2], brightness: [10, 100]};
  let design = {...defaults};
  let geometry;
  let zoom = 1;
  let pan = {x: 0, y: 0};
  let frame;
  let wallURL = '';
  let wallGeneration = 0;
  const past = [];
  const future = [];
  let sequence;
  const mm = value => new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(value) + ' mm';

  function svg(tag, attrs = {}, content = '') {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (content) node.textContent = content;
    return node;
  }
  function buttonState(action, disabled) {
    for (const el of root.querySelectorAll('[data-neon-action="' + action + '"]')) el.disabled = disabled;
  }
  function changed(key, value, group) {
    if (design[key] === value) return;
    const now = performance.now();
    if (!group || !sequence || sequence.key !== key || now - sequence.at > 850) {
      past.push(design);
      if (past.length > 100) past.shift();
    }
    sequence = group ? {key, at: now} : undefined;
    future.length = 0;
    design = {...design, [key]: value};
    output('status', '');
    render();
  }
  function projectError(value) {
    if (!value || value.version !== 1 || typeof value.text !== 'string' || [...value.text].length > 80 ||
        value.text.split('\n').length > 4 || /[\x00-\x09\x0b-\x1f\x7f]/.test(value.text)) {
      return 'Use up to 80 characters and four lines of text.';
    }
    for (const [key, values] of Object.entries(options)) {
      if (!values.includes(value[key])) return 'Choose one of the available ' + key + ' options.';
    }
    for (const [key, [lo, hi]] of Object.entries(limits)) {
      if (!Number.isFinite(value[key]) || value[key] < lo || value[key] > hi) return 'Choose a value within the control limits.';
    }
    if (typeof value.power !== 'boolean') {
      return 'Choose a valid power setting.';
    }
    return '';
  }
  function renderFontButtons() {
    if (!choices) return;
    for (const font of fonts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.neonChoice = 'font';
      btn.dataset.value = font.id;
      btn.setAttribute('aria-label', font.label);
      const sample = engine.layout({...defaults, text: font.id === 'aegean' ? 'Αα' : 'Aa', font: font.id, widthMm: 200});
      if (sample.valid && sample.paths.length) {
        const icon = svg('svg', {viewBox: '0 0 ' + sample.widthMm + ' ' + sample.heightMm, width: 45, height: 22, 'aria-hidden': true});
        icon.append(svg('path', {d: sample.paths.map(p => p.d).join(' '), fill: 'none', stroke: 'currentColor',
          'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
        btn.append(icon);
      }
      const label = document.createElement('span');
      label.textContent = font.label;
      btn.append(label);
      choices.append(btn);
    }
  }
  // Reuse one vector path for the shadow, halo, and physical 6 mm tube.
  function paint() {
    const w = geometry.widthMm, h = geometry.heightMm;
    canvas.replaceChildren();
    if (!geometry.paths.length || !(w > 0 && h > 0)) return;
    const technical = !wallURL && design.scene === 'drawing';
    const lit = design.power && !technical;
    const color = design.color;
    const padding = 22; // visual backboard allowance; a shop confirms its final size
    const bw = w + padding * 2, bh = h + padding * 2;
    const chartSize = Math.max(w / 52, h / 33, 6);
    const dimOffset = padding + chartSize * 2.4;
    const mountTop = design.backing !== 'none' && design.mount === 'suspended' ? Math.max(45, h * .21) : 0;
    const mountBottom = design.backing !== 'none' && design.mount === 'freestanding' ? 15 : 0;
    frame = {x: -dimOffset - chartSize, y: -dimOffset - mountTop,
      width: w + dimOffset * 2 + chartSize * 3, height: h + dimOffset * 2 + mountTop + mountBottom + chartSize * 1.6};
    camera();
    const defs = svg('defs');
    const d = geometry.paths.map(path => path.d).join(' ');
    defs.append(svg('path', {id: 'neon-tube-centerlines', d, fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
    for (const [name, blur] of [['halo', 7], ['bloom', 2.4], ['shadow', 1.5]]) {
      const filter = svg('filter', {id: 'neon-' + name, filterUnits: 'userSpaceOnUse', x: -36, y: -36, width: w + 72, height: h + 72});
      filter.append(svg('feGaussianBlur', {stdDeviation: blur}));
      defs.append(filter);
    }
    canvas.append(defs);
    const fixture = technical ? '#72808d' : '#c1cdd7';
    if (design.backing !== 'none') {
      if (design.mount === 'suspended') {
        for (const x of [w * .16, w * .84]) canvas.append(svg('line', {x1: x, x2: x, y1: -padding - mountTop, y2: -padding + 6, stroke: fixture, 'stroke-width': 1.4}));
      }
      canvas.append(svg('rect', {x: -padding, y: -padding, width: bw, height: bh, rx: 9, fill: technical ? 'none' : design.backing === 'black' ? '#0d1017' : '#cee1f7',
        'fill-opacity': design.backing === 'clear' ? .08 : .94, stroke: fixture, 'stroke-opacity': technical ? .8 : .42, 'stroke-width': 1.2}));
      if (design.mount === 'freestanding') {
        canvas.append(svg('rect', {x: w * .09, y: h + padding - 2, width: w * .82, height: mountBottom, rx: 3, fill: technical ? 'none' : '#343d47', stroke: fixture, 'stroke-width': 1.2}));
      } else {
        const xs = design.mount === 'suspended' ? [w * .16, w * .84] : [-padding + 9, w + padding - 9];
        const ys = design.mount === 'suspended' ? [-padding + 6] : [-padding + 9, h + padding - 9];
        for (const x of xs) for (const y of ys) canvas.append(svg('circle', {cx: x, cy: y, r: 2.5, fill: technical ? 'none' : '#475560', stroke: fixture, 'stroke-width': .9}));
      }
    }
    const useTube = attrs => svg('use', {href: '#neon-tube-centerlines', ...attrs});
    if (!technical) canvas.append(useTube({transform: 'translate(1.2 3.3)', stroke: '#050609', opacity: .75, filter: 'url(#neon-shadow)'}));
    if (lit) {
      const brightness = design.brightness / 100;
      canvas.append(useTube({stroke: color, opacity: brightness * .95, filter: 'url(#neon-halo)'}));
      canvas.append(useTube({stroke: color, opacity: brightness * .9, filter: 'url(#neon-bloom)'}));
    }
    canvas.append(useTube({stroke: technical ? '#29344c' : lit ? color : '#c5bec3', opacity: lit ? .46 + design.brightness / 185 : 1}));
    // Highlight sits within the silicone tube. It is excluded from production SVGs.
    if (lit) canvas.append(svg('path', {d, fill: 'none', stroke: '#fff7f6', 'stroke-width': 1.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: design.brightness / 150}));
    const measure = svg('g', {stroke: technical ? '#526371' : '#d2dadf', 'stroke-width': Math.max(.5, chartSize * .065), fill: 'none', opacity: .85});
    const offset = dimOffset + mountBottom, tick = chartSize * .33, side = w + dimOffset;
    measure.append(svg('path', {d: 'M0 ' + offset + 'h' + w + ' M0 ' + (offset - tick) + 'v' + (2 * tick) +
      ' M' + w + ' ' + (offset - tick) + 'v' + (2 * tick), transform: 'translate(0 ' + h + ')'}));
    measure.append(svg('path', {d: 'M' + side + ' 0v' + h + ' M' + (side - tick) + ' 0h' + (2 * tick) +
      ' M' + (side - tick) + ' ' + h + 'h' + (2 * tick)}));
    const type = {fill: technical ? '#364958' : '#e2e7ea', 'text-anchor': 'middle', 'font-family': 'system-ui,sans-serif', 'font-size': chartSize};
    canvas.append(measure, svg('text', {...type, x: w / 2, y: h + offset + chartSize * 1.2}, mm(w)),
      svg('text', {...type, transform: 'translate(' + (side + chartSize * 1.2) + ' ' + (h / 2) + ') rotate(-90)'}, mm(h)));
  }
  function camera() {
    if (!frame) return;
    const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2;
    const vw = frame.width / zoom, vh = frame.height / zoom;
    const limitX = wallURL ? vw * .48 : Math.max(0, (frame.width - vw) / 2);
    const limitY = wallURL ? vh * .48 : Math.max(0, (frame.height - vh) / 2);
    pan.x = Math.min(limitX, Math.max(-limitX, pan.x));
    pan.y = Math.min(limitY, Math.max(-limitY, pan.y));
    canvas.setAttribute('viewBox', [cx + pan.x - vw / 2, cy + pan.y - vh / 2, vw, vh].join(' '));
    const movable = zoom > 1 || Boolean(wallURL);
    canvas.style.cursor = movable ? 'grab' : '';
    canvas.style.touchAction = movable ? 'none' : 'pan-y';
    canvas.setAttribute('tabindex', movable ? '0' : '-1');
    canvas.setAttribute('aria-label', movable ?
      'Sign preview. Drag or use arrow keys to reposition the sign.' : 'Preview of your sign with 6 mm neon tubing');
    output('zoom', Math.round(zoom * 100) + '%');
    buttonState('zoom-in', zoom >= 3);
    buttonState('zoom-out', zoom <= (wallURL ? .25 : .65));
  }
  function render() {
    geometry = engine.layout(design);
    root.dataset.scene = design.scene;
    root.dataset.power = design.power ? 'on' : 'off';
    root.dataset.backing = design.backing;
    root.dataset.mount = design.mount;
    root.style.setProperty('--neon-color', design.color);
    for (const node of fields) {
      const key = node.dataset.neonField;
      if (!(key in design)) continue;
      if (node.type === 'checkbox') node.checked = design[key];
      else if (node.type === 'radio') node.checked = node.value === String(design[key]);
      else if (!(node.type === 'number' && node === document.activeElement) && node.value !== String(design[key])) node.value = design[key];
    }
    for (const btn of root.querySelectorAll('[data-neon-choice]')) {
      const key = btn.dataset.neonChoice;
      const selected = key === 'power' ? design.power === (btn.dataset.value === 'on') :
        !(wallURL && key === 'scene') && String(design[key]) === btn.dataset.value;
      btn.setAttribute('aria-pressed', String(selected));
      btn.classList.toggle('is-active', selected);
    }
    const colorButton = Array.from(root.querySelectorAll('[data-neon-choice="color"]')).find(el => el.dataset.value === design.color);
    output('color', colorButton?.dataset.label || colorButton?.title || colorButton?.getAttribute('aria-label') || design.color);
    output('font', engine.fonts.find(f => f.id === design.font)?.label || design.font);
    output('chars', [...design.text].length + ' / 80');
    output('brightness', design.brightness + '%');
    output('spacing', design.letterSpacing.toFixed(2) + ' em');
    output('letterSpacing', design.letterSpacing.toFixed(2) + ' em');
    output('lineSpacing', design.lineSpacing.toFixed(2) + '×');
    const structuralError = projectError(design);
    const warnings = [...new Set([structuralError, ...(geometry.errors || []), ...(geometry.warnings || [])].filter(Boolean))];
    const valid = !structuralError && geometry.valid && geometry.paths.length > 0 &&
      fields.every(field => field.type !== 'number' || (field.value !== '' && field.validity.valid));
    const warningText = warnings.join(' ');
    output('warnings', warningText);
    output('warning', warningText);
    root.dataset.neonValid = String(Boolean(valid));
    const w = geometry.widthMm, h = geometry.heightMm;
    const hasPaths = geometry.paths.length > 0;
    output('width', hasPaths ? mm(w) : '—');
    output('height', hasPaths ? mm(h) : '—');
    output('size', hasPaths ? mm(w) + ' × ' + mm(h) : '—');
    output('length', hasPaths ? (geometry.lengthMm / 1000).toFixed(2) + ' m' : '—');
    output('runs', String(geometry.paths.length));
    output('strokes', String(geometry.paths.length));
    if (spec) spec.value = valid ? JSON.stringify(design) : '';
    if (submit) submit.disabled = !valid;
    for (const action of ['export', 'export-svg', 'export-dxf']) buttonState(action, !valid);
    buttonState('undo', !past.length);
    buttonState('redo', !future.length);
    paint();
    root.dispatchEvent(new CustomEvent('neon:design', {bubbles: true,
      detail: {spec: valid ? {...design} : null, lengthMm: geometry.lengthMm}}));
  }
  function edit(key, input, group) {
    if (!(key in defaults) || key === 'version') return;
    const value = key in limits ? Number(input) : key === 'power' ? (input === true || input === 'on') : input;
    if (key in limits && (!Number.isFinite(value) || input === '' || value < limits[key][0] || value > limits[key][1])) {
      render();
      return;
    }
    if (design[key] === value && key in limits) render();
    else changed(key, value, group);
  }
  for (const node of fields) {
    const update = () => edit(node.dataset.neonField, node.type === 'checkbox' ? node.checked : node.value, true);
    node.addEventListener('input', update);
    node.addEventListener('change', update);
    node.addEventListener('blur', () => {
      sequence = undefined;
      if (node.type === 'number' && (node.value === '' || !node.validity.valid)) {
        node.value = design[node.dataset.neonField];
        render();
      }
    });
  }
  function download(contents, type, ext) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const link = document.createElement('a');
    const stem = design.text.normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48) || 'sign';
    link.href = url;
    link.download = stem + '-' + design.widthMm + 'mm.' + ext;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function history(direction) {
    const [from, to] = direction === 'undo' ? [past, future] : [future, past];
    if (!from.length) return;
    sequence = undefined;
    to.push(design);
    design = from.pop();
    render();
  }
  function clearWall() {
    ++wallGeneration;
    if (wallURL) URL.revokeObjectURL(wallURL);
    wallURL = '';
    root.dataset.wallPhoto = 'false';
    root.style.removeProperty('--neon-wall-image');
    zoom = 1;
    pan = {x: 0, y: 0};
    output('status', '');
  }
  root.querySelector('[data-neon-wall]')?.addEventListener('change', async ev => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      output('status', 'Choose a JPG, PNG or WebP photo under 12 MB.');
      return;
    }
    const attempt = ++wallGeneration;
    const url = URL.createObjectURL(file);
    const photo = new Image();
    photo.src = url;
    try {
      await photo.decode();
      if (attempt !== wallGeneration) { URL.revokeObjectURL(url); return; }
      if (photo.naturalWidth * photo.naturalHeight > 60_000_000) throw Error('oversize');
      if (wallURL) URL.revokeObjectURL(wallURL);
      wallURL = url;
      root.style.setProperty('--neon-wall-image', 'url("' + url + '")');
      root.dataset.wallPhoto = 'true';
      zoom = .75; pan = {x: 0, y: 0};
      render();
      output('status', 'Drag to position your sign. Photo scale is approximate. This photo stays on your device.');
    } catch {
      URL.revokeObjectURL(url);
      if (attempt === wallGeneration) output('status', 'This photo could not be displayed. Try a smaller JPG, PNG or WebP.');
    }
  });
  root.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-neon-choice],[data-neon-action]');
    if (!btn || btn.disabled) return;
    if (btn.hasAttribute('data-neon-choice')) {
      if (wallURL && btn.dataset.neonChoice === 'scene') {
        clearWall();
        render();
      }
      edit(btn.dataset.neonChoice, btn.dataset.value, false);
      return;
    }
    const action = btn.dataset.neonAction;
    if (action === 'clear-wall') { clearWall(); render(); }
    if (action === 'undo' || action === 'redo') history(action);
    if (action === 'zoom-in' || action === 'zoom-out' || action === 'fit') {
      zoom = action === 'fit' ? (wallURL ? .75 : 1) : Math.min(3, Math.max(wallURL ? .25 : .65, +(zoom * (action === 'zoom-in' ? 1.25 : .8)).toFixed(2)));
      if (action === 'fit') pan = {x: 0, y: 0};
      camera();
    }
    if (action === 'export-svg' || action === 'export') {
      if (!geometry.valid || projectError(design)) return;
      download(engine.svg(geometry, {color: design.color}), 'image/svg+xml', 'svg');
      output('status', 'Centerline drawing downloaded.');
    }
    if (action === 'export-dxf' && geometry.valid && !projectError(design)) {
      download(engine.dxf(geometry), 'application/dxf', 'dxf');
      output('status', 'DXF centerlines downloaded in millimetres.');
    }
    if (action === 'export-project' || action === 'save') {
      const error = projectError(design);
      if (error) { output('status', error); return; }
      download(JSON.stringify(design, null, 2), 'application/json', 'neon.json');
      output('status', 'Editable design downloaded.');
    }
    if (action === 'import-project' || action === 'load') fileInput?.click();
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw Error('This file is too large for a neon project.');
      const imported = JSON.parse(await file.text());
      if (!imported || imported.version !== 1) throw Error('Choose a .neon.json design exported by this editor.');
      const error = projectError(imported);
      if (error) throw Error(error);
      past.push(design);
      if (past.length > 100) past.shift();
      future.length = 0;
      sequence = undefined;
      design = Object.fromEntries(Object.keys(defaults).map(key => [key, imported[key]]));
      clearWall();
      render();
      output('status', 'Design opened.');
    } catch (err) {
      output('status', err instanceof SyntaxError ? 'Choose a valid .neon.json design file.' : err.message);
    }
  });
  // Drag to inspect a zoomed drawing; use the inverse SVG transform so dragging
  // tracks the pointer even when the sign is letterboxed on a narrow screen.
  let drag;
  canvas.addEventListener('pointerdown', ev => {
    if ((!wallURL && zoom <= 1) || !ev.isPrimary || ev.button !== 0) return;
    const ctm = canvas.getScreenCTM();
    if (!ctm) return;
    drag = {id: ev.pointerId, x: ev.clientX, y: ev.clientY, start: {...pan}, scale: ctm.a};
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    pan.x = drag.start.x + (drag.x - ev.clientX) / drag.scale;
    pan.y = drag.start.y + (drag.y - ev.clientY) / drag.scale;
    camera();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });
  canvas.addEventListener('keydown', ev => {
    if ((!wallURL && zoom <= 1) || !frame) return;
    const step = frame.width / (zoom * (ev.shiftKey ? 15 : 75));
    const move = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}[ev.key];
    if (!move) return;
    ev.preventDefault();
    pan.x += move[0]; pan.y += move[1];
    camera();
  });
  root.addEventListener('keydown', ev => {
    if (ev.target.closest('textarea,input,select,[contenteditable]')) return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      history(ev.shiftKey ? 'redo' : 'undo');
    }
  });
  root.querySelector('[data-neon-quote-form]')?.addEventListener('submit', ev => {
    render();
    if (!spec?.value) ev.preventDefault();
  });
  renderFontButtons();
  render();
})();
