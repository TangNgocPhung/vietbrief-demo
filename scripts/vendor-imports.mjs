import { cp, mkdir, copyFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
for (const folder of ['pdfjs', 'mammoth']) await mkdir(new URL(`dist/vendor/${folder}/`, root), {recursive: true});
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(new URL(`node_modules/pdfjs-dist/build/${name}`, root), new URL(`dist/vendor/pdfjs/${name}`, root));
}
for (const name of ['cmaps', 'standard_fonts']) {
  await cp(new URL(`node_modules/pdfjs-dist/${name}`, root), new URL(`dist/vendor/pdfjs/${name}`, root), {recursive: true});
}
await copyFile(new URL('node_modules/pdfjs-dist/LICENSE', root), new URL('dist/vendor/pdfjs/LICENSE', root));
for (const name of ['mammoth.browser.min.js', 'LICENSE']) {
  await copyFile(new URL(`node_modules/mammoth/${name}`, root), new URL(`dist/vendor/mammoth/${name}`, root));
}
