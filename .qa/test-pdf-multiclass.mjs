// Build a minimal ResolvedPdfCharacter for a multiclass wizard/sorcerer,
// POST to /pdf-export, save PDF, convert to PNG, OCR for verification.
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const character = {
  id: "test1",
  name: "Test Wizard/Sorcerer",
  playerName: "QA",
  level: 2,
  raceLabel: "Human",
  subraceLabel: "",
  classLabel: "Wizard 1 / Sorcerer 1",
  subclassLabel: "",
  backgroundLabel: "Sage",
  alignment: "True Neutral",
  deity: "",
  stats: [],
  frontPage: {
    stats: [
      // Wizard's Arcane Recovery (long rest)
      { id: "class-resource-1", label: "Arcane Recovery", value: "1 use", meta: "Wizard\nArcane Recovery\nlong rest" },
      // Sorcerer's Sorcery Points (long rest)
      { id: "class-resource-2", label: "Sorcery Points", value: "1", meta: "Sorcerer\nSorcery Points\nlong rest" },
      // Bardic Inspiration (short rest)
      { id: "class-resource-3", label: "Bardic Inspiration", value: "1d6", meta: "Bard\nBardic Inspiration\nshort rest" },
      // Spellcasting sources to trigger multiclass path
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
  companionCards: [],
  inventoryCards: [],
  spellCards: [],
  backstoryCards: [],
  appendixEntries: [],
  notes: [],
  pagePlan: [],
  railCards: [],
  source: {
    id: "test1",
    name: "Test",
    classEntries: [],
    level: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skillProficiencies: [],
    saveProficiencies: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [],
  },
};

console.log("→ POST /pdf-export");
const res = await fetch("http://localhost:3000/pdf-export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(character),
});
console.log(`  status=${res.status} content-type=${res.headers.get("content-type")}`);
if (!res.ok) {
  const t = await res.text();
  console.error("ERROR:", t.slice(0, 800));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
console.log(`  bytes=${buf.length}`);
await writeFile("/Users/max/dev/Arcanum/.qa/test-after.pdf", buf);
console.log("  saved /Users/max/dev/Arcanum/.qa/test-after.pdf");

// Convert PDF to PNG
console.log("→ convert PDF to PNG");
try {
  execSync(`sips -s format png /Users/max/dev/Arcanum/.qa/test-after.pdf --out /Users/max/dev/Arcanum/.qa/test-after.png 2>&1 | tail -1`, { stdio: "pipe" });
  console.log("  converted via sips");
} catch (e) {
  console.log("  sips failed:", e.message.slice(0, 200));
  try {
    execSync(`pdftoppm -png -r 200 /Users/max/dev/Arcanum/.qa/test-after.pdf /Users/max/dev/Arcanum/.qa/test-after`, { stdio: "inherit" });
    console.log("  converted via pdftoppm");
  } catch (e2) {
    console.log("  pdftoppm failed:", e2.message.slice(0, 200));
  }
}

// OCR
console.log("→ OCR");
try {
  const ocr = execSync(`tesseract /Users/max/dev/Arcanum/.qa/test-after.png - 2>/dev/null`, { encoding: "utf8" });
  console.log("OCR OUTPUT:");
  console.log(ocr);
} catch (e) {
  console.log("  OCR failed:", e.message);
}
