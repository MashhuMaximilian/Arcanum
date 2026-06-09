"use client";

import { useEffect, useMemo, useState } from "react";

import { getDetailMarkup } from "@/components/catalog-selector";
import { sortTableRows, toggleTableSort, type TableSortState } from "@/components/table-sort";
import { useMobileDetailSheet } from "@/components/use-mobile-detail-sheet";
import {
  isUnifiedLedgerGroup,
  type LockedChoiceEntry,
  UnifiedChoiceLedger,
} from "@/components/unified-choice-ledger";
import type { BuiltInElement, BuiltInRule } from "@/lib/builtins/types";
import { formatSupportLabel, type ProgressionChoiceGroup } from "@/lib/progression/choices";
import { cleanReadablePrerequisite } from "@/lib/progression/requirements";
import { getSelectionSemanticKey } from "@/lib/progression/selection-identity";

type ProgressionChoicesStepProps = {
  elements: BuiltInElement[];
  groups: ProgressionChoiceGroup[];
  selections: Record<string, string[]>;
  onSelectionChange: (groupId: string, optionIds: string[]) => void;
  lockedEntries?: LockedChoiceEntry[];
};

function getCompanionSetter(element: BuiltInElement, name: string) {
  return element.setters.find((setter) => setter.name === name)?.value?.trim() ?? "";
}

function getCompanionRules(element: BuiltInElement, name: string) {
  return element.rules.filter((rule): rule is Extract<BuiltInRule, { kind: "stat" }> => rule.kind === "stat" && rule.name === name);
}

function formatCompanionRuleToken(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (/^-?\d+$/.test(normalized)) {
    return normalized;
  }

  if (/^level:([a-z][a-z0-9_-]*)$/i.test(normalized)) {
    const match = normalized.match(/^level:([a-z][a-z0-9_-]*)$/i);
    return `${match?.[1]?.replace(/[_-]+/g, " ") ?? "class"} level`;
  }

  if (/^([a-z]+):modifier$/i.test(normalized)) {
    const match = normalized.match(/^([a-z]+):modifier$/i);
    return `${match?.[1]?.slice(0, 3).toUpperCase() ?? ""} mod`;
  }

  if (/^companion:([a-z]+):modifier$/i.test(normalized)) {
    const match = normalized.match(/^companion:([a-z]+):modifier$/i);
    return `${match?.[1]?.slice(0, 3).toUpperCase() ?? ""} mod`;
  }

  if (/^companion:proficiency$/i.test(normalized) || /^proficiency$/i.test(normalized)) {
    return "PB";
  }

  return normalized.replace(/_/g, " ");
}

function formatCompanionFormula(rules: Extract<BuiltInRule, { kind: "stat" }>[]) {
  if (!rules.length) {
    return "";
  }

  const numericTotal = rules.reduce((sum, rule) => (/^-?\d+$/.test(rule.value) ? sum + Number(rule.value) : sum), 0);
  const tokenCounts = new Map<string, number>();

  rules
    .filter((rule) => !/^-?\d+$/.test(rule.value))
    .map((rule) => formatCompanionRuleToken(rule.value))
    .filter(Boolean)
    .forEach((token) => {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    });

  const parts: string[] = [];
  if (numericTotal) {
    parts.push(String(numericTotal));
  }

  [...tokenCounts.entries()].forEach(([token, count]) => {
    parts.push(count > 1 ? `${count} × ${token}` : token);
  });

  return parts.join(" + ");
}

function parseCompanionLinkedIds(element: BuiltInElement, name: "traits" | "actions" | "reactions") {
  return getCompanionSetter(element, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCompanionSummary(element: BuiltInElement) {
  const type = getCompanionSetter(element, "type");
  const size = getCompanionSetter(element, "size");
  const challenge = getCompanionSetter(element, "challenge");
  const alignment = getCompanionSetter(element, "alignment");

  const movementParts = [
    ["speed", ""],
    ["speed:fly", "fly"],
    ["speed:swim", "swim"],
    ["speed:climb", "climb"],
    ["speed:burrow", "burrow"],
  ]
    .map(([key, label]) => {
      const formula = formatCompanionFormula(getCompanionRules(element, `companion:${key}`));
      if (!formula) {
        return "";
      }
      return label ? `${label} ${formula} ft.` : `${formula} ft.`;
    })
    .filter(Boolean);

  return {
    type,
    size,
    challenge,
    alignment,
    ac: formatCompanionFormula(getCompanionRules(element, "companion:ac")),
    hp: formatCompanionFormula(getCompanionRules(element, "companion:hp:max")),
    speed: movementParts.join(" • "),
    senses: getCompanionSetter(element, "senses"),
    languages: getCompanionSetter(element, "languages"),
    strength: getCompanionSetter(element, "strength"),
    dexterity: getCompanionSetter(element, "dexterity"),
    constitution: getCompanionSetter(element, "constitution"),
    intelligence: getCompanionSetter(element, "intelligence"),
    wisdom: getCompanionSetter(element, "wisdom"),
    charisma: getCompanionSetter(element, "charisma"),
  };
}

function getOptionSummary(group: ProgressionChoiceGroup, description: string, prerequisite?: string) {
  const readablePrerequisite = cleanReadablePrerequisite(prerequisite);
  if (readablePrerequisite) {
    return readablePrerequisite;
  }

  const firstSentence = description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)[0];

  return firstSentence || `${group.optionType} option`;
}

function getOptionalSpellcastingAbilityHint(group: ProgressionChoiceGroup | null) {
  if (!group) {
    return "";
  }

  const combined = `${group.title} ${group.familyLabel} ${group.featureName} ${group.description}`.toLowerCase();
  if (!/alternate spellcasting ability/.test(combined)) {
    return "";
  }

  const explicitDefault = group.options
    .map((option) => option.element.description)
    .join(" ")
    .match(/rather than\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)/i)?.[1];

  return explicitDefault
    ? `Optional. Leave this unselected to keep ${explicitDefault[0].toUpperCase()}${explicitDefault.slice(1).toLowerCase()} as the default spellcasting ability.`
    : "Optional. Leave this unselected to keep the default spellcasting ability.";
}

export function ProgressionChoicesStep({
  elements,
  groups,
  selections,
  onSelectionChange,
  lockedEntries = [],
}: ProgressionChoicesStepProps) {
  const isOptionalSpellcastingAbilityGroup = (group: ProgressionChoiceGroup | null) =>
    Boolean(getOptionalSpellcastingAbilityHint(group));
  const allOrderedGroups = useMemo(() => {
    const getPriority = (group: ProgressionChoiceGroup) => {
      const title = group.title.toLowerCase();
      if (title.includes("pact boon")) {
        return -200;
      }
      if (title.includes("familiar")) {
        return -100;
      }
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
  const ledgerGroups = useMemo(
    () => allOrderedGroups.filter(isUnifiedLedgerGroup),
    [allOrderedGroups],
  );
  const orderedGroups = useMemo(
    () => allOrderedGroups.filter((group) => !isUnifiedLedgerGroup(group)),
    [allOrderedGroups],
  );
  const [activeGroupId, setActiveGroupId] = useState(orderedGroups[0]?.id ?? "");
  const [previewIds, setPreviewIds] = useState<Record<string, string>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [activePane, setActivePane] = useState<"filters" | "list" | "detail">("list");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [showEligibleOnly, setShowEligibleOnly] = useState(true);
  const [interactionWarning, setInteractionWarning] = useState("");
  const [tableSort, setTableSort] = useState<TableSortState<"name" | "source" | "summary" | "impact">>({
    key: "name",
    direction: "asc",
  });
  const isMobile = useMobileDetailSheet(
    activePane === "detail",
    () => setActivePane("list"),
  );
  const elementsById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const selectedSemanticOwners = useMemo(() => {
    const owners = new Map<string, string>();
    orderedGroups.forEach((group) => {
      (selections[group.id] ?? []).forEach((id) => {
        const element = group.options.find((option) => option.element.id === id)?.element;
        if (element) {
          owners.set(getSelectionSemanticKey(element), group.title);
        }
      });
    });
    return owners;
  }, [orderedGroups, selections]);

  useEffect(() => {
    if (!orderedGroups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(orderedGroups[0]?.id ?? "");
    }
  }, [activeGroupId, orderedGroups]);

  useEffect(() => {
    setInteractionWarning("");
  }, [activeGroupId]);

  const activeGroup = orderedGroups.find((group) => group.id === activeGroupId) ?? null;
  const query = activeGroup ? queries[activeGroup.id]?.trim().toLowerCase() ?? "" : "";
  const filteredOptions = useMemo(
    () =>
      activeGroup
        ? activeGroup.options.filter((option) =>
            (!showEligibleOnly || !option.requirementFailures.length) &&
            (!query
                ? true
                : `${option.element.name} ${option.element.source} ${option.element.description} ${
                    option.element.prerequisite ?? ""
                  }`
                    .toLowerCase()
                    .includes(query)),
          )
        : [],
    [activeGroup, query, showEligibleOnly],
  );
  const sortedOptions = useMemo(
    () =>
      sortTableRows(filteredOptions, tableSort, (option, key) => {
        switch (key) {
          case "source":
            return option.element.source ?? "";
          case "summary":
            return getOptionSummary(activeGroup as ProgressionChoiceGroup, option.element.description, option.element.prerequisite);
          case "impact":
            return option.requirementFailures[0] || `Adds ${(activeGroup as ProgressionChoiceGroup).optionType.toLowerCase()} option`;
          case "name":
          default:
            return option.element.name;
        }
      }),
    [activeGroup, filteredOptions, tableSort],
  );
  const selectedIds = activeGroup ? selections[activeGroup.id] ?? [] : [];
  const previewId = activeGroup
    ? previewIds[activeGroup.id] ?? selectedIds[0] ?? sortedOptions[0]?.element.id ?? ""
    : "";
  const previewOption =
    sortedOptions.find((option) => option.element.id === previewId) ??
    activeGroup?.options.find((option) => option.element.id === previewId) ??
    null;
  const previewCompanionSummary =
    previewOption?.element.type === "Companion" ? parseCompanionSummary(previewOption.element) : null;
  const previewCompanionTraits =
    previewOption?.element.type === "Companion"
      ? parseCompanionLinkedIds(previewOption.element, "traits")
          .map((id) => elementsById.get(id))
          .filter((element): element is BuiltInElement => Boolean(element))
      : [];
  const previewCompanionActions =
    previewOption?.element.type === "Companion"
      ? parseCompanionLinkedIds(previewOption.element, "actions")
          .map((id) => elementsById.get(id))
          .filter((element): element is BuiltInElement => Boolean(element))
      : [];
  const previewCompanionReactions =
    previewOption?.element.type === "Companion"
      ? parseCompanionLinkedIds(previewOption.element, "reactions")
          .map((id) => elementsById.get(id))
          .filter((element): element is BuiltInElement => Boolean(element))
      : [];

  useEffect(() => {
    if (activeGroup && previewOption) {
      setPreviewIds((current) => ({
        ...current,
        [activeGroup.id]: previewOption.element.id,
      }));
    }
  }, [activeGroup, previewOption]);

  if (!orderedGroups.length) {
    return ledgerGroups.length ? (
      <UnifiedChoiceLedger
        groups={ledgerGroups}
        lockedEntries={lockedEntries}
        selections={selections}
        onSelectionChange={onSelectionChange}
      />
    ) : (
      <section className="builder-panel">
        <span className="builder-panel__label">Choices</span>
        <p className="route-shell__copy">
          No unresolved progression, proficiency, or nested choice families are unlocked for the current build yet.
        </p>
      </section>
    );
  }

  function toggleOption(optionId: string) {
    if (!activeGroup) {
      return;
    }

    const option = activeGroup.options.find((entry) => entry.element.id === optionId);
    if (!option) {
      return;
    }

    if (option.requirementFailures.length && !(selections[activeGroup.id] ?? []).includes(optionId)) {
      setInteractionWarning(option.requirementFailures[0] ?? "That option does not meet its prerequisites yet.");
      return;
    }

    setInteractionWarning("");

    const current = selections[activeGroup.id] ?? [];
    const alreadySelected = current.includes(optionId);
    const duplicateOwner = selectedSemanticOwners.get(getSelectionSemanticKey(option.element));

    if (alreadySelected) {
      onSelectionChange(
        activeGroup.id,
        current.filter((id) => id !== optionId),
      );
      return;
    }

    if (duplicateOwner) {
      setInteractionWarning(`${option.element.name} is already granted or selected by ${duplicateOwner}.`);
      return;
    }

    if (activeGroup.exactSelections === 1) {
      onSelectionChange(activeGroup.id, [optionId]);
      return;
    }

    if (current.length >= activeGroup.exactSelections) {
      return;
    }

    onSelectionChange(activeGroup.id, [...current, optionId]);
  }

  return (
    <section className="builder-panel progression-step">
      {ledgerGroups.length ? (
        <UnifiedChoiceLedger
          groups={ledgerGroups}
          lockedEntries={lockedEntries}
          selections={selections}
          onSelectionChange={onSelectionChange}
        />
      ) : null}
      <div className="builder-stepPanel__intro">
        <span className="route-shell__tag">Choices</span>
        <h2 className="route-shell__title">Resolve unlocked choice families and nested picks</h2>
        <p className="route-shell__copy">
          This step handles class-specific systems like invocations, disciplines, fighting styles, nested subclass picks, and broader proficiency or language choices unlocked by your build.
        </p>
      </div>

        <div className="spellcasting-step__groupTabs">
        {orderedGroups.map((group) => {
          const pickedCount = selections[group.id]?.length ?? 0;
          return (
            <button
              key={group.id}
              type="button"
              className={`spellcasting-step__groupTab${group.id === activeGroupId ? " spellcasting-step__groupTab--active" : ""}`}
              onClick={() => setActiveGroupId(group.id)}
            >
              <span>{group.title}</span>
              <small>{pickedCount}/{group.exactSelections}</small>
            </button>
          );
        })}
      </div>

      {activeGroup ? (
        <>
          {interactionWarning ? (
            <div className="builder-warnings">
              <p className="auth-card__status auth-card__status--error">{interactionWarning}</p>
            </div>
          ) : null}

          <div className="catalog-selector__mobileToggles">
            {viewMode === "cards" ? (
              <button
                className={`button button--secondary button--compact${activePane === "filters" ? " ability-mode__tab--active" : ""}`}
                type="button"
                onClick={() => setActivePane("filters")}
              >
                Filters
              </button>
            ) : null}
            <button
              className={`button button--secondary button--compact${activePane === "list" ? " ability-mode__tab--active" : ""}`}
              type="button"
              onClick={() => setActivePane("list")}
            >
              Library
            </button>
          </div>

          <div className={`catalog-selector__workbench${viewMode === "table" ? " catalog-selector__workbench--table" : ""}`}>
            {viewMode === "cards" ? (
              <aside className={`catalog-selector__filtersPanel${activePane === "filters" ? " is-mobileActive" : ""}`}>
                <div className="catalog-selector__panelHeader">
                  <span className="catalog-selector__sectionLabel">{activeGroup.ownerLabel}</span>
                  <strong className="catalog-selector__count">
                    {selectedIds.length}/{activeGroup.exactSelections} selected
                  </strong>
                </div>

                <div className="catalog-selector__searchField">
                  <span className="catalog-selector__sectionLabel">Search</span>
                  <input
                    className="input catalog-selector__search"
                    value={queries[activeGroup.id] ?? ""}
                    onChange={(event) =>
                      setQueries((current) => ({
                        ...current,
                        [activeGroup.id]: event.target.value,
                      }))
                    }
                    placeholder={`Search ${activeGroup.optionType.toLowerCase()}`}
                  />
                </div>

                <div className="catalog-selector__filterGroup">
                  <span className="catalog-selector__sectionLabel">Availability</span>
                  <div className="catalog-selector__filters">
                    <button
                      className={`choice-chip${showEligibleOnly ? " choice-chip--active" : ""}`}
                      type="button"
                      aria-pressed={showEligibleOnly}
                      onClick={() => setShowEligibleOnly((current) => !current)}
                    >
                      Eligible only
                    </button>
                  </div>
                </div>

                <div className="catalog-selector__selectionSnapshot">
                  <span className="catalog-selector__sectionLabel">Selection rule</span>
                  <strong className="catalog-selector__snapshotTitle">{activeGroup.title}</strong>
                  <p className="catalog-selector__snapshotMeta">
                    {activeGroup.optional
                      ? `Choose up to ${activeGroup.exactSelections} option${activeGroup.exactSelections === 1 ? "" : "s"}.`
                      : `Choose exactly ${activeGroup.exactSelections} option${activeGroup.exactSelections === 1 ? "" : "s"}.`}
                  </p>
                  {isOptionalSpellcastingAbilityGroup(activeGroup) ? (
                    <p className="catalog-selector__snapshotMeta">
                      {getOptionalSpellcastingAbilityHint(activeGroup)}
                    </p>
                  ) : null}
                  <ul className="catalog-selector__impactList">
                    <li>{activeGroup.optionType} family at level {activeGroup.unlockLevel}</li>
                    {activeGroup.supportsKey ? <li>{formatSupportLabel(activeGroup.supportsKey)}</li> : null}
                  </ul>
                </div>
              </aside>
            ) : null}

            <div className={`catalog-selector__optionsPanel${activePane === "list" ? " is-mobileActive" : ""}${viewMode === "table" ? " catalog-selector__optionsPanel--table" : ""}`}>
              <div className="catalog-selector__optionsHeader">
                <div className="catalog-selector__headingBlock">
                  <span className="catalog-selector__sectionLabel">Choose {activeGroup.optionType.toLowerCase()}</span>
                </div>
                <div className="catalog-selector__optionsActions">
                  <div className="catalog-selector__viewMode">
                    <button
                      className={`button button--secondary button--compact${viewMode === "cards" ? " ability-mode__tab--active" : ""}`}
                      type="button"
                      onClick={() => setViewMode("cards")}
                    >
                      <span className="catalog-selector__viewModeButton">
                        <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--workbench" aria-hidden="true" />
                        <span>Workbench</span>
                      </span>
                    </button>
                    <button
                      className={`button button--secondary button--compact${viewMode === "table" ? " ability-mode__tab--active" : ""}`}
                      type="button"
                      onClick={() => setViewMode("table")}
                    >
                      <span className="catalog-selector__viewModeButton">
                        <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--table" aria-hidden="true" />
                        <span>Table</span>
                      </span>
                    </button>
                  </div>
                  <span className="catalog-selector__count">{sortedOptions.length} options</span>
                </div>
              </div>

              {viewMode === "table" ? (
                <div className="catalog-selector__tableToolbar">
                  <div className="catalog-selector__tableToolbarPrimary">
                    <label className="catalog-selector__searchField catalog-selector__tableSearch">
                      <span className="catalog-selector__sectionLabel">Search</span>
                      <input
                        className="input catalog-selector__search"
                        placeholder={`Search ${activeGroup.optionType.toLowerCase()}`}
                        value={queries[activeGroup.id] ?? ""}
                        onChange={(event) =>
                          setQueries((current) => ({
                            ...current,
                            [activeGroup.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="catalog-selector__filterGroup">
                      <span className="catalog-selector__sectionLabel">Availability</span>
                      <div className="catalog-selector__filters">
                        <button
                          className={`choice-chip${showEligibleOnly ? " choice-chip--active" : ""}`}
                          type="button"
                          aria-pressed={showEligibleOnly}
                          onClick={() => setShowEligibleOnly((current) => !current)}
                        >
                          Eligible only
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="catalog-selector__appliedFilters">
                <button
                  className={`catalog-selector__filterChip catalog-selector__appliedFilter${showEligibleOnly ? " catalog-selector__filterChip--active" : ""}`}
                  type="button"
                  aria-pressed={showEligibleOnly}
                  onClick={() => setShowEligibleOnly((current) => !current)}
                >
                  Eligible only
                </button>
                {query ? (
                  <span className="catalog-selector__filterChip catalog-selector__appliedFilter">Search: {queries[activeGroup.id]}</span>
                ) : null}
              </div>

              {sortedOptions.length ? (
                viewMode === "table" ? (
                  <div className="catalog-selector__tableWrap" role="table" aria-label={`${activeGroup.title} option table`}>
                    <div className="catalog-selector__tableHead" role="row">
                      {([
                        ["name", "Name"],
                        ["source", "Source"],
                        ["summary", "Summary"],
                        ["impact", "Impact"],
                      ] as const).map(([key, headerLabel]) => {
                        const active = tableSort.key === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="columnheader"
                            aria-sort={active ? (tableSort.direction === "asc" ? "ascending" : "descending") : "none"}
                            className={`catalog-selector__tableSort${active ? " is-active" : ""}`}
                            onClick={() => setTableSort((current) => toggleTableSort(current, key))}
                          >
                            <span>{headerLabel}</span>
                            <span className="catalog-selector__tableSortGlyph" aria-hidden="true">
                              {active ? (tableSort.direction === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="catalog-selector__tableBody" role="rowgroup">
                      {sortedOptions.map((option) => {
                        const isSelected = selectedIds.includes(option.element.id);
                        const duplicateOwner = isSelected
                          ? ""
                          : selectedSemanticOwners.get(getSelectionSemanticKey(option.element)) ?? "";
                        const summary = getOptionSummary(activeGroup, option.element.description, option.element.prerequisite);
                        return (
                          <button
                            key={option.element.id}
                            className={`catalog-selector__tableRow${previewOption?.element.id === option.element.id ? " catalog-selector__tableRow--preview" : ""}${isSelected ? " catalog-selector__tableRow--selected" : ""}`}
                            type="button"
                            onClick={() => {
                              setPreviewIds((current) => ({
                                ...current,
                                [activeGroup.id]: option.element.id,
                              }));
                              if (isMobile) {
                                setActivePane("detail");
                              } else {
                                toggleOption(option.element.id);
                              }
                            }}
                            role="row"
                          >
                            <span className="catalog-selector__tableCell catalog-selector__tableCell--name" role="cell">
                              <strong>{option.element.name}</strong>
                              {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                            </span>
                            <span className="catalog-selector__tableCell" role="cell">{option.element.source}</span>
                            <span className="catalog-selector__tableCell" role="cell">{summary}</span>
                            <span className="catalog-selector__tableCell" role="cell">
                              {duplicateOwner || (option.requirementFailures.length ? option.requirementFailures[0] : `Adds ${activeGroup.optionType.toLowerCase()} option`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="catalog-selector__list">
                    {sortedOptions.map((option) => {
                      const isSelected = selectedIds.includes(option.element.id);
                      const duplicateOwner = isSelected
                        ? ""
                        : selectedSemanticOwners.get(getSelectionSemanticKey(option.element)) ?? "";
                      return (
                        <button
                          key={option.element.id}
                          className={`catalog-selector__row${previewOption?.element.id === option.element.id ? " catalog-selector__row--preview" : ""}${isSelected ? " catalog-selector__row--selected" : ""}`}
                          type="button"
                          onClick={() => {
                            setPreviewIds((current) => ({
                              ...current,
                              [activeGroup.id]: option.element.id,
                            }));
                            if (isMobile) {
                              setActivePane("detail");
                            } else {
                              toggleOption(option.element.id);
                            }
                          }}
                        >
                          <div className="catalog-selector__rowHeader">
                            <strong>{option.element.name}</strong>
                            {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                            {duplicateOwner ? <span className="catalog-selector__impactChip">From {duplicateOwner}</span> : null}
                          </div>
                          <span className="catalog-selector__source">{option.element.source}</span>
                          <div className="catalog-selector__summaryList">
                            <span>{getOptionSummary(activeGroup, option.element.description, option.element.prerequisite)}</span>
                          </div>
                          <div className="catalog-selector__rowImpact">
                            <span className="catalog-selector__impactChip">
                              {activeGroup.optionType}
                            </span>
                            {option.requirementFailures.length ? (
                              <span className="catalog-selector__impactChip">{option.requirementFailures[0]}</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <p className="catalog-selector__empty">
                  No matching options. Adjust the search or change to another family tab.
                </p>
              )}
            </div>

            <aside className={`catalog-selector__detailPanel${activePane === "detail" ? " is-mobileActive" : ""}`}>
              {previewOption ? (
                <>
                  <button
                    className="catalog-selector__mobileClose"
                    type="button"
                    aria-label="Back to library"
                    onClick={() => setActivePane("list")}
                  >
                    <span aria-hidden="true">←</span>
                    Back to library
                  </button>
                  <div className="catalog-selector__detailHeader">
                    <span className="catalog-selector__detailLabel">Selected</span>
                    <h3 className="catalog-selector__detailTitle">{previewOption.element.name}</h3>
                    <p className="catalog-selector__detailMeta">
                      {previewOption.element.source}
                      {previewOption.element.prerequisite ? ` • ${cleanReadablePrerequisite(previewOption.element.prerequisite)}` : ""}
                    </p>
                    <div className="catalog-selector__detailActions">
                      <button
                        className="button button--primary button--compact"
                        type="button"
                        onClick={() => {
                          toggleOption(previewOption.element.id);
                          setActivePane("list");
                        }}
                      >
                        {selectedIds.includes(previewOption.element.id)
                          ? "Remove selection"
                          : `Choose ${activeGroup.optionType.toLowerCase()}`}
                      </button>
                    </div>
                  </div>

                  <section className="catalog-selector__detailSection">
                    <span className="catalog-selector__detailLabel">Selection summary</span>
                    <ul className="catalog-selector__impactList">
                      <li>Selected {selectedIds.length} of {activeGroup.exactSelections}</li>
                      <li>{activeGroup.optionType} family at level {activeGroup.unlockLevel}</li>
                      {activeGroup.supportsKey ? <li>{formatSupportLabel(activeGroup.supportsKey)}</li> : null}
                    </ul>
                  </section>

                  {previewOption.element.type === "Companion" && previewCompanionSummary ? (
                    <>
                      <section className="catalog-selector__detailSection">
                        <span className="catalog-selector__detailLabel">Stat block</span>
                        <div className="progression-step__companionCard">
                          <div className="progression-step__companionIdentity">
                            <div className="catalog-selector__tagList">
                              {previewCompanionSummary.size ? <span className="catalog-selector__tag">{previewCompanionSummary.size}</span> : null}
                              {previewCompanionSummary.type ? <span className="catalog-selector__tag">{previewCompanionSummary.type}</span> : null}
                              {previewCompanionSummary.challenge ? <span className="catalog-selector__tag">CR {previewCompanionSummary.challenge}</span> : null}
                              {previewCompanionSummary.alignment ? <span className="catalog-selector__tag">{previewCompanionSummary.alignment}</span> : null}
                            </div>
                          </div>

                          <div className="progression-step__companionVitals">
                            {previewCompanionSummary.ac ? (
                              <div className="progression-step__companionVital">
                                <span>Armor Class</span>
                                <strong>{previewCompanionSummary.ac}</strong>
                              </div>
                            ) : null}
                            {previewCompanionSummary.hp ? (
                              <div className="progression-step__companionVital">
                                <span>Hit Points</span>
                                <strong>{previewCompanionSummary.hp}</strong>
                              </div>
                            ) : null}
                            {previewCompanionSummary.speed ? (
                              <div className="progression-step__companionVital progression-step__companionVital--wide">
                                <span>Speed</span>
                                <strong>{previewCompanionSummary.speed}</strong>
                              </div>
                            ) : null}
                          </div>

                          <div className="progression-step__companionAbilities">
                            {previewCompanionSummary.strength ? <div className="progression-step__companionAbility"><span>STR</span><strong>{previewCompanionSummary.strength}</strong></div> : null}
                            {previewCompanionSummary.dexterity ? <div className="progression-step__companionAbility"><span>DEX</span><strong>{previewCompanionSummary.dexterity}</strong></div> : null}
                            {previewCompanionSummary.constitution ? <div className="progression-step__companionAbility"><span>CON</span><strong>{previewCompanionSummary.constitution}</strong></div> : null}
                            {previewCompanionSummary.intelligence ? <div className="progression-step__companionAbility"><span>INT</span><strong>{previewCompanionSummary.intelligence}</strong></div> : null}
                            {previewCompanionSummary.wisdom ? <div className="progression-step__companionAbility"><span>WIS</span><strong>{previewCompanionSummary.wisdom}</strong></div> : null}
                            {previewCompanionSummary.charisma ? <div className="progression-step__companionAbility"><span>CHA</span><strong>{previewCompanionSummary.charisma}</strong></div> : null}
                          </div>

                          {previewCompanionSummary.senses || previewCompanionSummary.languages ? (
                            <div className="progression-step__companionNotes">
                              {previewCompanionSummary.senses ? (
                                <p><strong>Senses.</strong> {previewCompanionSummary.senses}</p>
                              ) : null}
                              {previewCompanionSummary.languages ? (
                                <p><strong>Languages.</strong> {previewCompanionSummary.languages}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </section>

                      {previewCompanionTraits.length ? (
                        <section className="catalog-selector__detailSection">
                          <span className="catalog-selector__detailLabel">Traits</span>
                          {previewCompanionTraits.map((trait) => (
                            <div key={trait.id} className="catalog-selector__detailSubsection">
                              <strong>{trait.name}</strong>
                              <div
                                className="catalog-selector__detailRichText"
                                dangerouslySetInnerHTML={{ __html: getDetailMarkup(trait) }}
                              />
                            </div>
                          ))}
                        </section>
                      ) : null}

                      {previewCompanionActions.length ? (
                        <section className="catalog-selector__detailSection">
                          <span className="catalog-selector__detailLabel">Actions</span>
                          {previewCompanionActions.map((action) => (
                            <div key={action.id} className="catalog-selector__detailSubsection">
                              <strong>{action.name}</strong>
                              <div
                                className="catalog-selector__detailRichText"
                                dangerouslySetInnerHTML={{ __html: getDetailMarkup(action) }}
                              />
                            </div>
                          ))}
                        </section>
                      ) : null}

                      {previewCompanionReactions.length ? (
                        <section className="catalog-selector__detailSection">
                          <span className="catalog-selector__detailLabel">Reactions</span>
                          {previewCompanionReactions.map((reaction) => (
                            <div key={reaction.id} className="catalog-selector__detailSubsection">
                              <strong>{reaction.name}</strong>
                              <div
                                className="catalog-selector__detailRichText"
                                dangerouslySetInnerHTML={{ __html: getDetailMarkup(reaction) }}
                              />
                            </div>
                          ))}
                        </section>
                      ) : null}
                    </>
                  ) : null}

                  <div
                    className="catalog-selector__detailRichText"
                    dangerouslySetInnerHTML={{ __html: getDetailMarkup(previewOption.element) }}
                  />
                </>
              ) : (
                <p className="builder-summary__meta">Choose an option to inspect its details.</p>
              )}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
