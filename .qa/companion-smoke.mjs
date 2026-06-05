// Smoke test for the new 3-column companion page layout.
// Imports renderCompanionPage directly, builds a minimal ResolvedPdfCharacter,
// and writes a single-page PDF to .qa/companion-3col-smoke.pdf.
//
// Run with: cd /Users/max/dev/Arcanum && node .qa/companion-3col-smoke.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";

// Project root is one level up from .qa/
const projectRoot = "/Users/max/dev/Arcanum";

// The SVG asset loader uses process.cwd() — chdir to the project root so it
// can find web/public/pdf-svg/*.
process.chdir(projectRoot);

const companionCard = {
  title: "Wolf",
  subtitle: "beast, CR 1/4",
  body: "",
  summary: "Keen Hearing and Smell. The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.\nPack Tactics. The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated.",
  sections: [],
  tags: [
    "name:Wolf",
    "type:beast",
    "cr:1/4",
    "ac:13",
    "hp:11 (2d8+2)",
    "speed:40 ft.",
    "str:12",
    "dex:15",
    "con:12",
    "int:3",
    "wis:12",
    "cha:6",
    "skill:Perception +3",
    "skill:Stealth +4",
  ],
};

const character = {
  name: "Smoke Test Druid",
  level: 3,
  classes: [{ name: "Druid", level: 3 }],
  companionCards: [companionCard],
  pagePlan: [{ kind: "companion" }],
  frontPage: { stats: [] },
};

const [{ renderCompanionPage }, { loadPdfSvgAssetBundle }, { default: PDFDocument }] = await Promise.all([
  import(path.join(projectRoot, "web", "lib", "pdf", "page2-renderer.ts")).catch(() => import(path.join(projectRoot, "lib", "pdf", "page2-renderer.ts"))),
  import(path.join(projectRoot, "web", "lib", "pdf", "svg-assets.server.ts")).catch(() => import(path.join(projectRoot, "lib", "pdf", "svg-assets.server.ts"))),
  import("pdfkit/js/pdfkit.standalone.js"),
]);

const assetKeys = [
  "generalContainer",
  "statBlock",
  "bonusBox",
  "hp",
  "ac",
  "passiveBox",
  "greyBackground",
  "abilityPanel",
  "passivesAndSpeeds",
];

const assets = await loadPdfSvgAssetBundle(assetKeys);

const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, compress: true });

// Register a font (use built-in Helvetica if no Noto Sans available)
try {
  const { default: SVGtoPDF } = await import("svg-to-pdfkit");
  const ctx = { doc, svgToPdf: SVGtoPDF, bodyFont: "Helvetica" };
  renderCompanionPage(ctx, assets, character);
} catch (err) {
  console.error("Render error:", err);
  process.exit(1);
}

const chunks = [];
doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
doc.on("end", async () => {
  const buf = Buffer.concat(chunks);
  const out = path.join(projectRoot, ".qa", "companion-3col-smoke.pdf");
  await writeFile(out, buf);
  console.log(`Wrote ${buf.byteLength} bytes to ${out}`);
});
doc.end();
