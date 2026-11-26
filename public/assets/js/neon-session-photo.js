/* Optional, tab-scoped wall-photo preview storage. No image is uploaded. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonSessionPhoto = factory();
})(globalThis, function () {
  'use strict';

  const KEY = 'adotind.neon.wall-photo.v1';
  const MAX_CHARS = 1800000;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_SIDE = 2048;
  const validData = value => typeof value === 'string' && value.length <= MAX_CHARS &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);

  function load(storage) {
    try {
      const saved = storage.getItem(KEY);
      return validData(saved) ? saved : null;
    } catch { return null; }
  }

  function clear(storage) {
    try { storage.removeItem(KEY); } catch { /* Browser storage may be disabled. */ }
  }

  function save(storage, value) {
    if (!validData(value)) { clear(storage); return false; }
    try {
      storage.setItem(KEY, value);
      return true;
    } catch {
      // Avoid restoring the previous photo if a replacement could not be saved.
      clear(storage);
      return false;
    }
  }

  function readFile(file) {
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Unable to read photo'));
      reader.readAsDataURL(file);
    });
  }

  // image is the already-decoded Image used by the wall preview. A bounded
  // preview is saved rather than the original if the source is too large for
  // sessionStorage; PNG/WebP transparency is retained where supported.
  async function encode(file, image, options = {}) {
    if (!file || !/^image\/(?:jpeg|png|webp)$/i.test(file.type) ||
        !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) return null;
    const width=Number(image?.naturalWidth),height=Number(image?.naturalHeight);
    if (!(width>0 && height>0) || width*height>60000000) return null;
    if (file.size <= 1200000) {
      try {
        const original=await (options.readFile || readFile)(file);
        if (validData(original)) return original;
      } catch { /* Fall back to an encoded preview. */ }
    }
    try {
      const canvas=(options.canvasFactory || (()=>document.createElement('canvas')))();
      const ctx=canvas.getContext('2d');
      if (!ctx) return null;
      let scale=Math.min(1,MAX_SIDE/Math.max(width,height));
      for (let attempt=0;attempt<4;attempt++) {
        canvas.width=Math.max(1,Math.round(width*scale));
        canvas.height=Math.max(1,Math.round(height*scale));
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        for (const quality of [.82,.68,.54]) {
          const data=canvas.toDataURL('image/webp',quality);
          if (validData(data)) return data;
        }
        scale*=.75;
      }
    } catch { /* A private-browsing policy or browser may block canvas. */ }
    return null;
  }

  return {load,save,clear,encode};
});
