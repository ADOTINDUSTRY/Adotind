(() => {
  'use strict';
  const root = document.querySelector('[data-letter3d]');
  if (!root) return;
  const find = name => root.querySelector(`[data-letter-${name}]`);
  const product = find('product'), text = find('text'), font = find('font'), colour = find('colour');
  const width = find('width'), height = find('height'), quantity = find('quantity');
  const preview = find('preview'), price = find('price'), tax = find('tax'), limits = find('limits');
  const send = find('send'), status = find('status');
  const stage = find('stage') || preview.parentElement;
  const viewport = preview.parentElement;
  const sceneButtons = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-scene]')] : [];
  const zoomButtons = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-zoom]')] : [];
  const zoomOutput = find('zoom-level'), reset = find('reset');
  // The legacy fields remain as a compatibility mirror for older saved drafts.
  const lineSets = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-line]')] : [];
  const lineFields = ['text','font','colour','x','y','rotation'];
  const lineControls = lineSets.map((fieldset, index) => ({fieldset, index,
    inputs:Object.fromEntries(lineFields.map(key => [key, fieldset.querySelector(`[data-letter-line-${key}]`)])),
    sliders:Object.fromEntries(['x','y','rotation'].map(key => [key, fieldset.querySelector(`[data-letter-line-slider="${key}"]`)])),
    remove:fieldset.querySelector('[data-letter-remove-line]')
  }));
  const addLine = find('add-line');
  const hasLines = lineControls.length > 0 && lineControls.every(line => lineFields.every(key => line.inputs[key]));
  let lineCount = 1;
  const fields = {product, text, font, colour, width, height, quantity};
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value]));
  const storageKey = 'adotind.letter3d.design.v1';
  let timer = 0, generation = 0, estimate = null, sending = false, requestKey = '';
  let scene = 'studio', zoom = 1;
  const clamp = (value, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : 0;
  function setLine(index, data) {
    const control = lineControls[index]; if (!control) return;
    const values = {text:'', font:'sans', colour:'#e6e9ed', x:0, y:0, rotation:0, ...data};
    values.text = String(values.text).replace(/[\r\n]/g, '').slice(0,200);
    if (!['sans','serif','script'].includes(values.font)) values.font = 'sans';
    if (!/^#[0-9a-f]{6}$/i.test(values.colour)) values.colour = '#e6e9ed';
    values.x=clamp(values.x,-200,200); values.y=clamp(values.y,-200,200); values.rotation=clamp(values.rotation,-180,180);
    for (const key of lineFields) control.inputs[key].value = String(values[key]);
    for (const key of ['x','y','rotation']) if (control.sliders[key]) control.sliders[key].value=String(values[key]);
  }
  function readLines() {
    if (!hasLines) return null;
    return lineControls.slice(0,lineCount).map(({inputs}) => ({text:inputs.text.value, font:inputs.font.value, colour:inputs.colour.value,
      x:clamp(inputs.x.value,-200,200), y:clamp(inputs.y.value,-200,200), rotation:clamp(inputs.rotation.value,-180,180)}));
  }
  function syncLines() {
    if (!hasLines) return;
    lineControls.forEach(({fieldset,remove},index) => {fieldset.hidden=index>=lineCount; if(remove) remove.disabled=lineCount===1;});
    if (addLine) addLine.disabled=lineCount>=lineControls.length;
    const lines=readLines(); text.value=lines.map(line=>line.text).join('\n'); font.value=lines[0].font; colour.value=lines[0].colour;
  }
  function fromLegacy() {
    if (!hasLines) return;
    const lines=text.value.replace(/\r\n?/g,'\n').split('\n').slice(0,lineControls.length);
    lineCount=Math.max(1,lines.length);
    lines.forEach((value,index)=>setLine(index,{text:value,font:font.value,colour:colour.value}));
    syncLines();
  }

  // Customer contact details, estimates and request tokens deliberately do not persist.
  function saveDesign() {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(storageKey, JSON.stringify({
        version:1, fields:Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value])), lines:hasLines ? readLines() : undefined, scene, zoom
      }));
    } catch (_) { /* The designer still works when storage is unavailable. */ }
  }
  function restoreDesign() {
    try {
      if (typeof sessionStorage === 'undefined') return false;
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!stored || stored.version !== 1 || !stored.fields || typeof stored.fields !== 'object') return false;
      for (const [key, element] of Object.entries(fields)) {
        if (typeof stored.fields[key] === 'string' && stored.fields[key].length <= 1000) element.value = stored.fields[key];
      }
      if (hasLines && Array.isArray(stored.lines) && stored.lines.length > 0 && stored.lines.length <= lineControls.length) {
        lineCount=stored.lines.length; stored.lines.forEach((line,index)=>setLine(index, line && typeof line==='object' ? line : {})); syncLines();
      } else fromLegacy();
      if (['studio','brick','concrete'].includes(stored.scene)) scene = stored.scene;
      if (typeof stored.zoom === 'number' && Number.isFinite(stored.zoom)) zoom = Math.max(.5, Math.min(3, stored.zoom));
      return true;
    } catch (_) { return false; }
  }
  const payload = () => ({csrf:root.dataset.csrf, product_id:product.value, text:text.value, font:font.value,
    colour:colour.value, width_mm:width.value, height_mm:height.value, quantity:quantity.value,
    ...(hasLines ? {lines:readLines()} : {})});
  function paintScene() {
    if (stage.dataset) stage.dataset.scene = scene;
    for (const button of sceneButtons) button.setAttribute('aria-pressed', String(button.dataset.letterScene === scene));
  }
  function paintScale() {
    const availableWidth = (viewport.clientWidth || 0) - 50;
    const availableHeight = (viewport.clientHeight || 0) - 50;
    // Include rotated and translated lines in the fit, then recenter their union.
    // Measuring with the previous zoom removed prevents scaling feedback loops.
    preview.style.transform = 'none';
    let fullWidth = preview.scrollWidth, fullHeight = preview.scrollHeight, dx=0, dy=0;
    if (hasLines && preview.children && preview.children.length && typeof preview.getBoundingClientRect==='function') {
      const base=preview.getBoundingClientRect();
      const boxes=[...preview.children].map(child=>child.getBoundingClientRect()).filter(box=>box.width || box.height);
      if (boxes.length) {
        const left=Math.min(...boxes.map(box=>box.left)), right=Math.max(...boxes.map(box=>box.right));
        const top=Math.min(...boxes.map(box=>box.top)), bottom=Math.max(...boxes.map(box=>box.bottom));
        fullWidth=Math.max(1,right-left); fullHeight=Math.max(1,bottom-top);
        dx=(base.left+base.right-left-right)/2; dy=(base.top+base.bottom-top-bottom)/2;
      }
    }
    let fit = availableWidth > 0 && fullWidth > 0 ? Math.min(1, availableWidth / fullWidth) : 1;
    if (availableHeight > 0 && fullHeight > 0) fit = Math.min(fit, availableHeight / fullHeight);
    const scale=fit*zoom; preview.style.transform = `translate(${dx*scale}px, ${dy*scale}px) scale(${scale})`;
    if (zoomOutput) zoomOutput.textContent = `${Math.round(zoom * 100)}%`;
  }
  function paint() {
    const fontStyles={sans:'Arial, sans-serif', serif:'Georgia, serif', script:'cursive'};
    if (hasLines && typeof document.createElement==='function' && typeof preview.appendChild==='function') {
      preview.textContent = '';
      readLines().forEach(line=>{
        const item=document.createElement('span'); item.className='letter3d-preview-line';
        item.textContent=line.text || '\u00a0'; item.style.display='block'; item.style.whiteSpace='pre';
        item.style.width='max-content'; item.style.marginInline='auto';
        item.style.color=line.colour; item.style.fontFamily=fontStyles[line.font] || fontStyles.sans;
        item.style.transform=`translate(${line.x}%, ${line.y}%) rotate(${line.rotation}deg)`;
        preview.appendChild(item);
      });
    } else {
      preview.textContent = text.value || 'Your sign'; preview.style.color = colour.value;
      preview.style.fontFamily = fontStyles[font.value] || 'sans-serif';
    }
    requestAnimationFrame(paintScale);
    const selected = product.selectedOptions[0];
    limits.textContent = product.value && selected ? `Allowed size: ${selected.dataset.minWidth}–${selected.dataset.maxWidth} mm wide × ${selected.dataset.minHeight}–${selected.dataset.maxHeight} mm high. Up to ${selected.dataset.maxChars} characters and ${selected.dataset.maxQuantity} signs.` : '';
  }
  function changed() {
    generation++; clearTimeout(timer); estimate = null; requestKey = '';
    send.disabled = true; price.textContent = 'Enter an option and size'; tax.textContent = ''; status.textContent = '';
    paint(); saveDesign();
    if (!product.value || !text.value.trim() || !width.value || !height.value || !quantity.value) return;
    const current = generation;
    timer = setTimeout(async () => {
      price.textContent = 'Calculating…';
      try {
        const response = await fetch('/online-quote/letters3d/estimate', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload())});
        const data = await response.json();
        if (current !== generation) return;
        if (!response.ok || !data.estimate || typeof data.request_key !== 'string') throw new Error(data.error || 'Could not calculate this design.');
        estimate = data.estimate;
        requestKey = data.request_key;
        price.textContent = `€${Number(estimate.total).toFixed(2)}`;
        tax.textContent = `Includes ${estimate.vat_percent}% VAT. Subject to artwork and shop review.`;
        send.disabled = sending;
      } catch (error) {
        if (current !== generation) return;
        price.textContent = error.message || 'Estimate unavailable';
      }
    }, 350);
  }
  function setZoom(value) { zoom = Math.max(.5, Math.min(3, value)); paintScale(); saveDesign(); }
  for (const button of sceneButtons) button.addEventListener('click', () => {
    if (!['studio','brick','concrete'].includes(button.dataset.letterScene)) return;
    scene = button.dataset.letterScene; paintScene(); saveDesign();
  });
  for (const button of zoomButtons) button.addEventListener('click', () => {
    if (button.dataset.letterZoom === 'in') setZoom(zoom * 1.2);
    if (button.dataset.letterZoom === 'out') setZoom(zoom / 1.2);
    if (button.dataset.letterZoom === 'fit') setZoom(1);
  });
  // Zoom affects only the preview and never changes the quoted dimensions.
  viewport.addEventListener?.('wheel', event => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, {passive:false});
  let pinch = null;
  viewport.addEventListener?.('touchstart', event => {
    if (event.touches.length !== 2) { pinch = null; return; }
    pinch = {distance:Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY), zoom};
  }, {passive:true});
  viewport.addEventListener?.('touchmove', event => {
    if (!pinch || event.touches.length !== 2 || !pinch.distance) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const distance = Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY);
    setZoom(pinch.zoom * distance / pinch.distance);
  }, {passive:false});
  viewport.addEventListener?.('touchend', () => { pinch = null; }, {passive:true});
  viewport.addEventListener?.('touchcancel', () => { pinch = null; }, {passive:true});
  reset?.addEventListener('click', () => {
    if (sending) return;
    for (const [key, element] of Object.entries(fields)) element.value = defaults[key];
    fromLegacy(); scene = 'studio'; zoom = 1; paintScene(); changed();
  });
  Object.values(fields).forEach(el => el.addEventListener('input', changed));
  if (hasLines) {
    lineControls.forEach((line,index) => {
      for (const key of lineFields) line.inputs[key].addEventListener('input', () => {
        if (['x','y','rotation'].includes(key)) {
          const max=key==='rotation'?180:200, raw=line.inputs[key].value, value=clamp(raw,-max,max);
          // Keep a typed out-of-range value in sync with the actual preview and quote.
          if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw)!==value) line.inputs[key].value=String(value);
          if (line.sliders[key]) line.sliders[key].value=String(value);
        }
        syncLines(); changed();
      });
      for (const key of ['x','y','rotation']) line.inputs[key].addEventListener('blur', () => {
        const max=key==='rotation'?180:200, value=clamp(line.inputs[key].value,-max,max);
        line.inputs[key].value=String(value); if (line.sliders[key]) line.sliders[key].value=String(value);
      });
      for (const key of ['x','y','rotation']) line.sliders[key]?.addEventListener('input', () => {
        line.inputs[key].value=line.sliders[key].value; syncLines(); changed();
      });
      line.remove?.addEventListener('click', () => {
        if (sending || lineCount<=1 || index>=lineCount) return;
        const values=readLines(); values.splice(index,1); lineCount=values.length;
        values.forEach((value,i)=>setLine(i,value)); syncLines(); changed();
      });
    });
    addLine?.addEventListener('click', () => {
      if (sending || lineCount>=lineControls.length) return;
      const last=readLines()[lineCount-1]; setLine(lineCount,{font:last.font,colour:last.colour}); lineCount++;
      syncLines(); changed(); lineControls[lineCount-1].inputs.text.focus?.();
    });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(paint).observe(viewport);
  send.addEventListener('click', async () => {
    if (!estimate || sending) return;
    const name = find('name'), email = find('email'), phone = find('phone');
    if (!name.value.trim() || !email.value.trim() || !email.checkValidity() || !phone.value.trim()) {
      status.textContent = 'Enter your name, a valid email and phone number.'; return;
    }
    const current = generation;
    const controls = [product,text,font,colour,width,height,quantity,name,email,phone,...(hasLines ? lineControls.flatMap(line=>[...Object.values(line.inputs), ...Object.values(line.sliders), line.remove]).filter(Boolean) : []),...(addLine?[addLine]:[])];
    sending = true; send.disabled = true; controls.forEach(el => { el.disabled = true; }); status.textContent = 'Sending…';
    try {
      const body = {...payload(), customer_name:name.value, email:email.value, phone:phone.value,
        expected_cents:Math.round(Number(estimate.total)*100), quote_token:estimate.quote_token, request_key:requestKey};
      const response = await fetch('/online-quote/letters3d/request', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data = await response.json();
      if (current !== generation) {
        status.textContent = response.ok && data.ok ? 'Your previous design request was received.' : 'The previous design was not sent. Review the current design and try again.';
        return;
      }
      if (response.status === 409 && data.estimate) {
        estimate = data.estimate; price.textContent = `€${Number(estimate.total).toFixed(2)}`;
        tax.textContent = `Includes ${estimate.vat_percent}% VAT. Subject to artwork and shop review.`;
        status.textContent = data.error; return;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send your request.');
      status.textContent = data.message; estimate = null; requestKey = '';
    } catch (error) { if (current === generation) status.textContent = error.message || 'Could not send your request.'; }
    finally { sending = false; controls.forEach(el => { el.disabled = false; }); syncLines(); send.disabled = !estimate; }
  });
  const restored = restoreDesign();
  if (!restored) fromLegacy();
  paintScene();
  if (restored) changed(); else paint();
})();
