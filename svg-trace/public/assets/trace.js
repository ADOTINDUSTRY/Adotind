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
  const presetSel = $('preset'), view = $('view'), canvas = $('canvas');
  const imgO = $('img-original'), imgV = $('img-vector'), stats = $('stats'), dl = $('download');
  const allowed = ['image/png', 'image/jpeg', 'image/bmp', 'image/x-ms-bmp', 'image/webp'];

  let pendingFile = null;   // chosen but not uploaded yet
  let sourceFileId = null;  // uploaded original, reused for re-traces
  let busy = false;
  let pollTimer = null;

  const setStatus = (msg, kind = '') => {
    statusEl.textContent = msg;
    statusEl.className = 'ws-status' + (kind ? ' ' + kind : '');
  };
  const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const refreshGo = () => { go.disabled = busy || (!pendingFile && !sourceFileId); };

  // ---- settings ----
  const fields = () => ws.querySelectorAll('input[type="range"], input[type="radio"]');
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
    ws.querySelectorAll('input[type="range"]').forEach((el) => {
      const o = $('o-' + el.name);
      if (o) o.textContent = el.value;
    });
    const isColor = ws.querySelector('input[name="colormode"]:checked')?.value !== 'bw';
    ws.querySelectorAll('[data-only="color"]').forEach((el) => { el.hidden = !isColor; });
  };
  presetSel.addEventListener('change', () => applyPreset(presetSel.value));
  fields().forEach((el) => el.addEventListener('input', syncOutputs));
  applyPreset(presetSel.value);

  // ---- file selection ----
  const choose = (file) => {
    if (!file) return;
    if (!allowed.includes(file.type)) { setStatus('Unsupported file type. Please choose a PNG, JPG, BMP or WEBP image.', 'err'); return; }
    if (maxBytes && file.size > maxBytes) { setStatus('This file is too large. The maximum is ' + +(maxBytes / 1048576).toFixed(1) + ' MB.', 'err'); return; }
    pendingFile = file;
    sourceFileId = null;
    $('drop-label').textContent = file.name;
    imgO.src = URL.createObjectURL(file);
    imgV.removeAttribute('src');
    stats.textContent = '';
    dl.hidden = true;
    view.hidden = false;
    setStatus('Ready. Choose a style and press Convert.');
    refreshGo();
  };
  fileInput.addEventListener('change', () => choose(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => choose(e.dataTransfer.files[0]));

  // ---- view tabs ----
  ws.querySelectorAll('.ws-tabs button').forEach((b) => b.addEventListener('click', () => {
    ws.querySelectorAll('.ws-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    canvas.className = 'ws-canvas ' + b.dataset.show;
  }));

  // ---- convert ----
  go.addEventListener('click', async () => {
    if (busy) return;
    const fd = new FormData();
    fd.append('preset', presetSel.value);
    fields().forEach((el) => {
      if (el.type === 'radio' && !el.checked) return;
      fd.append(el.name, el.value);
    });
    if (pendingFile) fd.append('image', pendingFile);
    else if (sourceFileId) fd.append('source_file_id', String(sourceFileId));
    else return;

    busy = true; refreshGo();
    setStatus(pendingFile ? 'Uploading…' : 'Starting…');
    try {
      const res = await fetch(base + '/api/jobs', {
        method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.job) throw new Error(data.error || 'Upload failed (' + res.status + ').');
      pendingFile = null;
      sourceFileId = data.job.input.file_id;
      imgO.src = data.job.input.view_url;
      track(data.job);
    } catch (err) {
      busy = false; refreshGo();
      setStatus(err.message, 'err');
    }
  });

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
          busy = false; refreshGo(); startedAt.t = 0;
          setStatus(err.message, 'err');
        }
      }, elapsed < 30000 ? 1200 : 3000);
      return;
    }
    busy = false; startedAt.t = 0; refreshGo();
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
      imgV.src = job.output.view_url;
      dl.href = job.output.download_url;
      dl.hidden = false;
      try {
        const text = await (await fetch(job.output.view_url, { credentials: 'same-origin' })).text();
        const paths = (text.match(/<path\b/g) || []).length;
        const fills = new Set((text.match(/fill="(#[0-9a-fA-F]{3,8}|[a-z]+)"/g) || []));
        stats.innerHTML = '';
        [['Shapes', paths.toLocaleString()], ['Colours', fills.size], ['SVG size', fmtBytes(job.output.size_bytes)],
         ['Original', job.input.width + '×' + job.input.height + ' px']].forEach(([k, v]) => {
          const d = document.createElement('div');
          const b = document.createElement('strong'); b.textContent = String(v);
          const s = document.createElement('span'); s.textContent = k;
          d.append(b, s); stats.append(d);
        });
      } catch (_) { /* stats are optional */ }
    }
  };
})();
