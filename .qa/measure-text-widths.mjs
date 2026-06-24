// Measure the actual width of the hit dice string and Recharge labels at the
// new font sizes, to verify they fit in their target boxes.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");
const fs = require("node:fs");

const doc = new PDFDocument({ size: "A4" });
fs.createWriteStream("/tmp/measure.pdf");

const measurements = [
  { text: "Long Rest", size: 4, font: "Helvetica-Bold", target: 26, label: "Recharge: Long Rest" },
  { text: "Short Rest", size: 4, font: "Helvetica-Bold", target: 26, label: "Recharge: Short Rest" },
  { text: "At Will", size: 4, font: "Helvetica-Bold", target: 26, label: "Recharge: At Will" },
  { text: "Per Day", size: 4, font: "Helvetica-Bold", target: 26, label: "Recharge: Per Day" },
  { text: "3d8 • 3d8 • 2d8 • 2d6", size: 3, font: "Helvetica-Bold", target: 80, label: "Hit Dice: 4-class" },
  { text: "3d8 • 3d8 • 2d8 • 2d6 • 1d10 • 3d6", size: 3, font: "Helvetica-Bold", target: 80, label: "Hit Dice: 6-class" },
  { text: "3d8 • 3d8 • 2d8 • 2d6 • 1d10 • 3d6 • 1d12 • 4d6", size: 3, font: "Helvetica-Bold", target: 80, label: "Hit Dice: 8-class" },
  // Baseline (5pt) for comparison
  { text: "3d8 • 3d8 • 2d8 • 2d6", size: 5, font: "Helvetica-Bold", target: 80, label: "Hit Dice: 4-class @ 5pt (OLD)" },
];

console.log("\n--- Font Width Measurements ---\n");
for (const m of measurements) {
  doc.font(m.font).fontSize(m.size);
  const width = doc.widthOfString(m.text);
  const fits = width <= m.target;
  const status = fits ? "✓ FITS" : "✗ OVERFLOWS";
  console.log(`${m.label}`);
  console.log(`  size=${m.size}pt target=${m.target}pt actual=${width.toFixed(2)}pt ${status}`);
  console.log("");
}

doc.end();
