/**
 * Export 3D-letter manufacturing vectors in millimetres for CAM review.
 * A DXF contains geometry, not safe machine instructions: the groove depth,
 * tool diameter, stock setup and back-face orientation must be set in CAM.
 */
export function buildLetter3dDxf(geometry) {
  if (!geometry || typeof geometry !== 'object') throw new Error('Generate valid lettering geometry before exporting.');
  const config=geometry.settings;
  if (!config || !['outside','centreline'].includes(config.overhang_reference)) throw new Error('Set the overhang reference in the ERP before exporting.');
  const finite = (value, name, min, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value<min || value>max) throw new Error(`Set a valid ${name} in the ERP before exporting.`);
    return value;
  };
  const overhang=finite(config.overhang_mm,'face overhang',0,100);
  const side=finite(config.side_thickness_mm,'side thickness',0.05,20);
  const width=finite(config.groove_width_mm,'groove width',0.01,100);
  const depth=finite(config.groove_depth_mm,'groove depth',0.01,100);
  const faceThickness=finite(config.face_thickness_mm,'face thickness',0.1,100);
  if (width < side || depth >= faceThickness) throw new Error('The groove must fit the side and remain shallower than the acrylic face.');
  if (Math.abs(width-1.2)>1e-7 || Math.abs(depth-1.2)>1e-7 || config.edge_remaining_mm!==0.8) throw new Error('This export requires the 1.2 mm outside-cut method and 0.8 mm edge.');
  const bounds=geometry.bounds_mm;
  if (!bounds || typeof bounds !== 'object') throw new Error('The drawing dimensions are missing.');
  const expectedWidth=finite(bounds.width,'drawing width',0.01,100000);
  const expectedHeight=finite(bounds.height,'drawing height',0.01,100000);
  let totalPoints=0;
  const clean = (source, name) => {
    if (!Array.isArray(source) || !source.length || source.length>50000) throw new Error(`The ${name} contours are missing or too complex.`);
    return source.map(contour=>{
      if (!Array.isArray(contour) || contour.length>200000) throw new Error(`A ${name} contour is invalid or too complex.`);
      const points=[];
      for (const point of contour) {
        if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x)>100000 || Math.abs(point.y)>100000) throw new Error(`A ${name} coordinate is invalid.`);
        const x=Math.round(point.x*1000)/1000, y=Math.round(point.y*1000)/1000;
        if (!points.length || x!==points.at(-1).x || y!==points.at(-1).y) points.push({x,y});
      }
      if(points.length>1 && points[0].x===points.at(-1).x && points[0].y===points.at(-1).y)points.pop();
      if(points.length<3) throw new Error(`A ${name} contour is too small or open.`);
      // A polygon collapsed at output precision must not be sent to a machine.
      let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
      if(!Number.isFinite(area)||Math.abs(area)<0.000001)throw new Error(`A ${name} contour is degenerate.`);
      totalPoints+=points.length;if(totalPoints>500000)throw new Error('The drawing is too complex to export safely.');
      return points;
    });
  };
  const face=clean(geometry.face,'face'),groove=clean(geometry.groove,'groove');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const contour of face)for(const {x,y} of contour){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const tolerance=.02;
  if(Math.abs(minX)>tolerance||Math.abs(minY)>tolerance||Math.abs(maxX-minX-expectedWidth)>tolerance||Math.abs(maxY-minY-expectedHeight)>tolerance) throw new Error('The face geometry and reported dimensions do not agree.');
  for(const contour of groove)for(const {x,y} of contour) if(x<minX-tolerance||x>maxX+tolerance||y<minY-tolerance||y>maxY+tolerance)throw new Error('A groove falls outside the face bounds and needs shop review.');
  const number=value=>String(Number(value.toFixed(3)));
  const instructions=[
    'Vectors only: inspect all contours and verify the imported dimensions are in millimetres before machining.',
    `In Aspire use a ${number(width)} mm bit at ${number(depth)} mm depth, cutting from GROOVE_REFERENCE toward the face edge: outside external contours and inside openings. Verify each toolpath; the groove must leave 0.8 mm acrylic at every edge.`,
    'Confirm how the acrylic is turned over and mirror the back-face groove if your setup requires it.',
    'The reference is 2 mm from the face edge; it is not the cutter centreline. A DXF cannot set the cutting side, bit or depth. Check the toolpath and test the fit before cutting.',
  ];
  let handle=0x10;const nextHandle=()=> (handle++).toString(16).toUpperCase();
  const out=[];const pair=(code,value)=>{out.push(String(code),String(value));};
  pair(999,'VECTORS FOR CAM REVIEW ONLY - CHECK UNITS, TOOL, DEPTH AND BACK-FACE MIRROR');
  for (const instruction of instructions) pair(999, instruction);
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,4);pair(9,'$MEASUREMENT');pair(70,1);pair(9,'$LUNITS');pair(70,2);pair(0,'ENDSEC');
  pair(0,'SECTION');pair(2,'TABLES');
  pair(0,'TABLE');pair(2,'LTYPE');pair(5,nextHandle());pair(100,'AcDbSymbolTable');pair(70,1);
  pair(0,'LTYPE');pair(5,nextHandle());pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLinetypeTableRecord');pair(2,'CONTINUOUS');pair(70,0);pair(3,'Solid line');pair(72,65);pair(73,0);pair(40,0);pair(0,'ENDTAB');
  pair(0,'TABLE');pair(2,'LAYER');pair(5,nextHandle());pair(100,'AcDbSymbolTable');pair(70,3);
  for(const [layer,colour] of [['0',7],['FACE_CUT',3],['GROOVE_REFERENCE',1]]) {
    pair(0,'LAYER');pair(5,nextHandle());pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLayerTableRecord');pair(2,layer);pair(70,0);pair(62,colour);pair(6,'CONTINUOUS');
  }
  pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'BLOCKS');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');
  for(const [layer,paths] of [['FACE_CUT',face],['GROOVE_REFERENCE',groove]]) for(const contour of paths) {
    pair(0,'LWPOLYLINE');pair(5,nextHandle());pair(100,'AcDbEntity');pair(8,layer);pair(100,'AcDbPolyline');pair(90,contour.length);pair(70,1);
    for(const {x,y} of contour){pair(10,number(x));pair(20,number(y));}
  }
  pair(0,'ENDSEC');pair(0,'EOF');
  return {dxf:out.join('\r\n')+'\r\n',instructions};
}
