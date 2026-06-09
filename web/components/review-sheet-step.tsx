"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { hasMarkdownContent, MarkdownRenderer } from "@/components/markdown-editor";
import { downloadPortableCharacter } from "@/lib/characters/portable";
import type { BuiltInBackgroundRecord } from "@/lib/builtins/backgrounds";
import type { BuiltInClassRecord } from "@/lib/builtins/classes";
import type { BuiltInRaceRecord } from "@/lib/builtins/races";
import type { BuiltInElement, BuiltInRule } from "@/lib/builtins/types";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  formatAbilityModifier,
  type AbilityKey,
  type CharacterDraft,
  type CharacterManualGrant,
  type CharacterManualGrantKind,
} from "@/lib/characters/types";
import { getInventoryEffectSummary, resolveInventoryArmorClass } from "@/lib/equipment/inventory";
import {
  getPreparationCapacity,
  getSpellCastingTime,
  getSpellComponents,
  getSpellDuration,
  getSpellLevel,
  getSpellRange,
  getSpellSchool,
  getSpellSlotSummary,
  isSpellConcentration,
  isSpellRitual,
  type SpellSelectionGroup,
} from "@/lib/progression/spellcasting";
import {
  buildProficiencyFacts,
  hasSavingThrowProficiency,
  hasSkillProficiency,
  type ProficiencyFact,
} from "@/lib/proficiencies/facts";

type ReviewSheetTab = "character" | "actions" | "features" | "inventory" | "personality";

type ReviewSheetProps = {
  canSave: boolean;
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  completionChecklist: Array<{ label: string; done: boolean }>;
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  equipmentEffectSummary: ReturnType<typeof getInventoryEffectSummary>;
  equipmentProficiencies: {
    armor: string[];
    weapons: string[];
  };
  improvementBonuses: Partial<Record<AbilityKey, number>>;
  manualGrantsByKind: Record<CharacterManualGrantKind, CharacterManualGrant[]>;
  navigationWarnings: string[];
  racialBonuses: Partial<Record<AbilityKey, number>>;
  saveValidationMessage: string;
  selectedBackground: BuiltInBackgroundRecord | null;
  selectedBackgroundFeatureElements: BuiltInElement[];
  selectedClassFeatureElements: BuiltInElement[];
  selectedExpertiseIds: string[];
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
  isExportingPdf?: boolean;
  isImportingCharacter?: boolean;
  onExportPdf?: () => void;
  onImportCharacter?: (file: File) => void;
};

type ReviewResource = {
  id: string;
  label: string;
  value: string;
  meta?: string;
  slots?: Array<{ label: string; count: number }>;
};

type ReviewVital = {
  id: string;
  label: string;
  value: string;
  meta?: string;
};

type ReviewActionCard = {
  id: string;
  title: string;
  timing: string;
  summary: string;
  cost?: string;
  source?: string;
};

type ReviewCatalogView = "workbench" | "table";

type ReviewStatRow = {
  id: string;
  label: string;
  ability: string;
  total: number;
  proficient: boolean;
  expertise?: boolean;
};

type ReviewDetailState =
  | {
      kind: "spell";
      spell: BuiltInElement;
      groupLabel: string;
      ownerLabel: string;
      badges: string[];
    }
  | {
      kind: "feature";
      feature: BuiltInElement;
      badges: string[];
    }
  | {
      kind: "manual-grant";
      grant: CharacterManualGrant;
      badges: string[];
    }
  | {
      kind: "item";
      item: CharacterDraft["inventoryItems"][number];
      badges: string[];
    }
  | {
      kind: "action";
      action: ReviewActionCard;
      badges: string[];
    };

type ReviewEquipmentEffectLine = {
  id: string;
  label: string;
  value: string;
};

const TAB_OPTIONS: Array<{ id: ReviewSheetTab; label: string; eyebrow: string }> = [
  { id: "character", label: "Character", eyebrow: "Overview" },
  { id: "actions", label: "Actions & Spells", eyebrow: "Play surface" },
  { id: "features", label: "Features", eyebrow: "Reference" },
  { id: "inventory", label: "Inventory", eyebrow: "Gear" },
  { id: "personality", label: "Personality", eyebrow: "Narrative" },
];

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
  { match: /^Misty Visions$/i, timing: "Action", summary: "Cast Silent Image at will without spending a slot.", cost: "At will" },
];

const HIT_DIE_BY_CLASS_NAME: Record<string, number> = {
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

const HALF_CASTER_SLOT_TABLE: Record<number, number[]> = {
  1: [],
  2: [2],
  3: [3],
  4: [3],
  5: [4, 2],
  6: [4, 2],
  7: [4, 3],
  8: [4, 3],
  9: [4, 3, 2],
  10: [4, 3, 2],
  11: [4, 3, 3],
  12: [4, 3, 3],
  13: [4, 3, 3, 1],
  14: [4, 3, 3, 1],
  15: [4, 3, 3, 2],
  16: [4, 3, 3, 2],
  17: [4, 3, 3, 3, 1],
  18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2],
  20: [4, 3, 3, 3, 2],
};

const WARLOCK_PACT_SLOT_TABLE: Record<number, { slots: number; level: number }> = {
  1: { slots: 1, level: 1 },
  2: { slots: 2, level: 1 },
  3: { slots: 2, level: 2 },
  4: { slots: 2, level: 2 },
  5: { slots: 2, level: 3 },
  6: { slots: 2, level: 3 },
  7: { slots: 2, level: 4 },
  8: { slots: 2, level: 4 },
  9: { slots: 2, level: 5 },
  10: { slots: 2, level: 5 },
  11: { slots: 3, level: 5 },
  12: { slots: 3, level: 5 },
  13: { slots: 3, level: 5 },
  14: { slots: 3, level: 5 },
  15: { slots: 3, level: 5 },
  16: { slots: 3, level: 5 },
  17: { slots: 4, level: 5 },
  18: { slots: 4, level: 5 },
  19: { slots: 4, level: 5 },
  20: { slots: 4, level: 5 },
};

const SAVING_THROW_ABILITY_MAP: Record<AbilityKey, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

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

function humanizeGrantedId(value: string) {
  return value
    .replace(/^ID_/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function titleCaseWords(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeReviewLabel(value: string) {
  let cleaned = value.trim();
  if (!cleaned) {
    return "";
  }

  cleaned = cleaned
    .replace(/^ID_/, "")
    .replace(/_/g, " ")
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

  if (!cleaned) {
    return "";
  }

  const normalized = /^[A-Z0-9 ]+$/.test(cleaned) ? cleaned.toLowerCase() : cleaned;
  return titleCaseWords(normalized)
    .replace(/^Saving Throw /, "")
    .replace(/^Light Armor$/, "Light Armor")
    .replace(/^Medium Armor$/, "Medium Armor")
    .replace(/^Heavy Armor$/, "Heavy Armor")
    .replace(/^Shields$/, "Shields");
}

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

function getManualGrantKindLabel(kind: CharacterManualGrantKind) {
  switch (kind) {
    case "spell":
      return "Spell grant";
    case "proficiency":
      return "Proficiency grant";
    case "language":
      return "Language grant";
    case "feat":
      return "Feat grant";
    case "feature":
      return "Feature grant";
    case "asi":
      return "ASI grant";
    default:
      return "Manual grant";
  }
}

function getManualGrantSourceLabel(grant: CharacterManualGrant) {
  return grant.source || "Manual / DM grant";
}

function getManualGrantTraceLabel(grant: CharacterManualGrant) {
  return `${getManualGrantSourceLabel(grant)} · ${getManualGrantKindLabel(grant.kind)}`;
}

function getManualGrantSummary(grant: CharacterManualGrant) {
  if (grant.kind === "asi" && grant.ability && grant.amount) {
    const abilityLabel = ABILITY_LABELS[grant.ability];
    const modeLabel = grant.mode === "set" ? "set to" : "increase";
    return `${abilityLabel} ${modeLabel} ${grant.amount}.`;
  }

  return grant.note || grant.description || "Open details";
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentencePreview(value: string, fallback = "No short summary available.") {
  const cleaned = stripHtml(value);
  if (!cleaned) {
    return fallback;
  }
  const sentence = cleaned.match(/.+?[.!?](?:\s|$)/)?.[0]?.trim() ?? cleaned;
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

function formatFeet(value: number) {
  return `${value} ft.`;
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

function resolveClassName(record: BuiltInClassRecord | null, entry: CharacterDraft["classEntries"][number]) {
  return record?.class.name || entry.classId || "";
}

function resolveHitDie(className: string) {
  const normalized = className.toLowerCase().replace(/\s+/g, "");
  return HIT_DIE_BY_CLASS_NAME[normalized] ?? 8;
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

function createAbilityBonusMap() {
  return {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  } satisfies Record<AbilityKey, number>;
}

function collectAbilityBonusesFromElements(elements: BuiltInElement[]) {
  return elements.reduce<Record<AbilityKey, number>>((totals, element) => {
    element.rules.forEach((rule) => {
      if (rule.kind !== "stat" || !ABILITY_KEYS.includes(rule.name as AbilityKey)) {
        return;
      }
      const ability = rule.name as AbilityKey;
      const amount = Number(rule.value);
      if (Number.isFinite(amount)) {
        totals[ability] += amount;
      }
    });
    return totals;
  }, createAbilityBonusMap());
}

function getFallbackSpellSlotSummary(className: string, level: number) {
  const normalized = className.toLowerCase();
  if (/warlock/.test(normalized)) {
    const pact = WARLOCK_PACT_SLOT_TABLE[level];
    return pact ? `Pact L${pact.level}:${pact.slots}` : "";
  }
  if (/artificer|paladin|ranger/.test(normalized)) {
    const slots = HALF_CASTER_SLOT_TABLE[level] ?? [];
    return slots.length ? slots.map((count, index) => `L${index + 1}:${count}`).join(" • ") : "";
  }
  if (/bard|cleric|druid|sorcerer|wizard/.test(normalized)) {
    const slots = FULL_CASTER_SLOT_TABLE[level] ?? [];
    return slots.length ? slots.map((count, index) => `L${index + 1}:${count}`).join(" • ") : "";
  }
  return "";
}

function getFallbackSpellSlotEntries(className: string, level: number) {
  const normalized = className.toLowerCase();
  if (/warlock/.test(normalized)) {
    const pact = WARLOCK_PACT_SLOT_TABLE[level];
    return pact ? [{ label: `Pact ${pact.level}`, count: pact.slots }] : [];
  }
  if (/artificer|paladin|ranger/.test(normalized)) {
    return (HALF_CASTER_SLOT_TABLE[level] ?? []).map((count, index) => ({
      label: `L${index + 1}`,
      count,
    }));
  }
  if (/bard|cleric|druid|sorcerer|wizard/.test(normalized)) {
    return (FULL_CASTER_SLOT_TABLE[level] ?? []).map((count, index) => ({
      label: `L${index + 1}`,
      count,
    }));
  }
  return [];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    .map(stripHtml);

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
  const parts = args.draft.classEntries.flatMap((entry, index) => {
    if (!entry.classId || entry.level <= 0) {
      return [];
    }
    const className = resolveClassName(args.classRecordsByEntry[index], entry);
    const hitDie = resolveHitDie(className);
    return [`${entry.level}d${hitDie}`];
  });

  return parts.join(" • ") || "—";
}

function deriveCharacterVitals(args: {
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  selectedElements: BuiltInElement[];
  selectedRace: BuiltInRaceRecord | null;
  selectedSubrace: BuiltInElement | null;
}) {
  const proficiencyBonus = 2 + Math.floor((Math.max(1, args.draft.level) - 1) / 4);
  const initiativeBonus =
    getAbilityModifier(args.effectiveAbilities.dexterity) +
    args.selectedElements.reduce((sum, element) => sum + getNumericRuleBonus(element, /^initiative$/i), 0);
  const speed = deriveWalkingSpeed({
    selectedRace: args.selectedRace,
    selectedSubrace: args.selectedSubrace,
    selectedElements: args.selectedElements,
  });
  const armorClass = deriveArmorClass({
    draft: args.draft,
    effectiveAbilities: args.effectiveAbilities,
  });
  const hitPoints = deriveHitPointSummary({
    draft: args.draft,
    classRecordsByEntry: args.classRecordsByEntry,
    effectiveAbilities: args.effectiveAbilities,
    selectedElements: args.selectedElements,
  });

  return [
    { id: "hp", label: "HP", value: hitPoints.value, meta: hitPoints.meta },
    { id: "ac", label: "AC", value: `${armorClass.value}`, meta: armorClass.meta },
    { id: "initiative", label: "Initiative", value: `${initiativeBonus >= 0 ? "+" : ""}${initiativeBonus}`, meta: "Dexterity-based" },
    {
      id: "speed",
      label: "Speed",
      value: formatFeet(speed.total),
      meta: speed.bonus ? `${formatFeet(speed.base)} base • ${speed.bonus >= 0 ? "+" : ""}${speed.bonus} bonus` : `${formatFeet(speed.base)} base`,
    },
    { id: "pb", label: "Prof. bonus", value: `${proficiencyBonus >= 0 ? "+" : ""}${proficiencyBonus}`, meta: `Level ${args.draft.level}` },
    { id: "hit-dice", label: "Hit dice", value: deriveHitDiceSummary(args), meta: "Rest recovery pool" },
  ] satisfies ReviewVital[];
}

function titleizeBackstoryKey(key: string) {
  switch (key) {
    case "alliesAndOrganizations":
      return "Allies and Organizations";
    case "additionalFeatures":
      return "Additional Features";
    case "personalityTraits":
      return "Personality Traits";
    default:
      return key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (char) => char.toUpperCase());
  }
}

function uniqueByNameAndSource<T extends { name: string; source?: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name.toLowerCase()}::${(item.source ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toFeatureMarkup(element: BuiltInElement) {
  return element.descriptionHtml || "";
}

function FeatureContent({ element }: { element: BuiltInElement }) {
  const markup = toFeatureMarkup(element);

  if (markup) {
    return <div className="review-sheet__featureBody" dangerouslySetInnerHTML={{ __html: markup }} />;
  }

  if (element.description) {
    return <p className="builder-summary__meta">{element.description}</p>;
  }

  return <p className="builder-summary__meta">No additional reference text in the current source.</p>;
}

function formatReviewEquipmentEffectLine(line: string, index: number): ReviewEquipmentEffectLine {
  const cleaned = line.trim();
  const match = cleaned.match(/^(.+?)\s+\(([-+]\d+)\)$/);
  if (match) {
    return {
      id: `${match[1]}-${match[2]}-${index}`,
      label: match[1],
      value: match[2],
    };
  }

  const [label, ...rest] = cleaned.split(":");
  return {
    id: `${cleaned}-${index}`,
    label: rest.length ? label.trim() : cleaned,
    value: rest.length ? rest.join(":").trim() : "",
  };
}

function deriveReviewResources(args: {
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  equipmentEffectSummary: ReturnType<typeof getInventoryEffectSummary>;
  selectedClassFeatureElements: BuiltInElement[];
  spellGroups: SpellSelectionGroup[];
}) {
  const resources: ReviewResource[] = [
    {
      id: "attunement",
      label: "Attunement",
      value: `${args.equipmentEffectSummary.attunedCount}/${args.equipmentEffectSummary.attunementLimit}`,
      meta: "Active attuned items",
    },
  ];

  args.classRecordsByEntry.forEach((record, index) => {
    const entry = args.draft.classEntries[index];
    if (!record || !entry?.classId) {
      return;
    }

    const className = record.class.name;
    const featureNames = new Set(args.selectedClassFeatureElements.map((feature) => feature.name.toLowerCase()));
    const slotSummary = getSpellSlotSummary(record.class.rules, entry.level);
    const fallbackSlotSummary = !slotSummary.length ? getFallbackSpellSlotSummary(className, entry.level) : "";
    const slotEntries = slotSummary.length
      ? slotSummary.map(({ slotLevel, count }) => ({ label: `L${slotLevel}`, count }))
      : getFallbackSpellSlotEntries(className, entry.level);
    if (slotSummary.length || fallbackSlotSummary) {
      resources.push({
        id: `${record.class.id}-slots`,
        label: `${className} slots`,
        value: slotSummary.length
          ? slotSummary.map(({ slotLevel, count }) => `L${slotLevel}:${count}`).join(" • ")
          : fallbackSlotSummary,
        meta: slotSummary.length ? "Explicit slot progression" : "Standard class progression",
        slots: slotEntries,
      });
    }

    const preparationCapacity = getPreparationCapacity(record.class.rules, entry.level, args.effectiveAbilities);
    if (preparationCapacity > 0 && args.spellGroups.some((group) => group.ownerLabel === className && group.kind === "prepared")) {
      resources.push({
        id: `${record.class.id}-prepared`,
        label: `${className} prepared`,
        value: `${preparationCapacity}`,
        meta: "Preparation capacity",
      });
    }

    if (/monk/i.test(className) && featureNames.has("ki")) {
      resources.push({ id: `${record.class.id}-ki`, label: "Ki points", value: `${entry.level}`, meta: "Modeled from monk level" });
    }

    if (/sorcerer/i.test(className) && (featureNames.has("font of magic") || featureNames.has("sorcery points"))) {
      resources.push({ id: `${record.class.id}-sorcery`, label: "Sorcery points", value: `${entry.level}`, meta: "Modeled from sorcerer level" });
    }

    if (/paladin/i.test(className) && featureNames.has("lay on hands")) {
      resources.push({ id: `${record.class.id}-lay-on-hands`, label: "Lay on Hands", value: `${entry.level * 5}`, meta: "Healing pool" });
    }

    if (/fighter/i.test(className) && featureNames.has("action surge")) {
      resources.push({ id: `${record.class.id}-action-surge`, label: "Action Surge", value: "1 use", meta: "Short-rest refresh" });
    }

    if (/fighter/i.test(className) && featureNames.has("second wind")) {
      resources.push({ id: `${record.class.id}-second-wind`, label: "Second Wind", value: "1 use", meta: "Short-rest refresh" });
    }

    if (/druid/i.test(className) && featureNames.has("wild shape")) {
      resources.push({ id: `${record.class.id}-wild-shape`, label: "Wild Shape", value: "2 uses", meta: "Baseline 2014 pool" });
    }

    if (/cleric|paladin/i.test(className) && featureNames.has("channel divinity")) {
      resources.push({ id: `${record.class.id}-channel-divinity`, label: "Channel Divinity", value: "1 use", meta: "Tracked conservatively" });
    }

    if (/bard/i.test(className) && featureNames.has("bardic inspiration")) {
      resources.push({
        id: `${record.class.id}-bardic-inspiration`,
        label: "Bardic Inspiration",
        value: `${Math.max(1, Math.floor((args.effectiveAbilities.charisma - 10) / 2))}`,
        meta: "Uses based on Charisma modifier",
      });
    }
  });

  return uniqueById(resources);
}

function deriveSavingThrowRows(args: {
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  proficiencyFacts: ProficiencyFact[];
}) {
  const proficiencyBonus = 2 + Math.floor((Math.max(1, args.draft.level) - 1) / 4);
  return ABILITY_KEYS.map((ability) => {
    const proficient = hasSavingThrowProficiency(args.proficiencyFacts, ability);
    const total = getAbilityModifier(args.effectiveAbilities[ability]) + (proficient ? proficiencyBonus : 0);
    return {
      id: `save-${ability}`,
      label: SAVING_THROW_ABILITY_MAP[ability],
      ability: ABILITY_LABELS[ability].slice(0, 3),
      total,
      proficient,
    } satisfies ReviewStatRow;
  });
}

function deriveSkillRows(args: {
  draft: CharacterDraft;
  effectiveAbilities: Record<AbilityKey, number>;
  selectedExpertiseLabels: string[];
  selectedClassFeatureElements: BuiltInElement[];
  proficiencyFacts: ProficiencyFact[];
}) {
  const proficiencyBonus = 2 + Math.floor((Math.max(1, args.draft.level) - 1) / 4);
  const expertiseLabels = new Set(args.selectedExpertiseLabels.map((value) => value.toLowerCase()));
  const hasJackOfAllTrades = args.selectedClassFeatureElements.some((feature) => /jack of all trades/i.test(feature.name));
  return SKILL_ABILITY_MAP.map((skill) => {
    const expertise = expertiseLabels.has(skill.label.toLowerCase()) ||
      hasSkillProficiency(args.proficiencyFacts, skill.id, "expertise");
    const proficient = expertise || hasSkillProficiency(args.proficiencyFacts, skill.id, "proficient");
    const tier = expertise ? 2 : proficient ? 1 : 0;
    const jackBonus = !proficient && hasJackOfAllTrades ? Math.floor(proficiencyBonus / 2) : 0;
    const total = getAbilityModifier(args.effectiveAbilities[skill.ability]) + proficiencyBonus * tier + jackBonus;
    return {
      id: `skill-${skill.id}`,
      label: skill.label,
      ability: ABILITY_LABELS[skill.ability].slice(0, 3),
      total,
      proficient,
      expertise,
    } satisfies ReviewStatRow;
  });
}

function derivePassivePerception(skillRows: ReviewStatRow[]) {
  const perception = skillRows.find((row) => row.id === "skill-perception");
  return 10 + (perception?.total ?? 0);
}

function deriveAttacksPerAction(args: {
  classRecordsByEntry: Array<BuiltInClassRecord | null>;
  draft: CharacterDraft;
  selectedElements: BuiltInElement[];
}) {
  let attacks = 1;

  args.draft.classEntries.forEach((entry, index) => {
    if (!entry.classId || entry.level <= 0) {
      return;
    }
    const className = resolveClassName(args.classRecordsByEntry[index], entry).toLowerCase();
    if (/fighter/.test(className)) {
      if (entry.level >= 20) {
        attacks = Math.max(attacks, 4);
      } else if (entry.level >= 11) {
        attacks = Math.max(attacks, 3);
      } else if (entry.level >= 5) {
        attacks = Math.max(attacks, 2);
      }
    } else if (/artificer|barbarian|monk|paladin|ranger/.test(className) && entry.level >= 5) {
      attacks = Math.max(attacks, 2);
    }
  });

  if (
    attacks === 1 &&
    args.selectedElements.some((element) => /^extra attack$/i.test(element.name) || /extra attack/i.test(element.description))
  ) {
    attacks = 2;
  }

  return attacks;
}

function deriveWeaponActionCards(items: CharacterDraft["inventoryItems"]) {
  return items
    .filter((item) => item.equipped && item.category === "weapon")
    .map((item) => ({
      id: `weapon-${item.id}`,
      title: item.name,
      timing: "Attack",
      summary: item.damage || item.baseDamage || "Weapon attack",
      cost: item.attackBonus ? `Modifier ${item.attackBonus}` : undefined,
      source: item.sourceLabel,
    }));
}

function deriveFeatureActionCards(elements: BuiltInElement[]) {
  return uniqueById(
    elements.flatMap((element) => {
      const rule = FEATURE_ACTION_RULES.find((entry) => entry.match.test(element.name));
      if (!rule) {
        return [];
      }

      return [
        {
          id: `feature-action-${element.id}`,
          title: element.name,
          timing: rule.timing,
          summary: rule.summary,
          cost: rule.cost,
          source: element.source,
        } satisfies ReviewActionCard,
      ];
    }),
  );
}

function deriveSpellGroupCards(
  groups: SpellSelectionGroup[],
  spells: BuiltInElement[],
  spellSelections: CharacterDraft["spellSelections"],
) {
  const spellsById = new Map(spells.map((spell) => [spell.id, spell]));

  return groups.map((group) => {
    const selectedIds = spellSelections[group.id] ?? [];
    const ids = [...new Set([...(group.grantedSpellIds ?? []), ...selectedIds])];
    const entries = ids
      .map((id) => spellsById.get(id))
      .filter((spell): spell is BuiltInElement => Boolean(spell));

    return {
      group,
      entries,
    };
  });
}

function getFeaturePreview(element: BuiltInElement) {
  if (element.prerequisite) {
    return element.prerequisite;
  }

  if (element.descriptionHtml) {
    return sentencePreview(element.descriptionHtml);
  }

  return element.description || "No short summary available.";
}

function getSpellPreview(spell: BuiltInElement) {
  return [
    getSpellLevel(spell) === 0 ? "Cantrip" : `Level ${getSpellLevel(spell)}`,
    getSpellSchool(spell),
    getSpellCastingTime(spell),
    getSpellRange(spell),
    getSpellDuration(spell),
    isSpellRitual(spell) ? "Ritual" : "",
    isSpellConcentration(spell) ? "Concentration" : "",
  ]
    .filter(Boolean)
    .join(" • ");
}

function getInventoryItemBadges(item: CharacterDraft["inventoryItems"][number]) {
  return uniqueStrings([
    item.category,
    item.family ?? "",
    item.rarity ?? "",
    item.equipped ? "Equipped" : "Stored",
    item.attuned ? "Attuned" : item.attunable ? "Attunable" : "",
  ]);
}

function getInventoryItemPreview(item: CharacterDraft["inventoryItems"][number]) {
  const parts = uniqueStrings([
    item.baseDamage || item.damage || "",
    item.attackBonus ? `Modifier ${item.attackBonus}` : "",
    item.notes ? sentencePreview(item.notes) : "",
  ]);

  return parts.join(" • ") || "No active mechanics shown.";
}

function buildFeatureSections(args: {
  selectedBackground: BuiltInBackgroundRecord | null;
  selectedBackgroundFeatureElements: BuiltInElement[];
  selectedClassFeatureElements: BuiltInElement[];
  selectedFeatElements: BuiltInElement[];
  selectedManualFeatureElements: BuiltInElement[];
  selectedProgressionElements: BuiltInElement[];
  selectedRace: BuiltInRaceRecord | null;
  selectedRacialTraitElements: BuiltInElement[];
  selectedSubrace: BuiltInElement | null;
  manualGrantsByKind: Record<CharacterManualGrantKind, CharacterManualGrant[]>;
}) {
  const sections: Array<{ id: string; title: string; items: Array<BuiltInElement | CharacterManualGrant> }> = [];
  const manualFeatureGrantsWithoutRefs = args.manualGrantsByKind.feature.filter((grant) => !grant.refId);
  const manualFeatGrantsWithoutRefs = args.manualGrantsByKind.feat.filter((grant) => !grant.refId);

  const raceItems = [...args.selectedRacialTraitElements];
  if (raceItems.length) {
    sections.push({ id: "race", title: "Race & lineage", items: uniqueByNameAndSource(raceItems as BuiltInElement[]) });
  }

  const classFeatures = args.selectedClassFeatureElements.filter((item) => !/archetype/i.test(item.type));
  const subclassFeatures = args.selectedClassFeatureElements.filter((item) => /archetype/i.test(item.type));
  const progressionProficiencies = args.selectedProgressionElements.filter(
    (item) => /proficiency/i.test(item.type) || /proficiency/i.test(item.name),
  );
  const progressionLanguages = args.selectedProgressionElements.filter(
    (item) => /language/i.test(item.type) || /language/i.test(item.name),
  );
  const buildChoiceItems = args.selectedProgressionElements.filter(
    (item) =>
      !/(^|\b)(language|proficiency)\b/i.test(item.type) &&
      !/(language|proficiency) option/i.test(item.name),
  );

  if (classFeatures.length) {
    sections.push({
      id: "class",
      title: "Class features",
      items: uniqueByNameAndSource(classFeatures),
    });
  }

  if (subclassFeatures.length) {
    sections.push({
      id: "subclass",
      title: "Subclass and specialization",
      items: uniqueByNameAndSource(subclassFeatures),
    });
  }

  if (buildChoiceItems.length) {
    sections.push({
      id: "build-choices",
      title: "Build choices and unlocked picks",
      items: uniqueByNameAndSource(buildChoiceItems),
    });
  }

  if (progressionProficiencies.length) {
    sections.push({
      id: "proficiency-choices",
      title: "Unlocked proficiencies and tools",
      items: uniqueByNameAndSource(progressionProficiencies),
    });
  }

  if (progressionLanguages.length) {
    sections.push({
      id: "language-choices",
      title: "Unlocked languages",
      items: uniqueByNameAndSource(progressionLanguages),
    });
  }

  const backgroundItems = [...args.selectedBackgroundFeatureElements];
  if (backgroundItems.length) {
    sections.push({ id: "background", title: "Background", items: uniqueByNameAndSource(backgroundItems as BuiltInElement[]) });
  }

  if (args.selectedFeatElements.length) {
    sections.push({ id: "feats", title: "Feats", items: uniqueByNameAndSource(args.selectedFeatElements) });
  }

  if (args.selectedManualFeatureElements.length) {
    sections.push({
      id: "manual-feature-elements",
      title: "Manual / DM feature grants",
      items: uniqueByNameAndSource(args.selectedManualFeatureElements),
    });
  }

  if (manualFeatureGrantsWithoutRefs.length) {
    sections.push({ id: "manual-feature", title: "Manual / DM custom features", items: manualFeatureGrantsWithoutRefs });
  }

  if (manualFeatGrantsWithoutRefs.length) {
    sections.push({ id: "manual-feat", title: "Manual / DM custom feats", items: manualFeatGrantsWithoutRefs });
  }

  if (args.manualGrantsByKind.asi.length) {
    sections.push({ id: "manual-asi", title: "Manual / DM ASIs", items: args.manualGrantsByKind.asi });
  }

  return sections;
}

function renderManualGrant(grant: CharacterManualGrant, onOpen: () => void) {
  return (
    <button className="review-sheet__featureTile" key={grant.id} type="button" onClick={onOpen}>
      <div className="review-sheet__featureTileHeader">
        <strong>{grant.name}</strong>
        <span>{getManualGrantTraceLabel(grant)}</span>
      </div>
      <div className="review-sheet__featureTileBody">
        <p>{getManualGrantSummary(grant)}</p>
      </div>
    </button>
  );
}

function ReviewDetailDrawer({
  detail,
  onClose,
}: {
  detail: ReviewDetailState | null;
  onClose: () => void;
}) {
  if (!detail) {
    return null;
  }

  let title = "";
  let subtitle = "";
  let body: ReactNode = null;

  if (detail.kind === "spell") {
    title = detail.spell.name;
    subtitle = detail.spell.source;
    body = (
      <>
        <div className="review-sheet__detailGrid">
          <div className="review-sheet__detailStat">
            <span>Level</span>
            <strong>{getSpellLevel(detail.spell) === 0 ? "Cantrip" : getSpellLevel(detail.spell)}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>School</span>
            <strong>{getSpellSchool(detail.spell)}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Casting time</span>
            <strong>{getSpellCastingTime(detail.spell)}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Range</span>
            <strong>{getSpellRange(detail.spell)}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Duration</span>
            <strong>{getSpellDuration(detail.spell)}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Components</span>
            <strong>{getSpellComponents(detail.spell) || "—"}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Classes</span>
            <strong>{detail.ownerLabel || "—"}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Spell list</span>
            <strong>{detail.groupLabel}</strong>
          </div>
        </div>
        <div className="review-sheet__detailBody">
          <FeatureContent element={detail.spell} />
        </div>
      </>
    );
  }

  if (detail.kind === "feature") {
    title = detail.feature.name;
    subtitle = detail.feature.source || detail.feature.type;
    body = (
      <div className="review-sheet__detailBody">
        <FeatureContent element={detail.feature} />
      </div>
    );
  }

  if (detail.kind === "manual-grant") {
    title = detail.grant.name;
    subtitle = getManualGrantTraceLabel(detail.grant);
    body = (
      <div className="review-sheet__detailBody">
        {detail.grant.kind === "asi" && detail.grant.ability && detail.grant.amount ? (
          <p className="builder-summary__meta">
            {ABILITY_LABELS[detail.grant.ability]} {detail.grant.mode === "set" ? "set to" : "increase"} {detail.grant.amount}.
          </p>
        ) : null}
        {detail.grant.note ? <p className="builder-summary__meta">{detail.grant.note}</p> : null}
        {detail.grant.description ? <p className="builder-summary__meta">{detail.grant.description}</p> : null}
      </div>
    );
  }

  if (detail.kind === "item") {
    title = detail.item.name;
    subtitle = detail.item.sourceLabel;
    body = (
      <>
        <div className="review-sheet__detailGrid">
          <div className="review-sheet__detailStat">
            <span>Category</span>
            <strong>{detail.item.category}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Quantity</span>
            <strong>{detail.item.quantity}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>State</span>
            <strong>{detail.item.equipped ? "Equipped" : "Stored"}</strong>
          </div>
          <div className="review-sheet__detailStat">
            <span>Attunement</span>
            <strong>{detail.item.attuned ? "Attuned" : detail.item.attunable ? "Attunable" : "No attunement"}</strong>
          </div>
          {detail.item.baseDamage || detail.item.damage ? (
            <div className="review-sheet__detailStat">
              <span>Damage</span>
              <strong>{detail.item.damage || detail.item.baseDamage}</strong>
            </div>
          ) : null}
          {detail.item.attackBonus ? (
            <div className="review-sheet__detailStat">
              <span>Modifier</span>
              <strong>{detail.item.attackBonus}</strong>
            </div>
          ) : null}
        </div>
        {detail.item.sheetDescription ? (
          <div className="review-sheet__detailBody">
            <MarkdownRenderer compact value={detail.item.sheetDescription} />
          </div>
        ) : detail.item.detailHtml ? (
          <div className="review-sheet__detailBody" dangerouslySetInnerHTML={{ __html: detail.item.detailHtml }} />
        ) : detail.item.notes ? (
          <div className="review-sheet__detailBody">
            <p className="builder-summary__meta">{detail.item.notes}</p>
          </div>
        ) : null}
      </>
    );
  }

  if (detail.kind === "action") {
    title = detail.action.title;
    subtitle = detail.action.source || detail.action.timing;
    body = (
      <div className="review-sheet__detailBody">
        <p className="builder-summary__meta">{detail.action.summary}</p>
        {detail.action.cost ? <p className="builder-summary__meta">Cost: {detail.action.cost}</p> : null}
      </div>
    );
  }

  return (
    <div className="review-sheet__detailOverlay" role="dialog" aria-modal="true">
      <button aria-label="Close details" className="review-sheet__detailBackdrop" type="button" onClick={onClose} />
      <aside className="review-sheet__detailDrawer">
        <div className="review-sheet__detailHeader">
          <div className="review-sheet__detailTitle">
            <span className="builder-panel__label">Details</span>
            <strong className="builder-summary__name">{title}</strong>
            <p className="builder-summary__meta">{subtitle}</p>
          </div>
          <button className="builder-button builder-button--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="review-sheet__chipList">
          {detail.badges.map((badge) => (
            <span className="review-sheet__chip" key={badge}>
              {badge}
            </span>
          ))}
        </div>
        {body}
      </aside>
    </div>
  );
}

export function ReviewSheetStep(props: ReviewSheetProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ReviewSheetTab>("character");
  const [detail, setDetail] = useState<ReviewDetailState | null>(null);
  const [actionsView, setActionsView] = useState<ReviewCatalogView>("workbench");
  const [featuresView, setFeaturesView] = useState<ReviewCatalogView>("workbench");
  const [inventoryView, setInventoryView] = useState<ReviewCatalogView>("workbench");

  const selectedSheetElements = useMemo(
    () =>
      uniqueById([
        ...props.selectedClassFeatureElements,
        ...props.selectedProgressionElements,
        ...props.selectedFeatElements,
        ...props.selectedRacialTraitElements,
        ...props.selectedBackgroundFeatureElements,
      ]),
    [
      props.selectedBackgroundFeatureElements,
      props.selectedClassFeatureElements,
      props.selectedFeatElements,
      props.selectedProgressionElements,
      props.selectedRacialTraitElements,
    ],
  );

  const resources = useMemo(
    () =>
      deriveReviewResources({
        classRecordsByEntry: props.classRecordsByEntry,
        draft: props.draft,
        effectiveAbilities: props.effectiveAbilities,
        equipmentEffectSummary: props.equipmentEffectSummary,
        selectedClassFeatureElements: props.selectedClassFeatureElements,
        spellGroups: props.spellGroups,
      }),
    [
      props.classRecordsByEntry,
      props.draft,
      props.effectiveAbilities,
      props.equipmentEffectSummary,
      props.selectedClassFeatureElements,
      props.spellGroups,
    ],
  );

  const characterVitals = useMemo(
    () =>
      deriveCharacterVitals({
        classRecordsByEntry: props.classRecordsByEntry,
        draft: props.draft,
        effectiveAbilities: props.effectiveAbilities,
        selectedElements: selectedSheetElements,
        selectedRace: props.selectedRace,
        selectedSubrace: props.selectedSubrace,
      }),
    [
      props.classRecordsByEntry,
      props.draft,
      props.effectiveAbilities,
      props.selectedRace,
      props.selectedSubrace,
      selectedSheetElements,
    ],
  );

  const actionCards = useMemo(
    () =>
      uniqueById([
        ...deriveWeaponActionCards(props.draft.inventoryItems),
        ...deriveFeatureActionCards([
          ...props.selectedClassFeatureElements,
          ...props.selectedProgressionElements,
          ...props.selectedFeatElements,
        ]),
      ]),
    [
      props.draft.inventoryItems,
      props.selectedClassFeatureElements,
      props.selectedProgressionElements,
      props.selectedFeatElements,
    ],
  );

  const spellGroupCards = useMemo(
    () => deriveSpellGroupCards(props.spellGroups, props.spells, props.draft.spellSelections),
    [props.draft.spellSelections, props.spellGroups, props.spells],
  );

  const featureSections = useMemo(
    () =>
      buildFeatureSections({
        selectedBackground: props.selectedBackground,
        selectedBackgroundFeatureElements: props.selectedBackgroundFeatureElements,
        selectedClassFeatureElements: props.selectedClassFeatureElements,
        selectedFeatElements: props.selectedFeatElements,
        selectedManualFeatureElements: props.selectedManualFeatureElements,
        selectedProgressionElements: props.selectedProgressionElements,
        selectedRace: props.selectedRace,
        selectedRacialTraitElements: props.selectedRacialTraitElements,
        selectedSubrace: props.selectedSubrace,
        manualGrantsByKind: props.manualGrantsByKind,
      }),
    [
      props.manualGrantsByKind,
      props.selectedBackground,
      props.selectedBackgroundFeatureElements,
      props.selectedClassFeatureElements,
      props.selectedFeatElements,
      props.selectedManualFeatureElements,
      props.selectedProgressionElements,
      props.selectedRace,
      props.selectedRacialTraitElements,
      props.selectedSubrace,
    ],
  );

  const classSplit = props.draft.classEntries
    .flatMap((entry, index) => {
      const record = props.classRecordsByEntry[index];
      return entry.classId && record ? [`${record.class.name} ${entry.level}`] : [];
    })
    .join(" / ");
  const activeCompanion =
    props.selectedProgressionElements.find((element) => element.type === "Companion") ?? null;

  const readinessWarnings = [
    ...(props.saveValidationMessage ? [props.saveValidationMessage] : []),
    ...props.navigationWarnings,
  ].filter(Boolean);

  const selectedProficiencyFacts = useMemo(
    () =>
      buildProficiencyFacts([
        // Proficient sources
        ...props.selectedProficiencyIds.map((id) => ({ id, tier: "proficient" as const })),
        ...props.selectedProficiencyNames.map((label) => ({ label: normalizeReviewLabel(label), tier: "proficient" as const })),
        ...props.manualGrantsByKind.proficiency.map((grant) => ({
          id: grant.refId,
          label: normalizeReviewLabel(grant.name),
          tier: "proficient" as const,
        })),
        // Equipment-tab grants (armor + weapons from gear)
        ...props.equipmentProficiencies.armor.map((value) => ({ label: normalizeReviewLabel(value), tier: "proficient" as const })),
        ...props.equipmentProficiencies.weapons.map((value) => ({ label: normalizeReviewLabel(value), tier: "proficient" as const })),
        // Expertise sources — tier explicitly "expertise" (higher than proficient)
        ...props.selectedExpertiseIds.map((id) => ({ id, tier: "expertise" as const })),
        ...props.selectedExpertiseLabels.map((label) => ({ label, tier: "expertise" as const })),
      ]),
    [
      props.equipmentProficiencies.armor,
      props.equipmentProficiencies.weapons,
      props.manualGrantsByKind.proficiency,
      props.selectedExpertiseIds,
      props.selectedExpertiseLabels,
      props.selectedProficiencyIds,
      props.selectedProficiencyNames,
    ],
  );

  const selectedProficiencyLabels = useMemo(
    () => {
      const equipmentLabels = new Set(
        [
          ...props.equipmentProficiencies.armor.map((value) => normalizeReviewLabel(value)),
          ...props.equipmentProficiencies.weapons.map((value) => normalizeReviewLabel(value)),
        ].map((value) => value.toLowerCase()),
      );

      return uniqueStrings(selectedProficiencyFacts.map((fact) => normalizeReviewLabel(fact.label))).filter(
        (value) => !equipmentLabels.has(value.toLowerCase()),
      );
    },
    [
      props.equipmentProficiencies.armor,
      props.equipmentProficiencies.weapons,
      selectedProficiencyFacts,
    ],
  );

  const selectedLanguageLabels = useMemo(
    () =>
      uniqueStrings([
        ...props.selectedLanguageNames.map(normalizeReviewLabel),
        ...props.selectedLanguageIds.map(humanizeGrantedId).map(normalizeReviewLabel),
        ...props.manualGrantsByKind.language.map((grant) => normalizeReviewLabel(grant.name)),
      ]),
    [props.manualGrantsByKind.language, props.selectedLanguageIds, props.selectedLanguageNames],
  );

  const selectedExpertiseLabels = useMemo(
    () => uniqueStrings(props.selectedExpertiseLabels.map(normalizeReviewLabel)),
    [props.selectedExpertiseLabels],
  );

  const manualFeatureBonuses = useMemo(
    () => collectAbilityBonusesFromElements(props.selectedManualFeatureElements),
    [props.selectedManualFeatureElements],
  );

  const allEffectLines = [
    ...props.equipmentEffectSummary.acLines,
    ...props.equipmentEffectSummary.weaponLines,
    ...props.equipmentEffectSummary.itemGrantLines,
  ];
  const formattedEffectLines = allEffectLines.map(formatReviewEquipmentEffectLine);

  const spellTableRows = useMemo(
    () =>
      spellGroupCards.flatMap(({ group, entries }) =>
        entries.map((spell) => ({
          id: `${group.id}-${spell.id}`,
          spell,
          groupTitle: group.title,
          ownerLabel: group.ownerLabel,
        })),
      ),
    [spellGroupCards],
  );

  const savingThrowRows = useMemo(
    () =>
      deriveSavingThrowRows({
        draft: props.draft,
        effectiveAbilities: props.effectiveAbilities,
        proficiencyFacts: selectedProficiencyFacts,
      }),
    [props.draft, props.effectiveAbilities, selectedProficiencyFacts],
  );

  const skillRows = useMemo(
    () =>
      deriveSkillRows({
        draft: props.draft,
        effectiveAbilities: props.effectiveAbilities,
        selectedExpertiseLabels: props.selectedExpertiseLabels,
        selectedClassFeatureElements: props.selectedClassFeatureElements,
        proficiencyFacts: selectedProficiencyFacts,
      }),
    [props.draft, props.effectiveAbilities, props.selectedClassFeatureElements, props.selectedExpertiseLabels, selectedProficiencyFacts],
  );

  const passivePerception = useMemo(() => derivePassivePerception(skillRows), [skillRows]);
  const attacksPerAction = useMemo(
    () =>
      deriveAttacksPerAction({
        classRecordsByEntry: props.classRecordsByEntry,
        draft: props.draft,
        selectedElements: selectedSheetElements,
      }),
    [props.classRecordsByEntry, props.draft, selectedSheetElements],
  );

  return (
    <section className="builder-stepPanel review-sheet">
      <div className="builder-stepPanel__intro review-sheet__intro">
        <div>
          <span className="route-shell__tag">Review</span>
          <h2 className="route-shell__title">Read the draft like a real character sheet</h2>
          <p className="route-shell__copy">
            This is the web-first sheet surface: stats, resources, actions, spells, features, inventory, and personality in one place without waiting for PDF export.
          </p>
        </div>
        <div className="review-sheet__actions">
          {props.onImportCharacter ? (
            <>
              <input
                ref={importInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    props.onImportCharacter?.(file);
                  }
                  event.target.value = "";
                }}
              />
              <button
                className="button button--secondary review-sheet__exportButton"
                type="button"
                disabled={props.isImportingCharacter}
                onClick={() => importInputRef.current?.click()}
              >
                {props.isImportingCharacter ? "Importing..." : "Import JSON"}
              </button>
            </>
          ) : null}
          <button
            className="button button--secondary review-sheet__exportButton"
            type="button"
            onClick={() => downloadPortableCharacter(props.draft)}
          >
            Export JSON
          </button>
          {props.onExportPdf ? (
            <button
              className="button button--secondary review-sheet__exportButton"
              type="button"
              onClick={props.onExportPdf}
              disabled={props.isExportingPdf}
              aria-busy={props.isExportingPdf}
            >
              {props.isExportingPdf ? <span className="button__spinner" aria-hidden="true" /> : null}
              {props.isExportingPdf ? "Generating Character Sheet..." : "Download Character Sheet"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="review-sheet__tabBar">
        {TAB_OPTIONS.map((tab) => (
          <button
            className={`review-sheet__tab${activeTab === tab.id ? " review-sheet__tab--active" : ""}`}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.eyebrow}</span>
            <strong>{tab.label}</strong>
          </button>
        ))}
      </div>

      {activeTab === "character" ? (
        <div className="review-sheet__grid">
          <article className="builder-review__card review-sheet__card--span2">
            <span className="builder-panel__label">Readiness</span>
            <div className="review-sheet__headlineRow">
              <div>
                <strong className="builder-summary__name">{props.canSave ? "Ready to save" : "Needs attention"}</strong>
                <p className="builder-summary__meta">
                  {props.canSave
                    ? "The guided build is in a saveable state."
                    : props.saveValidationMessage || "Finish the remaining blockers before saving."}
                </p>
              </div>
              <div className="review-sheet__statusPill">{props.completionChecklist.filter((item) => item.done).length}/{props.completionChecklist.length} steps complete</div>
            </div>
            <details className="review-sheet__foldout">
              <summary>Builder checklist</summary>
              <div className="review-sheet__checklist">
                {props.completionChecklist.map((item) => (
                  <div className={`review-sheet__checkItem${item.done ? " is-complete" : " is-pending"}`} key={item.label}>
                    <span>{item.done ? "Done" : "Pending"}</span>
                    <strong>{item.label}</strong>
                  </div>
                ))}
              </div>
            </details>
            {readinessWarnings.length ? (
              <div className="review-sheet__warningBlock">
                {readinessWarnings.map((warning, index) => (
                  <p className="auth-card__status auth-card__status--error builder-navigation__warningItem" key={`${warning}-${index}`}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </article>

          <article className="builder-review__card review-sheet__identityCard">
            <span className="builder-panel__label">Identity</span>
            <div className="review-sheet__identity">
              <div className="review-sheet__portrait">
                {props.draft.characterPortraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={`${props.draft.name || "Character"} portrait`} src={props.draft.characterPortraitUrl} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(props.draft.name || "A").slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong className="builder-summary__name">{props.draft.name || "Untitled Adventurer"}</strong>
                <p className="builder-summary__meta">Player: {props.draft.playerName || "Unassigned"}</p>
                <p className="builder-summary__meta">Race: {props.selectedRace?.race.name ?? "Missing"}</p>
                <p className="builder-summary__meta">Lineage: {props.selectedSubrace?.name ?? (props.selectedRace?.subraces.length ? "Missing" : "Not required")}</p>
                <p className="builder-summary__meta">Background: {props.selectedBackground?.background.name ?? "Missing"}</p>
                <p className="builder-summary__meta">Class split: {classSplit || "Missing"}</p>
                <p className="builder-summary__meta">Level {props.draft.level}</p>
              </div>
            </div>
          </article>

          {activeCompanion ? (
            <article className="builder-review__card review-sheet__identityCard">
              <span className="builder-panel__label">Companion</span>
              <div className="review-sheet__identity">
                <div className="review-sheet__portrait review-sheet__portrait--companion">
                  {props.draft.companionPortraitUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={`${activeCompanion.name} portrait`} src={props.draft.companionPortraitUrl} referrerPolicy="no-referrer" />
                  ) : (
                    <span>{activeCompanion.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <strong className="builder-summary__name">{activeCompanion.name}</strong>
                  <p className="builder-summary__meta">{activeCompanion.source || "Rules-backed companion"}</p>
                  <p className="builder-summary__meta">Full traits and actions are available under Features.</p>
                </div>
              </div>
            </article>
          ) : null}

          <article className="builder-review__card">
            <span className="builder-panel__label">Sheet essentials</span>
            <div className="review-sheet__resourceGrid review-sheet__resourceGrid--dense">
              {characterVitals.map((vital) => (
                <div className="ability-card ability-card--compact" key={vital.id}>
                  <span className="ability-card__label">{vital.label}</span>
                  <strong className="summary-card__value">{vital.value}</strong>
                  <span className="ability-card__meta">{vital.meta || "Tracked"}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="builder-review__card">
            <span className="builder-panel__label">Resources</span>
            <p className="builder-summary__meta">This pass only shows resource pools we can justify from current rules and sheet state.</p>
            <div className="review-sheet__resourceGrid">
              {resources.map((resource) => (
                <div className="ability-card" key={resource.id}>
                  <span className="ability-card__label">{resource.label}</span>
                  {resource.slots?.length ? (
                    <div className="review-sheet__slotPipStack">
                      {resource.slots.map((slot) => (
                        <div className="review-sheet__slotPipRow" key={`${resource.id}-${slot.label}`}>
                          <span className="review-sheet__slotPipLabel">{slot.label}</span>
                          <div className="review-sheet__slotPips" aria-label={`${slot.label} slots: ${slot.count}`}>
                            {Array.from({ length: slot.count }, (_, index) => (
                              <span className="review-sheet__slotPip" key={`${slot.label}-${index}`} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <strong className="summary-card__value">{resource.value}</strong>
                  )}
                  <span className="ability-card__meta">{resource.meta || "Tracked"}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="builder-review__card review-sheet__card--span2">
            <span className="builder-panel__label">Ability scores</span>
            <div className="ability-grid">
              {ABILITY_KEYS.map((ability) => (
                <div className="ability-card" key={ability}>
                  <span className="ability-card__label">{ABILITY_LABELS[ability]}</span>
                  <strong className="summary-card__value">{props.effectiveAbilities[ability]}</strong>
                  <span className="ability-card__meta">{formatAbilityModifier(props.effectiveAbilities[ability])}</span>
                  <span className="ability-card__meta">
                    Base {props.draft.abilities[ability]}
                    {props.racialBonuses[ability] ? ` • racial ${props.racialBonuses[ability] >= 0 ? "+" : ""}${props.racialBonuses[ability]}` : ""}
                    {manualFeatureBonuses[ability] ? ` • feature ${manualFeatureBonuses[ability] >= 0 ? "+" : ""}${manualFeatureBonuses[ability]}` : ""}
                    {props.improvementBonuses[ability] ? ` • ASI ${props.improvementBonuses[ability] >= 0 ? "+" : ""}${props.improvementBonuses[ability]}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="builder-review__card review-sheet__card--span2">
            <span className="builder-panel__label">Proficiencies and languages</span>
            <div className="review-sheet__twoColumn">
              <div className="review-sheet__listBlock">
                <strong>Armor and weapons</strong>
                <div className="review-sheet__chipList">
                  {props.equipmentProficiencies.armor.length
                    ? props.equipmentProficiencies.armor.map((value) => <span className="review-sheet__chip" key={`armor-${value}`}>Armor: {value}</span>)
                    : <span className="review-sheet__chip review-sheet__chip--muted">No armor proficiencies detected</span>}
                  {props.equipmentProficiencies.weapons.length
                    ? props.equipmentProficiencies.weapons.map((value) => <span className="review-sheet__chip" key={`weapon-${value}`}>Weapon: {value}</span>)
                    : <span className="review-sheet__chip review-sheet__chip--muted">No weapon proficiencies detected</span>}
                </div>
              </div>
              <div className="review-sheet__listBlock">
                <strong>Selected proficiencies</strong>
                <div className="review-sheet__chipList">
                  {selectedProficiencyLabels.length
                    ? selectedProficiencyLabels.map((value) => <span className="review-sheet__chip" key={value}>{value}</span>)
                    : <span className="review-sheet__chip review-sheet__chip--muted">None detected</span>}
                </div>
              </div>
              <div className="review-sheet__listBlock">
                <strong>Expertise</strong>
                <div className="review-sheet__chipList">
                  {selectedExpertiseLabels.length
                    ? selectedExpertiseLabels.map((value) => <span className="review-sheet__chip review-sheet__chip--accent" key={value}>{value}</span>)
                    : <span className="review-sheet__chip review-sheet__chip--muted">None detected</span>}
                </div>
              </div>
              <div className="review-sheet__listBlock review-sheet__listBlock--full">
                <strong>Languages</strong>
                <div className="review-sheet__chipList">
                  {selectedLanguageLabels.length
                    ? selectedLanguageLabels.map((value) => <span className="review-sheet__chip" key={value}>{value}</span>)
                    : <span className="review-sheet__chip review-sheet__chip--muted">None detected</span>}
                </div>
              </div>
            </div>
          </article>

          <article className="builder-review__card">
            <span className="builder-panel__label">Saving throws</span>
            <div className="review-sheet__scoreRows">
              {savingThrowRows.map((row) => (
                <div className="review-sheet__scoreRow" key={row.id}>
                  <span className={`review-sheet__scoreDot${row.proficient ? " is-proficient" : ""}`} />
                  <strong>{row.total >= 0 ? `+${row.total}` : row.total}</strong>
                  <span>{row.label}</span>
                  <em>({row.ability})</em>
                </div>
              ))}
            </div>
          </article>

          <article className="builder-review__card">
            <span className="builder-panel__label">Skills and table basics</span>
            <div className="review-sheet__headlineRow">
              <div className="review-sheet__chipList">
                <span className="review-sheet__chip">Passive Perception {passivePerception}</span>
                <span className="review-sheet__chip">{attacksPerAction} Attack / Action</span>
              </div>
            </div>
            <div className="review-sheet__scoreRows">
              {skillRows.map((row) => (
                <div className="review-sheet__scoreRow" key={row.id}>
                  <span className={`review-sheet__scoreDot${row.expertise ? " is-expertise" : row.proficient ? " is-proficient" : ""}`} />
                  <strong>{row.total >= 0 ? `+${row.total}` : row.total}</strong>
                  <span>{row.label}</span>
                  <em>({row.ability})</em>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "actions" ? (
        <div className="review-sheet__grid">
          <article className="builder-review__card review-sheet__card--span2">
            <div className="review-sheet__headlineRow">
              <span className="builder-panel__label">Action surface</span>
              <div className="review-sheet__miniToggle" role="tablist" aria-label="Actions and spells view">
                <button className={`review-sheet__miniToggleButton${actionsView === "workbench" ? " is-active" : ""}`} type="button" onClick={() => setActionsView("workbench")}>Workbench</button>
                <button className={`review-sheet__miniToggleButton${actionsView === "table" ? " is-active" : ""}`} type="button" onClick={() => setActionsView("table")}>Table</button>
              </div>
            </div>
            <p className="builder-summary__meta">Compact table-facing actions derived from equipped gear and known action-like features.</p>
            {actionsView === "workbench" ? (
              <div className="review-sheet__compactList">
                {actionCards.length ? (
                  actionCards.map((card) => (
                    <button
                      className="review-sheet__compactRow"
                      key={card.id}
                      type="button"
                      onClick={() =>
                        setDetail({
                          kind: "action",
                          action: card,
                          badges: uniqueStrings([card.timing, card.cost ?? "", card.source ?? ""]),
                        })
                      }
                    >
                      <div className="review-sheet__compactMain">
                        <strong>{card.title} <span className="review-sheet__inlineMeta">· {card.timing}</span></strong>
                        <span>{card.source || card.cost || "Action"}</span>
                      </div>
                      <div className="review-sheet__compactMeta">
                        <p>{card.summary}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="builder-summary__meta">No compact actions detected yet. Martial attacks will appear from equipped weapons, and explicit feature actions will show as the build grows.</p>
                )}
              </div>
            ) : (
              <div className="review-sheet__tableWrap">
                <table className="review-sheet__table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Timing</th>
                      <th>Cost</th>
                      <th>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionCards.length ? (
                      actionCards.map((card) => (
                        <tr key={card.id} onClick={() => setDetail({ kind: "action", action: card, badges: uniqueStrings([card.timing, card.cost ?? "", card.source ?? ""]) })}>
                          <td>{card.title}</td>
                          <td>{card.timing}</td>
                          <td>{card.cost || "—"}</td>
                          <td>{card.summary}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4}>No compact actions detected yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="builder-review__card review-sheet__card--span2">
            <span className="builder-panel__label">Spellcasting</span>
            {actionsView === "workbench" ? (
              <div className="review-sheet__sectionStack">
                {spellGroupCards.length ? (
                  spellGroupCards.map(({ group, entries }) => (
                    <article className="builder-review__card" key={group.id}>
                      <div className="review-sheet__headlineRow">
                        <div>
                          <strong className="review-sheet__sectionTitle">{group.title}</strong>
                          <p className="builder-summary__meta">
                            {group.ownerLabel} • {group.kind === "granted"
                              ? `${entries.length} granted`
                              : `${props.draft.spellSelections[group.id]?.length ?? 0}/${group.maxSelections} selected`}
                          </p>
                        </div>
                        <span className="review-sheet__statusPill">{entries.length} entries</span>
                      </div>
                      {entries.length ? (
                        <div className="review-sheet__compactList">
                          {entries.map((spell) => (
                            <button
                              className="review-sheet__compactRow review-sheet__compactRow--spell"
                              key={`${group.id}-${spell.id}`}
                              type="button"
                              onClick={() =>
                                setDetail({
                                  kind: "spell",
                                  spell,
                                  groupLabel: group.title,
                                  ownerLabel: group.ownerLabel,
                                  badges: uniqueStrings([
                                    getSpellLevel(spell) === 0 ? "Cantrip" : `Level ${getSpellLevel(spell)}`,
                                    getSpellSchool(spell),
                                    isSpellRitual(spell) ? "Ritual" : "",
                                    isSpellConcentration(spell) ? "Concentration" : "",
                                    group.title,
                                    group.ownerLabel,
                                  ]),
                                })
                              }
                            >
                              <div className="review-sheet__compactMain">
                                <strong>{spell.name} <span className="review-sheet__inlineMeta">· {group.title}</span></strong>
                              </div>
                              <div className="review-sheet__compactMeta">
                                <p>{getSpellPreview(spell)}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="builder-summary__meta">No spells chosen in this group yet.</p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="builder-summary__meta">No spell groups are active for this build.</p>
                )}
                {props.manualGrantsByKind.spell.length ? (
                  <article className="builder-review__card">
                    <div className="review-sheet__headlineRow">
                      <div>
                        <strong className="review-sheet__sectionTitle">Manual / DM spell grants</strong>
                        <p className="builder-summary__meta">Additional spell grants outside normal builder restrictions.</p>
                      </div>
                      <span className="review-sheet__statusPill">{props.manualGrantsByKind.spell.length} entries</span>
                    </div>
                    <div className="review-sheet__compactList">
                      {props.manualGrantsByKind.spell.map((grant) => (
                        <button
                          className="review-sheet__compactRow review-sheet__compactRow--spell"
                          key={grant.id}
                          type="button"
                          onClick={() =>
                            setDetail({
                              kind: "manual-grant",
                              grant,
                              badges: uniqueStrings(["SPELL", getManualGrantSourceLabel(grant), getManualGrantKindLabel(grant.kind)]),
                            })
                          }
                        >
                          <div className="review-sheet__compactMain">
                            <strong>{grant.name} <span className="review-sheet__inlineMeta">· {getManualGrantKindLabel(grant.kind)}</span></strong>
                          </div>
                          <div className="review-sheet__compactMeta">
                            <p>{getManualGrantTraceLabel(grant)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>
            ) : (
              <div className="review-sheet__tableWrap">
                <table className="review-sheet__table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>List</th>
                      <th>Level</th>
                      <th>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spellTableRows.length ? (
                      spellTableRows.map(({ id, spell, groupTitle, ownerLabel }) => (
                        <tr
                          key={id}
                          onClick={() =>
                            setDetail({
                              kind: "spell",
                              spell,
                              groupLabel: groupTitle,
                              ownerLabel,
                              badges: uniqueStrings([
                                getSpellLevel(spell) === 0 ? "Cantrip" : `Level ${getSpellLevel(spell)}`,
                                getSpellSchool(spell),
                                isSpellRitual(spell) ? "Ritual" : "",
                                isSpellConcentration(spell) ? "Concentration" : "",
                                groupTitle,
                                ownerLabel,
                              ]),
                            })
                          }
                        >
                          <td>{spell.name}</td>
                          <td>{groupTitle}</td>
                          <td>{getSpellLevel(spell) === 0 ? "Cantrip" : `L${getSpellLevel(spell)}`}</td>
                          <td>{getSpellPreview(spell)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4}>No spell groups are active for this build.</td></tr>
                    )}
                    {props.manualGrantsByKind.spell.map((grant) => (
                      <tr
                        key={grant.id}
                        onClick={() =>
                          setDetail({
                            kind: "manual-grant",
                            grant,
                            badges: uniqueStrings(["SPELL", getManualGrantSourceLabel(grant), getManualGrantKindLabel(grant.kind)]),
                          })
                        }
                      >
                        <td>{grant.name}</td>
                        <td>{getManualGrantTraceLabel(grant)}</td>
                        <td>Grant</td>
                        <td>{getManualGrantSummary(grant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === "features" ? (
        <div className="review-sheet__sectionStack">
          <div className="review-sheet__headlineRow">
            <span className="builder-panel__label">Feature catalog</span>
            <div className="review-sheet__miniToggle" role="tablist" aria-label="Features view">
              <button className={`review-sheet__miniToggleButton${featuresView === "workbench" ? " is-active" : ""}`} type="button" onClick={() => setFeaturesView("workbench")}>Workbench</button>
              <button className={`review-sheet__miniToggleButton${featuresView === "table" ? " is-active" : ""}`} type="button" onClick={() => setFeaturesView("table")}>Table</button>
            </div>
          </div>
          {featureSections.length ? (
            featureSections.map((section) => (
              <article className="builder-review__card" key={section.id}>
                <span className="builder-panel__label">{section.title}</span>
                {featuresView === "workbench" ? (
                  <div className="review-sheet__featureSectionGrid">
                    {section.items.map((item) =>
                      "kind" in item ? (
                        renderManualGrant(item, () =>
                          setDetail({
                            kind: "manual-grant",
                            grant: item,
                            badges: uniqueStrings([item.kind.toUpperCase(), getManualGrantSourceLabel(item), getManualGrantKindLabel(item.kind)]),
                          }),
                        )
                      ) : (
                        <button
                          className="review-sheet__featureTile"
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setDetail({
                              kind: "feature",
                              feature: item,
                              badges: uniqueStrings([item.type, item.source || ""]),
                            })
                          }
                        >
                          <div className="review-sheet__featureTileHeader">
                            <strong>{item.name}</strong>
                            <span>{[item.source || "", item.type].filter(Boolean).join(" · ")}</span>
                          </div>
                          <div className="review-sheet__featureTileBody">
                            <p>{getFeaturePreview(item)}</p>
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="review-sheet__tableWrap">
                    <table className="review-sheet__table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Source</th>
                          <th>Type</th>
                          <th>Summary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item) =>
                          "kind" in item ? (
                            <tr
                              key={item.id}
                              onClick={() =>
                                setDetail({
                                  kind: "manual-grant",
                                  grant: item,
                                  badges: uniqueStrings([item.kind.toUpperCase(), getManualGrantSourceLabel(item), getManualGrantKindLabel(item.kind)]),
                                })
                              }
                            >
                              <td>{item.name}</td>
                              <td>{getManualGrantTraceLabel(item)}</td>
                              <td>{item.kind}</td>
                              <td>{getManualGrantSummary(item)}</td>
                            </tr>
                          ) : (
                            <tr
                              key={item.id}
                              onClick={() =>
                                setDetail({
                                  kind: "feature",
                                  feature: item,
                                  badges: uniqueStrings([item.type, item.source || ""]),
                                })
                              }
                            >
                              <td>{item.name}</td>
                              <td>{item.source || "—"}</td>
                              <td>{item.type}</td>
                              <td>{getFeaturePreview(item)}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))
          ) : (
            <article className="builder-review__card">
              <span className="builder-panel__label">Features</span>
              <p className="builder-summary__meta">No feature surfaces are available yet for this draft.</p>
            </article>
          )}
        </div>
      ) : null}

      {activeTab === "inventory" ? (
        <div className="review-sheet__grid">
          <article className="builder-review__card">
            <span className="builder-panel__label">Inventory snapshot</span>
            <div className="review-sheet__resourceGrid">
              <div className="ability-card">
                <span className="ability-card__label">Owned</span>
                <strong className="summary-card__value">{props.draft.inventoryItems.length}</strong>
                <span className="ability-card__meta">Total entries</span>
              </div>
              <div className="ability-card">
                <span className="ability-card__label">Equipped</span>
                <strong className="summary-card__value">{props.equipmentEffectSummary.equippedCount}</strong>
                <span className="ability-card__meta">Active gear</span>
              </div>
              <div className="ability-card">
                <span className="ability-card__label">Attuned</span>
                <strong className="summary-card__value">{props.equipmentEffectSummary.attunedCount}</strong>
                <span className="ability-card__meta">Of {props.equipmentEffectSummary.attunementLimit}</span>
              </div>
            </div>
            <p className="builder-summary__meta">
              Currency: {props.draft.inventoryCurrency.pp} platinum • {props.draft.inventoryCurrency.gp} gold • {props.draft.inventoryCurrency.ep} electrum • {props.draft.inventoryCurrency.sp} silver • {props.draft.inventoryCurrency.cp} copper
            </p>
          </article>

          <article className="builder-review__card">
            <span className="builder-panel__label">Equipment effects</span>
            {formattedEffectLines.length ? (
              <ul className="route-shell__list">
                {formattedEffectLines.map((line) => (
                  <li key={line.id}>
                    <strong>{line.label}</strong>
                    {line.value ? ` ${line.value}` : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="builder-summary__meta">No active equipment effects yet.</p>
            )}
          </article>

          <article className="builder-review__card review-sheet__card--span2">
            <div className="review-sheet__headlineRow">
              <span className="builder-panel__label">Owned gear</span>
              <div className="review-sheet__miniToggle" role="tablist" aria-label="Inventory view">
                <button className={`review-sheet__miniToggleButton${inventoryView === "workbench" ? " is-active" : ""}`} type="button" onClick={() => setInventoryView("workbench")}>Workbench</button>
                <button className={`review-sheet__miniToggleButton${inventoryView === "table" ? " is-active" : ""}`} type="button" onClick={() => setInventoryView("table")}>Table</button>
              </div>
            </div>
            {inventoryView === "workbench" ? (
              <div className="review-sheet__inventoryList">
                {props.draft.inventoryItems.length ? (
                  props.draft.inventoryItems.map((item) => (
                    <button
                      className="review-sheet__inventoryRow"
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setDetail({
                          kind: "item",
                          item,
                          badges: getInventoryItemBadges(item),
                        })
                      }
                    >
                      <div className="review-sheet__compactMain">
                        <strong>{item.name}</strong>
                        <span>{item.sourceLabel}</span>
                      </div>
                      <div className="review-sheet__inventoryMeta">
                        <span>{item.category}</span>
                        <span>Qty {item.quantity}</span>
                        <span>{item.equipped ? "Equipped" : "Stored"}</span>
                        <span>{item.attuned ? "Attuned" : item.attunable ? "Attunable" : "No attunement"}</span>
                      </div>
                      <p className="review-sheet__inventoryPreview">{getInventoryItemPreview(item)}</p>
                    </button>
                  ))
                ) : (
                  <p className="builder-summary__meta">No inventory entries yet.</p>
                )}
              </div>
            ) : (
              <div className="review-sheet__tableWrap">
                <table className="review-sheet__table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.draft.inventoryItems.length ? (
                      props.draft.inventoryItems.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() =>
                            setDetail({
                              kind: "item",
                              item,
                              badges: getInventoryItemBadges(item),
                            })
                          }
                        >
                          <td>{item.name}</td>
                          <td>{item.category}</td>
                          <td>{item.quantity}</td>
                          <td>{item.attuned ? "Attuned" : item.attunable ? "Attunable" : item.equipped ? "Equipped" : "Stored"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4}>No inventory entries yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {(hasMarkdownContent(props.draft.equipmentNotes.additionalTreasure) || hasMarkdownContent(props.draft.equipmentNotes.questItems)) ? (
            <article className="builder-review__card review-sheet__card--span2">
              <span className="builder-panel__label">Treasure and quest notes</span>
              <div className="backstory-step__sheetGrid">
                {hasMarkdownContent(props.draft.equipmentNotes.additionalTreasure) ? (
                  <article className="backstory-step__sheetCard">
                    <strong className="builder-summary__name">Additional treasure</strong>
                    <MarkdownRenderer compact value={props.draft.equipmentNotes.additionalTreasure} />
                  </article>
                ) : null}
                {hasMarkdownContent(props.draft.equipmentNotes.questItems) ? (
                  <article className="backstory-step__sheetCard">
                    <strong className="builder-summary__name">Quest items</strong>
                    <MarkdownRenderer compact value={props.draft.equipmentNotes.questItems} />
                  </article>
                ) : null}
              </div>
            </article>
          ) : null}

          {props.draft.manualGrants.length ? (
            <article className="builder-review__card review-sheet__card--span2">
              <span className="builder-panel__label">Additional build grants</span>
              <ul className="route-shell__list review-sheet__grantList">
                {props.draft.manualGrants.map((grant) => (
                  <li key={grant.id}>
                    <strong>{grant.name}</strong> ({getManualGrantTraceLabel(grant)})
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      ) : null}

      {activeTab === "personality" ? (
        <div className="review-sheet__sectionStack">
          {Object.entries(props.draft.backstory).some(([, value]) => hasMarkdownContent(value)) ? (
            <article className="builder-review__card">
              <span className="builder-panel__label">Backstory and personality</span>
              <div className="backstory-step__sheetGrid">
                {Object.entries(props.draft.backstory)
                  .filter(([, value]) => hasMarkdownContent(value))
                  .map(([key, value]) => (
                    <article className="backstory-step__sheetCard" key={key}>
                      <strong className="builder-summary__name">
                        {titleizeBackstoryKey(key)}
                      </strong>
                      <MarkdownRenderer compact value={value} />
                    </article>
                  ))}
              </div>
            </article>
          ) : (
            <article className="builder-review__card">
              <span className="builder-panel__label">Backstory and personality</span>
              <p className="builder-summary__meta">No narrative notes yet.</p>
            </article>
          )}
        </div>
      ) : null}

      <ReviewDetailDrawer detail={detail} onClose={() => setDetail(null)} />
    </section>
  );
}
