(() => {
  const panel = document.querySelector('[data-print-designer]');
  if (!panel) return;
  const $ = selector => panel.querySelector(selector);
  const product=$('[data-print-product]'), width=$('[data-print-width]'), height=$('[data-print-height]'), quantity=$('[data-print-quantity]'), laminate=$('[data-print-laminate]');
  const status=$('[data-print-status]'), price=$('[data-print-price]'), total=$('[data-print-total]'), request=$('[data-print-request]'), form=$('[data-print-order]'), orderStatus=$('[data-print-order-status]');
  const description=$('[data-print-description]'), preview=$('[data-print-preview]'), dimensions=$('[data-print-dimensions]');
  const csrf=panel.dataset.csrf, requestKey=panel.dataset.requestKey;
  const artwork=$('[data-print-artwork]'), restart=$('[data-print-restart]');
  restart.addEventListener('click',()=>window.location.reload());
  let products=[], quote=null, seq=0, timer, sending=false, artworkUrl='';
  const euro=cents => '€' + (cents/100).toFixed(2);
  const input=() => ({product_id:product.value,width_mm:width.value,height_mm:height.value,quantity:quantity.value,laminate:laminate.checked});
  function resetQuote() { quote=null; price.hidden=true; request.hidden=true; }
  function refreshPreview() {
    const w=Number(width.value),h=Number(height.value);
    if (!(w>0 && h>0)) { dimensions.textContent='Enter a width and height'; return; }
    preview.style.aspectRatio=`${w} / ${h}`;
    preview.style.width=(w>=h ? 220 : Math.max(20,220*w/h))+'px';
    dimensions.textContent=`${width.value} × ${height.value} mm`;
  }
  function showQuote(value) { quote=value; total.textContent=euro(value.total_cents); price.hidden=false; request.hidden=false; }
  async function update() {
    const run=++seq; resetQuote(); refreshPreview(); orderStatus.textContent='';
    const selected=products.find(item=>String(item.id)===product.value);
    description.textContent=selected?.description || '';
    laminate.disabled=!selected || selected.laminate_per_m2_cents===null;
    if (laminate.disabled) laminate.checked=false;
    if (!selected) { status.textContent=products.length?'Choose a print material.':'No printing products have been configured for instant estimates yet.'; return; }
    status.textContent='Calculating…';
    try {
      const response=await fetch('/online-quote/print',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'estimate',csrf,...input()})});
      const data=await response.json(); if (run!==seq) return;
      if (!response.ok || !data.quote) throw new Error(data.error || 'Could not calculate the price.');
      showQuote(data.quote); status.textContent='Preliminary estimate; artwork and production details require review.';
    } catch (error) { if (run===seq) status.textContent=error.message || 'Could not calculate the price.'; }
  }
  function schedule() { ++seq; resetQuote(); refreshPreview(); clearTimeout(timer); timer=setTimeout(update,250); }
  [product,width,height,quantity,laminate].forEach(el => el.addEventListener('input',schedule));
  artwork.addEventListener('change',() => {
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    artworkUrl=''; preview.style.backgroundImage='';
    const file=artwork.files?.[0]; if (!file) return;
    if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) || file.size>10*1024*1024) { status.textContent='Use a PDF, PNG, JPG or WebP file up to 10 MB.'; artwork.value=''; return; }
    if (file.type==='application/pdf') { status.textContent='PDF selected. It will be attached when you send the request.'; return; }
    artworkUrl=URL.createObjectURL(file); preview.style.backgroundImage=`url("${artworkUrl}")`;
  });
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (!quote || sending || !form.reportValidity()) return;
    const values=new FormData(form), selectedInput=input(), selectedArtwork=artwork.files?.[0], original=quote;
    sending=true; const button=form.querySelector('button[type="submit"]'); orderStatus.textContent='Sending…';
    const controls=[product,width,height,quantity,laminate,artwork,...form.querySelectorAll('input,textarea,button')]; const disabledBefore=controls.map(el=>el.disabled); controls.forEach(el=>{el.disabled=true;});
    let completed=false;
    try {
      const requestData=new FormData();
      const fields={action:'request',csrf,request_key:requestKey,...selectedInput,expected_total_cents:original.total_cents,expected_revision:original.revision,customer_name:values.get('customer_name'),email:values.get('email'),phone:values.get('phone'),notes:values.get('notes')};
      for (const [key,value] of Object.entries(fields)) requestData.set(key,key==='laminate' ? (value ? '1' : '0') : String(value));
      if (selectedArtwork) requestData.set('artwork',selectedArtwork);
      const response=await fetch('/online-quote/print',{method:'POST',credentials:'same-origin',body:requestData});
      const data=await response.json();
      if (response.status===409 && data.changed && data.quote) { showQuote(data.quote); orderStatus.textContent='The price changed. Please review the new estimate and send again if you agree.'; return; }
      if (!response.ok || !data.id) throw new Error(data.error || 'Could not send the request.');
      orderStatus.textContent='Request received. Reference #' + data.id + '. We’ll contact you about the artwork and details.';
      form.querySelectorAll('input,textarea,button').forEach(el => { el.disabled=true; });
      restart.hidden=false; completed=true; return;
    } catch (error) { orderStatus.textContent=error.message || 'Could not send the request.'; }
    finally { sending=false; if (!completed) controls.forEach((el,index)=>{el.disabled=disabledBefore[index];}); }
  });
  fetch('/online-quote/print',{credentials:'same-origin'}).then(async response=>{const data=await response.json();if(!response.ok || !Array.isArray(data.products)) throw new Error(data.error || 'Could not load printing products.');return data.products;}).then(items=>{
    products=items; product.replaceChildren(new Option(items.length?'Choose a material':'No products configured',''));
    items.forEach(item=>product.add(new Option(item.name,String(item.id))));
    status.textContent=items.length?'Choose a print material.':'No printing products have been configured for instant estimates yet.';
  }).catch(error=>{product.replaceChildren(new Option('Unavailable',''));status.textContent=error.message || 'Could not load printing products.';});
})();
