/** Convert OpenType path commands to Three.js shapes, preserving enclosed holes. */
export function fontPathToShapes(THREE, commands) {
  const paths = []; let path = null;
  for (const c of commands) {
    if (c.type === 'M') {
      if (path) path.closePath();
      path = new THREE.Path(); path.moveTo(c.x, -c.y); paths.push(path);
    } else if (!path) {
      throw new Error('Invalid font outline');
    } else if (c.type === 'L') path.lineTo(c.x, -c.y);
    else if (c.type === 'Q') path.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') path.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    else if (c.type === 'Z') path.closePath();
    else throw new Error('Unsupported font outline');
  }
  if (path) path.closePath();
  const contours = paths.map((p, index) => {
    const points = p.getPoints(12);
    return {path:p, points, index, area:Math.abs(THREE.ShapeUtils.area(points)), parent:null, depth:0, shape:null};
  }).filter(c => c.points.length >= 3 && c.area > 1e-8);
  const contains = (poly, p) => {
    let inside = false;
    for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
      const a=poly[i], b=poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  };
  // A glyph can contain islands inside counters. Nest by containment, not just
  // winding direction, because fonts differ in contour orientation.
  const sorted = [...contours].sort((a,b)=>b.area-a.area || a.index-b.index);
  for (let i=0;i<sorted.length;i++) {
    const child=sorted[i];
    for (let j=i-1;j>=0;j--) {
      const candidate=sorted[j];
      if (candidate.area > child.area && contains(candidate.points, child.points[0])) { child.parent=candidate; child.depth=candidate.depth+1; break; }
    }
  }
  const shapes=[];
  for (const contour of sorted) {
    if (contour.depth % 2 === 0) {
      const shape=new THREE.Shape(); shape.curves=contour.path.curves.slice(); shape.currentPoint.copy(contour.path.currentPoint); shape.autoClose=true;
      contour.shape=shape; shapes.push(shape);
    } else if (contour.parent?.shape) contour.parent.shape.holes.push(contour.path);
  }
  return shapes;
}
