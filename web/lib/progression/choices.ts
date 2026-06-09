import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import type { BuiltInElement, BuiltInRule } from "@/lib/builtins/types";
import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import type { CharacterClassEntry } from "@/lib/characters/types";
import { getSourcePrecedenceScore } from "@/lib/content-sources/source-precedence";
import type { RequirementContext } from "@/lib/progression/requirements";
import { getRequirementFailures } from "@/lib/progression/requirements";
import { getSpellLevel } from "@/lib/progression/spellcasting";
import { getSelectionSemanticKey } from "@/lib/progression/selection-identity";

const SYNTHETIC_OPTION_SOURCE = "Core option registry";
const SYNTHETIC_OPTION_SOURCE_URL = "internal://option-registry";

export type ProgressionChoiceOption = {
  element: BuiltInElement;
  requirementFailures: string[];
};

export type ProgressionChoiceGroup = {
  id: string;
  classEntryIndex: number;
  ownerType: "class" | "subclass" | "race" | "background" | "feat" | "nested";
  ownerLabel: string;
  featureId: string;
  featureName: string;
  title: string;
  familyLabel: string;
  optionType: string;
  unlockLevel: number;
  exactSelections: number;
  optional: boolean;
  supportsKey?: string;
  description: string;
  options: ProgressionChoiceOption[];
};

type SelectedProgressionOptionEntry = {
  classEntryIndex: number;
  ownerLabel: string;
  element: BuiltInElement;
};

type ProficiencyLanguageSelectRule = Extract<BuiltInRule, { kind: "select" }> & {
  type: "Proficiency" | "Language";
};

function collectGrantedIdsAtLevel(rules: BuiltInRule[], type: string, level: number) {
  return rules.flatMap((rule) =>
    rule.kind === "grant" && rule.type === type && (!rule.level || rule.level <= level) ? [rule.id] : [],
  );
}

function collectGrantedIdsFromElements(elements: BuiltInElement[], type: string, level?: number) {
  return elements.flatMap((element) =>
    element.rules.flatMap((rule) =>
      rule.kind === "grant" &&
      rule.type === type &&
      (!level || !rule.level || rule.level <= level)
        ? [rule.id]
        : [],
    ),
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function humanizeGrantedId(value: string) {
  return value
    .replace(/^ID_[A-Z0-9_]+?_PROFICIENCY_/, "")
    .replace(/^ID_PROFICIENCY_/, "")
    .replace(/^ID_LANGUAGE_/, "")
    .replace(/^ID_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectAllGrantedIdsFromElements(elements: BuiltInElement[], level?: number) {
  return elements.flatMap((element) =>
    element.rules.flatMap((rule) =>
      rule.kind === "grant" && (!level || !rule.level || rule.level <= level) ? [rule.id] : [],
    ),
  );
}

function collectAllNestedGrantedIdsFromElements(
  elements: BuiltInElement[],
  optionPool: Map<string, BuiltInElement>,
  level?: number,
) {
  const visited = new Set<string>();
  const queue = collectAllGrantedIdsFromElements(elements, level);
  const collected: string[] = [];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    collected.push(currentId);

    const grantedElement = optionPool.get(currentId);
    if (grantedElement) {
      queue.push(...collectAllGrantedIdsFromElements([grantedElement], level));
    }
  }

  return collected;
}

function extendContextWithGrantedElements(
  context: RequirementContext,
  elements: BuiltInElement[],
  optionPool: Map<string, BuiltInElement>,
  level?: number,
): RequirementContext {
  const allGrantIds = collectAllNestedGrantedIdsFromElements(elements, optionPool, level);
  const allGrantElements = allGrantIds
    .map((id) => optionPool.get(id))
    .filter((element): element is BuiltInElement => Boolean(element));
  const grantSurface = [...elements, ...allGrantElements];
  const grantedFeatureIds = [
    ...collectGrantedIdsFromElements(grantSurface, "Class Feature", level),
    ...collectGrantedIdsFromElements(grantSurface, "Archetype Feature", level),
    ...collectGrantedIdsFromElements(grantSurface, "Racial Trait", level),
    ...collectGrantedIdsFromElements(grantSurface, "Background Feature", level),
    ...collectGrantedIdsFromElements(grantSurface, "Feat Feature", level),
    ...collectGrantedIdsFromElements(grantSurface, "Grants", level),
    ...allGrantIds,
  ];
  const grantedFeatureNames = grantedFeatureIds.map((id) => optionPool.get(id)?.name ?? humanizeGrantedId(id));
  const grantedProficiencyIds = collectGrantedIdsFromElements(grantSurface, "Proficiency", level);
  const grantedLanguageIds = collectGrantedIdsFromElements(grantSurface, "Language", level);
  const grantedSpellIds = collectGrantedIdsFromElements(grantSurface, "Spell", level);

  return {
    ...context,
    selectedFeatureIds: uniqueStrings([
      ...context.selectedFeatureIds,
      ...elements.map((element) => element.id),
      ...grantedFeatureIds,
    ]),
    selectedFeatureNames: uniqueStrings([
      ...context.selectedFeatureNames,
      ...elements.map((element) => element.name),
      ...grantedFeatureNames,
    ]),
    selectedSizeIds: uniqueStrings([
      ...context.selectedSizeIds,
      ...collectGrantedIdsFromElements(elements, "Size", level),
    ]),
    selectedProficiencyIds: uniqueStrings([
      ...context.selectedProficiencyIds,
      ...elements.flatMap((element) => (element.type === "Proficiency" ? [element.id] : [])),
      ...grantedProficiencyIds,
    ]),
    selectedProficiencyNames: uniqueStrings([
      ...context.selectedProficiencyNames,
      ...elements.flatMap((element) => (element.type === "Proficiency" ? [element.name] : [])),
      ...grantedProficiencyIds.map((id) => optionPool.get(id)?.name ?? humanizeGrantedId(id)),
    ]),
    selectedLanguageIds: uniqueStrings([
      ...context.selectedLanguageIds,
      ...elements.flatMap((element) => (element.type === "Language" ? [element.id] : [])),
      ...grantedLanguageIds,
    ]),
    selectedLanguageNames: uniqueStrings([
      ...context.selectedLanguageNames,
      ...elements.flatMap((element) => (element.type === "Language" ? [element.name] : [])),
      ...grantedLanguageIds.map((id) => optionPool.get(id)?.name ?? humanizeGrantedId(id)),
    ]),
    selectedSpellIds: uniqueStrings([
      ...context.selectedSpellIds,
      ...elements.flatMap((element) => (element.type === "Spell" ? [element.id] : [])),
      ...grantedSpellIds,
    ]),
    selectedSpellNames: uniqueStrings([
      ...context.selectedSpellNames,
      ...elements.flatMap((element) => (element.type === "Spell" ? [element.name] : [])),
      ...grantedSpellIds.map((id) => optionPool.get(id)?.name ?? humanizeGrantedId(id)),
    ]),
  };
}

function resolveNestedOwnerFeatures(entry: SelectedProgressionOptionEntry, optionPool: Map<string, BuiltInElement>) {
  const nestedGrantTypes = [
    "Class Feature",
    "Archetype Feature",
    "Racial Trait",
    "Background Feature",
    "Feat Feature",
  ];

  const grantedFeatures = nestedGrantTypes.flatMap((type) =>
    collectGrantedIdsFromElements([entry.element], type)
      .map((id) => optionPool.get(id))
      .filter((element): element is BuiltInElement => Boolean(element)),
  );

  return [entry.element, ...grantedFeatures];
}

function resolveFeatureWithDirectGrants(element: BuiltInElement, optionPool: Map<string, BuiltInElement>) {
  return resolveNestedOwnerFeatures(
    {
      classEntryIndex: -1,
      ownerLabel: element.name,
      element,
    },
    optionPool,
  );
}

function isImprovementRule(rule: BuiltInRule) {
  if (rule.kind !== "select") {
    return false;
  }

  if (rule.type === "Ability Score Improvement") {
    return true;
  }

  const normalizedName = rule.name.toLowerCase();
  if (
    /ability score increase|ability score improvement/.test(normalizedName) &&
    (rule.type === "Racial Trait" || rule.type === "Ability Score Improvement")
  ) {
    return true;
  }

  return (
    rule.type === "Class Feature" &&
    (rule.supports?.includes("Improvement Option") ||
      normalizedName.includes("improvement option"))
  );
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function splitSupportTokens(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/\|\||&&|\||,/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function splitSupportClauses(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (depth === 0 && char === ",") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function splitSupportAlternatives(value: string) {
  const trimmed = value.trim().replace(/^\(|\)$/g, "");
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split("||")
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function humanizeIdToken(value: string) {
  return value
    .replace(/^ID_[A-Z0-9_]+?_PROFICIENCY_/, "")
    .replace(/^ID_PROFICIENCY_/, "")
    .replace(/^ID_LANGUAGE_/, "")
    .replace(/^ID_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bTools\b/g, "Tools")
    .replace(/\bCant\b/g, "Cant");
}

function humanizeClauseToken(token: string) {
  return token
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bCr\b/g, "CR");
}

function joinHumanizedAlternatives(values: string[]) {
  if (!values.length) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

function createSyntheticOptionElement(
  type: "Proficiency" | "Language",
  id: string,
  name: string,
  supports: string[],
): BuiltInElement {
  return {
    id,
    type,
    name,
    source: SYNTHETIC_OPTION_SOURCE,
    source_url: SYNTHETIC_OPTION_SOURCE_URL,
    catalogOrigin: "built-in" as const,
    supports,
    description: `${name} ${type.toLowerCase()} option.`,
    prerequisite: undefined,
    requirements: undefined,
    rules: [],
    setters: [],
  };
}

const SKILL_PROFICIENCY_OPTIONS = ([
  ["ID_PROFICIENCY_SKILL_ACROBATICS", "Acrobatics"],
  ["ID_PROFICIENCY_SKILL_ANIMAL_HANDLING", "Animal Handling"],
  ["ID_PROFICIENCY_SKILL_ANIMALHANDLING", "Animal Handling"],
  ["ID_PROFICIENCY_SKILL_ARCANA", "Arcana"],
  ["ID_PROFICIENCY_SKILL_ATHLETICS", "Athletics"],
  ["ID_PROFICIENCY_SKILL_DECEPTION", "Deception"],
  ["ID_PROFICIENCY_SKILL_HISTORY", "History"],
  ["ID_PROFICIENCY_SKILL_INSIGHT", "Insight"],
  ["ID_PROFICIENCY_SKILL_INTIMIDATION", "Intimidation"],
  ["ID_PROFICIENCY_SKILL_INVESTIGATION", "Investigation"],
  ["ID_PROFICIENCY_SKILL_MEDICINE", "Medicine"],
  ["ID_PROFICIENCY_SKILL_NATURE", "Nature"],
  ["ID_PROFICIENCY_SKILL_PERCEPTION", "Perception"],
  ["ID_PROFICIENCY_SKILL_PERFORMANCE", "Performance"],
  ["ID_PROFICIENCY_SKILL_PERSUASION", "Persuasion"],
  ["ID_PROFICIENCY_SKILL_RELIGION", "Religion"],
  ["ID_PROFICIENCY_SKILL_SLEIGHTOFHAND", "Sleight of Hand"],
  ["ID_PROFICIENCY_SKILL_STEALTH", "Stealth"],
  ["ID_PROFICIENCY_SKILL_SURVIVAL", "Survival"],
]) as const satisfies ReadonlyArray<readonly [string, string]>;

const SKILL_PROFICIENCY_ELEMENTS = SKILL_PROFICIENCY_OPTIONS.map(([id, name]) =>
  createSyntheticOptionElement("Proficiency", id, name, ["Skill"]),
);

const ARTISAN_TOOL_OPTIONS = ([
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_ALCHEMISTS_SUPPLIES", "Alchemist's Supplies"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_BREWERS_SUPPLIES", "Brewer's Supplies"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_CALLIGRAPHERS_SUPPLIES", "Calligrapher's Supplies"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_CARPENTERS_TOOLS", "Carpenter's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_CARTOGRAPHERS_TOOLS", "Cartographer's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_COBBLERS_TOOLS", "Cobbler's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_COOKS_UTENSILS", "Cook's Utensils"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_GLASSBLOWERS_TOOLS", "Glassblower's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_JEWELERS_TOOLS", "Jeweler's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_LEATHERWORKERS_TOOLS", "Leatherworker's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_MASONS_TOOLS", "Mason's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_PAINTERS_SUPPLIES", "Painter's Supplies"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_POTTERS_TOOLS", "Potter's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_SMITHS_TOOLS", "Smith's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_TINKERS_TOOLS", "Tinker's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_WEAVERS_TOOLS", "Weaver's Tools"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_WOODCARVERS_TOOLS", "Woodcarver's Tools"],
]) as const satisfies ReadonlyArray<readonly [string, string]>;

const ARTISAN_TOOL_ELEMENTS = ARTISAN_TOOL_OPTIONS.map(([id, name]) =>
  createSyntheticOptionElement("Proficiency", id, name, ["Tool", "Artisan tools"]),
);

const TOOL_PROFICIENCY_OPTIONS = [
  ...ARTISAN_TOOL_ELEMENTS,
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_DISGUISE_KIT", "Disguise Kit", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_FORGERY_KIT", "Forgery Kit", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_HERBALISM_KIT", "Herbalism Kit", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_NAVIGATORS_TOOLS", "Navigator's Tools", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_POISONERS_KIT", "Poisoner's Kit", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_THIEVES_TOOLS", "Thieves' Tools", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_VEHICLES_LAND", "Land Vehicles", ["Tool"]),
  createSyntheticOptionElement("Proficiency", "ID_PROFICIENCY_TOOL_PROFICIENCY_VEHICLES_WATER", "Water Vehicles", ["Tool"]),
];

const MUSICAL_INSTRUMENT_OPTIONS = ([
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_BAGPIPES", "Bagpipes"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_DRUM", "Drum"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_DULCIMER", "Dulcimer"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_FLUTE", "Flute"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_LUTE", "Lute"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_LYRE", "Lyre"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_HORN", "Horn"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_PAN_FLUTE", "Pan Flute"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_SHAWM", "Shawm"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_VIOL", "Viol"],
]) as const satisfies ReadonlyArray<readonly [string, string]>;

const MUSICAL_INSTRUMENT_ELEMENTS = MUSICAL_INSTRUMENT_OPTIONS.map(([id, name]) =>
  createSyntheticOptionElement("Proficiency", id, name, ["Tool", "Musical Instrument"]),
);

const GAMING_SET_OPTIONS = ([
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_DICE_SET", "Dice Set"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_DRAGONCHESS_SET", "Dragonchess Set"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_PLAYING_CARD_SET", "Playing Card Set"],
  ["ID_PROFICIENCY_TOOL_PROFICIENCY_THREE_DRAGON_ANTE_SET", "Three-Dragon Ante Set"],
]) as const satisfies ReadonlyArray<readonly [string, string]>;

const GAMING_SET_ELEMENTS = GAMING_SET_OPTIONS.map(([id, name]) =>
  createSyntheticOptionElement("Proficiency", id, name, ["Tool", "Gaming Set"]),
);

const LANGUAGE_OPTIONS = ([
  ["ID_LANGUAGE_COMMON", "Common", ["Standard"]],
  ["ID_LANGUAGE_DWARVISH", "Dwarvish", ["Standard"]],
  ["ID_LANGUAGE_ELVISH", "Elvish", ["Standard"]],
  ["ID_LANGUAGE_GIANT", "Giant", ["Standard"]],
  ["ID_LANGUAGE_GNOMISH", "Gnomish", ["Standard"]],
  ["ID_LANGUAGE_GOBLIN", "Goblin", ["Standard"]],
  ["ID_LANGUAGE_HALFLING", "Halfling", ["Standard"]],
  ["ID_LANGUAGE_ORC", "Orc", ["Standard"]],
  ["ID_LANGUAGE_ABYSSAL", "Abyssal", ["Exotic"]],
  ["ID_LANGUAGE_CELESTIAL", "Celestial", ["Exotic"]],
  ["ID_LANGUAGE_DEEPSPEECH", "Deep Speech", ["Exotic"]],
  ["ID_LANGUAGE_DRACONIC", "Draconic", ["Exotic"]],
  ["ID_LANGUAGE_INFERNAL", "Infernal", ["Exotic"]],
  ["ID_LANGUAGE_PRIMORDIAL", "Primordial", ["Exotic"]],
  ["ID_LANGUAGE_SYLVAN", "Sylvan", ["Exotic"]],
  ["ID_LANGUAGE_UNDERCOMMON", "Undercommon", ["Exotic"]],
  ["ID_LANGUAGE_DRUIDIC", "Druidic", ["Secret"]],
  ["ID_LANGUAGE_THIEVES_CANT", "Thieves' Cant", ["Secret"]],
]) as const satisfies ReadonlyArray<readonly [string, string, readonly string[]]>;

const LANGUAGE_ELEMENTS = LANGUAGE_OPTIONS.map(([id, name, supports]) =>
  createSyntheticOptionElement("Language", id, name, ["Language", ...supports]),
);

const SYNTHETIC_OPTION_NAME_BY_ID = new Map<string, string>(
  [
    ...SKILL_PROFICIENCY_ELEMENTS,
    ...TOOL_PROFICIENCY_OPTIONS,
    ...MUSICAL_INSTRUMENT_ELEMENTS,
    ...GAMING_SET_ELEMENTS,
    ...LANGUAGE_ELEMENTS,
  ].map((element) => [element.id, element.name]),
);

const SYNTHETIC_PROFICIENCY_OPTIONS = [
  ...SKILL_PROFICIENCY_ELEMENTS,
  ...TOOL_PROFICIENCY_OPTIONS,
  ...MUSICAL_INSTRUMENT_ELEMENTS,
  ...GAMING_SET_ELEMENTS,
];

function collectExplicitIdTokens(value: string | undefined) {
  if (!value) {
    return [];
  }

  return [...value.matchAll(/ID_[A-Z0-9_]+/g)].map((match) => match[0]);
}

function resolveSyntheticProficiencyLanguageOptions(
  rule: ProficiencyLanguageSelectRule,
  allOptions: BuiltInElement[],
) {
  const explicitIds = new Set(collectExplicitIdTokens(rule.supports));
  const directExplicitMatches = allOptions.filter((element) => explicitIds.has(element.id));
  const syntheticPool = rule.type === "Language" ? LANGUAGE_ELEMENTS : SYNTHETIC_PROFICIENCY_OPTIONS;
  const syntheticExplicitMatches = syntheticPool.filter((element) => explicitIds.has(element.id));

  const familyTokens = splitSupportTokens(rule.supports);
  const hasCategoryToken = (needle: string) => familyTokens.some((token) => token.includes(needle));

  const syntheticCategoryMatches =
    rule.type === "Language"
      ? LANGUAGE_ELEMENTS.filter((element) => {
          if (!familyTokens.length) {
            return true;
          }

          return familyTokens.some((token) => {
            if (token === "standard" || token === "exotic" || token === "secret") {
              return element.supports.map((support) => normalizeToken(support)).includes(token);
            }

            return false;
          });
        })
      : SYNTHETIC_PROFICIENCY_OPTIONS.filter((element) => {
          if (!familyTokens.length) {
            return true;
          }

          const supportTokens = element.supports.map((support) => normalizeToken(support));
          return (
            (hasCategoryToken("skill") && supportTokens.includes("skill")) ||
            (hasCategoryToken("artisan tools") && supportTokens.includes("artisan tools")) ||
            (hasCategoryToken("musical instrument") && supportTokens.includes("musical instrument")) ||
            (hasCategoryToken("gaming set") && supportTokens.includes("gaming set")) ||
            (hasCategoryToken("tool") && supportTokens.includes("tool"))
          );
        });

  const syntheticChoiceMatches =
    rule.choices?.map((choice) =>
      createSyntheticOptionElement(
        rule.type,
        choice.id || `${rule.type}:${choice.value}`,
        choice.value,
        [rule.type],
      ),
    ) ?? [];

  return [
    ...new Map(
      [
        ...directExplicitMatches,
        ...syntheticExplicitMatches,
        ...syntheticCategoryMatches,
        ...syntheticChoiceMatches,
      ].map((element) => [element.id, element]),
    ).values(),
  ];
}

export function formatSupportLabel(value: string | undefined) {
  if (!value) {
    return "";
  }

  const explicitIds = collectExplicitIdTokens(value);
  if (explicitIds.length) {
    const labels = explicitIds.map((id) =>
      SYNTHETIC_OPTION_NAME_BY_ID.get(id) ??
      id
        .replace(/^ID_[A-Z0-9_]+?_PROFICIENCY_/, "")
        .replace(/^ID_PROFICIENCY_/, "")
        .replace(/^ID_LANGUAGE_/, "")
        .replace(/^ID_/, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .replace(/\bTools\b/g, "Tools")
        .replace(/\bCant\b/g, "Cant"),
    );

    return [...new Set(labels)].join(" or ");
  }

  const clauses = splitSupportClauses(value).filter(Boolean);
  if (clauses.length) {
    const humanized = clauses
      .map((clause) => {
        const alternatives = splitSupportAlternatives(clause);
        if (!alternatives.length) {
          return humanizeClauseToken(clause);
        }

        const readableAlternatives = alternatives.map(humanizeClauseToken);
        if (alternatives.every((token) => /^(?:\d+\/\d+|0)$/i.test(token))) {
          return `CR ${joinHumanizedAlternatives(readableAlternatives)}`;
        }

        return joinHumanizedAlternatives(readableAlternatives);
      })
      .filter(Boolean);

    if (humanized.length) {
      return humanized.join(" • ");
    }
  }

  return value
    .replace(/\$\(spellcasting:list\)/gi, "spell list")
    .replace(/\$\(spellcasting:slots\)/gi, "current spell slot level")
    .replace(/\|\|/g, " or ")
    .replace(/\|/g, " or ");
}

function hasSupportTokenOverlap(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
}

function buildElementTokenSet(element: BuiltInElement) {
  const setterTokens = element.setters.flatMap((setter) => {
    if (!["type", "size", "challenge"].includes(setter.name)) {
      return [];
    }

    return splitSupportTokens(setter.value);
  });

  return new Set(
    [
      normalizeToken(element.id),
      normalizeToken(element.name),
      ...element.supports.map((support) => normalizeToken(support)),
      ...element.supports.flatMap((support) => splitSupportTokens(support)),
      ...setterTokens,
    ].filter(Boolean),
  );
}

function resolveCompanionOptions(
  rule: Extract<BuiltInRule, { kind: "select" }>,
  allOptions: BuiltInElement[],
) {
  const explicitIds = new Set(collectExplicitIdTokens(rule.supports));
  const familyClauses = splitSupportClauses(rule.supports ?? "").filter(Boolean);

  const directExplicitMatches = allOptions.filter((element) => explicitIds.has(element.id));

  const companionMatches = allOptions.filter((element) => {
    if (explicitIds.has(element.id)) {
      return true;
    }

    if (!familyClauses.length) {
      return true;
    }

    const optionTokens = buildElementTokenSet(element);
    return familyClauses.every((clause) => {
      const alternatives = splitSupportAlternatives(clause);
      if (alternatives.length) {
        return alternatives.some((token) => optionTokens.has(token));
      }

      const normalizedClause = normalizeToken(clause);
      return optionTokens.has(normalizedClause);
    });
  });

  return [
    ...new Map([...directExplicitMatches, ...companionMatches].map((element) => [element.id, element])).values(),
  ];
}

function buildRuleFamilyTokens(
  feature: BuiltInElement,
  rule: Extract<BuiltInRule, { kind: "select" }>,
) {
  return [
    ...splitSupportTokens(rule.supports),
    ...splitSupportTokens(rule.name),
    normalizeToken(rule.name),
    normalizeToken(feature.name),
  ].filter(Boolean);
}

function isGenericSpellcastingRule(rule: Extract<BuiltInRule, { kind: "select" }>) {
  if (rule.type !== "Spell") {
    return false;
  }

  const normalizedName = normalizeToken(rule.name);
  const supportString = normalizeToken(rule.supports ?? "");
  return (
    normalizedName.includes("cantrip") ||
    normalizedName.includes("spellbook") ||
    supportString.includes("$(spellcasting:list)") ||
    supportString.includes("$(spellcasting:slots)") ||
    supportString.includes(",0") ||
    supportString.startsWith("0,")
  );
}

function isNarrativeBackstoryRule(rule: Extract<BuiltInRule, { kind: "select" }>) {
  const normalizedName = normalizeToken(rule.name);

  return (
    normalizeToken(rule.type) === "list" ||
    normalizedName === "personality trait" ||
    normalizedName === "ideal" ||
    normalizedName === "bond" ||
    normalizedName === "flaw"
  );
}

function isOptionalAlternateSpellcastingRule(rule: Extract<BuiltInRule, { kind: "select" }>) {
  const combined = `${rule.name} ${rule.supports ?? ""}`.toLowerCase();
  return combined.includes("alternate spellcasting ability");
}

function collectOptionPool(
  progressionElements: BuiltInElement[],
  feats: BuiltInElement[],
  spells: BuiltInElement[],
) {
  return [...progressionElements, ...feats, ...spells].reduce<Map<string, BuiltInElement>>(
    (map, element) => {
      if (!map.has(element.id)) {
        map.set(element.id, element);
      }
      return map;
    },
    new Map(),
  );
}

function getOptionPreferenceScore(
  element: BuiltInElement,
  explicitIds: Set<string>,
  familyTokens: string[],
) {
  let score = getSourcePrecedenceScore(element);
  const optionTokens = buildElementTokenSet(element);

  if (explicitIds.has(element.id)) {
    score += 1000;
  }

  const overlapCount = familyTokens.filter((token) => optionTokens.has(token)).length;
  score += overlapCount * 25;

  return score;
}

function dedupeResolvedOptions(
  options: BuiltInElement[],
  explicitIds: Set<string>,
  familyTokens: string[],
) {
  const groups = new Map<string, BuiltInElement[]>();

  options.forEach((element) => {
    const key = [
      normalizeToken(element.type),
      normalizeToken(element.name),
      normalizeToken(element.prerequisite ?? ""),
      normalizeToken(element.requirements ?? ""),
    ].join("|");

    const current = groups.get(key) ?? [];
    current.push(element);
    groups.set(key, current);
  });

  return [...groups.values()].map((group) =>
    [...group].sort(
      (left, right) =>
        getOptionPreferenceScore(right, explicitIds, familyTokens) -
          getOptionPreferenceScore(left, explicitIds, familyTokens) ||
        left.name.localeCompare(right.name) ||
        left.source.localeCompare(right.source) ||
        left.id.localeCompare(right.id),
    )[0],
  );
}

function resolveRuleOptions(
  feature: BuiltInElement,
  rule: Extract<BuiltInRule, { kind: "select" }>,
  optionPool: Map<string, BuiltInElement>,
  context: RequirementContext,
) {
  const allOptions = [...optionPool.values()].filter((element) => element.type === rule.type);
  const familyTokens = buildRuleFamilyTokens(feature, rule);
  const explicitIds = new Set(collectExplicitIdTokens(rule.supports));

  const byChoices = rule.choices?.length
    ? rule.choices
        .flatMap((choice) => {
          const byId = optionPool.get(choice.id);
          if (byId && byId.type === rule.type) {
            return [byId];
          }

          const byValue = allOptions.find(
            (element) =>
              normalizeToken(element.name) === normalizeToken(choice.value) ||
              normalizeToken(element.id) === normalizeToken(choice.id),
          );
          return byValue ? [byValue] : [];
        })
    : [];

  const directMatches = familyTokens.length
    ? allOptions.filter((element) => {
        const optionTokens = buildElementTokenSet(element);
        const matchesFamily = familyTokens.some((token) => optionTokens.has(token));

        if (!matchesFamily) {
          return false;
        }

        const isShellElement =
          element.id === feature.id ||
          normalizeToken(element.name) === normalizeToken(rule.name) ||
          normalizeToken(element.name) === normalizeToken(feature.name) ||
          element.rules.some(
            (childRule) =>
              childRule.kind === "select" &&
              childRule.type === rule.type &&
              (normalizeToken(childRule.name) === normalizeToken(rule.name) ||
                hasSupportTokenOverlap(buildRuleFamilyTokens(element, childRule), familyTokens)),
          );

        return !isShellElement;
      })
    : [];

  const deduped = [...new Map([...byChoices, ...directMatches].map((element) => [element.id, element])).values()];

  const registryMatches =
    rule.type === "Proficiency" || rule.type === "Language"
      ? resolveSyntheticProficiencyLanguageOptions(rule as ProficiencyLanguageSelectRule, allOptions)
      : rule.type === "Companion"
        ? resolveCompanionOptions(rule, allOptions)
        : [];

  const resolvedOptions = [
    ...new Map([...deduped, ...registryMatches].map((element) => [element.id, element])).values(),
  ];
  const canonicalOptions = dedupeResolvedOptions(resolvedOptions, explicitIds, familyTokens);

  return canonicalOptions.map((element) => ({
    element,
    requirementFailures: getRequirementFailures(element.requirements, element.prerequisite, context),
  }));
}

function buildGroupId(
  classEntryIndex: number,
  ownerType: "class" | "subclass" | "race" | "background" | "feat" | "nested",
  featureId: string,
  rule: Extract<BuiltInRule, { kind: "select" }>,
) {
  return [
    "progression",
    classEntryIndex,
    ownerType,
    featureId,
    rule.type,
    rule.name,
    rule.level ?? 0,
    rule.supports ?? "default",
  ].join(":");
}

function collectSelectableRules(feature: BuiltInElement, entryLevel: number) {
  return feature.rules.filter(
    (rule): rule is Extract<BuiltInRule, { kind: "select" }> =>
      rule.kind === "select" &&
      rule.type !== "Archetype" &&
      rule.type !== "Sub Race" &&
      rule.type !== "Race Variant" &&
      !isNarrativeBackstoryRule(rule) &&
      !isGenericSpellcastingRule(rule) &&
      !isImprovementRule(rule) &&
      (!rule.level || rule.level <= entryLevel),
  );
}

function buildGroupsFromFeatures(args: {
  classEntryIndex: number;
  ownerType: "class" | "subclass" | "race" | "background" | "feat" | "nested";
  ownerLabel: string;
  entryLevel: number;
  features: BuiltInElement[];
  optionPool: Map<string, BuiltInElement>;
  context: RequirementContext;
}) {
  const { classEntryIndex, ownerType, ownerLabel, entryLevel, features, optionPool, context } = args;
  const baseContextForOwner =
    classEntryIndex >= 0 && (ownerType === "class" || ownerType === "subclass" || ownerType === "nested")
      ? { ...context, ownerClassLevel: entryLevel }
      : context;
  const contextForOwner = extendContextWithGrantedElements(
    baseContextForOwner,
    features,
    optionPool,
    entryLevel,
  );

  return features.flatMap((feature) =>
    collectSelectableRules(feature, entryLevel)
      .filter((rule) => !rule.requirements || getRequirementFailures(rule.requirements, undefined, contextForOwner).length === 0)
      .map((rule) => {
        const options = resolveRuleOptions(feature, rule, optionPool, contextForOwner);
        const hasOptions = options.length > 0;
        const hasEligibleOptions = options.some((option) => option.requirementFailures.length === 0);
        const conditionalOnly = hasOptions && !hasEligibleOptions;

        return {
          id: buildGroupId(classEntryIndex, ownerType, feature.id, rule),
          classEntryIndex,
          ownerType,
          ownerLabel,
          featureId: feature.id,
          featureName: feature.name,
          title: rule.name,
          familyLabel: formatSupportLabel(rule.supports) || rule.type,
          optionType: rule.type,
          unlockLevel: rule.level ?? entryLevel,
          exactSelections: conditionalOnly ? 0 : Math.max(1, rule.number ?? 1),
          optional:
            conditionalOnly ||
            rule.optional === true ||
            isOptionalAlternateSpellcastingRule(rule),
          supportsKey: rule.supports,
          description: feature.description,
          options,
        } satisfies ProgressionChoiceGroup;
      }),
  );
}

function getSelectedProgressionOptionEntries(
  groups: ProgressionChoiceGroup[],
  selections: Record<string, string[]>,
) {
  return groups.flatMap((group) =>
    (selections[group.id] ?? []).flatMap((id) => {
      const option = group.options.find((candidate) => candidate.element.id === id);
      return option
        ? [
            {
              classEntryIndex: group.classEntryIndex,
              ownerLabel: group.ownerLabel,
              element: option.element,
            } satisfies SelectedProgressionOptionEntry,
          ]
        : [];
    }),
  );
}

export function getSelectedProgressionOptionElements(
  groups: ProgressionChoiceGroup[],
  selections: Record<string, string[]>,
) {
  return getSelectedProgressionOptionEntries(groups, selections).map((entry) => entry.element);
}

function extendRequirementContext(
  context: RequirementContext,
  selectedEntries: SelectedProgressionOptionEntry[],
  optionPool: Map<string, BuiltInElement>,
): RequirementContext {
  if (!selectedEntries.length) {
    return context;
  }

  const selectedElements = selectedEntries.map((entry) => entry.element);
  const nestedGrantIds = collectAllNestedGrantedIdsFromElements(selectedElements, optionPool);
  const nestedGrantElements = nestedGrantIds
    .map((id) => optionPool.get(id))
    .filter((element): element is BuiltInElement => Boolean(element));
  const grantSurface = [...selectedElements, ...nestedGrantElements];
  const grantedFeatureIds = [
    ...collectGrantedIdsFromElements(grantSurface, "Class Feature"),
    ...collectGrantedIdsFromElements(grantSurface, "Archetype Feature"),
    ...collectGrantedIdsFromElements(grantSurface, "Racial Trait"),
    ...collectGrantedIdsFromElements(grantSurface, "Background Feature"),
    ...collectGrantedIdsFromElements(grantSurface, "Feat Feature"),
    ...collectGrantedIdsFromElements(grantSurface, "Grants"),
    ...nestedGrantIds,
  ].filter(Boolean);
  const grantedFeatureNames = grantedFeatureIds
    .map((id) => optionPool.get(id)?.name ?? humanizeGrantedId(id))
    .filter((name): name is string => Boolean(name));

  return {
    ...context,
    selectedFeatureIds: [
      ...context.selectedFeatureIds,
      ...selectedEntries.map((entry) => entry.element.id),
      ...grantedFeatureIds,
    ],
    selectedFeatureNames: [
      ...context.selectedFeatureNames,
      ...selectedEntries.map((entry) => entry.element.name),
      ...grantedFeatureNames,
    ],
    selectedSizeIds: [
      ...context.selectedSizeIds,
      ...collectGrantedIdsFromElements(grantSurface, "Size"),
    ],
    selectedProficiencyIds: [
      ...context.selectedProficiencyIds,
      ...grantSurface.flatMap((element) =>
        element.type === "Proficiency" ? [element.id] : collectGrantedIdsFromElements([element], "Proficiency"),
      ),
    ],
    selectedProficiencyNames: [
      ...context.selectedProficiencyNames,
      ...grantSurface.flatMap((element) =>
        element.type === "Proficiency" ? [element.name] : [],
      ),
    ],
    selectedLanguageIds: [
      ...context.selectedLanguageIds,
      ...grantSurface.flatMap((element) =>
        element.type === "Language" ? [element.id] : collectGrantedIdsFromElements([element], "Language"),
      ),
    ],
    selectedLanguageNames: [
      ...context.selectedLanguageNames,
      ...grantSurface.flatMap((element) =>
        element.type === "Language" ? [element.name] : [],
      ),
    ],
    selectedSpellIds: [
      ...context.selectedSpellIds,
      ...grantSurface.flatMap((element) =>
        element.type === "Spell" ? [element.id] : collectGrantedIdsFromElements([element], "Spell"),
      ),
    ],
    selectedSpellNames: [
      ...context.selectedSpellNames,
      ...grantSurface.flatMap((element) => (element.type === "Spell" ? [element.name] : [])),
    ],
    selectedCantripIds: [
      ...context.selectedCantripIds,
      ...grantSurface.flatMap((element) =>
        element.type === "Spell" && getSpellLevel(element) === 0 ? [element.id] : [],
      ),
    ],
    selectedCantripNames: [
      ...context.selectedCantripNames,
      ...grantSurface.flatMap((element) =>
        element.type === "Spell" && getSpellLevel(element) === 0 ? [element.name] : [],
      ),
    ],
  };
}

export function deriveProgressionChoiceGroups(args: {
  activeClassRecords: Array<BuiltInClassRecord | null>;
  activeBackground: BuiltInBackgroundRecord | null;
  activeFeats: BuiltInElement[];
  activeManualFeatures: BuiltInElement[];
  activeRace: BuiltInRaceRecord | null;
  classEntries: CharacterClassEntry[];
  feats: BuiltInElement[];
  progressionElements: BuiltInElement[];
  selectedSubrace: BuiltInElement | null;
  selections: Record<string, string[]>;
  spells: BuiltInElement[];
  context: RequirementContext;
}) {
  const optionPool = collectOptionPool(args.progressionElements, args.feats, args.spells);

  const classGroups = args.activeClassRecords.flatMap((record, classEntryIndex) => {
    const entry = args.classEntries[classEntryIndex];
    if (!record || !entry?.classId) {
      return [];
    }

    const classFeatureIds = new Set(collectGrantedIdsAtLevel(record.class.rules, "Class Feature", entry.level));
    const unlockedClassFeatures = record.features.filter((feature) => classFeatureIds.has(feature.id));
    const selectedSubclass = record.subclassSteps
      .flatMap((step) => step.options)
      .find((option) => option.archetype.id === entry.subclassId);
    const subclassFeatureIds = new Set(
      selectedSubclass
        ? collectGrantedIdsAtLevel(selectedSubclass.archetype.rules, "Archetype Feature", entry.level)
        : [],
    );
    const unlockedSubclassFeatures =
      selectedSubclass?.features.filter((feature) => subclassFeatureIds.has(feature.id)) ?? [];

    return [
      ...buildGroupsFromFeatures({
        classEntryIndex,
        ownerType: "class",
        ownerLabel: record.class.name,
        entryLevel: entry.level,
        features: [record.class, ...unlockedClassFeatures],
        optionPool,
        context: args.context,
      }),
      ...buildGroupsFromFeatures({
        classEntryIndex,
        ownerType: "subclass",
        ownerLabel: selectedSubclass?.archetype.name ?? record.class.name,
        entryLevel: entry.level,
        features: selectedSubclass ? [selectedSubclass.archetype, ...unlockedSubclassFeatures] : unlockedSubclassFeatures,
        optionPool,
        context: args.context,
      }),
    ];
  });

  const raceGroups = args.activeRace
    ? (() => {
        const entryLevel = Math.max(args.context.totalLevel, 1);
        const relevantRaceTraitIds = new Set([
          ...collectGrantedIdsAtLevel(args.activeRace.race.rules, "Racial Trait", entryLevel),
          ...(args.selectedSubrace ? collectGrantedIdsAtLevel(args.selectedSubrace.rules, "Racial Trait", entryLevel) : []),
        ]);
        const relevantRaceTraits = args.activeRace.traits.filter((trait) => relevantRaceTraitIds.has(trait.id));

        return buildGroupsFromFeatures({
          classEntryIndex: -1,
          ownerType: "race",
          ownerLabel: args.activeRace.race.name,
          entryLevel,
          features: [
            args.activeRace.race,
            ...(args.selectedSubrace ? [args.selectedSubrace] : []),
            ...relevantRaceTraits,
          ],
          optionPool,
          context: args.context,
        });
      })()
    : [];

  const backgroundGroups = args.activeBackground
    ? buildGroupsFromFeatures({
        classEntryIndex: -1,
        ownerType: "background",
        ownerLabel: args.activeBackground.background.name,
        entryLevel: Math.max(args.context.totalLevel, 1),
        features: [args.activeBackground.background, ...args.activeBackground.features],
        optionPool,
        context: args.context,
      })
    : [];

  const featGroups = args.activeFeats.flatMap((feat) =>
    buildGroupsFromFeatures({
      classEntryIndex: -1,
      ownerType: "feat",
      ownerLabel: feat.name,
      entryLevel: Math.max(args.context.totalLevel, 1),
      features: resolveFeatureWithDirectGrants(feat, optionPool),
      optionPool,
      context: args.context,
    }),
  );

  const manualFeatureGroups = args.activeManualFeatures.flatMap((feature) =>
    buildGroupsFromFeatures({
      classEntryIndex: -1,
      ownerType: "nested",
      ownerLabel: "Manual / DM grant",
      entryLevel: Math.max(args.context.totalLevel, 1),
      features: resolveFeatureWithDirectGrants(feature, optionPool),
      optionPool,
      context: args.context,
    }),
  );

  const groups = [...raceGroups, ...backgroundGroups, ...featGroups, ...manualFeatureGroups, ...classGroups];
  const processedSelectedKeys = new Set<string>();
  let frontier = getSelectedProgressionOptionEntries(groups, args.selections);

  while (frontier.length) {
    const contextWithSelections = extendRequirementContext(args.context, frontier, optionPool);
    const nestedGroups = frontier.flatMap((entry) =>
      buildGroupsFromFeatures({
        classEntryIndex: entry.classEntryIndex,
        ownerType: "nested",
        ownerLabel: entry.ownerLabel,
        entryLevel:
          entry.classEntryIndex >= 0
            ? Math.max(args.classEntries[entry.classEntryIndex]?.level ?? 1, 1)
            : Math.max(args.context.totalLevel, 1),
        features: resolveNestedOwnerFeatures(entry, optionPool),
        optionPool,
        context: contextWithSelections,
      }),
    );

    const uniqueNestedGroups = nestedGroups.filter((group) => !groups.some((existing) => existing.id === group.id));
    if (!uniqueNestedGroups.length) {
      break;
    }

    groups.push(...uniqueNestedGroups);

    frontier = getSelectedProgressionOptionEntries(uniqueNestedGroups, args.selections).filter((entry) => {
      const key = `${entry.classEntryIndex}:${entry.element.id}`;
      if (processedSelectedKeys.has(key)) {
        return false;
      }

      processedSelectedKeys.add(key);
      return true;
    });
  }

  const finalContext = extendRequirementContext(
    args.context,
    getSelectedProgressionOptionEntries(groups, args.selections),
    optionPool,
  );

  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({
      ...option,
      requirementFailures: getRequirementFailures(
        option.element.requirements,
        option.element.prerequisite,
        group.classEntryIndex >= 0
          ? { ...finalContext, ownerClassLevel: args.classEntries[group.classEntryIndex]?.level }
          : finalContext,
      ),
    })),
  }));
}

export function getProgressionValidationMessages(
  groups: ProgressionChoiceGroup[],
  selections: Record<string, string[]>,
) {
  const selectedOwners = new Map<string, string[]>();
  groups.forEach((group) => {
    (selections[group.id] ?? []).forEach((id) => {
      const element = group.options.find((option) => option.element.id === id)?.element;
      if (!element) {
        return;
      }
      const key = getSelectionSemanticKey(element);
      selectedOwners.set(key, [...(selectedOwners.get(key) ?? []), group.title]);
    });
  });
  const duplicateMessages = [...selectedOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([key, owners]) => {
      const element = groups
        .flatMap((group) => group.options)
        .find((option) => getSelectionSemanticKey(option.element) === key)?.element;
      return `${element?.name ?? "Choice"} is selected more than once (${owners.join(", ")}).`;
    });

  return [
    ...duplicateMessages,
    ...groups.flatMap((group) => {
    const validOptionIds = new Set(
      group.options.filter((option) => option.requirementFailures.length === 0).map((option) => option.element.id),
    );
    const selectedIds = (selections[group.id] ?? []).filter((id) => validOptionIds.has(id));

    if (!group.options.length && !group.optional) {
      return [`${group.title} has no options available in the current catalog.`];
    }

    if (!group.optional && selectedIds.length !== group.exactSelections) {
      return [
        `${group.title} requires exactly ${group.exactSelections} selection${
          group.exactSelections === 1 ? "" : "s"
        }.`,
      ];
    }

    return [];
    }),
  ];
}
