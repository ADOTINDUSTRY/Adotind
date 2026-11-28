(() => {
  'use strict';
  const root = document.querySelector('[data-letter3d]');
  if (!root) return;
  const find = name => root.querySelector(`[data-letter-${name}]`);
  const product = find('product'), text = find('text'), font = find('font'), colour = find('colour');
  const width = find('width'), height = find('height'), quantity = find('quantity');
  const preview = find('preview'), price = find('price'), tax = find('tax'), limits = find('limits');
  const send = find('send'), status = find('status');
  const stage = find('stage') || preview.parentElement;
  const viewport = preview.parentElement;
  const sceneButtons = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-scene]')] : [];
  const zoomButtons = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-zoom]')] : [];
  const zoomOutput = find('zoom-level'), reset = find('reset'), lights = find('lights'), back = find('back');
  const depth=find('depth'), boardShape=find('board-shape'), boardColour=find('board-colour'), boardCustom=find('board-custom'), boardMargin=find('board-margin'), boardOptions=find('board-options'), boardCustomLabel=find('board-custom-label'), priceScope=find('price-scope');
  const filmData=find('films'); let filmCatalog=[];
  try { const parsed=JSON.parse(filmData?.textContent || 'null'); if(Array.isArray(parsed?.colours)) filmCatalog=parsed.colours; } catch (_) {}
  const filmsByCode=new Map(filmCatalog.filter(item=>item && typeof item.code==='string' && /^#[0-9a-f]{6}$/i.test(item.hex||'') && Array.isArray(item.finishes)).map(item=>[item.code,item]));
  const threeContainer = find('three'), renderStatus = find('render-status');
  const cuttingSvg=find('cutting-svg'), cuttingStatus=find('cutting-status'), cuttingDimensions=find('cutting-dimensions');
  const cuttingInstructions=find('cutting-instructions'), exportDxf=find('export-dxf'), techViewButton=find('tech-view'), constructionData=find('construction');
  const cuttingZoomOutput=find('cutting-zoom-level');
  const cuttingZoomButtons=root.querySelectorAll ? [...root.querySelectorAll('[data-letter-cutting-zoom]')] : [];
  const cuttingEnabled=!!(cuttingSvg && cuttingStatus && exportDxf && constructionData);
  let construction=null, manufacturing=null, manufacturingSequence=0, manufacturingTimer=0, clipperPromise=null, technicalView=false;
  let cuttingZoom=1, cuttingCentreX=0, cuttingCentreY=0, cuttingBase=null, cuttingDrag=null;
  if (cuttingEnabled) { try { construction=JSON.parse(constructionData.textContent); } catch (_) { construction=null; } }
  let threeRenderer = null, threeInit = null, threeTimer = 0, threeGeneration = 0, threeUnavailable = false;
  // The legacy fields remain as a compatibility mirror for older saved drafts.
  const lineSets = root.querySelectorAll ? [...root.querySelectorAll('[data-letter-line]')] : [];
  const requiredLineFields = ['text','font','colour','side_colour','x','y','rotation'];
  const lineFields = [...requiredLineFields, 'front_finish', 'side_finish', 'front_film_code', 'side_film_code'];
  const lineHook = key => ({front_film_code:'front-film',side_film_code:'side-film'})[key] || key.replace(/_/g, '-');
  const lineControls = lineSets.map((fieldset, index) => ({fieldset, index,
    inputs:Object.fromEntries(lineFields.map(key => [key, fieldset.querySelector(`[data-letter-line-${lineHook(key)}]`)])),
    sliders:Object.fromEntries(['x','y','rotation'].map(key => [key, fieldset.querySelector(`[data-letter-line-slider="${key}"]`)])),
    remove:fieldset.querySelector('[data-letter-remove-line]'),
    sideAutoButton:fieldset.querySelector('[data-letter-line-side-auto]'), sideAuto:true
  }));
  const addLine = find('add-line');
  const hasLines = lineControls.length > 0 && lineControls.every(line => requiredLineFields.every(key => line.inputs[key]));
  let lineCount = 1;
  const fields = {product, text, font, colour, width, height, quantity};
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value]));
  const optionFields=Object.fromEntries(Object.entries({depth,boardShape,boardColour,boardCustom,boardMargin}).filter(([,element])=>!!element));
  const optionDefaults=Object.fromEntries(Object.entries(optionFields).map(([key,element])=>[key,element.value]));
  const storageKey = 'adotind.letter3d.design.v1';
  let timer = 0, generation = 0, estimate = null, sending = false, requestKey = '';
  let scene = 'studio', zoom = 1, lightsOn = true, backVisible = true, cuttingStarted = false;
  const clamp = (value, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : 0;
  // Three.js shades in linear light. Convert back to sRGB for the native color
  // input so the automatic swatch matches the existing visual appearance.
  function automaticSideColour(face) {
    if (!/^#[0-9a-f]{6}$/i.test(face)) face = '#e6e9ed';
    const shade = channel => {
      const s = parseInt(channel, 16) / 255;
      const linear = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      const shaded = linear * 0.55;
      const result = shaded <= 0.0031308 ? 12.92 * shaded : 1.055 * Math.pow(shaded, 1 / 2.4) - 0.055;
      return Math.round(result * 255).toString(16).padStart(2, '0');
    };
    return '#' + shade(face.slice(1,3)) + shade(face.slice(3,5)) + shade(face.slice(5,7));
  }
  function readBackboard() {
    if (!boardShape || boardShape.value === 'none') return {shape:'none'};
    if (boardShape.value !== 'rectangle' || !boardColour || !boardMargin) return null;
    const chosen=boardColour.value==='custom' ? boardCustom?.value : boardColour.value;
    const margin=boardMargin.value.trim()==='' ? NaN : Number(boardMargin.value);
    if (!(chosen==='clear' || /^#[0-9a-f]{6}$/i.test(chosen||'')) || !Number.isFinite(margin) || margin<0 || margin>300) return null;
    return {shape:'rectangle',colour:chosen.toLowerCase(),margin_mm:margin};
  }
  function syncBoardControls() {
    if(boardOptions) boardOptions.hidden=!boardShape || boardShape.value!=='rectangle';
    if(boardCustomLabel) boardCustomLabel.hidden=!boardColour || boardColour.value!=='custom';
  }
  function syncFilmFinish(line,side) {
    const code=line.inputs[side+'_film_code']?.value || '', selector=line.inputs[side+'_finish'];
    const film=filmsByCode.get(code);
    if(!selector) return;
    if(selector.options) for(const option of selector.options) if(option.value) option.disabled=!!film && !film.finishes.includes(option.value);
    if(film && selector.value && !film.finishes.includes(selector.value)) selector.value='';
  }
  function setLine(index, data) {
    const control = lineControls[index]; if (!control) return;
    const values = {text:'', font:'sans', colour:'#e6e9ed', side_colour:null, front_finish:'', side_finish:'', front_film_code:'', side_film_code:'', x:0, y:0, rotation:0, ...data};
    values.text = String(values.text).replace(/[\r\n]/g, '').slice(0,200);
    if (!['sans','serif','script'].includes(values.font)) values.font = 'sans';
    if (!/^#[0-9a-f]{6}$/i.test(values.colour)) values.colour = '#e6e9ed';
    control.sideAuto = !/^#[0-9a-f]{6}$/i.test(values.side_colour || '');
    values.side_colour = control.sideAuto ? automaticSideColour(values.colour) : values.side_colour;
    values.x=clamp(values.x,-200,200); values.y=clamp(values.y,-200,200); values.rotation=clamp(values.rotation,-180,180);
    for (const key of ['front_finish','side_finish']) if (!['matt','gloss'].includes(values[key])) values[key] = '';
    for (const side of ['front','side']) { const code=side+'_film_code', colourKey=side==='front'?'colour':'side_colour'; const film=filmsByCode.get(values[code]); if(!film || film.hex.toLowerCase() !== String(values[colourKey]).toLowerCase()) values[code]=''; }
    for (const key of lineFields) if (control.inputs[key]) control.inputs[key].value = String(values[key]);
    for (const key of ['x','y','rotation']) if (control.sliders[key]) control.sliders[key].value=String(values[key]);
    syncFilmFinish(control,'front');syncFilmFinish(control,'side');
  }
  function readLines() {
    if (!hasLines) return null;
    return lineControls.slice(0,lineCount).map(({inputs,sideAuto}) => ({text:inputs.text.value, font:inputs.font.value, colour:inputs.colour.value, side_colour:sideAuto ? null : inputs.side_colour.value,
      x:clamp(inputs.x.value,-200,200), y:clamp(inputs.y.value,-200,200), rotation:clamp(inputs.rotation.value,-180,180),
      ...(inputs.front_finish ? {front_finish:inputs.front_finish.value || null} : {}),
      ...(inputs.side_finish ? {side_finish:inputs.side_finish.value || null} : {}),
      ...(inputs.front_film_code ? {front_film_code:inputs.front_film_code.value || null} : {}),
      ...(inputs.side_film_code ? {side_film_code:inputs.side_film_code.value || null} : {})}));
  }
  function syncLines() {
    if (!hasLines) return;
    lineControls.forEach(({fieldset,remove,sideAutoButton,sideAuto},index) => {fieldset.hidden=index>=lineCount; if(remove) remove.disabled=lineCount===1; if(sideAutoButton) sideAutoButton.setAttribute('aria-pressed',String(sideAuto));});
    if (addLine) addLine.disabled=lineCount>=lineControls.length;
    const lines=readLines(); text.value=lines.map(line=>line.text).join('\n'); font.value=lines[0].font; colour.value=lines[0].colour;
  }
  function fromLegacy() {
    if (!hasLines) return;
    const lines=text.value.replace(/\r\n?/g,'\n').split('\n').slice(0,lineControls.length);
    lineCount=Math.max(1,lines.length);
    lines.forEach((value,index)=>setLine(index,{text:value,font:font.value,colour:colour.value}));
    syncLines();
  }

  // Customer contact details, estimates and request tokens deliberately do not persist.
  function saveDesign() {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(storageKey, JSON.stringify({
        version:1, fields:Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value])), lines:hasLines ? readLines() : undefined, options:Object.fromEntries(Object.entries(optionFields).map(([key,element])=>[key,element.value])), scene, zoom, lightsOn, backVisible
      }));
    } catch (_) { /* The designer still works when storage is unavailable. */ }
  }
  function restoreDesign() {
    try {
      if (typeof sessionStorage === 'undefined') return false;
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!stored || stored.version !== 1 || !stored.fields || typeof stored.fields !== 'object') return false;
      for (const [key, element] of Object.entries(fields)) {
        if (typeof stored.fields[key] === 'string' && stored.fields[key].length <= 1000) element.value = stored.fields[key];
      }
      if (hasLines && Array.isArray(stored.lines) && stored.lines.length > 0 && stored.lines.length <= lineControls.length) {
        lineCount=stored.lines.length; stored.lines.forEach((line,index)=>setLine(index, line && typeof line==='object' ? line : {})); syncLines();
      } else fromLegacy();
      if(stored.options && typeof stored.options==='object') for(const [key,element] of Object.entries(optionFields)) if(typeof stored.options[key]==='string' && stored.options[key].length<=100) element.value=stored.options[key];
      if(typeof stored.backVisible==='boolean') backVisible=stored.backVisible;
      if (['studio','brick','concrete'].includes(stored.scene)) scene = stored.scene;
      if (typeof stored.lightsOn === 'boolean') lightsOn = stored.lightsOn;
      if (typeof stored.zoom === 'number' && Number.isFinite(stored.zoom)) zoom = Math.max(.5, Math.min(3, stored.zoom));
      return true;
    } catch (_) { return false; }
  }
  const payload = () => ({csrf:root.dataset.csrf, product_id:product.value, text:text.value, font:font.value,
    colour:colour.value, width_mm:width.value, height_mm:height.value, quantity:quantity.value,
    ...(construction && Number.isInteger(construction.version) ? {construction_revision:construction.version} : {}),
    ...(depth ? {letter_depth_mm:Number(depth.value)} : {}),
    ...(boardShape ? {backboard:readBackboard() || {shape:'rectangle',colour:boardColour?.value,margin_mm:null}} : {}),
    ...(hasLines ? {lines:readLines()} : {})});
  function displayConstruction(settings) {
    if (!settings || !settings.front || !settings.side || !settings.back) return;
    const display=(key,value)=>{const element=find('construction-'+key); if(element) element.textContent=value;};
    const front=settings.front, side=settings.side, back=settings.back;
    display('front', front.thickness_mm+' mm '+front.material+' face. The outside-cut groove leaves 0.8 mm at the acrylic edge.');
    display('side', side.thickness_mm+' mm '+side.material+' side, groove '+side.acrylic_groove_depth_mm+' mm deep, nominal bit '+(side.groove_width_mm ?? 'not set')+' mm.');
    display('back', back.thickness_mm+' mm '+back.material+' back.');
    display('film', settings.front_and_side_film+' for the front and sides.');
  }
  async function readConstruction() {
    const response=await fetch('/online-quote/letters3d/construction',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok || !data.construction || !Number.isInteger(data.construction.version)) throw new Error(data.error || 'Construction settings are unavailable.');
    return data.construction;
  }
  function loadClipper() {
    if (globalThis.ClipperLib) return Promise.resolve(globalThis.ClipperLib);
    if (!clipperPromise) clipperPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script'); script.src=root.dataset.clipperSrc; script.async=true;
      script.onload=()=>globalThis.ClipperLib ? resolve(globalThis.ClipperLib) : reject(new Error('Cutting geometry engine unavailable.'));
      script.onerror=()=>reject(new Error('Cutting geometry engine unavailable.')); document.head.appendChild(script);
    }).catch(error=>{clipperPromise=null;throw error;});
    return clipperPromise;
  }
  function updateCuttingViewBox() {
    if(!cuttingBase || !cuttingSvg) return;
    const w=cuttingBase.width/cuttingZoom, h=cuttingBase.height/cuttingZoom;
    cuttingSvg.setAttribute('viewBox',[cuttingCentreX-w/2,cuttingCentreY-h/2,w,h].join(' '));
    if(cuttingZoomOutput) cuttingZoomOutput.textContent=Math.round(cuttingZoom*100)+'%';
  }
  function fitCutting() {
    if(!cuttingBase) return;
    cuttingZoom=1;cuttingCentreX=cuttingBase.x+cuttingBase.width/2;cuttingCentreY=cuttingBase.y+cuttingBase.height/2;updateCuttingViewBox();
  }
  function drawCutting(plan) {
    const ns='http://www.w3.org/2000/svg';
    cuttingSvg.textContent='';
    const makePath=(contours,stroke,fill)=>{
      const element=document.createElementNS(ns,'path');
      const d=contours.map(points=>points.map((p,index)=>(index?'L':'M')+p.x.toFixed(3)+' '+(-p.y).toFixed(3)).join(' ')+' Z').join(' ');
      element.setAttribute('d',d);element.setAttribute('stroke',stroke);element.setAttribute('fill',fill);
      element.setAttribute('fill-rule','evenodd');element.setAttribute('stroke-width','1.8');element.setAttribute('vector-effect','non-scaling-stroke');
      cuttingSvg.appendChild(element);
    };
    makePath(plan.face,'#235bb3','#dae9fb');
    makePath(plan.groove,'#c75b00','none');
    const pad=Math.max(plan.bounds_mm.width,plan.bounds_mm.height)*.05+1;
    cuttingBase={x:-pad,y:-plan.bounds_mm.height-pad,width:plan.bounds_mm.width+2*pad,height:plan.bounds_mm.height+2*pad};
    cuttingSvg.removeAttribute('hidden');fitCutting();
  }
  function invalidateCutting(message) {
    manufacturing=null; cuttingBase=null; ++manufacturingSequence;clearTimeout(manufacturingTimer);
    if(exportDxf)exportDxf.disabled=true;
    if(techViewButton) { techViewButton.disabled=true;techViewButton.setAttribute('aria-pressed','false');techViewButton.textContent='Inspect grooved acrylic in 3D'; }
    technicalView=false;if(lights)lights.disabled=false;if(back)back.disabled=true;
    if(cuttingSvg)cuttingSvg.setAttribute('hidden','');
    if(cuttingDimensions)cuttingDimensions.textContent='';
    if(cuttingInstructions)cuttingInstructions.textContent='';
    if(cuttingStatus)cuttingStatus.textContent=message;
    height.value='';
  }
  function scheduleCutting() {
    if(!cuttingEnabled) return;
    cuttingStarted=true;
    invalidateCutting('Preparing cutting preview…');
    const current=manufacturingSequence;
    if(!width.value || !text.value.trim()) { cuttingStatus.textContent='Enter a finished width and lettering to prepare the cutting preview.'; return; }
    manufacturingTimer=setTimeout(async()=>{
      try {
        const updated=await readConstruction();
        if(current!==manufacturingSequence)return;
        construction=updated;displayConstruction(construction);
        const [geometryModule,rendererModule,clipper]=await Promise.all([import(root.dataset.geometrySrc),import(root.dataset.rendererSrc),loadClipper()]);
        const lines=readLines(),fonts=await rendererModule.loadLetter3DOutlineFonts(lines);
        if(current!==manufacturingSequence)return;
        const settings={overhang_reference:construction.front.overhang_reference,overhang_mm:construction.front.offset_outside_mm,
          side_thickness_mm:construction.side.thickness_mm,groove_width_mm:construction.side.groove_width_mm,
          groove_depth_mm:construction.side.acrylic_groove_depth_mm,face_thickness_mm:construction.front.thickness_mm};
        const plan=geometryModule.buildLetter3DManufacturing({lines,width_mm:width.value,settings,fonts,clipper});
        if(current!==manufacturingSequence)return;
        manufacturing={plan,revision:construction.version,clipper};
        height.value=String(Number(plan.bounds_mm.height.toFixed(3)));
        drawCutting(plan);
        if(cuttingDimensions) {
          cuttingDimensions.textContent='Finished face: '+plan.bounds_mm.width.toFixed(1)+' × '+plan.bounds_mm.height.toFixed(1)+' mm. Groove reference: 2 mm from acrylic edge; outside cut leaves 0.8 mm.';
        }
        cuttingStatus.textContent='Cutting contours ready for shop review.';
        if(cuttingInstructions)cuttingInstructions.textContent='In Aspire: use a 1.2 mm bit at 1.2 mm depth. Cut toward the acrylic edge: outside outer references, inside opening references. Check every toolpath and mirroring for the back.';
        exportDxf.disabled=false;if(techViewButton)techViewButton.disabled=threeUnavailable || !threeRenderer || typeof threeRenderer.updateManufacturing!=='function';saveDesign();schedule3D();scheduleEstimate();
      } catch(error) {
        if(current!==manufacturingSequence)return;
        invalidateCutting(error?.message || 'Could not prepare the cutting preview.');
        price.textContent='Cutting preview needs review';tax.textContent='';send.disabled=true;
      }
    },300);
  }
  if(cuttingEnabled) {
    displayConstruction(construction);
    async function refreshCuttingIfChanged() {
      const selected=manufacturing;
      if(!selected)return false;
      try {
        const latest=await readConstruction();
        if(manufacturing!==selected)return false;
        if(latest.version!==selected.revision) {
          construction=latest;displayConstruction(latest);changed();
          cuttingStatus.textContent='Shop construction settings changed. Preparing the updated preview.';
          return false;
        }
        return true;
      } catch (_) {
        if(manufacturing===selected){invalidateCutting('Could not verify current shop settings. Re-enter the width or refresh to try again.');price.textContent='Cutting preview needs review';tax.textContent='';send.disabled=true;}
        return false;
      }
    }
    techViewButton?.addEventListener('click',async()=>{
      if(!manufacturing || !threeRenderer || typeof threeRenderer.updateManufacturing!=='function') return;
      const selected=manufacturing;techViewButton.disabled=true;
      try {
        if(!await refreshCuttingIfChanged() || manufacturing!==selected)return;
        technicalView=!technicalView;
        techViewButton.setAttribute('aria-pressed',String(technicalView));
        techViewButton.textContent=technicalView?'Return to sign preview':'Inspect grooved acrylic in 3D';
        if(lights)lights.disabled=technicalView;
        if(back)back.disabled=technicalView;
        schedule3D();
        if(technicalView) stage.scrollIntoView?.({behavior:'smooth',block:'center'});
      } finally {if(manufacturing===selected)techViewButton.disabled=false;}
    });
    const cuttingDetails=find('cutting');
    cuttingDetails?.addEventListener('toggle',()=>{if(cuttingDetails.open)refreshCuttingIfChanged();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCuttingIfChanged();});
    globalThis.addEventListener?.('focus',()=>{if(document.visibilityState==='visible')refreshCuttingIfChanged();});
    for(const button of cuttingZoomButtons) button.addEventListener('click',()=>{
      if(!cuttingBase)return;
      if(button.dataset.letterCuttingZoom==='fit') {fitCutting();return;}
      const factor=button.dataset.letterCuttingZoom==='in'?1.4:1/1.4;
      cuttingZoom=Math.max(1,Math.min(40,cuttingZoom*factor));updateCuttingViewBox();
    });
    cuttingSvg.addEventListener('pointerdown',event=>{
      if(!cuttingBase || (event.pointerType!=='touch' && event.button!==0))return;
      cuttingDrag={id:event.pointerId,x:event.clientX,y:event.clientY};
      try{cuttingSvg.setPointerCapture(event.pointerId);}catch(_){}
    });
    cuttingSvg.addEventListener('pointermove',event=>{
      if(!cuttingDrag || cuttingDrag.id!==event.pointerId || !cuttingBase)return;
      const rect=cuttingSvg.getBoundingClientRect();
      if(rect.width && rect.height){cuttingCentreX-=(event.clientX-cuttingDrag.x)*(cuttingBase.width/cuttingZoom)/rect.width;cuttingCentreY-=(event.clientY-cuttingDrag.y)*(cuttingBase.height/cuttingZoom)/rect.height;}
      cuttingDrag.x=event.clientX;cuttingDrag.y=event.clientY;updateCuttingViewBox();
      if(event.cancelable)event.preventDefault();
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture']) cuttingSvg.addEventListener(type,event=>{if(cuttingDrag?.id===event.pointerId)cuttingDrag=null;});
    exportDxf.addEventListener('click',async()=>{
      if(!manufacturing)return;
      const selected=manufacturing;exportDxf.disabled=true;
      try {
        const latest=await readConstruction();
        if(!manufacturing || manufacturing!==selected)return;
        if(latest.version!==selected.revision) { construction=latest;displayConstruction(latest);cuttingStatus.textContent='Shop construction settings changed. Preparing the updated preview.';changed();return; }
        const module=await import(root.dataset.dxfSrc);
        if(manufacturing!==selected)return;
        const format=find('export-format')?.value || 'dxf';
        const result=module.buildLetter3dDxf(selected.plan,format);
        if(cuttingInstructions)cuttingInstructions.textContent=result.instructions.join(' ');
        const objectUrl=URL.createObjectURL(new Blob([result[format]],{type:format==='pdf'?'application/pdf':'application/dxf'}));
        const link=document.createElement('a');link.href=objectUrl;link.download='3d-letter-face-and-groove.'+format;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);
        cuttingStatus.textContent=format.toUpperCase()+' cutting vectors downloaded.';
      } catch(error){cuttingStatus.textContent=error?.message || 'Could not export the cutting vectors.';}
      finally {if(manufacturing===selected)exportDxf.disabled=false;}
    });
  }
  function show2D(message) {
    if (viewport.dataset) viewport.dataset.render = 'flat';
    if (renderStatus) renderStatus.textContent = message || 'Illustrative 2D preview';
  }
  function schedule3D(keepView = false) {
    if (!threeContainer || !hasLines || root.hidden || threeUnavailable) return;
    const current = ++threeGeneration;
    // Never leave an older 3D design visible while the new geometry is being built.
    if (!keepView) show2D('Updating 3D preview…');
    clearTimeout(threeTimer);
    threeTimer = setTimeout(async () => {
      try {
        if (!threeInit) {
          threeInit = import(root.dataset.rendererSrc || '/public/assets/js/letter3d-renderer.js').then(module => module.createLetter3DRenderer(threeContainer, {
            onUnavailable: () => { threeUnavailable = true; ++threeGeneration; show2D('3D preview unavailable on this device; showing 2D.'); }
          })).catch(error => { threeUnavailable = true; throw error; });
        }
        const renderer = await threeInit;
        if (current !== threeGeneration) return;
        threeRenderer = renderer;
        if (!keepView) { renderer.resize(); renderer.setZoom(zoom); }
        renderer.setLights?.(lightsOn);
        const selected=manufacturing;
        const board=readBackboard();
        const assembled=!!(selected && board && depth && construction?.back && typeof renderer.updateSign==='function');
        const result = technicalView && selected ? await renderer.updateManufacturing(selected.plan,readLines(),selected.clipper) : assembled ? await renderer.updateSign(selected.plan,readLines(),selected.clipper,{totalDepthMm:Number(depth.value),backThicknessMm:construction.back.thickness_mm,backVisible,backboard:board,keepView}) : await renderer.update(readLines(),keepView);
        if (current !== threeGeneration || (result && result.stale)) return;
        if (viewport.dataset) viewport.dataset.render = 'three';
        if(back)back.disabled=technicalView || !assembled;
        if (renderStatus) renderStatus.textContent = technicalView ? 'Acrylic inspection: drag to see rear groove' : assembled ? '3D construction preview · drag to rotate' : 'Basic preview; adjust the design to see construction details';
        if (techViewButton && manufacturing) techViewButton.disabled = typeof renderer.updateManufacturing !== 'function';
      } catch (_) {
        if (current !== threeGeneration) return;
        show2D(threeUnavailable ? '3D preview unavailable on this device; showing 2D.' : '3D preview unavailable for this text; showing 2D.');
      }
    }, 150);
  }
  function paintScene() {
    if (stage.dataset) stage.dataset.scene = scene;
    if (viewport.dataset) viewport.dataset.lights = lightsOn ? 'on' : 'off';
    if (lights) lights.checked = lightsOn;
    for (const button of sceneButtons) button.setAttribute('aria-pressed', String(button.dataset.letterScene === scene));
  }
  function paintScale() {
    const availableWidth = (viewport.clientWidth || 0) - 50;
    const availableHeight = (viewport.clientHeight || 0) - 50;
    // Include rotated and translated lines in the fit, then recenter their union.
    // Measuring with the previous zoom removed prevents scaling feedback loops.
    preview.style.transform = 'none';
    let fullWidth = preview.scrollWidth, fullHeight = preview.scrollHeight, dx=0, dy=0;
    if (hasLines && preview.children && preview.children.length && typeof preview.getBoundingClientRect==='function') {
      const base=preview.getBoundingClientRect();
      const boxes=[...preview.children].map(child=>child.getBoundingClientRect()).filter(box=>box.width || box.height);
      if (boxes.length) {
        const left=Math.min(...boxes.map(box=>box.left)), right=Math.max(...boxes.map(box=>box.right));
        const top=Math.min(...boxes.map(box=>box.top)), bottom=Math.max(...boxes.map(box=>box.bottom));
        fullWidth=Math.max(1,right-left); fullHeight=Math.max(1,bottom-top);
        dx=(base.left+base.right-left-right)/2; dy=(base.top+base.bottom-top-bottom)/2;
      }
    }
    let fit = availableWidth > 0 && fullWidth > 0 ? Math.min(1, availableWidth / fullWidth) : 1;
    if (availableHeight > 0 && fullHeight > 0) fit = Math.min(fit, availableHeight / fullHeight);
    const scale=fit*zoom; preview.style.transform = `translate(${dx*scale}px, ${dy*scale}px) scale(${scale})`;
    if (zoomOutput) zoomOutput.textContent = `${Math.round(zoom * 100)}%`;
  }
  function paint() {
    const fontStyles={sans:'Letter3DSans, Arial, sans-serif', serif:'Letter3DSerif, Georgia, serif', script:'Letter3DScript, cursive'};
    if (hasLines && typeof document.createElement==='function' && typeof preview.appendChild==='function') {
      preview.textContent = '';
      readLines().forEach(line=>{
        const item=document.createElement('span'); item.className='letter3d-preview-line';
        item.textContent=line.text || '\u00a0'; item.style.display='block'; item.style.whiteSpace='pre';
        item.style.width='max-content'; item.style.marginInline='auto';
        item.style.color=line.colour; item.style.fontFamily=fontStyles[line.font] || fontStyles.sans;
        const side=line.side_colour || automaticSideColour(line.colour);
        item.style.textShadow=`1px 1px ${side},2px 2px ${side},3px 3px ${side},4px 4px 7px #0009` + (lightsOn ? `,0 0 8px ${line.colour},0 0 18px ${line.colour}` : '');
        item.style.transform=`translate(${line.x}%, ${line.y}%) rotate(${line.rotation}deg)`;
        preview.appendChild(item);
      });
    } else {
      preview.textContent = text.value || 'Your sign'; preview.style.color = colour.value;
      preview.style.fontFamily = fontStyles[font.value] || 'sans-serif';
    }
    requestAnimationFrame(paintScale);
    schedule3D();
    if(cuttingEnabled && !root.hidden && !cuttingStarted && width.value && text.value.trim()) scheduleCutting();
    const selected = product.selectedOptions[0];
    limits.textContent = product.value && selected ? `Allowed size: ${selected.dataset.minWidth}–${selected.dataset.maxWidth} mm wide × ${selected.dataset.minHeight}–${selected.dataset.maxHeight} mm high. Up to ${selected.dataset.maxChars} characters and ${selected.dataset.maxQuantity} signs.` : '';
  }
  function changed(appearanceOnly = false) {
    const holdPriceLayout = appearanceOnly === true && product.value && height.value && (estimate || price.parentElement?.hasAttribute?.('data-updating'));
    generation++; clearTimeout(timer); estimate = null; requestKey = '';
    send.disabled = true; status.textContent = '';
    price.parentElement?.toggleAttribute?.('data-updating', Boolean(holdPriceLayout));
    if (!holdPriceLayout) {
      price.textContent = 'Enter an option and size'; tax.textContent = '';
      if(priceScope)priceScope.textContent='';
    }
    if (appearanceOnly === true && viewport.dataset?.render === 'three' && !technicalView) {
      schedule3D(true);
      saveDesign();
      if (manufacturing || !cuttingEnabled) scheduleEstimate();
      return;
    }
    paint(); saveDesign();
    if (cuttingEnabled) { scheduleCutting(); return; }
    scheduleEstimate();
  }
  function scheduleEstimate() {
    if(boardShape && !readBackboard()) {price.textContent='Check the backboard settings';send.disabled=true;return;}
    if (!product.value || !text.value.trim() || !width.value || !height.value || !quantity.value) return;
    const current = generation;
    timer = setTimeout(async () => {
      if (!price.parentElement?.hasAttribute?.('data-updating')) price.textContent = 'Calculating…';
      try {
        const response = await fetch('/online-quote/letters3d/estimate', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload())});
        const data = await response.json();
        if (current !== generation) return;
        if (!response.ok || !data.estimate || typeof data.request_key !== 'string') throw new Error(data.error || 'Could not calculate this design.');
        estimate = data.estimate;
        price.parentElement?.removeAttribute?.('data-updating');
        requestKey = data.request_key;
        price.textContent = `€${Number(estimate.total).toFixed(2)}`;
        tax.textContent = `Includes ${estimate.vat_percent}% VAT. Subject to artwork and shop review.`;
        if(priceScope)priceScope.textContent = estimate.pricing_review_required ? estimate.pricing_note : '';
        send.disabled = sending;
      } catch (error) {
        if (current !== generation) return;
        price.parentElement?.removeAttribute?.('data-updating');
        price.textContent = error.message || 'Estimate unavailable';
        tax.textContent=''; if(priceScope)priceScope.textContent='';
      }
    }, 350);
  }
  function setZoom(value) { zoom = Math.max(.5, Math.min(3, value)); paintScale(); if (threeRenderer) threeRenderer.setZoom(zoom); saveDesign(); }
  lights?.addEventListener('change', () => {
    lightsOn = !!lights.checked;
    paintScene();
    if (threeRenderer && viewport.dataset?.render === 'three') {
      threeRenderer.setLights(lightsOn);
    } else {
      paint();
    }
    saveDesign();
  });
  back?.addEventListener('change',()=>{backVisible=!!back.checked;threeRenderer?.setBackVisible?.(backVisible);saveDesign();});
  Object.values(optionFields).forEach(el=>el.addEventListener('input',()=>{syncBoardControls();changed(el === depth);}));
  for (const button of sceneButtons) button.addEventListener('click', () => {
    if (!['studio','brick','concrete'].includes(button.dataset.letterScene)) return;
    scene = button.dataset.letterScene; paintScene(); saveDesign();
  });
  for (const button of zoomButtons) button.addEventListener('click', () => {
    if (button.dataset.letterZoom === 'in') setZoom(zoom * 1.2);
    if (button.dataset.letterZoom === 'out') setZoom(zoom / 1.2);
    if (button.dataset.letterZoom === 'fit') { setZoom(1); threeRenderer?.resetOrbit?.(); }
  });
  // Turn only the dimensional preview. Track every touch pointer so a second
  // finger cancels orbit immediately and remains available for pinch zoom.
  const touchPointers = new Set();
  let orbitDrag = null;
  function stopOrbit(pointerId) {
    if (!orbitDrag || (pointerId != null && orbitDrag.id !== pointerId)) return;
    orbitDrag = null;
    viewport.classList?.remove('is-orbiting');
  }
  viewport.addEventListener?.('pointerdown', event => {
    if (event.pointerType === 'touch') touchPointers.add(event.pointerId);
    if (touchPointers.size > 1) { stopOrbit(); return; }
    if (viewport.dataset?.render !== 'three' || !threeRenderer || typeof threeRenderer.orbitBy !== 'function') return;
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    orbitDrag = {id:event.pointerId, x:event.clientX, y:event.clientY};
    viewport.classList?.add('is-orbiting');
    try { viewport.setPointerCapture?.(event.pointerId); } catch (_) { /* Capture can fail if a pointer was cancelled. */ }
  });
  viewport.addEventListener?.('pointermove', event => {
    if (!orbitDrag || orbitDrag.id !== event.pointerId || touchPointers.size > 1 || viewport.dataset?.render !== 'three') return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { stopOrbit(event.pointerId); return; }
    const dx = event.clientX - orbitDrag.x, dy = event.clientY - orbitDrag.y;
    orbitDrag.x = event.clientX; orbitDrag.y = event.clientY;
    if (dx || dy) threeRenderer?.orbitBy(dx, dy);
    if (event.cancelable) event.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener?.(type, event => {
    if (event.pointerType === 'touch' || touchPointers.has(event.pointerId)) touchPointers.delete(event.pointerId);
    stopOrbit(event.pointerId);
  });
  viewport.addEventListener?.('keydown', event => {
    if (viewport.dataset?.render !== 'three' || !threeRenderer || typeof threeRenderer.orbitBy !== 'function') return;
    const movement = {ArrowLeft:[-18,0], ArrowRight:[18,0], ArrowUp:[0,-18], ArrowDown:[0,18]}[event.key];
    if (!movement) return;
    event.preventDefault(); threeRenderer.orbitBy(...movement);
  });
  // Zoom affects only the preview and never changes the quoted dimensions.
  viewport.addEventListener?.('wheel', event => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, {passive:false});
  let pinch = null;
  viewport.addEventListener?.('touchstart', event => {
    if (event.touches.length !== 2) { pinch = null; return; }
    pinch = {distance:Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY), zoom};
  }, {passive:true});
  viewport.addEventListener?.('touchmove', event => {
    if (!pinch || event.touches.length !== 2 || !pinch.distance) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const distance = Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY);
    setZoom(pinch.zoom * distance / pinch.distance);
  }, {passive:false});
  viewport.addEventListener?.('touchend', event => { pinch = null; if (!event.touches.length) { touchPointers.clear(); stopOrbit(); } }, {passive:true});
  viewport.addEventListener?.('touchcancel', () => { pinch = null; touchPointers.clear(); stopOrbit(); }, {passive:true});
  reset?.addEventListener('click', () => {
    if (sending) return;
    for (const [key, element] of Object.entries(fields)) element.value = defaults[key];
    for (const [key, element] of Object.entries(optionFields)) element.value=optionDefaults[key];
    backVisible=true;if(back)back.checked=true;syncBoardControls();
    fromLegacy(); scene = 'studio'; zoom = 1; threeRenderer?.resetOrbit?.(); lightsOn = true; threeRenderer?.setLights?.(lightsOn); paintScene(); changed();
  });
  Object.values(fields).forEach(el => el.addEventListener('input', changed));
  if (hasLines) {
    lineControls.forEach((line,index) => {
      for (const key of lineFields) line.inputs[key]?.addEventListener('input', () => {
        if(key==='front_film_code' || key==='side_film_code') {
          const side=key==='front_film_code'?'front':'side', film=filmsByCode.get(line.inputs[key].value);
          if(film) {line.inputs[side==='front'?'colour':'side_colour'].value=film.hex;if(side==='side')line.sideAuto=false;}
          syncFilmFinish(line,side);
        }
        if(key==='colour' && line.inputs.front_film_code) {line.inputs.front_film_code.value='';syncFilmFinish(line,'front');}
        if (key==='side_colour') {line.sideAuto=false;if(line.inputs.side_film_code)line.inputs.side_film_code.value='';syncFilmFinish(line,'side');}
        if (key==='colour' && line.sideAuto) line.inputs.side_colour.value=automaticSideColour(line.inputs.colour.value);
        if(key==='front_film_code' && line.sideAuto)line.inputs.side_colour.value=automaticSideColour(line.inputs.colour.value);
        if (['x','y','rotation'].includes(key)) {
          const max=key==='rotation'?180:200, raw=line.inputs[key].value, value=clamp(raw,-max,max);
          // Keep a typed out-of-range value in sync with the actual preview and quote.
          if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw)!==value) line.inputs[key].value=String(value);
          if (line.sliders[key]) line.sliders[key].value=String(value);
        }
        syncLines(); changed(['colour','side_colour','front_film_code','side_film_code','front_finish','side_finish'].includes(key));
      });
      for (const key of ['x','y','rotation']) line.inputs[key].addEventListener('blur', () => {
        const max=key==='rotation'?180:200, value=clamp(line.inputs[key].value,-max,max);
        line.inputs[key].value=String(value); if (line.sliders[key]) line.sliders[key].value=String(value);
      });
      for (const key of ['x','y','rotation']) line.sliders[key]?.addEventListener('input', () => {
        line.inputs[key].value=line.sliders[key].value; syncLines(); changed();
      });
      line.sideAutoButton?.addEventListener('click', () => {
        if (sending) return;
        line.sideAuto=true; line.inputs.side_colour.value=automaticSideColour(line.inputs.colour.value);
        if(line.inputs.side_film_code)line.inputs.side_film_code.value='';syncFilmFinish(line,'side');
        syncLines(); changed(true);
      });
      line.remove?.addEventListener('click', () => {
        if (sending || lineCount<=1 || index>=lineCount) return;
        const values=readLines(); values.splice(index,1); lineCount=values.length;
        values.forEach((value,i)=>setLine(i,value)); syncLines(); changed();
      });
    });
    addLine?.addEventListener('click', () => {
      if (sending || lineCount>=lineControls.length) return;
      const last=readLines()[lineCount-1]; setLine(lineCount,{font:last.font,colour:last.colour,side_colour:last.side_colour,front_finish:last.front_finish,side_finish:last.side_finish,front_film_code:last.front_film_code,side_film_code:last.side_film_code}); lineCount++;
      syncLines(); changed(); lineControls[lineCount-1].inputs.text.focus?.();
    });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    if (root.hidden) return;
    if (!threeRenderer && !threeUnavailable) paint();
    else paintScale();
  }).observe(viewport);
  send.addEventListener('click', async () => {
    if (!estimate || sending) return;
    const name = find('name'), email = find('email'), phone = find('phone');
    if (!name.value.trim() || !email.value.trim() || !email.checkValidity() || !phone.value.trim()) {
      status.textContent = 'Enter your name, a valid email and phone number.'; return;
    }
    const current = generation;
    const controls = [product,text,font,colour,width,height,quantity,name,email,phone,...Object.values(optionFields),...(hasLines ? lineControls.flatMap(line=>[...Object.values(line.inputs), ...Object.values(line.sliders), line.remove, line.sideAutoButton]).filter(Boolean) : []),...(addLine?[addLine]:[])];
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
        if(priceScope)priceScope.textContent=estimate.pricing_review_required ? estimate.pricing_note : '';
        status.textContent = data.error; return;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send your request.');
      status.textContent = data.message; estimate = null; requestKey = '';
    } catch (error) { if (current === generation) status.textContent = error.message || 'Could not send your request.'; }
    finally { sending = false; controls.forEach(el => { el.disabled = false; }); syncLines(); send.disabled = !estimate; }
  });
  const restored = restoreDesign();
  if (!restored) fromLegacy();
  syncBoardControls();if(back)back.checked=backVisible;
  paintScene();
  if (restored) changed(); else paint();
})();
