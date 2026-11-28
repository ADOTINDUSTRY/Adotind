(() => {
  'use strict';
  const labels = {align:'Align point to original', fit:'Fit curve to original', smooth:'Smooth point', remove:'Remove redundant point', straighten:'Straighten segment'};
  const reasons = {align:'Move this anchor toward the edge in the original artwork.', fit:'Adjust the handles to follow the visible edge.',
    smooth:'Align the handles at this small kink.', remove:'The adjacent edges can be joined with fewer points.', straighten:'This curve closely follows a straight line.'};
  const goals = {match:['align','fit','smooth','straighten','remove'], smooth:['fit','smooth','align','remove','straighten'], reduce:['remove','straighten']};
  const isSegment = action => action === 'fit' || action === 'straighten';
  const matchesFocus = (edit, focus) => !focus || (edit.index === focus.index && isSegment(edit.action) === (focus.type === 'segment'));
  const storedEdit = ({action,index,reason,geometry,improvement}) => ({action,index,reason,geometry,improvement});
  function inSelection(target,action,index) {
    if (!target.selected) return matchesFocus({action,index},target.focus);
    if (!target.selected.has(index)) return false;
    return !isSegment(action) || target.selected.has((index+1)%target.source.nodes.length);
  }

  function wireSegment(s) {
    if (s.t === 'C') return ['C', ...s.c1, ...s.c2];
    if (s.t === 'A') return ['A', s.rx, s.ry, s.rot || 0, Number(s.large), Number(s.sweep)];
    return ['L'];
  }

  // Neighbours on either side let a long outline be reviewed in parts without
  // treating the join between two requests as a real endpoint.
  function piecesFor(target) {
    const sp = target.source, n = sp.nodes.length;
    const pieces = [];
    const stride = n <= 640 ? n : 300;
    for (let start = 0; start < n; start += stride) {
      const end = Math.min(n, start + stride);
      if (target.focus && (target.focus.index < start || target.focus.index >= end)) continue;
      const full = n === stride, closed = full && sp.closed;
      const left = full ? 0 : (sp.closed ? start-1 : Math.max(0,start-1));
      const right = full ? n : (sp.closed ? end+1 : Math.min(n,end+1));
      const ids = Array.from({length:right-left}, (_, offset) => (left+offset+n)%n);
      const id = full ? target.id : target.id + '-' + start;
      const indices = new Map(ids.map((value, i) => [value, i]));
      const selected = target.selected ? ids.flatMap((value,i) => target.selected.has(value) ? [i] : []) : null;
      if (selected && !selected.some(i => ids[i]>=start && ids[i]<end)) continue;
      const candidates = target.candidates.filter(x => x.index >= start && x.index < end && matchesFocus(x,target.focus))
        .slice(0,20).map(({action,index}) => ({action,index:indices.get(index)}));
      const data = {id, closed, nodes:ids.map(i => sp.nodes[i]),
        segments:(closed ? ids : ids.slice(0,-1)).map(i => wireSegment(sp.segs[i])), candidates};
      if (target.focus) data.focus = {...target.focus,index:indices.get(target.focus.index)};
      if (selected) data.selected = selected;
      pieces.push({target,data,ids,start,end});
    }
    return pieces;
  }

  function batchesOf(pieces) {
    const result = [];
    let nodes = 0, batch = [];
    for (const piece of pieces) {
      const count = piece.ids.length;
      if (batch.length && (nodes + count > 640 || batch.length >= 48)) {
        result.push(batch); batch = []; nodes = 0;
      }
      nodes += count; batch.push(piece);
    }
    if (batch.length) result.push(batch);
    return result;
  }

  window.createTracePointReview = function (editor) {
    const $ = id => document.getElementById('ed-refine-' + id);
    const toggle = document.getElementById('ed-ai');
    const panel = $('panel'), scope = $('scope'), status = $('status');
    const geometry = window.SvgTraceRefine;
    let targets = [], pending = [], cursor = 0, flight, appliedCount = 0, skippedCount = 0;
    let baseMessage = '', referenceKey, referencePromise, reference, detailMode = 'after';
    let nearbyContours;

    async function referenceFor(original,vb) {
      if (!original) return null;
      const key = original + '|' + vb.join(',');
      if (key !== referenceKey) {
        referenceKey = key;
        reference = null;
        referencePromise = window.svgTraceReviewReference.load(original,vb).catch(() => null);
      }
      const ready = await referencePromise;
      if (key === referenceKey) reference = ready;
      return ready;
    }

    function clear() {
      if (flight) flight.abort();
      flight = null;
      targets = []; pending = []; cursor = appliedCount = skippedCount = 0; baseMessage = '';
      nearbyContours = null;
      editor.overlay.replaceChildren();
    }
    function updateControls() {
      const selected = editor.selection();
      for (const choice of scope.options) {
        choice.disabled = choice.value === 'contour' ? selected.si < 0 : choice.value === 'point' && !selected.focus;
      }
      const ready = !scope.selectedOptions[0]?.disabled;
      $('run').disabled = !!flight || !ready;
      $('local').disabled = !ready;
      $('review').hidden = !pending.length;
      $('prev').disabled = cursor === 0;
      $('next').disabled = cursor >= pending.length - 1;
    }
    function renderPanel() {
      updateControls();
      const counter = [];
      if (appliedCount) counter.push(appliedCount + ' applied');
      if (skippedCount) counter.push(skippedCount + ' skipped');
      status.textContent = [baseMessage, counter.join(' · ')].filter(Boolean).join(' ');
      const item = pending[cursor];
      if (item) {
        $('count').textContent = (cursor + 1) + ' of ' + pending.length + ' remaining';
        $('reason').textContent = labels[item.action] + ' · Shape ' + (item.target.pi+1) + ', contour ' + (item.target.si+1) +
          ', ' + (isSegment(item.action) ? 'segment ' : 'point ') + (item.index+1) + '. ' + item.reason;
      }
      renderDetail(item);
      renderCanvas();
      editor.checkpoint?.();
    }
    function renderDetail(item) {
      const detail = $('detail');
      detail.replaceChildren();
      if (!item) return;
      const {original,vb} = editor.drawing();
      let [cx,cy] = item.point;
      const points = [...item.before.nodes,...item.after.nodes];
      const span = Math.max(...points.map(p => Math.hypot(p[0]-cx,p[1]-cy)));
      let reach = span*.65;
      if (item.action === 'align' && item.geometry?.to) {
        const [x,y] = item.geometry.to;
        reach = Math.hypot(cx-x,cy-y)*2.6;
        cx = (cx+x)/2; cy = (cy+y)/2;
      } else if (item.action === 'fit') {
        const pointOn = (region,t) => {
          const [a,b] = region.nodes, seg = region.segs[0], s = 1-t;
          return a.map((v,i) => seg.t==='C' ? s*s*s*v + 3*s*s*t*seg.c1[i] + 3*s*t*t*seg.c2[i] + t*t*t*b[i] : s*v+t*b[i]);
        };
        let largest = 0;
        for (const t of [.2,.35,.5,.65,.8]) {
          const [x,y] = pointOn(item.before,t), [u,v] = pointOn(item.after,t);
          const delta = Math.hypot(x-u,y-v);
          if (delta>largest) { largest=delta; cx=(x+u)/2; cy=(y+v)/2; }
        }
        if (largest) reach = largest*3.5;
      }
      const radius = Math.max(Math.max(vb[2],vb[3])*.012, reach, 1);
      detail.style.backgroundColor = reference?.background || '';
      detail.setAttribute('viewBox',[cx-radius*1.4,cy-radius,radius*2.8,radius*2].join(' '));
      if (original) detail.append(editor.make('image',{href:original,x:vb[0],y:vb[1],width:vb[2],height:vb[3],preserveAspectRatio:'none'}));
      if (detailMode !== 'original') {
        detail.append(editor.make('path',{d:editor.pathData([item[detailMode]]),fill:'none',stroke:detailMode==='before'?'#d83170':'#00847f',
          'stroke-width':2,'vector-effect':'non-scaling-stroke'}));
      }
      for (const button of panel.querySelectorAll('[data-detail]')) {
        button.setAttribute('aria-pressed',String(button.dataset.detail === detailMode));
        button.disabled = !original && button.dataset.detail === 'original';
      }
    }
    function renderCanvas() {
      const layer = editor.overlay;
      layer.replaceChildren();
      layer.classList.toggle('has-review',!panel.hidden && !!pending[cursor]);
      if (panel.hidden) return;
      updateControls();
      const active = pending[cursor];
      if (!active) return;
      for (const [shape,style] of [[active.before,'ed-refine-original'],[active.after,'ed-refine-proposed']]) {
        layer.append(editor.make('path', {d:editor.pathData([shape]),class:style,'pointer-events':'none',fill:'none'}));
      }
      const u = editor.unit(), stride = Math.max(1,Math.ceil(pending.length / 160));
      function mark(item,i,current) {
        const [cx,cy] = item.point;
        const marker = editor.make('circle',{cx,cy,r:(current?8:4)*u,
          class:current?'ed-refine-active-marker':'ed-refine-marker','data-review-index':i,
          'pointer-events':current?'none':'all'});
        if (!current) marker.addEventListener('pointerdown',e => {
          e.preventDefault(); e.stopPropagation(); choose(i);
        });
        layer.append(marker);
      }
      for (let i=0;i<pending.length;i+=stride) if (i!==cursor) mark(pending[i],i,false);
      mark(active,cursor,true);
    }
    function choose(index) {
      cursor = Math.max(0,Math.min(index,pending.length-1));
      const item = pending[cursor];
      if (item) {
        const removedBefore = item.target.accepted.filter(e => e.action === 'remove' && e.index < item.index).length;
        // Moving between proposals must preserve the user's automatic review scope.
        if (scope.value !== 'auto') editor.selectTarget(item.target.pi,item.target.si,item.index-removedBefore,isSegment(item.action));
        editor.focusPoint(item.point);
      }
      renderPanel();
    }
    function collect() {
      const {paths} = editor.drawing(), selection = editor.selection();
      const byContour = new Map();
      if (scope.value === 'auto') {
        for (const {pi,si,ni} of editor.boxPoints()) {
          const id = 'p'+pi+'s'+si;
          if (!byContour.has(id)) byContour.set(id,new Set());
          byContour.get(id).add(ni);
        }
      }
      const mode = scope.value !== 'auto' ? scope.value : byContour.size ? 'box' :
        selection.focus ? 'point' : selection.si>=0 ? 'contour' : selection.pi>=0 ? 'shape' : 'drawing';
      const result = [];
      paths.forEach((path,pi) => {
        if (!path.editable || path.removed) return;
        path.subs.forEach((source,si) => {
          const id = 'p'+pi+'s'+si, selected = byContour.get(id);
          if (source.nodes.length < 2 || (mode==='box' && !selected) || (mode==='shape' && selection.pi!==pi) ||
              (['point','contour'].includes(mode) && (selection.pi !== pi || selection.si !== si))) return;
          const focus = mode === 'point' ? selection.focus : null;
          result.push({id, pi, si, source, focus, selected, accepted:[], candidates:[], suggestions:[]});
        });
      });
      return result;
    }
    function guard(target, planned = []) {
      const {paths,vb} = editor.drawing();
      // Nearby shapes may be distinct SVG paths (separate letters, holes or overlapping artwork).
      // Reuse broad bounds during review; the geometry engine checks actual curves for clearance.
      function bounds(sub) {
        let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
        function take(p) { x=Math.min(x,p[0]); y=Math.min(y,p[1]); right=Math.max(right,p[0]); bottom=Math.max(bottom,p[1]); }
        sub.nodes.forEach(take);
        for (const s of sub.segs) {
          if (s.t==='A') return [-Infinity,-Infinity,Infinity,Infinity];
          if (s.t==='C') { take(s.c1); take(s.c2); }
        }
        return [x,y,right,bottom];
      }
      if (!nearbyContours) {
        nearbyContours = [];
        paths.forEach((p,pi) => { if (p.editable && !p.removed) p.subs.forEach((sub,si) => nearbyContours.push({pi,si,sub,b:bounds(sub)})); });
        nearbyContours.sort((a,b)=>a.b[0]-b.b[0]);
      }
      const [l,t,r,b] = bounds(target.source), pad = Math.max(vb[2],vb[3])*.035;
      const obstacles = [];
      for (const entry of nearbyContours) {
        if (entry.b[0]>r+pad) break;
        if ((entry.pi===target.pi && entry.si===target.si) || entry.b[2]<l-pad || entry.b[1]>b+pad || entry.b[3]<t-pad) continue;
        const revised = planned.find(p => p.pi===entry.pi && p.si===entry.si);
        obstacles.push(revised ? revised.contour : entry.sub);
      }
      const guide = target.source.closed && paths[target.pi].el.getAttribute('fill') !== 'none' ? reference?.guide : null;
      return {obstacles,guide};
    }
    function refreshPending(target) {
      if (!target.suggestions.length) return;
      const current = editor.drawing().paths[target.pi].subs[target.si];
      const reviewer = geometry.createReviewer(current,guard(target));
      const removed = new Set(target.accepted.filter(a=>a.action==='remove').map(a=>a.index));
      const indexMap = new Map();
      let nextIndex = 0;
      target.source.nodes.forEach((_,index) => { if (!removed.has(index)) indexMap.set(index,nextIndex++); });
      target.suggestions = target.suggestions.filter(item => {
        if (!indexMap.has(item.index)) return false;
        const detail = reviewer.preview({action:item.action,index:indexMap.get(item.index),geometry:item.geometry});
        if (!detail) return false;
        Object.assign(item,{before:detail.before, after:detail.after, point:detail.point});
        if (detail.geometry) item.geometry = detail.geometry;
        return true;
      });
    }
    function finishReview(message) {
      targets.forEach(refreshPending);
      pending = targets.flatMap(t => t.suggestions);
      baseMessage = message;
      if (!pending.length && !message) baseMessage = 'No corrections were suggested for this selection.';
      choose(0);
    }
    function addSuggestion(target,action,index,reason,detail) {
      if (!Object.hasOwn(labels,action) || !Number.isInteger(index) || !inSelection(target,action,index)) return;
      if (target.suggestions.some(item => item.index===index && item.action===action)) return;
      target.suggestions.push({target,action,index,reason:reason || reasons[action],geometry:detail?.geometry,improvement:detail?.improvement});
    }
    async function run(local) {
      clear();
      const controller = new AbortController();
      flight = controller;
      targets = collect();
      const chosen = targets;
      if (!chosen.length) { flight = null; baseMessage = 'Select a point or edge on the drawing first.'; renderPanel(); return; }
      const {original,vb} = editor.drawing();
      const instruction = $('instruction').value.trim();
      const goal = $('goal').value;
      const priority = goals[goal];
      const hint = 'Reviewing ' + chosen.length + (chosen.length===1?' contour':' contours');
      baseMessage = hint + '…'; renderPanel();
      let completed = 0, totalBatches = 0;
      let summary = '', proposed = 0;
      function addMeasured(target) {
        for (const c of target.candidates) addSuggestion(target,c.action,c.index,reasons[c.action],c);
      }
      try {
        const ref = await referenceFor(original,vb);
        if (controller.signal.aborted) return;
        let lastYield = performance.now();
        async function yieldIfBusy() {
          if (performance.now()-lastYield<20) return;
          await new Promise(resolve=>setTimeout(resolve,0));
          lastYield=performance.now();
        }
        for (let i=0;i<chosen.length;i++) {
          if (!(i%8)) await new Promise(resolve => setTimeout(resolve,0));
          if (controller.signal.aborted) return;
          const target = chosen[i];
          const reviewer = geometry.createReviewer(target.source,guard(target));
          if (target.focus || target.selected) {
            const indices = target.selected || [target.focus.index];
            const choices = [];
            let visited = 0;
            for (const index of indices) {
              if (!(visited++%16)) { await yieldIfBusy(); if (controller.signal.aborted) return; }
              for (const action of priority) {
                if (!inSelection(target,action,index)) continue;
                const candidate = reviewer.preview({action,index});
                if (candidate) choices.push(candidate);
              }
            }
            target.candidates = choices;
          } else {
            const choices = [];
            for (let start=0;start<target.source.nodes.length;start+=48) {
              await yieldIfBusy();
              if (controller.signal.aborted) return;
              choices.push(...reviewer.candidates(start,start+48));
            }
            target.candidates = choices.filter(c => priority.includes(c.action))
              .sort((a,b) => priority.indexOf(a.action)-priority.indexOf(b.action) || (b.improvement||0)-(a.improvement||0));
          }
          if (local) addMeasured(target);
        }
        if (!local) {
          const batches = batchesOf(chosen.flatMap(piecesFor));
          totalBatches = batches.length;
          for (const batch of batches) {
            if (controller.signal.aborted) return;
            baseMessage = hint + (batches.length>1 ? ' · part '+(completed+1)+' of '+batches.length : '') + '…'; renderPanel();
            const body = {mode:'review',width:Math.ceil(vb[2]),height:Math.ceil(vb[3]),viewBox:vb,goal,instruction,contours:batch.map(p => p.data)};
            if (ref) Object.assign(body,ref.evidence(batch,editor.pathData,batches.length===1));
            const response = await fetch('/online-quote/svg-trace/ai',{
              method:'POST',signal:controller.signal,credentials:'same-origin',
              headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content},
              body:JSON.stringify(body),
            });
            const data = await response.json();
            if (controller.signal.aborted) return;
            if (!response.ok || !Array.isArray(data.proposals)) throw Error(data.error || 'AI review is unavailable.');
            if (batches.length===1 && typeof data.summary === 'string') summary = data.summary;
            const lookup = new Map(batch.map(p => [p.data.id,p]));
            for (const group of data.proposals) {
              const piece = lookup.get(group.id);
              if (!piece) continue;
              for (const edit of group.edits) {
                const index = piece.ids[edit.index];
                if (index >= piece.start && index < piece.end) {
                  const candidate = piece.target.candidates.find(c=>c.action===edit.action && c.index===index);
                  addSuggestion(piece.target,edit.action,index,edit.reason,candidate);
                  proposed++;
                }
              }
            }
            completed++;
          }
        }
        flight = null;
        finishReview(local ? 'Quick cleanup finished.' : '');
        if (!local && !pending.length) {
          const alternatives = chosen.flatMap(target => target.candidates
            .filter(c => c.geometry && c.improvement>0)
            .map(c => ({target,c}))).sort((a,b)=>b.c.improvement-a.c.improvement).slice(0,3);
          for (const {target,c} of alternatives) addSuggestion(target,c.action,c.index,reasons[c.action],c);
          if (alternatives.length) {
            finishReview('AI returned no applicable edit. Image comparison found these alternatives for you to review.');
            if (pending.length) return;
          }
        }
        if (pending.length) {
          baseMessage = pending.length + (pending.length===1?' change':' changes') + ' ready to compare.';
        } else if (local) {
          baseMessage = 'Quick cleanup found no verified edits for this selection.';
        } else if (proposed) {
          baseMessage = 'The suggested edits did not pass the outline checks. Select a specific point or segment to review it more closely.';
        } else {
          baseMessage = summary || 'AI found no edit for this selection. Try selecting the specific point or segment you want to change.';
        }
        renderPanel();
      } catch (error) {
        if (controller.signal.aborted) return;
        flight = null;
        if (!local && !completed) {
          chosen.forEach(addMeasured);
          finishReview(error.message);
          if (pending.length) { baseMessage = error.message + ' Showing locally measured edits instead.'; renderPanel(); }
        } else finishReview((completed ? 'Reviewed '+completed+' of '+totalBatches+' parts. ' : '') + error.message);
      }
    }
    function apply(items) {
      if (!items.length) return;
      const updates = [];
      let conflicts = 0;
      const touched = new Set(items.map(item => item.target));
      for (const target of touched) {
        const applying = items.filter(item => item.target===target);
        const result = geometry.apply(target.source,[...target.accepted,...applying],guard(target, updates));
        const applied = new Set(result.applied.map(a=>a.action+'#'+a.index));
        const keepsEarlierEdits = target.accepted.every(a => applied.has(a.action+'#'+a.index));
        const accepted = keepsEarlierEdits ? applying.filter(a=>applied.has(a.action+'#'+a.index)) : [];
        conflicts += applying.length - accepted.length;
        if (accepted.length) {
          target.accepted.push(...accepted); appliedCount += accepted.length;
          updates.push({pi:target.pi,si:target.si,contour:result.contour});
        }
        target.suggestions = target.suggestions.filter(item=>!applying.includes(item));
      }
      if (updates.length) { editor.commit(updates); nearbyContours=null; }
      const changedPaths = new Set(updates.map(update=>update.pi));
      for (const target of targets) if (changedPaths.has(target.pi)) refreshPending(target);
      pending = targets.flatMap(target => target.suggestions);
      baseMessage = pending.length ? '' : 'Review complete.';
      if (conflicts) baseMessage += ' Kept the existing geometry for ' + conflicts + (conflicts === 1 ? ' overlapping edit.' : ' overlapping edits.');
      choose(cursor);
    }
    function skip() {
      const item = pending[cursor];
      if (!item) return;
      item.target.suggestions = item.target.suggestions.filter(x=>x!==item);
      refreshPending(item.target); skippedCount++;
      pending = targets.flatMap(t=>t.suggestions);
      baseMessage = pending.length ? '' : 'Review complete.';
      choose(cursor);
    }
    function invalidate() {
      if (!targets.length && !flight) return;
      clear(); baseMessage = 'The drawing changed. Ask AI to review the current points.'; renderPanel();
    }
    function open() {
      panel.hidden = false; toggle.setAttribute('aria-expanded','true');
      const {original,vb} = editor.drawing();
      if (referenceKey !== original+'|'+vb.join(',')) reference = null;
      updateControls();
      if (scope.selectedOptions[0]?.disabled) scope.value = 'drawing';
      baseMessage = 'Click a point or edge to review it, or use Box select for several points. With nothing selected, Ask AI reviews the whole drawing.';
      renderPanel();
    }
    function close() {
      clear(); panel.hidden = true; toggle.setAttribute('aria-expanded','false');
    }
    function captureDraft() {
      return {visible:!panel.hidden, scope:scope.value, instruction:$('instruction').value,goal:$('goal').value,detailMode,
        message:baseMessage, interrupted:!!flight, cursor, appliedCount, skippedCount,
        targets:targets.filter(t => t.suggestions.length).map(t => ({
          pi:t.pi, si:t.si, focus:t.focus, selected:t.selected ? [...t.selected] : null, original:t.accepted.length ? t.source : null,
          accepted:t.accepted.map(storedEdit), suggestions:t.suggestions.map(storedEdit),
        }))};
    }
    function restoreDraft(state) {
      if (!state || !Array.isArray(state.targets)) return;
      clear();
      scope.value = ['auto','drawing','contour','point'].includes(state.scope) ? state.scope : 'auto';
      $('goal').value = Object.hasOwn(goals,state.goal) ? state.goal : 'match';
      detailMode = ['original','before','after'].includes(state.detailMode) ? state.detailMode : 'after';
      $('instruction').value = state.instruction || '';
      appliedCount = state.appliedCount || 0; skippedCount = state.skippedCount || 0;
      const {paths} = editor.drawing();
      for (const item of state.targets) {
        const current = paths[item.pi]?.subs[item.si];
        if (!current || !Array.isArray(item.suggestions)) continue;
        const target = {id:'p'+item.pi+'s'+item.si, pi:item.pi, si:item.si, source:item.original || current,
          accepted:item.accepted || [], focus:item.focus, selected:Array.isArray(item.selected) ? new Set(item.selected) : null, suggestions:[], candidates:[]};
        for (const s of item.suggestions) addSuggestion(target,s.action,s.index,s.reason,s);
        refreshPending(target);
        targets.push(target);
      }
      pending = targets.flatMap(t => t.suggestions);
      cursor = Math.max(0, Math.min(state.cursor || 0,pending.length-1));
      baseMessage = state.interrupted ? 'The review was interrupted. Ask AI to review the current points again.' : state.message || '';
      panel.hidden = !state.visible;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      renderPanel();
    }
    toggle.addEventListener('click',() => panel.hidden ? open() : close());
    $('close').addEventListener('click',() => { close(); toggle.focus(); });
    scope.addEventListener('change',() => { clear(); renderPanel(); });
    $('goal').addEventListener('change',() => { clear(); renderPanel(); });
    for (const button of panel.querySelectorAll('[data-detail]')) button.addEventListener('click',() => {
      detailMode = button.dataset.detail; renderDetail(pending[cursor]); editor.checkpoint?.();
    });
    $('instruction').addEventListener('input',() => { if (flight || pending.length) { clear(); renderPanel(); } });
    $('run').addEventListener('click',() => run(false));
    $('local').addEventListener('click',() => run(true));
    $('prev').addEventListener('click',() => choose(cursor-1));
    $('next').addEventListener('click',() => choose(cursor+1));
    $('apply').addEventListener('click',() => apply([pending[cursor]].filter(Boolean)));
    $('all').addEventListener('click',() => apply(pending.slice()));
    $('skip').addEventListener('click',skip);
    return {open,close,invalidate,renderCanvas,captureDraft,restoreDraft};
  };
})();
