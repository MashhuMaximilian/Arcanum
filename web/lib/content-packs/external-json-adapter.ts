import {
  ARCANUM_CONTENT_PACK_FORMAT,
  ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
  validateContentPack,
  type ArcanumContentEntry,
  type ArcanumContentPack,
  type ArcanumRulesetId,
} from "@/lib/content-packs/schema";

type JsonRecord = Record<string, unknown>;

const COLLECTION_TYPES: Record<string, ArcanumContentEntry["type"]> = {
  spell: "Spell",
  feat: "Feat",
  race: "Race",
  species: "Race",
  subrace: "Sub Race",
  background: "Background",
  class: "Class",
  subclass: "Archetype",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean).join("\n");
  }
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.entry === "string") {
    return value.entry;
  }
  const heading = typeof value.name === "string" ? `${value.name}. ` : "";
  return `${heading}${text(value.entries ?? value.items ?? value.rows ?? "")}`.trim();
}

function spellSetters(entry: JsonRecord) {
  const components = isRecord(entry.components) ? entry.components : {};
  const duration = Array.isArray(entry.duration) ? entry.duration[0] : entry.duration;
  const time = Array.isArray(entry.time) ? entry.time[0] : entry.time;
  const range = isRecord(entry.range) ? entry.range : {};
  return [
    { name: "level", value: String(entry.level ?? 0) },
    { name: "school", value: String(entry.school ?? "Unknown") },
    { name: "time", value: text(time) || "—" },
    { name: "duration", value: text(duration) || "—" },
    { name: "range", value: text(range) || "—" },
    { name: "hasVerbalComponent", value: components.v === true ? "true" : "false" },
    { name: "hasSomaticComponent", value: components.s === true ? "true" : "false" },
    { name: "hasMaterialComponent", value: components.m ? "true" : "false" },
    { name: "materialComponent", value: text(components.m) },
    { name: "isRitual", value: isRecord(entry.meta) && entry.meta.ritual === true ? "true" : "false" },
    {
      name: "isConcentration",
      value: text(duration).toLowerCase().includes("concentration") ? "true" : "false",
    },
  ];
}

function sourceCode(entry: JsonRecord) {
  return typeof entry.source === "string" ? entry.source : "Imported JSON";
}

export function translateExternalJsonToContentPack(
  value: unknown,
  options: {
    id?: string;
    name?: string;
    ruleset?: ArcanumRulesetId;
    sourceUrl?: string;
  } = {},
): ArcanumContentPack {
  if (isRecord(value) && value.format === ARCANUM_CONTENT_PACK_FORMAT) {
    return validateContentPack(value).pack;
  }
  if (!isRecord(value)) {
    throw new Error("The selected JSON file does not contain a supported content collection.");
  }

  const namespace = `external:${slug(options.id || options.name || "content")}`;
  const entries = Object.entries(COLLECTION_TYPES).flatMap(([collection, type]) => {
    const rows = value[collection];
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.flatMap((candidate): ArcanumContentEntry[] => {
      if (!isRecord(candidate) || typeof candidate.name !== "string") {
        return [];
      }
      const source = sourceCode(candidate);
      const id = `${namespace}:${slug(type)}:${slug(source)}:${slug(candidate.name)}`;
      const supports = [
        ...(Array.isArray(candidate.classes)
          ? candidate.classes.map(text)
          : []),
        ...(isRecord(candidate.className) ? [text(candidate.className)] : []),
      ].filter(Boolean);

      return [{
        id,
        aliases: typeof candidate.id === "string" ? [candidate.id] : undefined,
        type,
        name: candidate.name,
        source,
        sourceUrl: options.sourceUrl ?? "",
        supports,
        description: text(candidate.entries ?? candidate.entry ?? candidate.description),
        prerequisite: text(candidate.prerequisite) || undefined,
        rules: [],
        setters: type === "Spell" ? spellSetters(candidate) : [],
      }];
    });
  });

  if (!entries.length) {
    throw new Error("No supported races, classes, backgrounds, feats, or spells were found.");
  }

  return validateContentPack({
    format: ARCANUM_CONTENT_PACK_FORMAT,
    schemaVersion: ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
    id: `${namespace}:pack`,
    name: options.name || "Imported JSON content",
    version: new Date().toISOString().slice(0, 10),
    ruleset: options.ruleset ?? "dnd5e-2014",
    language: "en",
    sourceUrl: options.sourceUrl,
    generatedAt: new Date().toISOString(),
    license: {
      name: "User-provided",
      url: options.sourceUrl || "about:blank",
      attribution: "User-provided content. Rights and attribution remain the importer’s responsibility.",
      redistributionAllowed: false,
    },
    entries,
  }).pack;
}
