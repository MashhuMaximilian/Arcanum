"use client";

import { useEffect, useMemo, useState } from "react";

import { sortTableRows, toggleTableSort, type TableSortState } from "@/components/table-sort";
import { useMobileDetailSheet } from "@/components/use-mobile-detail-sheet";

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  detailHtml?: string;
  meta?: string;
  origin?: "built-in" | "imported";
  source?: string;
  filterTags?: string[];
  detailTags?: string[];
  summaryLines?: string[];
  impactLines?: string[];
  mechanicsLines?: string[];
  requirementFailures?: string[];
  prerequisiteFailures?: string[];
  disabledReason?: string;
  unavailableReason?: string;
  featureDetails?: {
    name: string;
    description: string;
    detailHtml?: string;
    source?: string;
  }[];
};

function getCatalogItemFailures(item: CatalogItem) {
  return [
    ...(item.requirementFailures ?? []),
    ...(item.prerequisiteFailures ?? []),
    item.disabledReason ?? "",
    item.unavailableReason ?? "",
  ].filter(Boolean);
}

function getSourceFilterLabel(item: CatalogItem) {
  if (item.origin === "built-in") {
    return "SRD";
  }

  return item.source?.trim() || "Imported source";
}

type CatalogSelectorProps = {
  actionLabel?: string;
  defaultDetailView?: "overview" | "mechanics" | "features" | "reference";
  emptyMessage?: string;
  items: CatalogItem[];
  label: string;
  onAction?: (id: string) => void;
  onSelect: (id: string) => void;
  preferredTags?: string[];
  selectedId: string;
  tagSectionLabel?: string;
  tagLimit?: number;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeRichHtml(markup: string) {
  const normalizedMarkup = markup
    .replace(/<span[^>]*class=(["'])[^"']*\bfeature\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi, "<strong>$2</strong> ")
    .replace(/<span[^>]*class=(["'])[^"']*\bflavor\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi, "<em>$2</em>")
    .replace(/<span[^>]*class=(["'])[^"']*\btable-column\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi, "$2")
    .replace(/<br\s*\/?>\s*<strong>/gi, "<br /><strong>");

  const withoutDangerousBlocks = normalizedMarkup
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

export function formatPlainTextAsHtml(text: string) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([A-Z][A-Za-z'’()\/ -]{2,40}\.)(?=[A-Z][a-z])/g, "$1\n")
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

export function getDetailMarkup(item: CatalogItem | null) {
  if (!item) {
    return "";
  }

  if (item.detailHtml?.trim()) {
    return sanitizeRichHtml(item.detailHtml);
  }

  return formatPlainTextAsHtml(item.description);
}

function getDefaultDetailView(label: string) {
  if (label === "Race") {
    return "reference" as const;
  }

  if (label === "Subrace" || label === "Class" || label === "Subclass") {
    return "features" as const;
  }

  return "overview" as const;
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSearchMatch(queryTokens: string[], item: CatalogItem) {
  if (!queryTokens.length) {
    return 0;
  }

  const normalizedName = normalizeSearchValue(item.name);
  const normalizedMeta = normalizeSearchValue(item.meta ?? "");
  const normalizedSource = normalizeSearchValue(item.source ?? "");
  const normalizedSummary = normalizeSearchValue((item.summaryLines ?? []).join(" "));
  const normalizedImpact = normalizeSearchValue((item.impactLines ?? []).join(" "));
  const normalizedMechanics = normalizeSearchValue((item.mechanicsLines ?? []).join(" "));
  const normalizedDescription = normalizeSearchValue(item.description);
  const normalizedTags = (item.filterTags ?? []).map((tag) => normalizeSearchValue(tag));

  let score = 0;

  queryTokens.forEach((token) => {
    if (normalizedName === token) {
      score += 200;
    } else if (normalizedName.startsWith(token)) {
      score += 120;
    } else if (normalizedName.includes(token)) {
      score += 80;
    }

    if (normalizedMeta === token) {
      score += 70;
    } else if (normalizedMeta.startsWith(token)) {
      score += 50;
    } else if (normalizedMeta.includes(token)) {
      score += 35;
    }

    if (normalizedSummary.includes(token)) {
      score += 25;
    }

    if (normalizedImpact.includes(token)) {
      score += 15;
    }

    if (normalizedMechanics.includes(token)) {
      score += 12;
    }

    if (normalizedSource.includes(token)) {
      score += 8;
    }

    if (normalizedDescription.includes(token)) {
      score += 5;
    }

    if (normalizedTags.some((tag) => tag === token)) {
      score += 40;
    } else if (normalizedTags.some((tag) => tag.includes(token))) {
      score += 18;
    }
  });

  return score;
}

function moveSectionToTop(markup: string, headingMatcher: RegExp) {
  const headingPattern = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi;
  const matches = [...markup.matchAll(headingPattern)];
  if (!matches.length) {
    return markup;
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = match[0];
    if (!headingMatcher.test(heading)) {
      continue;
    }

    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? markup.length : markup.length;
    const section = markup.slice(start, end);
    return `${section}${markup.slice(0, start)}${markup.slice(end)}`;
  }

  return markup;
}

function getReferenceMarkup(item: CatalogItem | null, label: string) {
  const markup = getDetailMarkup(item);
  if (!markup) {
    return "";
  }

  if (label === "Race") {
    return moveSectionToTop(markup, />\s*[^<]*traits\s*</i);
  }

  if (label === "Class") {
    return moveSectionToTop(markup, />\s*[^<]*class features\s*</i);
  }

  return markup;
}

export function getPreviewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= 320) {
    return normalized;
  }

  const sentenceBreak = normalized.slice(0, 320).lastIndexOf(". ");
  if (sentenceBreak > 80) {
    return `${normalized.slice(0, sentenceBreak + 1)}…`;
  }

  return `${normalized.slice(0, 300).trimEnd()}…`;
}

export function CatalogSelector({
  actionLabel,
  defaultDetailView,
  emptyMessage = "No matching entries.",
  items,
  label,
  onAction,
  onSelect,
  preferredTags = [],
  selectedId,
  tagSectionLabel = "Filter by tags",
  tagLimit = 12,
}: CatalogSelectorProps) {
  const actionMode = typeof onAction === "function";
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "built-in" | "imported">("all");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [primaryTagFilter, setPrimaryTagFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showEligibleOnly, setShowEligibleOnly] = useState(true);
  const [previewId, setPreviewId] = useState(selectedId);
  const [detailView, setDetailView] = useState<"overview" | "mechanics" | "features" | "reference">(
    defaultDetailView ?? getDefaultDetailView(label),
  );
  const [activePane, setActivePane] = useState<"filters" | "list" | "detail">("list");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [showTableFilters, setShowTableFilters] = useState(false);
  const [tableSort, setTableSort] = useState<TableSortState<"name" | "source" | "summary" | "impact">>({
    key: "name",
    direction: "asc",
  });
  const isMobile = useMobileDetailSheet(
    activePane === "detail",
    () => setActivePane("list"),
  );

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();

    items.forEach((item) => {
      if (sourceFilter !== "all" && item.origin !== sourceFilter) {
        return;
      }

      item.filterTags?.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });

    const sorted = [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );
    const abilityTags = sorted
      .map(([tag]) => tag)
      .filter((tag) => /^[+-]\d+\s[A-Z]{3,}$/.test(tag));
    const prioritized = preferredTags.filter((tag) => counts.has(tag) && !abilityTags.includes(tag));
    const remaining = sorted
      .map(([tag]) => tag)
      .filter((tag) => !abilityTags.includes(tag) && !prioritized.includes(tag))
      .slice(0, Math.max(0, tagLimit - abilityTags.length - prioritized.length));

    return [...abilityTags, ...prioritized, ...remaining];
  }, [items, preferredTags, sourceFilter, tagLimit]);

  const primaryTagOptions = useMemo(
    () => preferredTags.filter((tag) => tagOptions.includes(tag)),
    [preferredTags, tagOptions],
  );

  const secondaryTagOptions = useMemo(
    () => tagOptions.filter((tag) => !primaryTagOptions.includes(tag)),
    [primaryTagOptions, tagOptions],
  );

  const sourceOptions = useMemo(() => {
    const counts = new Map<string, number>();

    items.forEach((item) => {
      if (sourceFilter !== "all" && item.origin !== sourceFilter) {
        return;
      }

      const label = getSourceFilterLabel(item);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([label]) => label);
  }, [items, sourceFilter]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);

    return items.filter((item) => {
      if (showEligibleOnly && getCatalogItemFailures(item).length) {
        return false;
      }

      if (sourceFilter !== "all" && item.origin !== sourceFilter) {
        return false;
      }

      const filterTags = item.filterTags ?? [];

      if (primaryTagFilter && !filterTags.includes(primaryTagFilter)) {
        return false;
      }

      if (tagFilter && !filterTags.includes(tagFilter)) {
        return false;
      }

      if (selectedSources.length) {
        const label = getSourceFilterLabel(item);
        if (!selectedSources.includes(label)) {
          return false;
        }
      }

      if (!queryTokens.length) {
        return true;
      }

      const haystack = normalizeSearchValue(
        [
          item.name,
          item.meta ?? "",
          item.source ?? "",
          ...filterTags,
          ...(item.summaryLines ?? []),
          ...(item.impactLines ?? []),
          ...(item.mechanicsLines ?? []),
          item.description,
        ].join(" "),
      );

      if (!haystack) {
        return false;
      }

      return queryTokens.every((token) => haystack.includes(token));
    });
  }, [items, primaryTagFilter, query, selectedSources, showEligibleOnly, sourceFilter, tagFilter]);

  const searchScores = useMemo(() => {
    const queryTokens = normalizeSearchValue(query).split(" ").filter(Boolean);
    if (!queryTokens.length) {
      return new Map<string, number>();
    }

    return new Map(
      filteredItems.map((item) => [item.id, scoreSearchMatch(queryTokens, item)] as const),
    );
  }, [filteredItems, query]);

  const sortedItems = useMemo(
    () =>
      sortTableRows(filteredItems, tableSort, (item, key) => {
        if (searchScores.size) {
          const relevance = searchScores.get(item.id) ?? 0;
          if (relevance > 0) {
            switch (key) {
              case "name":
                return 100000 - relevance;
              case "source":
              case "summary":
              case "impact":
                break;
              default:
                return 100000 - relevance;
            }
          }
        }

        switch (key) {
          case "source":
            return item.source ?? "";
          case "summary":
            return item.summaryLines?.[0] || item.meta || "";
          case "impact":
            return item.impactLines?.[0] || "";
          case "name":
          default:
            return item.name;
        }
      }),
    [filteredItems, searchScores, tableSort],
  );

  useEffect(() => {
    if (!tagFilter) {
      return;
    }

    if (!secondaryTagOptions.includes(tagFilter) && !primaryTagOptions.includes(tagFilter)) {
      setTagFilter(null);
    }
  }, [primaryTagOptions, secondaryTagOptions, tagFilter]);

  useEffect(() => {
    if (!primaryTagFilter) {
      return;
    }

    if (!primaryTagOptions.includes(primaryTagFilter)) {
      setPrimaryTagFilter(null);
    }
  }, [primaryTagFilter, primaryTagOptions]);

  useEffect(() => {
    if (!selectedSources.length) {
      return;
    }

    const allowed = new Set(sourceOptions);
    setSelectedSources((current) => current.filter((source) => allowed.has(source)));
  }, [selectedSources.length, sourceOptions]);

  const committedSelection =
    items.find((item) => item.id === selectedId) ?? null;

  const previewItem =
    sortedItems.find((item) => item.id === previewId) ??
    items.find((item) => item.id === previewId) ??
    sortedItems[0] ??
    committedSelection ??
    items[0] ??
    null;

  useEffect(() => {
    if (!items.length) {
      return;
    }

    if (!actionMode && selectedId && selectedId !== previewId) {
      setPreviewId(selectedId);
      return;
    }

    if (!previewItem && sortedItems[0]) {
      setPreviewId(sortedItems[0].id);
    }
  }, [actionMode, items, previewId, previewItem, selectedId, sortedItems]);

  const detailMarkup = useMemo(() => getDetailMarkup(previewItem), [previewItem]);
  const referenceMarkup = useMemo(() => getReferenceMarkup(previewItem, label), [label, previewItem]);

  useEffect(() => {
    setDetailView(defaultDetailView ?? getDefaultDetailView(label));
  }, [defaultDetailView, label, previewItem?.id]);

  const nonEligibilityFilters = [
    sourceFilter !== "all"
      ? sourceFilter === "built-in"
        ? "Built-in SRD"
        : "Imported sources"
      : "",
    primaryTagFilter ?? "",
    ...selectedSources,
    tagFilter ?? "",
    query ? `Search: ${query}` : "",
  ].filter(Boolean);
  const activeFilters = [
    showEligibleOnly ? "Eligible only" : "",
    ...nonEligibilityFilters,
  ].filter(Boolean);

  return (
    <div className="catalog-selector">
      <div className="catalog-selector__mobileToggles">
        {viewMode === "cards" ? (
          <button
            className={`choice-chip${activePane === "filters" ? " choice-chip--active" : ""}`}
            type="button"
            onClick={() => setActivePane("filters")}
          >
            Filters
          </button>
        ) : null}
        <button
          className={`choice-chip${activePane === "list" ? " choice-chip--active" : ""}`}
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
              <span className="builder-panel__label">{label}</span>
              <strong className="catalog-selector__count">
                {sortedItems.length} {sortedItems.length === 1 ? "entry" : "entries"}
              </strong>
            </div>

            <label className="catalog-selector__searchField">
              <span className="catalog-selector__sectionLabel">Search</span>
              <input
                className="input catalog-selector__search"
                placeholder={`Search ${label.toLowerCase()}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="catalog-selector__filterGroup">
              <span className="catalog-selector__sectionLabel">Source</span>
              <div className="catalog-selector__filters">
                <button
                  className={`choice-chip${sourceFilter === "all" ? " choice-chip--active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSourceFilter("all");
                    setPrimaryTagFilter(null);
                    setTagFilter(null);
                    setSelectedSources([]);
                  }}
                >
                  All
                </button>
                <button
                  className={`choice-chip${sourceFilter === "built-in" ? " choice-chip--active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSourceFilter("built-in");
                    setPrimaryTagFilter(null);
                    setTagFilter(null);
                    setSelectedSources([]);
                  }}
                >
                  Built-in
                </button>
                <button
                  className={`choice-chip${sourceFilter === "imported" ? " choice-chip--active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSourceFilter("imported");
                    setPrimaryTagFilter(null);
                    setTagFilter(null);
                    setSelectedSources([]);
                  }}
                >
                  Imported sources
                </button>
              </div>
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

            {sourceOptions.length > 1 ? (
              <div className="catalog-selector__filterGroup">
                <span className="catalog-selector__sectionLabel">Named sources</span>
                <div className="catalog-selector__filterTags">
                  {sourceOptions.slice(0, 12).map((source) => (
                    <button
                      key={source}
                      className={`catalog-selector__filterChip${selectedSources.includes(source) ? " catalog-selector__filterChip--active" : ""}`}
                      type="button"
                      onClick={() =>
                        setSelectedSources((current) =>
                          current.includes(source)
                            ? current.filter((entry) => entry !== source)
                            : [...current, source],
                        )
                      }
                    >
                      {source}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {primaryTagOptions.length ? (
              <div className="catalog-selector__filterGroup">
                <span className="catalog-selector__sectionLabel">{tagSectionLabel}</span>
                <div className="catalog-selector__filterTags">
                  {primaryTagOptions.map((tag, index) => (
                    <button
                      key={`${tag}-${index}`}
                      className={`catalog-selector__filterChip${primaryTagFilter === tag ? " catalog-selector__filterChip--active" : ""}`}
                      type="button"
                      onClick={() => setPrimaryTagFilter((current) => (current === tag ? null : tag))}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {secondaryTagOptions.length ? (
              <div className="catalog-selector__filterGroup">
                <span className="catalog-selector__sectionLabel">Extra filters</span>
                <div className="catalog-selector__filterTags">
                  {secondaryTagOptions.map((tag, index) => (
                    <button
                      key={`${tag}-${index}`}
                      className={`catalog-selector__filterChip${tagFilter === tag ? " catalog-selector__filterChip--active" : ""}`}
                      type="button"
                      onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {previewItem ? (
              <div className="catalog-selector__selectionSnapshot">
                <span className="catalog-selector__sectionLabel">Build impact</span>
                <strong className="catalog-selector__snapshotTitle">{previewItem.name}</strong>
                <p className="catalog-selector__snapshotMeta">
                  {previewItem.source ?? "Unknown source"}
                </p>
                {previewItem.impactLines?.length ? (
                  <ul className="catalog-selector__impactList">
                    {previewItem.impactLines.slice(0, 4).map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="catalog-selector__snapshotEmpty">
                    Select an option to inspect what it changes in your build.
                  </p>
                )}
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className={`catalog-selector__optionsPanel${activePane === "list" ? " is-mobileActive" : ""}${viewMode === "table" ? " catalog-selector__optionsPanel--table" : ""}`}>
          <div className="catalog-selector__optionsHeader">
            <div className="catalog-selector__headingBlock">
              <span className="catalog-selector__sectionLabel">Choose {label.toLowerCase()}</span>
            </div>
            <div className="catalog-selector__optionsActions">
              <div className="catalog-selector__viewMode">
                <button
                  className={`button button--secondary button--compact${viewMode === "cards" ? " ability-mode__tab--active" : ""}`}
                  type="button"
                  aria-pressed={viewMode === "cards"}
                  onClick={() => {
                    setViewMode("cards");
                    setActivePane("list");
                  }}
                >
                  <span className="catalog-selector__viewModeButton">
                    <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--workbench" aria-hidden="true" />
                    <span>Workbench</span>
                  </span>
                </button>
                <button
                  className={`button button--secondary button--compact${viewMode === "table" ? " ability-mode__tab--active" : ""}`}
                  type="button"
                  aria-pressed={viewMode === "table"}
                  onClick={() => {
                    setViewMode("table");
                    setActivePane("list");
                  }}
                >
                  <span className="catalog-selector__viewModeButton">
                    <span className="catalog-selector__viewModeGlyph catalog-selector__viewModeGlyph--table" aria-hidden="true" />
                    <span>Table</span>
                  </span>
                </button>
              </div>
              {nonEligibilityFilters.length || !showEligibleOnly ? (
                <button
                  className="button button--secondary button--compact"
                  type="button"
                  onClick={() => {
                    setPrimaryTagFilter(null);
                    setTagFilter(null);
                    setSourceFilter("all");
                    setSelectedSources([]);
                    setQuery("");
                    setShowEligibleOnly(true);
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          {viewMode === "table" ? (
              <div className="catalog-selector__tableToolbar">
                <div className="catalog-selector__tableToolbarPrimary">
                  <label className="catalog-selector__searchField catalog-selector__tableSearch">
                    <span className="catalog-selector__sectionLabel">Search</span>
                    <input
                      className="input catalog-selector__search"
                      placeholder={`Search ${label.toLowerCase()}`}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>

                  <div className="catalog-selector__tableToolbarControls">
                      <div className="catalog-selector__filterGroup">
                        <span className="catalog-selector__sectionLabel">Source</span>
                        <div className="catalog-selector__filters">
                        {(["all", "built-in", "imported"] as const).map((option) => (
                          <button
                            key={option}
                            className={`choice-chip${sourceFilter === option ? " choice-chip--active" : ""}`}
                            type="button"
                            onClick={() => {
                              setSourceFilter(option);
                              setPrimaryTagFilter(null);
                              setTagFilter(null);
                              setSelectedSources([]);
                            }}
                          >
                            {option === "all" ? "All" : option === "built-in" ? "Built-in" : "Imported sources"}
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
                            onClick={() => setShowEligibleOnly((current) => !current)}
                          >
                            Eligible only
                          </button>
                        </div>
                      </div>

                    {(sourceOptions.length > 1 || tagOptions.length) ? (
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
                              className={`catalog-selector__filterChip${selectedSources.includes(source) ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              onClick={() =>
                                setSelectedSources((current) =>
                                  current.includes(source)
                                    ? current.filter((entry) => entry !== source)
                                    : [...current, source],
                                )
                              }
                            >
                              {source}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {primaryTagOptions.length ? (
                      <div className="catalog-selector__filterGroup catalog-selector__tableTags">
                        <span className="catalog-selector__sectionLabel">{tagSectionLabel}</span>
                        <div className="catalog-selector__filterTags">
                          {primaryTagOptions.map((tag, index) => (
                            <button
                              key={`${tag}-${index}`}
                              className={`catalog-selector__filterChip${primaryTagFilter === tag ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              onClick={() => setPrimaryTagFilter((current) => (current === tag ? null : tag))}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {secondaryTagOptions.length ? (
                      <div className="catalog-selector__filterGroup catalog-selector__tableTags">
                        <span className="catalog-selector__sectionLabel">Extra filters</span>
                        <div className="catalog-selector__filterTags">
                          {secondaryTagOptions.map((tag, index) => (
                            <button
                              key={`${tag}-${index}`}
                              className={`catalog-selector__filterChip${tagFilter === tag ? " catalog-selector__filterChip--active" : ""}`}
                              type="button"
                              onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
          ) : null}

          {activeFilters.length ? (
            <div className="catalog-selector__appliedFilters">
              {activeFilters.map((filter, index) => (
                <span className="catalog-selector__filterChip catalog-selector__appliedFilter" key={`${filter}-${index}`}>
                  {filter}
                </span>
              ))}
            </div>
          ) : null}

          {viewMode === "cards" ? (
            <div className="catalog-selector__list" role="listbox" aria-label={label} key="cards">
              {sortedItems.length ? (
                sortedItems.map((item) => {
                  const isPreview = item.id === previewItem?.id;
                  const isSelected = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      className={`catalog-selector__row${
                        isPreview ? " catalog-selector__row--preview" : ""
                      }${isSelected ? " catalog-selector__row--selected" : ""}`}
                      type="button"
                      onClick={() => {
                        setPreviewId(item.id);
                        if (!actionMode && !isMobile) {
                          onSelect(item.id);
                        }
                        setActivePane("detail");
                      }}
                    >
                      <div className="catalog-selector__rowHeader">
                        <strong>{item.name}</strong>
                        {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                      </div>
                      {item.source ? <span className="catalog-selector__source">{item.source}</span> : null}
                      {item.summaryLines?.length ? (
                        <div className="catalog-selector__summaryList">
                          {item.summaryLines.slice(0, 3).map((line, index) => (
                            <span key={`${line}-${index}`}>{line}</span>
                          ))}
                        </div>
                      ) : null}
                      {item.impactLines?.length ? (
                        <div className="catalog-selector__rowImpact">
                          {item.impactLines.slice(0, 2).map((line, index) => (
                            <span className="catalog-selector__impactChip" key={`${line}-${index}`}>
                              {line}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <div className="catalog-selector__empty">{emptyMessage}</div>
              )}
            </div>
          ) : (
            <div className="catalog-selector__tableWrap" role="table" aria-label={`${label} table`} key="table">
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
                {sortedItems.length ? (
                  sortedItems.map((item) => {
                    const isPreview = item.id === previewItem?.id;
                    const isSelected = item.id === selectedId;

                    return (
                      <button
                        key={item.id}
                        className={`catalog-selector__tableRow${
                          isPreview ? " catalog-selector__tableRow--preview" : ""
                        }${isSelected ? " catalog-selector__tableRow--selected" : ""}`}
                        type="button"
                        onClick={() => {
                          setPreviewId(item.id);
                          if (!actionMode && !isMobile) {
                            onSelect(item.id);
                          }
                          setActivePane("detail");
                        }}
                      >
                        <span className="catalog-selector__tableCell catalog-selector__tableCell--name">
                          <strong>{item.name}</strong>
                          {isSelected ? <span className="catalog-selector__selectedBadge">Selected</span> : null}
                        </span>
                        <span className="catalog-selector__tableCell">{item.source ?? "—"}</span>
                        <span className="catalog-selector__tableCell">
                          {(item.summaryLines?.[0] || item.meta || "—").slice(0, 120)}
                        </span>
                        <span className="catalog-selector__tableCell">
                          {(item.impactLines?.slice(0, 2).join(" • ") || "—").slice(0, 140)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="catalog-selector__empty">{emptyMessage}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`catalog-selector__detailPanel${activePane === "detail" ? " is-mobileActive" : ""}`}>
          {previewItem ? (
            <>
              <button
                className="catalog-selector__mobileClose"
                type="button"
                aria-label="Close details"
                onClick={() => setActivePane("list")}
              >
                <span aria-hidden="true">×</span>
                Close details
              </button>
              <div className="catalog-selector__detailHeader">
                <span className="catalog-selector__detailLabel">
                  {previewItem.id === selectedId ? "Selected" : "Preview"}
                </span>
                <h3 className="catalog-selector__detailTitle">{previewItem.name}</h3>
                {previewItem.source ? (
                  <p className="catalog-selector__detailMeta">Source: {previewItem.source}</p>
                ) : null}
                {actionMode && actionLabel ? (
                  <div className="catalog-selector__detailActions">
                    <button
                      className="button button--primary button--compact"
                      type="button"
                      onClick={() => onAction?.(previewItem.id)}
                    >
                      {actionLabel}
                    </button>
                  </div>
                ) : null}
                {!actionMode ? (
                  <div className="catalog-selector__detailActions">
                    <button
                      className="button button--primary button--compact"
                      type="button"
                      disabled={previewItem.id === selectedId}
                      onClick={() => {
                        onSelect(previewItem.id);
                        setActivePane("list");
                      }}
                    >
                      {previewItem.id === selectedId ? "Selected" : `Choose ${label.toLowerCase()}`}
                    </button>
                  </div>
                ) : null}
              </div>

              {previewItem.detailTags?.length ? (
                <div className="catalog-selector__detailSection">
                  <span className="catalog-selector__sectionLabel">Key traits</span>
                  <div className="catalog-selector__tagList">
                    {previewItem.detailTags.slice(0, 8).map((tag, index) => (
                      <span className="catalog-selector__tag" key={`${tag}-${index}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="catalog-selector__detailTabs">
                {(["overview", "mechanics", "features", "reference"] as const).map((view) => (
                  <button
                    key={view}
                    className={`catalog-selector__detailTab${
                      detailView === view ? " catalog-selector__detailTab--active" : ""
                    }`}
                    type="button"
                    onClick={() => setDetailView(view)}
                  >
                    {view === "overview"
                      ? "Overview"
                      : view === "mechanics"
                        ? "Mechanics"
                        : view === "features"
                          ? "Features"
                          : "Reference"}
                  </button>
                ))}
              </div>

              {detailView === "overview" ? (
                <div className="catalog-selector__detailSection">
                  <span className="catalog-selector__sectionLabel">What this is</span>
                  <p className="catalog-selector__detailCopy">{getPreviewText(previewItem.description)}</p>
                  {previewItem.impactLines?.length ? (
                    <>
                      <span className="catalog-selector__sectionLabel">This changes your build</span>
                      <ul className="catalog-selector__impactList">
                        {previewItem.impactLines.map((line, index) => (
                          <li key={`${line}-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              {detailView === "mechanics" ? (
                <div className="catalog-selector__detailSection">
                  {previewItem.meta ? (
                    <>
                      <span className="catalog-selector__sectionLabel">Selection summary</span>
                      <p className="catalog-selector__detailMeta">{previewItem.meta}</p>
                    </>
                  ) : null}
                  {(previewItem.mechanicsLines?.length || previewItem.impactLines?.length) ? (
                    <>
                      <span className="catalog-selector__sectionLabel">Mechanical breakdown</span>
                      <ul className="catalog-selector__impactList">
                        {(previewItem.mechanicsLines ?? previewItem.impactLines ?? []).map((line, index) => (
                          <li key={`${line}-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              {detailView === "features" ? (
                <div className="catalog-selector__detailSection">
                  <span className="catalog-selector__sectionLabel">Feature details</span>
                  {previewItem.featureDetails?.length ? (
                    <div className="catalog-selector__featureList">
                      {previewItem.featureDetails.map((feature, index) => {
                        const featureMarkup = feature.detailHtml?.trim()
                          ? sanitizeRichHtml(feature.detailHtml)
                          : formatPlainTextAsHtml(feature.description);

                        return (
                          <article className="catalog-selector__featureCard" key={`${feature.name}-${index}`}>
                            <div className="catalog-selector__featureHeader">
                              <strong className="catalog-selector__featureTitle">{feature.name}</strong>
                              {feature.source ? (
                                <span className="catalog-selector__featureSource">{feature.source}</span>
                              ) : null}
                            </div>
                            {featureMarkup ? (
                              <div
                                className="catalog-selector__featureBody catalog-selector__richText"
                                dangerouslySetInnerHTML={{ __html: featureMarkup }}
                              />
                            ) : (
                              <p className="catalog-selector__detailMeta">No feature details available yet.</p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="catalog-selector__detailMeta">No feature details available yet.</p>
                  )}
                </div>
              ) : null}

              {detailView === "reference" ? (
                <div className="catalog-selector__detailSection">
                  <span className="catalog-selector__sectionLabel">Reference</span>
                  {referenceMarkup ? (
                    <div
                      className="catalog-selector__richText"
                      dangerouslySetInnerHTML={{ __html: referenceMarkup }}
                    />
                  ) : (
                    <p className="catalog-selector__detailMeta">{emptyMessage}</p>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p className="catalog-selector__detailMeta">{emptyMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
