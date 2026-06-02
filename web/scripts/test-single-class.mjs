// Test single-class character
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const character = {
  name: "Single Class Test",
  level: 5,
  classLabel: "Wizard",
  subclassLabel: "School of Evocation",
  source: {
    classEntries: [
      { classId: "wizard", subclassId: "school-of-evocation", level: 5 },
    ],
  },
  frontPage: {
    stats: [
      { id: "class-1", label: "Class", value: "Wizard 5", meta: "" },
      { id: "class-resource-1", label: "Arcane Recovery", value: "1", meta: "Wizard\nArcane Recovery\nLong Rest" },
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
const dir = mkdtempSync(join(tmpdir(), "arcanum-single-"));
const pdfPath = join(dir, "test.pdf");
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(pdfPath, buf);
console.log("Wrote", pdfPath, buf.length, "bytes");
