const {test}=require('node:test');
const assert=require('node:assert/strict');
const photo=require('../public/assets/js/neon-session-photo.js');

function memoryStore() {
  const values=new Map();
  return {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
}

test('small original preview is kept locally and can be cleared',async()=>{
  const store=memoryStore(), original='data:image/png;base64,YWJjZA==';
  const data=await photo.encode({type:'image/png',size:4},{naturalWidth:640,naturalHeight:480},{readFile:async()=>original});
  assert.equal(data,original);
  assert.equal(photo.save(store,data),true);
  assert.equal(photo.load(store),original);
  photo.clear(store);
  assert.equal(photo.load(store),null);
});

test('large photos are downscaled to a bounded preview',async()=>{
  let renders=0, largest=0;
  const canvas={width:0,height:0,getContext(){return {clearRect(){},drawImage(){renders++;}};},
    toDataURL(){largest=Math.max(largest,this.width,this.height);return 'data:image/webp;base64,'+'A'.repeat(this.width>1200?1800001:1000);}};
  const data=await photo.encode({type:'image/jpeg',size:8000000},{naturalWidth:4000,naturalHeight:3000},{canvasFactory:()=>canvas});
  assert.ok(data.startsWith('data:image/webp;base64,'));
  assert.ok(data.length<1800000);
  assert.ok(renders>1);
  assert.ok(largest<=2048);
});

test('unsupported or oversized files are never stored',async()=>{
  assert.equal(await photo.encode({type:'image/svg+xml',size:8},{naturalWidth:10,naturalHeight:10}),null);
  assert.equal(await photo.encode({type:'image/jpeg',size:13000000},{naturalWidth:10,naturalHeight:10}),null);
  assert.equal(await photo.encode({type:'image/png',size:8},{naturalWidth:10000,naturalHeight:10000}),null);
  const store=memoryStore();
  assert.equal(photo.save(store,'data:image/svg+xml;base64,YWJj'),false);
  assert.equal(photo.load(store),null);
});

test('quota or blocked storage fails without breaking the editor',()=>{
  let removed=false;
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){removed=true;}};
  assert.equal(photo.load(storage),null);
  assert.equal(photo.save(storage,'data:image/jpeg;base64,YWJj'),false);
  assert.equal(removed,true);
});
