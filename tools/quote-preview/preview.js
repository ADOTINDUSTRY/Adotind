import { DxfViewer } from 'dxf-viewer';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { measureDxf } from './dxf-measurements.mjs';

const assetBase = new URL('.', import.meta.url);
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js?v=1', assetBase).href;
const format = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export async function previewPdf(file, container) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const pageSize = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 900 / Math.max(pageSize.width, pageSize.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    container.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return {
      dimensions: `First page size: ${format(pageSize.width * 25.4 / 72)} × ${format(pageSize.height * 25.4 / 72)} mm`,
      message: `Showing page 1 of ${pdf.numPages}. Page size is not necessarily the cut part size; enter the actual part dimensions below.`,
    };
  } finally {
    await task.destroy();
  }
}

export async function previewDxf(file, container) {
  const viewer = new DxfViewer(container, { autoResize: true, retainParsedDxf: true });
  const url = URL.createObjectURL(file);
  try {
    if (!viewer.GetRenderer()) throw new Error('WebGL is not available');
    await viewer.Load({
      url,
      workerFactory: () => new Worker(new URL('dxf-worker.js?v=1', assetBase), { type: 'module' }),
    });
    const measurements = measureDxf(viewer.GetDxf(), viewer.GetBounds());
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
      dispose: () => viewer.Destroy(),
    };
  } catch (error) {
    if (viewer.GetRenderer()) viewer.Destroy();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
