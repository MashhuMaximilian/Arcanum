// Verify pdfkit baseline semantics
import fs from "node:fs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

const fontBuffer = fs.readFileSync("/Users/max/dev/Arcanum/web/public/pdf-fonts/Magra-Regular.ttf");

const doc = new PDFDocument({ size: [800, 500], margin: 0 });
const chunks = [];
doc.on("data", (c) => chunks.push(c));
doc.on("end", () => {
  fs.writeFileSync("/tmp/baseline-test.pdf", Buffer.concat(chunks));
});

doc.registerFont("Magra", fontBuffer);
doc.registerFont("Magra-Bold", fs.readFileSync("/Users/max/dev/Arcanum/web/public/pdf-fonts/Magra-Bold.ttf"));

// Three test rects side by side, each 200x180 (rect.h=180)
const rectY = 100;
const rectH = 180;
const size = 60;
const capHeight = size * 0.72;

const tests = [
  { x: 50, y: rectY, label: "REVERTED", color: "blue", fn: (r) => r.y + (r.height - capHeight) / 2 },
  { x: 300, y: rectY, label: "ROUND-3", color: "green", fn: (r) => r.y + (r.height + capHeight) / 2 },
  { x: 550, y: rectY, label: "MID", color: "black", fn: (r) => r.y + r.height / 2 },
];

for (const t of tests) {
  doc.rect(t.x, t.y, 200, rectH).strokeColor("red").stroke();
  doc.font("Magra").fontSize(14);
  doc.fillColor(t.color);
  doc.text(t.label, t.x + 5, t.y - 18, { lineBreak: false });
  doc.font("Magra").fontSize(size);
  const rect = { x: t.x, y: t.y, width: 200, height: rectH };
  const yPos = t.fn(rect);
  doc.fillColor(t.color);
  doc.text("13", t.x + 75, yPos, { lineBreak: false });
}

doc.end();