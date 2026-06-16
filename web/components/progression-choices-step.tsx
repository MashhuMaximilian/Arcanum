"use client";

import { useMemo } from "react";

import {
  type LockedChoiceEntry,
  UnifiedChoiceLedger,
} from "@/components/unified-choice-ledger";
import type { BuiltInElement } from "@/lib/builtins/types";
import type { ProgressionChoiceGroup } from "@/lib/progression/choices";

type ProgressionChoicesStepProps = {
  elements: BuiltInElement[];
  groups: ProgressionChoiceGroup[];
  selections: Record<string, string[]>;
  onSelectionChange: (groupId: string, optionIds: string[]) => void;
  lockedEntries?: LockedChoiceEntry[];
};

export function ProgressionChoicesStep({
  elements,
  groups,
  selections,
  onSelectionChange,
  lockedEntries = [],
}: ProgressionChoicesStepProps) {
  const orderedGroups = useMemo(() => {
    const getPriority = (group: ProgressionChoiceGroup) => {
      const title = group.title.toLowerCase();
      if (title.includes("pact boon")) return -200;
      if (title.includes("familiar")) return -100;
      return 0;
    };

    return [...groups].sort(
      (left, right) =>
        getPriority(left) - getPriority(right) ||
        left.classEntryIndex - right.classEntryIndex ||
        left.unlockLevel - right.unlockLevel ||
        left.ownerLabel.localeCompare(right.ownerLabel) ||
        left.title.localeCompare(right.title),
    );
  }, [groups]);

  return (
    <section className="builder-panel progression-step">
      <div className="builder-stepPanel__intro">
        <span className="route-shell__tag">Choices</span>
        <h2 className="route-shell__title">Resolve every unlocked choice in one ledger</h2>
        <p className="route-shell__copy">
          Switch families with the filters below. The table keeps shared budgets, fixed grants, and duplicate prevention in one place.
        </p>
      </div>

      {orderedGroups.length || lockedEntries.length ? (
        <UnifiedChoiceLedger
          elements={elements}
          groups={orderedGroups}
          lockedEntries={lockedEntries}
          selections={selections}
          onSelectionChange={onSelectionChange}
        />
      ) : (
        <p className="route-shell__copy">
          No unresolved progression, proficiency, or nested choices are unlocked for the current build yet.
        </p>
      )}
    </section>
  );
}
