/** Geometry for a preview of the shop's assembled dimensional letters.
 * Uses the same millimetre face and wall-centre contours as the cutting DXF.
 * The exact PVC/aluminium joint is not specified; the rear fitting is visual only.
 */
const SCALE=10000;
const err=message=>{throw new Error(message)};
function paths(contours){
  if(!Array.isArray(contours)||!contours.length)err('Missing letter contours.');
  return contours.map(contour=>{
    if(!Array.isArray(contour)||contour.length<3)err('Invalid letter contour.');
    return contour.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))err('Invalid letter coordinate.');return {X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}});
  });
}
function contours(v){return v.map(p=>p.map(q=>({x:q.X/SCALE,y:q.Y/SCALE})));}
function offset(C,paths,amount,end){
  const out=[],o=new C.ClipperOffset(2,.005*SCALE);
  o.AddPaths(paths,C.JoinType.jtRound,end);o.Execute(out,amount*SCALE);
  if(!out.length)err('The side or rear panel cannot be represented safely.');
  return out;
}
export function prepareLetter3DSignLayers(plan,C,{totalDepthMm,backThicknessMm,backboard={shape:'none',colour:'clear',margin_mm:0}}={}){
  if(!C?.Clipper||!C?.ClipperOffset||!plan||!Array.isArray(plan.pieces)||!plan.pieces.length)err('A measured cutting plan is required.');
  const {face_thickness_mm:face,side_thickness_mm:side,groove_depth_mm:groove}=plan.settings||{};
  if(![30,60,100].includes(Number(totalDepthMm))||!Number.isFinite(Number(backThicknessMm))||Number(backThicknessMm)<=0||!Number.isFinite(face)||face<=0||!Number.isFinite(side)||side<=0||!Number.isFinite(groove)||groove<=0||groove>=face||Number(totalDepthMm)<=face+Number(backThicknessMm))err('Choose a valid total depth and rear thickness.');
  totalDepthMm=Number(totalDepthMm);backThicknessMm=Number(backThicknessMm);
  if(!backboard || !['none','rectangle'].includes(backboard.shape))err('Invalid backboard choice.');
  if(backboard.shape==='rectangle' && !(backboard.colour==='clear'||/^#[0-9a-f]{6}$/i.test(backboard.colour||'')))err('Invalid backboard colour.');
  const margin=Number(backboard.margin_mm);
  if(backboard.shape==='rectangle'&&(!Number.isFinite(margin)||margin<0||margin>500))err('Invalid backboard margin.');
  const pieces=plan.pieces.map(piece=>{
    if(!piece||!Number.isInteger(piece.line)||piece.line<0||piece.line>7)err('Invalid line.');
    // Seat the return within the routed slot at the ERP face overhang.
    const settings=plan.settings;
    const desiredCentre=settings.overhang_mm+(settings.overhang_reference==='outside'?side/2:0);
    const slotCentre=settings.edge_remaining_mm+settings.groove_width_mm/2;
    const play=(settings.groove_width_mm-side)/2;
    const shift=Number.isFinite(desiredCentre)&&Number.isFinite(slotCentre)
      ? Math.max(-play,Math.min(play,slotCentre-desiredCentre)) : 0;
    const slot=paths(piece.groove_center);
    const centre=Math.abs(shift)>.0001 ? offset(C,slot,shift,C.EndType.etClosedPolygon) : slot;
    const wall=offset(C,centre,side/2,C.EndType.etClosedLine);
    const back=offset(C,centre,-side/2,C.EndType.etClosedPolygon);
    return {line:piece.line,wall:contours(wall),back:contours(back)};
  });
  const rearZ=face-totalDepthMm;
  return {pieces,face_thickness_mm:face,side_thickness_mm:side,groove_depth_mm:groove,back_thickness_mm:backThicknessMm,total_depth_mm:totalDepthMm,rear_z_mm:rearZ,
    backboard:backboard.shape==='rectangle'?{shape:'rectangle',colour:backboard.colour,margin_mm:margin}: {shape:'none'}};
}
