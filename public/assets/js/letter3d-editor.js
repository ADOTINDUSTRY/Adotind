(() => {
  'use strict';
  const root = document.querySelector('[data-letter3d]');
  if (!root) return;
  const find = name => root.querySelector(`[data-letter-${name}]`);
  const product = find('product'), text = find('text'), font = find('font'), colour = find('colour');
  const width = find('width'), height = find('height'), quantity = find('quantity');
  const preview = find('preview'), price = find('price'), tax = find('tax'), limits = find('limits');
  const send = find('send'), status = find('status');
  let timer = 0, generation = 0, estimate = null, sending = false, requestKey = '';
  const payload = () => ({csrf:root.dataset.csrf, product_id:product.value, text:text.value, font:font.value,
    colour:colour.value, width_mm:width.value, height_mm:height.value, quantity:quantity.value});
  function paint() {
    preview.textContent = text.value || 'Your sign';
    preview.style.color = colour.value;
    preview.style.fontFamily = ({sans:'Arial, sans-serif', serif:'Georgia, serif', script:'cursive'})[font.value] || 'sans-serif';
    requestAnimationFrame(() => {
      const available = preview.parentElement.clientWidth - 50;
      const fullWidth = preview.scrollWidth;
      if (available > 0 && fullWidth > 0) preview.style.transform = `scale(${Math.min(1, available / fullWidth)})`;
    });
    const selected = product.selectedOptions[0];
    limits.textContent = product.value && selected ? `Allowed size: ${selected.dataset.minWidth}–${selected.dataset.maxWidth} mm wide × ${selected.dataset.minHeight}–${selected.dataset.maxHeight} mm high. Up to ${selected.dataset.maxChars} characters and ${selected.dataset.maxQuantity} signs.` : '';
  }
  function changed() {
    generation++; clearTimeout(timer); estimate = null; requestKey = '';
    send.disabled = true; price.textContent = 'Enter an option and size'; tax.textContent = ''; status.textContent = '';
    paint();
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
  [product,text,font,colour,width,height,quantity].forEach(el => el.addEventListener('input', changed));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(paint).observe(preview.parentElement);
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
  paint();
})();
