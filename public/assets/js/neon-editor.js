/* The sign is drawn in millimetres. Preview and exports use the same paths;
   camera zoom, wall scenes and lighting only affect the proof. */
(() => {
  'use strict';
  const root = document.querySelector('[data-neon-editor]');
  if (!root) return;
  const canvas = root.querySelector('[data-neon-canvas]');
  const stage = root.querySelector('.neon-view');
  const expandedProof = root.querySelector('.neon-expanded-proof');
  const engine = window.NeonGeometry;
  const stripPlanning = window.NeonStripPlanning;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_FILE_BYTES = 16384;
  const WHITE_COVER = '#ffffff';
  const fields = Array.from(root.querySelectorAll('[data-neon-field]'));
  const choices = root.querySelector('[data-neon-fonts]');
  const fontDialog = root.querySelector('.neon-font-dialog');
  const fontSearch = root.querySelector('[data-neon-font-search]');
  const fontCategory = root.querySelector('[data-neon-font-category]');
  const fontCards = new Map();
  const fileInput = root.querySelector('[data-neon-import]');
  const spec = root.querySelector('[data-neon-spec]');
  const requestIntent = root.querySelector('input[name="intent"]');
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
  const coverSwatches = Array.from(root.querySelectorAll('[data-neon-choice="cover"]'));
  const covers = coverSwatches.map(sw => sw.dataset.value).filter(value => value === WHITE_COVER || colors.includes(value));
  for (const swatch of [...swatches, ...coverSwatches]) {
    const available = swatch.dataset.neonChoice === 'cover' ? covers : colors;
    swatch.hidden = !available.includes(swatch.dataset.value);
    swatch.disabled = swatch.hidden;
  }
  const minWidth = Number.isFinite(shop.minWidth) ? Math.max(100, shop.minWidth) : 100;
  const maxWidth = Number.isFinite(shop.maxWidth) ? Math.min(3000, shop.maxWidth) : 3000;
  if (!canvas || typeof engine?.layout !== 'function' || !engine.fonts.length || typeof stripPlanning?.fitIndependentPaths !== 'function') {
    output('warnings', 'The lettering engine could not load. Refresh the page to try again.');
    if (submit) submit.disabled = true;
    return;
  }
  if (!covers.includes(WHITE_COVER) || !outputs.has('pairing')) {
    output('warnings', 'The neon colour options have changed. Reload the page to open the updated designer.');
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
    version: 2, text: 'Hello', font: fonts[0].id, widthMm: Math.min(maxWidth, Math.max(minWidth, 600)),
    align: 'center', letterSpacing: 0, lineSpacing: 1.25, color: colors[0], lineColors: [], cover: WHITE_COVER,
    boardShape: 'rectangle', boardGap: 30, backing: 'clear', mount: 'wall', scene: 'studio', power: true, brightness: 85,
  };
  const options = {
    font: fonts.map(f => f.id), color: colors, cover: covers, align: ['left', 'center', 'right'],
    boardShape: ['rectangle','contour'], backing: ['clear', 'black', 'none'], mount: ['wall', 'suspended', 'freestanding'],
    scene: ['brick', 'studio', 'concrete', 'drawing'],
  };
  const limits = {widthMm: [minWidth, maxWidth], boardGap: [30, 150], letterSpacing: [0, 0.3], lineSpacing: [1, 2], brightness: [10, 100]};
  let design = {...defaults};
  let widthAllowance = 0;
  let geometry;
  let geometryKey;
  let paintedBoardKey;
  let paintedBoard;
  let currentSampleKey;
  let compatibleFonts = fonts;
  let pendingImport;
  let returnFocus;
  let zoom = 1;
  const maxZoom = 3;
  const minZoom = () => wallURL ? .25 : .65;
  let pan = {x: 0, y: 0};
  let frame;
  let wallURL = '';
  let wallGeneration = 0;
  const past = [];
  const future = [];
  let sequence;
  const mm = value => new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(value) + ' mm';
  const cutMeasure = new Intl.NumberFormat(undefined, {maximumFractionDigits: 3});

  function prepareDrawing(spec) {
    let drawing = engine.repairLayout(spec);
    if (!drawing.valid) return drawing;
    const fit = stripPlanning.fitIndependentPaths(drawing, engine.inspectManufacturing);
    if (fit.applied) drawing = fit.artwork;
    drawing.stripFit = {applied:fit.applied, reason:fit.reason || null,
      pathsMatchCutMarks:fit.plan.pathsMatchCutMarks,
      electricalRoutingVerified:fit.plan.electricalRoutingVerified,
      coverCrossingsVerified:false};
    return drawing;
  }

  function needsShopReview(drawing) {
    return Boolean(drawing.manufacturing?.requiresReview || !drawing.stripFit?.pathsMatchCutMarks ||
      !drawing.stripFit?.electricalRoutingVerified || !drawing.stripFit?.coverCrossingsVerified);
  }

  function svg(tag, attrs = {}, content = '') {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (content) node.textContent = content;
    return node;
  }
  function buttonState(action, disabled) {
    for (const el of root.querySelectorAll('[data-neon-action="' + action + '"]')) el.disabled = disabled;
  }
  for (const select of root.querySelectorAll('[data-neon-line-color]')) {
    for (const option of select.options) {
      option.disabled = Boolean(option.value && !colors.includes(option.value));
    }
    select.addEventListener('change',()=>{
      const line = Number(select.dataset.neonLineColor);
      const next = Array.from({length:Math.max(line+1,design.lineColors.length)},(_,index)=>
        index===line ? select.value || null : design.lineColors[index] || null);
      changed('lineColors',next,false);
    });
  }
  function changed(key, value, group) {
    if (design[key] === value) return;
    if (key === 'color' && design.cover !== WHITE_COVER && value !== design.cover) return;
    const now = performance.now();
    if (!group || !sequence || sequence.key !== key || now - sequence.at > 850) {
      past.push(design);
      if (past.length > 100) past.shift();
    }
    sequence = group ? {key, at: now} : undefined;
    future.length = 0;
    design = {...design, [key]: value};
    if (design.mount !== 'wall' && design.boardShape === 'contour') design.boardShape = 'rectangle';
    if (key === 'cover' && value !== WHITE_COVER) {
      design.color = value;
      design.lineColors = [];
    }
    output('status', '');
    render();
  }
  function projectError(value) {
    if (!value || value.version !== 2 || typeof value.text !== 'string' || [...value.text].length > 80 ||
        value.text.split('\n').length > 4 || /[\x00-\x09\x0b-\x1f\x7f]/.test(value.text)) {
      return 'Use up to 80 characters and four lines of text.';
    }
    for (const [key, values] of Object.entries(options)) {
      if (!values.includes(value[key])) return 'Choose one of the available ' + key + ' options.';
    }
    if (!Array.isArray(value.lineColors) || value.lineColors.length > 4 ||
        value.lineColors.some(color => color !== null && (!colors.includes(color) || value.cover !== WHITE_COVER))) {
      return 'Choose available line colours with a white silicone cover.';
    }
    if (value.cover !== WHITE_COVER && value.cover !== value.color) {
      return 'A coloured silicone cover requires a matching LED. Choose a white cover to use a different LED.';
    }
    for (const [key, [lo, hi]] of Object.entries(limits)) {
      if (!Number.isFinite(value[key]) || value[key] < lo || value[key] > hi) return 'Choose a value within the control limits.';
    }
    if (typeof value.power !== 'boolean') {
      return 'Choose a valid power setting.';
    }
    if (value.boardShape === 'contour' && value.mount !== 'wall') return 'Cut-around acrylic is available for wall mounting only.';
    return '';
  }
  function previewText(font, text) {
    const line = text.split('\n').map(row => row.trim()).find(Boolean);
    const word = Array.from(line || font.sample || 'Neon').slice(0, 18).join('');
    return word.normalize('NFC');
  }
  function drawSpecimen(container, font, text) {
    const sample = engine.layout({...defaults, text, font: font.id, widthMm: 600});
    container.replaceChildren();
    if (!sample.valid) return;
    const icon = svg('svg', {viewBox: [-4, -4, sample.widthMm + 8, sample.heightMm + 8].join(' '), 'aria-hidden': true});
    icon.append(svg('path', {d: sample.paths.map(p => p.d).join(' '), fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
    container.append(icon);
  }
  function initFontBrowser() {
    const categories = new Set();
    for (const font of fonts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.neonChoice = 'font';
      btn.dataset.value = font.id;
      btn.setAttribute('aria-label', font.label);
      const specimen = document.createElement('span');
      specimen.className = 'neon-type-specimen';
      const label = document.createElement('span');
      label.textContent = font.label;
      label.className = 'neon-type-name';
      const meta = document.createElement('span');
      meta.className = 'neon-type-meta';
      btn.append(specimen, label, meta);
      choices.append(btn);
      fontCards.set(font.id, {btn, specimen, meta});
      if (font.category) categories.add(font.category);
    }
    for (const name of Array.from(categories).sort()) fontCategory.add(new Option(name, name));
    fontCategory.closest('label').hidden = categories.size < 2;
    fontSearch.addEventListener('input', filterFontCards);
    fontCategory.addEventListener('change', filterFontCards);
    fontDialog.addEventListener('close', () => {
      if (fontDialog.open) return;
      pendingImport = null;
      if (document.activeElement === document.body || fontDialog.contains(document.activeElement)) {
        returnFocus?.focus({preventScroll: true});
      }
    });
    fontDialog.addEventListener('click', event => {
      if (event.target !== fontDialog) return;
      const rect = fontDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) fontDialog.close();
    });
  }
  function compatibleStyles(text) {
    const letters = [...new Set(text.normalize('NFC').replace(/\n/g, ''))];
    return fonts.filter(font => letters.every(ch => Object.hasOwn(window.NeonStrokeFonts[font.id].glyphs, ch)));
  }
  function filterFontCards() {
    const query = fontSearch.value.trim().toLowerCase();
    const target = pendingImport || design;
    const compatible = pendingImport ? compatibleStyles(target.text) : compatibleFonts;
    let matches = 0;
    for (const font of fonts) {
      const card = fontCards.get(font.id);
      const {btn, specimen, meta} = card;
      const visible = (!fontCategory.value || font.category === fontCategory.value) &&
        (font.label + ' ' + (font.category || '') + ' ' + (font.sample || '')).toLowerCase().includes(query);
      btn.hidden = !visible;
      if (!visible) continue;
      ++matches;
      const fits = compatible.includes(font);
      btn.disabled = !fits;
      btn.style.order = fits ? 0 : 1;
      const text = fits ? previewText(font, target.text) : font.sample || 'Neon';
      if (card.sample !== text) {
        drawSpecimen(specimen, font, text);
        card.sample = text;
      }
      meta.textContent = fits ? font.category || '' : 'Missing letters in your text';
      btn.setAttribute('aria-pressed', String(target.font === font.id));
    }
    const noun = matches === 1 ? 'style' : 'styles';
    const count = root.querySelector('[data-neon-font-count]');
    count.textContent = matches ? matches + ' ' + noun : 'No matching styles. Try another search or category.';
  }
  function renderFontSummary() {
    const active = fonts.find(font => font.id === design.font);
    compatibleFonts = compatibleStyles(design.text);
    const matches = compatibleFonts.includes(active);
    const sample = matches ? previewText(active, design.text) : active.sample || 'Neon';
    const key = active.id + '/' + sample;
    if (key !== currentSampleKey) {
      drawSpecimen(root.querySelector('[data-neon-current-sample]'), active, sample);
      currentSampleKey = key;
    }
    root.querySelector('[data-neon-browse-label]').textContent = 'Browse ' + fonts.length + (fonts.length === 1 ? ' style' : ' styles');
    const hint = root.querySelector('[data-neon-action="match-font"]');
    hint.hidden = matches || !compatibleFonts.length;
    if (!hint.hidden) hint.textContent = 'Use ' + compatibleFonts[0].label + ' for this text';
    for (const action of ['previous-font', 'next-font']) buttonState(action, compatibleFonts.length <= (matches ? 1 : 0));
    if (fontDialog.open) filterFontCards();
  }
  function browseFonts(replacement) {
    pendingImport = replacement;
    const notice = root.querySelector('[data-neon-font-replacement]');
    notice.hidden = !replacement;
    const title = fontDialog.querySelector('h3');
    if (replacement) {
      const original = engine.fonts.find(font => font.id === replacement.font);
      notice.textContent = original.label + ' is no longer offered. Choose a replacement to open this design with its saved wording and settings.';
      title.textContent = 'Choose a replacement style';
    } else {
      title.textContent = 'Choose a letter style';
    }
    returnFocus = root.querySelector('[data-neon-action="' + (replacement ? 'import-project' : 'browse-fonts') + '"]');
    fontSearch.value = '';
    fontCategory.value = '';
    filterFontCards();
    fontDialog.showModal();
    fontDialog.querySelector('.neon-font-list').scrollTop = 0;
  }
  function cycleFont(direction) {
    if (!compatibleFonts.length) return;
    const index = compatibleFonts.findIndex(font => font.id === design.font);
    const next = index < 0 ? 0 : (index + direction + compatibleFonts.length) % compatibleFonts.length;
    changed('font', compatibleFonts[next].id, false);
  }
  function currentBoard() {
    const boardKey = JSON.stringify([geometryKey, design.backing, design.boardShape, design.boardGap, design.mount]);
    if (boardKey !== paintedBoardKey) {
      paintedBoard = engine.backboard(geometry, design);
      paintedBoardKey = boardKey;
    }
    return paintedBoard;
  }
  // Reuse one vector path for the shadow, halo, and physical 6 mm tube.
  function paint() {
    const w = geometry.widthMm, h = geometry.heightMm;
    canvas.replaceChildren();
    if (!geometry.paths.length || !(w > 0 && h > 0)) {
      frame = undefined;
      return;
    }
    const technical = !wallURL && design.scene === 'drawing';
    const lit = design.power && !technical;
    const color = design.color;
    const board = currentBoard();
    const padding = board?.pad ?? 22;
    const chartSize = Math.max(w / 52, h / 33, 6);
    const dimOffset = padding + chartSize * 2.4;
    const mountTop = design.backing !== 'none' && design.mount === 'suspended' ? Math.max(45, h * .21) : 0;
    const mountBottom = design.backing !== 'none' && design.mount === 'freestanding' ? 15 : 0;
    frame = {x: -dimOffset - chartSize, y: -dimOffset - mountTop,
      width: w + dimOffset * 2 + chartSize * 3, height: h + dimOffset * 2 + mountTop + mountBottom + chartSize * 1.6};
    camera();
    const defs = svg('defs');
    const d = geometry.paths.map(path => path.d).join(' ');
    defs.append(svg('path', {id: 'neon-tube-centerlines', d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
    const previewSpread = Math.sqrt(w / 600);
    for (const [name, blur] of [['halo', 7 * previewSpread], ['bloom', 2 * previewSpread], ['shadow', 1.5]]) {
      const filter = svg('filter', {id: 'neon-' + name, filterUnits: 'userSpaceOnUse', x: -52, y: -52, width: w + 104, height: h + 104});
      filter.append(svg('feGaussianBlur', {stdDeviation: blur}));
      defs.append(filter);
    }
    canvas.append(defs);
    const fixture = technical ? '#72808d' : '#c1cdd7';
    if (design.backing !== 'none') {
      for (const outline of board.outlines) canvas.append(svg('polygon', {points:outline.map(p=>p.join(',')).join(' '), fill: technical ? 'none' : design.backing === 'black' ? '#0d1017' : '#cee1f7',
        'fill-opacity': design.backing === 'clear' ? .08 : .94, stroke:fixture, 'stroke-width':1.2}));
      for (const [x,y] of board.holes) {
        if (!board.wall) canvas.append(svg('line',{x1:x,x2:x,y1:-padding-mountTop,y2:y,stroke:fixture,'stroke-width':1.4}));
        if (board.wall) canvas.append(svg('circle',{cx:x,cy:y,r:8,fill:technical?'none':'#8b939b',stroke:fixture,'stroke-width':.6}));
        if (technical || !board.wall) canvas.append(svg('circle',{cx:x,cy:y,r:board.wall?5.5:2.5,fill:'none',stroke:fixture,'stroke-width':.6}));
      }
      if (design.mount === 'freestanding') canvas.append(svg('rect',{x:w*.09,y:h+padding-2,width:w*.82,height:mountBottom,rx:3,fill:technical?'none':'#343d47',stroke:fixture}));
    }
    const useTube = attrs => svg('use', {href: '#neon-tube-centerlines', 'stroke-width': 6, ...attrs});
    if (technical) {
      // The narrow edge keeps white silicone and pale light visible on drafting paper.
      canvas.append(svg('path', {d, fill: 'none', stroke: '#536478', 'stroke-width': 7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
    } else {
      canvas.append(useTube({transform: 'translate(1.2 3.3)', stroke: '#050609', opacity: .75, filter: 'url(#neon-shadow)'}));
    }
    const level = design.brightness / 100;
    const linePaths = new Map();
    for (const path of geometry.paths) linePaths.set(path.line,(linePaths.get(path.line) || '') + ' ' + path.d);
    for (const [line,pathData] of linePaths) {
      const lineColor = design.power ? (design.lineColors[line] || color) : design.cover;
      const path = attrs => svg('path',{d:pathData,fill:'none',stroke:lineColor,'stroke-width':6,
        'stroke-linecap':'round','stroke-linejoin':'round',...attrs});
      if (lit) {
        canvas.append(path({'stroke-width':16*previewSpread,opacity:.65*level,filter:'url(#neon-halo)'}));
        canvas.append(path({'stroke-width':8+2*previewSpread,opacity:.9*level,filter:'url(#neon-bloom)'}));
        canvas.append(path({opacity:.55+.45*level}));
      } else canvas.append(path());
    }
    const locations = geometry.reviewLocations?.locations || [];
    if (root.querySelector('[data-neon-show-issues]').checked) {
      for (const [index,issue] of locations.entries()) {
        const [x,y]=issue.point;
        const radius=Math.max(7,chartSize*.8);
        const marker=svg('g',{'data-neon-issue':index+1});
        marker.append(svg('circle',{cx:x,cy:y,r:radius,fill:'none',stroke:'#ffd13d','stroke-width':Math.max(1.2,radius*.16)}));
        marker.append(svg('circle',{cx:x+radius,cy:y-radius,r:radius*.62,fill:'#ffd13d',stroke:'#2d2200','stroke-width':.6}));
        marker.append(svg('text',{x:x+radius,y:y-radius,'text-anchor':'middle','dominant-baseline':'central',fill:'#211a00','font-family':'system-ui,sans-serif','font-size':radius*.75,'font-weight':'bold'},String(index+1)));
        marker.append(svg('title',{},issue.type));
        canvas.append(marker);
      }
    }
    const measure = svg('g', {stroke: technical ? '#526371' : '#d2dadf', 'stroke-width': Math.max(.5, chartSize * .065), fill: 'none', opacity: .85});
    const size = engine.finishedSize(geometry,board,design);
    const axisLabel=board ? 'Acrylic ' : '';
    const tick=chartSize*.33, axisY=h+dimOffset+mountBottom, axisX=w+dimOffset;
    measure.append(svg('path',{d:'M'+size.left+' '+axisY+'H'+size.right+' M'+axisX+' '+size.top+'V'+size.bottom}));
    for (const x of [size.left,size.right]) measure.append(svg('path',{d:'M'+x+' '+(axisY-tick)+'v'+(2*tick)}));
    for (const y of [size.top,size.bottom]) measure.append(svg('path',{d:'M'+(axisX-tick)+' '+y+'h'+(2*tick)}));
    const type={fill:technical?'#364958':'#e2e7ea','text-anchor':'middle','font-family':'system-ui,sans-serif','font-size':chartSize};
    canvas.append(measure,svg('text',{...type,x:(size.left+size.right)/2,y:axisY+chartSize*1.2},axisLabel+mm(size.widthMm)),
      svg('text',{...type,transform:'translate('+(axisX+chartSize*1.2)+' '+((size.top+size.bottom)/2)+') rotate(-90)'},axisLabel+mm(size.heightMm)));

  }
  let previewWindow, previewPanel;
  function syncDetachedPreview() {
    if (!previewWindow || previewWindow.closed || !previewPanel) return;
    const host=previewPanel.parentElement;
    host.dataset.scene=root.dataset.scene;
    host.dataset.wallPhoto=root.dataset.wallPhoto || 'false';
    host.style.setProperty('--neon-wall-image',root.style.getPropertyValue('--neon-wall-image'));
    const copy=canvas.cloneNode(true);
    copy.removeAttribute('tabindex');
    copy.style.cursor='';
    previewPanel.replaceChildren(copy,root.querySelector('[data-neon-preview-price]').cloneNode(true));
  }
  const previewObserver=new MutationObserver(syncDetachedPreview);
  function restorePreview() {
    previewObserver.disconnect();
    previewPanel=null;
    delete stage.dataset.previewPopped;
    stage.querySelector('.neon-preview-away').hidden=true;
  }
  function detachPreview() {
    if (previewWindow && !previewWindow.closed) {
      previewWindow.focus();
      return;
    }
    previewWindow=window.open('','adotNeonPreview','popup,width=1100,height=760');
    if (!previewWindow) {
      output('status','Allow pop-ups for this site to open the live preview.');
      return;
    }
    const doc=previewWindow.document;
    doc.title='Neon sign · Live preview';
    const meta=doc.createElement('meta');
    meta.name='viewport'; meta.content='width=device-width, initial-scale=1';
    const stylesheet=doc.createElement('link');
    stylesheet.rel='stylesheet';
    stylesheet.href=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.href.includes('/neon-editor.css'))?.href
      || new URL('/public/assets/css/neon-editor.css',location.origin).href;
    const styles=doc.createElement('style');
    styles.textContent='body{margin:0;background:#181a20}.neon-studio.neon-detached{max-width:none;padding:0;margin:0}.neon-detached .neon-view{height:100dvh;border:0;border-radius:0;grid-template-rows:minmax(0,1fr)}.neon-detached svg{width:100%;height:100%;display:block}@media(max-width:600px){.neon-detached .neon-view:has(.neon-preview-price:not([hidden])){grid-template-rows:minmax(0,1fr) auto}}';
    doc.head.replaceChildren(meta,stylesheet,styles);
    const host=doc.createElement('main');
    host.className='neon-studio neon-detached';
    previewPanel=doc.createElement('div');
    previewPanel.className='neon-view neon-drawing-area';
    host.append(previewPanel);
    doc.body.replaceChildren(host);
    previewObserver.observe(canvas,{attributes:true,childList:true,subtree:true});
    previewObserver.observe(root.querySelector('[data-neon-preview-price]'),{attributes:true,childList:true});
    syncDetachedPreview();
    stage.dataset.previewPopped='';
    stage.querySelector('.neon-preview-away').hidden=false;
    previewWindow.addEventListener('pagehide',restorePreview,{once:true});
  }
  window.addEventListener('pagehide',()=>{
    previewObserver.disconnect();
    if (previewWindow && !previewWindow.closed) previewWindow.close();
  });

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
    canvas.setAttribute('tabindex', movable ? '0' : '-1');
    canvas.setAttribute('aria-label', movable ?
      'Sign preview. Scroll or pinch to zoom. Drag or use arrow keys to reposition the sign.' :
      'Preview of your sign with 6 mm neon tubing. Scroll or pinch to zoom.');
    output('zoom', Math.round(zoom * 100) + '%');
    buttonState('zoom-in', zoom >= maxZoom);
    buttonState('zoom-out', zoom <= minZoom());
  }
  const clampZoom = value => Math.min(maxZoom, Math.max(minZoom(), value));
  function render() {
    const longestLine = Math.max(0,...design.text.normalize('NFC').split('\n').map(line=>Array.from(line.replace(/\s/gu,'')).length));
    const requiredWidth = Math.max(minWidth, longestLine*(shop.mmPerCharacter ?? 100));
    const effectiveMin = Math.min(requiredWidth, maxWidth);
    const sizeError = requiredWidth > maxWidth ? 'Split the lettering over more lines to fit the maximum width of '+maxWidth+' mm.' : '';
    if (design.widthMm < effectiveMin) design = {...design,widthMm:effectiveMin};
    const nextKey = JSON.stringify([design.text, design.font, design.widthMm, design.align, design.letterSpacing, design.lineSpacing,
      design.backing, design.boardShape, design.boardGap, design.mount]);
    if (nextKey !== geometryKey) {
      geometry = prepareDrawing(design);
      if (geometry.valid) {
        geometry.reviewLocations = geometry.manufacturing.requiresReview ? engine.inspectManufacturing(geometry.runs,true) : null;
        if (geometry.manufacturing.shortStrokes) geometry.warnings.push('A neon stroke is shorter than 6 mm and needs shop review.');
        if (geometry.manufacturing.closePaths) geometry.warnings.push('Some neon paths are too close, overlap, or have a junction that needs shop review.');
        if (geometry.manufacturing.tightCurves) geometry.warnings.push('A neon curve is very tight and needs shop review.');
        if (geometry.manufacturing.sharpReturns) geometry.warnings.push('A return angle is under 45° and needs shop review.');
        geometry.warnings.push('LED routing and silicone-cover joins need shop review before production.');
        if (!geometry.stripFit.pathsMatchCutMarks) geometry.warnings.push('Some drawing strokes are not 25 mm multiples; the LED layout needs review.');
        if (geometry.stripFit.applied) geometry.warnings.push('Some separate strokes were adjusted for 25 mm LED cuts. Review the updated drawing.');
        if (geometry.manufacturing.incomplete) geometry.warnings.push('This design needs a manual clearance check.');
        if (geometry.repair?.changed) geometry.warnings.push('Letter spacing or height was adjusted for neon clearance. Please review the preview and final dimensions.');
      }
      geometryKey = nextKey;
      renderFontSummary();
    }
    root.dataset.scene = design.scene;
    root.dataset.power = design.power ? 'on' : 'off';
    root.dataset.backing = design.backing;
    root.querySelector('[data-neon-field="boardShape"]').disabled = design.backing === 'none';
    const gap = root.querySelector('[data-neon-field="boardGap"]');
    gap.disabled = design.backing === 'none' || design.boardShape !== 'contour';
    gap.closest('label').hidden = gap.disabled;
    root.querySelector('[data-neon-field="boardShape"] option[value="contour"]').disabled = design.mount !== 'wall';
    root.dataset.mount = design.mount;
    root.style.setProperty('--neon-color', design.color);
    for (const node of fields) {
      const key = node.dataset.neonField;
      if (!(key in design)) continue;
      if (key === 'widthMm') continue;
      if (node.type === 'checkbox') node.checked = design[key];
      else if (node.type === 'radio') node.checked = node.value === String(design[key]);
      else if (!(node.type === 'number' && node === document.activeElement) && node.value !== String(design[key])) node.value = design[key];
    }
    for (const btn of root.querySelectorAll('[data-neon-choice]')) {
      const key = btn.dataset.neonChoice;
      if (key === 'color') btn.disabled = btn.hidden || (design.cover !== WHITE_COVER && btn.dataset.value !== design.cover);
      const selected = key === 'power' ? design.power === (btn.dataset.value === 'on') :
        !(wallURL && key === 'scene') && String(design[key]) === btn.dataset.value;
      btn.setAttribute('aria-pressed', String(selected));
      btn.classList.toggle('is-active', selected);
    }
    for (const select of root.querySelectorAll('[data-neon-line-color]')) {
      const line = Number(select.dataset.neonLineColor);
      const active = design.cover === WHITE_COVER && Boolean(design.text.split('\n')[line]?.trim());
      select.disabled = !active;
      select.closest('label').hidden = !active;
      select.value = design.lineColors[line] || '';
    }
    const ledLabel = swatches.find(el => el.dataset.value === design.color).dataset.label;
    const coverLabel = coverSwatches.find(el => el.dataset.value === design.cover).dataset.label;
    output('color', ledLabel);
    output('cover', coverLabel);
    const pairingHelp = design.cover === WHITE_COVER
      ? 'White silicone shows when the lights are off. Choose any available LED colour for when they are on.'
      : coverLabel + ' silicone uses a matching LED. Choose a white cover to use a different light colour.';
    if (outputs.get('pairing')[0].textContent !== pairingHelp) output('pairing', pairingHelp);
    output('font', engine.fonts.find(f => f.id === design.font)?.label || design.font);
    output('chars', [...design.text].length + ' / 80');
    output('brightness', design.brightness + '%');
    output('spacing', design.letterSpacing.toFixed(2) + ' em');
    output('letterSpacing', design.letterSpacing.toFixed(2) + ' em');
    output('lineSpacing', design.lineSpacing.toFixed(2) + '×');
    const board = geometry.valid ? currentBoard() : null;
    const finished = geometry.valid ? engine.finishedSize(geometry,board,design) : null;
    widthAllowance = board ? Math.max(0,finished.widthMm-design.widthMm) : 0;
    root.querySelector('label[for="neon-width"]').textContent = design.backing === 'none' ? 'Lettering width' : 'Finished acrylic width';
    for (const control of fields.filter(field => field.dataset.neonField === 'widthMm')) {
      const allowanceCorrection=widthAllowance-2*engine.acrylicMargin(design.widthMm,design);
      control.min = Math.floor(Math.min(3000,effectiveMin+2*engine.acrylicMargin(effectiveMin,design)+allowanceCorrection)*10)/10;
      control.max = Math.min(3000,maxWidth+2*engine.acrylicMargin(maxWidth,design)+allowanceCorrection);
      control.setAttribute('aria-label',design.backing === 'none' ? 'Lettering width in millimetres' : 'Finished acrylic width in millimetres');
      if (control.type === 'range' || control !== document.activeElement) control.value = Number((design.widthMm+widthAllowance).toFixed(1));
    }
    const limitError = finished && !finished.withinLimit ? 'The finished sign must fit within 3,000 × 2,000 mm. Reduce the lettering size or acrylic gap.' : '';
    const spacerError = board?.wall && board.requestedSpacers && board.holes.length < board.requestedSpacers
      ? 'The acrylic needs a manual spacer layout. Adjust the backing or contact the shop.' : '';
    const structuralError = sizeError || limitError || spacerError || projectError(design);
    output('acrylic-size',board ? mm(finished.widthMm)+' × '+mm(finished.heightMm) : '—');
    const ready = !structuralError && geometry.valid && fields.every(field =>
      field.type !== 'number' || field.disabled || (field.value !== '' && field.validity.valid));
    const warningText = [...new Set([structuralError, ...geometry.errors, ...geometry.warnings].filter(Boolean))].join(' ');
    output('warnings', warningText);
    const issueList = root.querySelector('[data-neon-issues]');
    const issues = geometry.reviewLocations?.locations || [];
    const issueSection = root.querySelector('[data-neon-issues-section]');
    issueSection.hidden = !geometry.manufacturing?.requiresReview;
    issueList.replaceChildren(...issues.map((issue,index)=>{
      const item=document.createElement('li');
      item.textContent=(index+1)+'. '+issue.type;
      return item;
    }));
    root.querySelector('[data-neon-issues-note]').textContent =
      geometry.reviewLocations?.incomplete ? 'The automatic scan was incomplete. Other areas may also need review.'
      : issues.length >= 60 ? 'Showing the first 60 areas. Other areas may also need review.'
      : issues.length ? 'Numbers mark areas to review on the drawing.' : 'No precise location is available for this warning.';
    const clearanceButton = root.querySelector('[data-neon-action="find-clearance-size"]');
    clearanceButton.hidden = !geometry.manufacturing?.requiresReview;
    clearanceButton.textContent = 'Find clearer spacing';
    output('warning', warningText);
    root.dataset.neonValid = String(ready);
    const w = geometry.widthMm, h = geometry.heightMm;
    const hasPaths = geometry.paths.length > 0;
    output('width', hasPaths ? mm(w) : '—');
    output('height', hasPaths ? mm(h) : '—');
    output('size', hasPaths ? mm(w) + ' × ' + mm(h) : '—');
    const metres = (geometry.lengthMm) / 1000;
    output('electrical', hasPaths ? '≈ ' + (metres*7.2).toFixed(1)+' W · '+(metres*.6).toFixed(2)+' A · '+Math.round(metres*120)+' LEDs' : '—');
    output('length', hasPaths ? mm(geometry.lengthMm) : '—');
    output('runs', String(geometry.paths.length));
    output('strokes', String(geometry.paths.length));
    output('bends', String(geometry.bendCount));
    const spacerCount = board?.wall ? board.holes.length : 0;
    output('spacers',String(spacerCount));
    if (spec) spec.value = ready ? JSON.stringify(design) : '';
    const intent = needsShopReview(geometry) ? 'review' : 'production';
    if (requestIntent) requestIntent.value = intent;
    if (submit) submit.disabled = !ready;
    for (const action of ['export', 'export-svg', 'export-dxf']) buttonState(action, !ready);
    buttonState('undo', !past.length);
    buttonState('redo', !future.length);
    paint();
    root.dispatchEvent(new CustomEvent('neon:design', {bubbles: true,
      detail: {spec: ready ? {...design} : null, intent, finished, strokeCount:geometry.paths.length, bendCount:geometry.bendCount, spacerCount, lengthMm: geometry.lengthMm}}));
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
    if (node.dataset.neonField === 'widthMm') {
      const applyWidth = () => {
        if (!Number.isFinite(node.valueAsNumber)) return;
        const width = Math.min(Number(node.max),Math.max(Number(node.min),node.valueAsNumber));
        const correction=widthAllowance-2*engine.acrylicMargin(design.widthMm,design);
        let lettering=width-widthAllowance;
        for (let pass=0;pass<6;pass++) lettering=width-correction-2*engine.acrylicMargin(lettering,design);
        changed('widthMm',Math.min(maxWidth,Math.max(minWidth,lettering)),true);
      };
      if (node.type === 'range') node.addEventListener('input',applyWidth);
      node.addEventListener('change',applyWidth);
      node.addEventListener('blur',()=>{
        sequence = undefined;
        render();
      });
      continue;
    }
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
  root.querySelector('[data-neon-show-issues]').addEventListener('change',paint);
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
  root.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-neon-choice],[data-neon-action]');
    if (!btn || btn.disabled) return;
    if (btn.hasAttribute('data-neon-choice')) {
      if (btn.dataset.neonChoice === 'font' && pendingImport) {
        const imported = {...pendingImport, font: btn.dataset.value};
        pendingImport = null;
        fontDialog.close();
        openDesign(imported);
        return;
      }
      if (wallURL && btn.dataset.neonChoice === 'scene') {
        clearWall();
        render();
      }
      edit(btn.dataset.neonChoice, btn.dataset.value, false);
      if (btn.dataset.neonChoice === 'font' && fontDialog.open) fontDialog.close();
      return;
    }
    const action = btn.dataset.neonAction;
    if (action === 'view-sign') {
      canvas.focus({preventScroll: true});
      stage.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
    if (action === 'find-clearance-size') {
      const original = design;
      btn.disabled = true;
      output('status','Checking larger sizes…');
      await new Promise(resolve => setTimeout(resolve, 20));
      let match = null;
      try {
        for (let width = design.widthMm * 1.08; width <= maxWidth * 1.08; width *= 1.08) {
          const candidate = {...original, widthMm:Math.min(maxWidth,width)};
          const drawing = prepareDrawing(candidate);
          if (!drawing.valid || drawing.manufacturing.requiresReview) {
            if (candidate.widthMm === maxWidth) break;
            continue;
          }
          const board = engine.backboard(drawing,candidate);
          if (engine.finishedSize(drawing,board,candidate).withinLimit &&
              !(board?.requestedSpacers && board.holes.length < board.requestedSpacers)) {
            match = candidate.widthMm;
            break;
          }
          if (candidate.widthMm === maxWidth) break;
        }
        if (design !== original) return;
        if (match !== null) {
          changed('widthMm',match,false);
          output('status','Adjusted the size to pass the spacing check. LED routing and cover joins still need shop review.');
        } else {
          output('status','No larger size passed the check. Try another font or contact the shop.');
        }
      } finally {
        btn.disabled = false;
      }
    }
    if (action === 'detach') detachPreview();
    if (action === 'restore-preview') {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      restorePreview();
    }
    if (action === 'expand') {
      if (expandedProof.open) {
        expandedProof.close();
      } else {
        expandedProof.append(stage);
        expandedProof.showModal();
        btn.setAttribute('aria-expanded', 'true');
        btn.title = 'Close expanded preview';
        btn.setAttribute('aria-label', btn.title);
        btn.focus({preventScroll: true});
      }
    }
    if (action === 'browse-fonts') browseFonts();
    if (action === 'close-fonts') fontDialog.close();
    if (action === 'previous-font' || action === 'next-font') cycleFont(action === 'previous-font' ? -1 : 1);
    if (action === 'match-font' && compatibleFonts.length) changed('font', compatibleFonts[0].id, false);
    if (action === 'clear-wall') { clearWall(); render(); }
    if (action === 'undo' || action === 'redo') history(action);
    if (action === 'zoom-in' || action === 'zoom-out' || action === 'fit') {
      zoom = action === 'fit' ? (wallURL ? .75 : 1) : clampZoom(+(zoom * (action === 'zoom-in' ? 1.25 : .8)).toFixed(2));
      if (action === 'fit') pan = {x: 0, y: 0};
      camera();
    }
    if (action === 'export-svg' || action === 'export') {
      if (root.dataset.neonValid !== 'true') return;
      download(engine.svg(geometry, design), 'image/svg+xml', 'svg');
      output('status', 'Centerline drawing downloaded.');
    }
    if (action === 'export-dxf' && root.dataset.neonValid === 'true') {
      download(engine.dxf(geometry,design), 'application/dxf', 'dxf');
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
  function openDesign(imported) {
    past.push(design);
    if (past.length > 100) past.shift();
    future.length = 0;
    sequence = undefined;
    design = Object.fromEntries(Object.keys(defaults).map(key => [key, imported[key]]));
    clearWall();
    render();
    output('status', 'Design opened.');
  }
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw Error('This file is too large for a neon project.');
      let imported = JSON.parse(await file.text());
      if (!imported || ![1, 2].includes(imported.version) || (imported.version === 1 && Object.hasOwn(imported, 'cover'))) {
        throw Error('Choose a .neon.json design exported by this editor.');
      }
      if (imported.boardShape === undefined) imported.boardShape = 'rectangle';
      if (imported.lineColors === undefined) imported.lineColors = [];
      if (imported.boardGap === undefined) imported.boardGap = 30;
      if (imported.version === 1) imported = {...imported, version: 2, cover: WHITE_COVER};
      const disabledFont = !options.font.includes(imported.font) && engine.fonts.some(f => f.id === imported.font);
      if (disabledFont) {
        const error = projectError({...imported, font: fonts[0].id});
        if (error) throw Error(error);
        if (!compatibleStyles(imported.text).length) throw Error('The original style is unavailable and the offered styles do not contain all the letters in this design.');
        browseFonts(imported);
        return;
      }
      const error = projectError(imported);
      if (error) throw Error(error);
      openDesign(imported);
    } catch (err) {
      output('status', err instanceof SyntaxError ? 'Choose a valid .neon.json design file.' : err.message);
    }
  });
  // Keep the same point on the sign under the cursor or the moving finger midpoint.
  // The inverse SVG transform accounts for empty space around a letterboxed drawing.
  function signPoint(point) {
    const matrix = canvas.getScreenCTM();
    if (!frame || !matrix || !matrix.a || !matrix.d) return null;
    return new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
  }
  function cameraAt(value, anchor, screenPoint) {
    const under = signPoint(screenPoint);
    if (!anchor || !under) return;
    const next = clampZoom(value), ratio = zoom / next;
    const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2;
    pan.x = anchor.x - cx - (under.x - cx - pan.x) * ratio;
    pan.y = anchor.y - cy - (under.y - cy - pan.y) * ratio;
    zoom = next;
    camera();
  }
  const clientPoint = event => ({x: event.clientX, y: event.clientY});
  const pointers = new Map();
  let gesture, nativePinch;
  function pointerPose() {
    const [a, b] = pointers.values();
    if (!a) return null;
    if (!b) return {point: a, distance: 0};
    return {point: {x: (a.x+b.x)/2, y: (a.y+b.y)/2}, distance: Math.hypot(a.x-b.x, a.y-b.y)};
  }
  function startGesture() {
    const pose = pointerPose();
    gesture = pose && {anchor: signPoint(pose.point), distance: pose.distance, zoom};
  }
  canvas.addEventListener('pointerdown', ev => {
    if (!frame || ev.button !== 0 || (ev.pointerType !== 'touch' && !wallURL && zoom <= 1)) return;
    nativePinch = null;
    pointers.set(ev.pointerId, clientPoint(ev));
    canvas.setPointerCapture(ev.pointerId);
    startGesture();
  });
  canvas.addEventListener('pointermove', ev => {
    if (!gesture || !pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, clientPoint(ev));
    const pose = pointerPose();
    if (pointers.size > 1 && gesture.distance < 1) { startGesture(); return; }
    if (pointers.size === 1 && !wallURL && zoom <= 1) return;
    const scale = pointers.size > 1 ? pose.distance / gesture.distance : 1;
    cameraAt(gesture.zoom * scale, gesture.anchor, pose.point);
  });
  function endPointer(ev) {
    if (pointers.delete(ev.pointerId)) startGesture();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endPointer);
  canvas.addEventListener('wheel', ev => {
    if (!frame || !ev.deltaY) return;
    ev.preventDefault();
    if (nativePinch || pointers.size > 1) return;
    const unit = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
      ev.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1;
    const exponent = -ev.deltaY * unit * (ev.ctrlKey ? .01 : .0025);
    const point = clientPoint(ev);
    cameraAt(zoom * Math.exp(Math.max(-1, Math.min(1, exponent))), signPoint(point), point);
    if (pointers.size) startGesture();
  }, {passive: false});
  // Desktop Safari trackpads deliver GestureEvents. Direct touches already use
  // Pointer Events; consume Safari's duplicate events without applying them twice.
  function safariPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) return clientPoint(ev);
    return {x: rect.left + rect.width/2, y: rect.top + rect.height/2};
  }
  canvas.addEventListener('gesturestart', ev => {
    if (!frame) return;
    ev.preventDefault();
    if (!pointers.size) nativePinch = {anchor: signPoint(safariPoint(ev)), zoom};
  }, {passive: false});
  canvas.addEventListener('gesturechange', ev => {
    if (!frame) return;
    ev.preventDefault();
    if (nativePinch && Number.isFinite(ev.scale) && ev.scale > 0) {
      cameraAt(nativePinch.zoom * ev.scale, nativePinch.anchor, safariPoint(ev));
    }
  }, {passive: false});
  canvas.addEventListener('gestureend', ev => { ev.preventDefault(); nativePinch = null; }, {passive: false});
  window.addEventListener('blur', () => { pointers.clear(); gesture = nativePinch = null; });
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
  const expand = root.querySelector('[data-neon-action="expand"]');
  expandedProof.addEventListener('close', () => {
    root.querySelector('.neon-proof').prepend(stage);
    expand.setAttribute('aria-expanded', 'false');
    expand.title = 'Expand preview';
    expand.setAttribute('aria-label', expand.title);
    expand.focus({preventScroll: true});
  });
  initFontBrowser();
  render();
})();
