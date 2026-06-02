// Build a simple multiclass test payload and POST to the dev server's PDF export endpoint
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const character = {
  name: "Test Multiclass",
  level: 9,
  classLabel: "Bard / Sorcerer / Druid / Wizard",
  subclassLabel: "College of Lore / Wild Magic / Circle of the Moon",
  source: {
    classEntries: [
      { classId: "bard", subclassId: "college-of-lore", level: 4 },
      { classId: "sorcerer", subclassId: "wild-magic", level: 2 },
      { classId: "druid", subclassId: "circle-of-the-moon", level: 2 },
      { classId: "wizard", subclassId: null, level: 1 },
    ],
  },
  frontPage: {
    stats: [
      { id: "class-1", label: "Class", value: "Bard 4", meta: "" },
      { id: "class-resource-1", label: "Class Resource", value: "4", meta: "Bard\nBardic Inspiration\nLong Rest" },
      { id: "class-resource-2", label: "Class Resource", value: "3", meta: "Bard\nSpell Slots\nLong Rest" },
      { id: "class-resource-3", label: "Class Resource", value: "1", meta: "Sorcerer\nWild Surge\nLong Rest" },
      { id: "class-resource-4", label: "Class Resource", value: "2", meta: "Sorcerer\nSorcery Points" },
      { id: "class-resource-5", label: "Class Resource", value: "2", meta: "Druid\nWild Shape\nShort Rest" },
      { id: "class-resource-6", label: "Class Resource", value: "2", meta: "Wizard\nArcane Recovery\nLong Rest" },
    ],
    abilityRows: [],
    skillRows: [],
    attackRows: [],
    proficiencyGroups: {
      weapons: [],
      armor: [],
      tools: [],
      vehicles: [],
      languages: [],
    },
    deck: [],
    deckOverflow: [],
    railCards: [],
    rightColumn: {
      sensesAndConditions: [],
      racialCards: [],
      subracialCards: [],
      overflow: [],
    },
    notes: [],
    capacity: 0,
    combatHub: { hasSpells: false, weaponRows: [] },
  },
  pagePlan: [],
  pages: [],
  backstory: {
    appearance: "",
    backstory: "",
    alignment: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
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
const dir = mkdtempSync(join(tmpdir(), "arcanum-multiclass-"));
const pdfPath = join(dir, "test.pdf");
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(pdfPath, buf);
console.log("Wrote", pdfPath, buf.length, "bytes");
