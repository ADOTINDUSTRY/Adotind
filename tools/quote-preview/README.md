# Quote file preview

The browser renders PDF-compatible files, DXF and supported EPS/PostScript-based AI locally; uploaded artwork is not sent to a third-party service. SVG is previewed by the browser. EPS rendering runs in a time-limited worker and only supports a subset of PostScript; it can omit fonts or features and is illustrative only.

The preview and page or drawing bounds are not a cutting measurement. DXF support is incomplete and PDF page dimensions can include empty space; users must enter and verify actual part dimensions. Instant price calculation still supports only SVG and DXF. For SVG files over 5 MB, a worker inspects the root element within the first megabyte rather than parsing the entire document on the UI thread.

To rebuild the self-hosted browser bundles, run `npm ci` and `npm run build` in this directory using Node.js 20 or newer. Commit the generated files in `public/assets/js/quote-vendor` and update the corresponding `?v=1` cache versions in `public/assets/js/quote-preview.js` and `preview.js` whenever the bundles change.

The bundles include dxf-viewer (MPL-2.0), PDF.js (Apache-2.0), eps2img (MIT) and saxes (ISC); their source is available through the exact versions in `package-lock.json`. License files are distributed alongside the bundles.
