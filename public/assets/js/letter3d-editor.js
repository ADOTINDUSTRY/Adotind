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
  const fields = {product, text, font, colour, width, height, quantity};
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value]));
  const storageKey = 'adotind.letter3d.design.v1';
  let timer = 0, generation = 0, estimate = null, sending = false, requestKey = '';
  let scene = 'studio', zoom = 1;

  // Customer contact details, estimates and request tokens deliberately do not persist.
  function saveDesign() {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(storageKey, JSON.stringify({
        version:1, fields:Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value])), scene, zoom
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
      if (['studio','brick','concrete'].includes(stored.scene)) scene = stored.scene;
      if (typeof stored.zoom === 'number' && Number.isFinite(stored.zoom)) zoom = Math.max(.5, Math.min(3, stored.zoom));
      return true;
    } catch (_) { return false; }
  }
  const payload = () => ({csrf:root.dataset.csrf, product_id:product.value, text:text.value, font:font.value,
    colour:colour.value, width_mm:width.value, height_mm:height.value, quantity:quantity.value});
  function paintScene() {
    if (stage.dataset) stage.dataset.scene = scene;
    for (const button of sceneButtons) button.setAttribute('aria-pressed', String(button.dataset.letterScene === scene));
  }
  function paintScale() {
    const availableWidth = (viewport.clientWidth || 0) - 50;
    const availableHeight = (viewport.clientHeight || 0) - 50;
    const fullWidth = preview.scrollWidth;
    const fullHeight = preview.scrollHeight;
    let fit = availableWidth > 0 && fullWidth > 0 ? Math.min(1, availableWidth / fullWidth) : 1;
    if (availableHeight > 0 && fullHeight > 0) fit = Math.min(fit, availableHeight / fullHeight);
    preview.style.transform = `scale(${fit * zoom})`;
    if (zoomOutput) zoomOutput.textContent = `${Math.round(zoom * 100)}%`;
  }
  function paint() {
    preview.textContent = text.value || 'Your sign';
    preview.style.color = colour.value;
    preview.style.fontFamily = ({sans:'Arial, sans-serif', serif:'Georgia, serif', script:'cursive'})[font.value] || 'sans-serif';
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
    scene = 'studio'; zoom = 1; paintScene(); changed();
  });
  Object.values(fields).forEach(el => el.addEventListener('input', changed));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(paint).observe(viewport);
  send.addEventListener('click', async () => {
    if (!estimate || sending) return;
    const name = find('name'), email = find('email'), phone = find('phone');
    if (!name.value.trim() || !email.value.trim() || !email.checkValidity() || !phone.value.trim()) {
      status.textContent = 'Enter your name, a valid email and phone number.'; return;
    }
    const current = generation;
    const controls = [product,text,font,colour,width,height,quantity,name,email,phone];
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
    finally { sending = false; controls.forEach(el => { el.disabled = false; }); send.disabled = !estimate; }
  });
  const restored = restoreDesign();
  paintScene();
  if (restored) changed(); else paint();
})();
