# D&D Rules Specialist Findings: Inventory & Companion Pages

**Author:** DND Rules Expert (Teammate Agent)
**Date:** 2026-05-25
**Sources consulted:** SRD_CC_v5.1.pdf, D&D 5E Player's Handbook, built-in SRD data (`generated-srd-items.ts`, `srd-companions.ts`, `items.ts`)

---

## 1. Inventory Page — Rules/Data Checklist

### 1.1 Core Item Fields

| Field | 5e Semantics | System-Neutral? |
|---|---|---|
| `name` | Item display name (e.g., "Longsword") | Yes |
| `weight` | In lbs; 1 lb per unit unless otherwise noted | Yes |
| `cost` | In gp (or sp/cp) | Yes |
| `quantity` | For stackable items (arrows, bolts, rations) | Yes |
| `category` | Adventuring Gear, Weapons, Armor, Magic Items, Mounts & Vehicles, Tools, etc. | Yes |
| `subtype` | E.g., "Armor" for magic armor subtype | Yes |
| `rarity` | Common, Uncommon, Rare, Very Rare, Legendary, Artifact (for magic items) | 5e-specific |
| `attunement` | Boolean: does this item require attunement? | 5e-specific |
| `slot` | Body, main hand, off hand, head, neck, ring1, ring2, waist, footwear, cloak, gloves | 5e-specific (D&D 5e slot system) |
| `stackable` | True/False for ammo/gear that counts in multiples | Yes |
| `type` | Item vs Magic Item vs Armor vs Weapon | Yes |
| `description` / `descriptionHtml` | Full item text (spells, magic item effects, etc.) | Yes |

### 1.2 Encumbrance Variants (CRITICAL — multiple variants exist)

**Variant #1 — Basic (default, no variant applied)**
- Carry Capacity = STR score × 15 lbs
- No movement penalty; purely informational

**Variant #2 — Variant Encumbrance (PHB, p. 176)**
- Encumbered threshold = STR × 5 lbs → disadvantage on ability checks, attack rolls, and saving throws that use STR, DEX, or CON
- Heavily Encumbered threshold = STR × 10 lbs → same as encumbered + half speed (round down to nearest 5 ft)
- Maximum Carrying Capacity = STR × 15 lbs → can still push/drag/lift STR × 30 lbs

**Implication:** The app must know which variant is active. If variant encumbrance is on, the inventory page should display current carry weight, encumbered threshold, and heavily-encumbered threshold. The current `generated-srd-items.ts` has no encumbrance flag.

### 1.3 Currency & Coin Weight

- 50 coins = 1 lb (regardless of denomination — 50 cp = 50 sp = 50 gp = 1 lb)
- Standard carrying: 1 gp = 1 sp = 10 cp = 1 lb per 50 coins
- **Edge case:** Electrum (5 sp = 1 gp) and Platinum (10 sp = 1 gp) are not in 5e core; check if UO adds these
- PHB PHB p.143: Carrying this money is practically weightless in 5e

### 1.4 Ammunition Weight Rules (PHB p.149)

| Item | Weight Rule |
|---|---|
| Arrows (20) | 1 lb |
| Bolts (20) | 1.5 lbs |
| Sling bullets (20) | 1.5 lbs |

**Edge case:** The SRD data shows `"weight": "1 lb."` for arrows without quantity context. Implementation should multiply weight by (quantity / 20) or handle as stackable.

### 1.5 Armor & Weapon Properties

- Armor has type (Light/Medium/Heavy), AC bonus, strength requirement
- Weapons have properties: finesse, thrown (20/60), versatile, two-handed, loading, reach, special
- These appear in `generated-srd-items.ts` setters (e.g., `"type": "Weapon"`, `"name-format": "Adamantine {{parent}}"`)

### 1.6 Magic Item Rarity & Attunement

From `generated-srd-items.ts`:
- Magic items have `rarity`: Uncommon, Rare, Very Rare, Legendary, Artifact
- Magic items have `attunement`: boolean string (`"true"`/`""`)
- Attuned items are limited to **3 per character** (DMG p.138)
- Attuned items must be indicated visually on the inventory page

### 1.7 Equipment Slot System (5e-specific)

D&D 5e uses a defined slot system for worn/carried magic items:
- `body` (armor)
- `main hand` (weapons)
- `off hand` (shields, weapons)
- `head`, `neck`, `ring1`, `ring2`, `waist`, `footwear`, `cloak`, `gloves`
- Some items have `"slot": ""` meaning they are not worn (e.g., potions, consumables)

**Edge case:** Two rings at the same time (ring1, ring2). The app must track both slots separately.

### 1.8 Item Category Hierarchy (from SRD)

- Adventuring Gear (subcategories: Ammunition, Arcane Focuses, Holy Symbols, Tools, etc.)
- Weapons (Martial Melee, Martial Ranged, Simple Melee, Simple Ranged)
- Armor (Light, Medium, Heavy, Shields)
- Magic Items (grouped by slot or category)
- Mounts & Vehicles (with Speed, Crew, Passengers, Cargo fields)
- Tools (Musical instruments, artisan's tools, etc.)

---

## 2. Companion Page — Rules/Data Checklist

### 2.1 Companion Types in 5e

| Companion Type | Source | Controlled By | Page in SRD/PHB |
|---|---|---|---|
| Ranger's Companion (Beast) | PHB p.93, SRD | Ranger (action to command) | SRD p.38 |
| Find Familiar | PHB p.240 | Wizard/Sorcerer (action to command) | SRD p.20 |
| Artillerist Eldritch Cannon | TCoE p.216 | Artificer (bonus action) | TCoE |
| Battle Smith Steel Defender | TCoE p.219 | Artificer (bonus action) | TCoE |
| Pact of the Chain Familiar | PHB p.108 | Warlock (action to command) | PHB |
| Mount (Combat) | PHB p.155 | Rider or autonomous | PHB |
| Mount (Non-Combat) | PHB p.155 | Autonomous | PHB |

### 2.2 Ranger's Companion — Specific Rules (PHB p.93)

- Must be a beast with CR ≤ 1/4 (before XGtE errata; check current errata)
- Beast cannot have Fly speed or Swimming speed unless the ranger has 18+ Wisdom at levels 3-4? No — this is a misremember. The beast simply must be CR ≤ 1/4.
- Companion adds proficiency bonus to AC, saving throws, and skill checks (when companion is proficient)
- Companion can take its own turn ( Initiative separately from ranger)
- Ranger can command companion as bonus action (Beast Master) or bonus action (Revenant Blade in SCAG — but that's not core 5e)
- Companion dies at 0 HP, make death saving throws (no action needed from ranger)
- If ranger is incapacitated, companion takes its own action
- Ranger can spend 8 hours to replace a dead companion

**Available Companion Creatures in SRD** (`srd-companions.ts`):
- Wolf, Panther, Poison Snake, Giant Badger, Giant Boar, Giant Goat, Giant Wasp, Mule, Pony, Mastiff, Riding Horse, Ape, Black Bear, Brown Bear, Dire Wolf, Giant Eagle, Giant Hyena, Giant Octopus, Giant Shark, Giant Tiger, Hadrosaurus, Pteranodon, Rhinoceros, Sabre-toothed Tiger, Triceratops, Tyrannosaurus Rex

### 2.3 Companion Stat Block Fields

From `srd-companions.ts`:
- `name`, `type` (Beast, Monstrosity, etc.), `size` (Tiny, Small, Medium, Large, Huge, Gargantuan)
- Stats: `str`, `dex`, `con`, `int`, `wis`, `cha` (each 1-30)
- `hitDice` (e.g., "2d8")
- `ac` (can be object like `{value: 13, type: "natural"}`)
- `hp` (current / max)
- `speed` (e.g., `{walk: "40 ft.", fly: "60 ft."}`)
- `abilities` (special traits like "Pack Tactics", "Reckless Attack", "Keen Smell")
- `actions` (named attacks with attack bonus, damage dice, reach/range)
- `reactions` (like "Pack Tactics")
- Proficiency bonus derived from CR or level

### 2.4 Action Economy for Companions

- Companions get their **own action** each round (not the owner's action)
- **Ranger's Beast Master:** Command companion as a bonus action (Beast Master); companion can Dash, Disengage, Help, or Attack on that turn
- **Find Familiar:** Action to command; familiar can only take the **Attack** action (with its one attack) or any action that doesn't deal damage (Dash, Disengage, Help, Hide)
- **Artificer's Eldritch Cannon:** Bonus action to command; cannon can be ordered to attack or take保护 action
- **Steel Defender:** Bonus action to command; has its own attack plus a "Deflect" reaction

### 2.5 CR and Proficiency Bonus Mapping (5e, DMG p.274)

| CR | Proficiency Bonus |
|---|---|
| 0 | +2 |
| 1/8–1/4 | +2 |
| 1/2–4 | +3 |
| 5–8 | +4 |
| 9–12 | +5 |
| 13–16 | +6 |
| 17–20 | +7 |

### 2.6 Attack Calculation

- Attack bonus = Proficiency + relevant ability modifier
- For melee: STR modifier; for ranged: DEX modifier
- Damage = dice + ability modifier (e.g., 1d8+3)

### 2.7 Special Traits (Examples from SRD)

- **Pack Tactics:** Advantage if an ally is within 5 ft of target
- **Keen Smell:** Advantage on Wisdom (Perception) checks using smell
- **Reckless Attack:** AC gives disadvantage on attacks against it (this is a risk to show)
- **Charge:** Extra damage on first turn if moving 20+ ft
- **Pounce:** Knock prone on charge

---

## 3. System-Neutral vs 5e-Specific Boundaries

### 3.1 System-Neutral (Can stay generic for any RPG)

**Inventory:**
- Item name, description, quantity
- Weight field (numerical lbs)
- Cost field (numerical or labeled currency)
- Category/subcategory grouping
- Stackable flag
- "Magic item" vs "mundane item" distinction (any RPG has consumables vs permanent items)

**Companion:**
- Name, type, size
- Six ability scores (universal in most RPGs)
- HP current/max
- AC
- Speed
- Actions with damage and reach/range
- Special abilities/traits

### 3.2 5e-Specific (Must implement 5e semantics or explicitly choose a variant)

**Inventory:**
- Encumbrance thresholds (variant vs basic)
- Attunement slot limit (3) and per-slot system
- Rarity tiers
- Specific armor/weapon property keywords (finesse, versatile, thrown, loading, etc.)
- Ammo weight scaling (bundled by 20)
- Coin weight convention (50 per lb)
- Armor type progression (light/medium/heavy with DEX mods)

**Companion:**
- CR-based proficiency bonus
- Companion type restrictions (beast CR ≤ 1/4 for Beast Master)
- Command action economy (bonus action vs action)
- Death saving throw rules for companion HP (specific to 5e)
- Familiar spirit type and pact-specific limitations
- Steel Defender / Eldritch Cannon as Artificer-specific
- Spell list for companion maintenance spells (Speak with Animals, Heal)

---

## 4. Likely Source-Book Edge Cases

### 4.1 Inventory Edge Cases

1. **"What weighs nothing?"** — Some items like tools, gems, and art objects have weight but no weight value in the SRD. E.g., 50 gp of gems ≈ 1 lb but individual gems vary. Need a policy.

2. **Mounts & Vehicles** have compound fields (Speed, Crew, Passengers, Cargo in tons, AC, HP, Damage Threshold) — these don't fit the standard item schema cleanly.

3. **Armor made of special materials** (Adamantine, Mithral) — handled via setters with `name-format: "Adamantine {{parent}}"` but may need special rendering.

4. **Consumables that are also magic items** (e.g., Potion of Healing) — both `type: "Potion"` and magic item properties; stackable with quantity.

5. **Weight of currency** — The PHB says 50 coins = 1 lb, but the PHB also says "Practically weightless for an adventurer to carry their wealth." This is a rules tension — SRD data shows `"weight": "0 lb."` for some expensive items (Airship). Need a policy decision.

6. **UO (Ultimate Options?) content** — UO books may contain variant rules not in core SRD; need to check if the UO folder contains conflicting encumbrance or companion rules.

### 4.2 Companion Edge Cases

1. **Ranger Companion CR revision** — PHB 2014: CR ≤ 1/4. PHB 2024 (5.5e?): May differ. Check which edition the app targets.

2. **Find Familiar vs Pact of the Chain** — Both create a familiar, but Pact of the Chain allows improved familiars (Quasit, Pseudodragon) with additional actions (like Sting). These are distinct stat blocks, not just name changes.

3. **Multiattack** — Some larger companions (Brown Bear, Dire Wolf) have Multiattack. How is this represented? Action name "Multiattack" with a description vs individual attack actions. The `srd-companions.ts` data has `actions[]` array.

4. **Condition immunities on companions** — e.g., Undead-type companions may be immune to certain conditions. Need to track.

5. **Companion death** — When a companion drops to 0 HP, it doesn't die immediately — it makes death saving throws. The Death Saves mechanic is 5e-specific. If the system is meant to be multi-game-system, this is a 5e-specific concern.

6. **Beast Master action economy** — At higher levels (level 5+), the beast can attack on its own turn after the ranger takes an action. This is a 5e-specific rule nuance.

7. **Flying/swimming companions** — No 5e restriction in base rules, but some tables house-rule this. The app should not add restrictions not in the SRD.

8. **Artificer companions** — Steel Defender and Eldritch Cannon are TCoE (2019), not in SRD. The current `srd-companions.ts` may not include them. Check if UO folder adds them.

---

## 5. Summary of Required Data/Gap Analysis

| Item Type | Data Fields Present in SRD | Gaps for 5e Compliance |
|---|---|---|
| Mundane Gear | name, category, weight, cost, stackable | None significant |
| Weapons | name, type, properties (finesse, thrown, etc.) | None — setters handle properties |
| Armor | name, AC, type, strength req | None |
| Magic Items | name, rarity, attunement, slot | Need slot validation logic |
| Vehicles | name, speed, crew, passengers, cargo, AC, HP, damage threshold | Schema doesn't naturally fit standard item format |
| Companions | name, type, size, stats, HP, AC, speed, abilities, actions | No CR field; proficiency bonus derived client-side |
| Familiar | name, type, stats | Implied but no stat blocks for Quasit/Pseudodragon in SRD |

---

## 6. Recommendations for the Delegation Plan

1. **Inventory page needs an encumbrance-mode flag** — store in character state: `encumbranceVariant: "none" | "5e-variant"`. If "5e-variant" is set, compute and display carry thresholds from STR score × [5, 10, 15] lbs.

2. **Attunement counter** — Add a computed field `attunedCount` = count of items where `attunement === "true"`. Warn at ≥ 3.

3. **Companion page needs CR** — Add CR field to companion data model (currently missing from `srd-companions.ts`). Proficiency bonus derivation depends on CR.

4. **Companion type filtering** — For Beast Master, filter available companions by `type === "Beast" && cr <= 0.25`. Implement this filter in the companion selection UI.

5. **UO content audit** — Scan the `/Users/max/dev/Arcanum/DnD-Books/5e/Books/UO` folder for additional companion types or variant encumbrance rules before finalizing the rules engine.

6. **Vehicle items** — Consider a separate "vehicle" item type with compound fields rather than forcing them into the standard item schema.

---

*End of DND Rules Specialist Report — investigation only, no code edits made.*