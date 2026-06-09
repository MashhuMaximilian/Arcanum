import type { ParsedAuroraElement } from "@/lib/content-sources/aurora";
import {
  ARCANUM_CONTENT_PACK_FORMAT,
  ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
  validateContentPack,
  type ArcanumContentEntry,
  type ArcanumContentPack,
  type ArcanumRulesetId,
} from "@/lib/content-packs/schema";

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function translateAuroraElementsToContentPack(input: {
  id: string;
  name: string;
  sourceUrl: string;
  elements: ParsedAuroraElement[];
  ruleset?: ArcanumRulesetId;
}): ArcanumContentPack {
  const namespace = `aurora:${slug(input.id || input.name)}`;
  const ids = new Map(
    input.elements.map((element) => [
      element.elementId,
      `${namespace}:${slug(element.elementType)}:${slug(element.elementId || element.name)}`,
    ]),
  );

  const entries: ArcanumContentEntry[] = input.elements.map((element) => ({
    id: ids.get(element.elementId) ?? `${namespace}:entry:${slug(element.name)}`,
    aliases: [element.elementId],
    type: element.elementType as ArcanumContentEntry["type"],
    name: element.name,
    source: element.sourceName ?? input.name,
    sourceUrl: element.sourceUrl || input.sourceUrl,
    supports: element.supports,
    description: element.descriptionText ?? "",
    descriptionHtml: element.descriptionHtml ?? undefined,
    prerequisite: element.prerequisite ?? undefined,
    requirements: element.requirements ?? undefined,
    rules: element.rules.map((rule) =>
      rule.kind === "grant"
        ? { ...rule, id: ids.get(rule.id) ?? rule.id }
        : {
            ...rule,
            choices: rule.kind === "select"
              ? rule.choices?.map((choice) => ({
                  ...choice,
                  id: ids.get(choice.id) ?? choice.id,
                }))
              : undefined,
          },
    ),
    setters: element.setters,
    sheet: element.sheet ?? undefined,
    multiclass: element.multiclass as ArcanumContentEntry["multiclass"],
    spellcasting: element.spellcasting as ArcanumContentEntry["spellcasting"],
    appendTargetId:
      element.elementType === "Append" &&
      typeof element.rawElement.appendTargetId === "string"
        ? ids.get(element.rawElement.appendTargetId) ?? element.rawElement.appendTargetId
        : undefined,
  }));

  return validateContentPack({
    format: ARCANUM_CONTENT_PACK_FORMAT,
    schemaVersion: ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
    id: `${namespace}:pack`,
    name: input.name,
    version: new Date().toISOString().slice(0, 10),
    ruleset: input.ruleset ?? "dnd5e-2014",
    language: "en",
    sourceUrl: input.sourceUrl,
    generatedAt: new Date().toISOString(),
    license: {
      name: "Source-defined",
      url: input.sourceUrl,
      attribution: `Imported from the user-configured Aurora source ${input.name}.`,
      redistributionAllowed: false,
    },
    entries,
  }).pack;
}
