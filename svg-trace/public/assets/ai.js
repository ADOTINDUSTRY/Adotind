(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('trace-ai-dialog');
  if (!dialog) return;
  const ns = 'http://www.w3.org/2000/svg';
  const vector = (paths, box, outlines = false) => {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', box.join(' '));
    for (const item of paths) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', item.d);
      path.setAttribute('fill', outlines ? 'none' : item.fill);
      path.setAttribute('fill-rule', 'evenodd');
      if (outlines) {
        path.setAttribute('stroke', '#2451ad');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
      }
      svg.append(path);
    }
    return svg;
  };
  let options, proposal, flight;
  const apply = $('trace-ai-apply'), generate = $('trace-ai-generate'), status = $('trace-ai-status');
  const prompt = $('trace-ai-instruction');
  const clearProposal = () => {
    proposal = null;
    apply.disabled = true;
    $('trace-ai-after').replaceChildren();
  };
  dialog.addEventListener('close', () => { flight?.abort(); flight = null; options = null; });
  prompt.addEventListener('input', () => { clearProposal(); status.textContent = ''; });
  generate.addEventListener('click', async () => {
    if (!options || generate.disabled) return;
    const current = options;
    const controller = new AbortController();
    flight = controller;
    generate.disabled = prompt.disabled = true;
    clearProposal();
    status.textContent = 'Drawing a preview…';
    try {
      const response = await fetch('/online-quote/svg-trace/ai', {
        method: 'POST', signal: controller.signal, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify({ ...current.payload, instruction: prompt.value.trim() }),
      });
      const data = await response.json();
      if (current !== options || controller.signal.aborted) return;
      if (!response.ok || !data.paths?.length) throw Error(data.error || 'The AI preview could not be generated.');
      if (current.validate && !current.validate(data.paths)) throw Error('The proposal changes the contour endpoints or direction. Try another instruction.');
      proposal = data.paths;
      $('trace-ai-after').replaceChildren(vector(proposal, current.box, current.refine));
      apply.disabled = false;
      status.textContent = 'Compare the curves. Apply this version or change your instruction and try again.';
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      if (flight === controller) { generate.disabled = prompt.disabled = false; flight = null; }
    }
  });
  apply.addEventListener('click', () => {
    if (!proposal || !options) return;
    const use = options.accept, paths = proposal;
    dialog.close();
    use(paths);
  });
  function review(opts) {
    options = opts;
    clearProposal();
    generate.disabled = prompt.disabled = false;
    $('trace-ai-title').textContent = opts.refine ? 'Refine this contour' : 'AI Trace';
    $('trace-ai-label').textContent = opts.refine ? 'How should the curve change?' : 'What should AI draw from your image?';
    $('trace-ai-before-label').textContent = opts.refine ? 'Current contour' : 'Uploaded image';
    prompt.value = opts.refine ? 'Smooth the uneven curves and remove unnecessary nodes. Keep the corners and letter shape.' : 'Trace the lettering and logo. Preserve the curves, corners and holes.';
    $('trace-ai-before').replaceChildren(opts.before);
    status.textContent = '';
    dialog.showModal();
    generate.focus();
    if (!opts.refine) generate.click();
  }
  async function traceImage(file, accept) {
    const img = new Image(), url = URL.createObjectURL(file);
    try {
      img.src = url;
      await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w,h) > 4096) throw Error('Resize the longest edge of your logo to 4,096 pixels or less.');
      const scale = Math.min(1, 960 / Math.max(w, h));
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
      const before = new Image(); before.src = jpeg; before.alt = 'Image supplied for tracing';
      const box = [0, 0, canvas.width, canvas.height];
      review({ before, box, payload: { mode: 'trace', width: canvas.width, height: canvas.height, image: jpeg.split(',')[1] },
        accept: paths => {
          const svg = vector(paths, box);
          svg.setAttribute('width', w); svg.setAttribute('height', h);
          accept(new XMLSerializer().serializeToString(svg), w, h);
        } });
    } finally { URL.revokeObjectURL(url); }
  }
  window.svgTraceAI = { traceImage, review, vector };
})();
