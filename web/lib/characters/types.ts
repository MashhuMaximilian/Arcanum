export type AbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export type CharacterAbilities = Record<AbilityKey, number>;
export type AbilityMode = "manual" | "standard-array" | "point-buy" | "rolled";

export type CharacterSourceManifestEntry = {
  sourceId: string;
  sourceName: string;
  indexUrl: string;
  sourceKind: string;
  requiredElementIds: string[];
  fingerprint: string | null;
  status: "built-in" | "cached-on-device" | "rehydrate-required";
};

export type CharacterContentSnapshot = {
  id: string;
  type: string;
  name: string;
  source: string;
  sourceUrl?: string;
  supports: string[];
  description: string;
  descriptionHtml?: string;
  prerequisite?: string;
  requirements?: string;
  rules: unknown[];
  setters: unknown[];
  sheet?: unknown;
  multiclass?: unknown;
  spellcasting?: unknown;
  ruleset: string;
};

export type CharacterClassEntry = {
  classId: string;
  subclassId: string;
  level: number;
};

export type CharacterImprovementSelection = {
  mode: "asi" | "feat";
  abilityBonuses: Partial<Record<AbilityKey, number>>;
  featId: string;
  featName?: string;
  featSource?: string;
};

export type CharacterBackstory = {
  alignment: string;
  deity: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  alliesAndOrganizations: string;
  backstory: string;
  additionalFeatures: string;
};

export type CharacterCurrency = {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
};

export type CharacterEquipmentNotes = {
  additionalTreasure: string;
  questItems: string;
  additionalSpells: string;
  additionalProficiencies: string;
  additionalLanguages: string;
  additionalFeats: string;
  additionalFeatures: string;
  additionalAbilityScores: string;
};

export type CharacterManualGrantKind = "spell" | "proficiency" | "language" | "feat" | "feature" | "asi";

export type CharacterManualGrant = {
  id: string;
  kind: CharacterManualGrantKind;
  refId?: string;
  name: string;
  source?: string;
  description?: string;
  detailHtml?: string;
  ability?: AbilityKey;
  mode?: "increase" | "set";
  amount?: number;
  note?: string;
};

export type CharacterInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  category: string;
  family?: string;
  itemType?: string;
  source: string;
  sourceLabel: string;
  sourceName?: string;
  sourceUrl?: string;
  rarity?: string;
  cost?: string;
  weight?: string;
  slot?: string;
  equippable: boolean;
  equipped: boolean;
  attunable: boolean;
  attuned: boolean;
  attackBonus?: string;
  baseItemId?: string;
  baseItemName?: string;
  baseDamage?: string;
  damage?: string;
  sheetDescription?: string;
  notes?: string;
  detailHtml?: string;
  includeInItemDescriptions: boolean;
};

export type CharacterDraft = {
  schemaVersion: number;
  ruleset: "dnd5e-2014" | "dnd5e-2024";
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  playerName: string;
  characterPortraitUrl: string;
  companionPortraitUrl: string;
  contentSourceIds: string[];
  raceId: string;
  subraceId: string;
  level: number;
  classEntries: CharacterClassEntry[];
  backgroundId: string;
  useTashasCustomizedOrigin: boolean;
  abilityMode: AbilityMode;
  abilities: CharacterAbilities;
  improvementSelections: Record<string, CharacterImprovementSelection>;
  progressionSelections: Record<string, string[]>;
  spellSelections: Record<string, string[]>;
  equipmentAcquisitionMode: "gear" | "gold";
  equipmentGoldOverrideGp: number | null;
  equipmentSelections: Record<string, string>;
  removedInventoryItemIds: string[];
  inventoryCurrency: CharacterCurrency;
  inventoryItems: CharacterInventoryItem[];
  equipmentNotes: CharacterEquipmentNotes;
  manualGrants: CharacterManualGrant[];
  backstory: CharacterBackstory;
  sourceManifest: CharacterSourceManifestEntry[];
  contentSnapshots: CharacterContentSnapshot[];
};

export const ABILITY_KEYS: AbilityKey[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

export const CHARACTER_DRAFT_SCHEMA_VERSION = 5;

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

export function createEmptyCharacterDraft(): CharacterDraft {
  const now = new Date().toISOString();

  return {
    schemaVersion: CHARACTER_DRAFT_SCHEMA_VERSION,
    ruleset: "dnd5e-2014",
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    name: "",
    playerName: "",
    characterPortraitUrl: "",
    companionPortraitUrl: "",
    contentSourceIds: [],
    raceId: "",
    subraceId: "",
    level: 1,
    classEntries: [
      {
        classId: "",
        subclassId: "",
        level: 1,
      },
    ],
    backgroundId: "",
    useTashasCustomizedOrigin: false,
    abilityMode: "manual",
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    improvementSelections: {},
    progressionSelections: {},
    spellSelections: {},
    equipmentAcquisitionMode: "gear",
    equipmentGoldOverrideGp: null,
    equipmentSelections: {},
    removedInventoryItemIds: [],
    inventoryCurrency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
    inventoryItems: [],
    equipmentNotes: {
      additionalTreasure: "",
      questItems: "",
      additionalSpells: "",
      additionalProficiencies: "",
      additionalLanguages: "",
      additionalFeats: "",
      additionalFeatures: "",
      additionalAbilityScores: "",
    },
    manualGrants: [],
    backstory: {
      alignment: "",
      deity: "",
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      alliesAndOrganizations: "",
      backstory: "",
      additionalFeatures: "",
    },
    sourceManifest: [],
    contentSnapshots: [],
  };
}

export function duplicateCharacterDraft(draft: CharacterDraft): CharacterDraft {
  const now = new Date().toISOString();
  const normalized = normalizeCharacterDraft(draft);

  return normalizeCharacterDraft({
    ...structuredClone(normalized),
    id: crypto.randomUUID(),
    name: `${normalized.name || "Untitled Adventurer"} Copy`,
    createdAt: now,
    updatedAt: now,
  });
}

type LegacyCharacterDraft = Partial<CharacterDraft> & {
  id: string;
  classId?: string;
  subclassId?: string;
};

function normalizeClassEntries(draft: LegacyCharacterDraft, fallbackLevel: number): CharacterClassEntry[] {
  if (draft.classEntries?.length) {
    const normalized = draft.classEntries
      .filter((entry) => entry.classId)
      .map((entry) => ({
        classId: entry.classId,
        subclassId: entry.subclassId ?? "",
        level: Math.max(1, Math.floor(entry.level ?? 1)),
      }));

    if (normalized.length) {
      return normalized;
    }
  }

  if (draft.classId) {
    return [
      {
        classId: draft.classId,
        subclassId: draft.subclassId ?? "",
        level: Math.max(1, Math.floor(draft.level ?? fallbackLevel)),
      },
    ];
  }

  return [
    {
      classId: "",
      subclassId: "",
      level: Math.max(1, Math.floor(draft.level ?? fallbackLevel)),
    },
  ];
}

export function normalizeCharacterDraft(draft: CharacterDraft | LegacyCharacterDraft) {
  const empty = createEmptyCharacterDraft();
  const classEntries = normalizeClassEntries(draft, empty.level);
  const level = classEntries.length
    ? classEntries.reduce((sum, entry) => sum + entry.level, 0)
    : Math.max(1, Math.floor(draft.level ?? empty.level));

  return {
    ...empty,
    ...draft,
    schemaVersion: CHARACTER_DRAFT_SCHEMA_VERSION,
    ruleset: draft.ruleset === "dnd5e-2024" ? "dnd5e-2024" : "dnd5e-2014",
    characterPortraitUrl:
      typeof draft.characterPortraitUrl === "string" ? draft.characterPortraitUrl.trim() : "",
    companionPortraitUrl:
      typeof draft.companionPortraitUrl === "string" ? draft.companionPortraitUrl.trim() : "",
    contentSourceIds: Array.isArray((draft as CharacterDraft).contentSourceIds)
      ? (draft as CharacterDraft).contentSourceIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    level,
    classEntries,
    abilities: {
      ...empty.abilities,
      ...(draft.abilities ?? {}),
    },
    useTashasCustomizedOrigin: draft.useTashasCustomizedOrigin ?? empty.useTashasCustomizedOrigin,
    improvementSelections: Object.fromEntries(
      Object.entries(draft.improvementSelections ?? {}).map(([key, selection]) => [
        key,
        {
          mode: selection?.mode === "feat" ? "feat" : "asi",
          abilityBonuses: Object.fromEntries(
            ABILITY_KEYS.map((ability) => [
              ability,
              Math.max(0, Math.min(2, Math.floor(selection?.abilityBonuses?.[ability] ?? 0))),
            ]).filter(([, value]) => Number(value) > 0),
          ) as Partial<Record<AbilityKey, number>>,
          featId: selection?.featId ?? "",
          featName: selection?.featName ?? undefined,
          featSource: selection?.featSource ?? undefined,
        } satisfies CharacterImprovementSelection,
      ]),
    ),
    progressionSelections: Object.fromEntries(
      Object.entries((draft as CharacterDraft).progressionSelections ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [],
      ]),
    ),
    spellSelections: Object.fromEntries(
      Object.entries(draft.spellSelections ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [],
      ]),
    ),
    equipmentAcquisitionMode: draft.equipmentAcquisitionMode === "gold" ? "gold" : "gear",
    equipmentGoldOverrideGp:
      draft.equipmentGoldOverrideGp === null || draft.equipmentGoldOverrideGp === undefined
        ? null
        : Math.max(0, Math.floor(draft.equipmentGoldOverrideGp)),
    equipmentSelections: draft.equipmentSelections ?? {},
    removedInventoryItemIds: Array.isArray(draft.removedInventoryItemIds)
      ? draft.removedInventoryItemIds.filter((item): item is string => typeof item === "string")
      : [],
    inventoryCurrency: {
      ...empty.inventoryCurrency,
      ...(draft.inventoryCurrency ?? {}),
    },
    inventoryItems: Array.isArray(draft.inventoryItems)
      ? draft.inventoryItems
          .filter((item): item is CharacterInventoryItem => Boolean(item && typeof item.id === "string" && typeof item.name === "string"))
          .map((item) => ({
            id: item.id,
            name: item.name,
            quantity: Math.max(1, Math.floor(item.quantity ?? 1)),
            category: item.category === "armor" && /\bshield\b/i.test(item.name) ? "shield" : item.category ?? "misc",
            family: typeof item.family === "string" ? item.family : undefined,
            itemType: typeof item.itemType === "string" ? item.itemType : undefined,
            source: item.source ?? "starting-fixed",
            sourceLabel: item.sourceLabel ?? "",
            sourceName: typeof item.sourceName === "string" ? item.sourceName : undefined,
            sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : undefined,
            rarity: typeof item.rarity === "string" ? item.rarity : undefined,
            cost: typeof item.cost === "string" ? item.cost : undefined,
            weight: typeof item.weight === "string" ? item.weight : undefined,
            slot: typeof item.slot === "string" ? item.slot : undefined,
            equippable: Boolean(item.equippable),
            equipped: Boolean(item.equipped),
            attunable: Boolean(item.attunable),
            attuned: Boolean(item.attuned) && Boolean(item.attunable),
            attackBonus: typeof item.attackBonus === "string" ? item.attackBonus : undefined,
            baseItemId: typeof item.baseItemId === "string" ? item.baseItemId : undefined,
            baseItemName: typeof item.baseItemName === "string" ? item.baseItemName : undefined,
            baseDamage: typeof item.baseDamage === "string" ? item.baseDamage : undefined,
            damage: typeof item.damage === "string" ? item.damage : undefined,
            sheetDescription: typeof item.sheetDescription === "string" ? item.sheetDescription : undefined,
            notes: typeof item.notes === "string" ? item.notes : undefined,
            detailHtml: typeof item.detailHtml === "string" ? item.detailHtml : undefined,
            includeInItemDescriptions:
              typeof item.includeInItemDescriptions === "boolean"
                ? item.includeInItemDescriptions
                : Boolean(item.detailHtml || item.notes || item.rarity || item.attunable || item.source === "manual"),
          }))
      : [],
    equipmentNotes: {
      ...empty.equipmentNotes,
      ...(draft.equipmentNotes ?? {}),
    },
    manualGrants: Array.isArray(draft.manualGrants)
      ? draft.manualGrants
          .filter((grant): grant is CharacterManualGrant => Boolean(grant && typeof grant.id === "string" && typeof grant.name === "string"))
          .map((grant) => ({
            id: grant.id,
            kind: ["spell", "proficiency", "language", "feat", "feature", "asi"].includes(grant.kind)
              ? grant.kind
              : "feature",
            refId: typeof grant.refId === "string" ? grant.refId : undefined,
            name: grant.name,
            source: typeof grant.source === "string" ? grant.source : undefined,
            description: typeof grant.description === "string" ? grant.description : undefined,
            detailHtml: typeof grant.detailHtml === "string" ? grant.detailHtml : undefined,
            ability: ABILITY_KEYS.includes(grant.ability as AbilityKey) ? grant.ability : undefined,
            mode: grant.mode === "set" ? "set" : grant.mode === "increase" ? "increase" : undefined,
            amount:
              typeof grant.amount === "number" && Number.isFinite(grant.amount)
                ? Math.max(-30, Math.min(30, Math.floor(grant.amount)))
                : undefined,
            note: typeof grant.note === "string" ? grant.note : undefined,
          }))
      : [],
    backstory: {
      ...empty.backstory,
      ...(draft.backstory ?? {}),
    },
    sourceManifest: draft.sourceManifest ?? [],
    contentSnapshots: Array.isArray(draft.contentSnapshots)
      ? draft.contentSnapshots.filter(
          (snapshot): snapshot is CharacterContentSnapshot =>
            Boolean(
              snapshot &&
              typeof snapshot.id === "string" &&
              typeof snapshot.type === "string" &&
              typeof snapshot.name === "string" &&
              typeof snapshot.source === "string" &&
              typeof snapshot.description === "string" &&
              Array.isArray(snapshot.rules) &&
              Array.isArray(snapshot.setters),
            ),
        )
          .map((snapshot) => ({
            ...snapshot,
            supports: Array.isArray(snapshot.supports)
              ? snapshot.supports.filter((value): value is string => typeof value === "string")
              : [],
          }))
      : [],
  } satisfies CharacterDraft;
}

export function getPrimaryClassEntry(draft: CharacterDraft) {
  return draft.classEntries[0] ?? null;
}

export function getTotalCharacterLevel(draft: CharacterDraft) {
  return draft.classEntries.length
    ? draft.classEntries.reduce((sum, entry) => sum + entry.level, 0)
    : Math.max(1, Math.floor(draft.level || 1));
}

export function formatAbilityModifier(score: number) {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function getPointBuyTotal(abilities: CharacterAbilities) {
  return ABILITY_KEYS.reduce(
    (sum, key) => sum + (POINT_BUY_COST[abilities[key]] ?? 0),
    0,
  );
}

export function rollAbilityScore() {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

export function createRolledAbilities(): CharacterAbilities {
  return {
    strength: rollAbilityScore(),
    dexterity: rollAbilityScore(),
    constitution: rollAbilityScore(),
    intelligence: rollAbilityScore(),
    wisdom: rollAbilityScore(),
    charisma: rollAbilityScore(),
  };
}
