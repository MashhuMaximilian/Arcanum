// Quick verification: simulate isLowSignalFeatureElement against the actual
// FEATURES list from the user's last PDF (cotin-14.txt). Confirms the KEEP
// filter drops the DEFER list and keeps the KEEP list.
//
// Note: re-implements isLowSignalFeatureElement from from-builder.ts inline
// (the function is not exported). The two implementations must stay in sync.

function makeIsLowSignalFeatureElement() {
  const DEFER_NAME_PATTERNS = [
    /^expertise$/i,
    /^skill expertise/i,
    /^circle spells?$/i,
    /^mountain circle/i,
    /^natural recovery$/i,
    /^favou?red enemy/i,
    /^natural explorer/i,
    /^metamagic/i,
    /^man[eu]vers?/i,
    /^(?:eldritch )?invocations?$/i,
    /^infusions?/i,
    /^wild\s+comp(?:anion)?/i,
    /^prepared spells?$/i,
    /^spells? known$/i,
    /^spellbook$/i,
    /^bonus proficien/i,
    /^additional feature/i,
    /^divine\s+domain/i,
    /^spider\s+climb/i,
    /^lightning\s+bolt/i,
    /^stoneskin/i,
    /^passwall$/i,
    /^stone\s+shape/i,
    /^spike\s+growth/i,
    /^meld\s+into\s+stone/i,
  ];
  return (name, type, description) => {
    const title = String(name ?? "").trim();
    const haystack = `${name} ${type} ${description ?? ""}`.toLowerCase();
    if (/\b(proficiency|language)\b/.test(type ?? "")) return true;
    if (/(language|proficiency) option/i.test(title)) return true;
    if (/\b(tool|instrument|language)\s+proficiency\b/i.test(haystack)) return true;
    if (/^ability score improvement$/i.test(title)) return true;
    if (
      /^(bard college|roguish archetype|sacred oath|divine domain|druid circle|martial archetype|arcane tradition|primal path|otherworldly patron)$/i.test(
        title,
      )
    ) {
      return true;
    }
    if (DEFER_NAME_PATTERNS.some((re) => re.test(title))) return true;
    return false;
  };
}

const isLowSignal = makeIsLowSignalFeatureElement();

// Entries from cotin-14.txt, exact text (all caps in source, lowercased via case-insensitive match)
const entries = [
  // Class column
  { name: "DRUIDIC", type: "Class Feature", description: "" },
  { name: "EXPERTISE", type: "Class Feature", description: "Choose two of your skill proficiencies..." },
  { name: "JACK OF ALL TRADES", type: "Class Feature", description: "" },
  { name: "BONUS PROFICIENCIES", type: "Class Feature", description: "" },
  { name: "SORCEROUS ORIGIN", type: "Class Feature", description: "" },
  { name: "ARCANE RECOVERY", type: "Class Feature", description: "" },
  { name: "BARDIC INSPIRATION", type: "Class Feature", description: "" },
  { name: "SONG OF REST", type: "Class Feature", description: "" },
  { name: "ADDITIONAL FEATURE: SHELTER OF THE FAITHFUL", type: "Class Feature", description: "" },
  { name: "DRACONIC ANCESTRY (BLUE)", type: "Class Feature", description: "" },
  { name: "SKILL EXPERTISE (INSIGHT)", type: "Class Feature", description: "" },
  { name: "SKILL EXPERTISE (RELIGION)", type: "Class Feature", description: "" },
  { name: "STONESKIN", type: "Class Feature", description: "" },
  { name: "MELD INTO STONE", type: "Class Feature", description: "" },
  { name: "PASSWALL", type: "Class Feature", description: "" },
  { name: "STONE SHAPE", type: "Class Feature", description: "" },
  // Subclass column
  { name: "ABJURATION SAVANT", type: "Archetype Feature", description: "" },
  { name: "BONUS CANTRIP", type: "Archetype Feature", description: "" },
  { name: "ARCANE WARD", type: "Archetype Feature", description: "" },
  { name: "CIRCLE SPELLS", type: "Archetype Feature", description: "" },
  { name: "CUTTING WORDS", type: "Archetype Feature", description: "" },
  { name: "NATURAL RECOVERY", type: "Archetype Feature", description: "" },
  { name: "TIDES OF CHAOS", type: "Archetype Feature", description: "" },
  { name: "WILD MAGIC SURGE", type: "Archetype Feature", description: "" },
  { name: "SPIDER CLIMB", type: "Archetype Feature", description: "" },
  { name: "LIGHTNING BOLT", type: "Archetype Feature", description: "" },
  { name: "MOUNTAIN CIRCLE", type: "Archetype Feature", description: "" },
  { name: "SPIKE GROWTH", type: "Archetype Feature", description: "" },
];

const kept = [];
const dropped = [];
for (const e of entries) {
  if (isLowSignal(e.name, e.type, e.description)) {
    dropped.push(e.name);
  } else {
    kept.push(e.name);
  }
}

console.log("KEEP (will appear on page 1):");
kept.forEach((n) => console.log("  -", n));
console.log("");
console.log("DEFER (dropped to page 2+):");
dropped.forEach((n) => console.log("  -", n));
console.log("");
console.log(`Total: ${kept.length} kept, ${dropped.length} dropped.`);

// Sanity assertions
const expectedDropped = [
  "EXPERTISE",
  "BONUS PROFICIENCIES",
  "ADDITIONAL FEATURE: SHELTER OF THE FAITHFUL",
  "SKILL EXPERTISE (INSIGHT)",
  "SKILL EXPERTISE (RELIGION)",
  "STONESKIN",
  "MELD INTO STONE",
  "PASSWALL",
  "STONE SHAPE",
  "CIRCLE SPELLS",
  "NATURAL RECOVERY",
  "SPIDER CLIMB",
  "LIGHTNING BOLT",
  "MOUNTAIN CIRCLE",
  "SPIKE GROWTH",
];
const expectedKept = [
  "DRUIDIC",
  "JACK OF ALL TRADES",
  "SORCEROUS ORIGIN",
  "ARCANE RECOVERY",
  "BARDIC INSPIRATION",
  "SONG OF REST",
  "DRACONIC ANCESTRY (BLUE)",
  "ABJURATION SAVANT",
  "BONUS CANTRIP",
  "ARCANE WARD",
  "CUTTING WORDS",
  "TIDES OF CHAOS",
  "WILD MAGIC SURGE",
];

let pass = true;
for (const n of expectedDropped) {
  if (!dropped.includes(n)) {
    console.log(`MISS: expected to drop "${n}" but it was kept`);
    pass = false;
  }
}
for (const n of expectedKept) {
  if (!kept.includes(n)) {
    console.log(`MISS: expected to keep "${n}" but it was dropped`);
    pass = false;
  }
}
console.log("");
console.log(pass ? "PASS: all KEEP/DEFER expectations met" : "FAIL: see messages above");
process.exit(pass ? 0 : 1);
