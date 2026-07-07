import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import { readFileSync } from 'fs';

const magraFontBuffer = readFileSync('/Users/max/dev/Arcanum/web/public/pdf-fonts/Magra-Regular.ttf');
const doc = new PDFDocument({ size: [842, 595], margin: 0, autoFirstPage: false });
doc.registerFont('Magra', magraFontBuffer);

const items = ['Longsword,', 'Shortsword,', 'Shortbow, Longbow,', 'Simple Weapons,', 'Martial Weapons'];
const text = items.join(' ');
const width = 62 * 0.88;
const height = 47 * 0.70;

for (let size = 6.4; size >= 4.0; size -= 0.25) {
  doc.font('Magra').fontSize(size);
  const h = doc.heightOfString(text, { width, height, lineBreak: true, ellipsis: false, lineGap: 0 });
  const w = doc.widthOfString(text);
  console.log(`size=${size}: height=${h.toFixed(2)} width=${w.toFixed(2)} ${h <= height ? 'FITS' : 'OVERFLOWS'}`);
}
