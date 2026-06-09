import { getBuiltInSrdItems } from "@/lib/builtins/items";
import type { AbilityKey, CharacterCurrency, CharacterInventoryItem } from "@/lib/characters/types";
import type { StartingEquipmentPlan } from "@/lib/equipment/starting-equipment";

export type EquipmentAcquisitionMode = "gear" | "gold";

export type InventoryCategory =
  | "weapon"
  | "armor"
  | "shield"
  | "focus"
  | "ammo"
  | "tool"
  | "instrument"
  | "pack"
  | "clothing"
  | "book"
  | "holy-symbol"
  | "consumable"
  | "treasure"
  | "misc";

export type InventoryItemSource = "class" | "background" | "starting-fixed" | "starting-choice" | "gold";
export type InventoryItemSourceKind = InventoryItemSource | "manual";

type ParsedItem = {
  name: string;
  quantity: number;
  currency?: keyof CharacterCurrency;
};

const CATEGORY_RULES: Array<{ match: RegExp; category: InventoryCategory }> = [
  { match: /\b(chain mail|leather armor|studded leather|scale mail|breastplate|splint|plate|armor)\b/i, category: "armor" },
  { match: /\bshield\b/i, category: "shield" },
  { match: /\b(longbow|crossbow|shortbow|rapier|sword|dagger|handaxe|axe|mace|hammer|staff|quarterstaff|weapon|bow)\b/i, category: "weapon" },
  { match: /\bbolts?\b|\barrows?\b|\bquiver\b/i, category: "ammo" },
  { match: /\bcomponent pouch\b|\barcane focus\b|\bholy symbol\b|\bdruidic focus\b/i, category: "focus" },
  { match: /\bpack\b/i, category: "pack" },
  { match: /\btool\b|\bdice\b|\bcards\b/i, category: "tool" },
  { match: /\binstrument\b/i, category: "instrument" },
  { match: /\bclothes\b|\bvestments\b/i, category: "clothing" },
  { match: /\bbook\b|\bspellbook\b|\bletter\b|\bprayer wheel\b/i, category: "book" },
  { match: /\bincense\b|\bink\b|\bquill\b/i, category: "consumable" },
  { match: /\bpouch\b|\bgp\b|\bcoin\b/i, category: "treasure" },
];

const EQUIPPABLE_CATEGORIES = new Set<InventoryCategory>([
  "weapon",
  "armor",
  "shield",
  "focus",
  "instrument",
  "tool",
  "clothing",
]);

export const ATTUNEMENT_LIMIT = 3;

export type BaseWeaponOption = {
  id: string;
  name: string;
  damage: string;
  group: "axes" | "bows" | "crossbows" | "daggers" | "hammers" | "polearms" | "swords" | "weapons";
};

type WeaponAttackKind = "melee" | "ranged";

type LocalWeaponMetadata = {
  attackKind?: WeaponAttackKind;
  damageDice?: string;
  damageType?: string;
  propertyCodes: string[];
  range?: string;
  versatileDamage?: string;
  weaponBase?: string;
  keywords: string[];
  descriptionText: string;
};

export type ResolvedInventoryWeaponAttackRow = {
  id: string;
  name: string;
  hit: string;
  damage: string;
  type?: string;
  properties?: string;
};

export type InventoryWeaponAttackContext = {
  abilities?: Partial<Record<AbilityKey, number>>;
  proficiencyBonus?: number;
  weaponProficiencies?: string[];
};

export type BaseArmorRule = {
  id: string;
  name: string;
  match: RegExp;
  baseAc: number;
  dexMode: "none" | "full" | "max2";
  armorType: "light" | "medium" | "heavy";
  strengthRequirement?: number;
};

export const BASE_WEAPON_OPTIONS: BaseWeaponOption[] = [
  { id: "club", name: "Club", damage: "1d4 bludgeoning", group: "weapons" },
  { id: "dagger", name: "Dagger", damage: "1d4 piercing", group: "daggers" },
  { id: "greatclub", name: "Greatclub", damage: "1d8 bludgeoning", group: "weapons" },
  { id: "handaxe", name: "Handaxe", damage: "1d6 slashing", group: "axes" },
  { id: "javelin", name: "Javelin", damage: "1d6 piercing", group: "weapons" },
  { id: "light-hammer", name: "Light Hammer", damage: "1d4 bludgeoning", group: "hammers" },
  { id: "mace", name: "Mace", damage: "1d6 bludgeoning", group: "weapons" },
  { id: "quarterstaff", name: "Quarterstaff", damage: "1d6 bludgeoning", group: "weapons" },
  { id: "sickle", name: "Sickle", damage: "1d4 slashing", group: "weapons" },
  { id: "spear", name: "Spear", damage: "1d6 piercing", group: "polearms" },
  { id: "battleaxe", name: "Battleaxe", damage: "1d8 slashing", group: "axes" },
  { id: "flail", name: "Flail", damage: "1d8 bludgeoning", group: "weapons" },
  { id: "glaive", name: "Glaive", damage: "1d10 slashing", group: "polearms" },
  { id: "greataxe", name: "Greataxe", damage: "1d12 slashing", group: "axes" },
  { id: "greatsword", name: "Greatsword", damage: "2d6 slashing", group: "swords" },
  { id: "halberd", name: "Halberd", damage: "1d10 slashing", group: "polearms" },
  { id: "lance", name: "Lance", damage: "1d12 piercing", group: "polearms" },
  { id: "longsword", name: "Longsword", damage: "1d8 slashing", group: "swords" },
  { id: "maul", name: "Maul", damage: "2d6 bludgeoning", group: "hammers" },
  { id: "morningstar", name: "Morningstar", damage: "1d8 piercing", group: "weapons" },
  { id: "pike", name: "Pike", damage: "1d10 piercing", group: "polearms" },
  { id: "rapier", name: "Rapier", damage: "1d8 piercing", group: "swords" },
  { id: "scimitar", name: "Scimitar", damage: "1d6 slashing", group: "swords" },
  { id: "shortsword", name: "Shortsword", damage: "1d6 piercing", group: "swords" },
  { id: "trident", name: "Trident", damage: "1d6 piercing", group: "polearms" },
  { id: "war-pick", name: "War Pick", damage: "1d8 piercing", group: "weapons" },
  { id: "warhammer", name: "Warhammer", damage: "1d8 bludgeoning", group: "hammers" },
  { id: "whip", name: "Whip", damage: "1d4 slashing", group: "weapons" },
  { id: "shortbow", name: "Shortbow", damage: "1d6 piercing", group: "bows" },
  { id: "longbow", name: "Longbow", damage: "1d8 piercing", group: "bows" },
  { id: "light-crossbow", name: "Light Crossbow", damage: "1d8 piercing", group: "crossbows" },
  { id: "heavy-crossbow", name: "Heavy Crossbow", damage: "1d10 piercing", group: "crossbows" },
  { id: "hand-crossbow", name: "Hand Crossbow", damage: "1d6 piercing", group: "crossbows" },
];

export const BASE_ARMOR_RULES: BaseArmorRule[] = [
  { id: "padded", name: "Padded Armor", match: /\bpadded\b/i, baseAc: 11, dexMode: "full", armorType: "light" },
  { id: "studded-leather", name: "Studded Leather Armor", match: /\bstudded leather\b/i, baseAc: 12, dexMode: "full", armorType: "light" },
  { id: "leather", name: "Leather Armor", match: /\bleather armor\b|\bleather\b/i, baseAc: 11, dexMode: "full", armorType: "light" },
  { id: "hide", name: "Hide Armor", match: /\bhide\b/i, baseAc: 12, dexMode: "max2", armorType: "medium" },
  { id: "chain-shirt", name: "Chain Shirt", match: /\bchain shirt\b/i, baseAc: 13, dexMode: "max2", armorType: "medium" },
  { id: "scale-mail", name: "Scale Mail", match: /\bscale mail\b/i, baseAc: 14, dexMode: "max2", armorType: "medium" },
  { id: "breastplate", name: "Breastplate", match: /\bbreastplate\b/i, baseAc: 14, dexMode: "max2", armorType: "medium" },
  { id: "half-plate", name: "Half Plate", match: /\bhalf plate\b/i, baseAc: 15, dexMode: "max2", armorType: "medium" },
  { id: "ring-mail", name: "Ring Mail", match: /\bring mail\b/i, baseAc: 14, dexMode: "none", armorType: "heavy" },
  { id: "chain-mail", name: "Chain Mail", match: /\bchain mail\b/i, baseAc: 16, dexMode: "none", armorType: "heavy", strengthRequirement: 13 },
  { id: "splint", name: "Splint Armor", match: /\bsplint\b/i, baseAc: 17, dexMode: "none", armorType: "heavy", strengthRequirement: 15 },
  { id: "plate", name: "Plate Armor", match: /\bplate armor\b|\bplate\b/i, baseAc: 18, dexMode: "none", armorType: "heavy", strengthRequirement: 15 },
];

const DAMAGE_TYPE_KEYWORDS = new Set([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

const WEAPON_PROPERTY_DISPLAY_ORDER = ["amm", "fin", "heavy", "light", "load", "reach", "2h", "vers"] as const;

const WEAPON_PROPERTY_TAG_MAP: Record<string, string> = {
  ID_INTERNAL_WEAPON_PROPERTY_AMMUNITION: "amm",
  ID_INTERNAL_WEAPON_PROPERTY_FINESSE: "fin",
  ID_INTERNAL_WEAPON_PROPERTY_HEAVY: "heavy",
  ID_INTERNAL_WEAPON_PROPERTY_LIGHT: "light",
  ID_INTERNAL_WEAPON_PROPERTY_LOADING: "load",
  ID_INTERNAL_WEAPON_PROPERTY_REACH: "reach",
  ID_INTERNAL_WEAPON_PROPERTY_THROWN: "thrown",
  ID_INTERNAL_WEAPON_PROPERTY_TWOHANDED: "2h",
  ID_INTERNAL_WEAPON_PROPERTY_VERSATILE: "vers",
};

const BUILT_IN_WEAPON_METADATA_BY_NAME = new Map(
  getBuiltInSrdItems()
    .filter((item) => {
      const category = `${item.category ?? ""} ${item.subtype ?? ""}`.toLowerCase();
      return item.type === "Weapon" || /\bweapon\b/.test(category);
    })
    .map((item) => [normalizeWeaponLookupText(item.name), toLocalWeaponMetadata(item)]),
);

type InventoryEffectContext = {
  abilities?: Partial<Record<AbilityKey, number>>;
  attunementLimit?: number;
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
};

export type InventoryAcTrace = {
  id: string;
  itemId?: string;
  label: string;
  value: number;
  active: boolean;
  reason: string;
};

export type ResolvedInventoryArmorClass = {
  value: number;
  meta: string;
  traces: InventoryAcTrace[];
};

type InventoryAcEffect =
  | {
      kind: "armor-formula";
      item: CharacterInventoryItem;
      armorRule: BaseArmorRule;
      baseAc: number;
      dexContribution: number;
      active: boolean;
      reason: string;
    }
  | {
      kind: "shield-normal";
      item: CharacterInventoryItem;
      bonus: number;
      active: boolean;
      reason: string;
    }
  | {
      kind: "ac-bonus";
      item: CharacterInventoryItem;
      bonus: number;
      label: string;
      active: boolean;
      reason: string;
    };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toLocalWeaponMetadata(item: ReturnType<typeof getBuiltInSrdItems>[number]): LocalWeaponMetadata {
  const propertyCodes = new Set(
    item.supports
      .map((support) => WEAPON_PROPERTY_TAG_MAP[support])
      .filter((code): code is string => Boolean(code)),
  );
  const setters = new Map(item.setters.map((setter) => [setter.name, setter]));
  const damageSetter = setters.get("damage");
  const rangeSetter = setters.get("range");
  const versatileSetter = setters.get("versatile");
  const keywords = (setters.get("keywords")?.value ?? "")
    .split(/[,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const descriptionText = stripMarkup(`${item.descriptionHtml ?? ""} ${item.description}`);
  const rangedBySupport = item.supports.some((support) => support.includes("WEAPON_CATEGORY") && support.includes("RANGED"));
  const rangedByDescription = /\branged weapon\b/i.test(descriptionText);
  const inferredRange = rangeSetter?.value?.trim() || parseRangeFromText(descriptionText);

  if (versatileSetter?.value?.trim()) {
    propertyCodes.add("vers");
  }

  if (/\bfinesse property\b/i.test(descriptionText)) {
    propertyCodes.add("fin");
  }
  if (/\bthrown property\b/i.test(descriptionText)) {
    propertyCodes.add("thrown");
  }
  if (/\btwo-handed property\b/i.test(descriptionText)) {
    propertyCodes.add("2h");
  }
  if (/\breach property\b/i.test(descriptionText)) {
    propertyCodes.add("reach");
  }
  if (/\bloading property\b/i.test(descriptionText)) {
    propertyCodes.add("load");
  }
  if (/\blight property\b/i.test(descriptionText)) {
    propertyCodes.add("light");
  }
  if (/\bheavy property\b/i.test(descriptionText)) {
    propertyCodes.add("heavy");
  }
  if (/\bammunition property\b/i.test(descriptionText)) {
    propertyCodes.add("amm");
  }

  return {
    attackKind: rangedBySupport || rangedByDescription ? "ranged" : "melee",
    damageDice: damageSetter?.value?.trim() || undefined,
    damageType: normalizeDamageType(damageSetter?.type) || findDamageTypeFromKeywords(keywords) || findDamageTypeFromText(descriptionText),
    propertyCodes: [...propertyCodes],
    range: inferredRange || undefined,
    versatileDamage: versatileSetter?.value?.trim() || undefined,
    weaponBase: setters.get("weapon")?.value?.trim() || undefined,
    keywords,
    descriptionText,
  };
}

function parseQuantityAndCurrency(raw: string): ParsedItem {
  const trimmed = raw.trim();
  const currencyMatch = trimmed.match(/^Belt Pouch \((\d+)\s*gp\)$/i);
  if (currencyMatch) {
    return { name: "Belt Pouch", quantity: 1, currency: "gp" };
  }

  const leadingQuantity = trimmed.match(/^(\d+)\s+(.+)$/);
  if (leadingQuantity) {
    return {
      quantity: Number(leadingQuantity[1]),
      name: leadingQuantity[2].trim(),
    };
  }

  return { name: trimmed, quantity: 1 };
}

export function categorizeInventoryItem(name: string): InventoryCategory {
  const rule = CATEGORY_RULES.find((entry) => entry.match.test(name));
  return rule?.category ?? "misc";
}

export function isInventoryItemAttunable(
  attunement?: string | null,
  rarity?: string | null,
  name?: string,
) {
  if (attunement && attunement.trim()) {
    return true;
  }

  if (!name) {
    return false;
  }

  return /\brequires attunement\b/i.test(name) || /\battunement\b/i.test(rarity ?? "");
}

export function getInventoryItemKey(name: string, sourceLabel: string) {
  return `${slugify(sourceLabel)}::${slugify(name)}`;
}

export function isInventoryItemEquippable(name: string, category: InventoryCategory) {
  if (category === "tool" && !/\b(tool|dice|cards)\b/i.test(name)) {
    return false;
  }

  return EQUIPPABLE_CATEGORIES.has(category);
}

function parseNumericBonus(value?: string) {
  const match = value?.match(/\+?\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function inferItemEnhancementBonus(item: Pick<CharacterInventoryItem, "name" | "attackBonus">) {
  return parseNumericBonus(item.attackBonus) || parseNumericBonus(item.name.match(/,\s*\+(\d+)/)?.[0]);
}

/**
 * Detects if a magic weapon explicitly states that its damage is not reduced by a low Strength score.
 * Per PHB/DMG p.141, some magic weapons state "this weapon's damage is not reduced by a low Strength."
 */
export function doesWeaponBypassStrPenalty(item: CharacterInventoryItem): boolean {
  const text = `${item.name} ${item.detailHtml ?? ""} ${item.notes ?? ""} ${item.family ?? ""}`.toLowerCase();
  // Check for explicit DMG language about STR penalty bypass
  return (
    /\b(damage|weapon's damage)\b.*\b(is|isn't|is not|doesn't|does not)\b.*\breduced\b.*\b(strength|str)\b/i.test(text) ||
    /\b(strength|str)\b.*\b(penalty|modifier)\b.*\b(not|doesn't|does not)\b/i.test(text) ||
    /\bdoesn't use your\b.*\b(strength|str)\b/i.test(text) ||
    /\bdoes not use\b.*\b(strength|str)\b/i.test(text)
  );
}

function isWeaponLike(item: CharacterInventoryItem) {
  return (
    item.category === "weapon" ||
    item.family?.toLowerCase().includes("magic weapon") ||
    /\b(weapon|sword|blade|axe|bow|crossbow|dagger|hammer|staff|mace|spear|lance|pike|glaive|halberd|whip)\b/i.test(item.name)
  );
}

function normalizeWeaponLookupText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s*\+\s*\d+\b/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDamageType(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && DAMAGE_TYPE_KEYWORDS.has(normalized) ? normalized : "";
}

function findDamageTypeFromKeywords(keywords: string[]) {
  return keywords.find((keyword) => DAMAGE_TYPE_KEYWORDS.has(keyword)) ?? "";
}

function findDamageTypeFromText(text: string) {
  const insteadMatch = text.match(/\bdeals\s+([a-z]+)\s+damage\s+instead of\b/i)?.[1];
  if (insteadMatch && DAMAGE_TYPE_KEYWORDS.has(insteadMatch.toLowerCase())) {
    return insteadMatch.toLowerCase();
  }

  const plainMatch = text.match(/\bdeals\s+([a-z]+)\s+damage\b/i)?.[1];
  if (plainMatch && DAMAGE_TYPE_KEYWORDS.has(plainMatch.toLowerCase())) {
    return plainMatch.toLowerCase();
  }

  return "";
}

function parseRangeFromText(text: string) {
  const match = text.match(/\bnormal range of (\d+) feet and a long range of (\d+) feet\b/i);
  if (!match) {
    return "";
  }
  return `${match[1]}/${match[2]}`;
}

function parseDamageDice(value?: string) {
  return value?.match(/\d+d\d+/i)?.[0] ?? "";
}

function getBuiltInWeaponMetadata(value?: string) {
  if (!value) {
    return null;
  }
  return BUILT_IN_WEAPON_METADATA_BY_NAME.get(normalizeWeaponLookupText(value)) ?? null;
}

function getExactBaseWeaponOption(item: CharacterInventoryItem) {
  if (!isWeaponLike(item)) {
    return null;
  }

  const builtInMetadata = getBuiltInWeaponMetadata(item.name);
  const builtInWeaponBase = builtInMetadata?.weaponBase;
  if (builtInWeaponBase) {
    const exactBase = BASE_WEAPON_OPTIONS.find((option) => normalizeWeaponLookupText(option.name) === normalizeWeaponLookupText(builtInWeaponBase));
    if (exactBase) {
      return exactBase;
    }
  }

  const haystack = normalizeWeaponLookupText([item.name, item.baseItemName ?? ""].filter(Boolean).join(" "));
  if (!haystack) {
    return null;
  }

  return BASE_WEAPON_OPTIONS.find((option) => {
    const optionName = normalizeWeaponLookupText(option.name);
    const optionId = normalizeWeaponLookupText(option.id);
    return haystack === optionName || haystack === optionId;
  }) ?? null;
}

export function normalizeInventoryWeaponItem(item: CharacterInventoryItem) {
  if (!isWeaponLike(item)) {
    return item;
  }

  const builtInMetadata = getBuiltInWeaponMetadata(item.name);
  const exactBaseWeapon = item.baseItemId
    ? BASE_WEAPON_OPTIONS.find((option) => option.id === item.baseItemId) ?? null
    : getExactBaseWeaponOption(item);
  const builtInDamageType = builtInMetadata?.damageType || "";
  const builtInDamageDice = builtInMetadata?.damageDice || "";
  const resolvedDamageDice = parseDamageDice(item.damage) || parseDamageDice(item.baseDamage) || builtInDamageDice || exactBaseWeapon?.damage.match(/\d+d\d+/i)?.[0] || "";
  const resolvedDamageType =
    normalizeDamageType(item.damage?.match(/\b([a-z]+)\b$/i)?.[1]) ||
    normalizeDamageType(item.baseDamage?.match(/\b([a-z]+)\b$/i)?.[1]) ||
    builtInDamageType ||
    normalizeDamageType(exactBaseWeapon?.damage.split(/\s+/).slice(1).join(" "));
  const resolvedDamage = resolvedDamageDice
    ? `${resolvedDamageDice}${resolvedDamageType ? ` ${resolvedDamageType}` : ""}`.trim()
    : item.damage || item.baseDamage || "";

  if (!exactBaseWeapon) {
    return {
      ...item,
      baseDamage: item.baseDamage || resolvedDamage || undefined,
      damage: item.damage || resolvedDamage || undefined,
    };
  }

  return {
    ...item,
    baseItemId: item.baseItemId || exactBaseWeapon.id,
    baseItemName: item.baseItemName || exactBaseWeapon.name,
    baseDamage: item.baseDamage || exactBaseWeapon.damage,
    damage: item.damage || resolvedDamage || exactBaseWeapon.damage,
  };
}

export function getBaseWeaponOptionsForInventoryItem(item: CharacterInventoryItem) {
  if (!isWeaponLike(item)) {
    return [];
  }

  const normalizedItem = normalizeInventoryWeaponItem(item);
  const haystack = `${normalizedItem.name} ${normalizedItem.family ?? ""} ${normalizedItem.itemType ?? ""} ${normalizedItem.damage ?? ""}`.toLowerCase();
  const groups = new Set<BaseWeaponOption["group"]>();

  if (/\b(sword|blade|scimitar|rapier)\b/.test(haystack)) {
    groups.add("swords");
  }
  if (/\baxe\b/.test(haystack)) {
    groups.add("axes");
  }
  if (/\bbow\b/.test(haystack)) {
    groups.add("bows");
  }
  if (/\bcrossbow\b/.test(haystack)) {
    groups.add("crossbows");
  }
  if (/\bdagger\b/.test(haystack)) {
    groups.add("daggers");
  }
  if (/\bhammer|maul\b/.test(haystack)) {
    groups.add("hammers");
  }
  if (/\bstaff|spear|lance|pike|glaive|halberd\b/.test(haystack)) {
    groups.add("polearms");
  }

  if (!groups.size) {
    groups.add("weapons");
    groups.add("swords");
    groups.add("axes");
    groups.add("bows");
    groups.add("crossbows");
  }

  return BASE_WEAPON_OPTIONS.filter((option) => groups.has(option.group));
}

export function needsBaseWeaponResolution(item: CharacterInventoryItem) {
  const normalizedItem = normalizeInventoryWeaponItem(item);
  return (
    isWeaponLike(normalizedItem) &&
    !/\d+d\d+/i.test(`${normalizedItem.damage ?? ""} ${normalizedItem.baseDamage ?? ""}`) &&
    getBaseWeaponOptionsForInventoryItem(normalizedItem).length > 0
  );
}

export function isGenericDamageValue(value?: string) {
  return /\buses the chosen\b|\bchosen .*damage die\b/i.test(value ?? "");
}

export function needsBaseWeaponChoice(item: CharacterInventoryItem) {
  const normalizedItem = normalizeInventoryWeaponItem(item);
  return (
    getBaseWeaponOptionsForInventoryItem(normalizedItem).length > 0 &&
    !normalizedItem.baseItemId &&
    (needsBaseWeaponResolution(normalizedItem) || isGenericDamageValue(normalizedItem.damage))
  );
}

function getAbilityModifier(score?: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.floor(((score ?? 10) - 10) / 2);
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getBaseArmorRule(item: CharacterInventoryItem) {
  const haystack = `${item.name} ${item.family ?? ""} ${item.itemType ?? ""}`.toLowerCase();
  return BASE_ARMOR_RULES.find((rule) => rule.match.test(haystack));
}

function getArmorProficiencyRequirement(item: CharacterInventoryItem) {
  if (item.category === "shield" || /\bshield\b/i.test(item.name)) {
    return "shield";
  }

  return getBaseArmorRule(item)?.armorType ?? "";
}

const MARTIAL_WEAPON_IDS = new Set([
  "battleaxe",
  "flail",
  "glaive",
  "greataxe",
  "greatsword",
  "halberd",
  "lance",
  "longbow",
  "longsword",
  "maul",
  "morningstar",
  "pike",
  "rapier",
  "scimitar",
  "shortsword",
  "trident",
  "war-pick",
  "warhammer",
  "whip",
  "hand-crossbow",
  "heavy-crossbow",
]);

export function getWeaponProficiencyTierForText(value: string) {
  const normalized = value.toLowerCase().replace(/[-_]+/g, " ");
  const baseOption = BASE_WEAPON_OPTIONS.find((option) => {
    const optionName = option.name.toLowerCase();
    const optionId = option.id.replace(/-/g, " ");
    return new RegExp(`\\b${optionName.replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized) || normalized.includes(optionId);
  });

  if (baseOption) {
    return MARTIAL_WEAPON_IDS.has(baseOption.id) ? "martial" : "simple";
  }

  if (/\b(?:sword|rapier|longbow|heavy crossbow|hand crossbow|battleaxe|greataxe|maul|halberd|glaive|lance|pike|warhammer|war pick|whip)\b/i.test(normalized)) {
    return "martial";
  }

  if (/\b(?:club|dagger|greatclub|handaxe|javelin|light hammer|mace|quarterstaff|sickle|spear|shortbow|light crossbow)\b/i.test(normalized)) {
    return "simple";
  }

  return "";
}

function normalizeProficiencyLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const IRREGULAR_WEAPON_PROFICIENCY_SINGULARS: Record<string, string> = {
  axes: "axe",
  knives: "knife",
  staves: "staff",
  weapons: "weapon",
};

function singularizeWeaponProficiencyWord(word: string) {
  if (IRREGULAR_WEAPON_PROFICIENCY_SINGULARS[word]) {
    return IRREGULAR_WEAPON_PROFICIENCY_SINGULARS[word];
  }

  if (word.endsWith("ies") && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.endsWith("es") && /(ches|shes|sses|xes|zes)$/.test(word)) {
    return word.slice(0, -2);
  }

  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
}

function canonicalizeWeaponProficiencyLookup(value: string) {
  return normalizeProficiencyLookup(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeWeaponProficiencyWord)
    .join(" ");
}

function buildWeaponProficiencyLookup(values: string[]) {
  const lookup = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeProficiencyLookup(value);
    if (normalized) {
      lookup.add(normalized);
    }

    const canonical = canonicalizeWeaponProficiencyLookup(value);
    if (canonical) {
      lookup.add(canonical);
    }
  });

  return lookup;
}

function hasWeaponProficiencyLabel(proficiencies: Set<string>, value: string) {
  const normalized = normalizeProficiencyLookup(value);
  return Boolean(normalized) && (proficiencies.has(normalized) || proficiencies.has(canonicalizeWeaponProficiencyLookup(value)));
}

function getBaseWeaponMetadata(option: BaseWeaponOption) {
  return getBuiltInWeaponMetadata(option.name);
}

function getResolvedWeaponMetadata(item: CharacterInventoryItem) {
  const normalizedItem = normalizeInventoryWeaponItem(item);
  const exactMetadata = getBuiltInWeaponMetadata(normalizedItem.name);
  const baseOption = normalizedItem.baseItemId
    ? BASE_WEAPON_OPTIONS.find((option) => option.id === normalizedItem.baseItemId) ?? null
    : getExactBaseWeaponOption(normalizedItem);
  const baseMetadata = baseOption ? getBaseWeaponMetadata(baseOption) : getBuiltInWeaponMetadata(normalizedItem.baseItemName);
  const propertyCodes = new Set<string>([
    ...(baseMetadata?.propertyCodes ?? []),
    ...(exactMetadata?.propertyCodes ?? []),
  ]);
  const explicitDamageType =
    normalizeDamageType(normalizedItem.damage?.match(/\b([a-z]+)\b$/i)?.[1]) ||
    normalizeDamageType(normalizedItem.baseDamage?.match(/\b([a-z]+)\b$/i)?.[1]);
  const exactDamageType =
    exactMetadata?.damageType ||
    findDamageTypeFromKeywords(exactMetadata?.keywords ?? []) ||
    findDamageTypeFromText(exactMetadata?.descriptionText ?? "");
  const damageType =
    explicitDamageType ||
    exactDamageType ||
    baseMetadata?.damageType ||
    normalizeDamageType(baseOption?.damage.split(/\s+/).slice(1).join(" "));
  const damageDice =
    parseDamageDice(normalizedItem.damage) ||
    parseDamageDice(normalizedItem.baseDamage) ||
    exactMetadata?.damageDice ||
    baseMetadata?.damageDice ||
    parseDamageDice(baseOption?.damage);
  const range = exactMetadata?.range || baseMetadata?.range || "";
  const versatileDamage = exactMetadata?.versatileDamage || baseMetadata?.versatileDamage || "";
  const attackKind = exactMetadata?.attackKind || baseMetadata?.attackKind || (propertyCodes.has("amm") ? "ranged" : "melee");

  return {
    item: normalizedItem,
    attackKind,
    damageDice,
    damageType,
    propertyCodes,
    range,
    versatileDamage,
    baseOption,
  };
}

function chooseWeaponAttackAbility(
  attackKind: WeaponAttackKind,
  propertyCodes: Set<string>,
  abilities?: Partial<Record<AbilityKey, number>>,
) {
  const strengthModifier = getAbilityModifier(abilities?.strength);
  const dexterityModifier = getAbilityModifier(abilities?.dexterity);

  if (propertyCodes.has("fin")) {
    if (dexterityModifier >= strengthModifier) {
      return { ability: "dexterity" as const, modifier: dexterityModifier };
    }

    return { ability: "strength" as const, modifier: strengthModifier };
  }

  if (attackKind === "ranged") {
    return { ability: "dexterity" as const, modifier: dexterityModifier };
  }

  return { ability: "strength" as const, modifier: strengthModifier };
}

function formatSignedNumber(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatDamageSummary(damageDice: string, modifier: number) {
  if (!damageDice) {
    return "—";
  }
  if (modifier === 0) {
    return damageDice;
  }
  return `${damageDice}${formatSignedNumber(modifier)}`;
}

function formatWeaponProperties(
  attackKind: WeaponAttackKind,
  propertyCodes: Set<string>,
  range: string,
  versatileDamage: string,
) {
  const parts = WEAPON_PROPERTY_DISPLAY_ORDER
    .filter((code) => propertyCodes.has(code))
    .map((code) => (code === "vers" && versatileDamage ? `vers (${versatileDamage})` : code));

  if (propertyCodes.has("thrown")) {
    parts.push(range ? `thrown ${range}` : "thrown");
  } else if (attackKind === "ranged" && range) {
    parts.push(`range ${range}`);
  }

  return parts.join(", ");
}

function isWeaponProficient(
  item: CharacterInventoryItem,
  baseOption: BaseWeaponOption | null,
  proficiencies: Set<string>,
) {
  const exactNames = [item.name, item.baseItemName, baseOption?.name, item.baseItemId, baseOption?.id]
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => [normalizeProficiencyLookup(name), canonicalizeWeaponProficiencyLookup(name)])
    .filter(Boolean);
  if (exactNames.some((name) => proficiencies.has(name))) {
    return true;
  }

  const tier = getWeaponProficiencyTierForText([
    item.baseItemId,
    item.baseItemName,
    baseOption?.id,
    baseOption?.name,
    item.name,
  ]
    .filter(Boolean)
    .join(" "));
  if (tier === "simple" && hasWeaponProficiencyLabel(proficiencies, "simple weapons")) {
    return true;
  }
  if (tier === "martial" && hasWeaponProficiencyLabel(proficiencies, "martial weapons")) {
    return true;
  }

  return false;
}

function resolveInventoryWeaponAttackRowWithProficiencies(
  item: CharacterInventoryItem,
  context: InventoryWeaponAttackContext,
  proficiencies: Set<string>,
): ResolvedInventoryWeaponAttackRow | null {
  const normalizedItem = normalizeInventoryWeaponItem(item);
  if (!isWeaponLike(normalizedItem)) {
    return null;
  }

  const metadata = getResolvedWeaponMetadata(normalizedItem);
  const proficiencyBonus = Number.isFinite(context.proficiencyBonus) ? Math.floor(context.proficiencyBonus ?? 0) : 0;
  const attackAbility = chooseWeaponAttackAbility(metadata.attackKind, metadata.propertyCodes, context.abilities);
  const enhancementBonus =
    metadata.item.attunable && !metadata.item.attuned
      ? 0
      : inferItemEnhancementBonus(metadata.item);
  const proficient = isWeaponProficient(metadata.item, metadata.baseOption, proficiencies);

  const bypassStrPenalty = doesWeaponBypassStrPenalty(metadata.item);
  const hitBonus = attackAbility.modifier + enhancementBonus + (proficient ? proficiencyBonus : 0);
  const damageAbilityComponent =
    bypassStrPenalty && attackAbility.ability === "strength" && attackAbility.modifier < 0
      ? 0
      : attackAbility.modifier;
  const damageBonus = damageAbilityComponent + enhancementBonus;

  const properties = formatWeaponProperties(
    metadata.attackKind,
    metadata.propertyCodes,
    metadata.range,
    metadata.versatileDamage,
  );

  return {
    id: `attack-${normalizedItem.id}`,
    name: normalizedItem.name,
    hit: formatSignedNumber(hitBonus),
    damage: formatDamageSummary(metadata.damageDice, damageBonus),
    type: metadata.damageType || undefined,
    properties: properties || undefined,
  };
}

export function resolveInventoryWeaponAttackRow(
  item: CharacterInventoryItem,
  context: InventoryWeaponAttackContext = {},
): ResolvedInventoryWeaponAttackRow | null {
  const proficiencies = buildWeaponProficiencyLookup(context.weaponProficiencies ?? []);
  return resolveInventoryWeaponAttackRowWithProficiencies(item, context, proficiencies);
}

export function resolveInventoryWeaponAttackRows(
  items: CharacterInventoryItem[],
  context: InventoryWeaponAttackContext = {},
): ResolvedInventoryWeaponAttackRow[] {
  const proficiencies = buildWeaponProficiencyLookup(context.weaponProficiencies ?? []);

  return items
    .filter((item) => item.equipped && isWeaponLike(item))
    .map((item) => resolveInventoryWeaponAttackRowWithProficiencies(item, context, proficiencies))
    .filter((row): row is ResolvedInventoryWeaponAttackRow => Boolean(row));
}

function getWeaponProficiencyRequirement(item: CharacterInventoryItem) {
  const normalizedItem = normalizeInventoryWeaponItem(item);

  if (!isWeaponLike(normalizedItem)) {
    return "";
  }

  const haystack = `${normalizedItem.name} ${normalizedItem.family ?? ""} ${normalizedItem.itemType ?? ""} ${normalizedItem.baseItemName ?? ""}`.toLowerCase();
  const baseId = normalizedItem.baseItemId || BASE_WEAPON_OPTIONS.find((option) => haystack.includes(option.name.toLowerCase()))?.id;
  if (!baseId) {
    return getWeaponProficiencyTierForText(haystack) || "simple";
  }
  return baseId && MARTIAL_WEAPON_IDS.has(baseId) ? "martial" : "simple";
}

function getArmorDexContribution(rule: BaseArmorRule, dexModifier: number) {
  if (rule.dexMode === "none") {
    return 0;
  }
  if (rule.dexMode === "max2") {
    return Math.min(dexModifier, 2);
  }
  return dexModifier;
}

function getAttunementGatedEffectState(item: CharacterInventoryItem) {
  if (item.attunable && !item.attuned) {
    return { active: false, reason: "requires attunement" };
  }

  if (item.equippable && !item.equipped) {
    return { active: false, reason: "not equipped" };
  }

  return { active: true, reason: "active" };
}

function getEquippedEffectState(item: CharacterInventoryItem) {
  return item.equipped
    ? { active: true, reason: "equipped" }
    : { active: false, reason: "not equipped" };
}

function parseAcBonusFromText(value: string) {
  const normalized = stripMarkup(value);
  const matches = [...normalized.matchAll(/(?:gain|grants?|have|has|provid(?:e|es|ing)|bonus is|bonus of)?\s*\+(\d+)\s+(?:[^.]{0,48}?\s)?bonus to AC\b/gi)];
  return matches
    .map((match) => Number(match[1]))
    .filter((bonus) => Number.isFinite(bonus) && bonus > 0)
    .sort((left, right) => right - left)[0] ?? 0;
}

function getInventoryAcEffects(item: CharacterInventoryItem, context: InventoryEffectContext): InventoryAcEffect[] {
  const effects: InventoryAcEffect[] = [];
  const equippedState = getEquippedEffectState(item);
  const magicState = getAttunementGatedEffectState(item);
  const dexModifier = getAbilityModifier(context.abilities?.dexterity);

  if (item.category === "armor" && !/\bshield\b/i.test(item.name)) {
    const armorRule = getBaseArmorRule(item);
    if (armorRule) {
      effects.push({
        kind: "armor-formula",
        item,
        armorRule,
        baseAc: armorRule.baseAc,
        dexContribution: getArmorDexContribution(armorRule, dexModifier),
        active: equippedState.active,
        reason: equippedState.reason,
      });
    }
  }

  if (item.category === "shield" || /\bshield\b/i.test(item.name)) {
    effects.push({
      kind: "shield-normal",
      item,
      bonus: 2,
      active: equippedState.active,
      reason: equippedState.reason,
    });
  }

  const itemText = `${item.name}. ${item.detailHtml ?? ""} ${item.notes ?? ""}`;
  const enhancement = inferItemEnhancementBonus(item);
  const parsedAcBonus = parseAcBonusFromText(itemText);
  const acBonus =
    item.category === "armor" || item.category === "shield" || /\bshield\b/i.test(item.name)
      ? Math.max(enhancement, parsedAcBonus)
      : parsedAcBonus;
  if (acBonus > 0) {
    effects.push({
      kind: "ac-bonus",
      item,
      bonus: acBonus,
      label: item.category === "armor" || item.category === "shield" ? "magic" : "AC bonus",
      active: magicState.active,
      reason: magicState.reason,
    });
  }

  return effects;
}

function formatAcTraceLabel(effect: InventoryAcEffect): string {
  if (effect.kind === "armor-formula") {
    const dexText =
      effect.armorRule.dexMode === "none"
        ? ""
        : effect.armorRule.dexMode === "max2"
          ? ` + DEX (${formatModifier(effect.dexContribution)}) max 2`
          : ` + DEX (${formatModifier(effect.dexContribution)})`;
    return `${effect.item.name} | ${effect.baseAc}${dexText} AC`;
  }

  if (effect.kind === "shield-normal") {
    const value = formatModifier(effect.bonus);
    return `${effect.item.name} | ${value} AC`;
  }

  return `${effect.item.name} | ${formatModifier(effect.bonus)} AC`;
}

function acEffectValue(effect: InventoryAcEffect) {
  if (effect.kind === "armor-formula") {
    return effect.baseAc + effect.dexContribution;
  }
  return effect.bonus;
}

export function resolveInventoryArmorClass(
  items: CharacterInventoryItem[],
  context: InventoryEffectContext = {},
): ResolvedInventoryArmorClass {
  const dexMod = getAbilityModifier(context.abilities?.dexterity);
  const normalizedItems = items.map(normalizeInventoryWeaponItem);
  const effects = normalizedItems.flatMap((item) => getInventoryAcEffects(item, context));
  const armorEffects = effects.filter(
    (effect): effect is Extract<InventoryAcEffect, { kind: "armor-formula" }> =>
      effect.kind === "armor-formula" && effect.active,
  );
  const chosenArmor = armorEffects
    .map((effect) => ({ effect, value: acEffectValue(effect) }))
    .sort((left, right) => right.value - left.value)[0];
  const activeShield = effects
    .filter(
      (effect): effect is Extract<InventoryAcEffect, { kind: "shield-normal" }> =>
        effect.kind === "shield-normal" && effect.active,
    )
    .map((effect) => {
      const shieldMagic = effects
        .filter(
          (candidate): candidate is Extract<InventoryAcEffect, { kind: "ac-bonus" }> =>
            candidate.kind === "ac-bonus" && candidate.active && candidate.item.id === effect.item.id,
        )
        .reduce((sum, candidate) => sum + candidate.bonus, 0);
      return { effect, value: effect.bonus + shieldMagic };
    })
    .sort((left, right) => right.value - left.value)[0];
  const shieldMagicIds = new Set(activeShield ? [activeShield.effect.item.id] : []);
  const standaloneBonuses = effects.filter(
    (effect): effect is Extract<InventoryAcEffect, { kind: "ac-bonus" }> =>
      effect.kind === "ac-bonus" &&
      effect.active &&
      !(effect.item.category === "shield" || /\bshield\b/i.test(effect.item.name)) &&
      effect.item.id !== chosenArmor?.effect.item.id,
  );
  const armorMagic = chosenArmor
    ? effects
        .filter(
          (effect): effect is Extract<InventoryAcEffect, { kind: "ac-bonus" }> =>
            effect.kind === "ac-bonus" && effect.active && effect.item.id === chosenArmor.effect.item.id,
        )
        .reduce((sum, effect) => sum + effect.bonus, 0)
    : 0;
  const baseValue = chosenArmor ? chosenArmor.value + armorMagic : 10 + dexMod;
  const shieldValue = activeShield?.value ?? 0;
  const standaloneValue = standaloneBonuses.reduce((sum, effect) => sum + effect.bonus, 0);
  const activeTraces: InventoryAcTrace[] = [];

  if (chosenArmor) {
    activeTraces.push({
      id: `armor-${chosenArmor.effect.item.id}`,
      itemId: chosenArmor.effect.item.id,
      label: formatAcTraceLabel(chosenArmor.effect),
      value: chosenArmor.value,
      active: true,
      reason: chosenArmor.effect.reason,
    });
    if (armorMagic) {
      activeTraces.push({
        id: `armor-magic-${chosenArmor.effect.item.id}`,
        itemId: chosenArmor.effect.item.id,
        label: `${chosenArmor.effect.item.name}: magic`,
        value: armorMagic,
        active: true,
        reason: "active",
      });
    }
  } else {
    activeTraces.push({
      id: "unarmored",
      label: `Unarmored | 10 ${formatModifier(dexMod)} AC`,
      value: 10 + dexMod,
      active: true,
      reason: "base formula",
    });
  }

  if (activeShield) {
    activeTraces.push({
      id: `shield-${activeShield.effect.item.id}`,
      itemId: activeShield.effect.item.id,
      label: `${activeShield.effect.item.name} | ${formatModifier(activeShield.value)} AC`,
      value: activeShield.value,
      active: true,
      reason: activeShield.effect.reason,
    });
  }

  standaloneBonuses.forEach((effect) => {
    if (shieldMagicIds.has(effect.item.id)) {
      return;
    }
    activeTraces.push({
      id: `ac-bonus-${effect.item.id}`,
      itemId: effect.item.id,
      label: formatAcTraceLabel(effect),
      value: effect.bonus,
      active: true,
      reason: effect.reason,
    });
  });

  return {
    value: baseValue + shieldValue + standaloneValue,
    meta: activeTraces
      .map((trace) => trace.label)
      .join("\n"),
    traces: activeTraces,
  };
}

export function createEmptyCurrency(): CharacterCurrency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

export function getCurrencyTotalInGp(currency: CharacterCurrency) {
  return currency.gp + currency.pp * 10 + currency.ep * 0.5 + currency.sp * 0.1 + currency.cp * 0.01;
}

export function buildStartingInventoryFromPlan(
  plan: StartingEquipmentPlan,
  selections: Record<string, string>,
  mode: EquipmentAcquisitionMode,
  goldOverrideGp: number | null,
  existingItems: CharacterInventoryItem[],
  removedItemIds: string[],
) {
  const preservedByKey = new Map(existingItems.map((item) => [item.id, item]));
  const removed = new Set(removedItemIds);
  const items: CharacterInventoryItem[] = [];
  const currency = createEmptyCurrency();
  const manualItems = existingItems.filter(
    (item) => item.source === "manual" || item.source === "gold",
  );

  if (mode === "gold" && plan.goldAlternative) {
    currency.gp += goldOverrideGp ?? plan.goldAlternative.averageGp;
  }

  const allEntries: Array<{ source: InventoryItemSource; label: string; raw: string }> = [];

  for (const item of plan.autoItems) {
    if (mode === "gold" && item.source === "class") {
      continue;
    }
    allEntries.push({
      source: "starting-fixed",
      label: item.source === "class" ? "Class gear" : "Auto-added",
      raw: item.name,
    });
  }

  for (const group of plan.choiceGroups) {
    if (mode === "gold" && group.source === "class") {
      continue;
    }
    const selectedId = selections[group.id];
    const selectedOption = group.options.find((option) => option.id === selectedId);
    if (!selectedOption) {
      continue;
    }
    for (const item of selectedOption.items) {
      allEntries.push({
        source: "starting-choice",
        label: group.title,
        raw: item,
      });
    }
  }

  for (const entry of allEntries) {
    const parsed = parseQuantityAndCurrency(entry.raw);
    if (parsed.currency) {
      currency[parsed.currency] += parsed.quantity;
      continue;
    }

    const id = getInventoryItemKey(parsed.name, entry.label);
    if (removed.has(id)) {
      continue;
    }
    const previous = preservedByKey.get(id);
    const category = categorizeInventoryItem(parsed.name);
    items.push(normalizeInventoryWeaponItem({
      id,
      name: parsed.name,
      quantity: parsed.quantity,
      category,
      source: entry.source,
      sourceLabel: entry.label,
      sourceName: previous?.sourceName,
      sourceUrl: previous?.sourceUrl,
      rarity: previous?.rarity,
      cost: previous?.cost,
      weight: previous?.weight,
      slot: previous?.slot,
      family: previous?.family,
      itemType: previous?.itemType,
      equippable: previous?.equippable ?? isInventoryItemEquippable(parsed.name, category),
      equipped: previous?.equipped ?? false,
      attunable: previous?.attunable ?? false,
      attuned: previous?.attuned ?? false,
      attackBonus: previous?.attackBonus,
      baseItemId: previous?.baseItemId,
      baseItemName: previous?.baseItemName,
      baseDamage: previous?.baseDamage,
      damage: previous?.damage,
      sheetDescription: previous?.sheetDescription,
      notes: previous?.notes,
      detailHtml: previous?.detailHtml,
      includeInItemDescriptions:
        previous?.includeInItemDescriptions ??
        Boolean(previous?.detailHtml || previous?.notes || previous?.rarity || previous?.attunable),
    }));
  }

  for (const item of manualItems) {
    if (removed.has(item.id)) {
      continue;
    }

    items.push(item);
  }

  return {
    items,
    currency,
  };
}

export function summarizeInventory(items: CharacterInventoryItem[], attunementLimit = ATTUNEMENT_LIMIT) {
  const equipped = items.filter((item) => item.equipped).length;
  const attuned = items.filter((item) => item.attuned).length;
  const attunable = items.filter((item) => item.attunable).length;

  return {
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    uniqueItems: items.length,
    equipped,
    attuned,
    attunable,
    attunementLimit,
    attunementOverLimit: Math.max(0, attuned - attunementLimit),
  };
}

function getWeaponEffectLine(item: CharacterInventoryItem) {
  const normalizedItem = normalizeInventoryWeaponItem(item);

  if (!normalizedItem.equipped || !isWeaponLike(normalizedItem)) {
    return "";
  }

  if (normalizedItem.attunable && !normalizedItem.attuned) {
    return `${normalizedItem.name}: equipped, attunement required before magic effects apply`;
  }

  const enhancement = inferItemEnhancementBonus(normalizedItem);
  const baseName = normalizedItem.baseItemName ? ` (${normalizedItem.baseItemName})` : "";
  const damage = normalizedItem.damage || normalizedItem.baseDamage;
  const pieces = [
    `${normalizedItem.name}${baseName}`,
    enhancement ? `+${enhancement} attack/damage` : "",
    damage ? damage : "damage die unresolved",
  ].filter(Boolean);

  return pieces.join(": ");
}

function stripMarkup(value?: string) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isItemEffectActive(item: CharacterInventoryItem) {
  if (item.attunable) {
    return item.attuned;
  }
  if (!item.equippable) {
    return true;
  }
  if (!item.equipped) {
    return false;
  }
  return true;
}

function getItemGrantLines(item: CharacterInventoryItem) {
  if (!isItemEffectActive(item)) {
    return [];
  }

  const text = stripMarkup(`${item.name}. ${item.detailHtml ?? ""} ${item.notes ?? ""}`);
  const normalized = text.toLowerCase();
  const lines: string[] = [];

  if (/\bheadband of intellect\b/.test(normalized)) {
    lines.push(`${item.name}: sets Intelligence to 19 while active unless already higher.`);
  } else if (/\bamulet of health\b/.test(normalized)) {
    lines.push(`${item.name}: sets Constitution to 19 while active unless already higher.`);
  } else if (/\bgauntlets of ogre power\b/.test(normalized)) {
    lines.push(`${item.name}: sets Strength to 19 while active unless already higher.`);
  } else if (/\bbelt of .*giant strength\b/.test(normalized)) {
    lines.push(`${item.name}: sets Strength by giant type; choose/record the exact variant before final sheet/PDF.`);
  } else if (/\bstrength score changes to\b/.test(normalized)) {
    lines.push(`${item.name}: changes Strength while active; exact value needs item-specific resolution.`);
  }

  if (/\bgain proficiency\b|\byou are proficient\b|\bproficiency in\b/.test(normalized)) {
    lines.push(`${item.name}: grants or changes proficiency while active; M4.4 will expose this as a manual/equipment grant.`);
  }

  if (/\byou can cast\b|\bcast the\b|\bgain the effect of (?:the )?[a-z]/.test(normalized)) {
    lines.push(`${item.name}: grants spellcasting or a spell-like effect while active; M4.4 will expose this as an additional spell/effect grant.`);
  }

  if (/\bincrease one of your ability scores\b|\bability score increases\b|\bscore increases by\b/.test(normalized)) {
    lines.push(`${item.name}: grants an ability-score change; M4.4 will expose this as an additional ASI/effect grant.`);
  }

  return lines;
}

export function getInventoryEffectSummary(items: CharacterInventoryItem[], context: InventoryEffectContext = {}) {
  const attunementLimit = context.attunementLimit ?? ATTUNEMENT_LIMIT;
  const armorProficiencies = new Set(context.armorProficiencies ?? []);
  const weaponProficiencies = new Set(context.weaponProficiencies ?? []);
  const normalizedItems = items.map(normalizeInventoryWeaponItem);
  const attunedItems = normalizedItems.filter((item) => item.attuned);
  const equippedItems = normalizedItems.filter((item) => item.equipped);
  const equippedArmor = equippedItems.filter((item) => item.category === "armor" && !/\bshield\b/i.test(item.name));
  const equippedShields = equippedItems.filter((item) => item.category === "shield" || /\bshield\b/i.test(item.name));
  const armorClass = resolveInventoryArmorClass(normalizedItems, context);
  const acLines = armorClass.traces.map((trace) => `${trace.label} (${trace.value >= 0 ? "+" : ""}${trace.value})`);
  const weaponLines = normalizedItems.map(getWeaponEffectLine).filter(Boolean);
  const itemGrantLines = normalizedItems.flatMap(getItemGrantLines);
  const warnings = [
    attunedItems.length > attunementLimit
      ? `Attunement limit exceeded: ${attunedItems.length}/${attunementLimit}.`
      : "",
    attunedItems.length >= attunementLimit
      ? `Attunement slots full: ${attunedItems.length}/${attunementLimit}. Unattune an item before attuning another.`
      : "",
    equippedArmor.length > 1
      ? `Multiple armor entries are equipped: ${equippedArmor.map((item) => item.name).join(", ")}. The sheet should use one armor formula.`
      : "",
    equippedShields.length > 1
      ? `Multiple shields are equipped: ${equippedShields.map((item) => item.name).join(", ")}. Check with your table before stacking shield bonuses.`
      : "",
    ...normalizedItems
      .filter((item) => item.equipped && item.attunable && !item.attuned)
      .map((item) => `${item.name} is equipped but not attuned; its attunement-gated effects should stay inactive.`),
    ...normalizedItems
      .filter((item) => item.equipped && needsBaseWeaponChoice(item))
      .map((item) => `${item.name} needs a base weapon or damage value before sheet/PDF attack rows can be complete.`),
    ...normalizedItems
      .filter((item) => item.equipped)
      .map((item) => {
        const requirement = getArmorProficiencyRequirement(item);
        if (!requirement || armorProficiencies.has(requirement)) {
          return "";
        }
        return `${item.name} is equipped but ${requirement === "shield" ? "shield" : `${requirement} armor`} proficiency is not currently detected.`;
      }),
    ...normalizedItems
      .filter((item) => item.equipped)
      .map((item) => {
        const requirement = getWeaponProficiencyRequirement(item);
        if (!requirement || weaponProficiencies.has(requirement) || (item.baseItemId ? weaponProficiencies.has(item.baseItemId) : false)) {
          return "";
        }
        return `${item.name} is equipped but ${requirement} weapon proficiency is not currently detected.`;
      }),
  ].filter(Boolean);

  return {
    attunementLimit,
    attunedCount: attunedItems.length,
    equippedCount: equippedItems.length,
    acLines,
    weaponLines,
    itemGrantLines,
    warnings,
  };
}
