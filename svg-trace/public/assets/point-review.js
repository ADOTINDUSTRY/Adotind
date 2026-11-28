(() => {
  'use strict';
  const labels = {smooth:'Smooth point', remove:'Remove redundant point', straighten:'Straighten segment'};
  const reasons = {smooth:'Align the handles at this small kink.', remove:'The adjacent edges can be joined with fewer points.', straighten:'This curve closely follows a straight line.'};
  const matchesFocus = (edit, focus) => !focus || (edit.index === focus.index && (edit.action === 'straighten') === (focus.type === 'segment'));

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
      const candidates = target.candidates.filter(x => x.index >= start && x.index < end && matchesFocus(x,target.focus))
        .slice(0,20).map(({action,index}) => ({action,index:indices.get(index)}));
      const data = {id, closed, nodes:ids.map(i => sp.nodes[i]),
        segments:(closed ? ids : ids.slice(0,-1)).map(i => wireSegment(sp.segs[i])), candidates};
      if (target.focus) data.focus = {...target.focus,index:indices.get(target.focus.index)};
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
    let baseMessage = '', thumbnail, thumbnailSource;

    function clear() {
      if (flight) flight.abort();
      flight = null;
      targets = []; pending = []; cursor = appliedCount = skippedCount = 0; baseMessage = '';
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
          ', ' + (item.action === 'straighten' ? 'segment ' : 'point ') + (item.index+1) + '. ' + item.reason;
      }
      renderCanvas();
      editor.checkpoint?.();
    }
    function renderCanvas() {
      const layer = editor.overlay;
      layer.replaceChildren();
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
        editor.selectTarget(item.target.pi,item.target.si,item.index-removedBefore,item.action==='straighten');
        editor.focusPoint(item.point);
      }
      renderPanel();
    }
    function collect() {
      const {paths} = editor.drawing(), selection = editor.selection();
      const result = [];
      paths.forEach((path,pi) => {
        if (!path.editable || path.removed) return;
        path.subs.forEach((source,si) => {
          if (source.nodes.length < 2 || (scope.value !== 'drawing' && (selection.pi !== pi || selection.si !== si))) return;
          const focus = scope.value === 'point' ? selection.focus : null;
          result.push({id:'p'+pi+'s'+si, pi, si, source, focus, accepted:[], candidates:[], suggestions:[]});
        });
      });
      return result;
    }
    function guard(target, planned = []) {
      const {paths} = editor.drawing();
      const subs = paths[target.pi].subs.slice();
      for (const update of planned) if (update.pi === target.pi) subs[update.si] = update.contour;
      return {obstacles: subs.filter((_,si) => si !== target.si)};
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
        const detail = reviewer.preview({action:item.action,index:indexMap.get(item.index)});
        if (!detail) return false;
        Object.assign(item,{before:detail.before, after:detail.after, point:detail.point});
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
    function addSuggestion(target,action,index,reason) {
      if (!Object.hasOwn(labels,action) || !Number.isInteger(index) || !matchesFocus({action,index},target.focus)) return;
      if (target.suggestions.some(item => item.index===index && item.action===action)) return;
      target.suggestions.push({target,action,index,reason:reason || reasons[action]});
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
      const hint = 'Reviewing ' + chosen.length + (chosen.length===1?' contour':' contours');
      baseMessage = hint + '…'; renderPanel();
      let completed = 0, totalBatches = 0;
      try {
        // Yield between outlines so large drawings can still be panned or cancelled.
        for (let i=0;i<chosen.length;i++) {
          if (!(i%8)) await new Promise(resolve => setTimeout(resolve,0));
          if (controller.signal.aborted) return;
          const target = chosen[i];
          const reviewer = geometry.createReviewer(target.source,guard(target));
          if (target.focus) {
            const actions = target.focus.type === 'segment' ? ['straighten'] : ['remove','smooth'];
            target.candidates = actions.map(action => reviewer.preview({action,index:target.focus.index})).filter(Boolean);
          } else {
            target.candidates = reviewer.candidates();
          }
          if (local) {
            for (const c of target.candidates) addSuggestion(target,c.action,c.index,reasons[c.action]);
          }
        }
        if (!local) {
          const batches = batchesOf(chosen.flatMap(piecesFor));
          totalBatches = batches.length;
          if (original && original !== thumbnailSource) {
            thumbnailSource = original;
            thumbnail = window.svgTraceAI.thumbnail(original).catch(() => null);
          }
          const image = original && await thumbnail;
          for (const batch of batches) {
            if (controller.signal.aborted) return;
            baseMessage = hint + (batches.length>1 ? ' · part '+(completed+1)+' of '+batches.length : '') + '…'; renderPanel();
            const body = {mode:'review',width:Math.ceil(vb[2]),height:Math.ceil(vb[3]),instruction,contours:batch.map(p => p.data)};
            if (image) body.image = image;
            const response = await fetch('/online-quote/svg-trace/ai',{
              method:'POST',signal:controller.signal,credentials:'same-origin',
              headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content},
              body:JSON.stringify(body),
            });
            const data = await response.json();
            if (controller.signal.aborted) return;
            if (!response.ok || !Array.isArray(data.proposals)) throw Error(data.error || 'AI review is unavailable.');
            const lookup = new Map(batch.map(p => [p.data.id,p]));
            for (const group of data.proposals) {
              const piece = lookup.get(group.id);
              if (!piece) continue;
              for (const edit of group.edits) {
                const index = piece.ids[edit.index];
                if (index >= piece.start && index < piece.end) addSuggestion(piece.target,edit.action,index,edit.reason);
              }
            }
            completed++;
          }
        }
        flight = null;
        finishReview(local ? 'Quick cleanup finished.' : '');
        if (local && !pending.length) { baseMessage = 'Quick cleanup found no points to change.'; renderPanel(); }
      } catch (error) {
        if (controller.signal.aborted) return;
        flight = null;
        finishReview((completed ? 'Reviewed '+completed+' of '+totalBatches+' parts. ' : '') +
          error.message + ' You can also use Quick cleanup.');
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
      if (updates.length) editor.commit(updates);
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
      updateControls();
      if (scope.selectedOptions[0]?.disabled) scope.value = 'drawing';
      baseMessage = 'Review the current paths and choose which changes to keep.';
      renderPanel();
    }
    function close() {
      clear(); panel.hidden = true; toggle.setAttribute('aria-expanded','false');
    }
    function captureDraft() {
      const edit = ({action,index,reason}) => ({action,index,reason});
      return {visible:!panel.hidden, scope:scope.value, instruction:$('instruction').value,
        message:baseMessage, interrupted:!!flight, cursor, appliedCount, skippedCount,
        targets:targets.filter(t => t.suggestions.length).map(t => ({
          pi:t.pi, si:t.si, focus:t.focus, original:t.accepted.length ? t.source : null,
          accepted:t.accepted.map(edit), suggestions:t.suggestions.map(edit),
        }))};
    }
    function restoreDraft(state) {
      if (!state || !Array.isArray(state.targets)) return;
      clear();
      scope.value = ['drawing','contour','point'].includes(state.scope) ? state.scope : 'drawing';
      $('instruction').value = state.instruction || '';
      appliedCount = state.appliedCount || 0; skippedCount = state.skippedCount || 0;
      const {paths} = editor.drawing();
      for (const item of state.targets) {
        const current = paths[item.pi]?.subs[item.si];
        if (!current || !Array.isArray(item.suggestions)) continue;
        const target = {id:'p'+item.pi+'s'+item.si, pi:item.pi, si:item.si, source:item.original || current,
          accepted:item.accepted || [], focus:item.focus, suggestions:[], candidates:[]};
        for (const s of item.suggestions) addSuggestion(target,s.action,s.index,s.reason);
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
