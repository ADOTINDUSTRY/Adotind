'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element {
  constructor(value=''){this.value=value;this.dataset={};this.style={};this.listeners={};this.disabled=false;this.hidden=false;this._text='';this.children=[];this.parentElement=this;this.scrollWidth=200;this.scrollHeight=80;this.clientWidth=400;this.clientHeight=260;this.attrs={};}
  set textContent(value){this._text=String(value);this.children=[];} get textContent(){return this.children.length?this.children.map(c=>c.textContent).join(''):this._text;}
  set innerHTML(value){throw Error('Customer data must never be inserted as HTML: '+value)}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn)}
  fire(type,event={}){return (this.listeners[type]||[]).map(fn=>fn(event))}
  setAttribute(key,value){this.attrs[key]=value}
  appendChild(child){this.children.push(child);child.parentElement=this}
  getBoundingClientRect(){return {left:0,right:200,top:0,bottom:80,width:200,height:80}}
  get selectedOptions(){return this.value?[{dataset:{minWidth:'100',maxWidth:'1000',minHeight:'50',maxHeight:'500',maxChars:'80',maxQuantity:'10'}}]:[]}
  checkValidity(){return true}
}
const src=fs.readFileSync(path.join(__dirname,'../public/assets/js/letter3d-editor.js'),'utf8');
const storage=new Map();const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
function setup(){
  const names=['product','text','font','colour','width','height','quantity','preview','viewport','stage','price','tax','limits','send','status','name','email','phone','reset','zoom-level','add-line'];
  const e=Object.fromEntries(names.map(k=>[k,new Element()]));
  e.preview.parentElement=e.viewport;e.product.value='1';e.text.value='Your sign';e.font.value='sans';e.colour.value='#e6e9ed';e.width.value='500';e.height.value='200';e.quantity.value='1';e.name.value='A';e.email.value='a@example.test';e.phone.value='123';
  const lines=Array.from({length:8},()=>{
    const fs=new Element(), fields=Object.fromEntries(['text','font','colour','side_colour','x','y','rotation'].map(k=>[k,new Element()]));
    fields.font.value='sans';fields.colour.value='#e6e9ed';for(const n of ['x','y','rotation'])fields[n].value='0';
    const sliders=Object.fromEntries(['x','y','rotation'].map(k=>[k,new Element('0')]));const remove=new Element(), auto=new Element();
    fs.querySelector=s=>{if(s==='[data-letter-line-side-colour]')return fields.side_colour;if(s==='[data-letter-line-side-auto]')return auto;const f=s.match(/^\[data-letter-line-(text|font|colour|x|y|rotation)\]$/);if(f)return fields[f[1]];const r=s.match(/^\[data-letter-line-slider="(x|y|rotation)"\]$/);if(r)return sliders[r[1]];return s==='[data-letter-remove-line]'?remove:null;};
    return {fs,fields,sliders,remove,auto};
  });
  const root={dataset:{csrf:'test'},querySelector:s=>e[s.match(/^\[data-letter-(.+)\]$/)?.[1]]||null,querySelectorAll:s=>s==='[data-letter-line]'?lines.map(l=>l.fs):[]};
  let timer,requests=[];const ctx={document:{querySelector:()=>root,createElement:()=>new Element()},sessionStorage,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{timer=fn;return 1},clearTimeout:()=>{timer=null},fetch:(url,opts)=>{let resolve;const promise=new Promise(r=>resolve=r);requests.push({url,body:JSON.parse(opts.body),resolve});return promise},console};
  vm.runInNewContext(src,ctx);return {e,lines,requests,run:()=>{assert.ok(timer,'Expected an estimate timer');const fn=timer;timer=null;fn();},respond:(i,status,body)=>requests[i].resolve({ok:status>=200&&status<300,status,json:async()=>body})};
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
(async()=>{
 const a=setup();assert.equal(a.lines[0].fields.text.value,'Your sign');assert.equal(a.lines[1].fs.hidden,true);assert.equal(a.lines[0].remove.disabled,true);
 const THREE=await import('../public/assets/js/quote-vendor/three-0.160.1.module.min.js');
 for(const face of ['#e6e9ed','#ff0000','#123456','#777777','#00a1ff']) {
   a.lines[0].fields.colour.value=face;a.lines[0].fields.colour.fire('input');
   assert.equal(a.lines[0].fields.side_colour.value,'#'+new THREE.Color(face).multiplyScalar(.55).getHexString(),`Automatic swatch must match the old Three.js shading for ${face}`);
 }
 a.lines[0].fields.text.value='<b>Hello</b>';a.lines[0].fields.text.fire('input');assert.equal(a.e.preview.children[0].textContent,'<b>Hello</b>','Preview renders literal text');
 a.e['add-line'].fire('click');assert.equal(a.lines[1].fs.hidden,false);assert.equal(a.lines[0].remove.disabled,false);
 a.lines[1].fields.text.value='Cyprus';a.lines[1].fields.text.fire('input');a.lines[1].fields.font.value='serif';a.lines[1].fields.font.fire('input');a.lines[1].fields.colour.value='#00ff00';a.lines[1].fields.colour.fire('input');
 assert.equal(a.lines[1].fields.side_colour.value,'#00c400','Automatic side swatch follows the existing linear-light shading');
 a.lines[1].fields.side_colour.value='#123456';a.lines[1].fields.side_colour.fire('input');assert.equal(a.lines[1].auto.attrs['aria-pressed'],'false');
 a.lines[1].sliders.x.value='35';a.lines[1].sliders.x.fire('input');a.lines[1].fields.y.value='-20';a.lines[1].fields.y.fire('input');a.lines[1].sliders.rotation.value='45';a.lines[1].sliders.rotation.fire('input');
 a.lines[0].fields.x.value='500';a.lines[0].fields.x.fire('input');assert.equal(a.lines[0].fields.x.value,'200','Out-of-range input reflects the clamped value');
 a.lines[0].fields.rotation.value='';a.lines[0].fields.rotation.fire('blur');assert.equal(a.lines[0].fields.rotation.value,'0','Empty numeric inputs normalize on blur');
 assert.equal(a.lines[1].fields.x.value,'35');assert.equal(a.lines[1].sliders.y.value,'-20');
 assert.equal(a.e.preview.children[1].style.transform,'translate(35%, -20%) rotate(45deg)');assert.equal(a.e.preview.children[1].style.color,'#00ff00');
 const saved=storage.get('adotind.letter3d.design.v1');assert.ok(saved.includes('Cyprus'));assert.ok(!saved.includes('a@example.test'));
 a.run();assert.equal(a.requests[0].body.lines.length,2);assert.equal(a.requests[0].body.lines[1].text,'Cyprus');assert.equal(a.requests[0].body.lines[1].x,35);assert.equal(a.requests[0].body.lines[1].rotation,45);
 assert.equal(a.requests[0].body.lines[0].side_colour,null);assert.equal(a.requests[0].body.lines[1].side_colour,'#123456');
 a.respond(0,200,{estimate:{total:42,vat_percent:19,quote_token:'tok'},request_key:'key'});await flush();
 const pending=a.e.send.fire('click')[0];assert.equal(a.requests[1].body.lines[1].font,'serif');assert.equal(a.requests[1].body.lines[1].colour,'#00ff00');assert.equal(a.requests[1].body.lines[1].side_colour,'#123456');
 assert.equal(a.e['add-line'].disabled,true);assert.equal(a.lines[1].remove.disabled,true);assert.equal(a.lines[1].fields.x.disabled,true);assert.equal(a.lines[1].sliders.rotation.disabled,true);
 a.respond(1,200,{ok:true,message:'Received'});await pending;await flush();assert.equal(a.e['add-line'].disabled,false);assert.equal(a.lines[1].fields.x.disabled,false);
 const b=setup();assert.equal(b.lines[1].fields.text.value,'Cyprus');assert.equal(b.lines[1].fields.font.value,'serif');assert.equal(b.lines[1].fields.colour.value,'#00ff00');assert.equal(b.lines[1].fields.side_colour.value,'#123456');assert.equal(b.lines[1].fields.x.value,'35');assert.equal(b.lines[1].fields.y.value,'-20');assert.equal(b.lines[1].fields.rotation.value,'45');
 b.lines[1].fields.colour.value='#ff0000';b.lines[1].fields.colour.fire('input');assert.equal(b.lines[1].fields.side_colour.value,'#123456','Custom side remains independent of front');
 b.lines[1].auto.fire('click');assert.equal(b.lines[1].fields.side_colour.value,'#c40000');assert.equal(b.lines[1].auto.attrs['aria-pressed'],'true');
 b.lines[0].remove.fire('click');assert.equal(b.lines[0].fields.text.value,'Cyprus');assert.equal(b.lines[0].fields.x.value,'35');assert.equal(b.lines[1].fs.hidden,true);assert.equal(b.lines[0].remove.disabled,true);
 b.e.reset.fire('click');assert.equal(b.lines[0].fields.text.value,'Your sign');assert.equal(b.lines[0].fields.font.value,'sans');assert.equal(b.lines[0].fields.x.value,'0');assert.equal(b.lines[1].fs.hidden,true);
 console.log('3D lettering independent-line checks passed.');
})().catch(err=>{console.error(err);process.exitCode=1});
