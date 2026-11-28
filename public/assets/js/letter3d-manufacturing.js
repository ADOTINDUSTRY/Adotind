import * as THREE from './quote-vendor/three-0.160.1.module.min.js';
import {fontPathToShapes} from './letter3d-geometry.js';

// The letter outlines are the groove reference. The cutter runs outside that
// reference, toward the acrylic edge, leaving 0.8 mm beyond the cut.
const FONT_SIZE=100, LINE_HEIGHT=120, CLIP_SCALE=10000, MAX_POINTS=180000;
const TOLERANCE_MM=0.01;
const fail = message => { throw new Error(message); };
const finite = (v,min,max,label) => {
  const n=Number(v);
  if (v === null || v === '' || !Number.isFinite(n) || n<min || n>max) fail(`Set a valid ${label}.`);
  return n;
};
function checkedSettings(value) {
  if (!value || !['outside','centreline'].includes(value.overhang_reference)) fail('Choose the reference for the face overhang in the ERP.');
  const s={overhang_reference:value.overhang_reference,
    overhang_mm:finite(value.overhang_mm ?? value.front_offset_mm,0,100,'face overhang'),
    side_thickness_mm:finite(value.side_thickness_mm,.05,20,'aluminium thickness'),
    groove_width_mm:finite(value.groove_width_mm,.01,100,'groove width'),
    groove_depth_mm:finite(value.groove_depth_mm,.01,100,'groove depth'),
    face_thickness_mm:finite(value.face_thickness_mm ?? value.front_thickness_mm,.1,100,'face thickness')};
  if (s.groove_width_mm < s.side_thickness_mm) fail('The groove width is smaller than the aluminium thickness.');
  if (s.groove_depth_mm >= s.face_thickness_mm) fail('The groove must be shallower than the acrylic face.');
  if (Math.abs(s.groove_width_mm-1.2)>1e-7 || Math.abs(s.groove_depth_mm-1.2)>1e-7) fail('This cutting method requires a 1.2 mm bit and 1.2 mm groove depth. Check the ERP settings.');
  s.edge_remaining_mm=0.8;
  const faceOffset=s.groove_width_mm+s.edge_remaining_mm;
  return {s,faceOffset};
}
function distanceToSegment(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
  const t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
// Flatten Bezier curves to a conservative spatial tolerance; checking quarter
// points as well as the midpoint catches S-shaped curves with a flat midpoint.
function flatten(path, tolerance, budget) {
  const points=[];
  const append = p => {
    const q={x:p.x,y:p.y}, last=points.at(-1);
    if (!last || Math.hypot(q.x-last.x,q.y-last.y)>1e-8) {
      if (++budget.count>MAX_POINTS) fail('The lettering is too complex for a reliable cutting preview.');
      points.push(q);
    }
  };
  for (const curve of path.curves) {
    const start=curve.getPoint(0),end=curve.getPoint(1); append(start);
    const subdivide=(a,b,pa,pb,depth)=>{
      const t1=a+(b-a)*.25,tm=(a+b)/2,t3=a+(b-a)*.75;
      const p1=curve.getPoint(t1),pm=curve.getPoint(tm),p3=curve.getPoint(t3);
      const error=Math.max(distanceToSegment(p1,pa,pb),distanceToSegment(pm,pa,pb),distanceToSegment(p3,pa,pb));
      if (error<=tolerance) return append(pb);
      if (depth>=18) fail('A lettering curve cannot be flattened accurately enough.');
      subdivide(a,tm,pa,pm,depth+1);subdivide(tm,b,pm,pb,depth+1);
    };
    subdivide(0,1,start,end,0);
  }
  if(points.length>1 && Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-8) points.pop();
  if(points.length<3) fail('A letter contains a collapsed contour.');
  return points;
}
function bounds(groups) {
  let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
  for(const group of groups) for(const path of group) for(const p of path.points) {
    left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
  }
  if (![left,right,bottom,top].every(Number.isFinite) || right-left<=1e-8 || top-bottom<=1e-8) fail('The lettering has no measurable outline.');
  return {left,right,bottom,top,width:right-left,height:top-bottom};
}
function checkedOutline(commands) {
  let open=false;
  for(const command of commands) {
    if(command.type==='M') {
      if(open) fail('A letter has an open contour and needs artwork review.');
      open=true;
    } else if(command.type==='Z') {
      if(!open) fail('A letter has an invalid contour and needs artwork review.');
      open=false;
    } else if(!open) fail('A letter has an invalid contour and needs artwork review.');
  }
  if(open) fail('A letter has an open contour and needs artwork review.');
  return commands;
}
function makeGlyphGroups(lines,fonts,tolerance) {
  const all=[],budget={count:0}; let glyphCount=0;
  lines.forEach((line,index)=>{
    if (!line || typeof line.text!=='string' || /[\r\n]/.test(line.text) || !fonts[line.font]) fail('Choose a supported font and text for every line.');
    if (/[\p{M}\p{Script=Arabic}\p{Script=Hebrew}]/u.test(line.text)) fail('This script needs manual artwork review.');
    const font=fonts[line.font], x=finite(line.x,-200,200,'line position'),y=finite(line.y,-200,200,'line position'),rotation=finite(line.rotation,-180,180,'line rotation');
    glyphCount+=Array.from(line.text).length;if(glyphCount>120) fail('This design needs manual artwork review.');
    for(const char of line.text) if(!font.charToGlyphIndex(char)) fail('A character is not available in the selected font.');
    const width=font.getAdvanceWidth(line.text,FONT_SIZE,{kerning:true});
    if(!Number.isFinite(width)) fail('The font width could not be calculated.');
    const glyphs=[];
    font.forEachGlyph(line.text,-width/2,0,FONT_SIZE,{kerning:true},(glyph,gx,gy,size)=>{
      const shapes=fontPathToShapes(THREE,checkedOutline(glyph.getPath(gx,gy,size).commands)), paths=[];
      for(const shape of shapes) {
        paths.push({points:flatten(shape,tolerance,budget),hole:false});
        for(const hole of shape.holes) paths.push({points:flatten(hole,tolerance,budget),hole:true});
      }
      if(paths.length) glyphs.push(paths);
    });
    if(!glyphs.length) return;
    const box=bounds(glyphs), mid=(box.bottom+box.top)/2;
    const radians=-rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
    for(const glyph of glyphs) {
      for(const path of glyph) path.points=path.points.map(p=>{
        const py=p.y-mid; return {x:p.x*cos-py*sin+width*x/100,y:p.x*sin+py*cos-index*LINE_HEIGHT-LINE_HEIGHT*y/100};
      });
      glyph.lineIndex=index;
      all.push(glyph);
    }
  });
  if(!all.length) fail('Enter at least one visible letter.');
  return all;
}
function union(clipper,paths) {
  const result=[],c=new clipper.Clipper();
  c.AddPaths(paths,clipper.PolyType.ptSubject,true);
  if(!c.Execute(clipper.ClipType.ctUnion,result,clipper.PolyFillType.pftNonZero,clipper.PolyFillType.pftNonZero)) fail('The letter outlines could not be joined reliably.');
  return result;
}
// Reject ambiguous loops instead of silently letting polygon union repair them.
// A bounded sweep makes the work predictable even for deliberately complex text.
function contoursIntersect(paths, budget) {
  const segments=paths.flatMap((path,pathIndex)=>path.map((a,i)=>{
    const b=path[(i+1)%path.length]; return {a,b,i,pathIndex,n:path.length,minX:Math.min(a.X,b.X),maxX:Math.max(a.X,b.X),minY:Math.min(a.Y,b.Y),maxY:Math.max(a.Y,b.Y)};
  })).sort((a,b)=>a.minX-b.minX);
  const cross=(a,b,c)=>(b.X-a.X)*(c.Y-a.Y)-(b.Y-a.Y)*(c.X-a.X);
  const on=(a,b,c)=>c.X>=Math.min(a.X,b.X)&&c.X<=Math.max(a.X,b.X)&&c.Y>=Math.min(a.Y,b.Y)&&c.Y<=Math.max(a.Y,b.Y);
  for(let i=0;i<segments.length;i++) {
    const a=segments[i];
    for(let j=i+1;j<segments.length && segments[j].minX<=a.maxX;j++) {
      if(++budget.comparisons>5000000) fail('The design is too complex to check safely.');
      const b=segments[j],gap=Math.abs(a.i-b.i);
      if((a.pathIndex===b.pathIndex&&(gap===1||gap===a.n-1))||a.maxY<b.minY||b.maxY<a.minY) continue;
      const p=cross(a.a,a.b,b.a),q=cross(a.a,a.b,b.b),r=cross(b.a,b.b,a.a),s=cross(b.a,b.b,a.b);
      if(((p>0&&q<0)||(p<0&&q>0))&&((r>0&&s<0)||(r<0&&s>0))) return true;
      if((p===0&&on(a.a,a.b,b.a))||(q===0&&on(a.a,a.b,b.b))||(r===0&&on(b.a,b.b,a.a))||(s===0&&on(b.a,b.b,a.b))) return true;
    }
  }
  return false;
}
function offset(clipper,paths,mm) {
  const result=[],c=new clipper.ClipperOffset(2,TOLERANCE_MM*CLIP_SCALE/2);
  c.AddPaths(paths,clipper.JoinType.jtRound,clipper.EndType.etClosedPolygon);c.Execute(result,mm*CLIP_SCALE);
  return result;
}
function solidArea(clipper,paths) {return Math.abs(paths.reduce((a,p)=>a+clipper.Clipper.Area(p),0))/(CLIP_SCALE*CLIP_SCALE);}
function counts(clipper,paths) {return {outer:paths.filter(p=>clipper.Clipper.Orientation(p)).length,holes:paths.filter(p=>!clipper.Clipper.Orientation(p)).length};}
function toContours(paths,origin) {
  return paths.map(path=>path.map(p=>({x:(p.X-origin.x)/CLIP_SCALE,y:(p.Y-origin.y)/CLIP_SCALE})));
}

/**
 * Create reviewable millimetre paths from the same outlines and transforms as
 * the preview. Scale uniformly to the requested finished face width or height.
 * Clipper and parsed OpenType fonts are injected.
 * No toolpath, machine settings, cut-side compensation or production approval
 * are implied by these contours.
 */
export function buildLetter3DManufacturing({lines,width_mm,height_mm,settings,fonts,clipper}) {
  if(!clipper?.Clipper || !clipper?.ClipperOffset) fail('The geometry engine is unavailable.');
  if(!Array.isArray(lines)||!lines.length||lines.length>8) fail('Enter between one and eight text lines.');
  const axis=width_mm==null && height_mm!=null ? 'height' : 'width';
  const size=finite(axis==='width' ? width_mm : height_mm,1,10000,'finished face '+axis);
  const {s,faceOffset}=checkedSettings(settings);
  if(size<=faceOffset*2) fail('The face '+axis+' is too small for this overhang.');
  // A coarse pass supplies a scale, then the final pass flattens at <=0.01 mm.
  const first=makeGlyphGroups(lines,fonts,.02), firstBounds=bounds(first);
  let scale=(size-faceOffset*2)/firstBounds[axis];
  const groups=makeGlyphGroups(lines,fonts,Math.min(.02,TOLERANCE_MM/(2*scale)));
  const measured=bounds(groups);scale=(size-faceOffset*2)/measured[axis];
  if(!Number.isFinite(scale)||scale<=0) fail('The finished dimensions are not valid.');
  const intersectionBudget={comparisons:0};
  const perGlyph=groups.map(group=>{
    const paths=group.map(({points})=>{
      let path=points.map(p=>({X:Math.round(p.x*scale*CLIP_SCALE),Y:Math.round(p.y*scale*CLIP_SCALE)}));
      path=clipper.Clipper.CleanPolygon(path,1);
      if(path.length<3 || Math.abs(clipper.Clipper.Area(path)) < 10) fail('A letter contour is too small to manufacture.');
      return path;
    });
    // TrueType components can legitimately overlap within one glyph. Resolve
    // its authored nonzero fill before testing the finished letter boundaries.
    if (fonts[lines[group.lineIndex].font].outlinesFormat !== 'truetype') {
      if (contoursIntersect(paths,intersectionBudget)) fail('Letter outlines intersect or touch and need artwork review.');
      paths.forEach((path,i)=>{if(clipper.Clipper.Orientation(path)===group[i].hole)path.reverse();});
    }
    return {line:group.lineIndex,paths:union(clipper,paths)};
  });
  const source=perGlyph.flatMap(glyph=>glyph.paths);
  if(contoursIntersect(source,intersectionBudget)) fail('Some lettering overlaps or touches; adjust the design before preparing cutting files.');
  const groove=union(clipper,source);
  if(!groove.length) fail('The lettering outline could not be created.');
  const total=perGlyph.reduce((a,glyph)=>a+solidArea(clipper,glyph.paths),0),merged=solidArea(clipper,groove);
  const before=perGlyph.map(glyph=>counts(clipper,glyph.paths)).reduce((a,c)=>({outer:a.outer+c.outer,holes:a.holes+c.holes}),{outer:0,holes:0});
  const after=counts(clipper,groove);
  if(total-merged>.002 || after.outer<before.outer || after.holes<before.holes) fail('Some lettering overlaps or touches; adjust the design before preparing cutting files.');
  const face=offset(clipper,groove,faceOffset), fc=counts(clipper,face);
  if(!face.length || fc.outer!==after.outer || fc.holes!==after.holes) fail('The face offset closes a letter opening or joins separate letters. Increase the size or adjust the design.');
  const centre=offset(clipper,groove,s.groove_width_mm/2), ic=counts(clipper,centre);
  if(!centre.length || ic.outer!==after.outer || ic.holes!==after.holes) fail('A letter is too narrow for the specified groove. Increase the size or adjust the design.');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of face.flat()){minX=Math.min(minX,p.X);minY=Math.min(minY,p.Y);maxX=Math.max(maxX,p.X);maxY=Math.max(maxY,p.Y);}
  const finalWidth=(maxX-minX)/CLIP_SCALE, finalHeight=(maxY-minY)/CLIP_SCALE;
  // A software complexity limit, not a claim about any machine's cutting bed.
  if(finalWidth>10000.01||finalHeight>10000.01) fail('This design is too large for automatic geometry; please request shop review.');
  const grouped=[];
  for(const glyph of perGlyph) {
    let piece=grouped.find(item=>item.line===glyph.line);
    if(!piece){piece={line:glyph.line,groove:[]};grouped.push(piece);}
    piece.groove.push(...glyph.paths);
  }
  const pieces=grouped.map(piece=>({line:piece.line,groove:piece.groove,groove_center:offset(clipper,piece.groove,s.groove_width_mm/2),face:offset(clipper,piece.groove,faceOffset)}));
  if(Math.abs(pieces.reduce((sum,piece)=>sum+solidArea(clipper,piece.face),0)-solidArea(clipper,face))>.002)
    fail('The per-line face geometry cannot be represented consistently; please request shop review.');
  return {face:toContours(face,{x:minX,y:minY}),groove:toContours(groove,{x:minX,y:minY}),
    pieces:pieces.map(piece=>({line:piece.line,face:toContours(piece.face,{x:minX,y:minY}),groove:toContours(piece.groove,{x:minX,y:minY}),groove_center:toContours(piece.groove_center,{x:minX,y:minY})})),
    bounds_mm:{width:finalWidth,height:finalHeight},settings:s,curve_tolerance_mm:TOLERANCE_MM};
}
