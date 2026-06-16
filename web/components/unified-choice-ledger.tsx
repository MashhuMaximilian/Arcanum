"use client";

import { useEffect, useMemo, useState } from "react";

import { BuilderContextTabs } from "@/components/builder-context-tabs";
import { getDetailMarkup } from "@/components/catalog-selector";
import {
  PreviewResizeControls,
  PreviewResizeHandle,
  useResizablePreview,
} from "@/components/resizable-preview";
import { useMobileDetailSheet } from "@/components/use-mobile-detail-sheet";
import type { BuiltInElement, BuiltInRule } from "@/lib/builtins/types";
import type { ProgressionChoiceGroup } from "@/lib/progression/choices";
import { cleanReadablePrerequisite } from "@/lib/progression/requirements";
import { getSelectionSemanticKey } from "@/lib/progression/selection-identity";

type UnifiedChoiceLedgerProps = {
  elements: BuiltInElement[];
  groups: ProgressionChoiceGroup[];
  lockedEntries?: LockedChoiceEntry[];
  selections: Record<string, string[]>;
  onSelectionChange: (groupId: string, optionIds: string[]) => void;
};

export type LockedChoiceEntry = {
  key: string;
  label: string;
  family: string;
  sources: string[];
};

export function classifyChoiceFamily(surface: string, fallback = "Other choices") {
  const normalized = surface.toLowerCase();
  if (normalized.includes("expertise")) return "Expertise";
  if (normalized.includes("language")) return "Languages";
  if (normalized.includes("musical") || normalized.includes("instrument")) return "Musical instruments";
  if (normalized.includes("skill")) return "Skills";
  if (normalized.includes("weapon")) return "Weapons";
  if (normalized.includes("armor") || normalized.includes("armour")) return "Armor";
  if (normalized.includes("tool")) return "Tools";
  if (normalized.includes("saving throw")) return "Saving throws";
  if (normalized.includes("favored enemy") || normalized.includes("favoured enemy")) return "Favored enemies";
  if (
    normalized.includes("favored terrain") ||
    normalized.includes("favoured terrain") ||
    normalized.includes("natural explorer")
  ) return "Favored terrains";
  if (normalized.includes("fighting style")) return "Fighting styles";
  if (normalized.includes("proficien")) return "Other proficiencies";
  return fallback || "Other choices";
}

function getOptionFamily(group: ProgressionChoiceGroup, element: BuiltInElement) {
  const groupSurface = [
    group.optionType,
    group.title,
    group.featureName,
    group.supportsKey ?? "",
  ].join(" ");
  const normalizedType = group.optionType.toLowerCase();
  const normalizedSupports = (group.supportsKey ?? "").toLowerCase();

  if (normalizedType === "companion") {
    if (normalizedSupports.includes("beast")) return "Beast";
    if (normalizedSupports.includes("familiar")) return "Familiars";
    return group.title || "Companions";
  }

  if (normalizedType === "language") {
    return "Languages";
  }

  const structuredFamily = classifyChoiceFamily(groupSurface, "");
  if (structuredFamily && structuredFamily !== "Other proficiencies") {
    return structuredFamily;
  }

  if (normalizedType === "proficiency" || structuredFamily === "Other proficiencies") {
    return classifyChoiceFamily(
      [element.type, element.name, element.id, ...element.supports].join(" "),
      "Other proficiencies",
    );
  }

  return group.title || group.familyLabel || group.optionType || "Other choices";
}

function getFamilyKind(family: string) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getProvenance(group: ProgressionChoiceGroup) {
  const level = group.unlockLevel > 0 ? ` · Lvl ${group.unlockLevel}` : "";
  return `${group.ownerLabel}${level}`;
}

function getCompanionSetter(element: BuiltInElement, name: string) {
  return element.setters.find((setter) => setter.name === name)?.value?.trim() ?? "";
}

function getCompanionRules(element: BuiltInElement, name: string) {
  return element.rules.filter(
    (rule): rule is Extract<BuiltInRule, { kind: "stat" }> =>
      rule.kind === "stat" && rule.name === name,
  );
}

function formatCompanionRuleToken(value: string) {
  const normalized = value.trim();
  if (/^-?\d+$/.test(normalized)) return normalized;
  if (/^companion:proficiency$/i.test(normalized) || /^proficiency$/i.test(normalized)) return "PB";

  const levelMatch = normalized.match(/^level:([a-z][a-z0-9_-]*)$/i);
  if (levelMatch) return `${levelMatch[1].replace(/[_-]+/g, " ")} level`;

  const modifierMatch = normalized.match(/^(?:companion:)?([a-z]+):modifier$/i);
  if (modifierMatch) return `${modifierMatch[1].slice(0, 3).toUpperCase()} mod`;

  return normalized.replace(/_/g, " ");
}

function formatCompanionFormula(rules: Extract<BuiltInRule, { kind: "stat" }>[]) {
  const numericTotal = rules.reduce(
    (sum, rule) => (/^-?\d+$/.test(rule.value) ? sum + Number(rule.value) : sum),
    0,
  );
  const tokens = rules
    .filter((rule) => !/^-?\d+$/.test(rule.value))
    .map((rule) => formatCompanionRuleToken(rule.value))
    .filter(Boolean);

  return [...(numericTotal ? [String(numericTotal)] : []), ...tokens].join(" + ");
}

function parseCompanionSummary(element: BuiltInElement) {
  const speed = [
    ["speed", ""],
    ["speed:fly", "fly"],
    ["speed:swim", "swim"],
    ["speed:climb", "climb"],
    ["speed:burrow", "burrow"],
  ]
    .map(([key, label]) => {
      const value = formatCompanionFormula(getCompanionRules(element, `companion:${key}`));
      return value ? `${label ? `${label} ` : ""}${value} ft.` : "";
    })
    .filter(Boolean)
    .join(" • ");

  return {
    type: getCompanionSetter(element, "type"),
    size: getCompanionSetter(element, "size"),
    challenge: getCompanionSetter(element, "challenge"),
    alignment: getCompanionSetter(element, "alignment"),
    ac: formatCompanionFormula(getCompanionRules(element, "companion:ac")),
    hp: formatCompanionFormula(getCompanionRules(element, "companion:hp:max")),
    speed,
    senses: getCompanionSetter(element, "senses"),
    languages: getCompanionSetter(element, "languages"),
    abilities: [
      ["STR", getCompanionSetter(element, "strength")],
      ["DEX", getCompanionSetter(element, "dexterity")],
      ["CON", getCompanionSetter(element, "constitution")],
      ["INT", getCompanionSetter(element, "intelligence")],
      ["WIS", getCompanionSetter(element, "wisdom")],
      ["CHA", getCompanionSetter(element, "charisma")],
    ].filter((entry) => entry[1]),
  };
}

function getLinkedCompanionElements(
  element: BuiltInElement,
  name: "traits" | "actions" | "reactions",
  elementsById: Map<string, BuiltInElement>,
) {
  return getCompanionSetter(element, name)
    .split(",")
    .map((id) => elementsById.get(id.trim()))
    .filter((entry): entry is BuiltInElement => Boolean(entry));
}

export function UnifiedChoiceLedger({
  elements,
  groups,
  lockedEntries = [],
  selections,
  onSelectionChange,
}: UnifiedChoiceLedgerProps) {
  const previewResize = useResizablePreview();
  const [previewKey, setPreviewKey] = useState("");
  const [activePane, setActivePane] = useState<"list" | "detail">("list");
  const isMobile = useMobileDetailSheet(
    activePane === "detail",
    () => setActivePane("list"),
  );
  const elementsById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const optionFamilies = useMemo(
    () =>
      groups.flatMap((group) =>
        group.options.map((option) => getOptionFamily(group, option.element)),
      ),
    [groups],
  );
  const familyLabels = useMemo(
    () => [...new Set([...optionFamilies, ...lockedEntries.map((entry) => entry.family)])],
    [lockedEntries, optionFamilies],
  );
  const [activeFamily, setActiveFamily] = useState(familyLabels[0] ?? "");
  const resolvedFamily = familyLabels.includes(activeFamily) ? activeFamily : familyLabels[0] ?? "";

  const selectedSemanticOwners = useMemo(() => {
    const owners = new Map<string, ProgressionChoiceGroup>();
    groups.forEach((group) => {
      (selections[group.id] ?? []).forEach((id) => {
        const element = group.options.find((option) => option.element.id === id)?.element;
        if (element) {
          owners.set(getSelectionSemanticKey(element), group);
        }
      });
    });
    return owners;
  }, [groups, selections]);

  const familyGroups = useMemo(
    () =>
      groups.filter((group) =>
        group.options.some((option) => getOptionFamily(group, option.element) === resolvedFamily),
      ),
    [groups, resolvedFamily],
  );
  const validSelectedIds = useMemo(
    () =>
      new Map(
        groups.map((group) => {
          const optionIds = new Set(group.options.map((option) => option.element.id));
          return [
            group.id,
            (selections[group.id] ?? []).filter((id) => optionIds.has(id)),
          ];
        }),
      ),
    [groups, selections],
  );

  const entries = useMemo(() => {
    const byKey = new Map<string, {
      key: string;
      label: string;
      source: string;
      element: BuiltInElement | null;
      opportunities: Array<{
        group: ProgressionChoiceGroup;
        optionId: string;
        blocked: boolean;
        failure: string;
      }>;
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
          element: null,
          opportunities: [],
          selectedBy: [],
          lockedSources: entry.sources,
        });
      });

    familyGroups.forEach((group) => {
      group.options
        .filter((option) => getOptionFamily(group, option.element) === resolvedFamily)
        .forEach((option) => {
          const key = getSelectionSemanticKey(option.element);
          const current = byKey.get(key) ?? {
            key,
            label: option.element.name,
            source: option.element.source,
            element: option.element,
            opportunities: [],
            selectedBy: [],
            lockedSources: [],
          };
          current.opportunities.push({
            group,
            optionId: option.element.id,
            blocked: option.requirementFailures.length > 0,
            failure: option.requirementFailures[0] ?? "",
          });
          if ((validSelectedIds.get(group.id) ?? []).includes(option.element.id)) {
            current.selectedBy.push(group);
          }
          byKey.set(key, current);
        });
    });

    return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [familyGroups, lockedEntries, resolvedFamily, validSelectedIds]);

  const selectedCount = entries.filter((entry) => entry.selectedBy.length).length;
  const lockedCount = entries.filter((entry) => entry.lockedSources.length).length;
  const requiredGroups = familyGroups.filter((group) => !group.optional);
  const requiredCount = requiredGroups.reduce(
    (sum, group) => sum + group.exactSelections,
    0,
  );
  const fulfilledRequiredCount = requiredGroups.reduce(
    (sum, group) =>
      sum + Math.min(group.exactSelections, (validSelectedIds.get(group.id) ?? []).length),
    0,
  );
  const remainingSlots = familyGroups.reduce(
    (sum, group) =>
      sum + Math.max(0, group.exactSelections - (validSelectedIds.get(group.id) ?? []).length),
    0,
  );
  const previewEntry =
    entries.find((entry) => entry.key === previewKey) ??
    entries.find((entry) => entry.selectedBy.length > 0) ??
    entries.find((entry) => entry.element) ??
    null;
  const previewOpportunity =
    previewEntry?.selectedBy.length
      ? previewEntry.opportunities.find((item) => item.group.id === previewEntry.selectedBy[0].id)
      : previewEntry?.opportunities[0];
  const previewElement = previewEntry?.element ?? null;
  const previewGroup = previewOpportunity?.group ?? null;
  const previewCompanion =
    previewElement?.type === "Companion" ? parseCompanionSummary(previewElement) : null;
  const previewCompanionSections = previewElement
    ? {
        traits: getLinkedCompanionElements(previewElement, "traits", elementsById),
        actions: getLinkedCompanionElements(previewElement, "actions", elementsById),
        reactions: getLinkedCompanionElements(previewElement, "reactions", elementsById),
      }
    : { traits: [], actions: [], reactions: [] };

  useEffect(() => {
    setPreviewKey("");
    setActivePane("list");
  }, [resolvedFamily]);

  function toggleEntry(entry: (typeof entries)[number]) {
    const selectedOwner = entry.selectedBy[0];
    if (selectedOwner) {
      const optionIds = validSelectedIds.get(selectedOwner.id) ?? [];
      const selectedOpportunity = entry.opportunities.find(
        (opportunity) =>
          opportunity.group.id === selectedOwner.id &&
          optionIds.includes(opportunity.optionId),
      );
      if (selectedOpportunity) {
        onSelectionChange(
          selectedOwner.id,
          optionIds.filter((id) => id !== selectedOpportunity.optionId),
        );
      }
      return;
    }

    if (selectedSemanticOwners.has(entry.key)) {
      return;
    }

    const target = entry.opportunities.find(
      ({ group, blocked }) =>
        !blocked &&
        (group.exactSelections === 1 ||
          (validSelectedIds.get(group.id) ?? []).length < group.exactSelections),
    );
    if (target) {
      const current = validSelectedIds.get(target.group.id) ?? [];
      onSelectionChange(
        target.group.id,
        target.group.exactSelections === 1
          ? [target.optionId]
          : [...current, target.optionId],
      );
    }
  }

  return (
    <section className="unified-ledger" aria-label="Unified choice ledger">
      <header className="unified-ledger__header">
        <div>
          <span className="builder-panel__label">Unified choice ledger</span>
          <strong>{resolvedFamily}</strong>
        </div>
        <span className="review-sheet__statusPill">
          {lockedCount ? `${lockedCount} fixed · ` : ""}
          {requiredCount
            ? `${fulfilledRequiredCount}/${requiredCount} selected`
            : `${selectedCount} selected`}
          {!requiredCount && remainingSlots ? ` · ${remainingSlots} slots left` : ""}
        </span>
      </header>

      <BuilderContextTabs>
        <div className="unified-ledger__families" role="tablist" aria-label="Choice families">
          {familyLabels.map((family) => (
            <button
              className={`unified-ledger__family${family === resolvedFamily ? " is-active" : ""}`}
              data-family={getFamilyKind(family)}
              key={family}
              type="button"
              role="tab"
              aria-selected={family === resolvedFamily}
              onClick={() => setActiveFamily(family)}
            >
              {family}
            </button>
          ))}
        </div>
      </BuilderContextTabs>

      <div
        className="catalog-selector__workbench catalog-selector__workbench--table unified-ledger__workbench"
        style={previewResize.style}
      >
        <div className="catalog-selector__optionsPanel catalog-selector__optionsPanel--table">
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
              const duplicateOwner = selectedSemanticOwners.get(entry.key);
              const available = entry.opportunities.some(
                ({ group, blocked }) =>
                  !blocked &&
                  (group.exactSelections === 1 ||
                    (validSelectedIds.get(group.id) ?? []).length < group.exactSelections),
              );
              const failure = entry.opportunities.find((item) => item.failure)?.failure ?? "";
              const canToggle = !locked && !duplicateOwner && available;

              return (
                <button
                  className={`unified-ledger__row${selected ? " is-selected" : ""}${
                    previewEntry?.key === entry.key ? " is-preview"
                    : ""
                  }`}
                  key={entry.key}
                  type="button"
                  onClick={() => {
                    setPreviewKey(entry.key);
                    if (isMobile) {
                      setActivePane("detail");
                    } else if (selected || canToggle) {
                      toggleEntry(entry);
                    }
                  }}
                >
                  <strong>
                    {entry.label}
                    {selected ? <small className="unified-ledger__selectedBadge">Selected</small> : null}
                  </strong>
                  <span>{entry.source}</span>
                  <span className="unified-ledger__tags">
                    {locked
                      ? entry.lockedSources.map((source) => <em key={source}>{source}</em>)
                      : (selected ? entry.selectedBy : entry.opportunities.map((item) => item.group))
                          .filter(
                            (group, index, values) =>
                              values.findIndex((candidate) => candidate.id === group.id) === index,
                          )
                          .map((group) => <em key={group.id}>{getProvenance(group)}</em>)}
                  </span>
                  <span>
                    {locked
                      ? "Fixed"
                      : selected
                        ? "Selected"
                        : duplicateOwner
                          ? `Already selected by ${duplicateOwner.title}`
                          : failure
                            ? failure
                            : available
                              ? entry.opportunities.some(
                                  ({ group }) =>
                                    group.exactSelections === 1 &&
                                    (validSelectedIds.get(group.id) ?? []).length > 0,
                                )
                                ? "Replace selection"
                                : "Available"
                              : "Budget filled"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <PreviewResizeHandle
          previewWidth={previewResize.previewWidth}
          onChange={previewResize.setPreviewWidth}
          onPointerDown={previewResize.resizeFromPointer}
        />

        <aside className={`catalog-selector__detailPanel${activePane === "detail" ? " is-mobileActive" : ""}`}>
          <PreviewResizeControls
            previewWidth={previewResize.previewWidth}
            onChange={previewResize.setPreviewWidth}
          />
          {previewEntry && previewElement ? (
            <>
              <button
                className="catalog-selector__mobileClose"
                type="button"
                aria-label="Back to choices"
                onClick={() => setActivePane("list")}
              >
                <span aria-hidden="true">←</span>
                <span>
                  <small>{resolvedFamily}</small>
                  Back to choices
                </span>
              </button>

              <div className="catalog-selector__detailHeader">
                <span className="catalog-selector__detailLabel">
                  {previewEntry.selectedBy.length ? "Selected" : "Preview"}
                </span>
                <h3 className="catalog-selector__detailTitle">{previewElement.name}</h3>
                <p className="catalog-selector__detailMeta">
                  Source: {previewElement.source}
                  {previewElement.prerequisite
                    ? ` · ${cleanReadablePrerequisite(previewElement.prerequisite)}`
                    : ""}
                </p>
                <div className="catalog-selector__detailActions">
                  <button
                    className="button button--primary button--compact"
                    type="button"
                    disabled={
                      previewEntry.lockedSources.length > 0 ||
                      (!previewEntry.selectedBy.length &&
                        (Boolean(selectedSemanticOwners.get(previewEntry.key)) ||
                          !previewEntry.opportunities.some(
                            ({ group, blocked }) =>
                              !blocked &&
                              (group.exactSelections === 1 ||
                                (validSelectedIds.get(group.id) ?? []).length < group.exactSelections),
                          )))
                    }
                    onClick={() => {
                      toggleEntry(previewEntry);
                      setActivePane("list");
                    }}
                  >
                    {previewEntry.lockedSources.length
                      ? "Granted"
                      : previewEntry.selectedBy.length
                        ? "Remove selection"
                        : previewOpportunity?.group.exactSelections === 1 &&
                            (validSelectedIds.get(previewOpportunity.group.id) ?? []).length > 0
                          ? "Replace selection"
                          : "Choose option"}
                  </button>
                </div>
              </div>

              {previewGroup ? (
                <section className="catalog-selector__detailSection">
                  <span className="catalog-selector__detailLabel">Selection summary</span>
                  <ul className="catalog-selector__impactList">
                    <li>{getProvenance(previewGroup)}</li>
                    <li>
                      Choose {previewGroup.optional ? "up to" : "exactly"} {previewGroup.exactSelections}
                    </li>
                  </ul>
                </section>
              ) : null}

              {previewCompanion ? (
                <section className="catalog-selector__detailSection">
                  <span className="catalog-selector__detailLabel">Stat block</span>
                  <div className="progression-step__companionCard">
                    <div className="catalog-selector__tagList">
                      {previewCompanion.size ? <span className="catalog-selector__tag">{previewCompanion.size}</span> : null}
                      {previewCompanion.type ? <span className="catalog-selector__tag">{previewCompanion.type}</span> : null}
                      {previewCompanion.challenge ? <span className="catalog-selector__tag">CR {previewCompanion.challenge}</span> : null}
                      {previewCompanion.alignment ? <span className="catalog-selector__tag">{previewCompanion.alignment}</span> : null}
                    </div>
                    <div className="progression-step__companionVitals">
                      {previewCompanion.ac ? <div className="progression-step__companionVital"><span>Armor Class</span><strong>{previewCompanion.ac}</strong></div> : null}
                      {previewCompanion.hp ? <div className="progression-step__companionVital"><span>Hit Points</span><strong>{previewCompanion.hp}</strong></div> : null}
                      {previewCompanion.speed ? <div className="progression-step__companionVital"><span>Speed</span><strong>{previewCompanion.speed}</strong></div> : null}
                    </div>
                    <div className="progression-step__companionAbilities">
                      {previewCompanion.abilities.map(([ability, value]) => (
                        <div className="progression-step__companionAbility" key={ability}>
                          <span>{ability}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    {previewCompanion.senses || previewCompanion.languages ? (
                      <div className="progression-step__companionNotes">
                        {previewCompanion.senses ? <p><strong>Senses.</strong> {previewCompanion.senses}</p> : null}
                        {previewCompanion.languages ? <p><strong>Languages.</strong> {previewCompanion.languages}</p> : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {(
                [
                  ["Traits", previewCompanionSections.traits],
                  ["Actions", previewCompanionSections.actions],
                  ["Reactions", previewCompanionSections.reactions],
                ] as const
              ).map(([label, linkedElements]) =>
                linkedElements.length ? (
                  <section className="catalog-selector__detailSection" key={label}>
                    <span className="catalog-selector__detailLabel">{label}</span>
                    {linkedElements.map((element) => (
                      <div className="catalog-selector__detailSubsection" key={element.id}>
                        <strong>{element.name}</strong>
                        <div
                          className="catalog-selector__detailRichText"
                          dangerouslySetInnerHTML={{ __html: getDetailMarkup(element) }}
                        />
                      </div>
                    ))}
                  </section>
                ) : null,
              )}

              <section className="catalog-selector__detailSection">
                <span className="catalog-selector__detailLabel">Reference</span>
                <div
                  className="catalog-selector__detailRichText"
                  dangerouslySetInnerHTML={{ __html: getDetailMarkup(previewElement) }}
                />
              </section>
            </>
          ) : (
            <p className="builder-summary__meta">Choose an entry to inspect its details.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
