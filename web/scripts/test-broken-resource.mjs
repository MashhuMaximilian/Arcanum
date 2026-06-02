// Test the parseClassResource fallback case
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const character = {
  name: "Test Broken Resource",
  level: 5,
  classLabel: "Bard / Wizard",
  subclassLabel: "College of Lore",
  source: {
    classEntries: [
      { classId: "bard", subclassId: "college-of-lore", level: 3 },
      { classId: "wizard", subclassId: null, level: 2 },
    ],
  },
  frontPage: {
    stats: [
      { id: "class-1", label: "Class", value: "Bard 3", meta: "" },
      // Normal resource - should show name
      { id: "class-resource-1", label: "Bardic Inspiration", value: "3", meta: "Bard\nBardic Inspiration\nLong Rest" },
      // 1-part meta - should fall back to label (which is the actual name)
      { id: "class-resource-2", label: "Arcane Recovery", value: "?", meta: "Wizard" },
      // 2-part meta (no cadence) - should show name, no recharge
      { id: "class-resource-3", label: "Arcane Recovery", value: "2", meta: "Wizard\nArcane Recovery" },
    ],
    abilityRows: [],
    skillRows: [],
    attackRows: [],
    proficiencyGroups: {
      weapons: [], armor: [], tools: [], vehicles: [], languages: [],
    },
    deck: [],
    deckOverflow: [],
    railCards: [],
    rightColumn: { sensesAndConditions: [], racialCards: [], subracialCards: [], overflow: [] },
    notes: [],
    capacity: 0,
    combatHub: { hasSpells: false, weaponRows: [] },
  },
  pagePlan: [],
  pages: [],
  backstory: {
    appearance: "", backstory: "", alignment: "", personalityTraits: "",
    ideals: "", bonds: "", flaws: "", age: "", height: "", weight: "",
    eyes: "", skin: "", hair: "",
  },
};

const res = await fetch("http://localhost:3000/pdf-export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(character),
});
if (!res.ok) {
  console.error("Export failed:", res.status, await res.text());
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "arcanum-broken-"));
const pdfPath = join(dir, "test.pdf");
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(pdfPath, buf);
console.log("Wrote", pdfPath, buf.length, "bytes");
