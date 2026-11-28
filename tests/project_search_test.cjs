'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/assets/js/quote-steps.js'),'utf8');
const begin=source.indexOf("  const search = start.querySelector('#project-search');"), end=source.indexOf("  const answer = workspace.querySelector('#guide-answer');",begin);
assert(begin>=0&&end>begin,'Project search block is present');
function element(){return {value:'',textContent:'',hidden:false,events:{},addEventListener(type,fn){this.events[type]=fn},focus(){this.focused=true}}}
const search=element(), clear=element(), count=element(), empty=element();
const nodes={'#project-search':search,'#project-clear':clear,'#project-count':count,'#project-empty':empty};
const projects=[{textContent:'Laser cut acrylic',dataset:{keywords:'CO2 Plexiglass'},hidden:false},{textContent:'Neon sign',dataset:{keywords:'LED'},hidden:false},{textContent:'Ακρυλικό γράμματα',dataset:{keywords:'σημανση'},hidden:false}];
vm.runInNewContext(source.slice(begin,end),{start:{querySelector:s=>nodes[s]},projects});
assert.equal(count.textContent,'3 projects available');assert.equal(clear.hidden,true);assert.equal(empty.hidden,true);
search.value='laser CO2';search.events.input();assert.equal(count.textContent,'1 project found');assert.equal(projects[0].hidden,false);assert.equal(projects[1].hidden,true);assert.equal(clear.hidden,false);
search.value='ακρυλικο';search.events.input();assert.equal(count.textContent,'1 project found');assert.equal(projects[2].hidden,false,'Unaccented Greek matches accented text');
search.value='does-not-exist';search.events.input();assert.equal(count.textContent,'0 projects found');assert.equal(empty.hidden,false);
clear.events.click();assert.equal(search.value,'');assert.equal(count.textContent,'3 projects available');assert.equal(search.focused,true);assert.equal(empty.hidden,true);
search.value='neon';search.events.input();let prevented=false;search.events.keydown({key:'Escape',preventDefault(){prevented=true}});assert.equal(search.value,'');assert.equal(prevented,true);assert.equal(count.textContent,'3 projects available');
console.log('Project search, count, accents and clear checks passed.');
