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
  const f = (n) => String(Math.round(n * 100) / 100);
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
  let undo = [];
  let changed = false;
  const gImg = mk('g'), gPaths = mk('g'), gOver = mk('g', { class: 'ed-over' });
  svg.append(gImg, gPaths, gOver);

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
  const remember = (pi) => {
    undo.push({ pi, subs: JSON.parse(JSON.stringify(paths[pi].subs)), removed: paths[pi].removed });
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
  const draw = () => {
    gOver.replaceChildren();
    let total = 0;
    paths.forEach((P) => { if (P.editable && !P.removed) P.subs.forEach((s) => { total += s.nodes.length; }); });
    const P = paths[sel];
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
  const open = () => {
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
    sel = -1; node = seg = null; undo = []; changed = false;
    gImg.style.display = showOrig.checked ? '' : 'none';
    ed.hidden = false;
    document.body.classList.add('ed-open');
    requestAnimationFrame(fit);
  };
  const result = () => {
    paths.forEach((P) => {
      if (P.removed) { P.el.remove(); return; }
      if (!P.dirty) return;
      P.el.setAttribute('d', toD(P.subs));
      if (P.translated) P.el.removeAttribute('transform');
    });
    const xml = new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^>]*\?>\s*/, '');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  };
  const close = () => { ed.hidden = true; document.body.classList.remove('ed-open'); };

  ws.addEventListener('st:result', (e) => { srcText = e.detail.text; origUrl = e.detail.original || ''; openBtn.hidden = false; });
  ws.addEventListener('st:reset', () => { srcText = ''; openBtn.hidden = true; close(); });
  openBtn.addEventListener('click', open);
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
    srcText = text;
    ws.dispatchEvent(new CustomEvent('st:edited', { detail: { text } }));
    open(); // re-read so further edits start from what was saved
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    a.download = 'traced-edited.svg';
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  showOrig.addEventListener('change', () => { gImg.style.display = showOrig.checked ? '' : 'none'; });
  $('ed-fit').addEventListener('click', fit);

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
    const P = paths[sel];
    t.forEach(([si, k]) => {
      const sp = P.subs[si], [a, b] = segEnds(sp, k), r = toCubics(a, sp.segs[k], b);
      sp.segs.splice(k, 1, ...r.segs);
      sp.nodes.splice(k + 1, 0, ...r.mids);
      if (node && node.si === si && node.ni > k) node.ni += r.mids.length;
    });
    if (seg) seg = null;
    refresh(sel); draw();
  };
  const smooth = () => {
    const P = cur();
    if (!P || !node) return;
    const sp = P.subs[node.si], [inK, outK] = around(sp, node.ni);
    if (inK < 0 || outK < 0) return;
    remember(sel);
    const n = sp.nodes.length, p = sp.nodes[node.ni], prev = sp.nodes[inK], next = sp.nodes[(node.ni + 1) % n];
    let A = sp.segs[inK], B = sp.segs[outK];
    const tin = tangentAt(prev, A, p, 1), tout = tangentAt(p, B, next, 0);
    if (A.t !== 'C' && B.t !== 'C') {
      if (A.t === 'A' || B.t === 'A') return;
      A = sp.segs[inK] = { t: 'C', c1: lerp(prev, p, 1 / 3), c2: lerp(prev, p, 2 / 3) };
      B = sp.segs[outK] = { t: 'C', c1: lerp(p, next, 1 / 3), c2: lerp(p, next, 2 / 3) };
    }
    const d = A.t === 'C' && B.t === 'C' ? unit(add(tin, tout)) : A.t === 'C' ? tout : tin;
    if (A.t === 'C') A.c2 = sub(p, mul(d, len(sub(A.c2, p)) || len(sub(p, prev)) / 3));
    if (B.t === 'C') B.c1 = add(p, mul(d, len(sub(B.c1, p)) || len(sub(next, p)) / 3));
    refresh(sel); draw();
  };
  const del = () => {
    const P = cur();
    if (!P) return;
    remember(sel);
    if (!node) {
      P.removed = true;
      sel = -1; seg = null;
    } else {
      const sp = P.subs[node.si], n = sp.nodes.length, i = node.ni;
      if (n <= (sp.closed ? 3 : 2)) {
        P.subs.splice(node.si, 1);
      } else if (!sp.closed && (i === 0 || i === n - 1)) {
        if (i === 0) { sp.nodes.shift(); sp.segs.shift(); } else { sp.nodes.pop(); sp.segs.pop(); }
      } else {
        const [inK, outK] = around(sp, i), A = sp.segs[inK], B = sp.segs[outK];
        const prev = sp.nodes[inK], next = sp.nodes[(i + 1) % n];
        const merged = A.t === 'C' || B.t === 'C'
          ? { t: 'C', c1: A.t === 'C' ? A.c1 : lerp(prev, next, 1 / 3), c2: B.t === 'C' ? B.c2 : lerp(prev, next, 2 / 3) }
          : { t: 'L' };
        sp.segs[inK] = merged;
        sp.segs.splice(outK, 1);
        sp.nodes.splice(i, 1);
      }
      node = null; seg = null;
    }
    refresh(sel === -1 ? undo[undo.length - 1].pi : sel);
    draw();
  };
  const undoOne = () => {
    const u = undo.pop();
    if (!u) return;
    const P = paths[u.pi];
    P.subs = u.subs; P.removed = u.removed;
    refresh(u.pi);
    sel = P.removed ? -1 : u.pi; node = null; seg = null;
    changed = undo.length > 0 || changed;
    draw();
  };
  $('ed-undo').addEventListener('click', undoOne);
  $('ed-delete').addEventListener('click', del);
  $('ed-straight').addEventListener('click', makeStraight);
  $('ed-curve').addEventListener('click', makeCurve);
  $('ed-smooth').addEventListener('click', smooth);

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
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const t = e.target, q = toSvg(e);
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
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
    svg.classList.remove('grab');
    if (act.type === 'pan' && !act.moved) {
      const pi = act.target.dataset ? act.target.dataset.pi : undefined;
      const P = cur();
      const hit = P ? nearest(P, act.q) : null;
      if (P && hit && hit.d < 6 * pxUnit()) { seg = { si: hit.si, k: hit.k }; node = null; }
      else if (pi !== undefined && paths[+pi].editable) { sel = +pi; node = null; seg = null; }
      else if (pi === undefined && !(act.target.classList && act.target.classList.contains('ed-hl'))) { sel = -1; node = null; seg = null; }
      draw();
    }
    act = null;
    try { if (e && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('dblclick', (e) => {
    const P = cur();
    if (!P) return;
    const q = toSvg(e), hit = nearest(P, q);
    if (!hit || hit.d > 8 * pxUnit()) return;
    remember(sel);
    const sp = P.subs[hit.si], [a, b] = segEnds(sp, hit.k), [s1, mid, s2] = split(a, sp.segs[hit.k], b, Math.min(0.98, Math.max(0.02, hit.t)));
    sp.segs.splice(hit.k, 1, s1, s2);
    sp.nodes.splice(hit.k + 1, 0, mid);
    node = { si: hit.si, ni: hit.k + 1 }; seg = null;
    refresh(sel); draw();
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
    if (ed.hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoOne(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return; }
    if (e.key === 'Escape') { if (node || seg) { node = seg = null; } else sel = -1; draw(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const P = cur();
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
