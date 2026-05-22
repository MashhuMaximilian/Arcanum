"use client";

import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import { getBuiltInSrdFeatElements } from "@/lib/builtins/feats";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import type {
  BuiltInElement,
  BuiltInElementType,
  BuiltInRule,
  BuiltInSheet,
  BuiltInSetter,
} from "@/lib/builtins/types";
import {
  getBuiltInSrdBackgrounds,
  getBuiltInSrdBackgroundElements,
} from "@/lib/builtins/backgrounds";
import {
  getBuiltInSrdClasses,
  getBuiltInSrdClassElements,
} from "@/lib/builtins/classes";
import {
  getBuiltInSrdRaces,
  getBuiltInSrdRaceElements,
} from "@/lib/builtins/races";
import {
  getBuiltInSrdCompanions,
  getBuiltInSrdCompanionSubElements,
} from "@/lib/builtins/srd-companions";
import { listCachedElements } from "@/lib/content-sources/cache";
import { getSourcePrecedenceScore } from "@/lib/content-sources/source-precedence";
import type { ImportedElement } from "@/lib/content-sources/types";

const SUPPORTED_ELEMENT_TYPES = new Set<BuiltInElementType>([
  "Ability Score Improvement",
  "Background",
  "Background Feature",
  "Background Variant",
  "Class",
  "Class Feature",
  "Companion",
  "Companion Trait",
  "Companion Action",
  "Companion Reaction",
  "Feat",
  "Feat Feature",
  "Language",
  "Proficiency",
  "Spell",
  "Archetype",
  "Archetype Feature",
  "Race",
  "Sub Race",
  "Racial Trait",
  "Race Variant",
]);

function extractPrerequisiteText(element: ImportedElement) {
  const cleanPrerequisite = (value: string) =>
    value
      .replace(/\s+/g, " ")
      .replace(/\s+Once during a (?:short|long|short or long )?rest\b[\s\S]*$/i, "")
      .replace(
        /\s+(Once during|When you|While you|As an action|As a bonus action|You can|You gain|You learn|During combat)\b[\s\S]*$/i,
        "",
      )
      .replace(/\b(?:As part of|You can|You may|Once per|When you)\b[\s\S]*$/i, "")
      .replace(/[.,;:]\s*$/g, "")
      .trim();

  const rawPrerequisite =
    typeof element.raw_element?.prerequisite === "string"
      ? element.raw_element.prerequisite
      : typeof (element.raw_element as { prerequisite?: unknown } | null)?.prerequisite === "string"
        ? (element.raw_element as { prerequisite?: string }).prerequisite
        : undefined;

  if (rawPrerequisite?.trim()) {
    return cleanPrerequisite(rawPrerequisite);
  }

  if (element.description_html) {
    const inlineMatch = element.description_html.match(/<i>\s*Prerequisite:\s*([\s\S]*?)<\/i>/i);
    if (inlineMatch?.[1]) {
      return cleanPrerequisite(inlineMatch[1].replace(/<[^>]+>/g, " "));
    }
  }

  const descriptionText = element.description_text ?? "";
  const match = descriptionText.match(
    /Prerequisite:\s*(.+?)(?=(?:\r?\n)|(?:\s{2,})|(?:\bYou\b)|(?:\bYour\b)|(?:\.))/i,
  );
  return match?.[1] ? cleanPrerequisite(match[1]) : "";
}

function extractRequirementsText(element: ImportedElement) {
  const rawRequirements =
    typeof element.raw_element?.requirements === "string"
      ? element.raw_element.requirements
      : typeof (element.raw_element as { requirements?: unknown } | null)?.requirements === "string"
        ? (element.raw_element as { requirements?: string }).requirements
        : undefined;

  return rawRequirements?.trim() ?? "";
}

function toBuiltInRule(rule: unknown): BuiltInRule | null {
  if (!rule || typeof rule !== "object" || !("kind" in rule)) {
    return null;
  }

  const candidate = rule as Record<string, unknown>;

  if (candidate.kind === "grant" && typeof candidate.type === "string" && typeof candidate.id === "string") {
    return {
      kind: "grant",
      type: candidate.type,
      id: candidate.id,
      requirements: typeof candidate.requirements === "string" ? candidate.requirements : undefined,
      level: typeof candidate.level === "number" ? candidate.level : undefined,
      prepared: candidate.prepared === true,
      equipped: candidate.equipped === true,
      alt: typeof candidate.alt === "string" ? candidate.alt : undefined,
    };
  }

  if (candidate.kind === "select" && typeof candidate.type === "string" && typeof candidate.name === "string") {
    return {
      kind: "select",
      type: candidate.type,
      name: candidate.name,
      supports: typeof candidate.supports === "string" ? candidate.supports : undefined,
      choices: Array.isArray(candidate.choices)
        ? candidate.choices
            .filter(
              (choice): choice is { id: string; value: string } =>
                Boolean(choice) &&
                typeof choice === "object" &&
                "id" in choice &&
                "value" in choice &&
                typeof choice.id === "string" &&
                typeof choice.value === "string",
            )
            .map((choice) => ({ id: choice.id, value: choice.value }))
        : undefined,
      requirements: typeof candidate.requirements === "string" ? candidate.requirements : undefined,
      number: typeof candidate.number === "number" ? candidate.number : undefined,
      optional: candidate.optional === true,
      level: typeof candidate.level === "number" ? candidate.level : undefined,
      prepared: candidate.prepared === true,
      equipped: candidate.equipped === true,
      alt: typeof candidate.alt === "string" ? candidate.alt : undefined,
    };
  }

  if (candidate.kind === "stat" && typeof candidate.name === "string" && typeof candidate.value === "string") {
    return {
      kind: "stat",
      name: candidate.name,
      value: candidate.value,
      bonus: typeof candidate.bonus === "string" ? candidate.bonus : undefined,
      requirements: typeof candidate.requirements === "string" ? candidate.requirements : undefined,
      level: typeof candidate.level === "number" ? candidate.level : undefined,
      alt: typeof candidate.alt === "string" ? candidate.alt : undefined,
    };
  }

  return null;
}

function toBuiltInSetter(setter: unknown): BuiltInSetter | null {
  if (!setter || typeof setter !== "object") {
    return null;
  }

  const candidate = setter as Record<string, unknown>;

  if (typeof candidate.name !== "string" || typeof candidate.value !== "string") {
    return null;
  }

  return {
    name: candidate.name,
    value: candidate.value,
    type: typeof candidate.type === "string" ? candidate.type : undefined,
    modifier: typeof candidate.modifier === "string" ? candidate.modifier : undefined,
    alt: typeof candidate.alt === "string" ? candidate.alt : undefined,
  };
}

function extractImportedSheet(element: ImportedElement) {
  const directSheet = (element as ImportedElement & { sheet?: unknown }).sheet;
  if (directSheet !== undefined) {
    return directSheet;
  }

  return (element.raw_element as { sheet?: unknown } | null)?.sheet;
}

function toBuiltInSheet(value: unknown): BuiltInSheet | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  return {
    display: typeof candidate.display === "boolean" ? candidate.display : undefined,
    action: typeof candidate.action === "string" ? candidate.action : undefined,
    usage: typeof candidate.usage === "string" ? candidate.usage : undefined,
    alt: typeof candidate.alt === "string" ? candidate.alt : undefined,
    descriptions: Array.isArray(candidate.descriptions)
      ? candidate.descriptions.flatMap((description) => {
          if (!description || typeof description !== "object") {
            return [];
          }
          const entry = description as Record<string, unknown>;
          if (typeof entry.text !== "string") {
            return [];
          }
          return [{
            text: entry.text,
            html: typeof entry.html === "string" ? entry.html : undefined,
            level: typeof entry.level === "number" ? entry.level : undefined,
            usage: typeof entry.usage === "string" ? entry.usage : undefined,
            alt: typeof entry.alt === "string" ? entry.alt : undefined,
          }];
        })
      : [],
  };
}

function toBuiltInMulticlass(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  return {
    requirements:
      typeof candidate.requirements === "string" ? candidate.requirements : undefined,
    requirementsDescription:
      typeof candidate.requirementsDescription === "string"
        ? candidate.requirementsDescription
        : undefined,
    rules: Array.isArray(candidate.rules)
      ? candidate.rules.map((rule) => toBuiltInRule(rule)).filter((rule): rule is BuiltInRule => Boolean(rule))
      : undefined,
    setters: Array.isArray(candidate.setters)
      ? candidate.setters
          .map((setter) => toBuiltInSetter(setter))
          .filter((setter): setter is BuiltInSetter => Boolean(setter))
      : undefined,
  };
}

function toBuiltInSpellcasting(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  return {
    ability: typeof candidate.ability === "string" ? candidate.ability : undefined,
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    rules: Array.isArray(candidate.rules)
      ? candidate.rules.map((rule) => toBuiltInRule(rule)).filter((rule): rule is BuiltInRule => Boolean(rule))
      : undefined,
    setters: Array.isArray(candidate.setters)
      ? candidate.setters
          .map((setter) => toBuiltInSetter(setter))
          .filter((setter): setter is BuiltInSetter => Boolean(setter))
      : undefined,
  };
}

function toBuiltInElement(element: ImportedElement): BuiltInElement | null {
  if (!SUPPORTED_ELEMENT_TYPES.has(element.element_type as BuiltInElementType)) {
    return null;
  }

  return {
    id: element.element_id,
    type: element.element_type as BuiltInElementType,
    name: element.name,
    source: element.source_name ?? "Imported Source",
    source_url: element.source_url,
    catalogOrigin: "imported",
    supports: Array.isArray(element.supports)
      ? element.supports.filter((entry): entry is string => typeof entry === "string")
      : [],
    description: element.description_text ?? "",
    descriptionHtml: element.description_html ?? undefined,
    prerequisite: extractPrerequisiteText(element) || undefined,
    requirements: extractRequirementsText(element) || undefined,
    rules: Array.isArray(element.rules)
      ? element.rules.map((rule) => toBuiltInRule(rule)).filter((rule): rule is BuiltInRule => Boolean(rule))
      : [],
    setters: Array.isArray(element.setters)
      ? element.setters
          .map((setter) => toBuiltInSetter(setter))
          .filter((setter): setter is BuiltInSetter => Boolean(setter))
      : [],
    sheet: toBuiltInSheet(extractImportedSheet(element)),
    multiclass: toBuiltInMulticlass(element.multiclass),
    spellcasting: toBuiltInSpellcasting(element.spellcasting),
  };
}

function collectGrantedIds(rules: BuiltInRule[], grantType: string) {
  return rules.flatMap((rule) =>
    rule.kind === "grant" && rule.type === grantType ? [rule.id] : [],
  );
}

function isNarrativeBackstorySelect(rule: BuiltInRule) {
  if (rule.kind !== "select") {
    return false;
  }

  const normalized = rule.name.trim().toLowerCase();
  return (
    rule.type.trim().toLowerCase() === "list" ||
    normalized === "personality trait" ||
    normalized === "ideal" ||
    normalized === "bond" ||
    normalized === "flaw"
  );
}

function splitSupportTokens(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/\|\||\||,/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function resolveSelectableElements(elements: BuiltInElement[], rules: BuiltInRule[]) {
  return rules
    .filter(
      (rule): rule is Extract<BuiltInRule, { kind: "select" }> =>
        rule.kind === "select" &&
        (rule.type === "Racial Trait" || rule.type === "Ability Score Improvement"),
    )
    .map((rule) => {
      const tokens = splitSupportTokens(rule.supports);
      const options = elements.filter((element) => {
        if (element.type !== rule.type) {
          return false;
        }

        if (!tokens.length) {
          return false;
        }

        return tokens.some(
          (token) =>
            element.id === token ||
            element.name === token ||
            element.supports.includes(token),
        );
      });

      return {
        id: `${rule.type}:${rule.name}:${rule.supports ?? "default"}`,
        name: rule.name,
        number: rule.number ?? 1,
        optionType: rule.type as "Racial Trait" | "Ability Score Improvement",
        options,
      };
    })
    .filter((choice) => choice.options.length > 0);
}

function buildRaceRecords(elements: BuiltInElement[]): BuiltInRaceRecord[] {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const races = elements.filter((element) => element.type === "Race");

  const normalizeSupportToken = (value: string) =>
    value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  const supportsRaceBranch = (element: BuiltInElement, raceName: string) => {
    const normalizedRace = normalizeSupportToken(raceName);
    const normalizedVariant = `${normalizedRace} variant`;

    return element.supports.some((support) => {
      const normalizedSupport = normalizeSupportToken(support);
      return (
        normalizedSupport === normalizedRace ||
        normalizedSupport === normalizedVariant ||
        normalizedSupport.includes(normalizedRace)
      );
    });
  };

  return races.map((race) => {
    const subraces = elements.filter(
      (element) =>
        (element.type === "Sub Race" || element.type === "Race Variant") &&
        supportsRaceBranch(element, race.name),
    );

    const traitIds = new Set([
      ...collectGrantedIds(race.rules, "Racial Trait"),
      ...subraces.flatMap((subrace) => collectGrantedIds(subrace.rules, "Racial Trait")),
    ]);

    return {
      race,
      subraces,
      traits: [...traitIds]
        .map((id) => elementsById.get(id))
        .filter((element): element is BuiltInElement => Boolean(element)),
      ancestryChoices: resolveSelectableElements(elements, [
        ...race.rules,
        ...subraces.flatMap((subrace) => subrace.rules),
      ]),
    };
  });
}

function buildClassRecords(elements: BuiltInElement[]): BuiltInClassRecord[] {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const classes = elements.filter((element) => element.type === "Class");
  const archetypes = elements.filter((element) => element.type === "Archetype");

  return classes.map((characterClass) => {
    const featureUnlockLevels = new Map(
      characterClass.rules.flatMap((rule) =>
        rule.kind === "grant" && rule.type === "Class Feature"
          ? [[rule.id, rule.level]]
          : [],
      ),
    );
    const featureIds = new Set(collectGrantedIds(characterClass.rules, "Class Feature"));
    const features = [...featureIds]
      .map((id) => elementsById.get(id))
      .filter((element): element is BuiltInElement => Boolean(element));
    const subclassSteps = features.flatMap((feature) =>
      feature.rules
        .filter(
          (rule): rule is Extract<BuiltInRule, { kind: "select" }> =>
            rule.kind === "select" && rule.type === "Archetype",
        )
        .map((rule) => {
          const options = archetypes
            .filter((archetype) => (rule.supports ? archetype.supports.includes(rule.supports) : true))
            .map((archetype) => {
              const archetypeFeatureIds = collectGrantedIds(archetype.rules, "Archetype Feature");
              const archetypeFeatures = archetypeFeatureIds
                .map((id) => elementsById.get(id))
                .filter((element): element is BuiltInElement => Boolean(element));

              return {
                archetype,
                features: archetypeFeatures,
              };
            });

          return {
            feature,
            label: rule.name,
            level: rule.level ?? featureUnlockLevels.get(feature.id),
            timingLabel:
              rule.level ?? featureUnlockLevels.get(feature.id)
                ? `Subclass choice at level ${rule.level ?? featureUnlockLevels.get(feature.id)}`
                : "Subclass choice",
            supportsKey: rule.supports,
            options,
          };
        }),
    );

    return {
      class: characterClass,
      features,
      spellcastingFeatures: features.filter((feature) => Boolean(feature.spellcasting)),
      subclassSteps,
    };
  });
}

function buildBackgroundRecords(elements: BuiltInElement[]): BuiltInBackgroundRecord[] {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const backgrounds = elements.filter((element) => element.type === "Background");

  return backgrounds.map((background) => {
    const featureIds = new Set(collectGrantedIds(background.rules, "Background Feature"));
    const features = [...featureIds]
      .map((id) => elementsById.get(id))
      .filter((element): element is BuiltInElement => Boolean(element));

    return {
      background,
      features,
      choiceCount: background.rules.filter((rule) => rule.kind === "select" && !isNarrativeBackstorySelect(rule)).length,
    };
  });
}

function dedupeElements(elements: BuiltInElement[]) {
  const byId = new Map<string, BuiltInElement>();
  elements.forEach((element) => {
    const existing = byId.get(element.id);

    if (!existing) {
      byId.set(element.id, element);
      return;
    }

    const existingScore = getSourcePrecedenceScore(existing);
    const candidateScore = getSourcePrecedenceScore(element);

    if (candidateScore < existingScore) {
      return;
    }

    if (candidateScore === existingScore) {
      if (existing.catalogOrigin === "built-in" && element.catalogOrigin !== "built-in") {
        return;
      }

      if (
        existing.name.localeCompare(element.name) < 0 ||
        existing.source.localeCompare(element.source) < 0
      ) {
        return;
      }
    }

    byId.set(element.id, element);
  });
  return [...byId.values()];
}

export async function resolveBuilderCatalogs(initialSpellElements: BuiltInElement[] = []) {
  const builtInRaceElements = [...getBuiltInSrdRaceElements()];
  const builtInClassElements = [...getBuiltInSrdClassElements()];
  const builtInBackgroundElements = [...getBuiltInSrdBackgroundElements()];
  const builtInFeatElements = [...getBuiltInSrdFeatElements()];
  const builtInSpellElements = [...initialSpellElements];
  const builtInCompanionElements = getBuiltInSrdCompanions();
  const builtInCompanionSubElements = getBuiltInSrdCompanionSubElements();
  const cachedImported = await listCachedElements();
  const importedElements = cachedImported
    .map((element) => toBuiltInElement(element))
    .filter((element): element is BuiltInElement => Boolean(element));

  const raceElements = dedupeElements([
    ...builtInRaceElements,
    ...importedElements.filter((element) =>
      ["Race", "Sub Race", "Racial Trait", "Race Variant"].includes(element.type),
    ),
  ]);
  const classElements = dedupeElements([
    ...builtInClassElements,
    ...importedElements.filter((element) =>
      ["Class", "Class Feature", "Archetype", "Archetype Feature"].includes(element.type),
    ),
  ]);
  const backgroundElements = dedupeElements([
    ...builtInBackgroundElements,
    ...importedElements.filter((element) =>
      ["Background", "Background Feature", "Background Variant"].includes(element.type),
    ),
  ]);
  const companionElements = dedupeElements([
    ...builtInCompanionElements,
    ...builtInCompanionSubElements,
    ...importedElements.filter((element) =>
      ["Companion", "Companion Trait", "Companion Action", "Companion Reaction"].includes(element.type),
    ),
  ]);
  const featElements = dedupeElements([
    ...builtInFeatElements,
    ...importedElements.filter((element) => ["Feat"].includes(element.type)),
  ]);
  const spellElements = dedupeElements([
    ...builtInSpellElements,
    ...importedElements.filter((element) => ["Spell"].includes(element.type)),
  ]);
  const progressionElements = dedupeElements([
    ...raceElements.filter((element) =>
      ["Race", "Sub Race", "Racial Trait", "Race Variant", "Ability Score Improvement", "Language", "Proficiency"].includes(
        element.type,
      ),
    ),
    ...classElements.filter((element) =>
      [
        "Class Feature",
        "Archetype Feature",
        "Companion",
        "Companion Trait",
        "Companion Action",
        "Companion Reaction",
        "Language",
        "Proficiency",
      ].includes(element.type),
    ),
    ...companionElements,
    ...backgroundElements.filter((element) =>
      ["Background Feature", "Background Variant", "Language", "Proficiency"].includes(element.type),
    ),
    ...featElements.filter((element) =>
      ["Feat", "Feat Feature", "Ability Score Improvement"].includes(element.type),
    ),
    ...spellElements,
  ]);

  return {
    races: buildRaceRecords(raceElements),
    classes: buildClassRecords(classElements),
    backgrounds: buildBackgroundRecords(backgroundElements),
    feats: featElements,
    progressionElements,
    spells: spellElements,
  };
}
