import { DxfViewer } from 'dxf-viewer';
import { measureDxf } from './dxf-measurements.mjs';
import { previewDxfCanvas } from './dxf-canvas.mjs';

const assetBase = new URL('.', import.meta.url);
const format = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export async function previewDxf(file, container) {
  const url = URL.createObjectURL(file);
  let viewer;
  let dispose;
  try {
    if (typeof ResizeObserver === 'function') {
      viewer = new DxfViewer(container, { autoResize: true, retainParsedDxf: true });
    }
    let dxf;
    let bounds;
    if (viewer?.GetRenderer()) {
      try {
        await viewer.Load({
          url,
          workerFactory: typeof Worker === 'function'
            ? () => new Worker(new URL('dxf-worker.js?v=1', assetBase), { type: 'module' })
            : null,
        });
      } catch (error) {
        const workerFailure = (typeof ErrorEvent === 'function' && error instanceof ErrorEvent)
          || error?.name === 'SecurityError';
        if (!workerFailure) throw error;
        console.warn('DXF worker failed; retrying without a worker.', error);
        await viewer.Load({ url });
      }
      dxf = viewer.GetDxf();
      bounds = viewer.GetBounds();
      dispose = () => viewer.Destroy();
    } else {
      console.warn('WebGL is unavailable; using the 2D DXF preview.');
      const fallback = await previewDxfCanvas(url, container);
      dxf = fallback.dxf;
      bounds = fallback.bounds;
      dispose = fallback.dispose;
    }
    const measurements = measureDxf(dxf, bounds);
    const display = (value) => value === null ? 'unavailable' : `${format(value)} ${measurements.unit}`;
    const warning = measurements.unsupported.length
      ? `Path length is unavailable for unsupported or invalid geometry: ${measurements.unsupported.join(', ')}.`
      : 'Path length covers lines, circles, arcs and 2D polylines; other DXF features may not be included.';
    return {
      dimensions: '',
      measurements: {
        width: `Drawing width: ${display(measurements.width)}`,
        height: `Drawing height: ${display(measurements.height)}`,
        pathLength: `Estimated path length: ${display(measurements.pathLength)}`,
      },
      message: `${warning} ${measurements.unitsKnown ? '' : 'DXF units are unspecified or unsupported; values are in drawing units. '}Preview bounds are approximate. Verify all measurements before quoting.`,
      dispose,
    };
  } catch (error) {
    if (dispose) dispose();
    else if (viewer?.GetRenderer()) viewer.Destroy();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
