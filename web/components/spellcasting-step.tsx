"use client";

import { useEffect, useMemo, useState } from "react";

import { getDetailMarkup } from "@/components/catalog-selector";
import { sortTableRows, toggleTableSort, type TableSortState } from "@/components/table-sort";
import type { BuiltInElement } from "@/lib/builtins/types";
import {
  getSpellCastingTime,
  getSpellComponents,
  getSpellDuration,
  getSpellLevel,
  getSpellRange,
  getSpellSchool,
  getSpellValidationMessages,
  isSpellConcentration,
  isSpellRitual,
  type SpellSelectionGroup,
} from "@/lib/progression/spellcasting";
import { getSelectionSemanticKey } from "@/lib/progression/selection-identity";

type SpellcastingStepProps = {
  groups: SpellSelectionGroup[];
  selections: Record<string, string[]>;
  spells: BuiltInElement[];
  onSelectionChange: (groupId: string, spellIds: string[]) => void;
};

function formatSpellLevel(level: number) {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

function sourceLabel(origin: "all" | "built-in" | "imported") {
  switch (origin) {
    case "built-in":
      return "Built-in";
    case "imported":
      return "Imported sources";
    default:
      return "All";
  }
}

function getSpellSourceFilterLabel(spell: BuiltInElement) {
  if (spell.catalogOrigin === "built-in") {
    return "SRD";
  }

  return spell.source?.trim() || "Imported source";
}

export function SpellcastingStep({
  groups,
  selections,
  spells,
  onSelectionChange,
}: SpellcastingStepProps) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? "");
  const [previewIds, setPreviewIds] = useState<Record<string, string>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [sourceFilters, setSourceFilters] = useState<Record<string, "all" | "built-in" | "imported">>({});
  const [selectedSources, setSelectedSources] = useState<Record<string, string[]>>({});
  const [levelFilters, setLevelFilters] = useState<Record<string, number | null>>({});
  const [schoolFilters, setSchoolFilters] = useState<Record<string, string | null>>({});
  const [activePane, setActivePane] = useState<"filters" | "list" | "detail">("list");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [showTableFilters, setShowTableFilters] = useState(false);
  const [tableSort, setTableSort] = useState<TableSortState<"name" | "school" | "source" | "level">>({
    key: "level",
    direction: "asc",
  });

  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? "");
    }
  }, [activeGroupId, groups]);

  const spellsById = useMemo(() => new Map(spells.map((spell) => [spell.id, spell])), [spells]);
  const selectedSpellOwners = useMemo(() => {
    const owners = new Map<string, string>();
    groups.forEach((group) => {
      [...(group.grantedSpellIds ?? []), ...(selections[group.id] ?? [])].forEach((id) => {
        const spell = spellsById.get(id);
        if (spell) {
          owners.set(getSelectionSemanticKey(spell), group.title);
        }
      });
    });
    return owners;
  }, [groups, selections, spellsById]);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const selectedSpellIds = activeGroup ? selections[activeGroup.id] ?? [] : [];
  const availableSpells = activeGroup
    ? activeGroup.availableSpellIds
        .map((id) => spellsById.get(id))
        .filter((spell): spell is BuiltInElement => Boolean(spell))
    : [];
  const query = activeGroup ? queries[activeGroup.id]?.trim().toLowerCase() ?? "" : "";
  const sourceFilter = activeGroup ? sourceFilters[activeGroup.id] ?? "all" : "all";
  const selectedSourceFilters = activeGroup ? selectedSources[activeGroup.id] ?? [] : [];
  const levelFilter = activeGroup ? levelFilters[activeGroup.id] ?? null : null;
  const schoolFilter = activeGroup ? schoolFilters[activeGroup.id] ?? null : null;

  const filteredSpells = availableSpells.filter((spell) => {
    if (sourceFilter !== "all" && spell.catalogOrigin !== sourceFilter) {
      return false;
    }

    if (selectedSourceFilters.length) {
      const label = getSpellSourceFilterLabel(spell);
      if (!selectedSourceFilters.includes(label)) {
        return false;
      }
    }

    if (levelFilter !== null && getSpellLevel(spell) !== levelFilter) {
      return false;
    }

    if (schoolFilter && getSpellSchool(spell) !== schoolFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      spell.name,
      spell.source,
      spell.description,
      getSpellSchool(spell),
      getSpellCastingTime(spell),
      getSpellDuration(spell),
      getSpellRange(spell),
      ...(spell.supports ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
  const sortedSpells = useMemo(
    () =>
      sortTableRows(filteredSpells, tableSort, (spell, key) => {
        switch (key) {
          case "school":
            return getSpellSchool(spell);
          case "source":
            return spell.source ?? "";
          case "level":
            return getSpellLevel(spell);
          case "name":
          default:
            return spell.name;
        }
      }),
    [filteredSpells, tableSort],
  );

  const schoolOptions = [...new Set(availableSpells.map((spell) => getSpellSchool(spell)))].sort();
  const sourceOptions = [...new Set(
    availableSpells
      .filter((spell) => sourceFilter === "all" || spell.catalogOrigin === sourceFilter)
      .map((spell) => getSpellSourceFilterLabel(spell)),
  )].sort();
  const levelOptions = [...new Set(availableSpells.map((spell) => getSpellLevel(spell)))].sort((a, b) => a - b);
  const otherGroupMatches = query
    ? groups
        .filter((group) => group.id !== activeGroup?.id)
        .map((group) => ({
          group,
          count: group.availableSpellIds.filter((id) => {
            const spell = spellsById.get(id);
            if (!spell) {
              return false;
            }
            return [
              spell.name,
              spell.source,
              spell.description,
              getSpellSchool(spell),
            ]
              .join(" ")
              .toLowerCase()
              .includes(query);
          }).length,
        }))
        .filter(({ count }) => count > 0)
    : [];
  const previewId =
    activeGroup
      ? previewIds[activeGroup.id] ??
        selectedSpellIds[0] ??
        sortedSpells[0]?.id ??
        activeGroup.grantedSpellIds[0] ??
        ""
      : "";
  const previewSpell =
    sortedSpells.find((spell) => spell.id === previewId) ??
    availableSpells.find((spell) => spell.id === previewId) ??
    (previewId ? spellsById.get(previewId) ?? null : null) ??
    (activeGroup?.grantedSpellIds[0] ? spellsById.get(activeGroup.grantedSpellIds[0]) ?? null : null);

  const allWarnings = getSpellValidationMessages(groups, selections);
  const groupWarningsById = useMemo(
    () =>
      Object.fromEntries(
        groups.map((group) => [group.id, getSpellValidationMessages([group], selections)]),
      ) as Record<string, string[]>,
    [groups, selections],
  );
  const activeWarnings = activeGroup
    ? groupWarningsById[activeGroup.id] ?? []
    : [];

  useEffect(() => {
    if (!activeGroup) {
      return;
    }

    if (previewSpell) {
      setPreviewIds((current) => ({
        ...current,
        [activeGroup.id]: previewSpell.id,
      }));
    }
  }, [activeGroup, previewSpell]);

  useEffect(() => {
    if (!activeGroup) {
      return;
    }

    if (!selectedSourceFilters.length) {
      return;
    }

    const allowed = new Set(sourceOptions);
    setSelectedSources((current) => ({
      ...current,
      [activeGroup.id]: (current[activeGroup.id] ?? []).filter((source) => allowed.has(source)),
    }));
  }, [activeGroup, selectedSourceFilters.length, sourceOptions]);

  if (!groups.length) {
    return (
      <section className="builder-panel">
        <span className="builder-panel__label">Spellcasting</span>
        <p className="route-shell__copy">
          No spellcasting choices are unlocked for the current build yet.
        </p>
      </section>
    );
  }

  function toggleSpell(spellId: string) {
    if (!activeGroup || activeGroup.kind === "granted") {
      return;
    }

    const current = selections[activeGroup.id] ?? [];
    const alreadySelected = current.includes(spellId);
    const spell = spellsById.get(spellId);
    const duplicateOwner = spell ? selectedSpellOwners.get(getSelectionSemanticKey(spell)) : "";

    if (alreadySelected) {
      onSelectionChange(
        activeGroup.id,
        current.filter((entry) => entry !== spellId),
      );
      return;
    }

    if (duplicateOwner) {
      return;
    }

    if (current.length >= activeGroup.maxSelections) {
      return;
    }

    onSelectionChange(activeGroup.id, [...current, spellId]);
  }

  return (
    <section className="builder-panel spellcasting-step">
      <div className="builder-stepPanel__intro">
        <span className="route-shell__tag">Spellcasting</span>
        <h2 className="route-shell__title">Resolve spellcasting by source and acquisition model</h2>
        <p className="route-shell__copy">
          Spell picks are grouped by how you gain them: cantrips, spellbook entries, prepared spells, and direct grants.
        </p>
      </div>

      <div className="spellcasting-step__groupTabs">
        {groups.map((group) => {
          const pickedCount = selections[group.id]?.length ?? 0;
          const targetCount = group.exactSelections ?? group.maxSelections;
          const groupWarnings = groupWarningsById[group.id] ?? [];
          return (
            <button
              key={group.id}
              className={`spellcasting-step__groupTab${group.id === activeGroupId ? " spellcasting-step__groupTab--active" : ""}${groupWarnings.length ? " spellcasting-step__groupTab--warning" : ""}`}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
            >
              <span>{group.title}</span>
              <small>
                {group.kind === "prepared"
                  ? `${pickedCount}/${targetCount} prepared`
                  : group.kind === "granted"
                    ? `${group.grantedSpellIds.length} granted`
                    : `${pickedCount}/${targetCount}`}
              </small>
              {groupWarnings.length ? (
                <em className="spellcasting-step__groupTabAlert">
                  {groupWarnings.length} issue{groupWarnings.length === 1 ? "" : "s"}
                </em>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeGroup ? (
        <>
          {allWarnings.length ? (
            <div className="spellcasting-step__warningSummary">
              <strong>{allWarnings.length} spellcasting issue{allWarnings.length === 1 ? "" : "s"} blocking review</strong>
              <span>{allWarnings[0]}</span>
            </div>
          ) : null}

          {allWarnings.length ? (
            <div className="builder-warnings">
              {allWarnings.map((warning) => (
                <p className="auth-card__status auth-card__status--error" key={warning}>
                  {warning}
                </p>
              ))}
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
            <button
              className={`button button--secondary button--compact${activePane === "detail" ? " ability-mode__tab--active" : ""}`}
              type="button"
              onClick={() => setActivePane("detail")}
            >
              Details
            </button>
          </div>

          <div className={`catalog-selector__workbench spellcasting-step__workbench${viewMode === "table" ? " catalog-selector__workbench--table" : ""}`}>
            {viewMode === "cards" ? (
              <aside className={`catalog-selector__filtersPanel${activePane === "filters" ? " is-mobileActive" : ""}`}>
                <div className="catalog-selector__panelHeader">
                  <span className="catalog-selector__sectionLabel">{activeGroup.ownerLabel}</span>
                  <strong className="catalog-selector__count">
                    {activeGroup.kind === "granted"
                      ? `${activeGroup.grantedSpellIds.length} granted`
                      : `${selectedSpellIds.length}/${activeGroup.maxSelections} selected`}
                  </strong>
                </div>

                <div className="catalog-selector__searchField">
                  <span className="catalog-selector__sectionLabel">Search</span>
                  <input
                    className="input catalog-selector__search"
                    type="search"
                    placeholder="Search spells"
                    value={queries[activeGroup.id] ?? ""}
                    onChange={(event) =>
                      setQueries((current) => ({
                        ...current,
                        [activeGroup.id]: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="catalog-selector__filterGroup">
                  <span className="catalog-selector__sectionLabel">Source</span>
                  <div className="catalog-selector__filters">
                    {(["all", "built-in", "imported"] as const).map((option) => (
                      <button
                        key={option}
                        className={`button button--secondary button--compact${
                          sourceFilter === option ? " ability-mode__tab--active" : ""
                        }`}
                        type="button"
                        onClick={() => {
                          setSourceFilters((current) => ({
                            ...current,
                            [activeGroup.id]: option,
                          }));
                          setSelectedSources((current) => ({
                            ...current,
                            [activeGroup.id]: [],
                          }));
                        }}
                      >
                        {sourceLabel(option)}
                      </button>
                    ))}
                  </div>
                </div>

                {sourceOptions.length > 1 ? (
                  <div className="catalog-selector__filterGroup">
                    <span className="catalog-selector__sectionLabel">Named sources</span>
                    <div className="catalog-selector__filterTags">
                      {sourceOptions.slice(0, 12).map((source) => (
                        <button
                          key={source}
                          className={`catalog-selector__filterChip${selectedSourceFilters.includes(source) ? " catalog-selector__filterChip--active" : ""}`}
                          type="button"
                          onClick={() =>
                            setSelectedSources((current) => {
                              const existing = current[activeGroup.id] ?? [];
                              return {
                                ...current,
                                [activeGroup.id]: existing.includes(source)
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
                  </div>
                ) : null}

                <div className="catalog-selector__filterGroup">
                  <span className="catalog-selector__sectionLabel">Spell level</span>
                  <div className="catalog-selector__filterTags">
                    <button
                      className={`catalog-selector__filterChip${levelFilter === null ? " catalog-selector__filterChip--active" : ""}`}
                      type="button"
                      onClick={() =>
                        setLevelFilters((current) => ({
                          ...current,
                          [activeGroup.id]: null,
                        }))
                      }
                    >
                      Any
                    </button>
                    {levelOptions.map((level) => (
                      <button
                        key={level}
                        className={`catalog-selector__filterChip${levelFilter === level ? " catalog-selector__filterChip--active" : ""}`}
                        type="button"
                        onClick={() =>
                          setLevelFilters((current) => ({
                            ...current,
                            [activeGroup.id]: level,
                          }))
                        }
                      >
                        {formatSpellLevel(level)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="catalog-selector__filterGroup">
                  <span className="catalog-selector__sectionLabel">School</span>
                  <div className="catalog-selector__filterTags">
                    <button
                      className={`catalog-selector__filterChip${schoolFilter === null ? " catalog-selector__filterChip--active" : ""}`}
                      type="button"
                      onClick={() =>
                        setSchoolFilters((current) => ({
                          ...current,
                          [activeGroup.id]: null,
                        }))
                      }
                    >
                      Any
                    </button>
                    {schoolOptions.slice(0, 8).map((school) => (
                      <button
                        key={school}
                        className={`catalog-selector__filterChip${schoolFilter === school ? " catalog-selector__filterChip--active" : ""}`}
                        type="button"
                        onClick={() =>
                          setSchoolFilters((current) => ({
                            ...current,
                            [activeGroup.id]: school,
                          }))
                        }
                      >
                        {school}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="catalog-selector__selectionSnapshot">
                  <span className="catalog-selector__sectionLabel">Build impact</span>
                  <strong className="catalog-selector__snapshotTitle">{activeGroup.title}</strong>
                  <p className="catalog-selector__snapshotMeta">{activeGroup.description}</p>
                  <ul className="catalog-selector__impactList">
                    {activeGroup.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </aside>
            ) : null}

            <div className={`catalog-selector__optionsPanel${activePane === "list" ? " is-mobileActive" : ""}${viewMode === "table" ? " catalog-selector__optionsPanel--table" : ""}`}>
              <div className="catalog-selector__optionsHeader">
                <div className="catalog-selector__headingBlock">
                  <span className="catalog-selector__sectionLabel">Spell library</span>
                  <strong className="catalog-selector__optionsTitle catalog-selector__optionsTitle--tight">
                    {activeGroup.title}
                  </strong>
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
                  <span className="catalog-selector__count">{sortedSpells.length} spells</span>
                </div>
              </div>

              {viewMode === "table" ? (
                <div className="catalog-selector__tableToolbar">
                  <div className="catalog-selector__tableToolbarPrimary">
                    <label className="catalog-selector__searchField catalog-selector__tableSearch">
                      <span className="catalog-selector__sectionLabel">Search</span>
                      <input
                        className="input catalog-selector__search"
                        type="search"
                        placeholder="Search spells"
                        value={queries[activeGroup.id] ?? ""}
                        onChange={(event) =>
                          setQueries((current) => ({
                            ...current,
                            [activeGroup.id]: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <div className="catalog-selector__tableToolbarControls">
                      <div className="catalog-selector__filterGroup">
                        <span className="catalog-selector__sectionLabel">Source</span>
                        <div className="catalog-selector__filters">
                          {(["all", "built-in", "imported"] as const).map((option) => (
                            <button
                              key={option}
                              className={`button button--secondary button--compact${
                                sourceFilter === option ? " ability-mode__tab--active" : ""
                              }`}
                              type="button"
                              onClick={() => {
                                setSourceFilters((current) => ({
                                  ...current,
                                  [activeGroup.id]: option,
                                }));
                                setSelectedSources((current) => ({
                                  ...current,
                                  [activeGroup.id]: [],
                                }));
                              }}
                            >
                              {sourceLabel(option)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(sourceOptions.length > 1 || levelOptions.length > 1 || schoolOptions.length > 1) ? (
                        <button
                          className={`button button--secondary button--compact${showTableFilters ? " ability-mode__tab--active" : ""}`}
                          type="button"
                          onClick={() => setShowTableFilters((current) => !current)}
                        >
                          {showTableFilters ? "Hide filters" : "More filters"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {showTableFilters ? (
                    <div className="catalog-selector__tableToolbarRow">
                      {sourceOptions.length > 1 ? (
                        <div className="catalog-selector__filterGroup catalog-selector__tableTags">
                          <span className="catalog-selector__sectionLabel">Sources</span>
                          <div className="catalog-selector__filterTags">
                            {sourceOptions.slice(0, 12).map((source) => (
                              <button
                                key={source}
                                className={`catalog-selector__filterChip${selectedSourceFilters.includes(source) ? " catalog-selector__filterChip--active" : ""}`}
                                type="button"
                                onClick={() =>
                                  setSelectedSources((current) => {
                                    const existing = current[activeGroup.id] ?? [];
                                    return {
                                      ...current,
                                      [activeGroup.id]: existing.includes(source)
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
                        </div>
                      ) : null}

                      <div className="catalog-selector__filterGroup catalog-selector__tableTags">
                        <span className="catalog-selector__sectionLabel">Spell level</span>
                        <div className="catalog-selector__filterTags">
                          <button
                            className={`catalog-selector__filterChip${levelFilter === null ? " catalog-selector__filterChip--active" : ""}`}
                            type="button"
                            onClick={() =>
                              setLevelFilters((current) => ({
                                ...current,
                                [activeGroup.id]: null,
                              }))
                            }
                          >
                            Any
                          </button>
                          {levelOptions.map((level) => (
                            <button
                              key={level}
                              className={`catalog-selector__filterChip${levelFilter === level ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              onClick={() =>
                                setLevelFilters((current) => ({
                                  ...current,
                                  [activeGroup.id]: level,
                                }))
                              }
                            >
                              {formatSpellLevel(level)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="catalog-selector__filterGroup catalog-selector__tableTags">
                        <span className="catalog-selector__sectionLabel">School</span>
                        <div className="catalog-selector__filterTags">
                          <button
                            className={`catalog-selector__filterChip${schoolFilter === null ? " catalog-selector__filterChip--active" : ""}`}
                            type="button"
                            onClick={() =>
                              setSchoolFilters((current) => ({
                                ...current,
                                [activeGroup.id]: null,
                              }))
                            }
                          >
                            Any
                          </button>
                          {schoolOptions.slice(0, 8).map((school) => (
                            <button
                              key={school}
                              className={`catalog-selector__filterChip${schoolFilter === school ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              onClick={() =>
                                setSchoolFilters((current) => ({
                                  ...current,
                                  [activeGroup.id]: school,
                                }))
                              }
                            >
                              {school}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeGroup.kind === "granted" ? (
                <div className="catalog-selector__list">
                  {activeGroup.grantedSpellIds.map((spellId) => {
                    const spell = spellsById.get(spellId);
                    if (!spell) {
                      return null;
                    }

                    return (
                      <button
                        key={spell.id}
                        className={`spellcasting-step__row${previewSpell?.id === spell.id ? " spellcasting-step__row--preview" : ""}`}
                        type="button"
                        onClick={() =>
                          setPreviewIds((current) => ({
                            ...current,
                            [activeGroup.id]: spell.id,
                          }))
                        }
                      >
                        <div className="spellcasting-step__rowHeader">
                          <strong>{spell.name}</strong>
                          <span>{formatSpellLevel(getSpellLevel(spell))}</span>
                        </div>
                        <span className="catalog-selector__source">{spell.source}</span>
                      </button>
                    );
                  })}
                </div>
              ) : sortedSpells.length ? (
                viewMode === "table" ? (
                  <div className="catalog-selector__tableWrap" role="table" aria-label={`${activeGroup.title} spell table`}>
                    <div className="catalog-selector__tableHead" role="row">
                      {([
                        ["name", "Name"],
                        ["school", "School"],
                        ["source", "Source"],
                        ["level", "Level"],
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
                      {sortedSpells.map((spell) => {
                        const isSelected = selectedSpellIds.includes(spell.id);
                        const duplicateOwner = isSelected
                          ? ""
                          : selectedSpellOwners.get(getSelectionSemanticKey(spell)) ?? "";
                        const level = getSpellLevel(spell);
                        return (
                          <button
                            key={spell.id}
                            className={`catalog-selector__tableRow${previewSpell?.id === spell.id ? " catalog-selector__tableRow--preview" : ""}${isSelected ? " catalog-selector__tableRow--selected" : ""}`}
                            type="button"
                            onClick={() => {
                              setPreviewIds((current) => ({
                                ...current,
                                [activeGroup.id]: spell.id,
                              }));
                              toggleSpell(spell.id);
                            }}
                            role="row"
                          >
                            <span className="catalog-selector__tableCell catalog-selector__tableCell--name" role="cell">
                              <strong>{spell.name}</strong>
                              {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                              {duplicateOwner ? <span className="catalog-selector__impactChip">From {duplicateOwner}</span> : null}
                            </span>
                            <span className="catalog-selector__tableCell" role="cell">
                              {getSpellSchool(spell)}
                            </span>
                            <span className="catalog-selector__tableCell" role="cell">
                              {spell.source}
                            </span>
                            <span className="catalog-selector__tableCell" role="cell">
                              {formatSpellLevel(level)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="catalog-selector__list spellcasting-step__table">
                    {sortedSpells.map((spell) => {
                      const isSelected = selectedSpellIds.includes(spell.id);
                      const duplicateOwner = isSelected
                        ? ""
                        : selectedSpellOwners.get(getSelectionSemanticKey(spell)) ?? "";
                      const level = getSpellLevel(spell);

                      return (
                        <button
                          key={spell.id}
                          className={`spellcasting-step__row${previewSpell?.id === spell.id ? " spellcasting-step__row--preview" : ""}${isSelected ? " spellcasting-step__row--selected" : ""}`}
                          type="button"
                          onClick={() => {
                            setPreviewIds((current) => ({
                              ...current,
                              [activeGroup.id]: spell.id,
                            }));
                            toggleSpell(spell.id);
                          }}
                        >
                          <div className="spellcasting-step__rowHeader">
                            <strong>{spell.name}</strong>
                            <span>{formatSpellLevel(level)}</span>
                          </div>
                          <div className="spellcasting-step__rowMeta">
                            <span>{getSpellSchool(spell)}</span>
                            <span>{spell.source}</span>
                          </div>
                          <div className="spellcasting-step__rowBadges">
                            {isSpellConcentration(spell) ? <span className="catalog-selector__impactChip">Concentration</span> : null}
                            {isSpellRitual(spell) ? <span className="catalog-selector__impactChip">Ritual</span> : null}
                            {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                            {duplicateOwner ? <span className="catalog-selector__impactChip">From {duplicateOwner}</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="catalog-selector__empty">
                  <p>No matching spells in {activeGroup.title}.</p>
                  {otherGroupMatches.length ? (
                    <div className="chip-grid">
                      {otherGroupMatches.map(({ group, count }) => (
                        <button
                          className="choice-chip"
                          key={group.id}
                          type="button"
                          onClick={() => {
                            setQueries((current) => ({
                              ...current,
                              [group.id]: queries[activeGroup.id] ?? "",
                            }));
                            setActiveGroupId(group.id);
                            setActivePane("list");
                          }}
                        >
                          Search {group.title} ({count})
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>Adjust filters or sync a source that includes this spell.</p>
                  )}
                </div>
              )}
            </div>

            <div className={`catalog-selector__detailPanel${activePane === "detail" ? " is-mobileActive" : ""}`}>
              <div className="catalog-selector__detailHeader">
                <span className="catalog-selector__detailLabel">{activeGroup.kind}</span>
                <h3 className="catalog-selector__detailTitle">
                  {previewSpell?.name ?? activeGroup.title}
                </h3>
                <p className="catalog-selector__detailMeta">
                  {previewSpell
                    ? `${formatSpellLevel(getSpellLevel(previewSpell))} • ${getSpellSchool(previewSpell)} • ${previewSpell.source}`
                    : activeGroup.description}
                </p>
              </div>

              {previewSpell ? (
                <>
                  <div className="catalog-selector__tagList">
                    <span className="catalog-selector__tag">{getSpellCastingTime(previewSpell)}</span>
                    <span className="catalog-selector__tag">{getSpellRange(previewSpell)}</span>
                    <span className="catalog-selector__tag">{getSpellDuration(previewSpell)}</span>
                    {getSpellComponents(previewSpell) ? (
                      <span className="catalog-selector__tag">{getSpellComponents(previewSpell)}</span>
                    ) : null}
                    {isSpellConcentration(previewSpell) ? (
                      <span className="catalog-selector__tag">Concentration</span>
                    ) : null}
                    {isSpellRitual(previewSpell) ? (
                      <span className="catalog-selector__tag">Ritual</span>
                    ) : null}
                  </div>

                  <section className="catalog-selector__detailSection">
                    <span className="catalog-selector__detailLabel">Selection summary</span>
                    <ul className="catalog-selector__impactList">
                      {activeGroup.kind === "granted" ? (
                        <li>Granted {activeGroup.grantedSpellIds.length} spell{activeGroup.grantedSpellIds.length === 1 ? "" : "s"}.</li>
                      ) : (
                        <li>
                          {activeGroup.kind === "prepared"
                            ? `Prepared ${selectedSpellIds.length} of ${activeGroup.maxSelections}`
                            : `Selected ${selectedSpellIds.length} of ${activeGroup.maxSelections}`}
                        </li>
                      )}
                      {activeGroup.spellcastingAbility ? (
                        <li>Spellcasting ability: {activeGroup.spellcastingAbility.toUpperCase()}</li>
                      ) : null}
                      {activeWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="catalog-selector__detailSection">
                    <span className="catalog-selector__detailLabel">Reference</span>
                    <div
                      className="catalog-selector__richText"
                      dangerouslySetInnerHTML={{ __html: getDetailMarkup({
                        id: previewSpell.id,
                        name: previewSpell.name,
                        description: previewSpell.description,
                        detailHtml: previewSpell.descriptionHtml,
                      }) }}
                    />
                  </section>
                </>
              ) : (
                <p className="catalog-selector__empty">
                  Choose a spell group entry to inspect its rules text here.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
