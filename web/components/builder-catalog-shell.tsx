"use client";

import { useCallback, useEffect, useState } from "react";

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
  mode?: "builder" | "view";
};

export function BuilderCatalogShell({
  initialBackgrounds = [],
  initialClasses = [],
  initialDraft,
  initialFeats = [],
  initialProgressionElements = [],
  initialRaces = [],
  initialSpells = [],
  mode = "builder",
}: BuilderCatalogShellProps) {
  const [isHydratingCatalogs, setIsHydratingCatalogs] = useState(true);
  // Track current builder step so we can fetch only what each step needs
  const [currentStep, setCurrentStep] = useState<string>("foundation");
  const [catalogs, setCatalogs] = useState({
    backgrounds: initialBackgrounds,
    classes: initialClasses,
    feats: initialFeats,
    progressionElements: [...initialProgressionElements],
    races: initialRaces,
    spells: initialSpells,
  });

  // Callback for BuilderEditor to report step changes
  const handleStepChange = useCallback((step: string) => {
    setCurrentStep(step);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCatalogs(step: string) {
      try {
        // Append ?step= to fetch only the groups the current step needs
        const url = step && step !== "foundation"
          ? `/api/srd-catalogs?step=${encodeURIComponent(step)}`
          : "/api/srd-catalogs";
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRD catalogs: ${response.status}`);
        }
        const data = await response.json();
        const resolved = await resolveBuilderCatalogs(data.spells ?? []);

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

    // Initial fetch — foundation gets everything, others get targeted data
    void hydrateCatalogs(currentStep);

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when step changes (after initial hydration).
  // IMPORTANT: do NOT set isHydratingCatalogs(true) here — that would unmount
  // BuilderEditor and discard the user's in-progress form state on every step
  // change (perceived as a "page refresh"). The refetch updates catalogs
  // silently; the editor is the source of truth for the active step.
  useEffect(() => {
    let cancelled = false;

    async function refetchForStep(step: string) {
      // foundation/review steps don't need SRD data
      if (step === "foundation" || step === "review") return;

      try {
        const url = `/api/srd-catalogs?step=${encodeURIComponent(step)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRD catalogs for step ${step}: ${response.status}`);
        }
        const data = await response.json();
        const resolved = await resolveBuilderCatalogs(data.spells ?? []);

        if (!cancelled) {
          setCatalogs(resolved);
        }
      } catch {
        // Keep previous catalogs on transient failure.
      }
    }

    void refetchForStep(currentStep);

    return () => {
      cancelled = true;
    };
  }, [currentStep]);

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
      onStepChange={handleStepChange}
      progressionElements={catalogs.progressionElements}
      races={catalogs.races}
      spells={catalogs.spells}
      mode={mode}
    />
  );
}
