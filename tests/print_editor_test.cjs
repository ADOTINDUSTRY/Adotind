const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class Element {
  constructor(value='') { this.value=value; this.disabled=false; this.hidden=false; this.checked=false; this.dataset={}; this.style={}; this.files=[]; this.events={}; this.textContent=''; this.options=[]; }
  addEventListener(name,fn) { this.events[name]=fn; }
  dispatch(name) { return this.events[name]?.({preventDefault(){}}); }
  replaceChildren(...values) { this.options=values; }
  add(value) { this.options.push(value); }
  reportValidity() { return true; }
}
const els={};
for (const key of ['product','width','height','quantity','laminate','status','price','total','request','order','order-status','description','preview','dimensions','artwork','restart']) els[key]=new Element();
els.width.value='500'; els.height.value='500'; els.quantity.value='2';
const button=new Element(), name=new Element(), email=new Element(), phone=new Element(), notes=new Element(); els.order.querySelector=()=>button; els.order.querySelectorAll=()=>[name,email,phone,notes,button]; els.order.fields={customer_name:'Test',email:'test@example.com',phone:'123',notes:''};
const panel={dataset:{csrf:'csrf',requestKey:'a'.repeat(32)},querySelector(selector){return els[selector.replace('[data-print-','').replace(']','')];}};
class FormDataMock { constructor(form) { this.values=new Map(Object.entries(form?.fields || {})); } set(key,value){this.values.set(key,value);} get(key){return this.values.get(key);} }
let requestResolve; const calls=[];
const fetch=(url,options={})=>{
  calls.push({url,options});
  if (!options.method) return Promise.resolve({ok:true,json:async()=>({products:[{id:1,name:'Vinyl',description:'Print only',laminate_per_m2_cents:400}]})});
  if (options.body instanceof FormDataMock) return new Promise(resolve=>{requestResolve=resolve;});
  return Promise.resolve({ok:true,json:async()=>({quote:{total_cents:1071,revision:2}})});
};
const context={document:{querySelector:()=>panel},Option:function(text,value){this.text=text;this.value=value;},FormData:FormDataMock,fetch,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,console};
vm.runInNewContext(fs.readFileSync(__dirname + '/../public/assets/js/print-editor.js','utf8'),context);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  await sleep(5); assert.equal(els.product.options.length,2);
  els.product.value='1'; els.product.dispatch('input'); await sleep(350);
  assert.equal(els.total.textContent,'€10.71'); assert.equal(els.request.hidden,false);
  els.artwork.files=[{type:'application/pdf',size:100,name:'artwork.pdf'}]; els.artwork.dispatch('change');
  const pending=els.order.dispatch('submit'); await sleep(5);
  assert.equal(els.product.disabled,true); assert.equal(els.width.disabled,true); assert.equal(name.disabled,true); assert.equal(email.disabled,true); assert.equal(phone.disabled,true); assert.equal(notes.disabled,true);
  const body=calls[calls.length-1].options.body;
  assert.equal(body.get('artwork').name,'artwork.pdf'); assert.equal(body.get('expected_total_cents'),'1071'); assert.equal(body.get('customer_name'),'Test');
  requestResolve({ok:false,json:async()=>({error:'Try again'})}); await pending;
  assert.equal(name.disabled,false); assert.equal(email.disabled,false); assert.equal(button.disabled,false);
  const retry=els.order.dispatch('submit'); await sleep(5); requestResolve({ok:true,json:async()=>({id:42})}); await retry;
  assert.match(els['order-status'].textContent,/42/); assert.equal(button.disabled,true); assert.equal(els.restart.hidden,false);
  console.log('Print client behavior checks passed.');
})().catch(error=>{console.error(error);process.exit(1);});
