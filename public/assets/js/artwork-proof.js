(() => {
  const fileInput = document.getElementById('artwork-file');
  if (!fileInput) return;
  const canvas = document.getElementById('artwork-proof');
  const context = canvas.getContext('2d');
  const controls = document.getElementById('artwork-controls');
  const status = document.getElementById('artwork-status');
  const cutoff = document.getElementById('artwork-cutoff');
  const tone = document.getElementById('artwork-tone');
  const widthInput = document.getElementById('artwork-width');
  const size = document.getElementById('artwork-size');
  let source;
  let aspect;
  let selection = 0;

  function updateSize() {
    const width = widthInput.valueAsNumber;
    size.textContent = aspect && width > 0 && widthInput.validity.valid
      ? 'Proportional height: ' + (width * aspect).toLocaleString(undefined, {maximumFractionDigits: 1}) + ' mm'
      : '';
  }

  function trace() {
    if (!source) return;
    const {width, height, data} = source;
    const mask = new Uint8Array(width * height);
    let left = width, right = -1, top = height, bottom = -1;
    const threshold = Number(cutoff.value);
    const light = tone.value === 'light';
    for (let i = 0; i < mask.length; i++) {
      const p = i * 4;
      const luminance = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      if (data[p + 3] < 128 || (light ? luminance < threshold : luminance > threshold)) continue;
      mask[i] = 1;
      const x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const proof = new ImageData(new Uint8ClampedArray(data), width, height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % width;
      if (x > 0 && x < width - 1 && mask[i-1] && mask[i+1] && mask[i-width] && mask[i+width]) continue;
      proof.data.set([255, 38, 66, 255], i * 4);
    }
    context.putImageData(proof, 0, 0);
    aspect = right < left ? 0 : (bottom - top + 1) / (right - left + 1);
    status.textContent = aspect ? 'Check that the red lines follow your design.' : 'No outline found. Change the cutoff or switch between light and dark artwork.';
    updateSize();
  }

  fileInput.addEventListener('change', async () => {
    const request = ++selection;
    const file = fileInput.files[0];
    controls.hidden = true;
    source = null;
    aspect = 0;
    size.textContent = status.textContent = widthInput.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = 'Choose a PNG or JPG file up to 10 MB.';
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (request !== selection) return;
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      source = context.getImageData(0, 0, canvas.width, canvas.height);
      controls.hidden = false;
      trace();
    } catch {
      if (request === selection) status.textContent = 'This picture could not be opened. Try another PNG or JPG.';
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  cutoff.addEventListener('input', trace);
  tone.addEventListener('change', trace);
  widthInput.addEventListener('input', updateSize);
})();
