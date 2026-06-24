// Render a 4-class multiclass character with a companion whose hit_dice tag
// is "3d8 • 3d8 • 2d8 • 2d6" (23 chars). Save the PDF, convert page 2 to PNG,
// OCR with tesseract, and verify the full hit dice string appears in the OCR
// output (i.e. nothing got truncated to "...").
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const HOST = "http://localhost:3000";
const OUT_DIR = "/Users/max/dev/Arcanum/.qa";

// ResolvedPdfCharacter JSON: a Bard 3 / Druid 3 / Wizard 2 / Sorcerer 2
// multiclass with a single-class companion (Familiar 1) that we override with
// a multiclass-style hit_dice tag to reproduce the bug from the user.
const character = {
  id: "test-v3-multiclass",
  name: "Test V3 Multiclass",
  playerName: "QA",
  level: 10,
  raceLabel: "Custom Lineage",
  subraceLabel: "",
  classLabel: "Bard 3 / Druid 3 / Wizard 2 / Sorcerer 2",
  subclassLabel: "College of Lore / Circle of the Land / School of Evocation / Draconic Bloodline",
  backgroundLabel: "Sage",
  alignment: "True Neutral",
  deity: "",
  stats: [],
  frontPage: {
    stats: [
      // 4 class resources (one per class)
      { id: "class-resource-1", label: "Bardic Inspiration", value: "2d6", meta: "Bard\nBardic Inspiration\nlong rest" },
      { id: "class-resource-2", label: "Wild Shape", value: "2 uses", meta: "Druid\nWild Shape\nshort rest" },
      { id: "class-resource-3", label: "Arcane Recovery", value: "1 use", meta: "Wizard\nArcane Recovery\nlong rest" },
      { id: "class-resource-4", label: "Sorcery Points", value: "2", meta: "Sorcerer\nSorcery Points\nlong rest" },
      // Spellcasting sources to trigger multiclass path on the front page
      { id: "spellcasting-source-Bard-bonus", label: "Bard Bonus", value: "+5", meta: "" },
      { id: "spellcasting-source-Bard-dc", label: "Bard DC", value: "13", meta: "" },
      { id: "spellcasting-source-Bard-ability", label: "Bard Ability", value: "CHA", meta: "" },
      { id: "spellcasting-source-Druid-bonus", label: "Druid Bonus", value: "+5", meta: "" },
      { id: "spellcasting-source-Druid-dc", label: "Druid DC", value: "13", meta: "" },
      { id: "spellcasting-source-Druid-ability", label: "Druid Ability", value: "WIS", meta: "" },
      { id: "spellcasting-source-Wizard-bonus", label: "Wizard Bonus", value: "+6", meta: "" },
      { id: "spellcasting-source-Wizard-dc", label: "Wizard DC", value: "14", meta: "" },
      { id: "spellcasting-source-Wizard-ability", label: "Wizard Ability", value: "INT", meta: "" },
      { id: "spellcasting-source-Sorcerer-bonus", label: "Sorcerer Bonus", value: "+5", meta: "" },
      { id: "spellcasting-source-Sorcerer-dc", label: "Sorcerer DC", value: "13", meta: "" },
      { id: "spellcasting-source-Sorcerer-ability", label: "Sorcerer Ability", value: "CHA", meta: "" },
    ],
    abilityRows: [],
    skillRows: [],
    attackRows: [],
    proficiencyGroups: { weapons: [], armor: [], tools: [], vehicles: [], languages: [] },
    deck: [],
    deckOverflow: [],
    railCards: [],
    rightColumn: {
      sensesAndConditions: [],
      racialCards: [],
      subracialCards: [],
      feats: [],
      conditions: [],
      senses: [],
      notes: [],
    },
    notes: [],
    capacity: 0,
    combatHub: { weaponRows: [], hasSpells: false },
  },
  // Companion with hit_dice tag set to the multiclass-style value to reproduce
  // the bug in renderCompanionStatsRow. The companion also has a class resource
  // with a Recharge value to exercise the Recharge column fix on page 1.
  companionCards: [
    {
      id: "companion-1",
      name: "Familiar (Test)",
      type: "familiar",
      cr: "0",
      ac: "12",
      hp: "5 (1d4+1)",
      speed: "30 ft., fly 60 ft.",
      senses: "darkvision 60 ft.",
      languages: "—",
      // Tags drive the companion stats row. hit_dice uses the multiclass value.
      tags: [
        "type:Familiar",
        "cr:0",
        "ac:12",
        "hp:5 (1d4+1)",
        "speed:30 ft., fly 60 ft.",
        "senses:darkvision 60 ft.",
        "languages:—",
        "level:10",
        "hit_dice:3d8 • 3d8 • 2d8 • 2d6",
        "str:8", "dex:14", "con:12", "int:2", "wis:12", "cha:6",
      ],
    },
  ],
  inventoryCards: [],
  spellCards: [],
  backstoryCards: [],
  appendixEntries: [],
  notes: [],
  pagePlan: [],
  railCards: [],
  source: {
    id: "test-v3-multiclass",
    name: "Test",
    classEntries: [
      { classId: "bard", level: 3 },
      { classId: "druid", level: 3 },
      { classId: "wizard", level: 2 },
      { classId: "sorcerer", level: 2 },
    ],
    level: 10,
    abilities: { str: 10, dex: 14, con: 12, int: 13, wis: 12, cha: 14 },
    skillProficiencies: [],
    saveProficiencies: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [],
  },
};

console.log("POSTing character to", HOST + "/pdf-export", "...");
const res = await fetch(HOST + "/pdf-export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(character),
});
if (!res.ok) {
  console.error("HTTP", res.status, res.statusText);
  console.error(await res.text().catch(() => "(no body)"));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const pdfPath = `${OUT_DIR}/v3-after.pdf`;
await writeFile(pdfPath, buf);
console.log("Saved", pdfPath, "(", buf.length, "bytes )");

// Convert page 2 to PNG via Ghostscript
const pngPath = `${OUT_DIR}/v3-after-page2.png`;
execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r200 -dFirstPage=2 -sOutputFile="${pngPath}" "${pdfPath}"`, { stdio: "inherit" });
console.log("Saved", pngPath);

// OCR via tesseract
const ocrPath = `${OUT_DIR}/v3-after-page2.txt`;
execSync(`tesseract "${pngPath}" "${ocrPath.replace(/\.txt$/, "")}"`, { stdio: "inherit" });
console.log("Saved", ocrPath);

// Check that the hit dice string is present (without the "..." truncation)
import { readFile } from "node:fs/promises";
const ocr = await readFile(ocrPath, "utf8");
const hitDiceTarget = "3d8 • 3d8 • 2d8 • 2d6";
const allEntries = ["3d8", "2d8", "2d6"];

console.log("\n--- Verification ---");
console.log("OCR contains exact target string '3d8 • 3d8 • 2d8 • 2d6':", ocr.includes(hitDiceTarget));
for (const e of allEntries) {
  console.log(`OCR contains '${e}':`, ocr.includes(e));
}
// Check there's no '...' ellipsis in the page
const hasEllipsis = ocr.match(/\.{2,}/);
console.log("OCR has '...' (ellipsis):", !!hasEllipsis, hasEllipsis ? `(${hasEllipsis[0]} at line ${ocr.split("\n").findIndex((l) => l.includes("..."))+1})` : "");

// Also check Recharge labels appear somewhere (they're on page 1, not page 2)
console.log("\nNote: Recharge labels are on page 1 (companion's class resources). Convert page 1 to verify.");
const pngPathP1 = `${OUT_DIR}/v3-after-page1.png`;
execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r200 -dFirstPage=1 -sOutputFile="${pngPathP1}" "${pdfPath}"`, { stdio: "inherit" });
const ocrPathP1 = `${OUT_DIR}/v3-after-page1.txt`;
execSync(`tesseract "${pngPathP1}" "${ocrPathP1.replace(/\.txt$/, "")}"`, { stdio: "inherit" });
const ocrP1 = await readFile(ocrPathP1, "utf8");
for (const label of ["Long Rest", "Short Rest", "Bardic Inspiration", "Wild Shape", "Arcane Recovery", "Sorcery Points"]) {
  console.log(`Page 1 OCR contains '${label}':`, ocrP1.includes(label));
}
