import type {
  CharacterBackstory,
  CharacterCurrency,
  CharacterDraft,
  CharacterInventoryItem,
  CharacterManualGrant,
} from "@/lib/characters/types";

export type PdfContentKind = "summary" | "table" | "detail" | "appendix";

export type PdfPageKind = "front" | "companion" | "inventory" | "spells" | "backstory" | "appendix";

export type PdfCardKind =
  | "feature"
  | "trait"
  | "condition"
  | "sense"
  | "proficiency"
  | "language"
  | "item"
  | "spell"
  | "note";

export type PdfPageCard = {
  id: string;
  title: string;
  kind: PdfCardKind;
  contentKind: PdfContentKind;
  summary: string;
  detail?: string;
  sourceLabel?: string;
  sourceAction?: string;
  tags: string[];
  priority: number;
  pageHint?: PdfPageKind | "front-rail";
  widthHint?: "small" | "medium" | "wide";
};

export type PdfStatBlock = {
  id: string;
  label: string;
  value: string;
  meta?: string;
};

export type PdfAbilityScoreRow = {
  id: string;
  label: string;
  score: number;
  modifier: number;
  saveBonus: number;
  saveProficient: boolean;
};

export type PdfSkillRow = {
  id: string;
  label: string;
  ability: string;
  total: number;
  proficient: boolean;
  expertise: boolean;
};

export type PdfAttackRow = {
  id: string;
  name: string;
  hit: string;
  damage: string;
  type?: string;
  properties?: string;
};

export type PdfProficiencyGroups = {
  weapons: string[];
  armor: string[];
  tools: string[];
  vehicles: string[];
  languages: string[];
};

export type PdfPageSection = {
  id: string;
  title: string;
  cards: PdfPageCard[];
  description?: string;
};

export type PdfRightColumnNoteLine = {
  id: string;
  title: string;
  value: string;
};

export type PdfRightColumnCompactTrait = {
  id: string;
  title: string;
  summary: string;
  sourceCardId: string;
  priority: number;
  // Source card kind — racial/subclass/subracial/feat get the bigger
  // RACIAL_CARD_TYPOGRAPHY (13pt title) while trait cards stay at
  // FEATURE_CARD_TYPOGRAPHY (8.5pt). Without this, all compact trait
  // rows collapse to the same small size regardless of which section
  // header they're under.
  kind?: "trait" | "racial" | "subclass" | "subracial" | "feat";
};

export type PdfRightColumnComposition = {
  sensesAndConditions: PdfRightColumnNoteLine[];
  racialCards: PdfRightColumnCompactTrait[];
  subracialCards: PdfRightColumnCompactTrait[];
  overflow: PdfPageCard[];
};

export type PdfSpellSlotLevel = {
  level: number; // 1-9 for leveled spells, 0 for cantrips
  slots: number; // number of slots at this level
};

export type PdfPage1SpellSummary = {
  ownerLabel: string;
  ownerType: "class" | "subclass" | "race" | "subrace" | "feat" | "other" | "manual";
  preparationState: "prepared" | "known" | "spellbook" | "always-prepared" | "innate";
  slotMode: "standard" | "pact" | "innate";
  sourceId: string;
  sourceLabel: string;
  spellcastingAbility?: string;
};

export type PdfSpellcastingSourceEntry = {
  id: string; // stable key for stat lookup, e.g. "cleric" or "warlock-pact"
  ownerLabel: string; // human-readable class/race name, e.g. "Cleric" or "Warlock"
  ownerType: "race" | "subrace" | "class" | "subclass" | "feat";
  ability: string; // lowercase ability key e.g. "wis", "int", "cha"
  abilityLabel: string; // capitalized short label e.g. "WIS", "INT", "CHA"
  dc: number; // spell save DC for this source
  bonus: string; // spell attack bonus, e.g. "+5"
  kind: "prepared" | "known" | "spellbook" | "pact" | "innate" | "granted";
  recovery: "long-rest" | "short-rest" | "at-will" | "slots";
};

export type PdfSpellSlots = {
  maxLevel: number; // highest spell level the character can cast (derived from character level for full casters)
  slots: PdfSpellSlotLevel[]; // slot counts per level (excludes cantrips — they have unlimited)
  standardSlots?: PdfSpellSlotLevel[];
  pactSlots?: PdfSpellSlotLevel[];
  sources: PdfSpellcastingSourceEntry[]; // one entry per spellcasting class/race/feat
  isFullCaster: boolean;
  isHalfCaster: boolean;
  isWarlock: boolean;
  hasPactMagic: boolean;
};

export type PdfSpellListEntry = {
  id: string;
  name: string;
  level: number; // 0 = cantrip
  sourceLabel?: string;
  page1DisplaySummary?: string;
  page1Summary?: PdfPage1SpellSummary;
  page1Summaries?: PdfPage1SpellSummary[];
};

export type PdfSpellListByLevel = {
  level: number;
  spells: PdfSpellListEntry[];
};

export type PdfCombatHubSpellColumn = {
  cantrips: PdfSpellListEntry[];
  slots: PdfSpellSlots;
  spellsByLevel: PdfSpellListByLevel[]; // one entry per spell level
};

export type PdfCombatHub = {
  hasSpells: boolean;
  weaponRows: PdfAttackRow[];
  spellColumn?: PdfCombatHubSpellColumn;
};

export type PdfFrontPageComposition = {
  stats: PdfStatBlock[];
  abilityRows: PdfAbilityScoreRow[];
  skillRows: PdfSkillRow[];
  attackRows: PdfAttackRow[];
  proficiencyGroups: PdfProficiencyGroups;
  deck: PdfPageCard[];
  deckOverflow: PdfPageCard[];
  railCards: PdfPageCard[];
  rightColumn: PdfRightColumnComposition;
  notes: string[];
  capacity: number;
  combatHub: PdfCombatHub;
};

export type PdfPagePlan = {
  number: number;
  kind: PdfPageKind;
  title: string;
  sections: PdfPageSection[];
  notes: string[];
};

export type PdfAppendixEntry = {
  id: string;
  title: string;
  kind: Exclude<PdfPageKind, "front"> | "appendix";
  body: string;
  sourceLabel?: string;
  tags: string[];
};

export type PdfResolveSource = {
  draft: CharacterDraft;
  stats: PdfStatBlock[];
  abilityRows?: PdfAbilityScoreRow[];
  skillRows?: PdfSkillRow[];
  attackRows?: PdfAttackRow[];
  proficiencyGroups?: PdfProficiencyGroups;
  featureCards?: PdfPageCard[];
  companionCards?: PdfPageCard[];
  inventoryCards?: PdfPageCard[];
  spellCards?: PdfPageCard[];
  spellSlots?: PdfSpellSlots;
  spellList?: PdfSpellListEntry[];
  backstoryCards?: PdfPageCard[];
  appendixEntries?: PdfAppendixEntry[];
  notes?: string[];
  backstory?: CharacterBackstory;
  currency?: CharacterCurrency;
  extraItems?: CharacterInventoryItem[];
  manualGrants?: CharacterManualGrant[];
  identity?: {
    raceLabel?: string;
    subraceLabel?: string;
    classLabel?: string;
    subclassLabel?: string;
    backgroundLabel?: string;
  };
};

export type ResolvedPdfCharacter = {
  id: string;
  name: string;
  playerName: string;
  level: number;
  raceLabel: string;
  subraceLabel: string;
  classLabel: string;
  subclassLabel: string;
  backgroundLabel: string;
  alignment: string;
  deity: string;
  stats: PdfStatBlock[];
  frontPage: PdfFrontPageComposition;
  companionCards: PdfPageCard[];
  inventoryCards: PdfPageCard[];
  spellCards: PdfPageCard[];
  backstoryCards: PdfPageCard[];
  appendixEntries: PdfAppendixEntry[];
  notes: string[];
  currency?: CharacterCurrency;
  backstory?: CharacterBackstory;
  source: CharacterDraft;
  pagePlan: PdfPagePlan[];
  spellSlots?: PdfSpellSlots; // direct access for renderer convenience
};
