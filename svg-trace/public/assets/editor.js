// Point editor for traced SVGs: move points and handles, add/remove points,
// switch segments between straight and curved, then download the result.
(() => {
  'use strict';
  const ws = document.getElementById('ws');
  const ed = document.getElementById('ed');
  const openBtn = document.getElementById('edit');
  if (!ws || !ed || !openBtn) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const svg = $('ed-svg'), info = $('ed-info'), showOrig = $('ed-orig');
  const mk = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  // ---------- geometry ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const len = (a) => Math.hypot(a[0], a[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const unit = (a) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0]; };

  const arcCenter = (p0, s, p1) => {
    let rx = Math.abs(s.rx), ry = Math.abs(s.ry);
    if (!rx || !ry || (p0[0] === p1[0] && p0[1] === p1[1])) return null;
    const phi = (s.rot || 0) * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
    const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
    const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
    if (s.large === s.sweep) co = -co;
    const cx1 = co * rx * y1 / ry, cy1 = -co * ry * x1 / rx;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!s.sweep && dt > 0) dt -= 2 * Math.PI;
    else if (s.sweep && dt < 0) dt += 2 * Math.PI;
    return {
      cx: cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2, cy: sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2,
      rx, ry, cos, sin, t1, dt,
    };
  };
  const ePt = (c, th) => { const x = c.rx * Math.cos(th), y = c.ry * Math.sin(th); return [c.cos * x - c.sin * y + c.cx, c.sin * x + c.cos * y + c.cy]; };
  const eDer = (c, th) => { const x = -c.rx * Math.sin(th), y = c.ry * Math.cos(th); return [c.cos * x - c.sin * y, c.sin * x + c.cos * y]; };

  const pointAt = (p0, s, p1, t) => {
    if (s.t === 'C') {
      const m = 1 - t;
      return [0, 1].map((i) => m * m * m * p0[i] + 3 * m * m * t * s.c1[i] + 3 * m * t * t * s.c2[i] + t * t * t * p1[i]);
    }
    if (s.t === 'A') { const c = arcCenter(p0, s, p1); if (c) return ePt(c, c.t1 + c.dt * t); }
    return lerp(p0, p1, t);
  };
  // Unit direction of travel at t.
  const tangentAt = (p0, s, p1, t) => {
    if (s.t === 'C') {
      const m = 1 - t;
      let d = [0, 1].map((i) => 3 * (m * m * (s.c1[i] - p0[i]) + 2 * m * t * (s.c2[i] - s.c1[i]) + t * t * (p1[i] - s.c2[i])));
      if (len(d) < 1e-9) d = t < 0.5 ? sub(s.c2, p0) : sub(p1, s.c1);
      return unit(d);
    }
    if (s.t === 'A') { const c = arcCenter(p0, s, p1); if (c) return unit(mul(eDer(c, c.t1 + c.dt * t), Math.sign(c.dt))); }
    return unit(sub(p1, p0));
  };
  const split = (p0, s, p1, t) => {
    if (s.t === 'C') {
      const a = lerp(p0, s.c1, t), b = lerp(s.c1, s.c2, t), c = lerp(s.c2, p1, t), d = lerp(a, b, t), e = lerp(b, c, t);
      return [{ t: 'C', c1: a, c2: d }, lerp(d, e, t), { t: 'C', c1: e, c2: c }];
    }
    if (s.t === 'A') {
      const c = arcCenter(p0, s, p1);
      if (c) {
        const part = (k) => ({ ...s, rx: c.rx, ry: c.ry, large: Math.abs(c.dt * k) > Math.PI ? 1 : 0 });
        return [part(t), ePt(c, c.t1 + c.dt * t), part(1 - t)];
      }
    }
    return [{ t: 'L' }, lerp(p0, p1, t), { t: 'L' }];
  };
  // Straight line or arc as cubic curves (arcs are split every 90° to stay exact).
  const toCubics = (p0, s, p1) => {
    if (s.t === 'C') return { segs: [s], mids: [] };
    const c = s.t === 'A' ? arcCenter(p0, s, p1) : null;
    if (!c) return { segs: [{ t: 'C', c1: lerp(p0, p1, 1 / 3), c2: lerp(p0, p1, 2 / 3) }], mids: [] };
    const n = Math.max(1, Math.ceil(Math.abs(c.dt) / (Math.PI / 2) - 1e-9));
    const segs = [], mids = [];
    for (let j = 0; j < n; j++) {
      const ta = c.t1 + c.dt * j / n, tb = c.t1 + c.dt * (j + 1) / n, al = 4 / 3 * Math.tan((tb - ta) / 4);
      const a = j ? ePt(c, ta) : p0, b = j === n - 1 ? p1 : ePt(c, tb);
      segs.push({ t: 'C', c1: add(a, mul(eDer(c, ta), al)), c2: sub(b, mul(eDer(c, tb), al)) });
      if (j < n - 1) mids.push(b);
    }
    return { segs, mids };
  };
  const distSeg = (q, a, b) => {
    const d = sub(b, a), l2 = d[0] * d[0] + d[1] * d[1];
    const u = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / l2)) : 0;
    return { d: len(sub(q, lerp(a, b, u))), u };
  };

  // ---------- path data ----------
  // A sub-path is { closed, nodes: [[x,y]...], segs: [...] }; segs[k] runs from
  // nodes[k] to nodes[k+1] (wrapping to nodes[0] when closed).
  const parseD = (d) => {
    const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const subs = [];
    let i = 0, cmd = '', cur = [0, 0], start = [0, 0], sp = null, lastC2 = null, lastQ = null;
    const isCmd = (t) => /^[a-zA-Z]$/.test(t);
    const num = () => parseFloat(toks[i++]);
    const flag = () => {
      const t = toks[i];
      if (t.length > 1) { toks[i] = t.slice(1); return t[0] === '1' ? 1 : 0; }
      i++;
      return parseFloat(t) ? 1 : 0;
    };
    const begin = (p) => { sp = { closed: false, nodes: [p], segs: [] }; subs.push(sp); start = p; };
    const push = (s, p) => { if (!sp) begin(cur); sp.segs.push(s); sp.nodes.push(p); cur = p; };
    while (i < toks.length) {
      if (isCmd(toks[i])) cmd = toks[i++];
      else if (!cmd) break;
      const C = cmd.toUpperCase(), rel = cmd !== C;
      const pt = () => { const x = num(), y = num(); return rel ? [cur[0] + x, cur[1] + y] : [x, y]; };
      if (C === 'Z') {
        if (sp) {
          const n = sp.nodes.length, last = sp.nodes[n - 1];
          if (n > 1 && Math.abs(last[0] - start[0]) < 1e-6 && Math.abs(last[1] - start[1]) < 1e-6) sp.nodes.pop();
          else sp.segs.push({ t: 'L' });
          sp.closed = sp.nodes.length > 1;
          if (!sp.closed) sp.segs = [];
        }
        cur = start; sp = null; lastC2 = lastQ = null;
        continue;
      }
      if (i >= toks.length || isCmd(toks[i])) { i++; continue; } // malformed: skip
      let nextC2 = null, nextQ = null;
      if (C === 'M') { begin(pt()); cur = start; cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') push({ t: 'L' }, pt());
      else if (C === 'H') { const x = num(); push({ t: 'L' }, [rel ? cur[0] + x : x, cur[1]]); }
      else if (C === 'V') { const y = num(); push({ t: 'L' }, [cur[0], rel ? cur[1] + y : y]); }
      else if (C === 'C') { const c1 = pt(), c2 = pt(), p = pt(); push({ t: 'C', c1, c2 }, p); nextC2 = c2; }
      else if (C === 'S') {
        const c1 = lastC2 ? sub(mul(cur, 2), lastC2) : cur, c2 = pt(), p = pt();
        push({ t: 'C', c1, c2 }, p); nextC2 = c2;
      } else if (C === 'Q' || C === 'T') {
        const q = C === 'Q' ? pt() : (lastQ ? sub(mul(cur, 2), lastQ) : cur), p0 = cur, p = pt();
        push({ t: 'C', c1: lerp(p0, q, 2 / 3), c2: lerp(p, q, 2 / 3) }, p); nextQ = q;
      } else if (C === 'A') {
        const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(), p = pt();
        push({ t: 'A', rx, ry, rot, large, sweep }, p);
      } else { i++; continue; }
      lastC2 = nextC2; lastQ = nextQ;
    }
    return subs.filter((s) => s.nodes.length > 1 || s.segs.length);
  };
  const shift = (subs, dx, dy) => {
    const m = (p) => [p[0] + dx, p[1] + dy];
    subs.forEach((s) => {
      s.nodes = s.nodes.map(m);
      s.segs.forEach((g) => { if (g.t === 'C') { g.c1 = m(g.c1); g.c2 = m(g.c2); } });
    });
  };
  const f = (n) => String(Math.round(n * 1000) / 1000);
  const fp = (p) => f(p[0]) + ' ' + f(p[1]);
  const toD = (subs) => subs.map((s) => {
    const n = s.nodes.length;
    let d = 'M' + fp(s.nodes[0]);
    s.segs.forEach((g, k) => {
      const end = s.nodes[(k + 1) % n];
      if (g.t === 'C') d += 'C' + fp(g.c1) + ' ' + fp(g.c2) + ' ' + fp(end);
      else if (g.t === 'A') d += 'A' + f(g.rx) + ' ' + f(g.ry) + ' ' + f(g.rot || 0) + ' ' + g.large + ' ' + g.sweep + ' ' + fp(end);
      else d += 'L' + fp(end);
    });
    return d + (s.closed ? 'Z' : '');
  }).join('');
  const segEnds = (sp, k) => [sp.nodes[k], sp.nodes[(k + 1) % sp.nodes.length]];
  // Segments before and after node i (-1 when the node is an open end).
  const around = (sp, i) => {
    const n = sp.nodes.length;
    return [sp.closed ? (i - 1 + n) % n : i - 1, sp.closed || i < n - 1 ? i : -1];
  };

  // ---------- state ----------
  let srcText = '', origUrl = '', doc = null, vb = [0, 0, 1, 1], view = [0, 0, 1, 1];
  let paths = [];          // { el, view, subs, editable, removed, dirty }
  let sel = -1;            // selected path index
  let node = null;         // { si, ni }
  let seg = null;          // { si, k }
  let boxMode = false, boxPoints = [], boxNotice = '';
  function clearBoxSelection() {
    boxMode = false;
    boxPoints = [];
    boxNotice = '';
  }
  // These values are also used by history and the tab's saved editing session.
  const captureBoxSelection = () => ({boxMode, points:boxPoints.map(p => ({...p}))});
  function restoreBoxSelection(state) {
    clearBoxSelection();
    if (!state?.boxMode) return;
    boxMode = true;
    const seen = new Set();
    for (const p of Array.isArray(state.points) ? state.points : []) {
      if (!p || ![p.pi,p.si,p.ni].every(Number.isInteger)) continue;
      const path = paths[p.pi], key = p.pi + ':' + p.si + ':' + p.ni;
      if (!seen.has(key) && path?.editable && !path.removed && path.subs[p.si]?.nodes[p.ni]) {
        boxPoints.push({pi:p.pi,si:p.si,ni:p.ni});
        seen.add(key);
      }
    }
  }
  let undo = [], redo = [];
  let changed = false;
  const gImg = mk('g'), gPaths = mk('g'), gOver = mk('g', { class: 'ed-over' });
  const reviewOverlay = mk('g', { class:'ed-review-overlay' });
  svg.append(gImg, gPaths, gOver, reviewOverlay);
  let pointReview;

  const pxUnit = () => { const m = svg.getScreenCTM(); return m && m.a ? 1 / m.a : 1; };
  const toSvg = (e) => {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const setView = () => { svg.setAttribute('viewBox', view.join(' ')); draw(); };
  const fit = () => {
    const pad = Math.max(vb[2], vb[3]) * 0.03;
    view = [vb[0] - pad, vb[1] - pad, vb[2] + 2 * pad, vb[3] + 2 * pad];
    setView();
  };
  const snapshot = (indexes) => ({
    items: indexes.map(pi => ({pi, subs:structuredClone(paths[pi].subs), removed:paths[pi].removed, dirty:paths[pi].dirty})),
    sel, node: node && {...node}, seg: seg && {...seg}, box:captureBoxSelection(),
  });
  const remember = (pi, reviewEdit = false) => {
    if (!reviewEdit) pointReview?.invalidate();
    undo.push(snapshot(Array.isArray(pi) ? pi : [pi]));
    redo = [];
    if (undo.length > 300) undo.shift();
    changed = true;
  };
  const refresh = (pi) => {
    const P = paths[pi];
    P.dirty = true;
    if (!P.subs.length) P.removed = true;
    P.view.style.display = P.removed ? 'none' : '';
    if (!P.removed) P.view.setAttribute('d', toD(P.subs));
  };

  // ---------- drawing ----------
  function drawBoxPoints(unit) {
    const r = 2.8 * unit, anchorPaths = [];
    paths.forEach(path => {
      if (!path.editable || path.removed) return;
      path.subs.forEach(sp => sp.nodes.forEach(([x,y]) =>
        anchorPaths.push('M' + (x-r) + ' ' + (y-r) + 'h' + (2*r) + 'v' + (2*r) + 'h' + (-2*r) + 'z')));
    });
    gOver.append(mk('path',{d:anchorPaths.join(''),class:'ed-box-anchors'}));
    for (const {pi,si,ni} of boxPoints) {
      const [x,y] = paths[pi].subs[si].nodes[ni];
      gOver.append(mk('rect',{x:x-1.4*r,y:y-1.4*r,width:2.8*r,height:2.8*r,class:'ed-box-selected'}));
    }
  }
  const draw = () => {
    gOver.replaceChildren();
    let total = 0;
    paths.forEach((P) => { if (P.editable && !P.removed) P.subs.forEach((s) => { total += s.nodes.length; }); });
    const P = paths[sel];
    const active = !boxMode && P?.editable && !P.removed;
    $('ed-box-select').setAttribute('aria-pressed', String(boxMode));
    svg.classList.toggle('box-selecting',boxMode);
    $('ed-undo').disabled = !undo.length; $('ed-redo').disabled = !redo.length;
    $('ed-add').disabled = !active || !seg;
    $('ed-delete').disabled = boxMode ? !boxPoints.length : !active || !node || P.subs[node.si].nodes.length <= 2;
    $('ed-delete').textContent = boxMode ? 'Delete points' : 'Delete point';
    $('ed-delete-shape').disabled = $('ed-fit-shape').disabled = !active;
    $('ed-straight').disabled = $('ed-curve').disabled = !active || !(node || seg);
    $('ed-smooth').disabled = !active || !node || around(P.subs[node.si], node.ni).includes(-1);
    pointReview?.renderCanvas();
    if (boxMode) {
      drawBoxPoints(pxUnit());
      const count = boxPoints.length;
      info.textContent = (boxNotice ? boxNotice + ' ' : '') + (count
        ? count + (count === 1 ? ' point selected.' : ' points selected.') + ' Shift-drag to add points.'
        : 'Drag a box around the points you want to select.');
      return;
    }
    if (!P || P.removed) {
      info.textContent = `${total.toLocaleString()} points. Click a shape to edit it.`;
      return;
    }
    const u = pxUnit();
    gOver.append(mk('path', { d: toD(P.subs), class: 'ed-hl', 'fill-rule': 'evenodd' }));
    let mine = 0;
    P.subs.forEach((s) => { mine += s.nodes.length; });
    if (seg && P.subs[seg.si]) {
      const sp = P.subs[seg.si], [a, b] = segEnds(sp, seg.k);
      gOver.append(mk('path', { d: toD([{ closed: false, nodes: [a, b], segs: [sp.segs[seg.k]] }]), class: 'ed-seg' }));
    }
    // Handles of the selected point, or of the selected segment.
    const handles = [];
    if (node && P.subs[node.si]) {
      const sp = P.subs[node.si], [inK, outK] = around(sp, node.ni), p = sp.nodes[node.ni];
      if (inK >= 0 && sp.segs[inK].t === 'C') handles.push([node.si, inK, 'c2', p]);
      if (outK >= 0 && sp.segs[outK].t === 'C') handles.push([node.si, outK, 'c1', p]);
    }
    if (seg && P.subs[seg.si] && P.subs[seg.si].segs[seg.k].t === 'C') {
      const sp = P.subs[seg.si], [a, b] = segEnds(sp, seg.k);
      handles.push([seg.si, seg.k, 'c1', a], [seg.si, seg.k, 'c2', b]);
    }
    handles.forEach(([si, k, h, p]) => {
      const c = P.subs[si].segs[k][h];
      gOver.append(mk('line', { x1: p[0], y1: p[1], x2: c[0], y2: c[1], class: 'ed-arm' }));
      gOver.append(mk('circle', { cx: c[0], cy: c[1], r: 4.5 * u, class: 'ed-handle', 'data-si': si, 'data-k': k, 'data-h': h }));
    });
    const r = 3.5 * u;
    P.subs.forEach((sp, si) => sp.nodes.forEach((p, ni) => {
      const on = node && node.si === si && node.ni === ni;
      gOver.append(mk('rect', {
        x: p[0] - r, y: p[1] - r, width: 2 * r, height: 2 * r,
        class: 'ed-node' + (on ? ' on' : ''), 'data-si': si, 'data-ni': ni,
      }));
    }));
    const what = node ? 'point selected' : seg ? 'segment ' + ({ L: 'straight', C: 'curve', A: 'arc' })[P.subs[seg.si].segs[seg.k].t] : 'shape selected';
    info.textContent = `${total.toLocaleString()} points · this shape ${mine} · ${what}`;
  };

  // ---------- open / close ----------
  const open = (saved) => {
    if (!srcText) return;
    doc = new DOMParser().parseFromString(srcText, 'image/svg+xml');
    if (doc.querySelector('parsererror')) { alert('This SVG could not be opened in the editor.'); return; }
    const root = doc.documentElement;
    const v = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    vb = v.length === 4 && v.every(Number.isFinite) && v[2] > 0 && v[3] > 0
      ? v : [0, 0, parseFloat(root.getAttribute('width')) || 1000, parseFloat(root.getAttribute('height')) || 1000];
    gPaths.replaceChildren();
    gImg.replaceChildren();
    if (origUrl) {
      gImg.append(mk('image', { href: origUrl, x: vb[0], y: vb[1], width: vb[2], height: vb[3], preserveAspectRatio: 'none', class: 'ed-img' }));
    }
    paths = [...root.querySelectorAll('path')].map((el, pi) => {
      const tr = (el.getAttribute('transform') || '').trim();
      const m = tr.match(/^translate\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)$/);
      const editable = !tr || !!m;
      const subs = editable ? parseD(el.getAttribute('d') || '') : [];
      if (m) shift(subs, parseFloat(m[1]), parseFloat(m[2] || '0'));
      const fill = el.getAttribute('fill'), stroke = el.getAttribute('stroke');
      const filled = fill !== 'none';
      const view = mk('path', {
        d: editable ? toD(subs) : el.getAttribute('d') || '',
        fill: filled ? (fill || '#000') : 'none', 'fill-opacity': filled ? 0.18 : 0,
        stroke: stroke && stroke !== 'none' ? stroke : (filled ? fill || '#000' : '#000'),
        'fill-rule': el.getAttribute('fill-rule') || 'nonzero', class: 'ed-path', 'data-pi': pi,
      });
      if (!filled) view.setAttribute('pointer-events', 'all'); // outlines: click inside the shape to pick it
      if (!editable) view.setAttribute('transform', tr);
      gPaths.append(view);
      return { el, view, subs, editable, translated: !!m, removed: false, dirty: false };
    });
    sel = -1; node = seg = null; undo = []; redo = []; changed = false;
    clearBoxSelection();
    gImg.style.display = showOrig.checked ? '' : 'none';
    ed.hidden = false;
    document.body.classList.add('ed-open');
    ws.inert = true;
    svg.focus();
    pointReview?.open();
    if (!restoreEditorDraft(saved)) fit();
    scheduleEditorDraft();
  };
  const result = () => {
    const copy = doc.cloneNode(true);
    const elements = copy.querySelectorAll('path');
    paths.forEach((P, i) => {
      if (P.removed) { elements[i].remove(); return; }
      if (!P.dirty) return;
      elements[i].setAttribute('d', toD(P.subs));
      if (P.translated) elements[i].removeAttribute('transform');
    });
    const xml = new XMLSerializer().serializeToString(copy).replace(/^\s*<\?xml[^>]*\?>\s*/, '');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  };
  const close = () => {
    if (!ed.hidden) {
      pointReview?.close();
      ed.hidden = true; ws.inert = false; $('ed-keys').open = false;
      document.body.classList.remove('ed-open'); openBtn.focus();
      scheduleEditorDraft();
    }
  };

  // The source SVG is stored with the workspace. Keep only changed paths here,
  // and attach them to that precise source so Cancel still recovers the original.
  let stampedText, stamp, queuedDraft = false;
  function sourceStamp() {
    if (stampedText !== srcText) {
      let hash = 2166136261;
      for (let i=0; i<srcText.length; i++) hash = Math.imul(hash ^ srcText.charCodeAt(i), 16777619);
      stamp = srcText.length + ':' + (hash >>> 0);
      stampedText = srcText;
    }
    return stamp;
  }
  function editorDraft() {
    if (ed.hidden || !doc || !srcText) return null;
    const edits = [];
    paths.forEach((path, pi) => {
      if (path.dirty || path.removed) edits.push({ pi, subs:path.subs, removed:path.removed });
    });
    return {version:1, base:sourceStamp(), edits, undo, redo, view, sel, node, seg,
      showOriginal:showOrig.checked, keysOpen:$('ed-keys').open, box:captureBoxSelection(),
      review:pointReview?.captureDraft()};
  }
  function scheduleEditorDraft() {
    if (queuedDraft || !window.svgTraceDraft?.editorChanged) return;
    queuedDraft = true;
    setTimeout(() => {
      queuedDraft = false;
      window.svgTraceDraft.editorChanged(editorDraft());
    }, 0);
  }
  function restoreEditorDraft(saved) {
    if (saved?.version !== 1 || saved.base !== sourceStamp() || !Array.isArray(saved.edits)) return false;
    for (const edit of saved.edits) {
      if (!paths[edit.pi]?.editable || !Array.isArray(edit.subs)) return false;
    }
    for (const edit of saved.edits) {
      const path = paths[edit.pi];
      path.subs = edit.subs; path.removed = !!edit.removed;
      refresh(edit.pi);
    }
    changed = saved.edits.length > 0;
    const history = entries => Array.isArray(entries) ? entries.filter(entry =>
      Array.isArray(entry?.items) && entry.items.every(item => paths[item.pi]?.editable && Array.isArray(item.subs))).slice(-300) : [];
    undo = history(saved.undo); redo = history(saved.redo);
    sel = paths[saved.sel]?.editable && !paths[saved.sel].removed ? saved.sel : -1;
    const subs = paths[sel]?.subs;
    node = subs?.[saved.node?.si]?.nodes[saved.node?.ni] ? saved.node : null;
    seg = !node && subs?.[saved.seg?.si]?.segs[saved.seg?.k] ? saved.seg : null;
    restoreBoxSelection(saved.box);
    showOrig.checked = saved.showOriginal !== false;
    gImg.style.display = showOrig.checked ? '' : 'none';
    $('ed-keys').open = !!saved.keysOpen;
    pointReview?.restoreDraft(saved.review);
    if (Array.isArray(saved.view) && saved.view.length === 4 && saved.view.every(Number.isFinite) && saved.view[2] > 0 && saved.view[3] > 0) {
      view = saved.view.slice();
      setView();
    } else fit();
    return true;
  }
  window.svgTraceEditorSnapshot = editorDraft;
  window.svgTraceEditorCheckpointPending = () => !!(queuedDraft || wheelTimer || act?.saved || act?.moved);
  ws.addEventListener('st:restore-editor', e => { if (e.detail) open(e.detail); });
  // Store finished gestures. A pagehide snapshot also covers reload during a drag.
  for (const event of ['click','change','input','pointerup','pointercancel','toggle']) {
    ed.addEventListener(event,scheduleEditorDraft,true);
  }
  document.addEventListener('keydown', () => { if (!ed.hidden) scheduleEditorDraft(); });
  let wheelTimer;
  svg.addEventListener('wheel', () => {
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelTimer = null; scheduleEditorDraft(); },120);
  }, {passive:true});
  const reviewEntry = $('review-traced-points');
  ws.addEventListener('st:result', (e) => {
    srcText = e.detail.text; origUrl = e.detail.original || ''; openBtn.hidden = false;
    if (reviewEntry) reviewEntry.hidden = false;
  });
  ws.addEventListener('st:reset', () => { srcText = ''; openBtn.hidden = true; if (reviewEntry) reviewEntry.hidden = true; close(); });
  openBtn.addEventListener('click', open);
  reviewEntry?.addEventListener('click', () => {
    open();
    if (!ed.hidden) $('ed-refine-run').click();
  });
  $('ed-cancel').addEventListener('click', () => {
    if (changed && !confirm('Close without keeping your changes?')) return;
    close();
  });
  $('ed-apply').addEventListener('click', () => {
    if (changed) {
      srcText = result();
      ws.dispatchEvent(new CustomEvent('st:edited', { detail: { text: srcText } }));
    }
    close();
  });
  $('ed-download').addEventListener('click', () => {
    const text = result();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    a.download = 'traced-edited.svg';
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  showOrig.addEventListener('change', () => { gImg.style.display = showOrig.checked ? '' : 'none'; });
  $('ed-fit').addEventListener('click', fit);
  $('ed-fit-shape').addEventListener('click', () => {
    if (!cur()) return;
    const b = cur().view.getBBox(), pad = Math.max(1, Math.max(b.width,b.height) * .08);
    view = [b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad]; setView();
  });
  $('ed-font').addEventListener('click', () => {
    if (!confirm('Trace the original image again using the lettering preset? This replaces the current curves.')) return;
    close();
    $('preset').value = 'font';
    $('preset').dispatchEvent(new Event('change'));
    if (!$('auto').checked) $('go').click();
    $('preset').focus();
  });

  // ---------- edit actions ----------
  const cur = () => (sel >= 0 && !paths[sel].removed ? paths[sel] : null);
  const targets = () => {
    const P = cur();
    if (!P) return [];
    if (seg) return [[seg.si, seg.k]];
    if (node) {
      const sp = P.subs[node.si], [a, b] = around(sp, node.ni);
      return [[node.si, a], [node.si, b]].filter(([, k]) => k >= 0);
    }
    return [];
  };
  const makeStraight = () => {
    const t = targets();
    if (!t.length) return;
    remember(sel);
    t.forEach(([si, k]) => { paths[sel].subs[si].segs[k] = { t: 'L' }; });
    refresh(sel); draw();
  };
  const makeCurve = () => {
    const t = targets().sort((x, y) => y[1] - x[1]); // highest index first so splices don't shift the rest
    if (!t.length) return;
    remember(sel);
    convertSegments(t);
    if (seg) seg = null;
    refresh(sel); draw();
  };
  const convertSegments = (t) => {
    const P = paths[sel];
    t.forEach(([si, k]) => {
      const sp = P.subs[si], [a, b] = segEnds(sp, k), r = toCubics(a, sp.segs[k], b);
      sp.segs.splice(k, 1, ...r.segs);
      sp.nodes.splice(k + 1, 0, ...r.mids);
      if (node && node.si === si && node.ni > k) node.ni += r.mids.length;
    });
  };
  const smooth = () => {
    const P = cur();
    if (!P || !node) return;
    const sp = P.subs[node.si];
    let [inK, outK] = around(sp, node.ni);
    if (inK < 0 || outK < 0) return;
    remember(sel);
    if (sp.segs[inK].t === 'A' || sp.segs[outK].t === 'A') {
      convertSegments([[node.si, inK], [node.si, outK]].filter(([, k]) => sp.segs[k].t === 'A').sort((a,b) => b[1]-a[1]));
      [inK, outK] = around(sp, node.ni);
    }
    const n = sp.nodes.length, p = sp.nodes[node.ni], prev = sp.nodes[inK], next = sp.nodes[(node.ni + 1) % n];
    let A = sp.segs[inK], B = sp.segs[outK];
    const tin = tangentAt(prev, A, p, 1), tout = tangentAt(p, B, next, 0);
    if (A.t !== 'C' && B.t !== 'C') {
      A = sp.segs[inK] = { t: 'C', c1: lerp(prev, p, 1 / 3), c2: lerp(prev, p, 2 / 3) };
      B = sp.segs[outK] = { t: 'C', c1: lerp(p, next, 1 / 3), c2: lerp(p, next, 2 / 3) };
    }
    const mean = add(tin, tout);
    const d = A.t === 'C' && B.t === 'C' ? (len(mean) > 1e-8 ? unit(mean) : tin) : A.t === 'C' ? tout : tin;
    if (A.t === 'C') A.c2 = sub(p, mul(d, len(sub(A.c2, p)) || len(sub(p, prev)) / 3));
    if (B.t === 'C') B.c1 = add(p, mul(d, len(sub(B.c1, p)) || len(sub(next, p)) / 3));
    refresh(sel); draw();
  };
  // Join a run of removed anchors once using its original end tangents.
  // Adjacent surviving anchors retain their original curve/arc data exactly.
  function removeAnchors(sp, indices) {
    const n = sp.nodes.length, kept = [];
    for (let i = 0; i < n; i++) if (!indices.has(i)) kept.push(i);
    const newSegments = [];
    for (let k = 0; k < kept.length - (sp.closed ? 0 : 1); k++) {
      const a = kept[k], b = kept[(k+1) % kept.length];
      if ((a+1)%n === b) { newSegments.push(sp.segs[a]); continue; }
      let length = 0, allStraight = true;
      for (let i = a; i !== b; i = (i+1)%n) {
        length += len(sub(sp.nodes[(i+1)%n], sp.nodes[i]));
        if (sp.segs[i].t !== 'L') allStraight = false;
      }
      if (allStraight) { newSegments.push({t:'L'}); continue; }
      const last = (b+n-1)%n, A = sp.nodes[a], B = sp.nodes[b];
      const distance = Math.min(length/3, len(sub(B,A)) * .75);
      newSegments.push({t:'C',
        c1:add(A, mul(tangentAt(A,sp.segs[a],sp.nodes[(a+1)%n],0), distance)),
        c2:sub(B, mul(tangentAt(sp.nodes[last],sp.segs[last],B,1), distance)),
      });
    }
    sp.nodes = kept.map(i => sp.nodes[i]);
    sp.segs = newSegments;
  }
  function deleteBoxPoints() {
    if (!boxPoints.length) return;
    const contours = new Map();
    for (const p of boxPoints) {
      const sp = paths[p.pi].subs[p.si];
      if (!contours.has(sp)) contours.set(sp, {sp,pi:p.pi,points:[]});
      contours.get(sp).points.push(p);
    }
    const edits = [], protectedContours = [], deletedContours = new Set();
    for (const item of contours.values()) {
      const remaining = item.sp.nodes.length - item.points.length;
      if (remaining === 0) deletedContours.add(item.sp);
      else if (remaining < (item.sp.closed ? 3 : 2)) {
        protectedContours.push(item);
        continue;
      }
      edits.push(item);
    }
    const changedPaths = [...new Set(edits.map(edit => edit.pi))];
    if (changedPaths.length) {
      remember(changedPaths);
      for (const {sp,points} of edits) {
        if (!deletedContours.has(sp)) removeAnchors(sp,new Set(points.map(p=>p.ni)));
      }
      for (const pi of changedPaths) {
        if (deletedContours.size) paths[pi].subs = paths[pi].subs.filter(sp => !deletedContours.has(sp));
        refresh(pi);
      }
    }
    // Removing a sibling subpath can shift the index of a protected contour.
    const protectedPoints = protectedContours.flatMap(({pi,sp,points}) => {
      const si = paths[pi].subs.indexOf(sp);
      return points.map(p => ({...p,si}));
    });
    const removed = boxPoints.length-protectedPoints.length;
    boxPoints = protectedPoints;
    boxNotice = removed ? 'Deleted ' + removed + (removed === 1 ? ' point.' : ' points.') : '';
    if (protectedPoints.length) boxNotice += ' Select the whole contour to remove it, or leave at least 3 points on a closed contour and 2 on an open line.';
    draw();
  }
  const del = (wholeShape = false) => {
    if (boxMode) { if (!wholeShape) deleteBoxPoints(); return; }
    const P = cur();
    if (!P || (!wholeShape && (!node || P.subs[node.si].nodes.length <= 2))) return;
    const pi = sel;
    remember(sel);
    if (wholeShape) {
      P.removed = true;
      sel = -1; node = seg = null;
    } else {
      const sp = P.subs[node.si], n = sp.nodes.length, i = node.ni;
      if (!sp.closed && (i === 0 || i === n - 1)) {
        if (i === 0) { sp.nodes.shift(); sp.segs.shift(); } else { sp.nodes.pop(); sp.segs.pop(); }
      } else {
        const [inK, outK] = around(sp, i), A = sp.segs[inK], B = sp.segs[outK];
        const prev = sp.nodes[inK], next = sp.nodes[(i + 1) % n];
        const length = (len(sub(sp.nodes[i], prev)) + len(sub(next, sp.nodes[i]))) / 3;
        const merged = A.t === 'L' && B.t === 'L' ? { t: 'L' } : {
          t: 'C', c1: add(prev, mul(tangentAt(prev, A, sp.nodes[i], 0), length)),
          c2: sub(next, mul(tangentAt(sp.nodes[i], B, next, 1), length)),
        };
        sp.segs[inK] = merged;
        sp.segs.splice(outK, 1);
        sp.nodes.splice(i, 1);
      }
      node = null; seg = null;
    }
    refresh(pi);
    draw();
  };
  const restore = (from, to) => {
    const u = from.pop();
    if (!u) return;
    pointReview?.invalidate();
    to.push(snapshot(u.items.map(item => item.pi)));
    for (const item of u.items) {
      const P = paths[item.pi];
      P.subs = item.subs; P.removed = item.removed;
      refresh(item.pi);
      P.dirty = item.dirty;
    }
    sel = u.sel; node = u.node; seg = u.seg;
    restoreBoxSelection(u.box);
    changed = paths.some(path => path.dirty);
    draw();
  };
  $('ed-undo').addEventListener('click', () => restore(undo, redo));
  $('ed-redo').addEventListener('click', () => restore(redo, undo));
  $('ed-delete').addEventListener('click', () => del());
  $('ed-delete-shape').addEventListener('click', () => del(true));
  $('ed-straight').addEventListener('click', makeStraight);
  $('ed-curve').addEventListener('click', makeCurve);
  $('ed-smooth').addEventListener('click', smooth);

  if ($('ed-refine-panel') && window.createTracePointReview) {
    pointReview = window.createTracePointReview({
      overlay: reviewOverlay, make: mk, pathData: toD, unit: pxUnit, checkpoint:scheduleEditorDraft,
      drawing: () => ({paths, vb, original:origUrl}),
      boxPoints: () => boxMode ? boxPoints : [],
      selection: () => ({pi:sel, si:node?.si ?? seg?.si ?? (paths[sel]?.subs.length === 1 ? 0 : -1),
        focus:node ? {type:'node', index:node.ni} : seg ? {type:'segment', index:seg.k} : null}),
      selectTarget(pi, si, index, segment) {
        clearBoxSelection();
        sel = pi; node = segment ? null : {si,ni:index}; seg = segment ? {si,k:index,t:.5} : null;
        draw();
      },
      commit(updates) {
        const indexes = [...new Set(updates.map(update => update.pi))];
        remember(indexes, true);
        clearBoxSelection();
        for (const {pi, si, contour} of updates) paths[pi].subs[si] = contour;
        indexes.forEach(refresh);
        node = seg = null;
        draw();
      },
      focusPoint(point) {
        const m = svg.getScreenCTM();
        if (!m) return;
        const bounds = svg.getBoundingClientRect();
        const screen = new DOMPoint(...point).matrixTransform(m);
        if (screen.x < bounds.left+30 || screen.x > bounds.right-30 || screen.y < bounds.top+30 || screen.y > bounds.bottom-30) {
          view[0] = point[0] - view[2]/2; view[1] = point[1] - view[3]/2;
          setView();
        }
      },
    });
  }

  const nearest = (P, q) => {
    let best = null;
    P.subs.forEach((sp, si) => sp.segs.forEach((g, k) => {
      const [a, b] = segEnds(sp, k);
      let prev = a;
      for (let j = 1; j <= 32; j++) {
        const pt = pointAt(a, g, b, j / 32), r = distSeg(q, prev, pt);
        if (!best || r.d < best.d) best = { si, k, d: r.d, t: (j - 1 + r.u) / 32 };
        prev = pt;
      }
    }));
    return best;
  };

  // ---------- pointer ----------
  let act = null;
  function toggleBoxMode() {
    const enable = !boxMode;
    if (enable) pointReview?.invalidate();
    clearBoxSelection();
    boxMode = enable;
    node = seg = null;
    sel = -1;
    svg.focus({preventScroll:true});
    draw();
  }
  $('ed-box-select').addEventListener('click', toggleBoxMode);
  function finishBox(end, event) {
    const start = act.q;
    const moved = Math.hypot(event.clientX-act.x,event.clientY-act.y) >= 3;
    const left = Math.min(start[0],end[0]), right = Math.max(start[0],end[0]);
    const top = Math.min(start[1],end[1]), bottom = Math.max(start[1],end[1]);
    const hits = [];
    let nearestPoint = null, nearestDistance = 8 * pxUnit();
    paths.forEach((path,pi) => {
      if (!path.editable || path.removed) return;
      path.subs.forEach((sp,si) => sp.nodes.forEach(([x,y],ni) => {
        if (moved) {
          if (left <= x && x <= right && top <= y && y <= bottom) hits.push({pi,si,ni});
        } else {
          const distance = Math.hypot(x-end[0],y-end[1]);
          if (distance <= nearestDistance) { nearestDistance = distance; nearestPoint = {pi,si,ni}; }
        }
      }));
    });
    if (nearestPoint) hits.push(nearestPoint);
    if (act.additive) {
      const key = p => p.pi + ':' + p.si + ':' + p.ni;
      const seen = new Set(boxPoints.map(key));
      boxPoints = boxPoints.concat(hits.filter(p => !seen.has(key(p))));
    } else {
      boxPoints = hits;
    }
    boxNotice = '';
  }
  svg.addEventListener('pointerdown', (e) => {
    if (act || (e.button !== 0 && e.button !== 1)) return;
    const t = e.target, q = toSvg(e);
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
    if (boxMode && e.button === 0) {
      svg.focus({preventScroll:true});
      const marquee = mk('rect',{x:q[0],y:q[1],width:0,height:0,class:'ed-marquee'});
      svg.append(marquee);
      act = {type:'box',id:e.pointerId,q,x:e.clientX,y:e.clientY,additive:e.shiftKey,marquee};
      return;
    }
    const P = cur();
    if (P && e.button === 0 && t.dataset.ni !== undefined) {
      node = { si: +t.dataset.si, ni: +t.dataset.ni }; seg = null;
      act = { type: 'node', q, saved: false };
      draw();
      return;
    }
    if (P && e.button === 0 && t.dataset.h) {
      const si = +t.dataset.si, k = +t.dataset.k, h = t.dataset.h, sp = P.subs[si];
      // The handle belongs to the point at the start (c1) or end (c2) of its segment.
      const n = sp.nodes.length, ni = h === 'c1' ? k : (k + 1) % n;
      const [inK, outK] = around(sp, ni);
      const other = h === 'c1' ? (inK >= 0 ? [inK, 'c2'] : null) : (outK >= 0 ? [outK, 'c1'] : null);
      let pair = null;
      if (other && sp.segs[other[0]].t === 'C') {
        const p = sp.nodes[ni], mine = sub(sp.segs[k][h], p), theirs = sub(sp.segs[other[0]][other[1]], p);
        const cos = (mine[0] * theirs[0] + mine[1] * theirs[1]) / ((len(mine) * len(theirs)) || 1);
        if (cos < -Math.cos(8 * Math.PI / 180)) pair = other; // smooth point: keep both handles in line
      }
      act = { type: 'handle', si, k, h, ni, pair, saved: false };
      return;
    }
    act = { type: 'pan', x: e.clientX, y: e.clientY, moved: false, target: t, q };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!act) return;
    if (act.type === 'box') {
      if (e.pointerId !== act.id) return;
      const [x,y] = toSvg(e), [startX,startY] = act.q;
      act.marquee.setAttribute('x',Math.min(x,startX));
      act.marquee.setAttribute('y',Math.min(y,startY));
      act.marquee.setAttribute('width',Math.abs(x-startX));
      act.marquee.setAttribute('height',Math.abs(y-startY));
      return;
    }
    const P = cur();
    if (act.type === 'pan') {
      const dx = e.clientX - act.x, dy = e.clientY - act.y;
      if (!act.moved && Math.hypot(dx, dy) < 4) return;
      act.moved = true;
      const u = pxUnit();
      view[0] -= dx * u; view[1] -= dy * u;
      act.x = e.clientX; act.y = e.clientY;
      svg.classList.add('grab');
      setView();
      return;
    }
    if (!P) return;
    const q = toSvg(e);
    if (!act.saved) { remember(sel); act.saved = true; }
    if (act.type === 'node') {
      const sp = P.subs[node.si], d = sub(q, act.q), [inK, outK] = around(sp, node.ni);
      sp.nodes[node.ni] = add(sp.nodes[node.ni], d);
      if (inK >= 0 && sp.segs[inK].t === 'C') sp.segs[inK].c2 = add(sp.segs[inK].c2, d);
      if (outK >= 0 && sp.segs[outK].t === 'C') sp.segs[outK].c1 = add(sp.segs[outK].c1, d);
      act.q = q;
    } else if (act.type === 'handle') {
      const sp = P.subs[act.si];
      sp.segs[act.k][act.h] = q;
      if (act.pair && !e.altKey) {
        const p = sp.nodes[act.ni], o = sp.segs[act.pair[0]];
        o[act.pair[1]] = sub(p, mul(unit(sub(q, p)), len(sub(o[act.pair[1]], p))));
      }
    }
    refresh(sel); draw();
  });
  const up = (e) => {
    if (!act) return;
    if (act.type === 'box') {
      if (e.pointerId !== act.id) return;
      act.marquee.remove();
      if (e.type === 'pointerup') finishBox(toSvg(e),e);
      act = null;
      draw();
      return;
    }
    svg.classList.remove('grab');
    if (act.type === 'pan' && !act.moved && !boxMode) {
      const pi = act.target.dataset ? act.target.dataset.pi : undefined;
      const P = cur();
      const hit = P ? nearest(P, act.q) : null;
      if (P && hit && hit.d < 6 * pxUnit()) { seg = { si: hit.si, k: hit.k, t: hit.t }; node = null; }
      else if (pi !== undefined && paths[+pi].editable) { sel = +pi; node = null; seg = null; }
      else if (pi === undefined && !(act.target.classList && act.target.classList.contains('ed-hl'))) { sel = -1; node = null; seg = null; }
      draw();
    }
    act = null;
    try { if (e && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('lostpointercapture', e => { if (act?.type === 'box') up(e); });
  const insertPoint = (hit) => {
    const P = cur();
    if (!P || !hit) return;
    remember(sel);
    const sp = P.subs[hit.si], [a, b] = segEnds(sp, hit.k), [s1, mid, s2] = split(a, sp.segs[hit.k], b, Math.min(0.98, Math.max(0.02, hit.t)));
    sp.segs.splice(hit.k, 1, s1, s2);
    sp.nodes.splice(hit.k + 1, 0, mid);
    node = { si: hit.si, ni: hit.k + 1 }; seg = null;
    refresh(sel); draw();
  };
  $('ed-add').addEventListener('click', () => insertPoint(seg));
  svg.addEventListener('dblclick', (e) => {
    if (boxMode) return;
    const hit = cur() && nearest(cur(), toSvg(e));
    if (hit && hit.d <= 8 * pxUnit()) insertPoint(hit);
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const q = toSvg(e), k = Math.exp(-e.deltaY * 0.0015);
    const w = view[2] / k;
    if (w < vb[2] / 2000 || w > vb[2] * 20) return;
    view = [q[0] - (q[0] - view[0]) / k, q[1] - (q[1] - view[1]) / k, w, view[3] / k];
    setView();
  }, { passive: false });
  const zoomBy = (k) => {
    const c = [view[0] + view[2] / 2, view[1] + view[3] / 2];
    view = [c[0] - view[2] / k / 2, c[1] - view[3] / k / 2, view[2] / k, view[3] / k];
    setView();
  };
  $('ed-in').addEventListener('click', () => zoomBy(1.5));
  $('ed-out').addEventListener('click', () => zoomBy(1 / 1.5));
  window.addEventListener('resize', () => { if (!ed.hidden) draw(); });

  document.addEventListener('keydown', (e) => {
    if (ed.hidden || $('trace-ai-dialog')?.open || e.isComposing || e.altKey || act) return;
    if (e.target.matches?.('input:not([type=checkbox]), textarea, select, [contenteditable=true]')) return;
    const key = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const command = mod ? (key === 'z' ? (e.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
      : ({b:'box-select', s:'smooth', c:'curve', l:'straight', i:'add', f:'fit-shape', '0':'fit',
          delete:e.shiftKey ? 'delete-shape' : 'delete', backspace:'delete'})[key];
    if (command) { e.preventDefault(); if (!e.repeat) $('ed-' + command).click(); return; }
    if (mod) return;
    if (key === '?') { e.preventDefault(); $('ed-keys').open = !$('ed-keys').open; return; }
    if (key === 'escape') {
      if ($('ed-keys').open) $('ed-keys').open = false;
      else if (boxMode) clearBoxSelection();
      else if (node || seg) node = seg = null;
      else sel = -1;
      draw(); return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const P = cur();
    if (P && (key === '[' || key === ']')) {
      e.preventDefault();
      const direction = key === ']' ? 1 : -1;
      let si = node?.si ?? seg?.si ?? 0;
      let ni = node ? node.ni + direction : seg?.k ?? (direction > 0 ? 0 : P.subs[si].nodes.length - 1);
      if (ni < 0 || ni >= P.subs[si].nodes.length) {
        si = (si + direction + P.subs.length) % P.subs.length;
        ni = direction > 0 ? 0 : P.subs[si].nodes.length - 1;
      }
      node = {si,ni}; seg = null; draw(); return;
    }
    if (arrows[e.key] && P && node) {
      e.preventDefault();
      const d = mul(arrows[e.key], e.shiftKey ? 10 : 1), sp = P.subs[node.si], [inK, outK] = around(sp, node.ni);
      remember(sel);
      sp.nodes[node.ni] = add(sp.nodes[node.ni], d);
      if (inK >= 0 && sp.segs[inK].t === 'C') sp.segs[inK].c2 = add(sp.segs[inK].c2, d);
      if (outK >= 0 && sp.segs[outK].t === 'C') sp.segs[outK].c1 = add(sp.segs[outK].c1, d);
      refresh(sel); draw();
    }
  });
})();
