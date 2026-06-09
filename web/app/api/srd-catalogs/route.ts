import { NextResponse } from "next/server";

import { getBuiltInSrdBackgroundElements, getBuiltInSrdBackgrounds } from "@/lib/builtins/backgrounds";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "@/lib/builtins/classes";
import { getBuiltInSrdFeats } from "@/lib/builtins/feats";
import { getBuiltInSrdRaceElements, getBuiltInSrdRaces } from "@/lib/builtins/races";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import { getBuiltInSrdSpells } from "@/lib/builtins/spells";
import { getBundledSrd52Elements } from "@/lib/content-packs/bundled";

// Builder step IDs that map to which catalog groups they need.
// Steps that need no SRD data are listed with an empty array so the route
// returns an empty payload (not the full 4MB).
// `foundation` is intentionally NOT in the map: it's the initial mount state
// before the active step is known, and consumers expect the full payload then.
// (See BuilderCatalogShell — it skips ?step= for the initial foundation mount.)
const STEP_GROUPS: Record<string, string[]> = {
  race:       ["races", "progressionElements"],
  subrace:    ["races", "progressionElements"],
  class:      ["classes", "progressionElements"],
  subclass:   ["classes", "progressionElements"],
  background: ["backgrounds", "progressionElements"],
  progression: [],
  feats:      ["feats"],
  equipment:  [],
  backstory:  [],
  spellcasting: ["spells"],
  review:     [],
};

function buildResponse(step?: string): Record<string, unknown> {
  const backgrounds     = getBuiltInSrdBackgrounds();
  const races           = getBuiltInSrdRaces();
  const classes         = getBuiltInSrdClasses();
  const feats           = getBuiltInSrdFeats();
  const spells          = getBuiltInSrdSpells();

  const raceElements       = getBuiltInSrdRaceElements();
  const classElements      = getBuiltInSrdClassElements();
  const backgroundElements = getBuiltInSrdBackgroundElements();
  const companionElements  = getBuiltInSrdCompanions();
  const companionSubElements = getBuiltInSrdCompanionSubElements();

  const progressionElements = [
    ...raceElements,
    ...classElements,
    ...backgroundElements,
    ...companionElements,
    ...companionSubElements,
  ];

  const all = { backgrounds, classes, feats, progressionElements, races, spells };

  // Unknown or missing step → return everything (backward compat with
  // any consumer that hasn't been updated to send a step).
  if (!step || !STEP_GROUPS[step]) {
    return all;
  }

  const groups = STEP_GROUPS[step];
  if (groups.length === 0) {
    // Step is in the map but needs no SRD data → return an empty payload.
    // Use the same shape (all keys present) so consumers don't break.
    return { backgrounds: [], classes: [], feats: [], progressionElements: [], races: [], spells: [] };
  }

  const result: Record<string, unknown> = {};
  for (const g of groups) {
    result[g] = all[g as keyof typeof all];
  }
  return result;
}

function buildSrd52Response(step?: string): Record<string, unknown> {
  const elements = getBundledSrd52Elements();
  if (!step || !STEP_GROUPS[step]) {
    return { elements };
  }

  const groups = STEP_GROUPS[step];
  const types = new Set<string>();
  if (groups.includes("races")) {
    ["Race", "Sub Race", "Race Variant", "Racial Trait"].forEach((type) => types.add(type));
  }
  if (groups.includes("classes")) {
    ["Class", "Class Feature", "Archetype", "Archetype Feature"].forEach((type) => types.add(type));
  }
  if (groups.includes("backgrounds")) {
    ["Background", "Background Feature", "Background Variant"].forEach((type) => types.add(type));
  }
  if (groups.includes("feats")) {
    ["Feat", "Feat Feature", "Ability Score Improvement"].forEach((type) => types.add(type));
  }
  if (groups.includes("spells")) {
    types.add("Spell");
  }
  if (groups.includes("progressionElements")) {
    ["Language", "Proficiency", "Companion", "Companion Trait", "Companion Action", "Companion Reaction"]
      .forEach((type) => types.add(type));
  }

  return {
    elements: elements.filter((element) => types.has(element.type)),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const step = searchParams.get("step") ?? undefined;
  const ruleset = searchParams.get("ruleset") ?? "dnd5e-2014";

  const data = ruleset === "dnd5e-2024" ? buildSrd52Response(step) : buildResponse(step);

  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=3600",
  };

  // ETag for 304 support — use content length as a weak validator
  headers["ETag"] = `W/"${JSON.stringify(data).length}"`;

  return NextResponse.json(data, { headers });
}
