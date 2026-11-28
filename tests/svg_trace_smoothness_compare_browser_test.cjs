'use strict';
const {runTraceBrowser} = require('./helpers/svg_trace_browser.cjs');

async function compare() {
  const $ = id => document.getElementById(id);
  const until = async (check, message) => {
    for (let i=0;i<160;i++) {
      if (check()) return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error(message);
  };
  await until(()=>$('ws').dataset.draftReady==='1','Draft did not initialise');
  const raster=document.createElement('canvas');
  raster.width=100; raster.height=100;
  const dt=new DataTransfer();
  dt.items.add(new File([await new Promise(resolve=>raster.toBlob(resolve))],'letter.png',{type:'image/png'}));
  $('file').files=dt.files; $('file').dispatchEvent(new Event('change'));
  document.querySelector('[data-show="inspect"]').click();
  await until(()=>$('compare-count').textContent.includes('4 total points'),'Initial anchors missing');
  const vp=$('compare-ink').parentElement, box=vp.getBoundingClientRect();
  vp.dispatchEvent(new WheelEvent('wheel',{clientX:box.left+box.width*.3,clientY:box.top+box.height*.6,deltaY:-725}));
  const position=$('img-original').style.cssText;
  const change=v=>{ $('compare-smooth').value=v; $('compare-smooth').dispatchEvent(new Event('input')); };
  change('5');
  await until(()=>$('canvas').querySelector('.updating'),'Intermediate request did not start');
  change('8');
  await until(()=>$('compare-count').textContent.includes('3 total points'),'Latest smoothness did not win');
  if ($('img-original').style.cssText!==position || $('compare-ink').style.width!==$('img-original').style.width ||
      !$('canvas').classList.contains('inspect') || $('auto').checked) throw Error('Comparison moved or left manual trace mode');
  const text=await (await fetch($('download').href)).text();
  if (!text.includes('M20 20L80 20L50 80Z')) throw Error('Download differs from displayed trace');
  $('compare-opacity').value='0'; $('compare-opacity').dispatchEvent(new Event('input'));
  if ($('compare-ink').style.opacity!=='0') throw Error('Original-only opacity failed');
}

runTraceBrowser(compare,async (req,body)=>{
  const form=await new Response(body,{headers:{'Content-Type':req.headers['content-type']}}).formData();
  const level=Number(form.get('segment_length'));
  if (level===5) await new Promise(resolve=>setTimeout(resolve,850));
  const d=level===8?'M20 20L80 20L50 80Z':'M20 20L80 20L80 80L20 80Z';
  return {svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="'+d+'"/></svg>',width:100,height:100,duration_ms:20};
}).then(()=>console.log('Smoothness, latest-result selection, point count, fixed zoom, overlay and export passed.'))
  .catch(error=>{console.error(error);process.exitCode=1;});
