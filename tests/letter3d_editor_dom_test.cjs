'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
  constructor(value = '') { this.value=value; this.dataset={}; this.style={}; this.disabled=false; this.listeners={}; this.parentElement={clientWidth:400}; this.scrollWidth=100; this._text=''; }
  get textContent() { return this._text; }
  set textContent(value) { this._text=String(value); }
  set innerHTML(value) { throw new Error('Untrusted data was inserted as HTML: ' + value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type) { return (this.listeners[type] || []).map(fn => fn({target:this})); }
  checkValidity() { return this.value.includes('@'); }
  get selectedOptions() { return this.value ? [{dataset:{minWidth:'100',maxWidth:'1000',minHeight:'50',maxHeight:'500',maxChars:'20',maxQuantity:'10'}}] : []; }
}
const names=['product','text','font','colour','width','height','quantity','preview','price','tax','limits','send','status','name','email','phone'];
const elements=Object.fromEntries(names.map(name => [name,new Element()]));
Object.assign(elements.product,{value:'1'}); Object.assign(elements.text,{value:'Hello'});
Object.assign(elements.font,{value:'sans'}); Object.assign(elements.colour,{value:'#ff0000'});
Object.assign(elements.width,{value:'500'}); Object.assign(elements.height,{value:'100'});
Object.assign(elements.quantity,{value:'1'}); Object.assign(elements.name,{value:'Test Person'});
Object.assign(elements.email,{value:'test@example.invalid'}); Object.assign(elements.phone,{value:'555000'});
const root={dataset:{csrf:'test-csrf'},querySelector:selector=>elements[selector.match(/^\[data-letter-(.+)\]$/)?.[1]] || null};
let timerId=0;
const timers=new Map(), requests=[];
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const context={document:{querySelector:s=>s==='[data-letter3d]'?root:null},requestAnimationFrame:cb=>cb(),
  setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>{const d=deferred();requests.push({url,body:JSON.parse(options.body),resolve:d.resolve});return d.promise;},
  Number,Math,console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/assets/js/letter3d-editor.js'),'utf8'),context);
const flush=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
async function timer(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await flush();}
const respond=(request,status,data)=>request.resolve({ok:status>=200&&status<300,status,json:async()=>data});

(async()=>{
  const attack='<img src=x onerror=alert(1)>';
  elements.text.value=attack; elements.text.fire('input');
  assert.equal(elements.preview.textContent,attack, 'Preview must treat customer text as literal text');
  await timer(); assert.equal(requests[0].url,'/online-quote/letters3d/estimate');
  elements.text.value='Updated'; elements.text.fire('input'); await timer();
  assert.equal(requests[1].body.text,'Updated');
  respond(requests[1],200,{estimate:{total:42.10,vat_percent:19,quote_token:'new-token'},request_key:'request-1'});
  await flush(); assert.equal(elements.price.textContent,'€42.10'); assert.equal(elements.send.disabled,false);
  respond(requests[0],200,{estimate:{total:999,vat_percent:19,quote_token:'stale-token'},request_key:'stale-key'});
  await flush(); assert.equal(elements.price.textContent,'€42.10','Older estimate response must not overwrite latest');

  const pending=elements.send.fire('click')[0];
  assert.equal(requests[2].url,'/online-quote/letters3d/request');
  assert.equal(requests[2].body.quote_token,'new-token'); assert.equal(requests[2].body.request_key,'request-1');
  assert.equal(requests[2].body.expected_cents,4210);
  for(const key of ['product','text','font','colour','width','height','quantity']) assert.equal(elements[key].disabled,true,`${key} must lock while sending`);
  elements.send.fire('click'); assert.equal(requests.length,3,'Duplicate click must not send another request');
  const changedMessage='<img src=x onerror=alert(1)> Price changed.';
  respond(requests[2],409,{estimate:{total:48.20,vat_percent:19,quote_token:'changed-token'},error:changedMessage});
  await pending; await flush();
  assert.equal(elements.price.textContent,'€48.20'); assert.equal(elements.status.textContent,changedMessage,'Server messages are displayed as literal text');
  assert.equal(elements.send.disabled,false,'Changed terms require an explicit second click');
  assert.equal(requests.length,3,'Changed terms must not auto-submit');
  for(const key of ['product','text','font','colour','width','height','quantity']) assert.equal(elements[key].disabled,false,`${key} must unlock after response`);
  const confirmed=elements.send.fire('click')[0];
  assert.equal(requests[3].body.quote_token,'changed-token'); assert.equal(requests[3].body.expected_cents,4820);
  assert.equal(requests[3].body.request_key,'request-1');
  respond(requests[3],200,{ok:true,message:'Request received'}); await confirmed; await flush();
  assert.equal(elements.status.textContent,'Request received'); assert.equal(elements.send.disabled,true);
  console.log('3D lettering editor DOM checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
