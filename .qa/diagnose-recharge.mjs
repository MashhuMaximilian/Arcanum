#!/usr/bin/env bun
// Diagnostic: construct a 4-class multiclass (3 Bard / 3 Druid / 2 Wizard / 2 Sorcerer = level 10)
// and print every class-resource-N stat's meta verbatim, plus pushResource's stored cadence.

// Cannot import the unexported getClassResources; the function lives in
// web/lib/pdf/from-builder.ts and is called internally by buildStatCards /
// buildPdfCharacterFromBuilder. We replicate the EXACT code path of:
//   1. getClassResources() — see lines 1440-1568 in from-builder.ts
//   2. buildStatCards() — see lines 1810-1860 in from-builder.ts (classResources map)
//   3. parseClassResource() — see lines 690-725 in front-page-renderer.ts
// All we need is the call to pushResource with the hardcoded per-class blocks.

// Step 1: simulate the regex-matched hardcoded blocks.
// The user's class names are "College of Lore Bard", "Circle of the Land Druid",
// "School of Abjuration Wizard", "Wild Magic Sorcerer". The /bard/i, /druid/i etc.
// regexes match these. So pushResource fires 4 times with the inputs below.

const simulated = [
  { ownerLabel: "BARD", label: "Bardic Inspiration", value: "1 d6", cadence: "Long Rest" },
  { ownerLabel: "DRUID", label: "Wild Shape", value: "2 uses", cadence: "Short Rest" },
  { ownerLabel: "WIZARD", label: "Arcane Recovery", value: "1 use", cadence: "Long Rest" },
  { ownerLabel: "SORCERER", label: "Sorcery Points", value: "1", cadence: "Long Rest" },
];

console.log("SIMULATED classResources array (what pushResource SHOULD produce):");
console.log(JSON.stringify(simulated, null, 2));
console.log("");

console.log("SIMULATED buildStatCards output (with the v1 meta builder):");
const metaBuilt = simulated.map((resource, index) => ({
  id: `class-resource-${index + 1}`,
  label: resource.label,
  value: resource.value,
  meta: resource.cadence
    ? `${resource.ownerLabel}\n${resource.label}\n${resource.cadence}`
    : `${resource.ownerLabel}\n${resource.label}`,
}));
console.log(JSON.stringify(metaBuilt, null, 2));
console.log("");

console.log("SIMULATED parseClassResource output for each:");
for (const stat of metaBuilt) {
  const parts = stat.meta.split("\n").map((p) => p.trim()).filter(Boolean);
  const className = parts[0] ?? "";
  const label = parts[1] ?? "";
  const cadence = parts[2] ?? ""; // expandResourceCadence(...) in real code
  console.log(`  ${stat.id}: className="${className}" label="${label}" cadence="${cadence}"`);
}
