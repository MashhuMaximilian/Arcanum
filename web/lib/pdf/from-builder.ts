import type {
  BuiltInElement,
  BuiltInRule,
} from "@/lib/builtins/types";
import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import { getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import type {
  AbilityKey,
  CharacterDraft,
  CharacterManualGrant,
} from "@/lib/characters/types";
import { ABILITY_KEYS, ABILITY_LABELS, getTotalCharacterLevel } from "@/lib/characters/types";
import { resolveInventoryArmorClass, resolveInventoryWeaponAttackRows } from "@/lib/equipment/inventory";
import { getImprovementBonuses } from "@/lib/progression/improvements";
import {
  deriveSpellcastingGroups,
  getSpellCastingTime,
  getSpellLevel,
  getSpellRange,
  getSpellSlotSummary,
  type SpellSelectionGroup,
} from "@/lib/progression/spellcasting";
import {
  buildProficiencyFacts,
  hasSavingThrowProficiency,
  hasSkillProficiency,
  type ProficiencyFact,
} from "@/lib/proficiencies/facts";
import { groupProficiencies } from "@/lib/proficiencies/group";

import {
  resolvePdfCharacter,
  getPassivePdfNoteTagsFromText,
  toPdfCardFromElement,
  toPdfCardFromGrant,
  toPdfCardFromInventoryItem,
  type PdfResolveSource,
  type ResolvedPdfCharacter,
} from "@/lib/pdf";
import type {
  PdfPage1SpellSummary,
  PdfSpellcastingSourceEntry,
  PdfSpellListEntry,
  PdfSpellSlots,
  PdfSpellSlotLevel,
} from "@/lib/pdf/types";

// Top-level display label constants — keep inline strings out of data-building logic
const LABEL_PROFICIENCY_BONUS = "Proficiency Bonus";
const LABEL_INITIATIVE = "Initiative";
const LABEL_ATTACKS_PER_ACTION = "Attacks / Action";
const LABEL_PASSIVE_PERCEPTION = "Passive Perception";
const LABEL_SPELLCASTING_BONUS = "Spellcasting Bonus";
const LABEL_SPELLCASTING_ABILITY = "Spellcasting Ability";
const LABEL_HP = "HP";
const LABEL_AC = "AC";
const LABEL_DEFENSES = "Defenses";
const LABEL_SPEED = "Speed";
const LABEL_HIT_DICE = "Hit Dice";
const LABEL_CLASS_RESOURCE = "Class Resource";

export type BuilderPdfSourceArgs = {
  abilities: Record<AbilityKey, number>;
  allSelectedFeatElements: BuiltInElement[];
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  manualGrantsByKind: Record<CharacterManualGrant["kind"], CharacterManualGrant[]>;
  selectedBackground: BuiltInBackgroundRecord | null;
  selectedBackgroundFeatureElements: BuiltInElement[];
  selectedClassFeatureElements: BuiltInElement[];
  selectedExpertiseIds?: string[];
  selectedExpertiseLabels: string[];
  selectedFeatElements: BuiltInElement[];
  selectedLanguageIds: string[];
  selectedLanguageNames: string[];
  selectedManualFeatureElements: BuiltInElement[];
  selectedProgressionElements: BuiltInElement[];
  selectedProficiencyIds: string[];
  selectedProficiencyNames: string[];
  selectedRace: BuiltInRaceRecord | null;
  selectedRacialTraitElements: BuiltInElement[];
  selectedSpellIds: string[];
  selectedSubrace: BuiltInElement | null;
  spellGroups: SpellSelectionGroup[];
  spells: BuiltInElement[];
  selectedElements: BuiltInElement[];
  equipmentProficiencies?: {
    armor: string[];
    weapons: string[];
  };
};

export type BuilderPdfDraftCatalogs = {
  backgrounds: BuiltInBackgroundRecord[];
  classes: BuiltInClassRecord[];
  feats: BuiltInElement[];
  progressionElements: BuiltInElement[];
  races: BuiltInRaceRecord[];
  spells: BuiltInElement[];
};

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function splitFreeTextList(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

const MUSICAL_INSTRUMENT_NAMES = new Set([
  "bagpipes",
  "drum",
  "dulcimer",
  "flute",
  "guitar",
  "harp",
  "horn",
  "lute",
  "lyre",
  "pan flute",
  "panflute",
  "shawm",
  "viol",
  "violin",
]);

const TOOL_LIKE_TEXT_RE = /\b(instrument|tool|set|kit|supplies|utensils|dice|cards|chess|dragonchess|three\s*dragon|artisan)\b/i;
const NON_TOOL_EQUIPMENT_RE = /\b(weapon|armor|armour|shield|vehicle|pack|clothing|clothes|book|treasure|pouch|focus|symbol|ammo|ammunition|consumable)\b/i;

function isToolLikeValue(rawValue: string, label = normalizeLabel(rawValue)) {
  const raw = rawValue.toLowerCase().replace(/[-_]+/g, " ");
  const normalizedLabel = label.toLowerCase();
  return TOOL_LIKE_TEXT_RE.test(raw) || TOOL_LIKE_TEXT_RE.test(normalizedLabel) || MUSICAL_INSTRUMENT_NAMES.has(normalizedLabel);
}

function collectInventoryToolLabels(draft: CharacterDraft) {
  const removedIds = new Set(draft.removedInventoryItemIds);
  const inventoryLabels = draft.inventoryItems
    .filter((item) => !removedIds.has(item.id))
    .filter((item) => {
      const haystack = `${item.category} ${item.family ?? ""} ${item.itemType ?? ""} ${item.name}`.toLowerCase();
      if (NON_TOOL_EQUIPMENT_RE.test(haystack) && !isToolLikeValue(haystack, item.name)) {
        return false;
      }
      return isToolLikeValue(haystack, item.name);
    })
    .map((item) => normalizeLabel(item.baseItemName || item.name));
  const selectionLabels = Object.values(draft.equipmentSelections)
    .map((value) => normalizeLabel(value))
    .filter((label) => {
      const haystack = label.toLowerCase();
      if (NON_TOOL_EQUIPMENT_RE.test(haystack) && !isToolLikeValue(haystack, label)) {
        return false;
      }
      return isToolLikeValue(haystack, label);
    });

  return uniqueStrings([...inventoryLabels, ...selectionLabels]);
}

function collectChoiceToolLabels(args: BuilderPdfSourceArgs) {
  const rawChoiceValues = [
    ...Object.values(args.draft.progressionSelections).flat(),
    ...args.selectedProficiencyIds,
    ...args.selectedProficiencyNames,
    ...args.selectedProgressionElements.flatMap((element) =>
      element.type === "Proficiency" && isToolLikeValue(`${element.id} ${element.name} ${element.supports.join(" ")}`)
        ? [element.id, element.name]
        : [],
    ),
  ];

  return uniqueStrings(
    rawChoiceValues
      .filter((value) => isToolLikeValue(value))
      .map((value) => normalizeLabel(value)),
  );
}

function emptyAbilityMap() {
  return {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  } satisfies Record<AbilityKey, number>;
}

function addAbilityBonusMaps(...maps: Array<Record<AbilityKey, number>>) {
  return ABILITY_KEYS.reduce<Record<AbilityKey, number>>((totals, ability) => {
    totals[ability] = maps.reduce((sum, current) => sum + (current[ability] ?? 0), 0);
    return totals;
  }, emptyAbilityMap());
}

function getStatBonuses(values: string[]) {
  return values.reduce<Record<AbilityKey, number>>((accumulator, value) => {
    const [name, amount] = value.split(":");
    if (ABILITY_KEYS.includes(name as AbilityKey)) {
      accumulator[name as AbilityKey] += Number(amount) || 0;
    }
    return accumulator;
  }, emptyAbilityMap());
}

function getAbilityModifier(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.floor((value - 10) / 2);
}

function getAverageHitDieGain(hitDie: number) {
  return Math.floor(hitDie / 2) + 1;
}

const SKILL_ABILITY_MAP: Array<{ id: string; label: string; ability: AbilityKey }> = [
  { id: "acrobatics", label: "Acrobatics", ability: "dexterity" },
  { id: "animal-handling", label: "Animal Handling", ability: "wisdom" },
  { id: "arcana", label: "Arcana", ability: "intelligence" },
  { id: "athletics", label: "Athletics", ability: "strength" },
  { id: "deception", label: "Deception", ability: "charisma" },
  { id: "history", label: "History", ability: "intelligence" },
  { id: "insight", label: "Insight", ability: "wisdom" },
  { id: "intimidation", label: "Intimidation", ability: "charisma" },
  { id: "investigation", label: "Investigation", ability: "intelligence" },
  { id: "medicine", label: "Medicine", ability: "wisdom" },
  { id: "nature", label: "Nature", ability: "intelligence" },
  { id: "perception", label: "Perception", ability: "wisdom" },
  { id: "performance", label: "Performance", ability: "charisma" },
  { id: "persuasion", label: "Persuasion", ability: "charisma" },
  { id: "religion", label: "Religion", ability: "intelligence" },
  { id: "sleight-of-hand", label: "Sleight of Hand", ability: "dexterity" },
  { id: "stealth", label: "Stealth", ability: "dexterity" },
  { id: "survival", label: "Survival", ability: "wisdom" },
];

const EXPERTISE_SKILL_LABELS: Record<string, string> = {
  acrobatics: "Acrobatics",
  animalhandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightofhand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

function normalizeLookupLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function humanizeGrantedId(value: string) {
  // Strip category prefixes at the start; never use the category word for presentation.
  return value
    .replace(/^ID_PROFICIENCY_(?:SAVINGTHROW|SKILL|WEAPON|ARMOR|TOOL)_(?:PROFICIENCY_)?/, "")
    .replace(/^ID_LANGUAGE_/, "")
    .replace(/^ID_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bCant\b/g, "Cant");
}

function collectGrantedIds(rules: BuiltInRule[], type: string) {
  return rules
    .filter((rule): rule is Extract<BuiltInRule, { kind: "grant" }> => rule.kind === "grant" && rule.type === type)
    .map((rule) => rule.id)
    .filter(Boolean);
}

function collectGrantedIdsAtLevel(rules: BuiltInRule[], type: string, level: number) {
  return rules
    .filter(
      (rule): rule is Extract<BuiltInRule, { kind: "grant" }> =>
        rule.kind === "grant" && rule.type === type && (!rule.level || rule.level <= level),
    )
    .map((rule) => rule.id)
    .filter(Boolean);
}

function collectGrantedIdsFromElements(elements: BuiltInElement[], type: string) {
  return elements.flatMap((element) => collectGrantedIds(element.rules, type));
}

function isRawProficiencySelection(value: string) {
  const normalized = value.trim().toUpperCase();
  return (
    normalized.startsWith("ID_PROFICIENCY_") ||
    normalized.startsWith("ID_EXPERTISE_") ||
    normalized.startsWith("ID_INTERNAL_TOOL_") ||
    /^PROFICIENCY\s*[:_-]/i.test(value)
  );
}

function isRawLanguageSelection(value: string) {
  return value.trim().toUpperCase().startsWith("ID_LANGUAGE_") || /^LANGUAGE\s*[:_-]/i.test(value);
}

function selectionLabelFromId(value: string) {
  const customChoice = value.match(/^(?:Proficiency|Language)\s*[:_-]\s*(.+)$/i)?.[1];
  return customChoice ? normalizeLabel(customChoice) : humanizeGrantedId(value);
}

function collectAllGrantedIdsFromElements(elements: BuiltInElement[]) {
  return elements.flatMap((element) =>
    element.rules.flatMap((rule) => (rule.kind === "grant" ? [rule.id] : [])),
  );
}

function collectAllNestedGrantedElements(
  elementPool: Map<string, BuiltInElement>,
  elements: BuiltInElement[],
) {
  const visited = new Set<string>();
  const queue = collectAllGrantedIdsFromElements(elements);
  const collected: BuiltInElement[] = [];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const grantedElement = elementPool.get(currentId);
    if (grantedElement) {
      collected.push(grantedElement);
      queue.push(...collectAllGrantedIdsFromElements([grantedElement]));
    }
  }

  return collected;
}

function collectStatBonusesFromElements(elements: BuiltInElement[]) {
  return getStatBonuses(
    elements.flatMap((element) =>
      element.rules.flatMap((rule) =>
        rule.kind === "stat" && ABILITY_KEYS.includes(rule.name as AbilityKey)
          ? [`${rule.name}:${rule.value}`]
          : [],
      ),
    ),
  );
}

function extractExpertiseLabelsFromElement(element: BuiltInElement) {
  const labels = new Set<string>();
  const directMatch = element.name.match(/(?:skill\s+)?expertise\s*\(([^)]+)\)/i);
  if (directMatch?.[1]) {
    labels.add(directMatch[1].trim());
  }

  element.rules.forEach((rule) => {
    if (rule.kind !== "stat" || rule.bonus !== "double" || !rule.name.endsWith(":proficiency")) {
      return;
    }
    const baseName = rule.name.slice(0, -":proficiency".length).replace(/[^a-z]/gi, "").toLowerCase();
    const skillLabel = EXPERTISE_SKILL_LABELS[baseName];
    if (skillLabel) {
      labels.add(skillLabel);
    }
  });

  return [...labels];
}

function getProficiencyBonus(level: number) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function resolveClassName(record: BuiltInClassRecord | null, entry: CharacterDraft["classEntries"][number]) {
  return record?.class.name || entry.classId || "";
}

function resolveHitDie(className: string) {
  const normalized = className.toLowerCase().replace(/\s+/g, "");
  const hitDieByClassName: Record<string, number> = {
    artificer: 8,
    barbarian: 12,
    bard: 8,
    bloodhunter: 10,
    blood_hunter: 10,
    cleric: 8,
    druid: 8,
    fighter: 10,
    monk: 8,
    mystic: 8,
    paladin: 10,
    psion: 6,
    pugilist: 8,
    ranger: 10,
    rogue: 8,
    sorcerer: 6,
    warlock: 8,
    wizard: 6,
  };

  return hitDieByClassName[normalized] ?? 8;
}

function getNumericRuleBonus(element: BuiltInElement, matcher: RegExp) {
  const ruleTotals = element.rules
    .filter((rule): rule is Extract<BuiltInRule, { kind: "stat" }> => rule.kind === "stat" && matcher.test(rule.name))
    .reduce((sum, rule) => {
      const amount = Number.parseInt(rule.value, 10);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

  const setterTotals = element.setters
    .filter((setter) => matcher.test(setter.name))
    .reduce((sum, setter) => {
      const amount = Number.parseInt(setter.value, 10);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

  return ruleTotals + setterTotals;
}

function parseWalkingSpeed(text: string) {
  const match =
    text.match(/\bbase walking speed is (\d+) feet\b/i) ||
    text.match(/\byour speed is (\d+) feet\b/i) ||
    text.match(/\bwalking speed of (\d+) feet\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function deriveWalkingSpeed(args: {
  selectedRace: BuiltInRaceRecord | null;
  selectedSubrace: BuiltInElement | null;
  selectedElements: BuiltInElement[];
}) {
  const textSources = [
    args.selectedSubrace?.descriptionHtml,
    args.selectedSubrace?.description,
    args.selectedRace?.race.descriptionHtml,
    args.selectedRace?.race.description,
    ...args.selectedElements.flatMap((element) => [element.descriptionHtml, element.description]),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) =>
      value
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/p>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

  const parsedSpeed = textSources.map(parseWalkingSpeed).find((value) => value !== null);
  const raceName = args.selectedRace?.race.name.toLowerCase() ?? "";
  const defaultBase =
    parsedSpeed ??
    (/gnome|halfling|dwarf/.test(raceName) ? 25 : 30);

  const bonus = args.selectedElements.reduce(
    (sum, element) => sum + getNumericRuleBonus(element, /^speed(?::|$)/i),
    0,
  );

  return {
    base: defaultBase,
    total: defaultBase + bonus,
    bonus,
  };
}

function deriveArmorClass(args: {
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
}) {
  return resolveInventoryArmorClass(args.draft.inventoryItems, {
    abilities: args.effectiveAbilities,
  });
}

function deriveHitPointSummary(args: {
  draft: CharacterDraft;
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  effectiveAbilities: Record<AbilityKey, number>;
  selectedElements: BuiltInElement[];
}) {
  const constitutionMod = getAbilityModifier(args.effectiveAbilities.constitution);
  let hp = 0;
  let usedStartingLevel = false;

  args.draft.classEntries.forEach((entry, index) => {
    if (!entry.classId || entry.level <= 0) {
      return;
    }

    const className = resolveClassName(args.classRecordsByEntry[index], entry);
    const hitDie = resolveHitDie(className);
    const averageGain = getAverageHitDieGain(hitDie);

    for (let levelIndex = 0; levelIndex < entry.level; levelIndex += 1) {
      const isFirstCharacterLevel = !usedStartingLevel && levelIndex === 0;
      hp += isFirstCharacterLevel ? hitDie : averageGain;
      hp += constitutionMod;
    }

    usedStartingLevel = true;
  });

  if (args.selectedElements.some((element) => /^tough$/i.test(element.name))) {
    hp += args.draft.level * 2;
  }

  hp += args.selectedElements.reduce((sum, element) => sum + getNumericRuleBonus(element, /^hp$/i), 0);

  return {
    value: `${hp}`,
    meta: "Average max HP from class hit dice",
  };
}

function deriveHitDiceSummary(args: {
  draft: CharacterDraft;
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
}) {
  // Combine identical hit dice so multiclass shows e.g. "8d8 • 2d6"
  // (sum of all "Xd8" entries) instead of "3d8 • 3d8 • 2d8 • 2d6".
  // Sort by die size ascending for stable display.
  const totalsByDie = new Map<number, number>();
  args.draft.classEntries.forEach((entry, index) => {
    if (!entry.classId || entry.level <= 0) {
      return;
    }
    const className = resolveClassName(args.classRecordsByEntry[index], entry);
    const hitDie = resolveHitDie(className);
    totalsByDie.set(hitDie, (totalsByDie.get(hitDie) ?? 0) + entry.level);
  });
  const parts = Array.from(totalsByDie.entries())
    .sort(([a], [b]) => a - b)
    .map(([die, count]) => `${count}d${die}`);

  return parts.join(" • ") || "—";
}

function getPrimarySpellcastingAbility(spellGroups: SpellSelectionGroup[]) {
  return spellGroups.find((group) => Boolean(group.spellcastingAbility))?.spellcastingAbility?.toUpperCase() || "";
}

function getSubclassLabel(classRecordsByEntry: Array<BuiltInClassRecord | null>, draft: CharacterDraft) {
  return draft.classEntries
    .flatMap((entry, index) => {
      const record = classRecordsByEntry[index];
      if (!record || !entry?.subclassId) {
        return [];
      }

      const selectedSubclass =
        record.subclassSteps
          .flatMap((step) => step.options)
          .find((option) => option.archetype.id === entry.subclassId) ?? null;

      return selectedSubclass ? [selectedSubclass.archetype.name] : [];
    })
    .join(" / ");
}

function normalizeLabel(value: string): string {
  let cleaned = value.trim();
  if (!cleaned) {
    return "";
  }

  cleaned = cleaned
    .replace(/^ID_/, "")
    .replace(/[-_]/g, " ")
    .replace(/\bINTERNAL\b/gi, "")
    .replace(/\bPROFICIENCY\b/gi, "")
    .replace(/\bLANGUAGE\b/gi, "")
    .replace(/\bSAVINGTHROW\b/gi, "Saving Throw ")
    .replace(/\bSAVING THROW\b/gi, "Saving Throw ")
    .replace(/\bSKILL\b/gi, "")
    .replace(/\bTOOL\b/gi, "")
    .replace(/\bWEAPON\b/gi, "")
    .replace(/\bARMOR\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Apply title case to match Review step normalization
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSelectedProficiencyFacts(args: BuilderPdfSourceArgs): ProficiencyFact[] {
  return buildProficiencyFacts([
    // Proficient sources — mark as "proficient" tier
    ...(args.selectedProficiencyIds ?? []).map((id) => ({ id, tier: "proficient" as const })),
    ...(args.selectedProficiencyNames ?? []).map((label) => ({ label: normalizeLabel(label), tier: "proficient" as const })),
    ...(args.manualGrantsByKind.proficiency ?? []).map((grant) => ({
      id: grant.refId,
      label: normalizeLabel(grant.name),
      tier: "proficient" as const,
    })),
    ...splitFreeTextList(args.draft.equipmentNotes.additionalProficiencies).map((label) => ({
      label: normalizeLabel(label),
      tier: "proficient" as const,
    })),
    // Equipment-tab grants (armor + weapons from gear) — also proficient tier
    ...(args.equipmentProficiencies?.armor ?? []).map((label) => ({ label: normalizeLabel(label), tier: "proficient" as const })),
    ...(args.equipmentProficiencies?.weapons ?? []).map((label) => ({ label: normalizeLabel(label), tier: "proficient" as const })),
    // Expertise sources — explicitly "expertise" tier (higher than proficient, distinct layer)
    ...(args.selectedExpertiseIds ?? []).map((id) => ({ id, tier: "expertise" as const })),
    ...(args.selectedExpertiseLabels ?? []).map((label) => ({ label: normalizeLabel(label), tier: "expertise" as const })),
  ]);
}

function isLowSignalFeatureElement(element: BuiltInElement) {
  const title = element.name.trim();
  const haystack = `${element.name} ${element.type} ${element.description ?? ""}`.toLowerCase();

  if (
    /\b(proficiency|language)\b/.test(element.type) ||
    /(language|proficiency) option/i.test(title) ||
    /\b(tool|instrument|language)\s+proficiency\b/i.test(haystack)
  ) {
    return true;
  }

  if (/^ability score improvement$/i.test(title)) {
    return true;
  }

  if (
    /^(bard college|roguish archetype|sacred oath|divine domain|druid circle|martial archetype|arcane tradition|primal path|otherworldly patron)$/i.test(
      title,
    )
  ) {
    return true;
  }

  return false;
}

function withPdfGroupTag(card: ReturnType<typeof toPdfCardFromElement> | ReturnType<typeof toPdfCardFromGrant>, group: string) {
  return {
    ...card,
    tags: [...card.tags, `pdf-group:${group}`],
  };
}

function withPdfTags<T extends { tags: string[] }>(card: T, tags: string[]) {
  return {
    ...card,
    tags: uniqueStrings([...card.tags, ...tags]),
  };
}

const FEATURE_ACTION_RULES: Array<{
  match: RegExp;
  timing: string;
  summary: string;
  cost?: string;
}> = [
  { match: /^Action Surge$/i, timing: "Free action", summary: "Take one additional action on your turn.", cost: "1 use" },
  { match: /^Second Wind$/i, timing: "Bonus action", summary: "Regain hit points using your fighter recovery.", cost: "1 use" },
  { match: /^Flurry of Blows$/i, timing: "Bonus action", summary: "After Attack, make two unarmed strikes.", cost: "1 ki" },
  { match: /^Stunning Strike$/i, timing: "On hit", summary: "Force a Constitution save or stun the target until your next turn.", cost: "1 ki" },
  { match: /^Rage$/i, timing: "Bonus action", summary: "Enter a rage with damage and resilience benefits." },
  { match: /^Wild Shape$/i, timing: "Action", summary: "Transform into a beast form using your druid training.", cost: "1 use" },
  { match: /^Channel Divinity$/i, timing: "Action / feature", summary: "Spend one Channel Divinity use on a subclass option.", cost: "1 use" },
  { match: /^Bardic Inspiration$/i, timing: "Bonus action", summary: "Grant an inspiration die to an ally within range.", cost: "1 use" },
  { match: /^Lay on Hands$/i, timing: "Action", summary: "Restore hit points from the Lay on Hands pool.", cost: "Pool spend" },
];

function getPlaySurfaceSummary(element: BuiltInElement) {
  const rule = FEATURE_ACTION_RULES.find((entry) => entry.match.test(element.name));
  if (!rule) {
    return undefined;
  }

  return [rule.timing, rule.cost, rule.summary].filter(Boolean).join(" | ");
}

function getClassLevelByName(args: BuilderPdfSourceArgs) {
  const levels = new Map<string, number>();
  args.draft.classEntries.forEach((entry, index) => {
    const className = resolveClassName(args.classRecordsByEntry[index], entry);
    const normalized = className.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (normalized) {
      levels.set(normalized, (levels.get(normalized) ?? 0) + entry.level);
    }
  });
  return levels;
}

type SheetResolvedValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string };

type SheetResolverContext = {
  acValue: number;
  classLevels: Map<string, number>;
  hpValue: number;
  proficiencyBonus: number;
  selectedElementIds: Set<string>;
  speedValue: number;
  statRulesByKey: Map<string, Array<Extract<BuiltInRule, { kind: "stat" }>>>;
};

function normalizeSheetLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSheetRequirementId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^id_/, "");
}

function doesSheetRequirementMatchId(requiredId: string, actualId: string) {
  const normalizedRequired = normalizeSheetRequirementId(requiredId);
  const normalizedActual = normalizeSheetRequirementId(actualId);
  return normalizedActual === normalizedRequired || normalizedActual.endsWith(normalizedRequired);
}

function getSheetElements(args: BuilderPdfSourceArgs, scopeElement?: BuiltInElement) {
  if (!scopeElement || args.selectedElements.some((element) => element.id === scopeElement.id)) {
    return args.selectedElements;
  }

  return [...args.selectedElements, scopeElement];
}

function isSheetRuleRequirementSatisfied(
  requirements: string | undefined,
  selectedElementIds: Set<string>,
) {
  if (!requirements) {
    return true;
  }

  const requiredIds = requirements.match(/ID_[A-Z0-9_]+/g) ?? [];
  if (!requiredIds.length) {
    return true;
  }

  return requiredIds.every((requiredId) =>
    [...selectedElementIds].some((actualId) => doesSheetRequirementMatchId(requiredId, actualId)),
  );
}

function collectApplicableSheetStatRules(args: BuilderPdfSourceArgs, scopeElement?: BuiltInElement) {
  const elements = getSheetElements(args, scopeElement);
  const selectedElementIds = new Set(elements.map((element) => element.id));
  const statRulesByKey = new Map<string, Array<Extract<BuiltInRule, { kind: "stat" }>>>();

  elements.forEach((element) => {
    const sheetLevel = getSheetLevelForElement(element, args);
    element.rules.forEach((rule) => {
      if (rule.kind !== "stat") {
        return;
      }
      if (rule.level && rule.level > sheetLevel) {
        return;
      }
      if (!isSheetRuleRequirementSatisfied(rule.requirements, selectedElementIds)) {
        return;
      }

      const key = normalizeSheetLookupKey(rule.name);
      const existing = statRulesByKey.get(key) ?? [];
      existing.push(rule);
      statRulesByKey.set(key, existing);
    });
  });

  return {
    selectedElementIds,
    statRulesByKey,
  };
}

function resolveSheetLevelExpression(
  value: string,
  context: SheetResolverContext,
  draftLevel: number,
) {
  const [levelToken, classToken, scaleToken, roundingToken] = value.split(":");
  if (levelToken !== "level") {
    return null;
  }

  const baseLevel = classToken
    ? context.classLevels.get(classToken.replace(/[^a-z0-9]+/g, "")) ?? 0
    : draftLevel;

  if (scaleToken === "half") {
    const rounded =
      roundingToken === "up"
        ? Math.ceil(baseLevel / 2)
        : Math.floor(baseLevel / 2);
    return { kind: "number", value: rounded } satisfies SheetResolvedValue;
  }

  return { kind: "number", value: baseLevel } satisfies SheetResolvedValue;
}

function resolveSheetScaledNumber(
  baseValue: number,
  scaleToken: string | undefined,
  roundingToken: string | undefined,
) {
  if (scaleToken !== "half") {
    return baseValue;
  }

  return roundingToken === "up"
    ? Math.ceil(baseValue / 2)
    : Math.floor(baseValue / 2);
}

function formatResolvedSheetValue(value: SheetResolvedValue) {
  return value.kind === "number" ? `${value.value}` : value.value;
}

function resolveSheetExpression(
  expression: string,
  args: BuilderPdfSourceArgs,
  context: SheetResolverContext,
  visiting: Set<string>,
): SheetResolvedValue | null {
  const key = normalizeSheetLookupKey(expression);
  if (!key) {
    return null;
  }

  const numericLiteral = Number.parseInt(key, 10);
  if (/^-?\d+$/.test(key) && Number.isFinite(numericLiteral)) {
    return { kind: "number", value: numericLiteral };
  }

  const levelValue = resolveSheetLevelExpression(key, context, args.draft.level);
  if (levelValue) {
    return levelValue;
  }

  if (key === "proficiency") {
    return { kind: "number", value: context.proficiencyBonus };
  }

  const [baseToken, scaleToken, roundingToken] = key.split(":");
  if (baseToken === "proficiency") {
    return {
      kind: "number",
      value: resolveSheetScaledNumber(context.proficiencyBonus, scaleToken, roundingToken),
    };
  }

  if (key === "speed") {
    return { kind: "number", value: context.speedValue };
  }

  if (key === "hp") {
    return { kind: "number", value: context.hpValue };
  }

  if (key === "ac") {
    return { kind: "number", value: context.acValue };
  }

  if (key === "sorcery-points") {
    return { kind: "number", value: context.classLevels.get("sorcerer") ?? 0 };
  }

  if (baseToken === "bardic-inspiration") {
    const bardLevel = context.classLevels.get("bard") ?? 0;
    const count = Math.max(1, Math.floor((bardLevel + 1) / 2));
    if (scaleToken === "count") {
      return { kind: "number", value: count };
    }
    if (scaleToken === "dice") {
      return { kind: "number", value: bardLevel >= 15 ? 12 : bardLevel >= 9 ? 10 : 8 };
    }
    return null;
  }

  if (baseToken === "barbarian rage") {
    const barbarianLevel = context.classLevels.get("barbarian") ?? 0;
    if (scaleToken === "count") {
      // Rage uses: 2 (lvl 1-2), 3 (lvl 3-5), 4 (lvl 6-8), 5 (lvl 9-12), 6 (lvl 13-19), unlimited (lvl 20)
      if (barbarianLevel >= 20) {
        return { kind: "text", value: "Unlimited" };
      }
      const rageUses = barbarianLevel >= 13 ? 6 : barbarianLevel >= 9 ? 5 : barbarianLevel >= 6 ? 4 : barbarianLevel >= 3 ? 3 : 2;
      return { kind: "number", value: rageUses };
    }
    if (scaleToken === "damage") {
      const damageBonus = barbarianLevel >= 16 ? 4 : barbarianLevel >= 9 ? 3 : 2;
      return { kind: "number", value: damageBonus };
    }
    return null;
  }

  if (key === "defensive duelist:ac") {
    return { kind: "number", value: context.proficiencyBonus };
  }

  if (key === "durable:hd:bonus") {
    return { kind: "number", value: Math.max(2, getAbilityModifier(args.effectiveAbilities.constitution) * 2) };
  }

  if (key === "inspiring leader:hp:temp") {
    return {
      kind: "number",
      value: args.draft.level + getAbilityModifier(args.effectiveAbilities.charisma),
    };
  }

  if (key === "linguist:dc") {
    return {
      kind: "number",
      value: args.effectiveAbilities.intelligence + context.proficiencyBonus,
    };
  }

  if (key === "martial adept:dice:amount") {
    return { kind: "number", value: 1 };
  }

  if (key === "martial adept:dice:size") {
    return { kind: "number", value: 6 };
  }

  if (key === "martial adept:dc") {
    return {
      kind: "number",
      value: 8 + context.proficiencyBonus + Math.max(
        getAbilityModifier(args.effectiveAbilities.strength),
        getAbilityModifier(args.effectiveAbilities.dexterity),
      ),
    };
  }

  if (key === "tough:hp") {
    return { kind: "number", value: args.draft.level * 2 };
  }

  // P2: Blood Hunter Blood Maledict — PB uses per Short Rest
  if (baseToken === "blood maledict") {
    if (scaleToken === "usage") {
      return { kind: "number", value: context.proficiencyBonus };
    }
  }

  // P2: Artificer Flash of Genius — PB uses per Long Rest
  if (key === "flash of genius:usage") {
    return { kind: "number", value: context.proficiencyBonus };
  }

  // P2: Magus Esoteric Eye — Int mod uses per Long Rest
  if (key === "esoteric eye:usage") {
    const intMod = getAbilityModifier(args.effectiveAbilities.intelligence);
    return { kind: "number", value: Math.max(1, intMod) };
  }

  // P2: Swordmage AASM features
  if (baseToken === "aasm") {
    const intMod = getAbilityModifier(args.effectiveAbilities.intelligence);
    if (scaleToken === "spell strike:usage") {
      return { kind: "number", value: Math.max(1, intMod) };
    }
    if (scaleToken === "magic sense:usage") {
      return { kind: "number", value: Math.max(1, intMod) };
    }
    if (scaleToken === "arcane beacon:usage") {
      return { kind: "number", value: Math.max(1, intMod) };
    }
  }

  // P2: Grave Warden Touch of Death — Con mod uses per Long Rest
  if (key === "touch of death") {
    const conMod = getAbilityModifier(args.effectiveAbilities.constitution);
    return { kind: "number", value: Math.max(1, conMod) };
  }

  // P2: Grave Warden Touch of Death (explicit stat)
  if (key === "touch of death:uses") {
    const conMod = getAbilityModifier(args.effectiveAbilities.constitution);
    return { kind: "number", value: Math.max(1, conMod) };
  }

  // P2: Warlock Agonizing Blast — adds Cha mod to Eldritch Blast damage
  if (key === "agonizing blast:damage") {
    const chaMod = getAbilityModifier(args.effectiveAbilities.charisma);
    return { kind: "number", value: Math.max(0, chaMod) };
  }

  // P2: Warlock Hexblade Curse uses (PB per LR)
  if (baseToken === "hexblades curse") {
    if (scaleToken === "uses") {
      return { kind: "number", value: context.proficiencyBonus };
    }
  }

  // DRACONIC ANCESTRY PLACEHOLDERS — resolve based on draconic ancestry subrace element
  if (baseToken === "draconic-ancestry") {
    // Fallback: map common scale tokens to text values based on ancestry type derived from subrace
    const subraceEl = args.selectedSubrace;
    if (subraceEl) {
      const ancestryMatch = subraceEl.id.match(/(?:ID_RACE_DRAGONBORN_|DRACONIC-ANCESTRY-)([A-Z]+)$/i);
      if (ancestryMatch) {
        const ancestryType = ancestryMatch[1].toUpperCase();
        const acidTypes = ["BLACK", "COPPER", "GREEN"];
        const coldTypes = ["BLUE", "SILVER", "WHITE"];
        const fireTypes = ["BRASS", "GOLD", "RED"];
        const lightningTypes = ["BLUE", "BRONZE"];

        if (scaleToken === "damage type" || scaleToken === "damage") {
          if (acidTypes.includes(ancestryType)) {
            return { kind: "text", value: "Acid" };
          }
          if (coldTypes.includes(ancestryType)) {
            return { kind: "text", value: "Cold" };
          }
          if (fireTypes.includes(ancestryType)) {
            return { kind: "text", value: "Fire" };
          }
          if (lightningTypes.includes(ancestryType)) {
            return { kind: "text", value: "Lightning" };
          }
        }
        if (scaleToken === "breath") {
          if (acidTypes.includes(ancestryType)) {
            return { kind: "text", value: "Acid Breath" };
          }
          if (coldTypes.includes(ancestryType)) {
            return { kind: "text", value: "Breath Weapon (Cone)" };
          }
          if (fireTypes.includes(ancestryType)) {
            return { kind: "text", value: "Breath Weapon (Cone)" };
          }
          if (lightningTypes.includes(ancestryType)) {
            return { kind: "text", value: "Breath Weapon (Line)" };
          }
        }
      }
    }
    return null;
  }

  if (key.startsWith("-")) {
    const negatedValue = resolveSheetExpression(key.slice(1), args, context, visiting);
    return negatedValue?.kind === "number"
      ? { kind: "number", value: -negatedValue.value }
      : null;
  }

  const spellcastingDcMatch = key.match(/^spellcasting:dc:([a-z]+)$/i);
  if (spellcastingDcMatch && ABILITY_KEYS.includes(spellcastingDcMatch[1] as AbilityKey)) {
    const ability = spellcastingDcMatch[1] as AbilityKey;
    return {
      kind: "number",
      value: 8 + context.proficiencyBonus + getAbilityModifier(args.effectiveAbilities[ability]),
    };
  }

  const abilityMatch = key.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma)(?::(score|modifier))?$/i);
  if (abilityMatch) {
    const ability = abilityMatch[1].toLowerCase() as AbilityKey;
    const mode = abilityMatch[2]?.toLowerCase() ?? "score";
    const score = Number.isFinite(args.effectiveAbilities[ability]) ? args.effectiveAbilities[ability] : 10;
    return {
      kind: "number",
      value: mode === "modifier" ? getAbilityModifier(score) : score,
    };
  }

  return resolveSheetStatKey(key, args, context, visiting);
}

function resolveSheetStatKey(
  key: string,
  args: BuilderPdfSourceArgs,
  context: SheetResolverContext,
  visiting: Set<string>,
): SheetResolvedValue | null {
  if (visiting.has(key)) {
    return null;
  }

  const rules = context.statRulesByKey.get(key);
  if (!rules?.length) {
    return null;
  }

  visiting.add(key);
  const ruleMode = rules.some((rule) => rule.bonus === "base")
    ? "level-gated"
    : rules.some((rule) => Boolean(rule.bonus))
      ? "best-of"
      : "additive";

  try {
    if (ruleMode !== "additive") {
      const highestLevel = rules.reduce((max, rule) => Math.max(max, rule.level ?? 0), 0);
      const matchingRules = rules.filter((rule) => (rule.level ?? 0) === highestLevel);
      const resolvedValues = matchingRules
        .map((rule) => resolveSheetExpression(rule.value, args, context, visiting))
        .filter((value): value is SheetResolvedValue => Boolean(value));

      if (!resolvedValues.length) {
        return null;
      }

      if (resolvedValues.every((value) => value.kind === "number")) {
        return {
          kind: "number",
          value: Math.max(...resolvedValues.map((value) => value.value)),
        };
      }

      const textValue = resolvedValues.find((value) => value.kind === "text");
      return textValue ?? null;
    }

    const resolvedValues = rules
      .map((rule) => resolveSheetExpression(rule.value, args, context, visiting))
      .filter((value): value is SheetResolvedValue => Boolean(value));

    if (!resolvedValues.length) {
      return null;
    }

    if (resolvedValues.every((value) => value.kind === "number")) {
      return {
        kind: "number",
        value: resolvedValues.reduce((sum, value) => sum + value.value, 0),
      };
    }

    const textValues = uniqueStrings(
      resolvedValues
        .filter((value): value is Extract<SheetResolvedValue, { kind: "text" }> => value.kind === "text")
        .map((value) => value.value),
    );
    return textValues.length === 1 ? { kind: "text", value: textValues[0] } : null;
  } finally {
    visiting.delete(key);
  }
}

function buildSheetResolverContext(args: BuilderPdfSourceArgs, scopeElement?: BuiltInElement): SheetResolverContext {
  const proficiencyBonus = getProficiencyBonus(args.draft.level);
  const acData = deriveArmorClass({
    draft: args.draft,
    effectiveAbilities: args.effectiveAbilities,
  });
  const hpData = deriveHitPointSummary({
    draft: args.draft,
    classRecordsByEntry: args.classRecordsByEntry,
    effectiveAbilities: args.effectiveAbilities,
    selectedElements: args.selectedElements,
  });
  const speedData = deriveWalkingSpeed({
    selectedRace: args.selectedRace,
    selectedSubrace: args.selectedSubrace,
    selectedElements: args.selectedElements,
  });
  const { selectedElementIds, statRulesByKey } = collectApplicableSheetStatRules(args, scopeElement);

  return {
    acValue: acData.value,
    classLevels: getClassLevelByName(args),
    hpValue: Number.parseInt(hpData.value, 10) || 0,
    proficiencyBonus,
    selectedElementIds,
    speedValue: speedData.total,
    statRulesByKey,
  };
}

function fillSheetPlaceholders(
  value: string,
  args: BuilderPdfSourceArgs,
  context: SheetResolverContext,
) {
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const resolvedValue = resolveSheetExpression(rawKey, args, context, new Set<string>());
    if (!resolvedValue) {
      console.warn(`[pdf] Unresolved placeholder: {{${rawKey}}}`);
      return "—";
    }

    return formatResolvedSheetValue(resolvedValue);
  });
}

function getSheetLevelForElement(element: BuiltInElement, args: BuilderPdfSourceArgs) {
  let classScopedLevel = 0;

  args.draft.classEntries.forEach((entry, index) => {
    const record = args.classRecordsByEntry[index];
    if (!record || entry.level <= 0) {
      return;
    }

    const selectedSubclass =
      record.subclassSteps
        .flatMap((step) => step.options)
        .find((option) => option.archetype.id === entry.subclassId) ?? null;
    const belongsToClass =
      record.class.id === element.id ||
      record.features.some((feature) => feature.id === element.id) ||
      selectedSubclass?.archetype.id === element.id ||
      selectedSubclass?.features.some((feature) => feature.id === element.id);

    if (belongsToClass) {
      classScopedLevel = Math.max(classScopedLevel, entry.level);
    }
  });

  return classScopedLevel || args.draft.level;
}

/**
 * Reads the sheet-tag gameplay text from an Aurora element.
 * Priority:
 *  1. element.sheet.descriptions[0] (sheet tag text)
 *  2. element.description first paragraph (strip HTML tags)
 *  3. element.setters.find(s => s.name === "short")?.value
 *  4. "—" if nothing found
 */
function getElementSheetText(element: BuiltInElement): string {
  // Priority 1: sheet tag text
  if (element.sheet?.descriptions?.[0]?.text) {
    return element.sheet.descriptions[0].text;
  }

  // Priority 2: element.description first paragraph (strip HTML tags)
  if (element.description) {
    const firstParagraph = element.description.split(/\n\n|\r\n\r\n/)[0] ?? element.description;
    const stripped = firstParagraph.replace(/<[^>]+>/g, "").trim();
    if (stripped) {
      return stripped;
    }
  }

  // Priority 3: short setter
  const shortSetter = element.setters.find((s) => s.name === "short");
  if (shortSetter?.value) {
    return shortSetter.value;
  }

  // Priority 4: fallback
  return "—";
}

function getSheetSummary(element: BuiltInElement, args: BuilderPdfSourceArgs) {
  if (!element.sheet || element.sheet.display === false) {
    return undefined;
  }

  const context = buildSheetResolverContext(args, element);
  const text = fillSheetPlaceholders(getElementSheetText(element), args, context);
  const usage = fillSheetPlaceholders(element.sheet.usage ?? "", args, context);

  return [element.sheet.action, usage, text].filter(Boolean).join(" | ") || undefined;
}

function getFrontPageSummary(element: BuiltInElement, args: BuilderPdfSourceArgs) {
  return getSheetSummary(element, args) ?? getPlaySurfaceSummary(element);
}

function getPassiveNoteTags(element: BuiltInElement) {
  return uniqueStrings(getPassivePdfNoteTagsFromText(element.name, `${element.descriptionHtml ?? ""} ${element.description ?? ""}`));
}

function getKiSaveDc(args: BuilderPdfSourceArgs, proficiencyBonus: number) {
  const hasMonkKi = args.draft.classEntries.some((entry, index) => {
    const className = resolveClassName(args.classRecordsByEntry[index], entry);
    return /monk/i.test(className) && entry.level >= 2;
  }) || args.selectedElements.some((element) => /\b(ki|monk'?s focus|focus points)\b/i.test(`${element.name} ${element.description ?? ""}`));

  if (!hasMonkKi) {
    return "";
  }

  return `${8 + proficiencyBonus + getAbilityModifier(args.effectiveAbilities.wisdom)}`;
}

function getBardicInspirationDie(level: number) {
  if (level >= 15) {
    return 12;
  }
  if (level >= 10) {
    return 10;
  }
  if (level >= 5) {
    return 8;
  }
  return 6;
}

function getBarbarianRageUses(level: number) {
  if (level >= 20) {
    return "Unlimited";
  }
  if (level >= 17) {
    return "6 uses";
  }
  if (level >= 12) {
    return "5 uses";
  }
  if (level >= 6) {
    return "4 uses";
  }
  if (level >= 3) {
    return "3 uses";
  }
  return "2 uses";
}

function getChannelDivinityUses(level: number) {
  if (level >= 18) {
    return "3 uses";
  }
  if (level >= 6) {
    return "2 uses";
  }
  return "1 use";
}

function getSuperiorityDiceSummary(level: number) {
  const die = level >= 18 ? 12 : level >= 10 ? 10 : 8;
  const count = level >= 15 ? 6 : level >= 7 ? 5 : 4;
  return `${count} d${die}`;
}

function normalizeClassResourceText(value: string) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\s{2,}/g, " ")
    .replace(/[.]+$/g, "")
    .trim();
}

function normalizeClassResourceCadence(value?: string) {
  const cleaned = normalizeClassResourceText(value ?? "");
  if (!cleaned) {
    return undefined;
  }
  if (/^(lr|long rest)$/i.test(cleaned)) {
    return "Long Rest";
  }
  if (/^(sr|short rest)$/i.test(cleaned)) {
    return "Short Rest";
  }
  if (/^(per )?day|daily$|^1\s*\/\s*day$|^1\s*per\s*day$/i.test(cleaned)) {
    return "Per Day";
  }
  if (/^at will$|unlimited/i.test(cleaned)) {
    return "At Will";
  }
  if (/^at dawn$/i.test(cleaned)) {
    return "At Dawn";
  }
  if (/^at dusk$/i.test(cleaned)) {
    return "At Dusk";
  }
  // Capitalize words for any other custom cadence value
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatClassResourceValue(value: string) {
  const cleaned = normalizeClassResourceText(value);
  if (!cleaned) {
    return "";
  }
  if (/^\d+$/i.test(cleaned)) {
    return cleaned === "1" ? "1 use" : `${cleaned} uses`;
  }
  const diceMatch = cleaned.match(/^(\d+)\s*d\s*(\d+)$/i) ?? cleaned.match(/^(\d+)d(\d+)$/i);
  if (diceMatch) {
    return `${diceMatch[1]} d${diceMatch[2]}`;
  }
  if (/^(proficiency bonus|pb)$/i.test(cleaned)) {
    return "PB";
  }
  return cleaned;
}

function parseClassResourceUsage(usage: string) {
  const cleaned = normalizeClassResourceText(usage);
  if (!cleaned) {
    return null;
  }

  if (/^(action|bonus action|reaction|free action|unlimited)$/i.test(cleaned)) {
    return null;
  }
  if (/^\d+\s*\/\s*turn$/i.test(cleaned) || /^per turn$/i.test(cleaned)) {
    return null;
  }
  if (/^(ki|channel divinity|wild shape|sorcery points|pact magic)$/i.test(cleaned)) {
    return null;
  }

  const slashMatch = cleaned.match(/^(.+?)\s*\/\s*(short rest|long rest|day)$/i);
  if (slashMatch) {
    return {
      value: formatClassResourceValue(slashMatch[1]),
      cadence: normalizeClassResourceCadence(slashMatch[2]),
    };
  }

  const perMatch = cleaned.match(/^(.+?)\s+(?:per|each)\s+(short rest|long rest|day)$/i);
  if (perMatch) {
    return {
      value: formatClassResourceValue(perMatch[1]),
      cadence: normalizeClassResourceCadence(perMatch[2]),
    };
  }

  const dawnMatch = cleaned.match(/^(.+?)\s+(at dawn|at dusk)$/i);
  if (dawnMatch) {
    return {
      value: formatClassResourceValue(dawnMatch[1]),
      cadence: normalizeClassResourceCadence(dawnMatch[2]),
    };
  }

  return null;
}

function resolveClassFeatureOwnerLabel(args: BuilderPdfSourceArgs, element: BuiltInElement) {
  for (let index = 0; index < args.draft.classEntries.length; index += 1) {
    const entry = args.draft.classEntries[index];
    const record = args.classRecordsByEntry[index];
    if (!record || entry.level <= 0) {
      continue;
    }

    const selectedSubclass =
      record.subclassSteps
        .flatMap((step) => step.options)
        .find((option) => option.archetype.id === entry.subclassId) ?? null;
    const belongsToClass =
      record.class.id === element.id ||
      record.features.some((feature) => feature.id === element.id) ||
      selectedSubclass?.archetype.id === element.id ||
      selectedSubclass?.features.some((feature) => feature.id === element.id);

    if (belongsToClass) {
      return record.class.name;
    }
  }

  return args.draft.classEntries.length === 1
    ? resolveClassName(args.classRecordsByEntry[0], args.draft.classEntries[0])
    : "";
}

function getClassResources(args: BuilderPdfSourceArgs) {
  const featureNames = new Set(args.selectedClassFeatureElements.map((feature) => feature.name.toLowerCase()));
  const resources: Array<{ ownerLabel: string; label: string; value: string; cadence?: string }> = [];
  const pushResource = (ownerLabel: string, label: string, value: string, cadence?: string) => {
    const cleanedOwnerLabel = normalizeClassResourceText(ownerLabel);
    const cleanedLabel = normalizeClassResourceText(label);
    const cleanedValue = normalizeClassResourceText(value);
    if (!cleanedOwnerLabel || !cleanedLabel || !cleanedValue
      || resources.some((resource) => resource.ownerLabel === cleanedOwnerLabel && resource.label === cleanedLabel)) {
      return;
    }
    resources.push({
      ownerLabel: cleanedOwnerLabel,
      label: cleanedLabel,
      value: cleanedValue,
      cadence: normalizeClassResourceCadence(cadence),
    });
  };

  for (let index = 0; index < args.classRecordsByEntry.length; index += 1) {
    const record = args.classRecordsByEntry[index];
    const entry = args.draft.classEntries[index];
    if (!record || !entry?.classId) {
      continue;
    }

    const className = record.class.name;

    if (/bard/i.test(className)) {
      const uses = Math.max(1, getAbilityModifier(args.effectiveAbilities.charisma));
      const die = getBardicInspirationDie(entry.level);
      pushResource(className, "Bardic Inspiration", `${uses} d${die}`, entry.level >= 5 ? "Short Rest" : "Long Rest");
    }

    if (/fighter/i.test(className) && entry.level >= 3) {
      pushResource(className, "Superiority Dice", getSuperiorityDiceSummary(entry.level), "Short Rest");
    }

    if (/druid/i.test(className)) {
      pushResource(className, "Wild Shape", `${Math.max(2, Math.floor(entry.level / 2))} uses`, "Short Rest");
    }

    if (/druid/i.test(className) && featureNames.has("starry form")) {
      pushResource(className, "Starry Form", "Uses Wild Shape", "Short Rest");
    }

    if (/monk/i.test(className)) {
      pushResource(className, "Ki Points", `${entry.level}`, "Short Rest");
    }

    if (/paladin/i.test(className)) {
      pushResource(className, "Lay on Hands", `${entry.level * 5}`, "Long Rest");
    }

    if (/cleric|paladin/i.test(className) && entry.level >= 2) {
      pushResource(className, "Channel Divinity", getChannelDivinityUses(entry.level), "Short Rest");
    }

    if (/fighter/i.test(className) && entry.level >= 2) {
      pushResource(className, "Action Surge", "1 use", "Short Rest");
    }

    if (/fighter/i.test(className)) {
      pushResource(className, "Second Wind", "1 use", "Short Rest");
    }

    if (/barbarian/i.test(className)) {
      pushResource(className, "Rage", getBarbarianRageUses(entry.level), "Long Rest");
    }

    if (/wizard/i.test(className)) {
      pushResource(className, "Arcane Recovery", "1 use", "Long Rest");
    }

    if (/warlock/i.test(className)) {
      const slotLevel = entry.level >= 18 ? 5 : entry.level >= 15 ? 4 : entry.level >= 9 ? 3 : entry.level >= 5 ? 2 : 1;
      pushResource(className, "Pact Magic", `${slotLevel}th level`, "Short Rest");
    }

    if (/artificer/i.test(className)) {
      pushResource(className, "Infusions", `${entry.level}`, "Long Rest");
    }

    if (/sorcerer/i.test(className)) {
      pushResource(className, "Sorcery Points", `${entry.level}`, "Long Rest");
    }

    if (/blood.?hunter/i.test(className)) {
      const pb = Math.ceil(args.draft.level / 4) + 1;
      pushResource(className, "Blood Curses", `${pb} uses`, "Long Rest");
    }

    if (/weaveshaper/i.test(className)) {
      pushResource(className, "Weave Strings", `${3 + entry.level} strings`, "Short Rest");
    }

    if (/pugilist/i.test(className)) {
      pushResource(className, "Brutal Strike", `${2 + Math.floor(entry.level / 2)} uses`, "Short Rest");
    }

    if (/swordmage/i.test(className)) {
      pushResource(className, "Aegis", `${2 + Math.floor(entry.level / 2)} uses`, "Short Rest");
    }

    if (/prism/i.test(className)) {
      pushResource(className, "Prism Shard", `${1 + Math.floor(entry.level / 2)} uses`, "Long Rest");
    }

    if (/magus/i.test(className)) {
      pushResource(className, "Spellstrike", `${Math.max(1, Math.floor(entry.level / 3))} uses`, "Short Rest");
    }

    if (/spiritualist/i.test(className)) {
      pushResource(className, "Phantom", "1 companion", "Long Rest");
    }

    if (/factotum/i.test(className)) {
      pushResource(className, "Opportunistic Piety", `${1 + Math.floor(entry.level / 5)} uses`, "Long Rest");
    }

    if (/cook/i.test(className)) {
      pushResource(className, "Meal Prep", "1 use", "Long Rest");
    }

    if (/grave.?warden/i.test(className)) {
      pushResource(className, "Dark Mending", `${1 + Math.floor(entry.level / 4)} uses`, "Long Rest");
    }
  }

  return sortClassResourcesBySpellGroupOrder(resources, args);
}

function sortClassResourcesBySpellGroupOrder(
  resources: Array<{ ownerLabel: string; [k: string]: any }>,
  args: BuilderPdfSourceArgs,
) {
  const spellOrder = args.spellGroups
    .filter((group) => group.spellcastingAbility)
    .map((group) => normalizeClassOwnerKey(group.ownerLabel));
  const spellOrderIndex = new Map<string, number>();
  spellOrder.forEach((key, idx) => spellOrderIndex.set(key, idx));
  return [...resources].sort((left, right) => {
    const leftIdx = spellOrderIndex.get(normalizeClassOwnerKey(left.ownerLabel)) ?? Number.MAX_SAFE_INTEGER;
    const rightIdx = spellOrderIndex.get(normalizeClassOwnerKey(right.ownerLabel)) ?? Number.MAX_SAFE_INTEGER;
    if (leftIdx !== rightIdx) {
      return leftIdx - rightIdx;
    }
    return left.label.localeCompare(right.label);
  });
}

function normalizeClassOwnerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getClassLabel(classRecordsByEntry: Array<BuiltInClassRecord | null>, draft: CharacterDraft) {
  const labels = draft.classEntries.map((entry, index) => classRecordsByEntry[index]?.class.name || entry.classId).filter(Boolean);
  return labels.join(" / ");
}

function buildAbilityRows(args: BuilderPdfSourceArgs) {
  const proficiencyBonus = getProficiencyBonus(args.draft.level);
  const proficiencyFacts = getSelectedProficiencyFacts(args);

  return Object.entries(ABILITY_LABELS).map(([abilityKey, label]) => {
    const ability = abilityKey as AbilityKey;
    const score = Number.isFinite(args.effectiveAbilities[ability]) ? args.effectiveAbilities[ability] : 10;
    const modifier = getAbilityModifier(score);
    const saveProficient = hasSavingThrowProficiency(proficiencyFacts, ability);

    return {
      id: `ability-${ability}`,
      label,
      score,
      modifier,
      saveBonus: modifier + (saveProficient ? proficiencyBonus : 0),
      saveProficient,
    };
  });
}

function buildSkillRows(args: BuilderPdfSourceArgs) {
  const proficiencyBonus = getProficiencyBonus(args.draft.level);
  const proficiencyFacts = getSelectedProficiencyFacts(args);
  const expertiseLabels = new Set(args.selectedExpertiseLabels.map((value) => normalizeLookupLabel(value)));
  const hasJackOfAllTrades = args.selectedClassFeatureElements.some((feature) => /jack of all trades/i.test(feature.name));

  const rows = SKILL_ABILITY_MAP.map((skill) => {
    const expertise = expertiseLabels.has(normalizeLookupLabel(skill.label)) ||
      hasSkillProficiency(proficiencyFacts, skill.id, "expertise");
    const proficient = expertise || hasSkillProficiency(proficiencyFacts, skill.id, "proficient");
    const score = Number.isFinite(args.effectiveAbilities[skill.ability]) ? args.effectiveAbilities[skill.ability] : 10;
    const modifier = getAbilityModifier(score);
    const jackBonus = !proficient && hasJackOfAllTrades ? Math.floor(proficiencyBonus / 2) : 0;
    const tier = expertise ? 2 : proficient ? 1 : 0;
    return {
      id: `skill-${skill.id}`,
      label: skill.label,
      ability: ABILITY_LABELS[skill.ability],
      total: modifier + (proficiencyBonus * tier) + jackBonus,
      proficient,
      expertise,
    };
  });

  console.info("[pdf/skills] Ability check rows", {
    strDex: rows.filter((row) => ["STR", "DEX"].includes(row.ability)).map((row) => ({ label: row.label, proficient: row.proficient, expertise: row.expertise, total: row.total })),
    int: rows.filter((row) => row.ability === "INT").map((row) => ({ label: row.label, proficient: row.proficient, expertise: row.expertise, total: row.total })),
    wis: rows.filter((row) => row.ability === "WIS").map((row) => ({ label: row.label, proficient: row.proficient, expertise: row.expertise, total: row.total })),
    cha: rows.filter((row) => row.ability === "CHA").map((row) => ({ label: row.label, proficient: row.proficient, expertise: row.expertise, total: row.total })),
  });

  return rows;
}

function buildAttackRows(args: BuilderPdfSourceArgs) {
  const groupedProficiencies = groupProficiencies(getSelectedProficiencyFacts(args));
  const weaponRows = resolveInventoryWeaponAttackRows(args.draft.inventoryItems, {
    abilities: args.effectiveAbilities,
    proficiencyBonus: getProficiencyBonus(args.draft.level),
    weaponProficiencies: uniqueStrings(groupedProficiencies.weapons.map((fact) => fact.label)),
  });

  const featureActionRows = uniqueById(
    args.selectedElements.flatMap((element) => {
      const rule = FEATURE_ACTION_RULES.find((entry) => entry.match.test(element.name));
      if (!rule) {
        return [];
      }

      return [
        {
          id: `feature-action-${element.id}`,
          name: element.name,
          hit: rule.timing,
          damage: rule.cost || "At will",
          type: "Feature",
          properties: rule.summary,
        },
      ];
    }),
  );

  const spellsById = new Map(args.spells.map((spell) => [spell.id, spell]));
  const selectedSpellIds = uniqueStrings([
    ...args.selectedSpellIds,
    ...args.manualGrantsByKind.spell.map((grant) => grant.refId).filter((id): id is string => Boolean(id)),
  ]);
  const cantripRows = uniqueById(
    selectedSpellIds
      .map((id) => spellsById.get(id))
      .filter((spell): spell is BuiltInElement => {
        if (!spell) {
          return false;
        }
        return spell.type === "Spell" && getSpellLevel(spell) === 0;
      })
      .slice(0, 2)
      .map((spell) => ({
        id: `spell-action-${spell.id}`,
        name: spell.name,
        hit: getSpellCastingTime(spell) || "Action",
        damage: "Cantrip",
        type: "Spell",
        properties: getSpellRange(spell) || undefined,
      })),
  );

  const leveledSpellRows = uniqueById(
    selectedSpellIds
      .map((id) => spellsById.get(id))
      .filter((spell): spell is BuiltInElement => {
        if (!spell) {
          return false;
        }
        return spell.type === "Spell" && getSpellLevel(spell) > 0;
      })
      .slice(0, 1)
      .map((spell) => ({
        id: `spell-action-level-${spell.id}`,
        name: spell.name,
        hit: getSpellCastingTime(spell) || "Action",
        damage: `L${getSpellLevel(spell)}`,
        type: "Spell",
        properties: getSpellRange(spell) || undefined,
      })),
  );

  const prioritizedRows = [
    ...weaponRows.slice(0, 2),
    ...featureActionRows.slice(0, 2),
    ...cantripRows.slice(0, 1),
    ...leveledSpellRows,
    ...weaponRows.slice(2),
    ...cantripRows.slice(1),
    ...featureActionRows.slice(2),
  ];

  return uniqueById(prioritizedRows).slice(0, 5);
}

function buildProficiencyGroups(args: BuilderPdfSourceArgs) {
  const facts = getSelectedProficiencyFacts(args);
  const languages = uniqueStrings([
    ...args.selectedLanguageNames,
    ...args.selectedLanguageIds.map(humanizeGrantedId),
    ...args.manualGrantsByKind.language.map((grant) => grant.name),
    ...splitFreeTextList(args.draft.equipmentNotes.additionalLanguages),
  ]);

  const grouped = groupProficiencies(facts);
  const proficiencyTools = grouped.tools.map((f) => f.label);
  const equipmentTools = collectInventoryToolLabels(args.draft);
  const choiceTools = collectChoiceToolLabels(args);
  const tools = uniqueStrings([...proficiencyTools, ...equipmentTools, ...choiceTools]);

  console.info("[pdf/proficiencies] Tools & Instr.", {
    tools,
    sources: {
      proficiencies: proficiencyTools,
      equipment: equipmentTools,
      choices: choiceTools,
    },
  });

  return {
    weapons: uniqueStrings(grouped.weapons.map((f) => f.label)),
    armor: uniqueStrings(grouped.armor.map((f) => f.label)),
    tools,
    vehicles: uniqueStrings(grouped.vehicles.map((f) => f.label)),
    languages,
  };
}

function buildStatCards(args: BuilderPdfSourceArgs) {
  const proficiencyBonus = getProficiencyBonus(args.draft.level);
  const acData = deriveArmorClass({
    draft: args.draft,
    effectiveAbilities: args.effectiveAbilities,
  });
  const defenses: string[] = [];

  // One row per AC contributor, no bold/wrapping — just small readable lines
  acData.traces.forEach((trace) => {
    // trace.label already formatted as "Name | Value" by formatAcTraceLabel in inventory.ts
    if (trace.label) {
      defenses.push(trace.label.trim());
    }
  });
  const vitals = deriveHitPointSummary({
    draft: args.draft,
    classRecordsByEntry: args.classRecordsByEntry,
    effectiveAbilities: args.effectiveAbilities,
    selectedElements: args.selectedElements,
  });
  const speed = deriveWalkingSpeed({
    selectedRace: args.selectedRace,
    selectedSubrace: args.selectedSubrace,
    selectedElements: args.selectedElements,
  });
  const dexMod = getAbilityModifier(args.effectiveAbilities.dexterity);
  const attacksPerAction = args.selectedElements.some((element) => /extra attack/i.test(`${element.name} ${element.description ?? ""}`)) ? 2 : 1;
  const spellcastingAbility = getPrimarySpellcastingAbility(args.spellGroups);
  const spellcastingAbilityLabel = spellcastingAbility
    ? ABILITY_LABELS[spellcastingAbility.toLowerCase() as AbilityKey]
    : "";
  const spellcastingScore = spellcastingAbility
    ? getAbilityModifier(args.effectiveAbilities[spellcastingAbility.toLowerCase() as AbilityKey])
    : 0;
  const spellcastingBonus = spellcastingAbility ? proficiencyBonus + spellcastingScore : 0;
  const spellSaveDc = spellcastingAbility ? 8 + proficiencyBonus + spellcastingScore : 0;
  const kiSaveDc = getKiSaveDc(args, proficiencyBonus);
  const classResources = getClassResources(args);

  return [
    { id: "proficiency-bonus", label: "Proficiency Bonus", value: `+${proficiencyBonus}` },
    { id: "initiative", label: "Initiative", value: `${dexMod >= 0 ? "+" : ""}${dexMod}` },
    { id: "attacks", label: "Attacks / Action", value: `${attacksPerAction}` },
    { id: "passive-perception", label: "Passive Perception", value: `${10 + getAbilityModifier(args.effectiveAbilities.wisdom)}` },
    { id: "spellcasting-bonus", label: "Spellcasting Bonus", value: spellcastingAbility ? `${spellcastingBonus >= 0 ? "+" : ""}${spellcastingBonus}` : "" },
    { id: "spell-save-dc", label: spellcastingAbility ? "Save DC" : "Ki Save DC", value: spellcastingAbility ? `${spellSaveDc}` : kiSaveDc },
    { id: "spellcasting-ability", label: "Spellcasting Ability", value: spellcastingAbilityLabel },
    // Per-source spellcasting stats (one set per spellcasting class/race/feat)
    ...args.spellGroups
      .filter((group) => group.spellcastingAbility)
      .map((group) => {
        const ability = group.spellcastingAbility ?? "";
        const abilityLower = ability.toLowerCase() as AbilityKey;
        const abilityScore = Number.isFinite(args.effectiveAbilities[abilityLower])
          ? args.effectiveAbilities[abilityLower]
          : 10;
        const abilityMod = getAbilityModifier(abilityScore);
        const bonus = `${abilityMod + proficiencyBonus >= 0 ? "+" : ""}${abilityMod + proficiencyBonus}`;
        const dc = 8 + proficiencyBonus + abilityMod;
        const sourceId = group.id.replace(/:/g, "-").toLowerCase();
        return [
          { id: `spellcasting-source-${sourceId}-bonus`, label: `${group.ownerLabel} Bonus`, value: bonus },
          { id: `spellcasting-source-${sourceId}-dc`, label: `${group.ownerLabel} DC`, value: `${dc}` },
          { id: `spellcasting-source-${sourceId}-ability`, label: `${group.ownerLabel} Ability`, value: ABILITY_LABELS[abilityLower] ?? ability.toUpperCase() },
        ];
      })
      .flat(),
    { id: "hp", label: "HP", value: vitals.value },
    { id: "ac", label: "AC", value: `${acData.value}` },
    { id: "defenses", label: "Defenses", value: defenses.join("\n") },
    { id: "speed", label: "Speed", value: `${speed.total} ft.` },
    { id: "hit-dice", label: "Hit Dice", value: deriveHitDiceSummary({ draft: args.draft, classRecordsByEntry: args.classRecordsByEntry }) },
    ...classResources.map((resource, index) => ({
      id: `class-resource-${index + 1}`,
      label: resource.label,
      value: resource.value,
      meta: resource.cadence
        ? `${resource.ownerLabel}\n${resource.label}\n${resource.cadence}`
        : `${resource.ownerLabel}\n${resource.label}`,
    })),
  ];
}

function buildFeatureCards(args: BuilderPdfSourceArgs) {
  const raceGrantedTraitIds = new Set(args.selectedRace ? collectGrantedIds(args.selectedRace.race.rules, "Racial Trait") : []);
  const subraceGrantedTraitIds = new Set(args.selectedSubrace ? collectGrantedIds(args.selectedSubrace.rules, "Racial Trait") : []);
  const racialTraits = args.selectedRacialTraitElements.filter((element) => raceGrantedTraitIds.has(element.id));
  const subracialTraits = args.selectedRacialTraitElements.filter((element) => subraceGrantedTraitIds.has(element.id));
  const unscopedTraits = args.selectedRacialTraitElements.filter(
    (element) => !raceGrantedTraitIds.has(element.id) && !subraceGrantedTraitIds.has(element.id),
  );
  const classFeatures = args.selectedClassFeatureElements.filter((element) => !/archetype/i.test(element.type) && !isLowSignalFeatureElement(element));
  const subclassFeatures = args.selectedClassFeatureElements.filter((element) => /archetype/i.test(element.type) && !isLowSignalFeatureElement(element));
  const backgroundFeatures = args.selectedBackgroundFeatureElements.filter((element) => !isLowSignalFeatureElement(element));
  const featFeatures = args.selectedFeatElements.filter((element) => !isLowSignalFeatureElement(element));
  const manualFeatures = args.selectedManualFeatureElements.filter((element) => !isLowSignalFeatureElement(element));
  const progressionFeatures = args.selectedProgressionElements.filter((element) => !isLowSignalFeatureElement(element));

  const cards = [
    ...racialTraits.map((element) =>
      withPdfGroupTag(withPdfTags(toPdfCardFromElement(element, { kind: "trait", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)), "race"),
    ),
    ...subracialTraits.map((element) =>
      withPdfGroupTag(withPdfTags(toPdfCardFromElement(element, { kind: "trait", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)), "subrace"),
    ),
    ...unscopedTraits.map((element) =>
      withPdfGroupTag(withPdfTags(toPdfCardFromElement(element, { kind: "trait", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)), "race"),
    ),
    ...classFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "class",
      ),
    ),
    ...subclassFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "subclass",
      ),
    ),
    ...backgroundFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "additional",
      ),
    ),
    ...featFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "feat",
      ),
    ),
    ...manualFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "additional",
      ),
    ),
    ...progressionFeatures.map((element) =>
      withPdfGroupTag(
        withPdfTags(toPdfCardFromElement(element, { kind: "feature", summary: getFrontPageSummary(element, args) }), getPassiveNoteTags(element)),
        "other",
      ),
    ),
    ...args.manualGrantsByKind.feature.map((grant) => withPdfGroupTag(toPdfCardFromGrant(grant), "additional")),
    ...args.manualGrantsByKind.feat.map((grant) => withPdfGroupTag(toPdfCardFromGrant(grant), "feat")),
    ...args.manualGrantsByKind.asi.map((grant) => withPdfGroupTag(toPdfCardFromGrant(grant), "other")),
  ];

  return uniqueById(cards);
}

function buildCompanionCards(args: BuilderPdfSourceArgs) {
  const companionSubElements = getBuiltInSrdCompanionSubElements();
  const companionSubElementsById = new Map(companionSubElements.map((element) => [element.id, element] as const));
  const isTemporaryFormOrSummon = (element: BuiltInElement) =>
    /\bwild shape\b|\bconjure\b|\bsummon\b/i.test(`${element.name} ${element.description ?? ""} ${element.type}`);
  const isExplicitCompanionElement = (element: BuiltInElement) => {
    if (isTemporaryFormOrSummon(element)) {
      return false;
    }

    return (
      element.type === "Companion" ||
      element.setters.some((setter) => setter.name === "challenge" || setter.name === "traits" || setter.name === "actions") ||
      element.rules.some((rule) => rule.kind === "stat" && rule.name.startsWith("companion:"))
    );
  };

  const companionElements = args.selectedProgressionElements.filter(isExplicitCompanionElement);

  return uniqueById(
    companionElements
      .flatMap((element) => {
        // Try to get setter data from element.setters first
        const setterMap = new Map(element.setters.map((s) => [s.name, s.value]));

        // If setters are empty, try to derive from element.rules (companion:xxx rules)
        const rulesSetters: Record<string, string> = {};
        element.rules?.forEach((rule) => {
          if (rule.kind === "stat") {
            // Rules like "companion:ac" → extract value
            const match = rule.name.match(/^companion:(\w+)$/);
            if (match) {
              rulesSetters[match[1]] = rule.value;
            }
          }
        });

        const dedupedSupport = [...new Set((element.supports ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean))];

        // Encode setter values as tags so the PDF renderer can read them.
        // Format: key:value (e.g. "str:14", "ac:13", "cr:1/4")
        // Try setterMap first, fall back to rulesSetters for companion:xxx rules
        const getSetter = (key: string) => setterMap.get(key) ?? rulesSetters[key] ?? "";
        
        const tags: string[] = [
          ...dedupedSupport,
          getSetter("type") ? `type:${getSetter("type")}` : null,
          getSetter("size") ? `size:${getSetter("size")}` : null,
          getSetter("challenge") ? `cr:${getSetter("challenge")}` : null,
          getSetter("ac") ? `ac:${getSetter("ac")}` : null,
          getSetter("hp") ? `hp:${getSetter("hp")}` : null,
          getSetter("speed") ? `speed:${getSetter("speed")}` : null,
          getSetter("alignment") ? `alignment:${getSetter("alignment")}` : null,
          getSetter("senses") ? `senses:${getSetter("senses")}` : null,
          getSetter("languages") ? `languages:${getSetter("languages")}` : null,
          getSetter("skills") ? `skills:${getSetter("skills")}` : null,
          getSetter("strength") ? `str:${getSetter("strength")}` : null,
          getSetter("dexterity") ? `dex:${getSetter("dexterity")}` : null,
          getSetter("constitution") ? `con:${getSetter("constitution")}` : null,
          getSetter("intelligence") ? `int:${getSetter("intelligence")}` : null,
          getSetter("wisdom") ? `wis:${getSetter("wisdom")}` : null,
          getSetter("charisma") ? `cha:${getSetter("charisma")}` : null,
        ].filter(Boolean) as string[];

        const rootCard = toPdfCardFromElement(element, {
          kind: "feature",
          pageHint: "companion",
          tags,
        });

        const detailIds = [
          ...splitFreeTextList(getSetter("traits")),
          ...splitFreeTextList(getSetter("actions")),
          ...splitFreeTextList(getSetter("reactions")),
        ];
        const detailCards = detailIds
          .map((id) => companionSubElementsById.get(id))
          .filter((entry): entry is BuiltInElement => Boolean(entry))
          .map((entry) =>
            toPdfCardFromElement(entry, {
              kind: "feature",
              pageHint: "companion",
            }),
          );

        return [rootCard, ...detailCards];
      }),
  );
}

function buildInventoryCards(args: BuilderPdfSourceArgs) {
  return uniqueById(args.draft.inventoryItems.map((item) => toPdfCardFromInventoryItem(item)));
}

function buildSpellCards(args: BuilderPdfSourceArgs) {
  const spellsById = new Map(args.spells.map((spell) => [spell.id, spell]));
  const selectedIds = uniqueStrings([
    ...args.selectedSpellIds,
    ...args.manualGrantsByKind.spell.map((grant) => grant.refId).filter((id): id is string => Boolean(id)),
  ]);

  return uniqueById(
    selectedIds
      .map((id) => spellsById.get(id))
      .filter((spell): spell is BuiltInElement => Boolean(spell))
      .map((spell) => toPdfCardFromElement(spell, { kind: "spell", summary: getFrontPageSummary(spell, args) })),
  );
}

const FULL_CASTER_SLOT_TABLE: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

const WARLOCK_PACT_SLOT_TABLE: Record<number, { slotLevel: number; slots: number }> = {
  1: { slotLevel: 1, slots: 1 },
  2: { slotLevel: 1, slots: 2 },
  3: { slotLevel: 2, slots: 2 },
  4: { slotLevel: 2, slots: 2 },
  5: { slotLevel: 3, slots: 2 },
  6: { slotLevel: 3, slots: 2 },
  7: { slotLevel: 4, slots: 2 },
  8: { slotLevel: 4, slots: 2 },
  9: { slotLevel: 5, slots: 2 },
  10: { slotLevel: 5, slots: 2 },
  11: { slotLevel: 5, slots: 3 },
  12: { slotLevel: 5, slots: 3 },
  13: { slotLevel: 5, slots: 3 },
  14: { slotLevel: 5, slots: 3 },
  15: { slotLevel: 5, slots: 3 },
  16: { slotLevel: 5, slots: 3 },
  17: { slotLevel: 5, slots: 4 },
  18: { slotLevel: 5, slots: 4 },
  19: { slotLevel: 5, slots: 4 },
  20: { slotLevel: 5, slots: 4 },
};

type SpellcastingClassEntry = {
  entry: CharacterDraft["classEntries"][number];
  level: number;
  normalizedClassName: string;
  record: BuiltInClassRecord;
};

function normalizeClassNameForSpellcasting(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isFullCasterClassName(value: string) {
  return /^(bard|cleric|druid|sorcerer|wizard)$/.test(value);
}

function isHalfCasterClassName(value: string) {
  return /^(artificer|paladin|ranger)$/.test(value);
}

function isWarlockClassName(value: string) {
  return value === "warlock";
}

function getSpellcastingClassEntries(args: BuilderPdfSourceArgs) {
  return args.classRecordsByEntry.flatMap((record, index): SpellcastingClassEntry[] => {
    const entry = args.draft.classEntries[index];
    if (!record || !entry?.classId || entry.level <= 0) {
      return [];
    }

    return [{
      entry,
      level: entry.level,
      normalizedClassName: normalizeClassNameForSpellcasting(record.class.name),
      record,
    }];
  });
}

function toPdfSpellSlotLevels(slotEntries: Array<{ slotLevel: number; count: number }>) {
  return slotEntries.map(({ slotLevel, count }) => ({
    level: slotLevel,
    slots: count,
  }));
}

function getFullCasterSlotsForLevel(level: number) {
  const slotCounts = FULL_CASTER_SLOT_TABLE[Math.max(0, Math.min(level, 20))] ?? [];
  return slotCounts.map((count, index) => ({ slotLevel: index + 1, count }));
}

function getWarlockPactSlotsForLevel(level: number) {
  const pactSlots = WARLOCK_PACT_SLOT_TABLE[Math.max(0, Math.min(level, 20))];
  return pactSlots ? [{ slotLevel: pactSlots.slotLevel, count: pactSlots.slots }] : [];
}

function getStandardCasterContribution(className: string, level: number) {
  if (isFullCasterClassName(className)) {
    return level;
  }

  if (className === "artificer") {
    return Math.ceil(level / 2);
  }

  if (className === "paladin" || className === "ranger") {
    return Math.floor(level / 2);
  }

  return 0;
}

function buildSpellSlots(args: BuilderPdfSourceArgs): PdfSpellSlots | undefined {
  const casterGroups = args.spellGroups.filter((group) => group.spellcastingAbility);
  const classEntries = getSpellcastingClassEntries(args);
  const standardCasterEntries = classEntries.filter((entry) =>
    isFullCasterClassName(entry.normalizedClassName) || isHalfCasterClassName(entry.normalizedClassName),
  );
  const warlockEntry = classEntries.find((entry) => isWarlockClassName(entry.normalizedClassName)) ?? null;

  if (!casterGroups.length && !standardCasterEntries.length && !warlockEntry) {
    return undefined;
  }

  const proficiencyBonus = getProficiencyBonus(args.draft.level);

  // Build per-source spellcasting entries (one per spellcasting class/race/feat)
  const sources: PdfSpellcastingSourceEntry[] = casterGroups.map((group) => {
    const ability = group.spellcastingAbility ?? "";
    const abilityLower = ability.toLowerCase() as AbilityKey;
    const abilityScore = Number.isFinite(args.effectiveAbilities[abilityLower])
      ? args.effectiveAbilities[abilityLower]
      : 10;
    const abilityMod = getAbilityModifier(abilityScore);
    const dc = 8 + proficiencyBonus + abilityMod;
    const bonus = `${abilityMod + proficiencyBonus >= 0 ? "+" : ""}${abilityMod + proficiencyBonus}`;

    // Determine if this is a Pact Magic source
    const isPact = /warlock|pact/i.test(group.id) || /warlock/i.test(group.ownerLabel);
    const kind: PdfSpellcastingSourceEntry["kind"] =
      group.kind === "prepared" || group.kind === "known" || group.kind === "spellbook"
        ? group.kind
        : group.kind === "granted"
          ? "granted"
          : isPact
            ? "pact"
            : "granted";

    const recovery: PdfSpellcastingSourceEntry["recovery"] = isPact
      ? "short-rest"
      : group.ownerType === "race" || group.ownerType === "subrace" || group.ownerType === "feat"
        ? "at-will"
        : "long-rest";

    return {
      id: group.id.replace(/:/g, "-").toLowerCase(),
      ownerLabel: group.ownerLabel,
      ownerType: group.ownerType,
      ability,
      abilityLabel: ABILITY_LABELS[abilityLower] ?? ability.toUpperCase(),
      dc,
      bonus,
      kind,
      recovery,
    };
  });

  const standardCasterLevel = standardCasterEntries.reduce(
    (total, entry) => total + getStandardCasterContribution(entry.normalizedClassName, entry.level),
    0,
  );
  const hasStandardSpellcasting = standardCasterLevel > 0;
  const hasPactMagic = Boolean(warlockEntry);

  let standardSlotEntries: Array<{ slotLevel: number; count: number }> = [];
  let pactSlotEntries: Array<{ slotLevel: number; count: number }> = [];

  if (standardCasterEntries.length === 1) {
    const [primaryCaster] = standardCasterEntries;
    const explicitSlots = getSpellSlotSummary(primaryCaster.record.class.rules, primaryCaster.level);
    standardSlotEntries = explicitSlots.length ? explicitSlots : getFullCasterSlotsForLevel(primaryCaster.level);
  } else if (hasStandardSpellcasting) {
    standardSlotEntries = getFullCasterSlotsForLevel(standardCasterLevel);
  }

  if (warlockEntry) {
    const explicitSlots = getSpellSlotSummary(warlockEntry.record.class.rules, warlockEntry.level);
    pactSlotEntries = explicitSlots.length ? explicitSlots : getWarlockPactSlotsForLevel(warlockEntry.level);
  }

  if (!standardSlotEntries.length && !pactSlotEntries.length && !sources.length) {
    return undefined;
  }

  const displaySlotEntries = standardSlotEntries.length ? standardSlotEntries : pactSlotEntries;
  const maxLevel = displaySlotEntries.length > 0 ? Math.max(...displaySlotEntries.map((entry) => entry.slotLevel)) : 0;
  const slots: PdfSpellSlotLevel[] = toPdfSpellSlotLevels(displaySlotEntries);

  return {
    maxLevel,
    slots,
    standardSlots: standardSlotEntries.length ? toPdfSpellSlotLevels(standardSlotEntries) : undefined,
    pactSlots: pactSlotEntries.length ? toPdfSpellSlotLevels(pactSlotEntries) : undefined,
    sources,
    isFullCaster:
      standardCasterEntries.length > 0 &&
      standardCasterEntries.every((entry) => isFullCasterClassName(entry.normalizedClassName)),
    isHalfCaster:
      standardCasterEntries.length > 0 &&
      standardCasterEntries.every((entry) => isHalfCasterClassName(entry.normalizedClassName)),
    isWarlock: hasPactMagic,
    hasPactMagic,
  };
}

function getSpellSourceLabel(group: SpellSelectionGroup) {
  if (group.ownerType === "race") {
    return "Racial";
  }
  if (group.ownerType === "subrace") {
    return "Subracial";
  }
  return group.ownerLabel;
}

function getSpellPreparationState(group: SpellSelectionGroup): PdfPage1SpellSummary["preparationState"] {
  if (group.kind === "prepared") {
    return "prepared";
  }
  if (group.kind === "known" || group.kind === "cantrip") {
    return "known";
  }
  if (group.kind === "spellbook") {
    return "spellbook";
  }
  if (group.ownerType === "race" || group.ownerType === "subrace") {
    return "innate";
  }
  return "always-prepared";
}

function getSpellSlotMode(group: SpellSelectionGroup): PdfPage1SpellSummary["slotMode"] {
  if (group.ownerType === "race" || group.ownerType === "subrace") {
    return "innate";
  }
  if (normalizeClassNameForSpellcasting(group.ownerLabel) === "warlock") {
    return "pact";
  }
  return "standard";
}

function addSpellSummary(
  summariesBySpellId: Map<string, PdfPage1SpellSummary[]>,
  spellId: string,
  summary: PdfPage1SpellSummary,
) {
  const existing = summariesBySpellId.get(spellId) ?? [];
  const key = `${summary.sourceId}:${summary.preparationState}:${summary.slotMode}`;
  if (existing.some((entry) => `${entry.sourceId}:${entry.preparationState}:${entry.slotMode}` === key)) {
    return;
  }
  existing.push(summary);
  summariesBySpellId.set(spellId, existing);
}

function extractCompactSpellSummary(value: string | undefined) {
  const parts = (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);
  const selected = (parts[parts.length - 1] ?? value ?? "").replace(/\s+/g, " ").trim();
  if (!selected) {
    return undefined;
  }
  const firstSentence = (selected.split(/(?<=[.!?])\s+/)[0] ?? selected).trim();
  return firstSentence || undefined;
}

function buildSpellList(args: BuilderPdfSourceArgs): PdfSpellListEntry[] {
  const spellsById = new Map(args.spells.map((spell) => [spell.id, spell]));
  const selectedIds = uniqueStrings([
    ...args.selectedSpellIds,
    ...args.manualGrantsByKind.spell.map((grant) => grant.refId).filter((id): id is string => Boolean(id)),
  ]);
  const spellSummariesById = new Map<string, PdfPage1SpellSummary[]>();

  args.spellGroups.forEach((group) => {
    const sourceLabel = getSpellSourceLabel(group);
    const summaryBase: Omit<PdfPage1SpellSummary, "sourceId"> = {
      ownerLabel: group.ownerLabel,
      ownerType: group.ownerType,
      preparationState: getSpellPreparationState(group),
      slotMode: getSpellSlotMode(group),
      sourceLabel,
      spellcastingAbility: group.spellcastingAbility,
    };

    const selectedGroupSpellIds = args.draft.spellSelections[group.id] ?? [];
    selectedGroupSpellIds.forEach((id) => {
      addSpellSummary(spellSummariesById, id, {
        ...summaryBase,
        sourceId: group.id,
      });
    });

    group.grantedSpellIds.forEach((id) => {
      addSpellSummary(spellSummariesById, id, {
        ...summaryBase,
        sourceId: `${group.id}:granted`,
      });
    });
  });

  args.manualGrantsByKind.spell.forEach((grant) => {
    if (grant.refId) {
      addSpellSummary(spellSummariesById, grant.refId, {
        ownerLabel: grant.name || "Manual / DM grant",
        ownerType: "manual",
        preparationState: "always-prepared",
        slotMode: "standard",
        sourceId: grant.refId,
        sourceLabel: grant.name || "Additional",
      });
    }
  });

  return uniqueStrings(selectedIds)
    .map((id) => spellsById.get(id))
    .filter((spell): spell is BuiltInElement => Boolean(spell))
    .map((spell) => {
      const spellLevel = getSpellLevel(spell);
      const page1Summaries = spellSummariesById.get(spell.id) ?? [];
      const primarySummary = page1Summaries[0];
      const sourceLabel = primarySummary?.sourceLabel ?? spell.source?.replace(/\([^)]*\)\s*$/, "").trim() ?? undefined;
      const page1DisplaySummary = extractCompactSpellSummary(getFrontPageSummary(spell, args));
      return {
        id: spell.id,
        name: spell.name,
        level: spellLevel,
        sourceLabel,
        page1DisplaySummary,
        page1Summary: primarySummary,
        page1Summaries,
      };
    });
}

function buildBackstoryCards(args: BuilderPdfSourceArgs) {
  const backstory = args.draft.backstory;
  return [
    ...(backstory.personalityTraits ? [{ id: "personality-traits", title: "Personality traits", kind: "note" as const, contentKind: "detail" as const, summary: backstory.personalityTraits, detail: backstory.personalityTraits, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.ideals ? [{ id: "ideals", title: "Ideals", kind: "note" as const, contentKind: "detail" as const, summary: backstory.ideals, detail: backstory.ideals, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.bonds ? [{ id: "bonds", title: "Bonds", kind: "note" as const, contentKind: "detail" as const, summary: backstory.bonds, detail: backstory.bonds, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.flaws ? [{ id: "flaws", title: "Flaws", kind: "note" as const, contentKind: "detail" as const, summary: backstory.flaws, detail: backstory.flaws, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.alliesAndOrganizations ? [{ id: "allies-and-organizations", title: "Allies and organizations", kind: "note" as const, contentKind: "detail" as const, summary: backstory.alliesAndOrganizations, detail: backstory.alliesAndOrganizations, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.backstory ? [{ id: "backstory", title: "Backstory", kind: "note" as const, contentKind: "detail" as const, summary: backstory.backstory, detail: backstory.backstory, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
    ...(backstory.additionalFeatures ? [{ id: "additional-features", title: "Additional features", kind: "note" as const, contentKind: "detail" as const, summary: backstory.additionalFeatures, detail: backstory.additionalFeatures, tags: ["backstory"], priority: 90, pageHint: "backstory" as const, widthHint: "wide" as const }] : []),
  ];
}

export function buildPdfCharacterFromDraft(args: BuilderPdfDraftCatalogs & { draft: CharacterDraft }) {
  const { backgrounds, classes, draft, feats, progressionElements, races, spells } = args;
  const selectedRace = races.find((entry) => entry.race.id === draft.raceId) ?? null;
  const selectedSubrace = selectedRace?.subraces.find((entry) => entry.id === draft.subraceId) ?? null;
  const selectedBackground = backgrounds.find((entry) => entry.background.id === draft.backgroundId) ?? null;
  const classRecordsByEntry = draft.classEntries.map(
    (entry) => classes.find((candidate) => candidate.class.id === entry.classId) ?? null,
  );
  const selectedFeatElements = Object.values(draft.improvementSelections)
    .filter((selection) => selection.mode === "feat" && selection.featId)
    .map((selection) => feats.find((feat) => feat.id === selection.featId))
    .filter((feat): feat is BuiltInElement => Boolean(feat));
  const elementPool = new Map(
    [
      ...progressionElements,
      ...feats,
      ...spells,
      ...races.flatMap((entry) => [entry.race, ...entry.subraces, ...entry.traits]),
      ...classes.flatMap((entry) => [
        entry.class,
        ...entry.features,
        ...entry.subclassSteps.flatMap((step) =>
          step.options.flatMap((option) => [option.archetype, ...option.features]),
        ),
      ]),
      ...backgrounds.flatMap((entry) => [entry.background, ...entry.features]),
    ].map((element) => [element.id, element] as const),
  );
  const selectedManualFeatElements = draft.manualGrants
    .filter((grant) => grant.kind === "feat" && grant.refId)
    .map((grant) => elementPool.get(grant.refId ?? ""))
    .filter((entry): entry is BuiltInElement => Boolean(entry));
  const selectedManualFeatureElements = draft.manualGrants
    .filter((grant) => grant.kind === "feature" && grant.refId)
    .map((grant) => elementPool.get(grant.refId ?? ""))
    .filter((entry): entry is BuiltInElement => Boolean(entry));
  const allSelectedFeatElements = uniqueById([...selectedFeatElements, ...selectedManualFeatElements]);
  const selectedRacialTraitIds = [
    ...(selectedRace ? collectGrantedIds(selectedRace.race.rules, "Racial Trait") : []),
    ...(selectedSubrace ? collectGrantedIds(selectedSubrace.rules, "Racial Trait") : []),
  ];
  const selectedRacialTraitElements =
    selectedRace?.traits.filter((trait) => selectedRacialTraitIds.includes(trait.id)) ?? [];
  const selectedClassFeatureElements = classRecordsByEntry.flatMap((record, index) => {
    const entry = draft.classEntries[index];
    if (!record || !entry?.classId) {
      return [];
    }

    const classFeatureIds = collectGrantedIdsAtLevel(record.class.rules, "Class Feature", entry.level);
    const selectedSubclass =
      record.subclassSteps.flatMap((step) => step.options).find((option) => option.archetype.id === entry.subclassId) ?? null;
    const subclassFeatureIds = selectedSubclass
      ? collectGrantedIdsAtLevel(selectedSubclass.archetype.rules, "Archetype Feature", entry.level)
      : [];
    const grantedFeatureIds = new Set([...classFeatureIds, ...subclassFeatureIds]);

    return [
      ...record.features.filter((feature) => grantedFeatureIds.has(feature.id)),
      ...(selectedSubclass?.features.filter((feature) => grantedFeatureIds.has(feature.id)) ?? []),
    ];
  });
  const selectedBackgroundFeatureIds = selectedBackground
    ? collectGrantedIds(selectedBackground.background.rules, "Background Feature")
    : [];
  const selectedBackgroundFeatureElements =
    selectedBackground?.features.filter((feature) => selectedBackgroundFeatureIds.includes(feature.id)) ?? [];
  const directProgressionElements = Object.values(draft.progressionSelections)
    .flat()
    .map((id) => elementPool.get(id))
    .filter((entry): entry is BuiltInElement => Boolean(entry));
  const rawProgressionSelectionIds = uniqueStrings(Object.values(draft.progressionSelections).flat());
  const rawProficiencySelectionIds = rawProgressionSelectionIds.filter(isRawProficiencySelection);
  const rawLanguageSelectionIds = rawProgressionSelectionIds.filter(isRawLanguageSelection);
  const selectedProgressionGrantElements = collectAllNestedGrantedElements(elementPool, [
    ...(selectedRace ? [selectedRace.race] : []),
    ...(selectedSubrace ? [selectedSubrace] : []),
    ...selectedRacialTraitElements,
    ...selectedClassFeatureElements,
    ...selectedBackgroundFeatureElements,
    ...allSelectedFeatElements,
    ...selectedManualFeatureElements,
    ...directProgressionElements,
  ]);
  const selectedProgressionElements = uniqueById([
    ...directProgressionElements,
    ...selectedProgressionGrantElements,
  ]);

  const racialBonuses = draft.useTashasCustomizedOrigin
    ? emptyAbilityMap()
    : getStatBonuses(
        [
          ...(selectedRace?.race.rules ?? []),
          ...(selectedSubrace?.rules ?? []),
        ].flatMap((rule) =>
          rule.kind === "stat" && ABILITY_KEYS.includes(rule.name as AbilityKey)
            ? [`${rule.name}:${rule.value}`]
            : [],
        ),
      );
  const improvementBonuses = getImprovementBonuses(draft.improvementSelections);
  const manualAbilityBonuses = draft.manualGrants.reduce<Record<AbilityKey, number>>((totals, grant) => {
    if (grant.kind === "asi" && grant.mode === "increase" && grant.ability && Number.isFinite(grant.amount)) {
      totals[grant.ability] += grant.amount ?? 0;
    }
    return totals;
  }, emptyAbilityMap());
  const effectiveAbilities = addAbilityBonusMaps(
    draft.abilities,
    racialBonuses,
    improvementBonuses,
    collectStatBonusesFromElements([...allSelectedFeatElements, ...selectedManualFeatureElements]),
    manualAbilityBonuses,
  );
  const selectedSpellIds = Object.values(draft.spellSelections)
    .flat()
    .filter((id, index, values): id is string => Boolean(id) && values.indexOf(id) === index);
  const activeSpellGroups = deriveSpellcastingGroups({
    activeFeats: allSelectedFeatElements,
    activeProgressionOptions: selectedProgressionElements,
    classRecordsByEntry,
    classEntries: draft.classEntries,
    effectiveAbilities,
    race: selectedRace,
    spellSelections: draft.spellSelections,
    spells,
    subrace: selectedSubrace,
    hasSpellcastingAccess: selectedProgressionElements.some((element) => Boolean(element.spellcasting)),
    totalLevel: getTotalCharacterLevel(draft),
  });
  const selectedProficiencyIds = uniqueStrings([
    ...(selectedRace ? collectGrantedIds(selectedRace.race.rules, "Proficiency") : []),
    ...(selectedSubrace ? collectGrantedIds(selectedSubrace.rules, "Proficiency") : []),
    ...collectGrantedIdsFromElements(selectedRacialTraitElements, "Proficiency"),
    ...classRecordsByEntry.flatMap((record, index) => {
      const entry = draft.classEntries[index];
      return record && entry?.classId
        ? collectGrantedIdsAtLevel(record.class.rules, "Proficiency", entry.level)
        : [];
    }),
    ...collectGrantedIdsFromElements(selectedClassFeatureElements, "Proficiency"),
    ...(selectedBackground ? collectGrantedIds(selectedBackground.background.rules, "Proficiency") : []),
    ...collectGrantedIdsFromElements(selectedBackgroundFeatureElements, "Proficiency"),
    ...collectGrantedIdsFromElements(allSelectedFeatElements, "Proficiency"),
    ...collectGrantedIdsFromElements(selectedManualFeatureElements, "Proficiency"),
    ...rawProficiencySelectionIds.filter((id) => id.trim().toUpperCase().startsWith("ID_")),
    ...selectedProgressionElements.flatMap((element) =>
      element.type === "Proficiency" ? [element.id] : collectGrantedIds(element.rules, "Proficiency"),
    ),
  ]);
  const selectedLanguageIds = uniqueStrings([
    ...(selectedRace ? collectGrantedIds(selectedRace.race.rules, "Language") : []),
    ...(selectedSubrace ? collectGrantedIds(selectedSubrace.rules, "Language") : []),
    ...(selectedBackground ? collectGrantedIds(selectedBackground.background.rules, "Language") : []),
    ...collectGrantedIdsFromElements(allSelectedFeatElements, "Language"),
    ...collectGrantedIdsFromElements(selectedManualFeatureElements, "Language"),
    ...rawLanguageSelectionIds.filter((id) => id.trim().toUpperCase().startsWith("ID_")),
    ...selectedProgressionElements.flatMap((element) =>
      element.type === "Language" ? [element.id] : collectGrantedIds(element.rules, "Language"),
    ),
  ]);
  const manualGrantsByKind = draft.manualGrants.reduce<Record<CharacterManualGrant["kind"], CharacterManualGrant[]>>(
    (groups, grant) => {
      groups[grant.kind].push(grant);
      return groups;
    },
    {
      spell: [],
      proficiency: [],
      language: [],
      feat: [],
      feature: [],
      asi: [],
    },
  );

  return buildPdfCharacterFromBuilder({
    abilities: draft.abilities,
    allSelectedFeatElements,
    classRecordsByEntry,
    draft,
    effectiveAbilities,
    manualGrantsByKind,
    selectedBackground,
    selectedBackgroundFeatureElements,
    selectedClassFeatureElements,
    selectedExpertiseIds: [
      ...new Set(
        [
          ...selectedProgressionElements,
          ...selectedClassFeatureElements,
          ...allSelectedFeatElements,
          ...selectedBackgroundFeatureElements,
          ...selectedRacialTraitElements,
          ...selectedManualFeatureElements,
        ].flatMap((e) => collectGrantedIds(e.rules, "Expertise")),
      ),
    ],
    selectedExpertiseLabels: [
      ...new Set(
        [
          ...selectedProgressionElements,
          ...selectedClassFeatureElements,
          ...allSelectedFeatElements,
          ...selectedBackgroundFeatureElements,
          ...selectedRacialTraitElements,
          ...selectedManualFeatureElements,
        ].flatMap(extractExpertiseLabelsFromElement),
      ),
    ],
    selectedFeatElements: allSelectedFeatElements,
    selectedLanguageIds,
    selectedLanguageNames: [
      ...selectedLanguageIds.map(humanizeGrantedId),
      ...rawLanguageSelectionIds.map(selectionLabelFromId),
      ...manualGrantsByKind.language.map((grant) => grant.name),
    ],
    selectedManualFeatureElements,
    selectedProgressionElements,
    selectedProficiencyIds,
    selectedProficiencyNames: [
      ...selectedProficiencyIds.map(humanizeGrantedId),
      ...rawProficiencySelectionIds.map(selectionLabelFromId),
      ...manualGrantsByKind.proficiency.map((grant) => grant.name),
    ],
    selectedRace,
    selectedRacialTraitElements,
    selectedSpellIds,
    selectedSubrace,
    spellGroups: activeSpellGroups,
    spells,
    selectedElements: [
      ...selectedClassFeatureElements,
      ...selectedProgressionElements,
      ...allSelectedFeatElements,
      ...selectedRacialTraitElements,
      ...selectedBackgroundFeatureElements,
      ...selectedManualFeatureElements,
    ],
  });
}

export function buildPdfCharacterFromBuilder(args: BuilderPdfSourceArgs): ResolvedPdfCharacter {
  const source: PdfResolveSource = {
    draft: args.draft,
    identity: {
      raceLabel: args.selectedRace?.race.name || "",
      subraceLabel: args.selectedSubrace?.name || "",
      classLabel: getClassLabel(args.classRecordsByEntry, args.draft),
      subclassLabel: getSubclassLabel(args.classRecordsByEntry, args.draft),
      backgroundLabel: args.selectedBackground?.background.name || "",
    },
    stats: buildStatCards(args),
    abilityRows: buildAbilityRows(args),
    skillRows: buildSkillRows(args),
    attackRows: buildAttackRows(args),
    proficiencyGroups: buildProficiencyGroups(args),
    featureCards: buildFeatureCards(args),
    companionCards: buildCompanionCards(args),
    inventoryCards: buildInventoryCards(args),
    spellCards: buildSpellCards(args),
    spellSlots: buildSpellSlots(args),
    spellList: buildSpellList(args),
    backstoryCards: buildBackstoryCards(args),
    backstory: args.draft.backstory,
    currency: args.draft.inventoryCurrency,
    manualGrants: args.draft.manualGrants,
    notes: [
      "Export derived from the current review-step resolved model.",
      ...(args.selectedExpertiseLabels.length ? [`Expertise: ${args.selectedExpertiseLabels.join(", ")}`] : []),
      ...(args.selectedProficiencyNames.length ? [`Proficiencies: ${args.selectedProficiencyNames.join(", ")}`] : []),
      ...(args.selectedLanguageNames.length ? [`Languages: ${args.selectedLanguageNames.join(", ")}`] : []),
      ...(args.selectedSpellIds.length ? [`Selected spells: ${args.selectedSpellIds.length}`] : []),
    ],
  };

  return resolvePdfCharacter(source);
}
