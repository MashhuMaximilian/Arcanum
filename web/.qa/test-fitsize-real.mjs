import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = '/Users/max/dev/Arcanum/web/public/pdf-fonts';
const magra = readFileSync(join(FONTS_DIR, 'Magra-Regular.ttf'));
const magraBold = readFileSync(join(FONTS_DIR, 'Magra-Bold.ttf'));

const doc = new PDFDocument({ size: [595, 842], margin: 0, autoFirstPage: true });
doc.registerFont('Magra', magra);
doc.registerFont('Magra-Bold', magraBold);
doc.registerFont('Helvetica', magra);
doc.registerFont('Helvetica-Bold', magraBold);

const chunks = [];
doc.on('data', c => chunks.push(c));
doc.on('end', () => {
  writeFileSync('/tmp/r25/fit-test.pdf', Buffer.concat(chunks));
});

// Front slot: width=24.76, height=14.94
const frontRect = { x: 100, y: 100, width: 24.76, height: 14.94 };
// Companion slot: width=25, height=18
const compRect = { x: 200, y: 100, width: 25, height: 18 };

function fitTextSize(text, rect, maxSize = 14, minSize = 6.4, lineGap = undefined) {
  for (let size = maxSize; size >= minSize; size -= 0.25) {
    doc.save();
    doc.font('Helvetica-Bold').fontSize(size);
    const h = doc.heightOfString(text, {
      width: rect.width,
      height: rect.height,
      align: 'center',
      lineBreak: true,
      ellipsis: true,
      lineGap: lineGap ?? size * 0.12,
    });
    doc.restore();
    if (h <= rect.height) return size;
  }
  return minSize;
}

const frontSize = fitTextSize('70', frontRect);
console.log(`Front slot (24.76 × 14.94): fitTextSize('70', max=14) = ${frontSize}`);

const compSize = fitTextSize('40', compRect);
console.log(`Comp slot (25 × 18): fitTextSize('40', max=14) = ${compSize}`);

doc.font('Helvetica-Bold').fontSize(frontSize).text('70', frontRect.x, frontRect.y, frontRect);
doc.font('Helvetica-Bold').fontSize(compSize).text('40', compRect.x, compRect.y, compRect);

doc.end();
