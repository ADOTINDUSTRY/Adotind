'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
class El {
  constructor(value=''){this.value=value;this.dataset={};this.style={};this.listeners={};this.disabled=false;this.textContent='';this.clientWidth=400;this.clientHeight=250;this.scrollWidth=200;this.scrollHeight=80;this.parentElement=this;this.attrs={};}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn)}
  fire(type,event={}){for(const fn of this.listeners[type]||[])fn(event)}
  setAttribute(k,v){this.attrs[k]=v}
  get selectedOptions(){return this.value?[{dataset:{minWidth:'100',maxWidth:'1000',minHeight:'50',maxHeight:'500',maxChars:'80',maxQuantity:'10'}}]:[]}
  checkValidity(){return true}
}
const code=fs.readFileSync(path.join(__dirname,'../public/assets/js/letter3d-editor.js'),'utf8');
const storage=new Map(); const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
function setup() {
  const names=['product','text','font','colour','width','height','quantity','preview','viewport','stage','price','tax','limits','send','status','name','email','phone','reset','zoom-level'];
  const e=Object.fromEntries(names.map(n=>[n,new El()]));
  Object.assign(e.product,{value:''});Object.assign(e.text,{value:'Your sign'});Object.assign(e.font,{value:'sans'});Object.assign(e.colour,{value:'#e6e9ed'});Object.assign(e.width,{value:''});Object.assign(e.height,{value:''});Object.assign(e.quantity,{value:'1'});
  e.preview.parentElement=e.viewport;
  const brick=new El(), plus=new El(), fit=new El();brick.dataset.letterScene='brick';plus.dataset.letterZoom='in';fit.dataset.letterZoom='fit';
  const root={dataset:{csrf:'test'},querySelector:s=>e[s.match(/^\[data-letter-(.+)\]$/)?.[1]]||null,querySelectorAll:s=>s==='[data-letter-scene]'?[brick]:s==='[data-letter-zoom]'?[plus,fit]:[]};
  let timer;const calls=[];const ctx={document:{querySelector:()=>root},sessionStorage,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{timer=fn;return 1},clearTimeout:()=>{timer=null},fetch:(url,opts)=>{calls.push(JSON.parse(opts.body));return Promise.resolve({ok:true,json:async()=>({estimate:{total:100,vat_percent:19},request_key:'key'})})},console};
  vm.runInNewContext(code,ctx);
  return {e,brick,plus,fit,root,calls,run:async()=>{if(timer){const fn=timer;timer=null;await fn()}}};
}
(async()=>{
  const a=setup();a.e.product.value='1';a.e.text.value='Hello\nCyprus';a.e.width.value='500';a.e.height.value='200';a.e.name.value='Private Name';a.e.email.value='private@example.invalid';a.e.phone.value='123';a.e.text.fire('input');
  a.brick.fire('click');a.plus.fire('click');
  const saved=storage.get('adotind.letter3d.design.v1');
  assert.ok(saved.includes('Hello\\nCyprus')); assert.ok(!saved.includes('Private Name'));assert.ok(!saved.includes('private@example.invalid'));assert.ok(!saved.includes('123'));
  assert.equal(a.e.stage.dataset.scene,'brick');assert.equal(a.e['zoom-level'].textContent,'120%'); assert.ok(a.e.viewport.listeners.wheel); assert.equal(a.e.stage.listeners.wheel,undefined,'Stage buttons must not capture scrolling');
  await a.run();assert.equal(a.calls[0].text,'Hello\nCyprus');
  const b=setup();assert.equal(b.e.text.value,'Hello\nCyprus');assert.equal(b.e.name.value,'');assert.equal(b.e.stage.dataset.scene,'brick');assert.equal(b.e['zoom-level'].textContent,'120%');await b.run();assert.equal(b.calls.length,1,'Restored designs must be re-estimated');
  b.fit.fire('click');assert.equal(b.e['zoom-level'].textContent,'100%');b.e.reset.fire('click');assert.equal(b.e.text.value,'Your sign');assert.equal(b.e.product.value,'');assert.equal(b.e.stage.dataset.scene,'studio');assert.equal(b.e.send.disabled,true);
  const c=setup();assert.equal(c.e.text.value,'Your sign');assert.equal(c.e.product.value,'');
  console.log('3D lettering workspace checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
