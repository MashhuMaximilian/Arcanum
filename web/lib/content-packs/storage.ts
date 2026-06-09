"use client";

import {
  listCachedElements,
  listCachedSourceSummaries,
  removeCachedSourceData,
  replaceCachedSourceData,
} from "@/lib/content-sources/cache";
import type {
  CachedSourceSummary,
  ContentSource,
  ImportedElement,
} from "@/lib/content-sources/types";
import type { ArcanumContentPack } from "@/lib/content-packs/schema";
import {
  ARCANUM_CONTENT_PACK_FORMAT,
  ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
  validateContentPack,
} from "@/lib/content-packs/schema";

export type DeviceContentPackSummary = CachedSourceSummary & {
  ruleset: string;
  licenseName: string;
  attribution: string;
};

function packSourceId(packId: string) {
  return `pack:${packId}`;
}

function toImportedElement(
  pack: ArcanumContentPack,
  sourceId: string,
  entry: ArcanumContentPack["entries"][number],
): ImportedElement {
  const now = new Date().toISOString();
  return {
    id: `${sourceId}:${entry.id}`,
    source_id: sourceId,
    element_id: entry.id,
    element_type: entry.type,
    name: entry.name,
    source_name: entry.source,
    source_url: entry.sourceUrl || pack.sourceUrl || "",
    supports: entry.supports,
    setters: entry.setters,
    rules: entry.rules,
    description_html: entry.descriptionHtml ?? null,
    description_text: entry.description || null,
    multiclass: entry.multiclass as Record<string, unknown> | null ?? null,
    spellcasting: entry.spellcasting as Record<string, unknown> | null ?? null,
    raw_element: {
      aliases: entry.aliases ?? [],
      prerequisite: entry.prerequisite ?? "",
      requirements: entry.requirements ?? "",
      sheet: entry.sheet ?? null,
      appendTargetId: entry.appendTargetId ?? null,
      arcanumPack: {
        id: pack.id,
        version: pack.version,
        ruleset: pack.ruleset,
        licenseName: pack.license.name,
        attribution: pack.license.attribution,
      },
    },
    created_at: now,
    updated_at: now,
  };
}

export async function cacheContentPackOnDevice(pack: ArcanumContentPack) {
  const now = new Date().toISOString();
  const sourceId = packSourceId(pack.id);
  const source: ContentSource = {
    id: sourceId,
    name: pack.name,
    index_url: pack.sourceUrl ?? "",
    source_kind: `content-pack:${pack.ruleset}`,
    enabled: true,
    sync_status: "device-local",
    last_synced_at: pack.generatedAt ?? now,
    last_sync_error: null,
    created_at: now,
    updated_at: now,
  };

  await replaceCachedSourceData({
    source,
    files: [],
    elements: pack.entries.map((entry) => toImportedElement(pack, sourceId, entry)),
  });

  return {
    sourceId,
    elementCount: pack.entries.length,
  };
}

export async function listDeviceContentPacks(): Promise<DeviceContentPackSummary[]> {
  const [summaries, elements] = await Promise.all([
    listCachedSourceSummaries(),
    listCachedElements(),
  ]);

  return summaries
    .filter((summary) => summary.sourceKind.startsWith("content-pack:"))
    .map((summary) => {
      const sample = elements.find((element) => element.sourceId === summary.sourceId);
      const metadata = sample?.raw_element?.arcanumPack;
      const packMetadata =
        metadata && typeof metadata === "object"
          ? metadata as Record<string, unknown>
          : {};
      return {
        ...summary,
        ruleset:
          typeof packMetadata.ruleset === "string"
            ? packMetadata.ruleset
            : summary.sourceKind.replace("content-pack:", ""),
        licenseName:
          typeof packMetadata.licenseName === "string"
            ? packMetadata.licenseName
            : "User-provided",
        attribution:
          typeof packMetadata.attribution === "string"
            ? packMetadata.attribution
            : "",
      };
    });
}

export async function removeDeviceContentPack(sourceId: string) {
  if (!sourceId.startsWith("pack:")) {
    throw new Error("Only device-local content packs can be removed here.");
  }
  await removeCachedSourceData(sourceId);
}

export async function loadDeviceContentPack(sourceId: string) {
  const [summaries, elements] = await Promise.all([
    listDeviceContentPacks(),
    listCachedElements(),
  ]);
  const summary = summaries.find((entry) => entry.sourceId === sourceId);
  if (!summary) {
    throw new Error("That device content pack is no longer available.");
  }

  const entries = elements
    .filter((element) => element.sourceId === sourceId)
    .map((element) => ({
      id: element.element_id,
      aliases: Array.isArray(element.raw_element?.aliases)
        ? element.raw_element.aliases.filter((value): value is string => typeof value === "string")
        : [],
      type: element.element_type,
      name: element.name,
      source: element.source_name ?? summary.sourceName,
      sourceUrl: element.source_url,
      supports: Array.isArray(element.supports)
        ? element.supports.filter((value): value is string => typeof value === "string")
        : [],
      description: element.description_text ?? "",
      descriptionHtml: element.description_html ?? undefined,
      prerequisite:
        typeof element.raw_element?.prerequisite === "string"
          ? element.raw_element.prerequisite
          : undefined,
      requirements:
        typeof element.raw_element?.requirements === "string"
          ? element.raw_element.requirements
          : undefined,
      rules: element.rules,
      setters: element.setters,
      sheet:
        element.raw_element?.sheet && typeof element.raw_element.sheet === "object"
          ? element.raw_element.sheet
          : undefined,
      multiclass: element.multiclass ?? undefined,
      spellcasting: element.spellcasting ?? undefined,
      appendTargetId:
        typeof element.raw_element?.appendTargetId === "string"
          ? element.raw_element.appendTargetId
          : undefined,
    }));

  return validateContentPack({
    format: ARCANUM_CONTENT_PACK_FORMAT,
    schemaVersion: ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
    id: sourceId.replace(/^pack:/, ""),
    name: summary.sourceName,
    version: summary.sourceUpdatedAt || summary.cachedAt,
    ruleset: summary.ruleset,
    language: "en",
    sourceUrl: summary.indexUrl,
    generatedAt: summary.cachedAt,
    license: {
      name: summary.licenseName,
      url: summary.indexUrl || "about:blank",
      attribution: summary.attribution || "User-provided content.",
      redistributionAllowed: false,
    },
    entries,
  }).pack;
}

export function downloadContentPack(pack: ArcanumContentPack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.id.replace(/[^a-z0-9.-]+/gi, "-")}.arcanum-pack.json`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
