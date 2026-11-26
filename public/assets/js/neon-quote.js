(() => {
  'use strict';

  const settings = document.getElementById('neon-retail-rates');
  let shop = {};
  if (settings) {
    try {
      const value = JSON.parse(settings.textContent);
      if (value && typeof value === 'object' && !Array.isArray(value)) shop = value;
    } catch { /* The designer can still preview and export a sign offline. */ }
  }
  window.NeonShop = shop;

  const root = document.querySelector('[data-neon-editor]');
  const form = root?.querySelector('[data-neon-quote-form]');
  if (!form) return;

  const price = root.querySelector('[data-neon-price]');
  const submit = form.querySelector('[data-neon-submit]');
  const response = form.querySelector('[data-neon-response]');
  const requestField = form.elements.namedItem('request_id');
  const requestLabel = root.querySelector('[data-neon-request-label]');
  const money = new Intl.NumberFormat('en-CY', {style: 'currency', currency: 'EUR'});
  const attempts = new Map();
  let active = false;
  let valid = false;
  let settingsChanged = false;
  let displayedFor = '';

  function message(text, kind, signature = '') {
    response.textContent = text;
    response.dataset.result = kind;
    displayedFor = signature;
  }

  function signatureOf(data) {
    return JSON.stringify(['design', 'intent', 'delivery', 'delivery_address', 'customer_name', 'email', 'message'].map(key => String(data.get(key) || '').trim()));
  }

  function clearOldMessage() {
    if (!active && !settingsChanged && displayedFor && signatureOf(new FormData(form)) !== displayedFor) message('', '');
  }

  function refreshButton() {
    submit.disabled = active || !valid || settingsChanged;
    if (active) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
  }

  const delivery = form.querySelector('[data-neon-delivery]');
  const address = form.querySelector('[name="delivery_address"]');
  const previewPrice = root.querySelector('[data-neon-preview-price]');
  let designDetails;
  function updateEstimate() {
    const {spec, lengthMm, finished, strokeCount, bendCount, spacerCount} = designDetails;
    valid = Boolean(spec && finished?.withinLimit && Number.isFinite(lengthMm) && lengthMm > 0);
    requestLabel.textContent = 'Request a shop quote';
    submit.textContent = 'Send design for quote';
    const deliveryOption = delivery.options[1];
    deliveryOption.hidden = deliveryOption.disabled = !valid;
    if (!valid) delivery.value = 'pickup';
    address.required = delivery.value === 'delivery';
    address.closest('label').hidden = !address.required;
    if (valid) deliveryOption.textContent = ({120:'Standard delivery',240:'Large-sign delivery',300:'Oversize delivery'})[finished.tier];
    const rates = shop.rates;
    let label = valid ? 'Shop quote on request' : 'Complete your lettering to request a quote';
    let estimate = '';
    if (valid && rates) {
      const acrylicRate = finished.areaMm2 ? rates['acrylic'+finished.tier] : 0;
      const deliveryFee = delivery.value==='delivery' ? rates['delivery'+finished.tier] : 0;
      if ([rates.base,rates.perMetre,rates[spec.mount],acrylicRate,deliveryFee].every(value=>Number.isSafeInteger(value) && value>=0)) {
        const cents = rates.base + Math.round(Math.round(lengthMm)*rates.perMetre/1000)
          + Math.round(finished.areaMm2*acrylicRate/1_000_000) + rates[spec.mount] + deliveryFee
          + strokeCount*(rates.perStroke ?? 0) + bendCount*(rates.perBend ?? 0) + spacerCount*(rates.perSpacer ?? 0);
        label = estimate = 'Estimated price '+money.format(cents/100);
      }
    }
    if (price.textContent !== label) price.textContent = label;
    previewPrice.hidden = !estimate;
    if (previewPrice.textContent !== estimate) previewPrice.textContent = estimate;
    refreshButton();
    clearOldMessage();
  }
  root.addEventListener('neon:design', event => {
    designDetails = event.detail;
    updateEstimate();
  });
  delivery.addEventListener('change',()=>{if (designDetails) updateEstimate();});

  form.addEventListener('input', clearOldMessage);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (active || !valid || settingsChanged || !form.reportValidity()) return;
    const data = new FormData(form);
    const signature = signatureOf(data);
    const review = data.get('intent') === 'review';
    if (!Number.isSafeInteger(shop.revision)) {
      message('Shop settings are unavailable. Download your design and try again later.', 'error', signature);
      return;
    }

    let attempt = attempts.get(signature);
    if (!attempt) {
      const id = attempts.size === 0 ? requestField.value : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      attempt = {id, reference: ''};
      attempts.set(signature, attempt);
    }
    if (attempt.reference) {
      message((review ? 'Shop review already requested.' : 'Cut-ready design already sent.') + ' Your reference is ' + attempt.reference + '.', 'success', signature);
      return;
    }
    requestField.value = attempt.id;
    data.set('request_id', attempt.id);
    data.set('revision', String(shop.revision));
    data.set('edition', shop.edition);
    active = true;
    refreshButton();
    message('Sending your design…', 'pending', signature);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const reply = await fetch(form.action, {method: 'POST', body: data, headers: {Accept: 'application/json'}, credentials: 'same-origin', signal: controller.signal});
      const result = await reply.json();
      if (!reply.ok || typeof result.reference !== 'string') {
        if (reply.status === 409) settingsChanged = true;
        message(typeof result.error === 'string' ? result.error : 'The shop could not confirm receipt. Please try again.', 'error', signature);
        return;
      }
      attempt.reference = result.reference;
      const current = signatureOf(new FormData(form));
      const edited = current !== signature ? ' Your latest edits are still in the editor.' : '';
      message((review ? 'Shop review requested.' : 'Cut-ready design sent.') + ' Your reference is ' + attempt.reference + '.' + edited, 'success', current);
    } catch {
      message('Receipt could not be confirmed. Try again with the same design to check your request.', 'error', signature);
    } finally {
      window.clearTimeout(timeout);
      active = false;
      refreshButton();
    }
  });
  refreshButton();
})();
