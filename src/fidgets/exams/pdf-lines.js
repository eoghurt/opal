// The text of PDFs, line by line — for reading a WACE paper's sections and
// questions. Uses the same pdf.js as the PDF viewer.

import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../dist/pdf.worker.min.mjs', window.location.href).href;

export async function pdfLines(paths, readBytes) {
  const out = [];
  for (const path of paths) {
    const bytes = await readBytes(path);
    const task = pdfjs.getDocument({ data: bytes, disableFontFace: true });
    const doc = await task.promise;
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        let line = '';
        let lastY = null;
        for (const item of content.items) {
          const y = Math.round(item.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 2) {
            out.push(line);
            line = '';
          }
          line += `${item.str} `;
          lastY = y;
        }
        out.push(line);
      }
    } finally {
      task.destroy();
    }
  }
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
