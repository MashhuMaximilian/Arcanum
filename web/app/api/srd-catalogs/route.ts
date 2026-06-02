import { NextResponse } from "next/server";

import { getBuiltInSrdBackgroundElements, getBuiltInSrdBackgrounds } from "@/lib/builtins/backgrounds";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "@/lib/builtins/classes";
import { getBuiltInSrdFeats } from "@/lib/builtins/feats";
import { getBuiltInSrdRaceElements, getBuiltInSrdRaces } from "@/lib/builtins/races";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import { getBuiltInSrdSpells } from "@/lib/builtins/spells";

// Builder step IDs that map to which catalog groups they need.
// Steps not listed (foundation, progression, equipment, backstory, review) need no SRD data.
const STEP_GROUPS: Record<string, string[]> = {
  race:      ["races", "progressionElements"],
  subrace:   ["races", "progressionElements"],
  class:     ["classes", "progressionElements"],
  subclass:  ["classes", "progressionElements"],
  background: ["backgrounds", "progressionElements"],
  feats:     ["feats"],
  spellcasting: ["spells"],
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

  // Unknown or missing step → return everything (backward compat)
  if (!step || !STEP_GROUPS[step]) {
    return all;
  }

  const groups = STEP_GROUPS[step];
  if (groups.length === 0) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const g of groups) {
    result[g] = all[g as keyof typeof all];
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const step = searchParams.get("step") ?? undefined;

  const data = buildResponse(step);

  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=3600",
  };

  // ETag for 304 support — use content length as a weak validator
  headers["ETag"] = `W/"${JSON.stringify(data).length}"`;

  return NextResponse.json(data, { headers });
}