import { NextResponse } from "next/server";

import { getBuiltInSrdBackgroundElements, getBuiltInSrdBackgrounds } from "@/lib/builtins/backgrounds";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "@/lib/builtins/classes";
import { getBuiltInSrdFeats, getBuiltInSrdFeatElements } from "@/lib/builtins/feats";
import { getBuiltInSrdRaceElements, getBuiltInSrdRaces } from "@/lib/builtins/races";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import { getBuiltInSrdSpells } from "@/lib/builtins/spells";

export async function GET() {
  const backgrounds = getBuiltInSrdBackgrounds();
  const races = getBuiltInSrdRaces();
  const classes = getBuiltInSrdClasses();
  const feats = getBuiltInSrdFeats();
  const spells = getBuiltInSrdSpells();
  
  const raceElements = getBuiltInSrdRaceElements();
  const classElements = getBuiltInSrdClassElements();
  const backgroundElements = getBuiltInSrdBackgroundElements();
  const companionElements = getBuiltInSrdCompanions();
  const companionSubElements = getBuiltInSrdCompanionSubElements();
  
  const progressionElements = [
    ...raceElements,
    ...classElements,
    ...backgroundElements,
    ...companionElements,
    ...companionSubElements,
  ];

  return NextResponse.json(
    { backgrounds, classes, feats, progressionElements, races, spells },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}