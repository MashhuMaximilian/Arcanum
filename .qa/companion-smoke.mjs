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

// Two cards: one trait ("Keen Smell") and one action ("Bite"). Tests the
// TRAITS vs ACTIONS split in the rendered layout.
const traitCard = {
  id: "wolf-keen",
  title: "Keen Hearing and Smell",
  kind: "trait",
  contentKind: "feature",
  summary: "The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.",
  sections: [],
  tags: [],
};

const biteCard = {
  id: "wolf-bite",
  title: "Bite",
  kind: "action",
  contentKind: "feature",
  summary: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
  sections: [],
  tags: [],
};

const companionCard = {
  id: "wolf-base",
  title: "Wolf",
  kind: "trait",
  contentKind: "creature",
  subtitle: "beast, CR 1/4",
  body: "",
  summary: "Medium beast",
  sections: [],
  tags: [
    "name:Wolf",
    "type:beast",
    "size:Medium",
    "cr:1/4",
    "ac:13",
    "hp:11 (2d8+2)",
    "speed:40 ft.",
    "alignment:unaligned",
    "senses:passive Perception 13",
    "languages:—",
    "skills:Perception +5, Stealth +4",
    "str:12",
    "dex:15",
    "con:12",
    "int:3",
    "wis:12",
    "cha:6",
  ],
};

const character = {
  name: "Thorin Ironfoot",
  level: 3,
  classes: [{ name: "Ranger", level: 3, subclass: "Beast Master" }],
  companionCards: [companionCard, traitCard, biteCard],
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

  // ---- Layout assertions ----
  // We re-read the PDF and check it's well-formed and a single A4 page.
  // The page2-renderer must fit everything on one page (no overflow).
  // Text-content checks are not reliable here because PDFKit FlateDecode-
  // compresses the content streams, and we don't ship a text extractor in
  // this repo. Visual verification is done by rasterizing the PDF and
  // looking at the resulting PNG.
  const text = buf.toString("latin1");
  const pageObjects = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pageObjects !== 1) {
    console.error(`❌ Expected 1 page, found ${pageObjects}`);
    process.exit(1);
  }
  // MediaBox should be A4 portrait (595x842) — the renderer pins this.
  if (!text.includes("/MediaBox [0 0 595 842]")) {
    console.error("❌ PDF is not A4 portrait (MediaBox [0 0 595 842])");
    process.exit(1);
  }
  console.log("✅ Layout OK: 1 A4 page, ready for visual verification.");
});
doc.end();
