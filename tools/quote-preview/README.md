# Quote file preview

The quotation page previews DXF files locally in the browser; artwork is not sent to a third-party service. When WebGL is unavailable, the viewer uses a 2D canvas fallback.

DXF previews show approximate displayed width and height and an estimated path length for lines, arcs, circles and 2D polylines. Unsupported or malformed entities make the length unavailable, and unsupported or unspecified DXF units are shown as drawing units rather than millimetres. Some DXF features may not be parsed or previewed, and the preview measurement is not a verified cutting measurement or the server's quote calculation.

The current online quotation form accepts DXF only. Its testing estimator is limited to a single part per drawing; multiple-part drawings and uncertain cases are referred for manual review. Machine selection and sheet counts are not yet automated production decisions.

To rebuild the self-hosted browser bundles, run `npm ci` and `npm run build` in this directory using Node.js 20 or newer. Commit the generated files in `public/assets/js/quote-vendor` and update the corresponding `?v=1` cache versions in `public/assets/js/quote-preview.js` and `preview.js` whenever the bundles change.

The bundles include dxf-viewer (MPL-2.0), PDF.js (Apache-2.0), eps2img (MIT) and saxes (ISC); their source is available through the exact versions in `package-lock.json`. License files are distributed alongside the bundles.
