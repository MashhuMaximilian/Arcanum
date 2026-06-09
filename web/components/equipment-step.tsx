"use client";

import { useEffect, useMemo, useState } from "react";

import { CatalogSelector, type CatalogItem } from "@/components/catalog-selector";
import { MarkdownEditor } from "@/components/markdown-editor";
import type {
  AbilityKey,
  CharacterCurrency,
  CharacterEquipmentNotes,
  CharacterInventoryItem,
  CharacterManualGrant,
  CharacterManualGrantKind,
} from "@/lib/characters/types";
import type { EquipmentCatalogEntry } from "@/lib/equipment/catalog";
import { getMergedEquipmentCatalog } from "@/lib/equipment/catalog";
import type { EquipmentAcquisitionMode, InventoryCategory } from "@/lib/equipment/inventory";
import {
  BASE_WEAPON_OPTIONS,
  getBaseWeaponOptionsForInventoryItem,
  getCurrencyTotalInGp,
  getInventoryEffectSummary,
  getWeaponProficiencyTierForText,
  isGenericDamageValue,
  needsBaseWeaponChoice,
  needsBaseWeaponResolution,
  summarizeInventory,
} from "@/lib/equipment/inventory";
import type { StartingEquipmentPlan } from "@/lib/equipment/starting-equipment";

type EquipmentStepProps = {
  plan: StartingEquipmentPlan;
  mode: EquipmentAcquisitionMode;
  goldOverrideGp: number | null;
  selections: Record<string, string>;
  inventoryItems: CharacterInventoryItem[];
  currency: CharacterCurrency;
  equipmentNotes: CharacterEquipmentNotes;
  manualGrants: CharacterManualGrant[];
  manualGrantCatalogs: Record<Exclude<CharacterManualGrantKind, "asi">, CatalogItem[]>;
  effectiveAbilities: Record<AbilityKey, number>;
  attunementLimit: number;
  equipmentProficiencies: {
    armor: string[];
    weapons: string[];
  };
  onModeChange: (mode: EquipmentAcquisitionMode) => void;
  onGoldOverrideChange: (value: number | null) => void;
  onSelect: (groupId: string, optionId: string) => void;
  onToggleEquipped: (itemId: string) => void;
  onToggleAttuned: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (
    itemId: string,
    patch: {
      name: string;
      category: InventoryCategory;
      quantity: number;
      attackBonus: string;
      baseItemId: string;
      baseItemName: string;
      baseDamage: string;
      damage: string;
      sheetDescription: string;
      notes: string;
      equippable: boolean;
      attunable: boolean;
      includeInItemDescriptions: boolean;
    },
  ) => void;
  onAddManualItem: (entry: EquipmentCatalogEntry) => void;
  onAddCustomItem: (input: {
    name: string;
    category: InventoryCategory;
    quantity: number;
    attackBonus: string;
    baseItemId: string;
    baseItemName: string;
    baseDamage: string;
    damage: string;
    sheetDescription: string;
    notes: string;
    equippable: boolean;
    attunable: boolean;
    includeInItemDescriptions: boolean;
  }) => void;
  onEquipmentNotesChange: (notes: CharacterEquipmentNotes) => void;
  onAddManualGrant: (grant: CharacterManualGrant) => void;
  onRemoveManualGrant: (grantId: string) => void;
};

type InventoryView = "all" | "equipped" | "attuned";

function formatCurrency(currency: CharacterCurrency) {
  return (["pp", "gp", "ep", "sp", "cp"] as const)
    .filter((key) => currency[key] > 0)
    .map((key) => `${currency[key]} ${key}`)
    .join(" • ");
}

function titleCaseCategory(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

const ITEM_BROWSER_PREFERRED_TAGS = [
  "Adventuring Gear",
  "Treasure",
  "Equipment Packs",
  "Tools",
  "Musical Instruments",
  "Armor",
  "Magic Armor",
  "Weapons",
  "Simple Weapons",
  "Martial Weapons",
  "Magic Weapons",
  "Requires attunement",
  "Ammunition",
  "Spellcasting Focus",
  "Wondrous Items",
  "Supernatural Gifts",
  "Staffs",
  "Rods",
  "Wands",
  "Rings",
  "Potions",
  "Poison",
  "Scrolls",
  "Mounts & Vehicles",
  "Alchemical Formulas",
  "Reagents",
  "Explosives",
  "Miscellaneous",
];

const CUSTOM_ITEM_CATEGORY_OPTIONS: Array<{ value: InventoryCategory; label: string }> = [
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "shield", label: "Shield" },
  { value: "focus", label: "Focus" },
  { value: "ammo", label: "Ammunition" },
  { value: "tool", label: "Tool" },
  { value: "instrument", label: "Instrument" },
  { value: "pack", label: "Pack" },
  { value: "clothing", label: "Clothing" },
  { value: "book", label: "Book" },
  { value: "holy-symbol", label: "Holy symbol" },
  { value: "consumable", label: "Consumable" },
  { value: "treasure", label: "Treasure" },
  { value: "misc", label: "Miscellaneous" },
];

const DM_GRANT_ROWS: Array<{
  kind: CharacterManualGrantKind;
  title: string;
  description: string;
  pickerLabel: string;
  preferredTags?: string[];
}> = [
  {
    kind: "spell",
    title: "Additional spells",
    description: "DM-granted spells, item spells, boons, and table exceptions.",
    pickerLabel: "Additional spell",
    preferredTags: ["Cantrip", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7", "Level 8", "Level 9"],
  },
  {
    kind: "proficiency",
    title: "Additional proficiencies",
    description: "Skills, tools, weapons, armor, saves, expertise, and conditional proficiencies.",
    pickerLabel: "Additional proficiency",
    preferredTags: ["Skill", "Tool", "Armor", "Weapon", "Saving Throw", "Expertise"],
  },
  {
    kind: "language",
    title: "Additional languages",
    description: "Learned, granted, temporary, or campaign-specific languages.",
    pickerLabel: "Additional language",
    preferredTags: ["Standard", "Exotic", "Campaign"],
  },
  {
    kind: "feat",
    title: "Additional feats",
    description: "Bonus feats, feat-like boons, and DM-approved prerequisite exceptions.",
    pickerLabel: "Additional feat",
    preferredTags: ["Feat", "Ability Score Improvement", "Spellcasting", "Proficiency"],
  },
  {
    kind: "feature",
    title: "Additional features",
    description: "Blessings, charms, curses, faction benefits, custom class features, and item traits.",
    pickerLabel: "Additional feature",
    preferredTags: ["Class Feature", "Archetype Feature", "Racial Trait", "Background Feature", "Feat Feature"],
  },
  {
    kind: "asi",
    title: "Additional ASIs / ability changes",
    description: "Permanent ASIs, temporary score setters, penalties, and training rewards.",
    pickerLabel: "Additional ASI",
  },
];

function getEquipmentCatalogCardId(item: EquipmentCatalogEntry) {
  return `${item.origin}::${item.sourceUrl || item.source}::${item.id}`;
}

export function EquipmentStep({
  plan,
  mode,
  goldOverrideGp,
  selections,
  inventoryItems,
  currency,
  equipmentNotes,
  manualGrants,
  manualGrantCatalogs,
  effectiveAbilities,
  attunementLimit,
  equipmentProficiencies,
  onModeChange,
  onGoldOverrideChange,
  onSelect,
  onToggleEquipped,
  onToggleAttuned,
  onRemoveItem,
  onUpdateItem,
  onAddManualItem,
  onAddCustomItem,
  onEquipmentNotesChange,
  onAddManualGrant,
  onRemoveManualGrant,
}: EquipmentStepProps) {
  const [inventoryView, setInventoryView] = useState<InventoryView>("all");
  const [inventorySearch, setInventorySearch] = useState("");
  const [catalogItems, setCatalogItems] = useState<EquipmentCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemCategory, setCustomItemCategory] = useState<InventoryCategory>("misc");
  const [customItemQuantity, setCustomItemQuantity] = useState("1");
  const [customItemAttackBonus, setCustomItemAttackBonus] = useState("");
  const [customItemBaseId, setCustomItemBaseId] = useState("");
  const [customItemDamage, setCustomItemDamage] = useState("");
  const [customItemSheetDescription, setCustomItemSheetDescription] = useState("");
  const [customItemNotes, setCustomItemNotes] = useState("");
  const [customItemEquippable, setCustomItemEquippable] = useState(false);
  const [customItemAttunable, setCustomItemAttunable] = useState(false);
  const [customItemIncludeInDescriptions, setCustomItemIncludeInDescriptions] = useState(true);
  const [editingItemId, setEditingItemId] = useState("");
  const [editingItemName, setEditingItemName] = useState("");
  const [editingItemCategory, setEditingItemCategory] = useState<InventoryCategory>("misc");
  const [editingItemQuantity, setEditingItemQuantity] = useState("1");
  const [editingItemAttackBonus, setEditingItemAttackBonus] = useState("");
  const [editingItemBaseId, setEditingItemBaseId] = useState("");
  const [editingItemBaseName, setEditingItemBaseName] = useState("");
  const [editingItemBaseDamage, setEditingItemBaseDamage] = useState("");
  const [editingItemDamage, setEditingItemDamage] = useState("");
  const [editingItemSheetDescription, setEditingItemSheetDescription] = useState("");
  const [editingItemNotes, setEditingItemNotes] = useState("");
  const [editingItemEquippable, setEditingItemEquippable] = useState(false);
  const [editingItemAttunable, setEditingItemAttunable] = useState(false);
  const [editingItemIncludeInDescriptions, setEditingItemIncludeInDescriptions] = useState(false);
  const [manualAsiAbility, setManualAsiAbility] = useState<AbilityKey>("strength");
  const [manualAsiMode, setManualAsiMode] = useState<"increase" | "set">("increase");
  const [manualAsiAmount, setManualAsiAmount] = useState("1");
  const summary = useMemo(() => summarizeInventory(inventoryItems, attunementLimit), [attunementLimit, inventoryItems]);
  const effectSummary = useMemo(
    () =>
      getInventoryEffectSummary(inventoryItems, {
        abilities: effectiveAbilities,
        attunementLimit,
        armorProficiencies: equipmentProficiencies.armor,
        weaponProficiencies: equipmentProficiencies.weapons,
      }),
    [attunementLimit, effectiveAbilities, equipmentProficiencies, inventoryItems],
  );

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setCatalogLoading(true);
      try {
        const entries = await getMergedEquipmentCatalog();
        if (!active) {
          return;
        }
        setCatalogItems(entries);
      } finally {
        if (active) {
          setCatalogLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      active = false;
    };
  }, []);

  const visibleInventoryItems = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (inventoryView === "equipped" && !item.equipped) {
        return false;
      }
      if (inventoryView === "attuned" && !item.attuned) {
        return false;
      }
      if (!query) {
        return true;
      }
      return item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    });
  }, [inventoryItems, inventorySearch, inventoryView]);

  const availableClassGroups = plan.choiceGroups.filter((group) => group.source === "class");
  const availableBackgroundGroups = plan.choiceGroups.filter((group) => group.source === "background");

  const manualItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    inventoryItems.forEach((item) => {
      if (item.source !== "manual") {
        return;
      }
      counts.set(item.id.replace(/^manual::/, ""), item.quantity);
    });
    return counts;
  }, [inventoryItems]);

  const itemCatalogCards = useMemo<CatalogItem[]>(
    () =>
      catalogItems.map((item) => {
        const ownedCount = manualItemCounts.get(item.id) ?? 0;
        const needsBaseWeapon = item.mechanicsLines.some((line) => isGenericDamageValue(line));
        const weaponTier = getWeaponProficiencyTierForText(
          [item.name, item.family, item.rawCategory, item.rawSubtype, ...item.mechanicsLines].filter(Boolean).join(" "),
        );
        const weaponTierTag =
          item.category === "weapon" || /weapon/i.test(`${item.family} ${item.rawCategory} ${item.rawSubtype}`)
            ? weaponTier === "martial"
              ? "Martial Weapons"
              : weaponTier === "simple"
                ? "Simple Weapons"
                : ""
            : "";
        return {
          id: getEquipmentCatalogCardId(item),
          name: item.name,
          description: item.description,
          detailHtml: item.detailHtml,
          meta: item.family,
          origin: item.origin,
          source: item.source,
          filterTags: [...item.filterTags, weaponTierTag].filter(Boolean),
          detailTags: item.detailTags,
          summaryLines: item.summaryLines,
          impactLines: [
            item.attunable ? "Requires attunement" : "",
            ownedCount ? `Owned ${ownedCount}` : "Not owned",
            needsBaseWeapon ? "Needs base weapon after adding" : "",
            ...item.impactLines,
          ].filter(Boolean),
          mechanicsLines: item.mechanicsLines,
        };
      }),
    [catalogItems, manualItemCounts],
  );

  const parsedCustomItemQuantity = Math.max(1, Number(customItemQuantity) || 1);
  const parsedEditingItemQuantity = Math.max(1, Number(editingItemQuantity) || 1);
  const selectedCustomBaseWeapon = BASE_WEAPON_OPTIONS.find((option) => option.id === customItemBaseId);
  const currentEquipmentWarnings = useMemo(
    () =>
      Array.from(
        new Set([
          ...inventoryItems
            .filter(needsBaseWeaponChoice)
            .map((item) => `${item.name} needs a base weapon choice before sheet/PDF attack rows can be complete.`),
          ...effectSummary.warnings,
        ]),
      ),
    [effectSummary.warnings, inventoryItems],
  );

  function startEditingItem(item: CharacterInventoryItem) {
    setEditingItemId(item.id);
    setEditingItemName(item.name);
    setEditingItemCategory((item.category as InventoryCategory) ?? "misc");
    setEditingItemQuantity(String(item.quantity || 1));
    setEditingItemAttackBonus(item.attackBonus ?? "");
    setEditingItemBaseId(item.baseItemId ?? "");
    setEditingItemBaseName(item.baseItemName ?? "");
    setEditingItemBaseDamage(item.baseDamage ?? "");
    setEditingItemDamage(item.damage ?? "");
    setEditingItemSheetDescription(item.sheetDescription ?? "");
    setEditingItemNotes(item.notes ?? "");
    setEditingItemEquippable(item.equippable);
    setEditingItemAttunable(item.attunable);
    setEditingItemIncludeInDescriptions(item.includeInItemDescriptions);
  }

  function clearEditingItem() {
    setEditingItemId("");
    setEditingItemName("");
    setEditingItemCategory("misc");
    setEditingItemQuantity("1");
    setEditingItemAttackBonus("");
    setEditingItemBaseId("");
    setEditingItemBaseName("");
    setEditingItemBaseDamage("");
    setEditingItemDamage("");
    setEditingItemSheetDescription("");
    setEditingItemNotes("");
    setEditingItemEquippable(false);
    setEditingItemAttunable(false);
    setEditingItemIncludeInDescriptions(false);
  }

  return (
    <div className="equipment-step">
      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Acquisition and snapshot</span>
          <small>{mode === "gold" ? "Gold flow active" : "Starting gear flow active"}</small>
        </summary>
        <div className="equipment-step__accordionBody">
          <div className="equipment-step__hero">
            <section className="equipment-step__panel equipment-step__panel--mode">
          <span className="builder-panel__label">Acquisition mode</span>
          <div className="equipment-step__modeToggle">
            <button
              className={`choice-chip${mode === "gear" ? " choice-chip--active" : ""}`}
              type="button"
              onClick={() => onModeChange("gear")}
            >
              Starting gear
            </button>
            <button
              className={`choice-chip${mode === "gold" ? " choice-chip--active" : ""}`}
              type="button"
              onClick={() => onModeChange("gold")}
              disabled={!plan.goldAlternative}
              title={plan.goldAlternative ? undefined : "Gold alternative is not modeled yet for this class."}
            >
              Gold instead
            </button>
          </div>
          {mode === "gold" && plan.goldAlternative ? (
            <div className="equipment-step__goldCard">
              <strong>{plan.goldAlternative.formula}</strong>
              <p className="builder-summary__meta">
                Defaulting to the average: {plan.goldAlternative.averageGp} gp
              </p>
              <label className="builder-field">
                <span className="builder-panel__label">Override starting gold</span>
                <input
                  className="input"
                  inputMode="numeric"
                  min={0}
                  placeholder={`${plan.goldAlternative.averageGp}`}
                  type="number"
                  value={goldOverrideGp ?? ""}
                  onChange={(event) =>
                    onGoldOverrideChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value)))
                  }
                />
              </label>
              <p className="builder-summary__meta">
                Leave blank to keep the suggested average.
              </p>
              {plan.goldAlternative.notes.map((note) => (
                <p className="builder-summary__meta" key={note}>
                  {note}
                </p>
              ))}
            </div>
          ) : (
            <p className="builder-summary__meta">
              Use guided starting gear to keep class and background packages explicit.
            </p>
          )}
            </section>

            <section className="equipment-step__panel equipment-step__panel--summary">
          <span className="builder-panel__label">Inventory snapshot</span>
          <div className="equipment-step__stats">
            <article className="equipment-step__statCard">
              <span className="builder-panel__label">Owned</span>
              <strong>{summary.uniqueItems}</strong>
              <span>{summary.totalItems} total pieces</span>
            </article>
            <article className="equipment-step__statCard">
              <span className="builder-panel__label">Equipped</span>
              <strong>{summary.equipped}</strong>
              <span>active gear</span>
            </article>
            <article className="equipment-step__statCard">
              <span className="builder-panel__label">Attuned</span>
              <strong>{summary.attuned}</strong>
              <span>
                {summary.attunable} attunable, limit {summary.attunementLimit}
              </span>
            </article>
          </div>
          <div className="equipment-step__effects">
            <span className="builder-panel__label">Equipment effects</span>
            {effectSummary.acLines.length ||
            effectSummary.weaponLines.length ||
            effectSummary.itemGrantLines.length ? (
              <ul className="equipment-step__effectList">
                {effectSummary.acLines.map((line) => (
                  <li key={`ac-${line}`}>{line}</li>
                ))}
                {effectSummary.weaponLines.map((line) => (
                  <li key={`weapon-${line}`}>{line}</li>
                ))}
                {effectSummary.itemGrantLines.map((line) => (
                  <li key={`grant-${line}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="builder-summary__meta">
                Equip gear to preview AC, weapon, and attunement-sensitive effects.
              </p>
            )}
          </div>
          <div className="equipment-step__currency">
            <span className="builder-panel__label">Currency</span>
            <strong>{formatCurrency(currency) || "0 gp"}</strong>
            <span>{getCurrencyTotalInGp(currency).toFixed(2)} gp total value</span>
          </div>
          {plan.notes.length ? (
            <div className="equipment-step__notes">
              <span className="builder-panel__label">Notes</span>
              {plan.notes.map((note) => (
                <p className="builder-summary__meta" key={note}>
                  {note}
                </p>
              ))}
            </div>
          ) : null}
            </section>
          </div>
        </div>
      </details>

      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Starting gear builder</span>
          <small>
            {mode === "gold"
              ? "Class gear collapsed while using gold"
              : `${availableClassGroups.length + availableBackgroundGroups.length} sections`}
          </small>
        </summary>
        <div className="equipment-step__accordionBody">
            <div className="equipment-step__groups">
              {availableClassGroups.length ? (
                <details className="equipment-step__accordion" open>
                  <summary className="equipment-step__accordionSummary">
                    <span>Class starting gear</span>
                    <small>{mode === "gold" ? "Skipped while using gold" : `${availableClassGroups.length} groups`}</small>
                  </summary>
                  <div className="equipment-step__accordionBody">
                    {mode === "gold" ? (
                      <p className="builder-summary__meta">
                        Class package choices are skipped while the gold alternative is active.
                      </p>
                    ) : (
                      availableClassGroups.map((group) => (
                        <section className="equipment-step__group" key={group.id}>
                          <div className="equipment-step__groupHeader">
                            <span className="builder-panel__label">{group.title}</span>
                            <p className="builder-summary__meta">{group.description}</p>
                          </div>
                          <div className="choice-grid">
                            {group.options.map((option) => {
                              const active = selections[group.id] === option.id;
                              return (
                                <button
                                  className={`choice-card${active ? " choice-card--active" : ""}`}
                                  key={option.id}
                                  type="button"
                                  onClick={() => onSelect(group.id, option.id)}
                                >
                                  <strong>{option.label}</strong>
                                  <div className="equipment-step__optionItems">
                                    {option.items.map((item, itemIndex) => (
                                      <span key={`${option.id}-${itemIndex}-${item}`}>{item}</span>
                                    ))}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                </details>
              ) : null}

              {availableBackgroundGroups.length ? (
                <details className="equipment-step__accordion" open>
                  <summary className="equipment-step__accordionSummary">
                    <span>Background gear</span>
                    <small>{availableBackgroundGroups.length} groups</small>
                  </summary>
                  <div className="equipment-step__accordionBody">
                    {availableBackgroundGroups.map((group) => (
                      <section className="equipment-step__group" key={group.id}>
                        <div className="equipment-step__groupHeader">
                          <span className="builder-panel__label">{group.title}</span>
                          <p className="builder-summary__meta">{group.description}</p>
                        </div>
                        <div className="choice-grid">
                          {group.options.map((option) => {
                            const active = selections[group.id] === option.id;
                            return (
                              <button
                                className={`choice-card${active ? " choice-card--active" : ""}`}
                                key={option.id}
                                type="button"
                                onClick={() => onSelect(group.id, option.id)}
                              >
                                <strong>{option.label}</strong>
                                <div className="equipment-step__optionItems">
                                  {option.items.map((item, itemIndex) => (
                                    <span key={`${option.id}-${itemIndex}-${item}`}>{item}</span>
                                  ))}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
        </div>
      </details>

      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Owned inventory</span>
          <small>{summary.uniqueItems} owned entries</small>
        </summary>
        <div className="equipment-step__accordionBody">
          <aside className="equipment-step__panel equipment-step__panel--inventory">
          <div className="equipment-step__inventoryHeader">
            <div>
              <span className="builder-panel__label">Inventory</span>
              <strong className="equipment-step__inventoryTitle">Owned gear and state</strong>
            </div>
            <div className="chip-grid">
              <button
                className={`choice-chip${inventoryView === "all" ? " choice-chip--active" : ""}`}
                type="button"
                onClick={() => setInventoryView("all")}
              >
                All
              </button>
              <button
                className={`choice-chip${inventoryView === "equipped" ? " choice-chip--active" : ""}`}
                type="button"
                onClick={() => setInventoryView("equipped")}
              >
                Equipped
              </button>
              <button
                className={`choice-chip${inventoryView === "attuned" ? " choice-chip--active" : ""}`}
                type="button"
                onClick={() => setInventoryView("attuned")}
              >
                Attuned
              </button>
            </div>
          </div>

          {currentEquipmentWarnings.length ? (
            <div className="equipment-step__localWarnings" role="status">
              <span className="builder-panel__label">Inventory attention</span>
              <ul>
                {currentEquipmentWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="builder-field">
            <span className="builder-panel__label">Search inventory</span>
            <input
              className="input"
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search item or category"
            />
          </label>

          <div className="equipment-step__inventoryTableWrap">
            <div className="equipment-step__inventoryTable">
              <div className="equipment-step__inventoryHead">
                <span>Name</span>
                <span>Category</span>
                <span>Qty</span>
                <span>State</span>
              </div>
              <div className="equipment-step__inventoryBody">
                {visibleInventoryItems.length ? (
                  visibleInventoryItems.map((item) => {
                    const baseWeaponOptions = getBaseWeaponOptionsForInventoryItem(item);
                    const baseWeaponRequired =
                      baseWeaponOptions.length > 0 &&
                      !editingItemBaseId &&
                      (needsBaseWeaponResolution(item) ||
                        isGenericDamageValue(editingItemDamage) ||
                        isGenericDamageValue(item.damage));
                    const attunementBlocked =
                      item.attunable &&
                      !item.attuned &&
                      effectSummary.attunedCount >= effectSummary.attunementLimit;

                    return (
                    <div className="equipment-step__inventoryRow" key={item.id}>
                      <div className="equipment-step__inventoryName">
                        <strong>{item.name}</strong>
                        <span>{item.sourceLabel}</span>
                      </div>
                      <span>{titleCaseCategory(item.category)}</span>
                        <span>{item.quantity}</span>
                        <div className="equipment-step__inventoryActions">
                        {item.equippable ? (
                          <button
                            aria-label={item.equipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
                            className={`choice-chip equipment-step__actionButton${item.equipped ? " choice-chip--active" : ""}`}
                            data-label={item.equipped ? "Unequip" : "Equip"}
                            title={item.equipped ? "Unequip" : "Equip"}
                            type="button"
                            onClick={() => onToggleEquipped(item.id)}
                          >
                            <span aria-hidden="true">{item.equipped ? "⚔" : "♙"}</span>
                          </button>
                        ) : null}
                        {item.attunable ? (
                          <button
                            aria-label={item.attuned ? `Unattune ${item.name}` : `Attune ${item.name}`}
                            className={`choice-chip equipment-step__actionButton${item.attuned ? " choice-chip--active" : ""}`}
                            data-label={attunementBlocked ? `Attunement limit ${effectSummary.attunedCount}/${effectSummary.attunementLimit}` : item.attuned ? "Unattune" : "Attune"}
                            type="button"
                            disabled={attunementBlocked}
                            onClick={() => onToggleAttuned(item.id)}
                            title={attunementBlocked ? `Attunement limit is ${effectSummary.attunementLimit}.` : item.attuned ? "Unattune" : "Attune"}
                          >
                            <span aria-hidden="true">{item.attuned ? "🔗" : "♢"}</span>
                          </button>
                        ) : null}
                        {attunementBlocked ? (
                          <span className="equipment-step__actionWarning">
                            Limit {effectSummary.attunedCount}/{effectSummary.attunementLimit}
                          </span>
                        ) : null}
                        <button
                          aria-label={`Edit ${item.name}`}
                          className="choice-chip equipment-step__actionButton"
                          data-label="Edit"
                          title="Edit"
                          type="button"
                          onClick={() => startEditingItem(item)}
                        >
                          <span aria-hidden="true">✎</span>
                        </button>
                        <button
                          aria-label={`Delete ${item.name}`}
                          className="choice-chip equipment-step__actionButton"
                          data-label="Delete"
                          title="Delete"
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>
                      {item.attackBonus || item.baseItemName || item.baseDamage || item.damage || item.sheetDescription || item.notes ? (
                        <div className="equipment-step__inventoryNote">
                          {item.attackBonus ? <span>Modifier: {item.attackBonus}</span> : null}
                          {item.baseItemName ? <span>Base: {item.baseItemName}</span> : null}
                          {item.baseDamage ? <span>Base damage: {item.baseDamage}</span> : null}
                          {item.damage ? <span>Damage: {item.damage}</span> : null}
                          {item.sheetDescription ? <span>Character-sheet description override set</span> : null}
                          {item.notes ? <span>{item.notes}</span> : null}
                        </div>
                      ) : null}
                      {editingItemId === item.id ? (
                        <div className="equipment-step__editPanel">
                          <div className="equipment-step__manualRow equipment-step__manualRow--balanced">
                            <label className="builder-field">
                              <span className="builder-summary__meta">Item name</span>
                              <input
                                className="input"
                                value={editingItemName}
                                onChange={(event) => setEditingItemName(event.target.value)}
                              />
                            </label>
                            <label className="builder-field">
                              <span className="builder-summary__meta">Qty</span>
                              <input
                                className="input"
                                inputMode="numeric"
                                min={1}
                                type="number"
                                value={editingItemQuantity}
                                onChange={(event) => setEditingItemQuantity(event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="equipment-step__manualRow equipment-step__manualRow--balanced">
                            <label className="builder-field">
                              <span className="builder-summary__meta">Category</span>
                              <select
                                className="input"
                                value={editingItemCategory}
                                onChange={(event) => setEditingItemCategory(event.target.value as InventoryCategory)}
                              >
                                {CUSTOM_ITEM_CATEGORY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="builder-field">
                              <span className="builder-summary__meta">Modifier</span>
                              <input
                                className="input"
                                placeholder="+1, +2..."
                                value={editingItemAttackBonus}
                                onChange={(event) => setEditingItemAttackBonus(event.target.value)}
                              />
                            </label>
                          </div>
                          {baseWeaponOptions.length ? (
                            <label className="builder-field">
                              <span className="builder-summary__meta">
                                Base weapon for sheet/PDF damage{baseWeaponRequired ? " (required)" : ""}
                              </span>
                              <select
                                className="input"
                                value={editingItemBaseId}
                                onChange={(event) => {
                                  const option = baseWeaponOptions.find((candidate) => candidate.id === event.target.value);
                                  setEditingItemBaseId(option?.id ?? "");
                                  setEditingItemBaseName(option?.name ?? "");
                                  setEditingItemBaseDamage(option?.damage ?? "");
                                  if (
                                    option &&
                                    (!editingItemDamage ||
                                      editingItemDamage === editingItemBaseDamage ||
                                      isGenericDamageValue(editingItemDamage))
                                  ) {
                                    setEditingItemDamage(option.damage);
                                  }
                                }}
                              >
                                <option value="">Choose base weapon...</option>
                                {baseWeaponOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name} - {option.damage}
                                  </option>
                                ))}
                              </select>
                              {baseWeaponRequired ? (
                                <span className="builder-summary__meta builder-summary__meta--warning">
                                  Pick the underlying weapon so attacks and PDF damage can resolve.
                                </span>
                              ) : null}
                            </label>
                          ) : null}
                          <label className="builder-field">
                            <span className="builder-summary__meta">Damage</span>
                            <input
                              className="input"
                              placeholder="1d8 slashing, +1d6 fire..."
                              value={editingItemDamage}
                              onChange={(event) => setEditingItemDamage(event.target.value)}
                            />
                          </label>
                          <label className="builder-field">
                            <span className="builder-summary__meta">Character-sheet description</span>
                            <MarkdownEditor
                              compact
                              placeholder="Optional short override for the PDF. Leave blank to use the item's original description."
                              slashContext="Character sheet item description"
                              value={editingItemSheetDescription}
                              onChange={setEditingItemSheetDescription}
                            />
                          </label>
                          <div className="equipment-step__itemToggles">
                            <label className="equipment-step__itemToggle">
                              <input
                                type="checkbox"
                                checked={editingItemEquippable}
                                onChange={(event) => setEditingItemEquippable(event.target.checked)}
                              />
                              <span>Equippable</span>
                            </label>
                            <label className="equipment-step__itemToggle">
                              <input
                                type="checkbox"
                                checked={editingItemAttunable}
                                onChange={(event) => setEditingItemAttunable(event.target.checked)}
                              />
                              <span>Requires attunement</span>
                            </label>
                            <label className="equipment-step__itemToggle">
                              <input
                                type="checkbox"
                                checked={editingItemIncludeInDescriptions}
                                onChange={(event) => setEditingItemIncludeInDescriptions(event.target.checked)}
                              />
                              <span>Include in PDF item descriptions</span>
                            </label>
                          </div>
                          <label className="builder-field">
                            <span className="builder-summary__meta">Notes</span>
                            <MarkdownEditor
                              compact
                              placeholder="Optional details, effects, provenance, or table ruling."
                              slashContext="Inventory item notes"
                              value={editingItemNotes}
                              onChange={setEditingItemNotes}
                            />
                          </label>
                          <div className="equipment-step__manualActions">
                            <button
                              className="button button--secondary button--compact"
                              type="button"
                              disabled={!editingItemName.trim() || baseWeaponRequired}
                              onClick={() => {
                                if (!editingItemName.trim() || baseWeaponRequired) {
                                  return;
                                }
                                onUpdateItem(item.id, {
                                  name: editingItemName.trim(),
                                  category: editingItemCategory,
                                  quantity: parsedEditingItemQuantity,
                                  attackBonus: editingItemAttackBonus.trim(),
                                  baseItemId: editingItemBaseId,
                                  baseItemName: editingItemBaseName,
                                  baseDamage: editingItemBaseDamage,
                                  damage: editingItemDamage.trim(),
                                  sheetDescription: editingItemSheetDescription.trim(),
                                  notes: editingItemNotes.trim(),
                                  equippable: editingItemEquippable,
                                  attunable: editingItemAttunable,
                                  includeInItemDescriptions: editingItemIncludeInDescriptions,
                                });
                                clearEditingItem();
                              }}
                            >
                              Save item
                            </button>
                            <button
                              className="button button--ghost button--compact"
                              type="button"
                              onClick={clearEditingItem}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
                ) : (
                  <p className="builder-summary__meta">No inventory entries match the current view.</p>
                )}
              </div>
            </div>
          </div>
            </aside>
        </div>
      </details>

      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Item browser</span>
          <small>{itemCatalogCards.length} entries</small>
        </summary>
        <div className="equipment-step__accordionBody">
      <section className="equipment-step__panel">
        <div className="equipment-step__groupHeader">
          <span className="builder-panel__label">Item browser</span>
          <p className="builder-summary__meta">
            Browse mundane gear, magic items, wondrous items, and imported equipment sources, then add what your table grants.
          </p>
        </div>
        {catalogLoading ? (
          <p className="builder-summary__meta">Loading item catalog…</p>
        ) : (
          <CatalogSelector
            actionLabel="Add to inventory"
            emptyMessage="No matching equipment entries."
            items={itemCatalogCards}
            label="Item"
            onAction={(itemId) => {
              const entry = catalogItems.find((item) => getEquipmentCatalogCardId(item) === itemId);
              if (!entry) {
                return;
              }
              onAddManualItem(entry);
            }}
            onSelect={() => {}}
            preferredTags={ITEM_BROWSER_PREFERRED_TAGS}
            selectedId=""
            tagSectionLabel="Item type"
            tagLimit={24}
            defaultDetailView="reference"
          />
        )}
      </section>
        </div>
      </details>

      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Manual additions</span>
          <small>Items, notes, and DM grants</small>
        </summary>
        <div className="equipment-step__accordionBody">
      <section className="equipment-step__panel">
        <div className="equipment-step__groupHeader">
          <span className="builder-panel__label">Manual additions</span>
          <p className="builder-summary__meta">
            Add custom table-granted items and keep lightweight notes for extra treasure or quest items that do not belong in the catalog.
          </p>
        </div>
        <div className="equipment-step__manualGrid">
          <div className="equipment-step__manualCard">
            <span className="builder-panel__label">Custom item</span>
            <label className="builder-field">
              <span className="builder-summary__meta">Item name</span>
              <input
                className="input"
                placeholder="Custom shield, relic, trophy..."
                value={customItemName}
                onChange={(event) => setCustomItemName(event.target.value)}
              />
            </label>
            <div className="equipment-step__manualRow">
              <label className="builder-field">
                <span className="builder-summary__meta">Category</span>
                <select
                  className="input"
                  value={customItemCategory}
                  onChange={(event) => setCustomItemCategory(event.target.value as InventoryCategory)}
                >
                  {CUSTOM_ITEM_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="builder-field">
                <span className="builder-summary__meta">Qty</span>
                <input
                  className="input"
                  inputMode="numeric"
                  min={1}
                  type="number"
                  value={customItemQuantity}
                  onChange={(event) => setCustomItemQuantity(event.target.value)}
                />
              </label>
            </div>
            <div className="equipment-step__manualRow equipment-step__manualRow--balanced">
              <label className="builder-field">
                <span className="builder-summary__meta">Modifier</span>
                <input
                  className="input"
                  placeholder="+1, +2, advantage, table ruling..."
                  value={customItemAttackBonus}
                  onChange={(event) => setCustomItemAttackBonus(event.target.value)}
                />
              </label>
              <span aria-hidden="true" />
            </div>
            {customItemCategory === "weapon" ? (
              <label className="builder-field">
                <span className="builder-summary__meta">Base weapon for sheet/PDF damage</span>
                <select
                  className="input"
                  value={customItemBaseId}
                  onChange={(event) => {
                    const option = BASE_WEAPON_OPTIONS.find((candidate) => candidate.id === event.target.value);
                    setCustomItemBaseId(option?.id ?? "");
                    if (option && !customItemDamage) {
                      setCustomItemDamage(option.damage);
                    }
                  }}
                >
                  <option value="">Choose base weapon...</option>
                  {BASE_WEAPON_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} - {option.damage}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="builder-field">
              <span className="builder-summary__meta">Damage</span>
              <input
                className="input"
                placeholder="1d8 slashing, +1d6 fire..."
                value={customItemDamage}
                onChange={(event) => setCustomItemDamage(event.target.value)}
              />
            </label>
            <label className="builder-field">
              <span className="builder-summary__meta">Character-sheet description</span>
              <MarkdownEditor
                compact
                placeholder="Short description for the PDF item description area."
                slashContext="Custom item character sheet description"
                value={customItemSheetDescription}
                onChange={setCustomItemSheetDescription}
              />
            </label>
            <div className="equipment-step__itemToggles">
              <label className="equipment-step__itemToggle">
                <input
                  type="checkbox"
                  checked={customItemEquippable}
                  onChange={(event) => setCustomItemEquippable(event.target.checked)}
                />
                <span>Equippable</span>
              </label>
              <label className="equipment-step__itemToggle">
                <input
                  type="checkbox"
                  checked={customItemAttunable}
                  onChange={(event) => setCustomItemAttunable(event.target.checked)}
                />
                <span>Requires attunement</span>
              </label>
              <label className="equipment-step__itemToggle">
                <input
                  type="checkbox"
                  checked={customItemIncludeInDescriptions}
                  onChange={(event) => setCustomItemIncludeInDescriptions(event.target.checked)}
                />
                <span>Include in PDF item descriptions</span>
              </label>
            </div>
            <label className="builder-field">
              <span className="builder-summary__meta">Notes</span>
              <MarkdownEditor
                compact
                placeholder="Optional details, effects, provenance, or table ruling."
                slashContext="Custom item notes"
                value={customItemNotes}
                onChange={setCustomItemNotes}
              />
            </label>
            <div className="equipment-step__manualActions">
              <button
                className="button button--secondary button--compact"
                type="button"
                disabled={!customItemName.trim()}
                onClick={() => {
                  if (!customItemName.trim()) {
                    return;
                  }
                  onAddCustomItem({
                    name: customItemName.trim(),
                    category: customItemCategory,
                    quantity: parsedCustomItemQuantity,
                    attackBonus: customItemAttackBonus.trim(),
                    baseItemId: selectedCustomBaseWeapon?.id ?? "",
                    baseItemName: selectedCustomBaseWeapon?.name ?? "",
                    baseDamage: selectedCustomBaseWeapon?.damage ?? "",
                    damage: customItemDamage.trim(),
                    sheetDescription: customItemSheetDescription.trim(),
                    notes: customItemNotes.trim(),
                    equippable: customItemEquippable,
                    attunable: customItemAttunable,
                    includeInItemDescriptions: customItemIncludeInDescriptions,
                  });
                  setCustomItemName("");
                  setCustomItemCategory("misc");
                  setCustomItemQuantity("1");
                  setCustomItemAttackBonus("");
                  setCustomItemBaseId("");
                  setCustomItemDamage("");
                  setCustomItemSheetDescription("");
                  setCustomItemNotes("");
                  setCustomItemEquippable(false);
                  setCustomItemAttunable(false);
                  setCustomItemIncludeInDescriptions(true);
                }}
              >
                Add custom item
              </button>
            </div>
          </div>

          <div className="equipment-step__manualCard">
            <span className="builder-panel__label">Treasure and quest notes</span>
            <label className="builder-field">
              <span className="builder-summary__meta">Additional treasure</span>
              <MarkdownEditor
                compact
                placeholder="Loose valuables, favors owed, future loot promises, or stash notes."
                slashContext="Additional treasure"
                value={equipmentNotes.additionalTreasure}
                onChange={(value) =>
                  onEquipmentNotesChange({
                    ...equipmentNotes,
                    additionalTreasure: value,
                  })
                }
              />
            </label>
            <label className="builder-field">
              <span className="builder-summary__meta">Quest items</span>
              <MarkdownEditor
                compact
                placeholder="Story artifacts, keys, letters, badges, and items tracked outside normal inventory."
                slashContext="Quest items"
                value={equipmentNotes.questItems}
                onChange={(value) =>
                  onEquipmentNotesChange({
                    ...equipmentNotes,
                    questItems: value,
                  })
                }
              />
            </label>
          </div>
        </div>
      </section>
        </div>
      </details>

      <details className="equipment-step__accordion equipment-step__accordion--wide" open>
        <summary className="equipment-step__accordionSummary">
          <span>Manual / DM-granted extras</span>
          <small>{manualGrants.length ? `${manualGrants.length} active grants` : "No active grants"}</small>
        </summary>
        <div className="equipment-step__accordionBody">
          <section className="equipment-step__panel">
            <div className="equipment-step__groupHeader">
              <span className="builder-panel__label">Additional build grants</span>
              <p className="builder-summary__meta">
                Add DM-approved spells, proficiencies, languages, feats, features, and ability changes from unrestricted catalogs.
                These are always active manual grants, kept separate from carried inventory, and can only be removed here.
              </p>
            </div>
            <div className="equipment-step__additionalInventory">
              <div>
                <span className="builder-panel__label">Additional inventory</span>
                <strong>{manualGrants.length ? `${manualGrants.length} active grant${manualGrants.length === 1 ? "" : "s"}` : "No active grants"}</strong>
              </div>
              {manualGrants.length ? (
                <div className="equipment-step__grantChips">
                  {manualGrants.map((grant) => (
                    <span className="equipment-step__grantChip" key={grant.id}>
                      <span>
                        <strong>{grant.name}</strong>
                        <small>{grant.kind}{grant.source ? ` • ${grant.source}` : ""}</small>
                      </span>
                      <button
                        aria-label={`Delete ${grant.name}`}
                        className="choice-chip equipment-step__actionButton"
                        data-label="Delete"
                        title="Delete"
                        type="button"
                        onClick={() => onRemoveManualGrant(grant.id)}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="builder-summary__meta">No manual grants yet. Open a row below and add exactly what the DM allowed.</p>
              )}
            </div>
            <div className="equipment-step__grantRows">
              {DM_GRANT_ROWS.map((row) => {
                const rowGrants = manualGrants.filter((grant) => grant.kind === row.kind);
                const catalogItems = row.kind === "asi" ? [] : manualGrantCatalogs[row.kind];
                return (
                  <details className="equipment-step__grantRow" key={row.kind}>
                    <summary className="equipment-step__grantSummary">
                      <span>{row.title}</span>
                      <small>{rowGrants.length ? `${rowGrants.length} added` : "No additions yet"}</small>
                    </summary>
                    <div className="equipment-step__grantBody">
                      <p>{row.description}</p>
                      {row.kind === "asi" ? (
                        <div className="equipment-step__asiGrantEditor">
                          <label className="builder-field">
                            <span className="builder-summary__meta">Ability</span>
                            <select
                              className="input"
                              value={manualAsiAbility}
                              onChange={(event) => setManualAsiAbility(event.target.value as AbilityKey)}
                            >
                              <option value="strength">Strength</option>
                              <option value="dexterity">Dexterity</option>
                              <option value="constitution">Constitution</option>
                              <option value="intelligence">Intelligence</option>
                              <option value="wisdom">Wisdom</option>
                              <option value="charisma">Charisma</option>
                            </select>
                          </label>
                          <label className="builder-field">
                            <span className="builder-summary__meta">Mode</span>
                            <select
                              className="input"
                              value={manualAsiMode}
                              onChange={(event) => setManualAsiMode(event.target.value as "increase" | "set")}
                            >
                              <option value="increase">Increase score</option>
                              <option value="set">Set score to</option>
                            </select>
                          </label>
                          <label className="builder-field">
                            <span className="builder-summary__meta">Amount</span>
                            <input
                              className="input"
                              inputMode="numeric"
                              type="number"
                              value={manualAsiAmount}
                              onChange={(event) => setManualAsiAmount(event.target.value)}
                            />
                          </label>
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => {
                              const amount = Number(manualAsiAmount);
                              if (!Number.isFinite(amount)) {
                                return;
                              }
                              const abilityLabel = manualAsiAbility.charAt(0).toUpperCase() + manualAsiAbility.slice(1);
                              const modeLabel = manualAsiMode === "set" ? "set to" : "increase";
                              const id = `manual-grant::asi::${manualAsiMode}::${manualAsiAbility}::${Math.floor(amount)}::${Date.now()}`;
                              onAddManualGrant({
                                id,
                                kind: "asi",
                                name: `${abilityLabel} ${modeLabel} ${Math.floor(amount)}`,
                                source: "Manual / DM grant",
                                ability: manualAsiAbility,
                                mode: manualAsiMode,
                                amount: Math.floor(amount),
                                note: "Manual ability change; unrestricted DM grant.",
                              });
                            }}
                          >
                            Add ASI grant
                          </button>
                        </div>
                      ) : (
                        <CatalogSelector
                          actionLabel="Add grant"
                          defaultDetailView="reference"
                          emptyMessage={`No ${row.title.toLowerCase()} entries found.`}
                          items={catalogItems}
                          label={row.pickerLabel}
                          onAction={(id) => {
                            const item = catalogItems.find((candidate) => candidate.id === id);
                            if (!item) {
                              return;
                            }
                            onAddManualGrant({
                              id: `manual-grant::${row.kind}::${item.id}`,
                              kind: row.kind,
                              refId: item.id,
                              name: item.name,
                              source: item.source,
                              description: item.description,
                              detailHtml: item.detailHtml,
                              note: "Manual / DM grant; unrestricted by normal build prerequisites.",
                            });
                          }}
                          onSelect={() => {}}
                          preferredTags={row.preferredTags ?? []}
                          selectedId=""
                          tagSectionLabel={row.kind === "feature" ? "Feature type" : "Grant type"}
                          tagLimit={18}
                        />
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
