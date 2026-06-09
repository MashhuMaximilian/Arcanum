import type {
  BuiltInElementType,
  BuiltInMulticlass,
  BuiltInRule,
  BuiltInSheet,
  BuiltInSpellcasting,
  BuiltInSetter,
} from "@/lib/builtins/types";

export const ARCANUM_CONTENT_PACK_FORMAT = "arcanum.content-pack";
export const ARCANUM_CONTENT_PACK_SCHEMA_VERSION = 1;

export type ArcanumRulesetId = "dnd5e-2014" | "dnd5e-2024" | (string & {});

export type ArcanumContentLicense = {
  name: string;
  url: string;
  attribution: string;
  redistributionAllowed: boolean;
};

export type ArcanumContentEntry = {
  id: string;
  aliases?: string[];
  type: BuiltInElementType | "Append";
  name: string;
  source: string;
  sourceUrl: string;
  supports: string[];
  description: string;
  descriptionHtml?: string;
  prerequisite?: string;
  requirements?: string;
  rules: BuiltInRule[];
  setters: BuiltInSetter[];
  sheet?: BuiltInSheet;
  multiclass?: BuiltInMulticlass;
  spellcasting?: BuiltInSpellcasting;
  appendTargetId?: string;
};

export type ArcanumContentPack = {
  format: typeof ARCANUM_CONTENT_PACK_FORMAT;
  schemaVersion: typeof ARCANUM_CONTENT_PACK_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  ruleset: ArcanumRulesetId;
  language: string;
  sourceUrl?: string;
  generatedAt?: string;
  license: ArcanumContentLicense;
  entries: ArcanumContentEntry[];
};

export type ContentPackValidation = {
  pack: ArcanumContentPack;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Content pack field "${field}" must be a non-empty string.`);
  }
  return value.trim();
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function normalizeEntry(value: unknown, index: number): ArcanumContentEntry {
  if (!isRecord(value)) {
    throw new Error(`Content pack entry ${index + 1} is not an object.`);
  }

  return {
    id: readString(value.id, `entries[${index}].id`),
    aliases: readStringArray(value.aliases),
    type: readString(value.type, `entries[${index}].type`) as ArcanumContentEntry["type"],
    name: readString(value.name, `entries[${index}].name`),
    source: readString(value.source, `entries[${index}].source`),
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : "",
    supports: readStringArray(value.supports),
    description: typeof value.description === "string" ? value.description : "",
    descriptionHtml: typeof value.descriptionHtml === "string" ? value.descriptionHtml : undefined,
    prerequisite: typeof value.prerequisite === "string" ? value.prerequisite : undefined,
    requirements: typeof value.requirements === "string" ? value.requirements : undefined,
    rules: Array.isArray(value.rules) ? value.rules as BuiltInRule[] : [],
    setters: Array.isArray(value.setters) ? value.setters as BuiltInSetter[] : [],
    sheet: isRecord(value.sheet) ? value.sheet as BuiltInSheet : undefined,
    multiclass: isRecord(value.multiclass) ? value.multiclass as BuiltInMulticlass : undefined,
    spellcasting: isRecord(value.spellcasting) ? value.spellcasting as BuiltInSpellcasting : undefined,
    appendTargetId: typeof value.appendTargetId === "string" ? value.appendTargetId : undefined,
  };
}

export function validateContentPack(value: unknown): ContentPackValidation {
  if (!isRecord(value) || value.format !== ARCANUM_CONTENT_PACK_FORMAT) {
    throw new Error("This file is not an Arcanum content pack.");
  }
  if (Number(value.schemaVersion) > ARCANUM_CONTENT_PACK_SCHEMA_VERSION) {
    throw new Error("This content pack requires a newer version of Arcanum.");
  }
  if (!isRecord(value.license)) {
    throw new Error("Content packs must declare their license and attribution.");
  }

  const pack: ArcanumContentPack = {
    format: ARCANUM_CONTENT_PACK_FORMAT,
    schemaVersion: ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
    id: readString(value.id, "id"),
    name: readString(value.name, "name"),
    version: readString(value.version, "version"),
    ruleset: readString(value.ruleset, "ruleset") as ArcanumRulesetId,
    language: typeof value.language === "string" ? value.language : "en",
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : undefined,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : undefined,
    license: {
      name: readString(value.license.name, "license.name"),
      url: readString(value.license.url, "license.url"),
      attribution: readString(value.license.attribution, "license.attribution"),
      redistributionAllowed: value.license.redistributionAllowed === true,
    },
    entries: Array.isArray(value.entries)
      ? value.entries.map((entry, index) => normalizeEntry(entry, index))
      : [],
  };

  const warnings: string[] = [];
  const ids = new Set<string>();
  pack.entries.forEach((entry) => {
    if (ids.has(entry.id)) {
      throw new Error(`Content pack contains duplicate entry ID "${entry.id}".`);
    }
    ids.add(entry.id);
    if (!entry.id.includes(":")) {
      warnings.push(`Entry "${entry.name}" should use a namespaced ID.`);
    }
  });

  pack.entries.forEach((entry) => {
    entry.rules.forEach((rule) => {
      if (rule.kind === "grant" && !ids.has(rule.id)) {
        warnings.push(`${entry.name} grants missing entry "${rule.id}".`);
      }
    });
  });

  return { pack, warnings: [...new Set(warnings)] };
}
