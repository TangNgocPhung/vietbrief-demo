Browser document readers, bundled locally for GitHub Pages and offline use:

- PDF.js 6.4.299 — https://github.com/mozilla/pdf.js — Apache-2.0; license in `pdfjs/LICENSE`.
- Mammoth.js 1.13.0 — https://github.com/mwilliamson/mammoth.js — BSD-2-Clause; license in `mammoth/LICENSE`.

Regenerate the assets with `npm ci --ignore-scripts` and `npm run vendor:imports`.
Only the reader needed for the selected file type is loaded. Article contents are parsed in the browser, without an upload API.
