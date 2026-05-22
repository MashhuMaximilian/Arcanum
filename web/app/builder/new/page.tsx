import { BuilderCatalogShell } from "@/components/builder-catalog-shell";
import {
  getBuiltInSrdBackgroundElements,
  getBuiltInSrdBackgrounds,
} from "@/lib/builtins/backgrounds";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "@/lib/builtins/classes";
import { getBuiltInSrdFeats } from "@/lib/builtins/feats";
import { getBuiltInSrdRaceElements, getBuiltInSrdRaces } from "@/lib/builtins/races";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import { getBuiltInSrdSpells } from "@/lib/builtins/spells";

export default function BuilderNewPage() {
  const backgrounds = getBuiltInSrdBackgrounds();
  const races = getBuiltInSrdRaces();
  const classes = getBuiltInSrdClasses();
  const companionElements = getBuiltInSrdCompanions();
  const companionSubElements = getBuiltInSrdCompanionSubElements();
  const progressionElements = [
    ...getBuiltInSrdRaceElements(),
    ...getBuiltInSrdClassElements(),
    ...getBuiltInSrdBackgroundElements(),
    ...companionElements,
    ...companionSubElements,
  ];
  const feats = getBuiltInSrdFeats();
  const spells = getBuiltInSrdSpells();

  return (
    <BuilderCatalogShell
      initialBackgrounds={backgrounds}
      initialClasses={classes}
      initialFeats={feats}
      initialProgressionElements={progressionElements}
      initialRaces={races}
      initialSpells={spells}
    />
  );
}
