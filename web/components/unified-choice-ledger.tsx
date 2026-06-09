"use client";

import { useMemo, useState } from "react";

import type { ProgressionChoiceGroup } from "@/lib/progression/choices";
import { getSelectionSemanticKey } from "@/lib/progression/selection-identity";

type UnifiedChoiceLedgerProps = {
  groups: ProgressionChoiceGroup[];
  lockedEntries?: LockedChoiceEntry[];
  selections: Record<string, string[]>;
  onSelectionChange: (groupId: string, optionIds: string[]) => void;
};

export type LockedChoiceEntry = {
  key: string;
  label: string;
  family: "Languages" | "Proficiencies";
  sources: string[];
};

function getFamilyLabel(group: ProgressionChoiceGroup) {
  const surface = `${group.optionType} ${group.familyLabel} ${group.title}`.toLowerCase();
  if (surface.includes("expertise")) return "Expertise";
  if (surface.includes("language")) return "Languages";
  if (surface.includes("proficien")) return "Proficiencies";
  if (surface.includes("favored enemy")) return "Favored Enemies";
  if (surface.includes("favored terrain") || surface.includes("natural explorer")) return "Favored Terrains";
  if (surface.includes("fighting style")) return "Fighting Styles";
  return group.familyLabel || group.optionType || "Choices";
}

function getProvenance(group: ProgressionChoiceGroup) {
  const level = group.unlockLevel > 0 ? ` · Lvl ${group.unlockLevel}` : "";
  return `${group.ownerLabel}${level}`;
}

export function isUnifiedLedgerGroup(group: ProgressionChoiceGroup) {
  return /(proficien|expertise|language|favou?red enemy|favou?red terrain|natural explorer|fighting style)/i.test(
    `${group.optionType} ${group.familyLabel} ${group.title}`,
  );
}

export function UnifiedChoiceLedger({
  groups,
  lockedEntries = [],
  selections,
  onSelectionChange,
}: UnifiedChoiceLedgerProps) {
  const familyLabels = useMemo(
    () => [...new Set([...groups.map(getFamilyLabel), ...lockedEntries.map((entry) => entry.family)])],
    [groups, lockedEntries],
  );
  const [activeFamily, setActiveFamily] = useState(familyLabels[0] ?? "");
  const resolvedFamily = familyLabels.includes(activeFamily) ? activeFamily : familyLabels[0] ?? "";
  const familyGroups = groups.filter((group) => getFamilyLabel(group) === resolvedFamily);

  const entries = useMemo(() => {
    const byKey = new Map<string, {
      key: string;
      label: string;
      source: string;
      opportunities: Array<{ group: ProgressionChoiceGroup; optionId: string; blocked: boolean }>;
      selectedBy: ProgressionChoiceGroup[];
      lockedSources: string[];
    }>();

    lockedEntries
      .filter((entry) => entry.family === resolvedFamily)
      .forEach((entry) => {
        byKey.set(entry.key, {
          key: entry.key,
          label: entry.label,
          source: "Granted",
          opportunities: [],
          selectedBy: [],
          lockedSources: entry.sources,
        });
      });

    familyGroups.forEach((group) => {
      group.options.forEach((option) => {
        const key = getSelectionSemanticKey(option.element);
        const current = byKey.get(key) ?? {
          key,
          label: option.element.name,
          source: option.element.source,
          opportunities: [],
          selectedBy: [],
          lockedSources: [],
        };
        current.opportunities.push({
          group,
          optionId: option.element.id,
          blocked: option.requirementFailures.length > 0,
        });
        if ((selections[group.id] ?? []).includes(option.element.id)) {
          current.selectedBy.push(group);
        }
        byKey.set(key, current);
      });
    });

    return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [familyGroups, lockedEntries, resolvedFamily, selections]);

  const selectedCount = entries.filter((entry) => entry.selectedBy.length).length;
  const lockedCount = entries.filter((entry) => entry.lockedSources.length).length;
  const totalBudget = familyGroups.reduce((sum, group) => sum + group.exactSelections, 0);

  function toggleEntry(entry: (typeof entries)[number]) {
    const selectedOwner = entry.selectedBy[0];
    if (selectedOwner) {
      const optionIds = selections[selectedOwner.id] ?? [];
      const selectedOpportunity = entry.opportunities.find(
        (opportunity) => opportunity.group.id === selectedOwner.id && optionIds.includes(opportunity.optionId),
      );
      if (selectedOpportunity) {
        onSelectionChange(
          selectedOwner.id,
          optionIds.filter((id) => id !== selectedOpportunity.optionId),
        );
      }
      return;
    }

    const target = entry.opportunities.find(({ group, blocked }) =>
      !blocked && (selections[group.id] ?? []).length < group.exactSelections,
    );
    if (target) {
      onSelectionChange(target.group.id, [...(selections[target.group.id] ?? []), target.optionId]);
    }
  }

  return (
    <section className="unified-ledger" aria-label="Unified choice ledger">
      <header className="unified-ledger__header">
        <div>
          <span className="builder-panel__label">Unified Choice Ledger</span>
          <strong>{resolvedFamily}</strong>
        </div>
        <span className="review-sheet__statusPill">
          {lockedCount ? `${lockedCount} fixed · ` : ""}{selectedCount}/{totalBudget} chosen
        </span>
      </header>

      <div className="unified-ledger__families" role="tablist" aria-label="Choice families">
        {familyLabels.map((family) => (
          <button
            className={`unified-ledger__family${family === resolvedFamily ? " is-active" : ""}`}
            key={family}
            type="button"
            onClick={() => setActiveFamily(family)}
          >
            {family}
          </button>
        ))}
      </div>

      <div className="unified-ledger__table">
        <div className="unified-ledger__row unified-ledger__row--head" aria-hidden="true">
          <span>Choice</span>
          <span>Source</span>
          <span>Granted by</span>
          <span>Status</span>
        </div>
        {entries.map((entry) => {
          const locked = entry.lockedSources.length > 0;
          const selected = locked || entry.selectedBy.length > 0;
          const available = entry.opportunities.some(({ group, blocked }) =>
            !blocked && (selections[group.id] ?? []).length < group.exactSelections,
          );
          return (
            <button
              className={`unified-ledger__row${selected ? " is-selected" : ""}`}
              disabled={locked || (!selected && !available)}
              key={entry.key}
              type="button"
              onClick={() => toggleEntry(entry)}
            >
              <strong>{entry.label}</strong>
              <span>{entry.source}</span>
              <span className="unified-ledger__tags">
                {locked
                  ? entry.lockedSources.map((source) => <em key={source}>{source}</em>)
                  : (selected ? entry.selectedBy : entry.opportunities.map((item) => item.group))
                      .filter((group, index, values) => values.findIndex((candidate) => candidate.id === group.id) === index)
                      .map((group) => (
                        <em key={group.id}>{getProvenance(group)}</em>
                      ))}
              </span>
              <span>{locked ? "Locked" : selected ? "Selected" : available ? "Available" : "Budget filled"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
