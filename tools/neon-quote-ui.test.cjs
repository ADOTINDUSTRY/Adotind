const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function editor(rates) {
  const nodes = {
    price:{textContent:''}, preview:{textContent:'',hidden:true}, label:{textContent:''},
    submit:{textContent:''}, response:{textContent:'',dataset:{}}, request:{value:'a'.repeat(32)},
    delivery:{value:'pickup',options:[{},{}],addEventListener(){}},
    address:{required:false,closest(){return {};}}
  };
  const handlers = {};
  const form = {
    elements:{namedItem(){return nodes.request;}},
    querySelector(selector) {return ({'[data-neon-submit]':nodes.submit,'[data-neon-response]':nodes.response,
      '[data-neon-delivery]':nodes.delivery,'[name="delivery_address"]':nodes.address})[selector];},
    addEventListener(){}, setAttribute(){}, removeAttribute(){}
  };
  const root = {
    querySelector(selector) {return ({'[data-neon-quote-form]':form,'[data-neon-price]':nodes.price,
      '[data-neon-request-label]':nodes.label,'[data-neon-preview-price]':nodes.preview})[selector];},
    addEventListener(name,handler) {handlers[name]=handler;}
  };
  const document = {getElementById(){return {textContent:JSON.stringify({rates})};},querySelector(){return root;}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/neon-quote.js'),'utf8'),
    {document,window:{},Intl,Number,JSON,Map,Boolean,String});
  return {nodes, update(intent) {handlers['neon:design']({detail:{intent,spec:{mount:'wall'},lengthMm:1000,
    finished:{withinLimit:true,tier:120,areaMm2:1000000},strokeCount:2,bendCount:1,spacerCount:4}});}};
}

const rates = {base:100,perMetre:1000,wall:200,acrylic120:300,delivery120:0,perStroke:100,perBend:50,perSpacer:300};

test('review designs retain a provisional live price with a clear review label', () => {
  const {nodes,update} = editor(rates);
  update('review');
  assert.match(nodes.price.textContent,/Estimated price .*subject to shop review/);
  assert.equal(nodes.preview.textContent,nodes.price.textContent);
  assert.equal(nodes.preview.hidden,false);
  assert.equal(nodes.submit.textContent,'Send for shop review');
  assert.equal(nodes.submit.disabled,false);
});

test('without complete rates no misleading provisional amount is displayed', () => {
  const {nodes,update} = editor({...rates,perMetre:undefined});
  update('review');
  assert.equal(nodes.price.textContent,'Price after shop review');
  assert.equal(nodes.preview.hidden,true);
});

test('non-review designs keep their standard estimate label', () => {
  const {nodes,update} = editor(rates);
  update('production');
  assert.match(nodes.price.textContent,/Estimated price/);
  assert.doesNotMatch(nodes.price.textContent,/subject to shop review/);
  assert.equal(nodes.submit.textContent,'Send design for quote');
});
