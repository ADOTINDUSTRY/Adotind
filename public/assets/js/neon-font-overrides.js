/* Apply administrator-edited paths before the shared geometry engine is used. */
(() => {
  'use strict';
  function apply(overrides) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return;
    for (const [id, glyphs] of Object.entries(overrides)) {
      const font = globalThis.NeonStrokeFonts?.[id];
      if (!font || !glyphs || typeof glyphs !== 'object' || Array.isArray(glyphs)) continue;
      for (const [key, commands] of Object.entries(glyphs)) {
        if (!key.startsWith('g:')) continue;
        const ch = key.slice(2);
        if (!Object.hasOwn(font.glyphs, ch) || !Array.isArray(commands) || !commands.length || commands.length > 2000) continue;
        if (commands[0]?.[0] !== 'M' || !commands.every(c => Array.isArray(c) &&
          ((c[0] === 'M' || c[0] === 'L') && c.length === 3 || c[0] === 'C' && c.length === 7) &&
          c.slice(1).every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 20000))) continue;
        font.glyphs[ch] = [font.glyphs[ch][0], commands.map(c => c[0] + c.slice(1).join(' ')).join('')];
        (font.customGlyphs ||= {})[ch] = true;
      }
    }
  }
  globalThis.applyNeonFontOverrides = apply;
  if (typeof document !== 'undefined') {
    try { apply(JSON.parse(document.getElementById('neon-retail-rates')?.textContent || '{}').fontOverrides); }
    catch (_) { /* The designer will still show the original fonts. */ }
  }
})();
