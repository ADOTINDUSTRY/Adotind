(() => {
  'use strict';
  const ws = document.getElementById('ws');
  if (!ws) return;
  const base = '/svg-trace';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const presets = JSON.parse(ws.dataset.presets || '{}');
  const maxBytes = parseInt(ws.dataset.maxBytes || '0', 10);
  const $ = (id) => document.getElementById(id);
  const fileInput = $('file'), drop = $('drop'), go = $('go'), statusEl = $('status');
  const presetSel = $('preset'), view = $('view'), canvas = $('canvas'), auto = $('auto'), wire = $('wire');
  const imgO = $('img-original'), imgV = $('img-vector'), stats = $('stats'), dl = $('download');
  const figV = imgV.closest('figure');
  const exts = JSON.parse(ws.dataset.exts || '[]');
  const previewable = JSON.parse(ws.dataset.preview || '[]');
  const progress = $('progress');
  const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
  const fmtSize = (n) => n >= 1073741824 ? +(n / 1073741824).toFixed(1) + ' GB' : +(n / 1048576).toFixed(1) + ' MB';

  let pendingFile = null;   // chosen but not uploaded yet
  let sourceFileId = null;  // uploaded original, reused for re-traces
  let busy = false;
  let again = false;        // settings changed while a trace was running
  let pollTimer = null, autoTimer = null;
  let svgUrl = '', wireUrl = '';

  const setStatus = (msg, kind = '') => {
    statusEl.textContent = msg;
    statusEl.className = 'ws-status' + (kind ? ' ' + kind : '');
  };
  const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const refreshGo = () => { go.disabled = busy || (!pendingFile && !sourceFileId); };

  // ---- settings ----
  const fields = () => ws.querySelectorAll('input[name][type="range"], input[name][type="radio"]');
  const value = (name) => ws.querySelector(`input[name="${name}"]:checked`)?.value;
  const applyPreset = (name) => {
    const p = presets[name];
    if (!p) return;
    fields().forEach((el) => {
      if (!(el.name in p)) return;
      if (el.type === 'radio') el.checked = String(p[el.name]) === el.value;
      else el.value = p[el.name];
    });
    syncOutputs();
  };
  const syncOutputs = () => {
    ws.querySelectorAll('input[name][type="range"]').forEach((el) => {
      const o = $('o-' + el.name);
      if (o) o.textContent = el.name === 'colors' && el.value === '0' ? 'Auto' : el.value;
    });
    const show = { color: value('colormode') !== 'bw', bw: value('colormode') === 'bw', shapes: value('output') !== 'centerline' };
    ws.querySelectorAll('[data-only]').forEach((el) => { el.hidden = !show[el.dataset.only]; });
  };
  const scheduleAuto = () => {
    if (!auto.checked || !(sourceFileId || pendingFile)) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(convert, 650);
  };
  presetSel.addEventListener('change', () => { applyPreset(presetSel.value); scheduleAuto(); });
  fields().forEach((el) => el.addEventListener('input', () => { syncOutputs(); scheduleAuto(); }));
  applyPreset(presetSel.value);

  // ---- file selection ----
  const choose = (file) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (exts.length && !exts.includes(ext)) { setStatus('This file type is not supported. You can upload: ' + ws.dataset.labels + '.', 'err'); return; }
    if (maxBytes && file.size > maxBytes) { setStatus('This file is too large (' + fmtSize(file.size) + '). The maximum is ' + fmtSize(maxBytes) + '.', 'err'); return; }
    pendingFile = file;
    sourceFileId = null;
    ws.dispatchEvent(new CustomEvent('st:reset'));
    $('drop-label').textContent = file.name;
    if (previewable.includes(ext)) imgO.src = URL.createObjectURL(file);
    else imgO.removeAttribute('src'); // shown after the server converts it
    imgV.removeAttribute('src');
    svgUrl = '';
    stats.textContent = '';
    dl.hidden = true;
    view.hidden = false;
    zoom.fit();
    setStatus(auto.checked ? 'Uploading…' : 'Ready. Choose a style and press Convert.');
    refreshGo();
    if (auto.checked) convert();
  };
  fileInput.addEventListener('change', () => choose(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => choose(e.dataTransfer.files[0]));

  // ---- view modes ----
  ws.querySelectorAll('.ws-tabs button').forEach((b) => b.addEventListener('click', () => {
    ws.querySelectorAll('.ws-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    canvas.className = 'ws-canvas ' + b.dataset.show;
    zoom.layout();
  }));
  $('swipe').addEventListener('input', (e) => canvas.style.setProperty('--swipe', e.target.value + '%'));
  canvas.style.setProperty('--swipe', '50%');

  // ---- zoom / pan (shared by both panes so they stay aligned) ----
  const zoom = (() => {
    let z = 1, ox = 0, oy = 0;
    const vps = [...canvas.querySelectorAll('.vp')];
    const natural = () => {
      const w = imgO.naturalWidth || imgV.naturalWidth || 1, h = imgO.naturalHeight || imgV.naturalHeight || 1;
      return [w, h];
    };
    const fitScale = (vp) => { const [w, h] = natural(); return Math.min(vp.clientWidth / w, vp.clientHeight / h) || 1; };
    const box = (vp) => {
      const [w, h] = natural(), s = fitScale(vp) * z;
      const W = w * s, H = h * s;
      return { W, H, left: (vp.clientWidth - W) / 2 + ox, top: (vp.clientHeight - H) / 2 + oy };
    };
    const layout = () => {
      vps.forEach((vp) => {
        const img = vp.querySelector('img'), b = box(vp);
        Object.assign(img.style, { width: b.W + 'px', height: b.H + 'px', left: b.left + 'px', top: b.top + 'px' });
      });
      const vp = vps.find((v) => v.clientWidth) || vps[0];
      $('zoom-level').textContent = z === 1 && !ox && !oy ? 'Fit' : Math.round(fitScale(vp) * z * 100) + '%';
    };
    const at = (vp, k, cx, cy) => {
      const b = box(vp), nz = Math.min(64, Math.max(0.2, z * k));
      k = nz / z;
      const W2 = b.W * k, H2 = b.H * k;
      const left = cx - (cx - b.left) * k, top = cy - (cy - b.top) * k;
      z = nz; ox = left - (vp.clientWidth - W2) / 2; oy = top - (vp.clientHeight - H2) / 2;
      layout();
    };
    vps.forEach((vp) => {
      vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = vp.getBoundingClientRect();
        at(vp, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      let drag = null;
      vp.addEventListener('pointerdown', (e) => { drag = { x: e.clientX - ox, y: e.clientY - oy }; vp.setPointerCapture(e.pointerId); vp.classList.add('grab'); });
      vp.addEventListener('pointermove', (e) => { if (!drag) return; ox = e.clientX - drag.x; oy = e.clientY - drag.y; layout(); });
      const end = () => { drag = null; vp.classList.remove('grab'); };
      vp.addEventListener('pointerup', end);
      vp.addEventListener('pointercancel', end);
      vp.addEventListener('dblclick', (e) => { const r = vp.getBoundingClientRect(); at(vp, 2, e.clientX - r.left, e.clientY - r.top); });
    });
    ws.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const vp = vps.find((v) => v.clientWidth) || vps[0];
      const c = [vp.clientWidth / 2, vp.clientHeight / 2];
      const a = b.dataset.zoom;
      if (a === 'in') at(vp, 1.5, ...c);
      else if (a === 'out') at(vp, 1 / 1.5, ...c);
      else if (a === 'fit') { z = 1; ox = oy = 0; layout(); }
      else { const k = 1 / (fitScale(vp) * z); at(vp, k, ...c); }
    }));
    [imgO, imgV].forEach((img) => img.addEventListener('load', layout));
    window.addEventListener('resize', layout);
    return { layout, fit: () => { z = 1; ox = oy = 0; layout(); } };
  })();

  // ---- "lines only" view: every shape drawn as a thin outline ----
  const showVector = () => {
    if (!svgUrl) return;
    imgV.src = wire.checked && wireUrl ? wireUrl : svgUrl;
  };
  const makeWire = (text) => {
    try {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (doc.querySelector('parsererror')) return '';
      doc.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line').forEach((el) => {
        const fill = el.getAttribute('fill');
        const col = fill && fill !== 'none' ? fill : (el.getAttribute('stroke') || '#000');
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', col);
        el.setAttribute('stroke-width', '1');
        el.setAttribute('vector-effect', 'non-scaling-stroke');
      });
      return URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
    } catch (_) { return ''; }
  };
  wire.addEventListener('change', showVector);

  // ---- edited in the point editor ----
  let editUrl = '';
  ws.addEventListener('st:edited', (e) => {
    if (editUrl) URL.revokeObjectURL(editUrl);
    if (wireUrl) URL.revokeObjectURL(wireUrl);
    editUrl = URL.createObjectURL(new Blob([e.detail.text], { type: 'image/svg+xml' }));
    wireUrl = makeWire(e.detail.text);
    svgUrl = editUrl;
    dl.href = editUrl;
    dl.setAttribute('download', 'traced-edited.svg');
    showVector();
    setStatus('Your edits are applied. Download SVG now saves the edited version.', 'ok');
  });

  // ---- convert ----
  const convert = async () => {
    clearTimeout(autoTimer);
    if (busy) { again = true; return; }
    const fd = new FormData();
    fd.append('preset', presetSel.value);
    fields().forEach((el) => {
      if (el.type === 'radio' && !el.checked) return;
      fd.append(el.name, el.value);
    });
    if (pendingFile) fd.append('image', pendingFile);
    else if (sourceFileId) fd.append('source_file_id', String(sourceFileId));
    else return;

    busy = true; again = false; refreshGo();
    figV.classList.add('updating');
    setStatus(pendingFile ? 'Uploading…' : 'Starting…');
    try {
      const res = await send(fd, !!pendingFile);
      const data = res.data;
      if (!res.ok || !data.job) throw new Error(data.error || (res.status === 413 ? 'This file is too large for the server.' : 'Upload failed (' + res.status + ').'));
      if (pendingFile) imgO.src = data.job.input.view_url;
      pendingFile = null;
      sourceFileId = data.job.input.file_id;
      track(data.job);
    } catch (err) {
      finish();
      setStatus(err.message, 'err');
    }
  };
  go.addEventListener('click', convert);

  // XMLHttpRequest instead of fetch so large uploads can show progress.
  const send = (fd, withProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/api/jobs');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrf);
    const bar = progress.firstElementChild;
    if (withProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pc = Math.round(e.loaded / e.total * 100);
        progress.hidden = false;
        bar.style.width = pc + '%';
        setStatus(pc < 100 ? `Uploading… ${pc}% of ${fmtSize(e.total)}` : 'Opening your file…');
      };
    }
    xhr.onload = () => {
      progress.hidden = true;
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (_) { /* not JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => { progress.hidden = true; reject(new Error('The upload failed. Check your connection and try again.')); };
    xhr.send(fd);
  });

  const finish = () => {
    busy = false; startedAt.t = 0; refreshGo();
    figV.classList.remove('updating');
    if (again) { again = false; convert(); }
  };

  const startedAt = { t: 0 };
  const track = (job) => {
    clearTimeout(pollTimer);
    if (!startedAt.t) startedAt.t = Date.now();
    render(job);
    if (job.status === 'queued' || job.status === 'processing') {
      const elapsed = Date.now() - startedAt.t;
      pollTimer = setTimeout(async () => {
        try {
          const res = await fetch(base + '/api/jobs/' + job.id, { credentials: 'same-origin' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Status check failed.');
          track(data.job);
        } catch (err) {
          finish();
          setStatus(err.message, 'err');
        }
      }, elapsed < 5000 ? 500 : elapsed < 30000 ? 1200 : 3000);
      return;
    }
    finish();
  };

  const render = async (job) => {
    const secs = startedAt.t ? Math.round((Date.now() - startedAt.t) / 1000) : 0;
    if (job.status === 'queued') {
      setStatus(job.queue_position > 0 ? `Waiting in queue (${job.queue_position} ahead)… ${secs}s` : `Starting the tracer… ${secs}s`);
    } else if (job.status === 'processing') {
      setStatus(`Tracing your image… ${secs}s`);
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      setStatus(job.error || 'The conversion failed.', 'err');
    } else if (job.status === 'completed' && job.output) {
      setStatus('Done in ' + ((job.duration_ms || 0) / 1000).toFixed(1) + ' s.', 'ok');
      dl.href = job.output.download_url;
      dl.setAttribute('download', '');
      dl.hidden = false;
      svgUrl = job.output.view_url;
      if (wireUrl) { URL.revokeObjectURL(wireUrl); wireUrl = ''; }
      try {
        const text = await (await fetch(job.output.view_url, { credentials: 'same-origin' })).text();
        wireUrl = makeWire(text);
        ws.dispatchEvent(new CustomEvent('st:result', { detail: { text, original: imgO.currentSrc || imgO.src } }));
        const paths = (text.match(/<path\b/g) || []).length;
        const cols = new Set((text.match(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g) || []).map((m) => m.split('"')[1].toLowerCase()));
        const lines = /fill="none"/.test(text) && !/fill="#/.test(text);
        stats.innerHTML = '';
        [[lines ? 'Lines' : 'Shapes', paths.toLocaleString()], ['Colours', cols.size], ['SVG size', fmtBytes(job.output.size_bytes)],
         ['Original', job.input.width + '×' + job.input.height + ' px']].forEach(([k, v]) => {
          const d = document.createElement('div');
          const b = document.createElement('strong'); b.textContent = String(v);
          const s = document.createElement('span'); s.textContent = k;
          d.append(b, s); stats.append(d);
        });
      } catch (_) { /* stats and line view are optional */ }
      showVector();
    }
  };
})();
