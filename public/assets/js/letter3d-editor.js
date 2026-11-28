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
  const zoomOutput = find('zoom-level'), reset = find('reset'), lights = find('lights');
  const threeContainer = find('three'), renderStatus = find('render-status');
  let threeRenderer = null, threeInit = null, threeTimer = 0, threeGeneration = 0, threeUnavailable = false;
  // The legacy fields remain as a compatibility mirror for older saved drafts.
  const lineSets = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-line]')] : [];
  const requiredLineFields = ['text','font','colour','side_colour','x','y','rotation'];
  const lineFields = [...requiredLineFields, 'front_finish', 'side_finish'];
  const lineControls = lineSets.map((fieldset, index) => ({fieldset, index,
    inputs:Object.fromEntries(lineFields.map(key => [key, fieldset.querySelector(`[data-letter-line-${key.replace(/_/g, '-')}]`)])),
    sliders:Object.fromEntries(['x','y','rotation'].map(key => [key, fieldset.querySelector(`[data-letter-line-slider="${key}"]`)])),
    remove:fieldset.querySelector('[data-letter-remove-line]'),
    sideAutoButton:fieldset.querySelector('[data-letter-line-side-auto]'), sideAuto:true
  }));
  const addLine = find('add-line');
  const hasLines = lineControls.length > 0 && lineControls.every(line => requiredLineFields.every(key => line.inputs[key]));
  let lineCount = 1;
  const fields = {product, text, font, colour, width, height, quantity};
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value]));
  const storageKey = 'adotind.letter3d.design.v1';
  let timer = 0, generation = 0, estimate = null, sending = false, requestKey = '';
  let scene = 'studio', zoom = 1, lightsOn = true;
  const clamp = (value, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : 0;
  // Three.js shades in linear light. Convert back to sRGB for the native color
  // input so the automatic swatch matches the existing visual appearance.
  function automaticSideColour(face) {
    if (!/^#[0-9a-f]{6}$/i.test(face)) face = '#e6e9ed';
    const shade = channel => {
      const s = parseInt(channel, 16) / 255;
      const linear = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      const shaded = linear * 0.55;
      const result = shaded <= 0.0031308 ? 12.92 * shaded : 1.055 * Math.pow(shaded, 1 / 2.4) - 0.055;
      return Math.round(result * 255).toString(16).padStart(2, '0');
    };
    return '#' + shade(face.slice(1,3)) + shade(face.slice(3,5)) + shade(face.slice(5,7));
  }
  function setLine(index, data) {
    const control = lineControls[index]; if (!control) return;
    const values = {text:'', font:'sans', colour:'#e6e9ed', side_colour:null, front_finish:'', side_finish:'', x:0, y:0, rotation:0, ...data};
    values.text = String(values.text).replace(/[\r\n]/g, '').slice(0,200);
    if (!['sans','serif','script'].includes(values.font)) values.font = 'sans';
    if (!/^#[0-9a-f]{6}$/i.test(values.colour)) values.colour = '#e6e9ed';
    control.sideAuto = !/^#[0-9a-f]{6}$/i.test(values.side_colour || '');
    values.side_colour = control.sideAuto ? automaticSideColour(values.colour) : values.side_colour;
    values.x=clamp(values.x,-200,200); values.y=clamp(values.y,-200,200); values.rotation=clamp(values.rotation,-180,180);
    for (const key of ['front_finish','side_finish']) if (!['matt','gloss'].includes(values[key])) values[key] = '';
    for (const key of lineFields) if (control.inputs[key]) control.inputs[key].value = String(values[key]);
    for (const key of ['x','y','rotation']) if (control.sliders[key]) control.sliders[key].value=String(values[key]);
  }
  function readLines() {
    if (!hasLines) return null;
    return lineControls.slice(0,lineCount).map(({inputs,sideAuto}) => ({text:inputs.text.value, font:inputs.font.value, colour:inputs.colour.value, side_colour:sideAuto ? null : inputs.side_colour.value,
      x:clamp(inputs.x.value,-200,200), y:clamp(inputs.y.value,-200,200), rotation:clamp(inputs.rotation.value,-180,180),
      ...(inputs.front_finish ? {front_finish:inputs.front_finish.value || null} : {}),
      ...(inputs.side_finish ? {side_finish:inputs.side_finish.value || null} : {})}));
  }
  function syncLines() {
    if (!hasLines) return;
    lineControls.forEach(({fieldset,remove,sideAutoButton,sideAuto},index) => {fieldset.hidden=index>=lineCount; if(remove) remove.disabled=lineCount===1; if(sideAutoButton) sideAutoButton.setAttribute('aria-pressed',String(sideAuto));});
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
        version:1, fields:Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value])), lines:hasLines ? readLines() : undefined, scene, zoom, lightsOn
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
      if (typeof stored.lightsOn === 'boolean') lightsOn = stored.lightsOn;
      if (typeof stored.zoom === 'number' && Number.isFinite(stored.zoom)) zoom = Math.max(.5, Math.min(3, stored.zoom));
      return true;
    } catch (_) { return false; }
  }
  const payload = () => ({csrf:root.dataset.csrf, product_id:product.value, text:text.value, font:font.value,
    colour:colour.value, width_mm:width.value, height_mm:height.value, quantity:quantity.value,
    ...(hasLines ? {lines:readLines()} : {})});
  function show2D(message) {
    if (viewport.dataset) viewport.dataset.render = 'flat';
    if (renderStatus) renderStatus.textContent = message || 'Illustrative 2D preview';
  }
  function schedule3D() {
    if (!threeContainer || !hasLines || root.hidden || threeUnavailable) return;
    const current = ++threeGeneration;
    // Never leave an older 3D design visible while the new geometry is being built.
    show2D('Updating 3D preview…');
    clearTimeout(threeTimer);
    threeTimer = setTimeout(async () => {
      try {
        if (!threeInit) {
          threeInit = import(root.dataset.rendererSrc || '/public/assets/js/letter3d-renderer.js').then(module => module.createLetter3DRenderer(threeContainer, {
            onUnavailable: () => { threeUnavailable = true; ++threeGeneration; show2D('3D preview unavailable on this device; showing 2D.'); }
          })).catch(error => { threeUnavailable = true; throw error; });
        }
        const renderer = await threeInit;
        if (current !== threeGeneration) return;
        threeRenderer = renderer;
        renderer.resize(); renderer.setZoom(zoom); renderer.setLights?.(lightsOn);
        const result = await renderer.update(readLines());
        if (current !== threeGeneration || (result && result.stale)) return;
        if (viewport.dataset) viewport.dataset.render = 'three';
        if (renderStatus) renderStatus.textContent = 'Illustrative 3D preview';
      } catch (_) {
        if (current !== threeGeneration) return;
        show2D(threeUnavailable ? '3D preview unavailable on this device; showing 2D.' : '3D preview unavailable for this text; showing 2D.');
      }
    }, 150);
  }
  function paintScene() {
    if (stage.dataset) stage.dataset.scene = scene;
    if (viewport.dataset) viewport.dataset.lights = lightsOn ? 'on' : 'off';
    if (lights) lights.checked = lightsOn;
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
    const fontStyles={sans:'Letter3DSans, Arial, sans-serif', serif:'Letter3DSerif, Georgia, serif', script:'Letter3DScript, cursive'};
    if (hasLines && typeof document.createElement==='function' && typeof preview.appendChild==='function') {
      preview.textContent = '';
      readLines().forEach(line=>{
        const item=document.createElement('span'); item.className='letter3d-preview-line';
        item.textContent=line.text || '\u00a0'; item.style.display='block'; item.style.whiteSpace='pre';
        item.style.width='max-content'; item.style.marginInline='auto';
        item.style.color=line.colour; item.style.fontFamily=fontStyles[line.font] || fontStyles.sans;
        const side=line.side_colour || automaticSideColour(line.colour);
        item.style.textShadow=`1px 1px ${side},2px 2px ${side},3px 3px ${side},4px 4px 7px #0009` + (lightsOn ? `,0 0 8px ${line.colour},0 0 18px ${line.colour}` : '');
        item.style.transform=`translate(${line.x}%, ${line.y}%) rotate(${line.rotation}deg)`;
        preview.appendChild(item);
      });
    } else {
      preview.textContent = text.value || 'Your sign'; preview.style.color = colour.value;
      preview.style.fontFamily = fontStyles[font.value] || 'sans-serif';
    }
    requestAnimationFrame(paintScale);
    schedule3D();
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
  function setZoom(value) { zoom = Math.max(.5, Math.min(3, value)); paintScale(); if (threeRenderer) threeRenderer.setZoom(zoom); saveDesign(); }
  lights?.addEventListener('change', () => {
    lightsOn = !!lights.checked; paintScene(); threeRenderer?.setLights?.(lightsOn); paint(); saveDesign();
  });
  for (const button of sceneButtons) button.addEventListener('click', () => {
    if (!['studio','brick','concrete'].includes(button.dataset.letterScene)) return;
    scene = button.dataset.letterScene; paintScene(); saveDesign();
  });
  for (const button of zoomButtons) button.addEventListener('click', () => {
    if (button.dataset.letterZoom === 'in') setZoom(zoom * 1.2);
    if (button.dataset.letterZoom === 'out') setZoom(zoom / 1.2);
    if (button.dataset.letterZoom === 'fit') { setZoom(1); threeRenderer?.resetOrbit?.(); }
  });
  // Turn only the dimensional preview. Track every touch pointer so a second
  // finger cancels orbit immediately and remains available for pinch zoom.
  const touchPointers = new Set();
  let orbitDrag = null;
  function stopOrbit(pointerId) {
    if (!orbitDrag || (pointerId != null && orbitDrag.id !== pointerId)) return;
    orbitDrag = null;
    viewport.classList?.remove('is-orbiting');
  }
  viewport.addEventListener?.('pointerdown', event => {
    if (event.pointerType === 'touch') touchPointers.add(event.pointerId);
    if (touchPointers.size > 1) { stopOrbit(); return; }
    if (viewport.dataset?.render !== 'three' || !threeRenderer || typeof threeRenderer.orbitBy !== 'function') return;
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    orbitDrag = {id:event.pointerId, x:event.clientX, y:event.clientY};
    viewport.classList?.add('is-orbiting');
    try { viewport.setPointerCapture?.(event.pointerId); } catch (_) { /* Capture can fail if a pointer was cancelled. */ }
  });
  viewport.addEventListener?.('pointermove', event => {
    if (!orbitDrag || orbitDrag.id !== event.pointerId || touchPointers.size > 1 || viewport.dataset?.render !== 'three') return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { stopOrbit(event.pointerId); return; }
    const dx = event.clientX - orbitDrag.x, dy = event.clientY - orbitDrag.y;
    orbitDrag.x = event.clientX; orbitDrag.y = event.clientY;
    if (dx || dy) threeRenderer?.orbitBy(dx, dy);
    if (event.cancelable) event.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener?.(type, event => {
    if (event.pointerType === 'touch' || touchPointers.has(event.pointerId)) touchPointers.delete(event.pointerId);
    stopOrbit(event.pointerId);
  });
  viewport.addEventListener?.('keydown', event => {
    if (viewport.dataset?.render !== 'three' || !threeRenderer || typeof threeRenderer.orbitBy !== 'function') return;
    const movement = {ArrowLeft:[-18,0], ArrowRight:[18,0], ArrowUp:[0,-18], ArrowDown:[0,18]}[event.key];
    if (!movement) return;
    event.preventDefault(); threeRenderer.orbitBy(...movement);
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
  viewport.addEventListener?.('touchend', event => { pinch = null; if (!event.touches.length) { touchPointers.clear(); stopOrbit(); } }, {passive:true});
  viewport.addEventListener?.('touchcancel', () => { pinch = null; touchPointers.clear(); stopOrbit(); }, {passive:true});
  reset?.addEventListener('click', () => {
    if (sending) return;
    for (const [key, element] of Object.entries(fields)) element.value = defaults[key];
    fromLegacy(); scene = 'studio'; zoom = 1; threeRenderer?.resetOrbit?.(); lightsOn = true; threeRenderer?.setLights?.(lightsOn); paintScene(); changed();
  });
  Object.values(fields).forEach(el => el.addEventListener('input', changed));
  if (hasLines) {
    lineControls.forEach((line,index) => {
      for (const key of lineFields) line.inputs[key]?.addEventListener('input', () => {
        if (key==='side_colour') line.sideAuto=false;
        if (key==='colour' && line.sideAuto) line.inputs.side_colour.value=automaticSideColour(line.inputs.colour.value);
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
      line.sideAutoButton?.addEventListener('click', () => {
        if (sending) return;
        line.sideAuto=true; line.inputs.side_colour.value=automaticSideColour(line.inputs.colour.value);
        syncLines(); changed();
      });
      line.remove?.addEventListener('click', () => {
        if (sending || lineCount<=1 || index>=lineCount) return;
        const values=readLines(); values.splice(index,1); lineCount=values.length;
        values.forEach((value,i)=>setLine(i,value)); syncLines(); changed();
      });
    });
    addLine?.addEventListener('click', () => {
      if (sending || lineCount>=lineControls.length) return;
      const last=readLines()[lineCount-1]; setLine(lineCount,{font:last.font,colour:last.colour,side_colour:last.side_colour,front_finish:last.front_finish,side_finish:last.side_finish}); lineCount++;
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
    const controls = [product,text,font,colour,width,height,quantity,name,email,phone,...(hasLines ? lineControls.flatMap(line=>[...Object.values(line.inputs), ...Object.values(line.sliders), line.remove, line.sideAutoButton]).filter(Boolean) : []),...(addLine?[addLine]:[])];
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
