'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..');
(async()=>{
  const THREE=await import('../public/assets/js/quote-vendor/three-0.160.1.module.min.js');
  const {fontPathToShapes}=await import('../public/assets/js/letter3d-geometry.js');
  const opentype=require('../public/assets/js/quote-vendor/opentype-1.3.4.min.js');
  const load=(name)=>{const b=fs.readFileSync(path.join(root,'public/assets/fonts/letter3d',name));return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
  for (const name of ['AlegreyaSans-Regular.ttf','LibertinusSerif-Regular.ttf','GreatVibes-Regular.ttf']) {
    const font=load(name);
    for (const [char,minHoles] of [['O',1],['B',2],['8',2]]) {
      const glyph=font.charToGlyph(char), shapes=fontPathToShapes(THREE,glyph.getPath(0,0,100).commands);
      assert(shapes.length>0,`${name} ${char}: no shapes`);
      assert(shapes.reduce((n,s)=>n+s.holes.length,0)>=minHoles,`${name} ${char}: missing counter holes`);
      const geometry=new THREE.ExtrudeGeometry(shapes,{depth:12,bevelEnabled:false,curveSegments:10});
      assert(geometry.getAttribute('position').count>0,`${name} ${char}: no extrusion vertices`);
      if (char === 'O') {
        const hole=shapes.find(s=>s.holes.length).holes[0].getPoints(24);
        const inside=(poly,p)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
        const sample={x:hole.reduce((n,p)=>n+p.x,0)/hole.length,y:hole.reduce((n,p)=>n+p.y,0)/hole.length};
        assert(inside(hole,sample),`${name} O test sample must be inside its counter`);
        const a=geometry.getAttribute('position');let painted=false;
        const side=(p,q,r)=>(p.x-r.x)*(q.y-r.y)-(q.x-r.x)*(p.y-r.y);
        for(let i=0;i<a.count;i+=3){if(Math.abs(a.getZ(i)-12)>1e-6||Math.abs(a.getZ(i+1)-12)>1e-6||Math.abs(a.getZ(i+2)-12)>1e-6)continue;const p={x:a.getX(i),y:a.getY(i)},q={x:a.getX(i+1),y:a.getY(i+1)},r={x:a.getX(i+2),y:a.getY(i+2)};const u=side(sample,p,q),v=side(sample,q,r),w=side(sample,r,p);if((u>=0&&v>=0&&w>=0)||(u<=0&&v<=0&&w<=0)){painted=true;break;}}
        assert(!painted,`${name} O counter was filled by front triangles`);
      }
      geometry.dispose();
    }
    const c=fontPathToShapes(THREE,font.charToGlyph('C').getPath(0,0,100).commands);
    assert(c.length,`${name} C: no shapes`);
    if (name !== 'GreatVibes-Regular.ttf') assert.equal(c.reduce((n,s)=>n+s.holes.length,0),0,`${name} C: open letter has erroneous hole`);
  }
  // A nested counter containing an island must produce two solids and one hole.
  const contour=(coords)=>coords.map(([x,y],i)=>({type:i?'L':'M',x,y})).concat({type:'Z'});
  const commands=[...contour([[0,0],[100,0],[100,100],[0,100]]),...contour([[20,20],[80,20],[80,80],[20,80]]),...contour([[40,40],[60,40],[60,60],[40,60]])];
  const shapes=fontPathToShapes(THREE,commands);
  assert.equal(shapes.length,2);assert.equal(shapes.reduce((n,s)=>n+s.holes.length,0),1);
  console.log('3D font extrusion geometry checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
