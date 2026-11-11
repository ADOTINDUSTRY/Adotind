# Quote file preview

The browser renders PDF-compatible files and DXF locally; uploaded artwork is not sent to a third-party service. SVG is previewed by the browser. EPS and PostScript-based AI can show a declared bounding box, but do not have a visual preview.

The preview and page or drawing bounds are not a cutting measurement. DXF support is incomplete and PDF page dimensions can include empty space; users must enter and verify actual part dimensions. Instant price calculation still supports only SVG and DXF.

To rebuild the self-hosted browser bundles, run `npm ci` and `npm run build` in this directory using Node.js 20 or newer. Commit the generated files in `public/assets/js/quote-vendor` and update the `?v=1` cache version in `public/assets/js/quote-preview.js` and `preview.js` whenever the bundles change.

The bundles include dxf-viewer (MPL-2.0) and PDF.js (Apache-2.0); their source is available through the exact versions in `package-lock.json`. License files are distributed alongside the bundles.
