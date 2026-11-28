'use strict';
// Headless Chrome integration check using a throwaway loopback site and fixture text.
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');const chrome=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if(!fs.existsSync(chrome)){console.log('Skipped WebGL integration: Chrome not found; set CHROME_PATH.');process.exit(0)}
const fixture=`<!doctype html><meta name="viewport" content="width=device-width"><style>body{background:#202735;margin:0}#stage{width:700px;height:350px;background:#202735}</style><div id="stage"></div><script type="module">import {createLetter3DRenderer} from '/public/assets/js/letter3d-renderer.js';window.ready=(async()=>{window.r=await createLetter3DRenderer(document.getElementById('stage'),{onUnavailable:code=>window.lossCode=code});return true})()</script>`;
const server=http.createServer((req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fixture);return}const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith('/public/')){res.writeHead(404).end();return}const f=path.resolve(root,'.'+pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{const body=fs.readFileSync(f);res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.ttf')?'font/ttf':'application/octet-stream'});res.end(body)}catch(_){res.writeHead(404).end()}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let proc,ws;
server.listen(0,'127.0.0.1',async()=>{try{
 const port=server.address().port,dir=fs.mkdtempSync(path.join(os.tmpdir(),'adotind-webgl-test-'));
 proc=spawn(chrome,['--headless=new','--disable-gpu-sandbox','--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch(_){await pause(100)}}if(!debugPort)throw Error('Chrome failed to start');
 const target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('http://127.0.0.1:'+port+'/')}`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};await send('Page.enable');await send('Runtime.enable');await pause(900);
 assert.equal(await evaluate('(async()=>await window.ready)()'),true,'WebGL renderer must initialise');
 const common={font:'sans',colour:'#ff9900',x:0,y:0,rotation:0};const line=text=>({...common,text});
 const first=await evaluate(`(async()=>await window.r.update(${JSON.stringify([line('O8B')])}))()`);assert.equal(first.rendered,true,'Solid letters must render');
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'adotind-letter3d-webgl.png'),Buffer.from(shot.data,'base64'));
 const coloured=await evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${shot.data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;let n=0;for(let k=0;k<p.length;k+=4)if(p[k]>120&&p[k]>p[k+2]*1.25&&p[k+1]>45)n++;return n})()`);assert.ok(coloured>100,'Rendered O8B should produce visible coloured pixels; count='+coloured);
 // Orbit changes only the preview. It must survive regenerating the same text,
 // reset precisely to the starting angle, and reject non-finite drag deltas.
 await evaluate('window.r.orbitBy(75,35)');
 const orbited=await send('Page.captureScreenshot',{format:'png'});
 assert.notEqual(orbited.data,shot.data,'Dragging should visibly rotate the extrusion');
 await evaluate(`(async()=>await window.r.update(${JSON.stringify([line('O8B')])}))()`);
 const rebuilt=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(rebuilt.data,orbited.data,'An edit/update must preserve the preview orbit');
 await evaluate('window.r.orbitBy(Infinity,NaN)');
 const invalidDrag=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(invalidDrag.data,rebuilt.data,'Non-finite drag coordinates must have no effect');
 await evaluate('window.r.resetOrbit()');
 const reset=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(reset.data,shot.data,'Reset view must restore the original orbit');
 await evaluate('window.r.orbitBy(0,100000)');
 const clamped=await send('Page.captureScreenshot',{format:'png'});
 await evaluate('window.r.orbitBy(0,100000)');
 const stillClamped=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(clamped.data,stillClamped.data,'Pitch must stop at its upper bound');
 await evaluate('window.r.resetOrbit()');
 // Separate face and side colours must be simultaneously visible in actual WebGL.
 const colourDesign={...line('O8B'),colour:'#ff1800',side_colour:'#0044ff'};
 assert.equal((await evaluate(`(async()=>await window.r.update(${JSON.stringify([colourDesign])}))()`)).rendered,true);
 await evaluate('window.r.orbitBy(55,0)');
 const dual=await send('Page.captureScreenshot',{format:'png'});
 const pixels=await evaluate(`(async()=>{const image=new Image();image.src='data:image/png;base64,${dual.data}';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let front=0,side=0;for(let i=0;i<data.length;i+=4){let r=data[i],g=data[i+1],b=data[i+2];if(r>100&&r>b*1.5&&r>g*1.2)front++;if(b>90&&b>r*1.5&&b>g*1.2)side++}return {front,side}})()`);
 assert.ok(pixels.front>100 && pixels.side>25,'Both chosen face and side colours should be visible: '+JSON.stringify(pixels));
 // Front light is a preview-only material state: the selected side colour
 // remains unchanged, and the setting survives rebuilding geometry.
 await evaluate('window.r.setLights(false)');
 const redOff=await send('Page.captureScreenshot',{format:'png'});
 await evaluate('window.r.setLights(true)');
 const redOn=await send('Page.captureScreenshot',{format:'png'});
 const differences=await evaluate(`(async()=>{const decode=async src=>{const i=new Image();i.src='data:image/png;base64,'+src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data};const off=await decode('${redOff.data}'),on=await decode('${redOn.data}');let brightFace=0,stableSide=0;for(let i=0;i<off.length;i+=4){if(on[i]>off[i]+8&&on[i]>on[i+1]*1.4&&on[i]>on[i+2]*1.4)brightFace++;if(off[i+2]>70&&off[i+2]>off[i]*1.5&&off[i+2]>off[i+1]*1.2&&Math.abs(on[i]-off[i])<3&&Math.abs(on[i+1]-off[i+1])<3&&Math.abs(on[i+2]-off[i+2])<3)stableSide++}return {brightFace,stableSide}})()`);
 assert.ok(differences.brightFace>100 && differences.stableSide>25,'Turning on must brighten the red face while leaving blue sides unchanged: '+JSON.stringify(differences));
 const whiteDesign={...line('O8B'),colour:'#ffffff',side_colour:'#0044ff'};
 await evaluate('window.r.setLights(false)');
 await evaluate(`(async()=>await window.r.update(${JSON.stringify([whiteDesign])}))()`);
 const whiteOff=await send('Page.captureScreenshot',{format:'png'});
 await evaluate(`(async()=>await window.r.update(${JSON.stringify([whiteDesign])}))()`);
 const rebuiltOff=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(rebuiltOff.data,whiteOff.data,'Off state must survive regeneration');
 await evaluate('window.r.setLights(true)');
 const whiteOn=await send('Page.captureScreenshot',{format:'png'});
 const whiteBright=await evaluate(`(async()=>{const decode=async src=>{const i=new Image();i.src='data:image/png;base64,'+src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data};const off=await decode('${whiteOff.data}'),on=await decode('${whiteOn.data}');let n=0;for(let i=0;i<off.length;i+=4)if(on[i]>off[i]+6&&on[i+1]>off[i+1]+6&&on[i+2]>off[i+2]+6)n++;return n})()`);
 assert.ok(whiteBright>100,'Turning on must visibly brighten a white opal face; pixels='+whiteBright);

 // Only the front cap lights up. Looking from behind leaves the white PVC
 // visual back and aluminium sides unchanged when the lights switch.
 await evaluate('window.r.resetOrbit(); window.r.setLights(false); window.r.orbitBy(Math.PI/.008,0)');
 const backOff=await send('Page.captureScreenshot',{format:'png'});
 await evaluate('window.r.setLights(true)');
 const backOn=await send('Page.captureScreenshot',{format:'png'});
 assert.equal(backOn.data,backOff.data,'The back and sides must not light up with the front');
 // Finish is illustrative, but both settings must reach the 3D material.
 await evaluate('window.r.resetOrbit(); window.r.setLights(false)');
 const matteDesign={...line('O8B'),colour:'#c0c0c0',side_colour:'#0044ff',front_finish:'matt',side_finish:'matt'};
 const glossyDesign={...matteDesign,front_finish:'gloss',side_finish:'gloss'};
 assert.equal((await evaluate(`(async()=>await window.r.update(${JSON.stringify([matteDesign])}))()`)).rendered,true);
 const matte=await send('Page.captureScreenshot',{format:'png'});
 assert.equal((await evaluate(`(async()=>await window.r.update(${JSON.stringify([glossyDesign])}))()`)).rendered,true);
 const glossy=await send('Page.captureScreenshot',{format:'png'});
 assert.notEqual(matte.data,glossy.data,'Gloss and matt must produce visibly different materials');
 const badFinish=await evaluate(`(async()=>{try{await window.r.update(${JSON.stringify([{...matteDesign,front_finish:'bad'}])});return 'not-rejected'}catch(e){return e.code}})()`);
 assert.equal(badFinish,'design','Invalid finish must be rejected');
 await evaluate('window.r.setLights(true)');

 await evaluate('window.r.resetOrbit()');
 for(const font of ['serif','script']){const result=await evaluate(`(async()=>await window.r.update(${JSON.stringify([{...line('O8B'),font}])}))()`);assert.equal(result.rendered,true,font+' must render');const picture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'adotind-letter3d-'+font+'.png'),Buffer.from(picture.data,'base64'));}
 const greek=await evaluate(`(async()=>await window.r.update(${JSON.stringify([line('Καλημέρα')])}))()`);assert.equal(greek.rendered,true,'Greek must render in the sans font');
 const bad=await evaluate(`(async()=>{try{await window.r.update(${JSON.stringify([{...line('Αθήνα'),font:'script'}])});return 'not-rejected'}catch(e){return e.code}})()`);assert.equal(bad,'glyph','Unsupported script glyphs must raise a fallback signal');
 const stale=await evaluate(`(async()=>{let a=window.r.update(${JSON.stringify([line('First')])});let b=window.r.update(${JSON.stringify([line('Second')])});return await Promise.all([a,b])})()`);assert.equal(stale[0].stale,true,'Old render should be discarded');assert.equal(stale[1].rendered,true,'Latest render should be shown');
 // The technical acrylic view uses the exact same manufacturing plan as DXF.
 const technical=await evaluate(`(async()=>{await import('/public/assets/js/neon-clipper.js');const g=await import('/public/assets/js/letter3d-manufacturing.js');const f=await import('/public/assets/js/letter3d-renderer.js');const lines=[{text:'O8B',font:'sans',colour:'#ff0000',side_colour:'#0044ff',x:0,y:0,rotation:0}];const fonts=await f.loadLetter3DOutlineFonts(lines);const settings={overhang_reference:'outside',overhang_mm:1,side_thickness_mm:.6,groove_width_mm:1.2,groove_depth_mm:1.2,face_thickness_mm:3};const plan=g.buildLetter3DManufacturing({lines,width_mm:500,settings,fonts,clipper:window.ClipperLib});window.technicalPlan=plan;window.technicalLines=lines;window.r.resetOrbit();return await window.r.updateManufacturing(plan,lines,window.ClipperLib)})()`);
 assert.equal(technical.rendered,true,'Technical acrylic must render');assert.equal(technical.mode,'technical');
 const technicalFront=await send('Page.captureScreenshot',{format:'png'});
 await evaluate('window.r.orbitBy(Math.PI/.008,0)');const technicalBack=await send('Page.captureScreenshot',{format:'png'});
 assert.notEqual(technicalFront.data,technicalBack.data,'Rear groove view must differ from front');
 const cyan=await evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${technicalBack.data}';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const p=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let k=0;k<p.length;k+=4)if(p[k]<70&&p[k+1]>110&&p[k+2]>110)n++;return n})()`);
 assert.ok(cyan>10,'Rear view must show cyan groove centreline; pixels='+cyan);
 const invalidTechnical=await evaluate(`(async()=>{try{let bad=structuredClone(window.technicalPlan);bad.settings.groove_depth_mm=3;await window.r.updateManufacturing(bad,window.technicalLines,window.ClipperLib);return false}catch(e){return true}})()`);
 assert.equal(invalidTechnical,true,'Invalid groove depth must be rejected');
 await evaluate('window.r.resetOrbit()');assert.equal((await evaluate(`(async()=>await window.r.update(${JSON.stringify([line('Again')])}))()`)).rendered,true,'Return from technical acrylic to sign preview');
 const lost=await evaluate(`(()=>{let c=document.querySelector('#stage canvas');c.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));return window.lossCode})()`);assert.equal(lost,'webgl_context_lost','Context loss must notify fallback');
 const blocked=await evaluate(`(async()=>{try{await window.r.update(${JSON.stringify([line('Again')])});return 'not-rejected'}catch(e){return e.code}})()`);assert.equal(blocked,'webgl','Rendering after context loss must fail safely');
 const disabled=await evaluate(`(async()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return original.call(this,type,...args)};try{const m=await import('/public/assets/js/letter3d-renderer.js');await m.createLetter3DRenderer(document.getElementById('stage'));return 'not-rejected'}catch(e){return e.code}finally{HTMLCanvasElement.prototype.getContext=original}})()`);assert.equal(disabled,'webgl','Disabled WebGL must produce a safe fallback signal');
 await evaluate('window.r.destroy()');assert.equal(await evaluate("document.querySelectorAll('#stage canvas').length"),0,'Destroyed renderer must remove canvas');
 console.log('Real Chrome WebGL preview, Greek, unsupported-glyph fallback, stale update and context loss checks passed.');
 }catch(e){console.error(e);process.exitCode=1}finally{if(ws)ws.close();if(proc)proc.kill();server.close()}});
