import { DxfViewer } from 'dxf-viewer';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

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
    const bounds = viewer.GetBounds();
    const unit = viewer.GetDxf()?.header?.$INSUNITS;
    const factors = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100, 15: 10000 };
    const factor = factors[unit];
    const w = bounds && bounds.maxX - bounds.minX;
    const h = bounds && bounds.maxY - bounds.minY;
    return {
      dimensions: factor && Number.isFinite(w) && Number.isFinite(h)
        ? `Approximate displayed drawing bounds: ${format(w * factor)} × ${format(h * factor)} mm`
        : 'Physical drawing dimensions are unavailable or the DXF units are unspecified.',
      message: 'Preview may not include every DXF feature. Verify the actual cut-part dimensions before entering them below.',
      dispose: () => viewer.Destroy(),
    };
  } catch (error) {
    if (viewer.GetRenderer()) viewer.Destroy();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
