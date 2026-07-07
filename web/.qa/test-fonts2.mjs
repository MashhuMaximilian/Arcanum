import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = '/Users/max/dev/Arcanum/web/public/pdf-fonts';
const magra = readFileSync(join(FONTS_DIR, 'Magra-Regular.ttf'));
const magraBold = readFileSync(join(FONTS_DIR, 'Magra-Bold.ttf'));

const doc = new PDFDocument({ size: [200, 200], margin: 0, autoFirstPage: true });
doc.registerFont('Magra', magra);
doc.registerFont('Magra-Bold', magraBold);
doc.registerFont('Helvetica', magra);
doc.registerFont('Helvetica-Bold', magraBold);

const chunks = [];
doc.on('data', c => chunks.push(c));
doc.on('end', () => {
  writeFileSync('/tmp/r25/font-test2.pdf', Buffer.concat(chunks));
});

doc.save();
doc.font('Helvetica-Bold').fontSize(14);
console.log("After doc.font('Helvetica-Bold'):", doc._font.name);
doc.restore();
doc.save();
doc.font('Magra-Bold').fontSize(14);
console.log("After doc.font('Magra-Bold'):", doc._font.name);
doc.restore();

doc.font('Helvetica-Bold').fontSize(14).text('70', 10, 10);
doc.font('Helvetica-Bold').fontSize(14).text('40', 10, 30);
doc.font('Magra-Bold').fontSize(14).text('70', 10, 50);
doc.font('Magra-Bold').fontSize(14).text('40', 10, 70);
doc.end();
