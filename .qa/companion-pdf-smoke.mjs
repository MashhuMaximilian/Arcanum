// Smoke test for the new Companion page 3-column layout.
// Constructs a minimal ResolvedPdfCharacter with a companion card, then calls
// generatePdfBytes directly and writes the result to .qa/companion-pdf-smoke.pdf.
//
// Run with: node .qa/companion-pdf-smoke.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());

// Build the same shape generatePdfBytes expects.
const companionCard = {
  title: "Goblin Companion",
  kind: "companion",
  sections: [],
  tags: [
    "name: Goblin Companion",
    "cr: 1/4",
    "size: Small",
    "type: humanoid (goblinoid)",
    "alignment: neutral evil",
    "ac: 15",
    "hp: 7 (2d6)",
    "speed: 30 ft.",
    "walk: 30 ft.",
    "fly: 0 ft.",
    "swim: 0 ft.",
    "burrow: 0 ft.",
    "climb: 0 ft.",
    "prof: 2",
    "init: 2",
    "str: 8",
    "dex: 14",
    "con: 10",
    "int: 10",
    "wis: 8",
    "cha: 8",
    "skill: stealth 4",
    "skill: perception -1",
    "feat: Nimble Escape",
    "feat: Sneak Attack (1d6)",
  ],
};

const character = {
  name: "Smoke Test Wizard",
  level: 3,
  classes: [{ name: "Wizard", level: 3 }],
  companionCards: [companionCard],
  pagePlan: [{ kind: "companion" }],
  frontPage: { stats: [{ id: "core" }] },
};

const [{ generatePdfBytes }, { loadPdfSvgAssetBundle, PDF_EXPORT_SVG_ASSET_PATHS }] = await Promise.all([
  import(path.join(projectRoot, "web", "lib", "pdf", "generate.ts")).catch(() => import(path.join(projectRoot, "lib", "pdf", "generate.ts"))),
  import(path.join(projectRoot, "web", "lib", "pdf", "svg-assets.server.ts")).catch(() => import(path.join(projectRoot, "lib", "pdf", "svg-assets.server.ts"))),
]);

const assetKeys = [
  "frontPageHeader",
  "frontPageHeaderShell",
  "hpPanel",
  "passivesAndSpeeds",
  "weaponAttacks",
  "generalContainer",
  "weaponBg",
  "greyBackground",
  "proficiencyBoolean",
  "proficiencyBox0",
  "proficiencyBox1",
  "line",
  "skillLine",
  "statBlock",
  "hitDie",
  "bonusBox",
  "ac",
  "hp",
  "passiveBox",
  "skillBlock",
  "abilityPanel",
];

const assets = await loadPdfSvgAssetBundle(assetKeys);
const pdfBytes = await generatePdfBytes(character, assets);
const out = path.join(projectRoot, ".qa", "companion-pdf-smoke.pdf");
await writeFile(out, pdfBytes);
console.log(`Wrote ${pdfBytes.byteLength} bytes to ${out}`);
