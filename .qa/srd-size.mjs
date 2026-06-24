import { getBuiltInSrdSpells } from "../web/lib/builtins/spells.ts";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "../web/lib/builtins/classes.ts";
import { getBuiltInSrdFeats } from "../web/lib/builtins/feats.ts";
import { getBuiltInSrdRaces, getBuiltInSrdRaceElements } from "../web/lib/builtins/races.ts";
import { getBuiltInSrdBackgrounds, getBuiltInSrdBackgroundElements } from "../web/lib/builtins/backgrounds.ts";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "../web/lib/builtins/srd-companions.ts";

const groups = {
  spells: getBuiltInSrdSpells(),
  classes: getBuiltInSrdClasses(),
  classElements: getBuiltInSrdClassElements(),
  feats: getBuiltInSrdFeats(),
  races: getBuiltInSrdRaces(),
  raceElements: getBuiltInSrdRaceElements(),
  backgrounds: getBuiltInSrdBackgrounds(),
  backgroundElements: getBuiltInSrdBackgroundElements(),
  companions: getBuiltInSrdCompanions(),
  companionSubElements: getBuiltInSrdCompanionSubElements(),
};

let total = 0;
for (const [k, v] of Object.entries(groups)) {
  const json = JSON.stringify(v);
  const mb = (json.length / 1024 / 1024).toFixed(3);
  const count = Array.isArray(v) ? v.length : Object.keys(v ?? {}).length;
  console.log(`${k.padEnd(22)} count=${String(count).padStart(5)}  json=${mb} MB`);
  total += json.length;
}
console.log(`\nTOTAL: ${(total / 1024 / 1024).toFixed(2)} MB shipped per /builder/new visit`);
