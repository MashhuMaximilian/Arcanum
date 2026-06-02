"use client";

import { useEffect, useState } from "react";

import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import type { BuiltInElement } from "@/lib/builtins/types";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import { BuilderEditor } from "@/components/builder-editor";
import { resolveBuilderCatalogs } from "@/lib/content-sources/catalog-resolver";
import type { CharacterDraft } from "@/lib/characters/types";

type BuilderCatalogShellProps = {
  initialBackgrounds?: BuiltInBackgroundRecord[];
  initialClasses?: BuiltInClassRecord[];
  initialDraft?: CharacterDraft;
  initialFeats?: BuiltInElement[];
  initialProgressionElements?: readonly BuiltInElement[];
  initialRaces?: BuiltInRaceRecord[];
  initialSpells?: BuiltInElement[];
};

export function BuilderCatalogShell({
  initialBackgrounds = [],
  initialClasses = [],
  initialDraft,
  initialFeats = [],
  initialProgressionElements = [],
  initialRaces = [],
  initialSpells = [],
}: BuilderCatalogShellProps) {
  const [isHydratingCatalogs, setIsHydratingCatalogs] = useState(true);
  const [catalogs, setCatalogs] = useState({
    backgrounds: initialBackgrounds,
    classes: initialClasses,
    feats: initialFeats,
    progressionElements: [...initialProgressionElements],
    races: initialRaces,
    spells: initialSpells,
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrateCatalogs() {
      try {
        const response = await fetch("/api/srd-catalogs");
        if (!response.ok) {
          throw new Error(`Failed to fetch SRD catalogs: ${response.status}`);
        }
        const data = await response.json();
        const resolved = await resolveBuilderCatalogs(data.spells);

        if (!cancelled) {
          setCatalogs(resolved);
          setIsHydratingCatalogs(false);
        }
      } catch {
        // Keep built-in SRD catalogs if device cache resolution fails.
        if (!cancelled) {
          setIsHydratingCatalogs(false);
        }
      }
    }

    void hydrateCatalogs();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isHydratingCatalogs) {
    return (
      <section className="builder-stepPanel">
        <div className="builder-stepPanel__intro">
          <span className="route-shell__tag">Builder</span>
          <h2 className="route-shell__title">Loading synced catalogs</h2>
          <p className="route-shell__copy">
            We’re loading your built-in and cached imported content so race branches, feats, spells, and other choices
            appear consistently from the start.
          </p>
        </div>
      </section>
    );
  }

  return (
    <BuilderEditor
      backgrounds={catalogs.backgrounds}
      classes={catalogs.classes}
      feats={catalogs.feats}
      initialDraft={initialDraft}
      progressionElements={catalogs.progressionElements}
      races={catalogs.races}
      spells={catalogs.spells}
    />
  );
}
