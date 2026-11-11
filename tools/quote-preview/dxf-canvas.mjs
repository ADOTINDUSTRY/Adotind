import { DxfFetcher } from 'dxf-viewer';
import { DxfScene } from 'dxf-viewer/src/DxfScene.js';
import { SceneReader } from 'dxf-viewer/src/SceneReader.js';

export async function previewDxfCanvas(url, container) {
  const dxf = await new DxfFetcher(url).Fetch();
  const scene = new DxfScene({});
  await scene.Build(dxf, []);
  const reader = new SceneReader(scene.scene);
  const bounds = reader.GetBounds();
  if (!bounds) throw new Error('The drawing has no visible geometry');
  if (scene.scene.numEntitiesSkipped > 0) {
    throw new Error('Some drawing entities could not be displayed');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.append(canvas);
  const layers = new Map([...reader.GetLayers()].map((layer) => [layer.name, layer]));

  const draw = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const drawingWidth = bounds.maxX - bounds.minX;
    const drawingHeight = bounds.maxY - bounds.minY;
    const scale = Math.min((width * 0.9) / (drawingWidth || 1), (height * 0.9) / (drawingHeight || 1));
    const x = (width - drawingWidth * scale) / 2;
    const y = (height - drawingHeight * scale) / 2;
    context.strokeStyle = '#172448';
    context.fillStyle = '#172448';
    context.lineWidth = 1;
    for (const primitive of reader.ReadPrimitives()) {
      if (layers.get(primitive.layer)?.visible === false) continue;
      const vertices = primitive.vertices;
      const px = (point) => x + (point[0] - bounds.minX) * scale;
      const py = (point) => height - y - (point[1] - bounds.minY) * scale;
      context.beginPath();
      context.moveTo(px(vertices[0]), py(vertices[0]));
      for (let i = 1; i < vertices.length; i++) context.lineTo(px(vertices[i]), py(vertices[i]));
      if (primitive.type === 'TRIANGLE') {
        context.closePath();
        context.fill();
      } else if (primitive.type === 'POINT') {
        context.fillRect(px(vertices[0]) - 1, py(vertices[0]) - 1, 2, 2);
      } else {
        context.stroke();
      }
    }
  };
  draw();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  if (observer) observer.observe(container);
  else window.addEventListener('resize', draw);
  return {
    dxf,
    bounds,
    dispose: () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', draw);
      canvas.remove();
    },
  };
}
