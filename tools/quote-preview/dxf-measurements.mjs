const unitFactors = {
  1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1000000,
  8: 0.0000254, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6,
  13: 0.001, 14: 100, 15: 10000, 16: 100000, 17: 1e12,
};

const pointIsValid = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const isPlanar = (entity) => {
  const normal = entity.extrusionDirection;
  return !normal || (Number.isFinite(normal.x) && Number.isFinite(normal.y) &&
    Number.isFinite(normal.z) && normal.x === 0 && normal.y === 0 && Math.abs(normal.z) === 1);
};

function segmentLength(start, end) {
  if (!pointIsValid(start) || !pointIsValid(end) ||
      !Number.isFinite(start.z ?? 0) || !Number.isFinite(end.z ?? 0) ||
      (start.z ?? 0) !== (end.z ?? 0)) return null;
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const bulge = start.bulge ?? 0;
  if (!Number.isFinite(bulge)) return null;
  if (Math.abs(bulge) < 1e-12) return chord;
  return chord * (1 + bulge * bulge) * Math.abs(Math.atan(bulge)) / Math.abs(bulge);
}

function entityLength(entity) {
  if (!isPlanar(entity)) return null;
  if (entity.type === 'LINE') {
    if (entity.vertices?.length !== 2) return null;
    return segmentLength(entity.vertices[0], entity.vertices[1]);
  }
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    if (!pointIsValid(entity.center) || !Number.isFinite(entity.radius) || entity.radius < 0) return null;
    if (entity.type === 'CIRCLE') return 2 * Math.PI * entity.radius;
    if (!Number.isFinite(entity.startAngle) || !Number.isFinite(entity.endAngle)) return null;
    const turn = 2 * Math.PI;
    const span = ((entity.endAngle - entity.startAngle) % turn + turn) % turn;
    return entity.radius * span;
  }
  if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
    if (entity.is3dPolyline || entity.is3dPolygonMesh || entity.isPolyfaceMesh ||
        entity.includesCurveFitVertices || entity.includesSplineFitVertices ||
        !Array.isArray(entity.vertices) || entity.vertices.length < 2) return null;
    let length = 0;
    const segments = entity.vertices.length - 1 + (entity.shape ? 1 : 0);
    for (let i = 0; i < segments; i++) {
      const segment = segmentLength(entity.vertices[i], entity.vertices[(i + 1) % entity.vertices.length]);
      if (segment === null) return null;
      length += segment;
    }
    return length;
  }
  return null;
}

export function measureDxf(dxf, bounds) {
  const factor = unitFactors[dxf?.header?.$INSUNITS];
  const scale = factor ?? 1;
  const width = bounds && bounds.maxX - bounds.minX;
  const height = bounds && bounds.maxY - bounds.minY;
  const layers = dxf?.tables?.layer?.layers ?? {};
  let length = 0;
  let count = 0;
  const unsupported = new Set();
  for (const entity of dxf?.entities ?? []) {
    const layer = layers[entity.layer];
    if (entity.hidden || layer?.visible === false || (entity.layer !== '0' && layer?.frozen)) continue;
    const value = entityLength(entity);
    if (value === null || !Number.isFinite(value)) {
      unsupported.add(entity.type || 'unknown');
      continue;
    }
    length += value;
    count++;
  }
  return {
    width: Number.isFinite(width) && width >= 0 ? width * scale : null,
    height: Number.isFinite(height) && height >= 0 ? height * scale : null,
    pathLength: count && !unsupported.size && Number.isFinite(length) ? length * scale : null,
    unit: factor ? 'mm' : 'drawing units',
    unitsKnown: Boolean(factor),
    unsupported: [...unsupported].sort(),
  };
}
