'use strict';
// Real browser check of assembled sign, removable PVC, lights and backboard.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
if(!fs.existsSync(chrome)||typeof WebSocket==='undefined'){console.log('Skipped sign WebGL check: Chrome or Node WebSocket unavailable.');process.exit(0)}
const fixture=`<!doctype html><style>body{margin:0;background:#202735}#stage{width:700px;height:350px}</style><div id="stage"></div><script src="/public/assets/js/neon-clipper.js"></script><script type="module">import {createLetter3DRenderer} from '/public/assets/js/letter3d-renderer.js';window.ready=(async()=>{window.r=await createLetter3DRenderer(document.getElementById('stage'));return true})()</script>`;
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(fixture);return}if(!pathname.startsWith('/public/')){res.writeHead(404).end();return}const f=path.resolve(root,'.'+pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.ttf')?'font/ttf':'application/octet-stream'}).end(fs.readFileSync(f))}catch(_){res.writeHead(404).end()}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let proc,ws;
server.listen(0,'127.0.0.1',async()=>{try{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adotind-sign-gl-'));proc=spawn(chrome,['--headless=new','--disable-gpu-sandbox','--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch(_){await pause(100)}}if(!debugPort)throw Error('Chrome failed to start');
 const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('http://127.0.0.1:'+server.address().port+'/')}`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};await send('Page.enable');await send('Runtime.enable');for(let i=0;i<80 && !await evaluate('Boolean(window.ready)');i++)await pause(100);
 assert.equal(await evaluate('window.ready'),true,'Assembled renderer must initialise');
 const rectangle=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const face=[rectangle(0,0,102.6,52.6)],groove=[rectangle(1.3,1.3,100,50)];
 const plan={pieces:[{line:0,face,groove,groove_center:groove}],face,groove,bounds_mm:{width:102.6,height:52.6},settings:{face_thickness_mm:3,side_thickness_mm:.6,groove_width_mm:1.2,groove_depth_mm:1.2}};
 const line={text:'A',font:'sans',colour:'#ffffff',side_colour:'#0044ff',x:0,y:0,rotation:0};
 const options={totalDepthMm:60,backThicknessMm:10,backVisible:true,backboard:{shape:'none',colour:'clear',margin_mm:0}};
 let result=await evaluate(`(async()=>await window.r.updateSign(${JSON.stringify(plan)},${JSON.stringify([line])},window.ClipperLib,${JSON.stringify(options)}))()`);assert.equal(result.rendered,true);
 // This solid rectangular fixture covers the centre pixel from front and back.
 const sampleCentre=()=>evaluate(`(()=>{
   const canvas=document.querySelector('#stage canvas');
   const gl=canvas.getContext('webgl2') || canvas.getContext('webgl');
   window.r.setZoom(1);
   const pixel=new Uint8Array(4);
   gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   return Array.from(pixel);
 })()`);
 function checkWhite(pixel,minimum,surface) {
   const rgb=pixel.slice(0,3);
   assert.ok(pixel[3]===255 && Math.min(...rgb)>=minimum && Math.max(...rgb)-Math.min(...rgb)<=2,surface+' RGB '+rgb);
 }
 await evaluate('window.r.setLights(false)');const unlitFace=await sampleCentre();checkWhite(unlitFace,228,'White face with LEDs off');
 await evaluate('window.r.setLights(true)');const litFace=await sampleCentre();checkWhite(litFace,250,'Illuminated white face');
 assert.ok(litFace[0]>=unlitFace[0]+5,'Switching on the white face should visibly raise brightness');
 await evaluate('window.r.orbitBy(400,0)');const litBack=await sampleCentre();checkWhite(litBack,228,'White PVC rear');
 await evaluate('window.r.setLights(false)');assert.deepEqual(await sampleCentre(),litBack,'PVC reflects studio light in either LED state');
 await evaluate('window.r.resetOrbit();window.r.setLights(true)');
 await evaluate('window.r.orbitBy(400,0)');const backOn=await send('Page.captureScreenshot',{format:'png'});
 await evaluate('window.r.setBackVisible(false)');const backOff=await send('Page.captureScreenshot',{format:'png'});assert.notEqual(backOff.data,backOn.data,'PVC visibility must change the rear view');
 await evaluate('window.r.resetOrbit();window.r.setLights(false)');const dark=await send('Page.captureScreenshot',{format:'png'});await evaluate('window.r.setLights(true)');const light=await send('Page.captureScreenshot',{format:'png'});assert.notEqual(light.data,dark.data,'Lighting and face glow must change preview');if(process.env.LETTER3D_TEST_SCREENSHOT)fs.writeFileSync(process.env.LETTER3D_TEST_SCREENSHOT,Buffer.from(light.data,'base64'));
 await evaluate(`(async()=>await window.r.updateSign(${JSON.stringify(plan)},${JSON.stringify([line])},window.ClipperLib,${JSON.stringify({...options,backVisible:false,backboard:{shape:'rectangle',colour:'#dd1111',margin_mm:10}})}))()`);const noBoard=await send('Page.captureScreenshot',{format:'png'});assert.notEqual(noBoard.data,backOff.data,'Board choice changes preview independently of PVC');
 await evaluate('window.r.destroy()');console.log('Real Chrome assembled sign: back toggle, board and lighting passed.');
 }catch(e){console.error(e);process.exitCode=1}finally{ws?.close();proc?.kill();server.close()}});
