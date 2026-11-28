'use strict';
// Exercise actual editor gesture handlers with a controllable pointer stream.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/assets/js/letter3d-editor.js'),'utf8');
const start=source.indexOf('  // Turn only the dimensional preview.');
const end=source.indexOf('  // Zoom affects only the preview',start);
assert(start>=0 && end>start,'Orbit gesture handlers must be present');
const listeners={},calls=[],classes=new Set();
const viewport={dataset:{render:'three'},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn)},setPointerCapture:id=>calls.push(['capture',id])};
const threeRenderer={orbitBy:(x,y)=>calls.push(['orbit',x,y])};
vm.runInNewContext(source.slice(start,end),{viewport,threeRenderer,Set});
function fire(type,props={}){let prevented=false;const e={pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:0,clientY:0,cancelable:true,preventDefault(){prevented=true},...props};for(const fn of listeners[type]||[])fn(e);return prevented}
function turns(){return calls.filter(x=>x[0]==='orbit')}
fire('pointerdown',{button:2});fire('pointermove',{clientX:15});assert.equal(turns().length,0,'Right mouse button must not turn preview');
fire('pointerdown',{clientX:10,clientY:20});assert(classes.has('is-orbiting'));assert.equal(fire('pointermove',{clientX:40,clientY:26}),true);assert.deepEqual(turns()[0],['orbit',30,6]);
fire('pointerup');assert(!classes.has('is-orbiting'));fire('pointermove',{clientX:55});assert.equal(turns().length,1,'Released pointer cannot turn preview');
fire('pointerdown',{pointerType:'touch',pointerId:4,clientX:10});fire('pointermove',{pointerType:'touch',pointerId:4,clientX:20});assert.equal(turns().length,2);
fire('pointerdown',{pointerType:'touch',pointerId:5,clientX:30});assert(!classes.has('is-orbiting'),'Second touch cancels orbit');fire('pointermove',{pointerType:'touch',pointerId:4,clientX:50});assert.equal(turns().length,2,'Pinch pointers cannot turn preview');fire('pointerup',{pointerType:'touch',pointerId:4});fire('pointerup',{pointerType:'touch',pointerId:5});
fire('pointerdown',{pointerType:'touch',pointerId:6,clientX:10});fire('pointermove',{pointerType:'touch',pointerId:6,clientX:12});assert.equal(turns().length,3,'A new single touch can turn after pinch');fire('pointercancel',{pointerType:'touch',pointerId:6});
viewport.dataset.render='flat';fire('pointerdown');fire('pointermove',{clientX:60});assert.equal(turns().length,3,'2D fallback cannot orbit');assert.equal(fire('keydown',{key:'ArrowLeft'}),false);
viewport.dataset.render='three';assert.equal(fire('keydown',{key:'ArrowLeft'}),true);assert.deepEqual(turns().at(-1),['orbit',-18,0]);assert.equal(fire('keydown',{key:'Enter'}),false);
assert.match(source,/letterZoom === 'fit'\) \{ setZoom\(1\); threeRenderer\?\.resetOrbit\?\.\(\)/,'Fit resets zoom and orbit');
assert.match(source,/fromLegacy\(\); scene = 'studio'; zoom = 1; threeRenderer\?\.resetOrbit\?\.\(\)/,'Start over resets orbit');
console.log('3D preview orbit gestures, multitouch, keyboard and resets passed.');
