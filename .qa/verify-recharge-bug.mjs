#!/usr/bin/env bun
// Minimal verification: replicate the EXACT data flow from buildPdfCharacterFromBuilder
// and inspect the meta for class-resource-N stats after normalizeText runs.

import { buildPdfCharacterFromBuilder } from "../web/lib/pdf/from-builder";

console.log("Direct call to buildPdfCharacterFromBuilder requires a full BuilderPdfSourceArgs.");
console.log("Instead, we replicate the resolve.pdf path that includes normalizeText.");
console.log("");

// Step 1: simulate the meta construction in buildStatCards (from-builder.ts:1849-1856)
// The user's character has 4 classes. pushResource fires 4 times with these inputs:
//   1. "Bard" (or "College of Lore Bard"), "Bardic Inspiration", "2 d6", "Long Rest"
//   2. "Druid" (or "Circle of the Land Druid"), "Wild Shape", "2 uses", "Short Rest"
//   3. "Wizard" (or "School of Abjuration Wizard"), "Arcane Recovery", "1 use", "Long Rest"
//   4. "Sorcerer" (or "Wild Magic Sorcerer"), "Sorcery Points", "2", "Long Rest"

const classResources = [
  { ownerLabel: "Bard", label: "Bardic Inspiration", value: "2 d6", cadence: "Long Rest" },
  { ownerLabel: "Druid", label: "Wild Shape", value: "2 uses", cadence: "Short Rest" },
  { ownerLabel: "Wizard", label: "Arcane Recovery", value: "1 use", cadence: "Long Rest" },
  { ownerLabel: "Sorcerer", label: "Sorcery Points", value: "2", cadence: "Long Rest" },
];

const stats = classResources.map((resource, index) => ({
  id: `class-resource-${index + 1}`,
  label: resource.label,
  value: resource.value,
  meta: resource.cadence
    ? `${resource.ownerLabel}\n${resource.label}\n${resource.cadence}`
    : `${resource.ownerLabel}\n${resource.label}`,
}));

console.log("STEP 1 — stats from buildStatCards (meta has \\n separators):");
for (const stat of stats) {
  console.log(`  ${stat.id}:`);
  console.log(`    label: "${stat.label}"`);
  console.log(`    value: "${stat.value}"`);
  console.log(`    meta:  ${JSON.stringify(stat.meta)}`);
  console.log(`    parts: ${stat.meta.split("\n").length} (${JSON.stringify(stat.meta.split("\n"))})`);
}
console.log("");

// Step 2: apply normalizeText to label, value, and meta (as resolve.ts:778-783 does)
function normalizeText(value) {
  return value.trim().replace(/\s+/g, " ");
}

const normalizedStats = stats.map((stat) => ({
  ...stat,
  label: normalizeText(stat.label),
  value: normalizeText(stat.value),
  meta: stat.meta ? normalizeText(stat.meta) : undefined,
}));

console.log("STEP 2 — stats after resolve.ts normalizeText runs:");
for (const stat of normalizedStats) {
  console.log(`  ${stat.id}:`);
  console.log(`    label: "${stat.label}"`);
  console.log(`    value: "${stat.value}"`);
  console.log(`    meta:  ${JSON.stringify(stat.meta)}`);
  console.log(`    parts: ${stat.meta.split("\n").length} (${JSON.stringify(stat.meta.split("\n"))})`);
}
console.log("");

// Step 3: simulate parseClassResource
console.log("STEP 3 — parseClassResource (split by \\n) on the post-normalizeText meta:");
for (const stat of normalizedStats) {
  const parts = stat.meta.split("\n").map((p) => p.trim()).filter(Boolean);
  const className = parts[0] ?? "";
  const label = parts[1] ?? "";
  const cadence = parts[2] ?? "";
  console.log(`  ${stat.id}: className="${className}" label="${label}" cadence="${cadence}"`);
}
console.log("");

console.log("VERDICT:");
console.log("If cadence in STEP 3 is empty for any row, that's the user's bug.");
console.log("If cadence in STEP 3 is correct, the bug is elsewhere.");
