import srd52Json from "@/lib/content-packs/generated/srd52.json";
import { validateContentPack, type ArcanumContentPack } from "@/lib/content-packs/schema";
import type { BuiltInElement } from "@/lib/builtins/types";

export const SRD_51_ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export const BUNDLED_CONTENT_SOURCES = [
  {
    id: "srd51",
    name: "SRD 5.1",
    ruleset: "dnd5e-2014",
    version: "5.1",
    description: "The built-in 2014 fifth-edition rules catalog.",
    licenseName: "CC BY 4.0",
    sourceUrl: "https://www.dndbeyond.com/resources/1781-systems-reference-document-srd",
    enabled: true,
  },
  {
    id: "srd52",
    name: "SRD 5.2.1",
    ruleset: "dnd5e-2024",
    version: "5.2.1",
    description: "The built-in 2024 fifth-edition rules catalog.",
    licenseName: "CC BY 4.0",
    sourceUrl: "https://www.dndbeyond.com/srd",
    enabled: true,
  },
] as const;

let cachedSrd52Pack: ArcanumContentPack | null = null;

export function getBundledSrd52Pack() {
  cachedSrd52Pack ??= validateContentPack(srd52Json).pack;
  return cachedSrd52Pack;
}

export function contentPackEntriesToBuiltInElements(pack: ArcanumContentPack): BuiltInElement[] {
  return pack.entries
    .filter((entry): entry is typeof entry & { type: BuiltInElement["type"] } => entry.type !== "Append")
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      source: entry.source,
      source_url: entry.sourceUrl || pack.sourceUrl || "",
      catalogOrigin: "built-in",
      supports: entry.supports,
      description: entry.description,
      descriptionHtml: entry.descriptionHtml,
      prerequisite: entry.prerequisite,
      requirements: entry.requirements,
      rules: entry.rules,
      setters: entry.setters,
      sheet: entry.sheet,
      multiclass: entry.multiclass,
      spellcasting: entry.spellcasting,
    }));
}

export function getBundledSrd52Elements() {
  return contentPackEntriesToBuiltInElements(getBundledSrd52Pack());
}
