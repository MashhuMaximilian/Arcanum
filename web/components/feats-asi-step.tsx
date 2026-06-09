"use client";

import { useMemo, useState } from "react";

import type { BuiltInElement } from "@/lib/builtins/types";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type CharacterImprovementSelection,
} from "@/lib/characters/types";
import {
  getAvailableFeatOptions,
  getImprovementSelectionPoints,
  type ImprovementOpportunity,
} from "@/lib/progression/improvements";

type FeatsAsiStepProps = {
  effectiveAbilitiesBeforeImprovements: Record<string, number>;
  featFailuresById: Record<string, string[]>;
  feats: BuiltInElement[];
  opportunities: ImprovementOpportunity[];
  selections: Record<string, CharacterImprovementSelection>;
  onSelectionChange: (opportunityId: string, selection: CharacterImprovementSelection) => void;
};

type FeatSourceScope = "all" | "built-in" | "imported";
type FeatTableSortKey = "name" | "source" | "prerequisite" | "impact";
type FeatTableSortState = {
  key: FeatTableSortKey;
  direction: "asc" | "desc";
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeRichHtml(markup: string) {
  const withoutDangerousBlocks = markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\son[a-z-]+="[^"]*"/gi, "")
    .replace(/\son[a-z-]+='[^']*'/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\sstyle='[^']*'/gi, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\sclass='[^']*'/gi, "");

  return withoutDangerousBlocks.replace(
    /<\/?([a-z0-9-]+)(?:\s[^>]*?)?>/gi,
    (match, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      const allowedTags = new Set([
        "p",
        "br",
        "ul",
        "ol",
        "li",
        "strong",
        "b",
        "em",
        "i",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ]);

      return allowedTags.has(tag) ? match : "";
    },
  );
}

function formatPlainTextAsHtml(text: string) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return "";
  }

  const blocks = normalized.split(/\n\s*\n/);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) {
        return "";
      }

      const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line));
      if (bulletLines.length === lines.length) {
        const items = bulletLines
          .map((line) => `<li>${escapeHtml(line.replace(/^[-*•]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      const headingLine = lines[0];
      const headingMatch = headingLine.match(/^([A-Z][A-Z0-9' /-]{3,}|[A-Z][^:]{2,40}):$/);
      if (headingMatch) {
        const remainder = lines.slice(1).join(" ");
        return `<h4>${escapeHtml(headingLine.replace(/:$/, ""))}</h4>${
          remainder ? `<p>${escapeHtml(remainder)}</p>` : ""
        }`;
      }

      return `<p>${escapeHtml(lines.join(" "))}</p>`;
    })
    .join("");
}

function getDetailMarkup(feat: BuiltInElement | null) {
  if (!feat) {
    return "";
  }

  if (feat.descriptionHtml?.trim()) {
    return sanitizeRichHtml(feat.descriptionHtml);
  }

  return formatPlainTextAsHtml(feat.description);
}

function sourceScopeLabel(scope: FeatSourceScope) {
  switch (scope) {
    case "built-in":
      return "Built-in";
    case "imported":
      return "Imported sources";
    default:
      return "All";
  }
}

function toggleFeatTableSort(current: FeatTableSortState, key: FeatTableSortKey): FeatTableSortState {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    key,
    direction: key === "name" ? "asc" : "desc",
  };
}

function getEmptyAsiSelection(): CharacterImprovementSelection {
  return {
    mode: "asi",
    abilityBonuses: {},
    featId: "",
  };
}

function getAsiValue(selection: CharacterImprovementSelection | undefined, ability: AbilityKey) {
  if (!selection || selection.mode !== "asi") {
    return 0;
  }

  return selection.abilityBonuses[ability] ?? 0;
}

function getRemainingAsiPoints(
  selection: CharacterImprovementSelection | undefined,
  opportunity: ImprovementOpportunity,
) {
  return Math.max(0, opportunity.totalPoints - getImprovementSelectionPoints(selection));
}

export function FeatsAsiStep({
  effectiveAbilitiesBeforeImprovements,
  featFailuresById,
  feats,
  opportunities,
  selections,
  onSelectionChange,
}: FeatsAsiStepProps) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [previewIds, setPreviewIds] = useState<Record<string, string>>({});
  const [viewModes, setViewModes] = useState<Record<string, "cards" | "table">>({});
  const [sourceScopes, setSourceScopes] = useState<Record<string, FeatSourceScope>>({});
  const [selectedSources, setSelectedSources] = useState<Record<string, string[]>>({});
  const [expandedSourceLists, setExpandedSourceLists] = useState<Record<string, boolean>>({});
  const [eligibleOnlyFilters, setEligibleOnlyFilters] = useState<Record<string, boolean>>({});
  const [tableSorts, setTableSorts] = useState<Record<string, FeatTableSortState>>({});
  const featOptions = useMemo(() => getAvailableFeatOptions(feats), [feats]);

  if (!opportunities.length) {
    return (
      <section className="builder-panel">
        <span className="builder-panel__label">Feats / ASI</span>
        <p className="route-shell__copy">
          No unlocked ability score improvements are available at the current class levels yet.
        </p>
      </section>
    );
  }

  return (
    <section className="builder-panel feats-step">
      <div className="builder-stepPanel__intro">
        <span className="route-shell__tag">Feats / ASI</span>
        <h2 className="route-shell__title">Resolve every unlocked improvement opportunity</h2>
        <p className="route-shell__copy">
          Improvements are awarded by class level, not total character level. Each unlocked slot can become an ability score increase or, when feat data is available, a feat pick.
        </p>
      </div>

      <div className="feats-step__list">
        {opportunities.map((opportunity) => {
          const selection = selections[opportunity.id] ?? getEmptyAsiSelection();
          const isAsi = selection.mode === "asi";
          const featQuery = queries[opportunity.id]?.trim().toLowerCase() ?? "";
          const viewMode = viewModes[opportunity.id] ?? "table";
          const sourceScope = sourceScopes[opportunity.id] ?? "all";
          const selectedSourceFilters = selectedSources[opportunity.id] ?? [];
          const showEligibleOnly = eligibleOnlyFilters[opportunity.id] ?? true;
          const tableSort = tableSorts[opportunity.id] ?? { key: "name", direction: "asc" as const };
          const scopedFeats = featOptions.filter((feat) => {
            if (sourceScope === "built-in") {
              return feat.catalogOrigin === "built-in";
            }
            if (sourceScope === "imported") {
              return feat.catalogOrigin === "imported";
            }
            return true;
          });
          const sourceOptions = [...new Set(scopedFeats.map((feat) => feat.source).filter(Boolean))].sort((left, right) =>
            left.localeCompare(right),
          );
          const sourceListExpanded = expandedSourceLists[opportunity.id] ?? false;
          const visibleSourceOptions = sourceListExpanded ? sourceOptions : sourceOptions.slice(0, 12);
          const filteredFeats = scopedFeats.filter((feat) => {
            if (showEligibleOnly && (featFailuresById[feat.id] ?? []).length) {
              return false;
            }

            if (
              featQuery &&
              !`${feat.name} ${feat.source} ${feat.description}`.toLowerCase().includes(featQuery)
            ) {
              return false;
            }

            if (selectedSourceFilters.length && !selectedSourceFilters.includes(feat.source)) {
              return false;
            }

            return true;
          });
          const sortedFeats = [...filteredFeats].sort((left, right) => {
            const leftFailures = featFailuresById[left.id] ?? [];
            const rightFailures = featFailuresById[right.id] ?? [];
            const getValue = (feat: BuiltInElement) => {
              switch (tableSort.key) {
                case "source":
                  return feat.source;
                case "prerequisite":
                  return feat.prerequisite ?? "";
                case "impact":
                  return leftFailures.length === 0 ? "valid" : "invalid";
                case "name":
                default:
                  return feat.name;
              }
            };

            if (tableSort.key === "impact") {
              const leftValue = leftFailures.length === 0 ? "0-valid" : `1-${leftFailures[0]}`;
              const rightValue = rightFailures.length === 0 ? "0-valid" : `1-${rightFailures[0]}`;
              return tableSort.direction === "asc"
                ? leftValue.localeCompare(rightValue)
                : rightValue.localeCompare(leftValue);
            }

            const leftValue = getValue(left);
            const rightValue = getValue(right);
            return tableSort.direction === "asc"
              ? leftValue.localeCompare(rightValue)
              : rightValue.localeCompare(leftValue);
          });
          const previewId =
            previewIds[opportunity.id] ??
            selection.featId ??
            sortedFeats[0]?.id ??
            "";
          const selectedFeat = selection.featId
            ? featOptions.find((feat) => feat.id === selection.featId) ?? null
            : null;
          const previewFeat =
            sortedFeats.find((feat) => feat.id === previewId) ??
            featOptions.find((feat) => feat.id === previewId) ??
            selectedFeat ??
            sortedFeats[0] ??
            null;
          const previewFailures = previewFeat ? featFailuresById[previewFeat.id] ?? [] : [];
          const selectedFailures = selectedFeat ? featFailuresById[selectedFeat.id] ?? [] : [];

          return (
            <article className="feats-step__card" key={opportunity.id}>
              <div className="feats-step__header">
                <div className="feats-step__slotHeading">
                  <span className="builder-panel__label">Improvement slot</span>
                  <strong className="builder-summary__name">{opportunity.title}</strong>
                  <p className="builder-summary__meta">
                    {opportunity.featureName} at class level {opportunity.unlockLevel}
                  </p>
                </div>
                <div className="feats-step__modeSwitch">
                  <button
                    className={`button button--secondary button--compact${isAsi ? " ability-mode__tab--active" : ""}`}
                    type="button"
                    onClick={() =>
                      onSelectionChange(opportunity.id, {
                        mode: "asi",
                        abilityBonuses: selection.mode === "asi" ? selection.abilityBonuses : {},
                        featId: "",
                      })
                    }
                  >
                    ASI
                  </button>
                  {opportunity.featAllowed ? (
                    <button
                      className={`button button--secondary button--compact${!isAsi ? " ability-mode__tab--active" : ""}`}
                      type="button"
                      disabled={!featOptions.length}
                      onClick={() =>
                        onSelectionChange(opportunity.id, {
                          mode: "feat",
                          abilityBonuses: {},
                          featId: selection.mode === "feat" ? selection.featId : "",
                          featName: selection.mode === "feat" ? selection.featName : undefined,
                          featSource: selection.mode === "feat" ? selection.featSource : undefined,
                        })
                      }
                    >
                      Feat
                    </button>
                  ) : null}
                </div>
              </div>

              {isAsi ? (
                <div className="feats-step__asi">
                  <p className="builder-summary__meta">
                    {opportunity.notes[0] ??
                      `Spend exactly ${opportunity.totalPoints} points. You can raise one score by 2 or two scores by 1, up to a final score of 20.`}
                  </p>
                  <p className="builder-summary__meta">
                    Remaining points: {getRemainingAsiPoints(selection, opportunity)}
                  </p>
                  <div className="ability-grid ability-grid--compact">
                    {ABILITY_KEYS.map((ability) => {
                      const currentBonus = getAsiValue(selection, ability);
                      const remainingPoints = getRemainingAsiPoints(selection, opportunity);
                      const effectiveBeforeThisOpportunity =
                        effectiveAbilitiesBeforeImprovements[ability] - currentBonus;
                      const otherAssignedAbilities = ABILITY_KEYS.filter(
                        (key) => key !== ability && getAsiValue(selection, key) > 0,
                      );
                      const canDecrease = currentBonus > 0;
                      const canIncrease =
                        remainingPoints > 0 &&
                        currentBonus < opportunity.maxPerAbility &&
                        opportunity.allowedAbilities.includes(ability) &&
                        effectiveBeforeThisOpportunity + currentBonus < 20 &&
                        !(
                          opportunity.selectionPattern === "single-ability" &&
                          currentBonus === 0 &&
                          otherAssignedAbilities.length > 0
                        );

                      return (
                        <div className="ability-card ability-card--compact" key={`${opportunity.id}-${ability}`}>
                          <span className="ability-card__label">{ABILITY_LABELS[ability]}</span>
                          <div className="numeric-stepper">
                            <button
                              className="button button--secondary button--compact numeric-stepper__button"
                              type="button"
                              disabled={!canDecrease}
                              onClick={() =>
                                onSelectionChange(opportunity.id, {
                                  ...selection,
                                  mode: "asi",
                                  abilityBonuses: {
                                    ...selection.abilityBonuses,
                                    [ability]: Math.max(0, currentBonus - 1),
                                  },
                                  featId: "",
                                  featName: undefined,
                                  featSource: undefined,
                                })
                              }
                            >
                              -
                            </button>
                            <div className="numeric-stepper__value" aria-live="polite">
                              +{currentBonus}
                            </div>
                            <button
                              className="button button--secondary button--compact numeric-stepper__button"
                              type="button"
                              disabled={!canIncrease}
                              onClick={() =>
                                onSelectionChange(opportunity.id, {
                                  ...selection,
                                  mode: "asi",
                                  abilityBonuses: {
                                    ...selection.abilityBonuses,
                                    [ability]: currentBonus + 1,
                                  },
                                  featId: "",
                                  featName: undefined,
                                  featSource: undefined,
                                })
                              }
                            >
                              +
                            </button>
                          </div>
                          <span className="ability-card__meta">
                            Final {effectiveBeforeThisOpportunity + currentBonus}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="feats-step__featPicker">
                  {featOptions.length ? (
                    <div className="feats-step__pickerLayout">
                        <div className="feats-step__pickerColumn feats-step__pickerColumn--list">
                          <div className="catalog-selector__optionsHeader">
                            <div className="catalog-selector__headingBlock">
                              <span className="catalog-selector__sectionLabel">Choose feat</span>
                            </div>
                            <div className="catalog-selector__optionsActions">
                              <div className="catalog-selector__viewMode">
                                <button
                                  className={`button button--secondary button--compact${viewMode === "cards" ? " ability-mode__tab--active" : ""}`}
                                  type="button"
                                  onClick={() =>
                                    setViewModes((current) => ({
                                      ...current,
                                      [opportunity.id]: "cards",
                                    }))
                                  }
                                >
                                  <span className="catalog-selector__viewModeButton">
                                    <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--workbench" aria-hidden="true" />
                                    <span>Workbench</span>
                                  </span>
                                </button>
                                <button
                                  className={`button button--secondary button--compact${viewMode === "table" ? " ability-mode__tab--active" : ""}`}
                                  type="button"
                                  onClick={() =>
                                    setViewModes((current) => ({
                                      ...current,
                                      [opportunity.id]: "table",
                                    }))
                                  }
                                >
                                  <span className="catalog-selector__viewModeButton">
                                    <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--table" aria-hidden="true" />
                                    <span>Table</span>
                                  </span>
                                </button>
                              </div>
                              <span className="catalog-selector__count">{sortedFeats.length} entries</span>
                            </div>
                          </div>

                          <label className="builder-field">
                            <span>Search feats</span>
                            <input
                              className="input"
                              value={queries[opportunity.id] ?? ""}
                              onChange={(event) =>
                                setQueries((current) => ({
                                  ...current,
                                  [opportunity.id]: event.target.value,
                                }))
                              }
                              placeholder="Search feat library"
                            />
                          </label>

                          <div className="catalog-selector__filterGroup">
                            <span className="catalog-selector__sectionLabel">Source</span>
                            <div className="catalog-selector__filters">
                              {(["all", "built-in", "imported"] as const).map((scope) => (
                                <button
                                  key={scope}
                                  className={`button button--secondary button--compact${sourceScope === scope ? " ability-mode__tab--active" : ""}`}
                                  type="button"
                                  onClick={() => {
                                    setSourceScopes((current) => ({
                                      ...current,
                                      [opportunity.id]: scope,
                                    }));
                                    setExpandedSourceLists((current) => ({
                                      ...current,
                                      [opportunity.id]: false,
                                    }));
                                    setSelectedSources((current) => ({
                                      ...current,
                                      [opportunity.id]: [],
                                    }));
                                  }}
                                >
                                  {sourceScopeLabel(scope)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="catalog-selector__filterGroup">
                            <span className="catalog-selector__sectionLabel">Availability</span>
                            <div className="catalog-selector__filters">
                              <button
                                className={`choice-chip${showEligibleOnly ? " choice-chip--active" : ""}`}
                                type="button"
                                aria-pressed={showEligibleOnly}
                                onClick={() =>
                                  setEligibleOnlyFilters((current) => ({
                                    ...current,
                                    [opportunity.id]: !showEligibleOnly,
                                  }))
                                }
                              >
                                Eligible only
                              </button>
                            </div>
                          </div>

                          <div className="catalog-selector__appliedFilters">
                            <button
                              className={`catalog-selector__filterChip catalog-selector__appliedFilter${showEligibleOnly ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              aria-pressed={showEligibleOnly}
                              onClick={() =>
                                setEligibleOnlyFilters((current) => ({
                                  ...current,
                                  [opportunity.id]: !showEligibleOnly,
                                }))
                              }
                            >
                              Eligible only
                            </button>
                            {featQuery ? (
                              <span className="catalog-selector__filterChip catalog-selector__appliedFilter">
                                Search: {queries[opportunity.id]}
                              </span>
                            ) : null}
                          </div>

                          {sourceOptions.length > 1 ? (
                            <div className="catalog-selector__filterGroup">
                              <span className="catalog-selector__sectionLabel">Named sources</span>
                              <div className={`catalog-selector__filterTags feats-step__namedSources${sourceListExpanded ? " is-expanded" : ""}`}>
                                {visibleSourceOptions.map((source) => (
                                  <button
                                    key={source}
                                    className={`catalog-selector__filterChip${selectedSourceFilters.includes(source) ? " catalog-selector__filterChip--active" : ""}`}
                                    type="button"
                                    onClick={() =>
                                      setSelectedSources((current) => {
                                        const existing = current[opportunity.id] ?? [];
                                        return {
                                          ...current,
                                          [opportunity.id]: existing.includes(source)
                                            ? existing.filter((entry) => entry !== source)
                                            : [...existing, source],
                                        };
                                      })
                                    }
                                  >
                                    {source}
                                  </button>
                                ))}
                              </div>
                              {sourceOptions.length > 12 ? (
                                <button
                                  className="button button--secondary button--compact feats-step__sourceToggle"
                                  type="button"
                                  onClick={() =>
                                    setExpandedSourceLists((current) => ({
                                      ...current,
                                      [opportunity.id]: !sourceListExpanded,
                                    }))
                                  }
                                >
                                  {sourceListExpanded ? "Show fewer sources" : `Show all ${sourceOptions.length} sources`}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {viewMode === "table" ? (
                            <div className="feats-step__tableScroller">
                              <div className="catalog-selector__tableWrap feats-step__tableWrap" role="table" aria-label={`${opportunity.title} feat table`}>
                                <div className="catalog-selector__tableHead" role="row">
                                {([
                                  ["name", "Name"],
                                  ["source", "Source"],
                                  ["prerequisite", "Prerequisite"],
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
                                      onClick={() =>
                                        setTableSorts((current) => ({
                                          ...current,
                                          [opportunity.id]: toggleFeatTableSort(current[opportunity.id] ?? { key: "name", direction: "asc" }, key),
                                        }))
                                      }
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
                                  {sortedFeats.length ? sortedFeats.map((feat) => {
                                    const isPreview = previewFeat?.id === feat.id;
                                    const isSelected = selection.featId === feat.id;
                                    const failures = featFailuresById[feat.id] ?? [];
                                    const canSelect = failures.length === 0;
                                    const hasInvalidSelection = isSelected && failures.length > 0;
                                    return (
                                      <button
                                        key={feat.id}
                                        className={`catalog-selector__tableRow${isPreview ? " catalog-selector__tableRow--preview" : ""}${isSelected ? " catalog-selector__tableRow--selected" : ""}`}
                                        type="button"
                                        onClick={() => {
                                          setPreviewIds((current) => ({
                                            ...current,
                                            [opportunity.id]: feat.id,
                                          }));
                                          if (!canSelect) {
                                            return;
                                          }
                                          onSelectionChange(opportunity.id, {
                                            mode: "feat",
                                            abilityBonuses: {},
                                            featId: feat.id,
                                            featName: feat.name,
                                            featSource: feat.source,
                                          });
                                        }}
                                        role="row"
                                      >
                                        <span className="catalog-selector__tableCell catalog-selector__tableCell--name" role="cell">
                                          <strong>{feat.name}</strong>
                                          {hasInvalidSelection ? (
                                            <span className="catalog-selector__selectedBadge catalog-selector__selectedBadge--error">
                                              Prerequisites not met
                                            </span>
                                          ) : isSelected ? (
                                            <span className="catalog-selector__selectedBadge">Selected</span>
                                          ) : null}
                                        </span>
                                        <span className="catalog-selector__tableCell" role="cell">{feat.source}</span>
                                        <span className="catalog-selector__tableCell" role="cell">{feat.prerequisite ?? "—"}</span>
                                        <span className="catalog-selector__tableCell" role="cell">
                                          {failures.length ? failures[0] : "Valid"}
                                        </span>
                                      </button>
                                    );
                                  }) : <p className="builder-summary__meta">No feats match the current filters.</p>}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="feats-step__optionList" role="list">
                              {sortedFeats.length ? (
                                sortedFeats.map((feat) => {
                                const isPreview = previewFeat?.id === feat.id;
                                const isSelected = selection.featId === feat.id;
                                const failures = featFailuresById[feat.id] ?? [];
                                const canSelect = failures.length === 0;
                                const hasInvalidSelection = isSelected && failures.length > 0;
                                return (
                                  <button
                                    key={feat.id}
                                    className={`feats-step__option${isPreview ? " feats-step__option--preview" : ""}${isSelected ? " feats-step__option--selected" : ""}`}
                                    type="button"
                                    onClick={() => {
                                      setPreviewIds((current) => ({
                                        ...current,
                                        [opportunity.id]: feat.id,
                                      }));
                                      if (!canSelect) {
                                        return;
                                      }
                                      onSelectionChange(opportunity.id, {
                                        mode: "feat",
                                        abilityBonuses: {},
                                        featId: feat.id,
                                        featName: feat.name,
                                        featSource: feat.source,
                                      });
                                    }}
                                  >
                                    <div className="feats-step__optionHeader">
                                      <strong>{feat.name}</strong>
                                      <div className="feats-step__optionBadges">
                                        {hasInvalidSelection ? (
                                          <span className="catalog-selector__selectedBadge catalog-selector__selectedBadge--error">
                                            Prerequisites not met
                                          </span>
                                        ) : isSelected ? (
                                          <span className="catalog-selector__selectedBadge">Selected</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <span>{feat.source}</span>
                                    {!canSelect ? (
                                      <small className={`auth-card__status auth-card__status--error${hasInvalidSelection ? " feats-step__optionError--active" : ""}`}>
                                        {failures[0]}
                                      </small>
                                    ) : null}
                                  </button>
                                );
                              })
                            ) : (
                              <p className="builder-summary__meta">No feats match the current filters.</p>
                            )}
                            </div>
                          )}
                        </div>
                        <div className="feats-step__pickerColumn feats-step__pickerColumn--detail">
                          {previewFeat ? (
                            <div className="feats-step__featPreview">
                              <div className="feats-step__previewHeader">
                                <span className="builder-panel__label">
                                  {selection.featId === previewFeat.id ? "Selected feat" : "Preview feat"}
                                </span>
                                <div className="feats-step__optionBadges">
                                  {selection.featId === previewFeat.id && previewFailures.length > 0 ? (
                                    <span className="catalog-selector__selectedBadge catalog-selector__selectedBadge--error">
                                      Prerequisites not met
                                    </span>
                                  ) : selection.featId === previewFeat.id ? (
                                    <span className="catalog-selector__selectedBadge">Selected</span>
                                  ) : null}
                                </div>
                              </div>
                              <strong className="builder-summary__name">{previewFeat.name}</strong>
                              <p className="builder-summary__meta">{previewFeat.source}</p>
                              {previewFeat.supports?.length ? (
                                <div className="catalog-selector__detailTags">
                                  {previewFeat.supports.slice(0, 6).map((tag) => (
                                    <span className="catalog-selector__detailTag" key={`${previewFeat.id}-${tag}`}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div
                                className="catalog-selector__richText"
                                dangerouslySetInnerHTML={{ __html: getDetailMarkup(previewFeat) }}
                              />
                              {previewFailures.length ? (
                                <div className="builder-warnings">
                                  {previewFailures.map((message) => (
                                    <p className="auth-card__status auth-card__status--error" key={`${previewFeat.id}-${message}`}>
                                      {message}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              {selectedFailures.length ? (
                                <p className="builder-summary__meta">
                                  The currently selected feat no longer satisfies its prerequisite checks.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="builder-summary__meta">Pick a feat from the left to inspect its details.</p>
                          )}
                        </div>
                      </div>
                  ) : (
                    <p className="auth-card__status auth-card__status--error">
                      No feat catalog is currently available. Import feat sources or use the ASI option for this slot.
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
