/* Per-path LED stock screening. The electrical route remains a shop decision. */
(() => {
  'use strict';

  const CUT_STEP_MM = 25;
  // Coordinates in the DXF are written to four decimal places in millimetres.
  const roundCoordinate = value => Math.round(value * 10000) / 10000;

  function planStripStock(runs, heightMm = 0) {
    if (!Array.isArray(runs)) throw new TypeError('Expected drawing paths.');
    if (!Number.isFinite(heightMm)) throw new TypeError('Expected the drawing height.');

    const pieces = runs.map((run, index) => {
      if (!Array.isArray(run) || run.length < 2) throw new Error('A drawing path is incomplete.');
      let lengthMm = 0;
      for (let i = 0; i < run.length; i++) {
        const point = run[i];
        if (!Array.isArray(point) || point.length < 2 ||
            !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
          throw new Error('A drawing path contains an invalid point.');
        }
        if (i === 0) continue;
        const previous = run[i - 1];
        const dx = roundCoordinate(point[0]) - roundCoordinate(previous[0]);
        // The DXF exporter flips Y before rounding; reproduce that order.
        const dy = roundCoordinate(heightMm - point[1]) - roundCoordinate(heightMm - previous[1]);
        lengthMm += Math.hypot(dx, dy);
      }
      if (lengthMm <= 0) throw new Error('A drawing path has no measurable length.');

      const cutUnits = Math.max(1, Math.ceil((lengthMm - 0.001) / CUT_STEP_MM));
      const cutLengthMm = cutUnits * CUT_STEP_MM;
      const differenceMm = cutLengthMm - lengthMm;
      return {
        index,
        lengthMm,
        cutUnits,
        cutLengthMm,
        differenceMm,
        fitsWithinTolerance: Math.abs(differenceMm) <= 0.001,
      };
    });

    return {
      cutStepMm: CUT_STEP_MM,
      toleranceMm: 0.001,
      // These allocations assume one separately powered strip for each path.
      // At junctions the shop may connect paths differently.
      electricalRoutingVerified: false,
      pieces,
      allocatedMm: pieces.reduce((total, piece) => total + piece.cutLengthMm, 0),
      pathLengthMm: pieces.reduce((total, piece) => total + piece.lengthMm, 0),
      pathsMatchCutMarks: pieces.every(piece => piece.fitsWithinTolerance),
    };
  }

  function pointSegmentDistance(point, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const square = dx * dx + dy * dy;
    const t = square ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / square)) : 0;
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  }

  function segmentsIntersect(a, b, c, d) {
    const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
    const direction = [b[0] - a[0], b[1] - a[1]];
    const other = [d[0] - c[0], d[1] - c[1]];
    const delta = [c[0] - a[0], c[1] - a[1]];
    const denominator = cross(direction, other);
    if (Math.abs(denominator) < 1e-10) return false;
    const t = cross(delta, other) / denominator;
    const u = cross(delta, direction) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function pathsTouch(first, second) {
    for (let i = 1; i < first.length; i++) {
      const a = first[i - 1], b = first[i];
      for (let j = 1; j < second.length; j++) {
        const c = second[j - 1], d = second[j];
        if ([0, 1].some(axis => Math.max(a[axis], b[axis]) + 6.05 < Math.min(c[axis], d[axis]) ||
            Math.max(c[axis], d[axis]) + 6.05 < Math.min(a[axis], b[axis]))) continue;
        if (segmentsIntersect(a, b, c, d) ||
            pointSegmentDistance(a, c, d) < 6.05 || pointSegmentDistance(b, c, d) < 6.05 ||
            pointSegmentDistance(c, a, b) < 6.05 || pointSegmentDistance(d, a, b) < 6.05) return true;
      }
    }
    return false;
  }

  function transformPath(path, anchor, factor) {
    return path.replace(/([MLC])([^MLC]+)/g, (_, type, values) => {
      const coordinates = values.trim().split(/\s+/).map(Number);
      if (coordinates.some(value => !Number.isFinite(value))) throw new Error('Invalid drawing path.');
      const transformed = coordinates.map((value, axis) => {
        const origin = anchor[axis % 2];
        return roundCoordinate(origin + (value - origin) * factor);
      });
      return type + transformed.join(' ');
    });
  }

  // Try a small uniform adjustment per geometrically separate path. Existing
  // junctions are left for manual routing because their wiring is unknown.
  // The original drawing is returned untouched unless the complete result
  // passes the caller's clearance screen and every DXF path meets a cut mark.
  function fitIndependentPaths(artwork, inspectManufacturing) {
    if (!artwork?.valid || !Array.isArray(artwork.runs) || !artwork.runs.length ||
        artwork.runs.length !== artwork.paths?.length || typeof inspectManufacturing !== 'function') {
      throw new Error('A complete drawing and clearance checker are required.');
    }
    const originalPlan = planStripStock(artwork.runs, artwork.heightMm);
    const manual = reason => ({applied: false, reason, plan: originalPlan});
    // Intersection checking is quadratic; leave dense drawings for review.
    if (artwork.runs.reduce((total, run) => total + run.length, 0) > 1200) {
      return manual('too_complex');
    }
    const runs = artwork.runs.map(run => run.map(point => [...point]));
    const paths = artwork.paths.map(path => ({...path}));
    const adjustments = [];

    for (const piece of originalPlan.pieces) {
      if (piece.fitsWithinTolerance) continue;
      const index = piece.index, run = runs[index];
      for (let other = 0; other < runs.length; other++) {
        if (other !== index && pathsTouch(run, runs[other])) return manual('connected_paths');
      }
      const target = Math.max(CUT_STEP_MM, Math.round(piece.lengthMm / CUT_STEP_MM) * CUT_STEP_MM);
      const ratio = target / piece.lengthMm;
      if (ratio < 0.85 || ratio > 1.15) return manual('adjustment_too_large');

      const xs = run.map(point => point[0]), ys = run.map(point => point[1]);
      const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const limits = [3, 3, artwork.widthMm - 3, artwork.heightMm - 3];
      const anchor = [0, 1].map(axis => {
        if (Math.abs(bounds[axis] - limits[axis]) < 0.01) return limits[axis];
        if (Math.abs(bounds[axis + 2] - limits[axis + 2]) < 0.01) return limits[axis + 2];
        return (bounds[axis] + bounds[axis + 2]) / 2;
      });
      const transform = factor => run.map(([x, y]) => [
        anchor[0] + (x - anchor[0]) * factor,
        anchor[1] + (y - anchor[1]) * factor,
      ]);
      let lo = ratio - 0.001, hi = ratio + 0.001, best = null;
      for (let step = 0; step < 45; step++) {
        const factor = (lo + hi) / 2;
        const candidate = transform(factor);
        const measured = planStripStock([candidate], artwork.heightMm).pathLengthMm;
        if (!best || Math.abs(measured - target) < Math.abs(best.lengthMm - target)) {
          best = {factor, run: candidate, lengthMm: measured};
        }
        if (measured < target) lo = factor;
        else hi = factor;
      }
      if (Math.abs(best.lengthMm - target) > 0.001 ||
          best.run.some(([x, y]) => x < 3 - 0.001 || y < 3 - 0.001 ||
            x > artwork.widthMm - 3 + 0.001 || y > artwork.heightMm - 3 + 0.001)) {
        return manual('cut_mark_unreachable');
      }
      runs[index] = best.run;
      paths[index].d = transformPath(paths[index].d, anchor, best.factor);
      adjustments.push({index, originalMm: piece.lengthMm, fittedMm: best.lengthMm, cutLengthMm: target});
    }
    const extent = paths => {
      const values = [Infinity, Infinity, -Infinity, -Infinity];
      for (const run of paths) for (const [x, y] of run) {
        values[0] = Math.min(values[0], x);
        values[1] = Math.min(values[1], y);
        values[2] = Math.max(values[2], x);
        values[3] = Math.max(values[3], y);
      }
      return values;
    };
    const originalExtent = extent(artwork.runs), adjustedExtent = extent(runs);
    if (originalExtent.some((value, index) => Math.abs(value - adjustedExtent[index]) > 0.005)) {
      return manual('overall_dimensions_change');
    }
    const plan = planStripStock(runs, artwork.heightMm);
    const manufacturing = inspectManufacturing(runs);
    if (!plan.pathsMatchCutMarks || !manufacturing || manufacturing.requiresReview !== false) {
      return manual('clearance_review');
    }

    const result = {...artwork, paths, lengthMm: plan.pathLengthMm, manufacturing};
    Object.defineProperty(result, 'runs', {value: runs});
    return {applied: adjustments.length > 0, artwork: result, adjustments, plan};
  }

  const api = {planStripStock, fitIndependentPaths};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.NeonStripPlanning = api;
})();
