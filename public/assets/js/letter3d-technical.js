/** Prepare an illustrative but dimensionally faithful acrylic face/groove view.
 * Face and groove contours are the same mm coordinates used for the DXF.
 * No toolpaths or wall depth are inferred from this preview.
 */
const SCALE=10000;
function fail(message){throw new Error(message)}
function toPaths(contours,label){
  if(!Array.isArray(contours)||!contours.length)fail(`Missing ${label} contours.`);
  return contours.map(contour=>{
    if(!Array.isArray(contour)||contour.length<3)fail(`Invalid ${label} contour.`);
    return contour.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)fail(`Invalid ${label} coordinate.`);return {X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}});
  });
}
function toContours(paths){return paths.map(path=>path.map(p=>({x:p.X/SCALE,y:p.Y/SCALE})));}
function area(C,paths){return Math.abs(paths.reduce((sum,path)=>sum+C.Clipper.Area(path),0))/(SCALE*SCALE);}
function boolean(C,subject,clip,type){
  const op=new C.Clipper(),out=[];op.AddPaths(subject,C.PolyType.ptSubject,true);
  if(clip.length)op.AddPaths(clip,C.PolyType.ptClip,true);
  if(!op.Execute(type,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero))fail('Could not prepare the groove preview.');
  return out;
}
export function prepareLetter3DAcrylicLayers(plan,C){
  if(!C?.Clipper || !C?.ClipperOffset || !plan || !Array.isArray(plan.pieces) || !plan.pieces.length)fail('A complete manufacturing plan is required.');
  const settings=plan.settings || {},thickness=settings.face_thickness_mm,depth=settings.groove_depth_mm,width=settings.groove_width_mm;
  if(!Number.isFinite(thickness)||!Number.isFinite(depth)||!Number.isFinite(width)||thickness<=0||depth<=0||depth>=thickness||width<=0||width>100)fail('Invalid acrylic or groove dimensions.');
  const pieces=plan.pieces.map(piece=>{
    if(!piece || !Number.isInteger(piece.line) || piece.line<0 || piece.line>7)fail('Invalid lettering line.');
    const face=toPaths(piece.face,'face'),center=toPaths(piece.groove_center,'groove cutter centre');
    const stroker=new C.ClipperOffset(2,.005*SCALE),raw=[];
    stroker.AddPaths(center,C.JoinType.jtRound,C.EndType.etClosedLine);stroker.Execute(raw,width*SCALE/2);
    if(!raw.length)fail('The groove preview could not be created.');
    const bands=boolean(C,raw,[],C.ClipType.ctUnion);
    if(!bands.length)fail('The groove preview could not be created.');
    const outside=boolean(C,bands,face,C.ClipType.ctDifference);
    if(area(C,outside)>.002)fail('The groove would break through the acrylic edge.');
    const relieved=boolean(C,face,bands,C.ClipType.ctDifference);
    if(!relieved.length || area(C,relieved)<.001)fail('The groove leaves too little acrylic.');
    return {line:piece.line,face:toContours(face),back:toContours(relieved)};
  });
  return {pieces,face_thickness_mm:thickness,groove_depth_mm:depth,groove_width_mm:width};
}
