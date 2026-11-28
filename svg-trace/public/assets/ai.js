(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('trace-ai-dialog');
  if (!dialog) return;
  const ns = 'http://www.w3.org/2000/svg';
  const vector = (paths, box) => {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', box.join(' '));
    for (const item of paths) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', item.d);
      path.setAttribute('fill', item.fill);
      path.setAttribute('fill-rule', 'evenodd');
      svg.append(path);
    }
    return svg;
  };
  let options, proposal, flight;
  const apply = $('trace-ai-apply'), generate = $('trace-ai-generate'), status = $('trace-ai-status');
  const prompt = $('trace-ai-instruction');
  const checkpoint = () => $('ws').dispatchEvent(new Event('st:ai-draft'));
  const clearProposal = () => {
    proposal = null;
    apply.disabled = true;
    $('trace-ai-after').replaceChildren();
  };
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    flight?.abort(); flight = null; options = null; checkpoint();
  });
  prompt.addEventListener('input', () => { clearProposal(); status.textContent = ''; checkpoint(); });
  generate.addEventListener('click', async () => {
    if (!options || generate.disabled) return;
    const current = options;
    const controller = new AbortController();
    flight = controller;
    generate.disabled = prompt.disabled = true;
    clearProposal();
    status.textContent = 'Drawing a preview…';
    checkpoint();
    try {
      const response = await fetch('/online-quote/svg-trace/ai', {
        method: 'POST', signal: controller.signal, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify({ ...current.payload, instruction: prompt.value.trim() }),
      });
      const data = await response.json();
      if (current !== options || controller.signal.aborted) return;
      if (!response.ok || !data.paths?.length) throw Error(data.error || 'The AI preview could not be generated.');
      proposal = data.paths;
      $('trace-ai-after').replaceChildren(vector(proposal, current.box));
      apply.disabled = false;
      status.textContent = 'Compare the curves. Apply this version or change your instruction and try again.';
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      if (flight === controller) { generate.disabled = prompt.disabled = false; flight = null; checkpoint(); }
    }
  });
  apply.addEventListener('click', () => {
    if (!proposal || !options) return;
    const use = options.accept, paths = proposal;
    dialog.close();
    use(paths);
  });
  function review(opts, saved) {
    options = opts;
    clearProposal();
    generate.disabled = prompt.disabled = false;
    $('trace-ai-title').textContent = 'Redraw image with AI';
    prompt.value = 'Trace the lettering and logo. Preserve the curves, corners and holes.';
    $('trace-ai-before').replaceChildren(opts.before);
    status.textContent = '';
    dialog.showModal();
    generate.focus();
    if (saved) {
      prompt.value = saved.instruction ?? prompt.value;
      if (Array.isArray(saved.paths) && saved.paths.length) {
        proposal = saved.paths;
        $('trace-ai-after').replaceChildren(vector(proposal, opts.box));
        apply.disabled = false;
      }
      status.textContent = saved.interrupted ? 'The request was interrupted. Generate a preview to try again.' : saved.message || '';
      checkpoint();
    } else generate.click();
  }
  async function referenceImage(src, maxSide) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (Math.max(w,h) > 4096) throw Error('Resize the longest edge of your logo to 4,096 pixels or less.');
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0, light = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      visible++;
      if (.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2] >= 128) light++;
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = light * 2 > visible ? '#161616' : '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', .9);
    return { w, h, jpeg, width:canvas.width, height:canvas.height };
  }
  async function traceImage(file, accept, saved = null) {
    const url = URL.createObjectURL(file);
    try {
      const {w,h,jpeg,width,height} = await referenceImage(url,960);
      const before = new Image(); before.src = jpeg; before.alt = 'Image supplied for tracing';
      const box = [0, 0, width, height];
      review({ before, box, payload: { mode: 'trace', width, height, image: jpeg.split(',')[1] },
        accept: paths => {
          const svg = vector(paths, box);
          svg.setAttribute('width', w); svg.setAttribute('height', h);
          accept(new XMLSerializer().serializeToString(svg), w, h);
        } }, saved);
    } finally { URL.revokeObjectURL(url); }
  }
  function snapshot() {
    return dialog.open && options ? {instruction:prompt.value, paths:proposal, interrupted:!!flight, message:status.textContent} : null;
  }
  window.svgTraceAI = { traceImage, snapshot, thumbnail: async src => (await referenceImage(src, 384)).jpeg.split(',')[1] };
})();
