// Test script to inspect the class resource stats array
import { buildCoreStats } from "../web/lib/pdf/from-builder.ts";
import type { CharacterContext } from "../web/lib/pdf/types.ts";

const character: CharacterContext = {
  name: "Test Char",
  classEntries: [
    { class: "wizard", level: 1, subclass: null, selectedFeatureNames: ["Arcane Recovery"] },
    { class: "sorcerer", level: 1, subclass: null, selectedFeatureNames: [] },
    { class: "warlock", level: 1, subclass: null, selectedFeatureNames: [] },
    { class: "druid", level: 1, subclass: null, selectedFeatureNames: [] },
    { class: "bard", level: 1, subclass: null, selectedFeatureNames: [] },
  ],
  abilityScores: { str: 10, dex: 14, con: 12, int: 16, wis: 13, cha: 8 },
  race: "human",
  background: "acolyte",
  level: 5,
  hitPointMax: 30,
  hitPoints: 30,
  armorClass: 12,
  speed: 30,
  proficiencyBonus: 3,
  savingThrowProficiencies: [],
  skillProficiencies: [],
  languages: [],
  toolProficiencies: [],
  equipment: [],
  spellsKnown: [],
  spellsPrepared: [],
  cantripsKnown: [],
  spellSlots: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  attacks: [],
  features: [],
  traits: [],
  bonds: [],
  flaws: [],
  ideals: [],
  personalityTraits: [],
  backstory: "",
  notes: "",
  alignment: "Neutral",
  experience: 0,
  inspiration: false,
  deathSaves: { successes: 0, failures: 0 },
  conditions: [],
  exhaustion: 0,
  tempHp: 0,
  hitDiceTotal: "5d6",
  hitDiceUsed: 0,
  // ... other required fields
} as any;

const stats = buildCoreStats(character);
const classResources = stats.filter(s => s.id.startsWith("class-resource-"));
console.log("=== Class Resources ===");
for (const stat of classResources) {
  console.log(`\nID: ${stat.id}`);
  console.log(`  Label: ${JSON.stringify(stat.label)}`);
  console.log(`  Value: ${JSON.stringify(stat.value)}`);
  console.log(`  Meta:  ${JSON.stringify(stat.meta)}`);
  console.log(`  Meta lines:`);
  for (const line of (stat.meta ?? "").split("\n")) {
    console.log(`    > ${JSON.stringify(line)}`);
  }
}
