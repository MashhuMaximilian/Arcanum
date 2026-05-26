# PDF Page 1 — Research Findings

**Date:** 2026-05-19
**Agent:** General (mvs_50fcb048630d442a8dd2e436388b9f74)
**Parent:** mvs_cecd7f35adac4320bebdfbf19eef199a

---

## Executive Summary

Page 1 PDF export is structured around SVG components + data-driven text rendering. The combat hub (weapons + spells) and feature card deck are the two main data-driven zones. Key findings: (1) weapon data flows from `CharacterInventoryItem` → `inventory.ts resolveInventoryWeaponAttackRows()` → `from-builder.ts buildAttackRows()` → `front-page-renderer.ts renderWeaponAttackRows()`. (2) Aurora XML has both `<description>` (full rules) and `<sheet>` (gameplay-focused) tags — `<sheet>` should be used for page 1 cards. (3) Action economy is detected via `parseFeatureActionHint` and `parseFeatureUsageHint` with circle/number charge display. (4) Font sizes use `FEATURE_CARD_TYPOGRAPHY` constants with adaptive two-column switching via `getAdaptiveFeatureColumnCount`. (5) The XML structure uses `<sheet action="Bonus Action" usage="1/Short Rest">` and level-gated `<description level="N">` for class features.

---

## 1. Weapons in the Combat Box

### Data Flow

1. **Source:** `CharacterInventoryItem` from `lib/characters/types.ts`:
   - Fields: `id`, `name`, `quantity`, `category`, `family`, `itemType`, `source`, `sourceLabel`, `rarity`, `cost`, `weight`, `slot`, `equippable`, `equipped`, `attunable`, `attuned`, `attackBonus`, `baseItemId`, `baseItemName`, `baseDamage`, `damage`, `notes`, `detailHtml`

2. **Processing:** `lib/equipment/inventory.ts` — `resolveInventoryWeaponAttackRows()`:
   - Filters equipped weapons from inventory
   - Calls `getResolvedWeaponMetadata()` for each item
   - Determines attack ability (finesse→max(STR,DEX), ranged→DEX, melee→STR)
   - Calculates hit bonus: proficiency + ability modifier + magic bonus
   - Formats damage with modifier (e.g., "1d8+5")
   - Determines weapon type: "Melee Weapon" or "Ranged Weapon"
   - Formats properties via `formatWeaponProperties()` → "fin, vers (1d8), thrown 20/60"

3. **Assembly:** `lib/pdf/from-builder.ts` — `buildAttackRows()`:
   - Calls `resolveInventoryWeaponAttackRows()` for equipped weapons
   - Returns `{ name, hit, damage, type, properties }[]`

4. **Rendering:** `lib/pdf/front-page-renderer.ts` — `renderWeaponAttackRows()`:
   - 5 columns: NAME (29%), HIT (12%), DAMAGE (20%), TYPE (14%), PROPERTIES (25%)
   - Column headers drawn first, then 5 data rows
   - Each cell uses `drawWeaponCell()` with `_Weapon bg.svg` background
   - Text sizes: name 4.6→3.0, hit 5.3→3.3, damage 4.9→3.1, type 3.7→2.4, properties 3.6→2.4

### Weapon Properties Abbreviation (Dnd Expert Recommendation)

| Full | Abbrev |
|------|--------|
| Finesse | Fin. |
| Versatile (1d10) | Vers. (1d10) |
| Reach | Reach |
| Thrown | Thr. |
| Loading | Load. |
| Two-Handed | 2H |
| Heavy | Hvy |
| Light | Lt |
| Ammunition | Ammo |

### Type Abbreviation (Dnd Expert Recommendation)

| Full | Abbrev |
|------|--------|
| Piercing | Pier. |
| Slashing | Slash. |
| Bludgeoning | Bludg. |
| Piercing/Slashing | P/S |

---

## 2. Sheet vs Description for Feature Cards

### Aurora XML Structure

From `class-fighter.xml` (lines 86-88):
```xml
<sheet display="false">
  <description>A master of martial combat, skilled with a variety of weapons and armor.</description>
</sheet>
```

From `class-fighter.xml` Second Wind feature (lines 147-158):
```xml
<element name="Second Wind" type="Class Feature" ...>
  <description>
    <p>You have a limited well of stamina...</p>
    <p class="indent">Once you use this feature, you must finish a short or long rest...</p>
  </description>
  <sheet action="Bonus Action" usage="1/Short Rest" />
  ...
</element>
```

From `race-human.xml` (line 81):
```xml
<sheet display="false" />
```

Key observations:
- `<sheet>` tag contains CONCISE gameplay text (action type, usage, short description)
- `<description>` contains FULL rules text with level-gated variants
- Some elements have `<sheet display="false">` — effect granted but not shown on sheet
- `<sheet>` can have `action` and `usage` attributes encoding action economy
- Nested `<description level="N">` inside `<sheet>` for level-dependent text

### Current Implementation

`from-builder.ts` — `getSheetSummary()` uses:
1. `element.sheet.descriptions` array (level-gated)
2. `FEATURE_ACTION_RULES` hardcoded table (9 known features: Indomitable, Action Surge, etc.)
3. Fallback to `getPlaySurfaceSummary()` using FEATURE_ACTION_RULES match

`FEATURE_ACTION_RULES` hardcoded patterns:
- "Second Wind" → action: bonus action, usage: 1/short rest, summary: "1d10+level HP"
- "Action Surge" → action: none, usage: 1/long rest
- "Indomitable" → action: none, usage: 3/long rest (level-gated)
- etc.

### Decision

**Use `<sheet>` for all page 1 gameplay-facing cards.**
- `<sheet>` text is concise and designed for the character sheet surface
- `<description>` is for appendix/detail pages and full rules reference
- `FEATURE_ACTION_RULES` is a workaround — once `<sheet>` is reliably populated, replace with direct XML extraction

---

## 3. Action Economy, Recharge, and Charges

### Detection (from front-page-renderer.ts)

`parseFeatureActionHint(text)` recognizes:
- "action" → captured (default)
- "bonus action" → "Bonus"
- "reaction" → "Reaction"
- "legendary action" → "Legendary"
- "free object interaction" → "Free Object"
- "object interaction" → "Object"

`parseFeatureUsageHint(text)` recognizes:
- "N uses" → `{ type: "uses", count: N }`
- "N uses / short rest" → `{ type: "perRest", count: N, rest: "short" }`
- "N uses / long rest" → `{ type: "perRest", count: N, rest: "long" }`
- "at will" → `{ type: "atWill" }`
- "unlimited" → `{ type: "atWill" }`
- "recharge (N)" → `{ type: "recharge", value: N }`

### Charge Display

- **Circles** (`mode: "circles"`): N < 7 — rendered as outlined circles via `strokeCircle`, radius 1.45pt, gap 1.55pt
- **Number** (`mode: "number"`): N >= 7 — rendered as plain bold text
- Recharge hints ("SR", "LR", "At Will") displayed as text in meta row below action hint

### D&D Standard Abbreviations (DnD Expert Recommendation)

| Type | Display |
|------|---------|
| Standard Action | Act |
| Bonus Action | BA |
| Reaction | Rea |
| Legendary Action | Leg |
| Recharge (X-Y) | Rech: X–Y |
| Charges < 7 | ○ circles |
| Charges >= 7 | ×7 (bold number) |
| At Will | ∞ or "At Will" |
| Per Short Rest | 1/SR |
| Per Long Rest | 1/LR |

**For print reliability: use short uppercase text abbreviations, not unicode symbols.**

---

## 4. Font Sizes

### Current System

Two-stage adaptive font in `computeFitConfig` (front-page-renderer.ts):

| Stage | Body Font Max | Body Font Min | Line Gap | Trigger |
|-------|--------------|--------------|---------|---------|
| Default | 6.4pt | 3.6pt | 1.2pt | Content fits |
| Minimum | 4.2pt | 3.0pt | 0.8pt | Fit pass activated |

Fit pass: up to 20 iterations, reducing line gap first (step -0.2pt), then body font (step -0.5pt). Once `bodyMaxSize` reaches 4.2pt, renderer keeps 2 columns with minimum size.

### D&D Expert Recommendations

**Raise the hard floor from 3.0pt to 4.0pt.**
- 3.0pt is emergency-only, not usable at the table
- Below 4.0pt legibility degrades on coated print stock
- Content that doesn't fit at 4.0pt in two columns should overflow to page 2

**Level-based breakpoints:**

| Level | Feature Density | Recommended Body Size |
|-------|----------------|----------------------|
| 1–4 | Low | 6.4pt (default) |
| 5–10 | Moderate | 5.5–6.0pt |
| 11–16 | High | 5.0–5.5pt |
| 17–20 | Very high | 4.5–5.0pt with 2-col adaptive |

### Feature Card Typography Constants (current)

From `FEATURE_CARD_TYPOGRAPHY`:
- title: maxSize 5.6, minSize 3.6
- meta: maxSize 3.5, minSize 2.7
- body: maxSize 5.0, minSize 3.6
- source: maxSize 3.0, minSize 2.5

---

## 5. Two-Column Feature Cards

### Current Adaptive Logic

`getAdaptiveFeatureColumnCount()` switches to 2 columns when:
- width >= 180
- card count >= 4
- averageBodyLength <= 96 chars AND shortBodies (≤120 chars) >= ceil(cardCount * 0.75)

### D&D Expert Recommendations

**Tighten thresholds:**
```
averageBodyLength <= 80 chars  // lowered from 96
shortBodies (≤100 chars) >= ceil(cardCount * 0.65)  // lowered from 75%
```

Also: features tagged `widthHint: "wide"` should always get single column regardless of body length.

---

## 6. Open Questions / Blockers

1. **Aurora `<sheet>` population:** Not all elements have `<sheet>` populated. The `FEATURE_ACTION_RULES` workaround handles known features but a broader strategy needed for feats, racial traits, etc.

2. **Weapon TYPE column:** Currently shows damage type ("piercing"). Should be abbreviated (Pier./Slash./Bludg.) per DnD expert recommendation. Implementation needed in renderer.

3. **Weapon PROPERTIES column:** Currently shows full text. Should use abbreviation table. Max 2-3 properties with +N overflow.

4. **Font floor:** Raise from 3.0pt to 4.0pt — current code has 3.0pt as MIN_FEATURE_CONFIG floor.

5. **Two-column threshold:** Tighten from 96/75% to 80/65% per DnD expert.

6. **`<sheet>` vs `<description>` for racial traits:** Human.xml shows `<sheet display="false"/>` — no gameplay text. Need to check other races. May need fallback to `<setters><set name="short">` for race traits.

7. **Action economy detection:** Currently regex-based with hardcoded patterns. XML `<sheet action="..." usage="...">` would be cleaner but not all elements use it.

---

## 7. Recommendations

1. **Weapon TYPE/PROPERTIES:** Add abbreviation lookup tables in `renderWeaponAttackRows()`. Use 2-3 letter codes. Show max 2 properties + "+N" overflow.

2. **Font floor:** Change `MIN_FEATURE_CONFIG.bodyMinSize` from 3.0 to 4.0 in front-page-renderer.ts.

3. **Two-column threshold:** Update `getAdaptiveFeatureColumnCount` to use avg <= 80, short >= 65%.

4. **`<sheet>` extraction:** Add `getElementSheetText()` function in from-builder.ts that reads `<sheet>` tag with fallback to `<description>` first paragraph.

5. **Action economy:** Extract action/usage from `<sheet action="..." usage="...">` XML attributes where present, use existing regex as fallback.

6. **Consistent typography:** Ensure feature cards, racial traits, and combat hub use same `FEATURE_CARD_TYPOGRAPHY` constants — currently different sections may use different size ranges.