"use client";

import { useCallback, useEffect, useState } from "react";

import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import type { BuiltInElement } from "@/lib/builtins/types";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import { BuilderEditor } from "@/components/builder-editor";
import { resolveBuilderCatalogs } from "@/lib/content-sources/catalog-resolver";
import { listCachedSourceSummaries } from "@/lib/content-sources/cache";
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

const STEP_CATALOG_KEYS = {
  race: ["races", "progressionElements"],
  subrace: ["races", "progressionElements"],
  class: ["classes", "progressionElements"],
  subclass: ["classes", "progressionElements"],
  background: ["backgrounds", "progressionElements"],
  feats: ["feats"],
  spellcasting: ["spells"],
} as const;

type BuilderCatalogs = {
  backgrounds: BuiltInBackgroundRecord[];
  classes: BuiltInClassRecord[];
  feats: BuiltInElement[];
  progressionElements: BuiltInElement[];
  races: BuiltInRaceRecord[];
  spells: BuiltInElement[];
};

function getSnapshotElements(draft: CharacterDraft | undefined): BuiltInElement[] {
  return (draft?.contentSnapshots ?? []).flatMap((snapshot) => {
    if (snapshot.ruleset !== draft?.ruleset) {
      return [];
    }
    return [{
      id: snapshot.id,
      type: snapshot.type as BuiltInElement["type"],
      name: snapshot.name,
      source: snapshot.source,
      source_url: snapshot.sourceUrl ?? "",
      catalogOrigin: "imported" as const,
      supports: snapshot.supports,
      description: snapshot.description,
      descriptionHtml: snapshot.descriptionHtml,
      prerequisite: snapshot.prerequisite,
      requirements: snapshot.requirements,
      rules: snapshot.rules as BuiltInElement["rules"],
      setters: snapshot.setters as BuiltInElement["setters"],
      sheet: snapshot.sheet as BuiltInElement["sheet"],
      multiclass: snapshot.multiclass as BuiltInElement["multiclass"],
      spellcasting: snapshot.spellcasting as BuiltInElement["spellcasting"],
    }];
  });
}

function mergeCatalogsForStep(
  current: BuilderCatalogs,
  resolved: BuilderCatalogs,
  step: string,
) {
  const keys = STEP_CATALOG_KEYS[step as keyof typeof STEP_CATALOG_KEYS] ?? [];
  if (!keys.length) {
    return current;
  }

  const next = { ...current };
  keys.forEach((key) => {
    (next[key] as BuilderCatalogs[typeof key]) = resolved[key];
  });
  return next;
}

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
  const [ruleset, setRuleset] = useState<CharacterDraft["ruleset"]>(
    initialDraft?.ruleset ?? "dnd5e-2014",
  );
  const [contentSourceIds, setContentSourceIds] = useState<string[]>(
    initialDraft?.contentSourceIds ?? [],
  );
  const [availableContentSources, setAvailableContentSources] = useState<Array<{
    id: string;
    name: string;
    kind: string;
    elementCount: number;
  }>>([]);
  const [catalogs, setCatalogs] = useState<BuilderCatalogs>({
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
          ? `/api/srd-catalogs?step=${encodeURIComponent(step)}&ruleset=${encodeURIComponent(ruleset)}`
          : `/api/srd-catalogs?ruleset=${encodeURIComponent(ruleset)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRD catalogs: ${response.status}`);
        }
        const [data, summaries] = await Promise.all([
          response.json(),
          listCachedSourceSummaries().catch(() => []),
        ]);
        setAvailableContentSources(summaries.map((summary) => ({
          id: summary.sourceId,
          name: summary.sourceName,
          kind: summary.sourceKind.startsWith("content-pack:") ? "Imported catalog" : "Aurora source",
          elementCount: summary.elementCount,
        })));
        const resolved = await resolveBuilderCatalogs({
          enabledSourceIds: contentSourceIds,
          baseElements: data.elements ?? [],
          initialSpellElements: data.spells ?? [],
          ruleset,
          snapshotElements: getSnapshotElements(initialDraft),
        });

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
    void hydrateCatalogs("foundation");

    return () => {
      cancelled = true;
    };
  }, [contentSourceIds, initialDraft, ruleset]);

  // Re-fetch when step changes (after initial hydration).
  // IMPORTANT: do NOT set isHydratingCatalogs(true) here — that would unmount
  // BuilderEditor and discard the user's in-progress form state on every step
  // change (perceived as a "page refresh"). The refetch updates catalogs
  // silently; the editor is the source of truth for the active step.
  useEffect(() => {
    let cancelled = false;

    async function refetchForStep(step: string) {
      if (!(step in STEP_CATALOG_KEYS)) {
        return;
      }

      try {
        const url = `/api/srd-catalogs?step=${encodeURIComponent(step)}&ruleset=${encodeURIComponent(ruleset)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch SRD catalogs for step ${step}: ${response.status}`);
        }
        const data = await response.json();
        const resolved = await resolveBuilderCatalogs({
          enabledSourceIds: contentSourceIds,
          baseElements: data.elements ?? [],
          initialSpellElements: data.spells ?? [],
          ruleset,
          snapshotElements: getSnapshotElements(initialDraft),
        });

        if (!cancelled) {
          setCatalogs((current) => mergeCatalogsForStep(current, resolved, step));
        }
      } catch {
        // Keep previous catalogs on transient failure.
      }
    }

    void refetchForStep(currentStep);

    return () => {
      cancelled = true;
    };
  }, [contentSourceIds, currentStep, initialDraft, ruleset]);

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
      availableContentSources={availableContentSources}
      backgrounds={catalogs.backgrounds}
      classes={catalogs.classes}
      feats={catalogs.feats}
      initialDraft={initialDraft}
      onRulesetChange={setRuleset}
      onContentSourcesChange={setContentSourceIds}
      onStepChange={handleStepChange}
      progressionElements={catalogs.progressionElements}
      races={catalogs.races}
      spells={catalogs.spells}
      mode={mode}
    />
  );
}
