import fs from "node:fs/promises";
import path from "node:path";

const packPath = path.resolve("lib/content-packs/generated/srd52.json");
const pack = JSON.parse(await fs.readFile(packPath, "utf8"));

if (pack.format !== "arcanum.content-pack" || pack.ruleset !== "dnd5e-2024") {
  throw new Error("SRD 5.2.1 pack metadata is invalid.");
}
if (!pack.license?.attribution?.includes("System Reference Document 5.2.1")) {
  throw new Error("SRD 5.2.1 attribution is missing.");
}

const ids = new Set();
const counts = {};
for (const entry of pack.entries) {
  if (ids.has(entry.id)) {
    throw new Error(`Duplicate content ID: ${entry.id}`);
  }
  ids.add(entry.id);
  counts[entry.type] = (counts[entry.type] ?? 0) + 1;
}

for (const entry of pack.entries) {
  for (const rule of entry.rules ?? []) {
    if (rule.kind === "grant" && !ids.has(rule.id)) {
      throw new Error(`${entry.id} grants missing content ${rule.id}`);
    }
  }
}

const requiredMinimums = {
  Race: 9,
  Background: 4,
  Class: 12,
  "Class Feature": 100,
  Archetype: 12,
  Feat: 10,
  Spell: 300,
};

for (const [type, minimum] of Object.entries(requiredMinimums)) {
  if ((counts[type] ?? 0) < minimum) {
    throw new Error(`Expected at least ${minimum} ${type} entries, found ${counts[type] ?? 0}.`);
  }
}

for (const requiredId of [
  "srd52:race:goliath",
  "srd52:class:warlock",
  "srd52:feat:skilled",
  "srd52:spell:command",
]) {
  if (!ids.has(requiredId)) {
    throw new Error(`Required SRD content is missing: ${requiredId}`);
  }
}

const pactMagic = pack.entries.find(
  (entry) => entry.id === "srd52:class-feature:warlock:level-1:pact-magic",
);
if (!pactMagic?.spellcasting?.rules?.length) {
  throw new Error("Warlock Pact Magic progression was not normalized.");
}

console.log(`Verified ${pack.entries.length} SRD 5.2.1 entries.`);
console.log(JSON.stringify(counts, null, 2));
