(() => {
  const panel=document.querySelector('[data-frame-designer]'); if (!panel) return;
  const $=selector=>panel.querySelector(selector);
  const profile=$('[data-frame-profile]'),width=$('[data-frame-width]'),height=$('[data-frame-height]'),quantity=$('[data-frame-quantity]');
  const status=$('[data-frame-status]'),price=$('[data-frame-price]'),total=$('[data-frame-total]'),request=$('[data-frame-request]'),form=$('[data-frame-order]'),orderStatus=$('[data-frame-order-status]');
  const description=$('[data-frame-description]'),preview=$('[data-frame-preview]'),dimensions=$('[data-frame-dimensions]'),restart=$('[data-frame-restart]');
  const csrf=panel.dataset.csrf,requestKey=panel.dataset.requestKey;
  let profiles=[],quote=null,seq=0,timer,sending=false;
  restart.addEventListener('click',()=>window.location.reload());
  const input=()=>({profile_id:profile.value,width_mm:width.value,height_mm:height.value,quantity:quantity.value});
  function reset(){quote=null;price.hidden=true;request.hidden=true;}
  function draw(){const w=Number(width.value),h=Number(height.value);if (!(w>0&&h>0)){dimensions.textContent='Enter a width and height';return;}preview.style.aspectRatio=`${w} / ${h}`;preview.style.width=(w>=h?220:Math.max(20,220*w/h))+'px';dimensions.textContent=`${width.value} × ${height.value} mm`;}
  function show(value){quote=value;total.textContent='€'+(value.total_cents/100).toFixed(2);price.hidden=false;request.hidden=false;}
  async function update(){
    const run=++seq;reset();draw();orderStatus.textContent='';
    const selected=profiles.find(p=>String(p.id)===profile.value);description.textContent=selected?.description||'';
    if (!selected){status.textContent=profiles.length?'Choose a frame profile.':'No frame profiles have been configured for instant estimates yet.';return;}
    status.textContent='Calculating…';
    try{const response=await fetch('/online-quote/frame',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'estimate',csrf,...input()})});const data=await response.json();if(run!==seq)return;if(!response.ok||!data.quote)throw new Error(data.error||'Could not calculate the price.');show(data.quote);status.textContent='Preliminary estimate; construction and finishing require review.';}catch(error){if(run===seq)status.textContent=error.message||'Could not calculate the price.';}
  }
  function schedule(){++seq;reset();draw();clearTimeout(timer);timer=setTimeout(update,250);}
  [profile,width,height,quantity].forEach(el=>el.addEventListener('input',schedule));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!quote||sending||!form.reportValidity())return;
    const values=new FormData(form),selected=input(),original=quote;
    const controls=[profile,width,height,quantity,...form.querySelectorAll('input,textarea,button')],previous=controls.map(el=>el.disabled);
    sending=true;controls.forEach(el=>{el.disabled=true;});orderStatus.textContent='Sending…';let completed=false;
    try{
      const payload={action:'request',csrf,request_key:requestKey,...selected,expected_total_cents:original.total_cents,expected_revision:original.revision,customer_name:values.get('customer_name'),email:values.get('email'),phone:values.get('phone'),notes:values.get('notes')};
      const response=await fetch('/online-quote/frame',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();
      if(response.status===409&&data.changed&&data.quote){show(data.quote);orderStatus.textContent='The price changed. Please review the new estimate and send again if you agree.';return;}
      if(!response.ok||!data.id)throw new Error(data.error||'Could not send the request.');
      orderStatus.textContent='Request received. Reference #'+data.id+'. We’ll contact you about the details.';restart.hidden=false;completed=true;
    }catch(error){orderStatus.textContent=error.message||'Could not send the request.';}finally{sending=false;if(!completed)controls.forEach((el,index)=>{el.disabled=previous[index];});}
  });
  fetch('/online-quote/frame',{credentials:'same-origin'}).then(async response=>{const data=await response.json();if(!response.ok||!Array.isArray(data.profiles))throw new Error(data.error||'Could not load frame profiles.');return data.profiles;}).then(items=>{profiles=items;profile.replaceChildren(new Option(items.length?'Choose a profile':'No profiles configured',''));items.forEach(item=>profile.add(new Option(item.name,String(item.id))));status.textContent=items.length?'Choose a frame profile.':'No frame profiles have been configured for instant estimates yet.';}).catch(error=>{profile.replaceChildren(new Option('Unavailable',''));status.textContent=error.message||'Could not load frame profiles.';});
})();
