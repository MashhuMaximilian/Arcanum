# PDF Page 1 — Consolidated Implementation Plan

**Date:** 2026-05-19
**Sources:** DND-EXPERT-GUIDANCE.md + PDF-PAGE1-RESEARCH.md + AION-SESSIONS-AND-PLANNING.md

---

## Status

All three research documents are complete:
- `/Users/max/dev/Arcanum/Research/PDF-PAGE1-RESEARCH.md` — PDF renderer, weapons, action economy, font sizes, layout
- `/Users/max/dev/Arcanum/Research/AION-SESSIONS-AND-PLANNING.md` — session history, M5/M6 plans, Aurora XML structure
- `/Users/max/dev/aion-vault/Arcanum/Research/DND-EXPERT-GUIDANCE.md` — DnD rules expert recommendations

---

## Decisions

### 1. Font Size Floor — RAISE from 3.0pt to 4.0pt

**Why:** 3.0pt is emergency-only, not usable at the table. Below 4.0pt legibility degrades on coated print stock.

**Where:** `web/lib/pdf/front-page-renderer.ts` — `MIN_FEATURE_CONFIG.bodyMinSize`

**Action:** Change `bodyMinSize` from `3.0` to `4.0`. This is the floor — if content doesn't fit at 4.0pt in two columns, it overflows to page 2.

### 2. Two-Column Threshold — TIGHTEN

**Why:** Current 96-char/75% threshold is too aggressive. DnD Expert recommends tighter.

**Where:** `web/lib/pdf/front-page-renderer.ts` — `getAdaptiveFeatureColumnCount()`

**Action:** Update conditions:
- `averageBodyLength <= 80` (was 96)
- `shortBodies <= 100 chars >= ceil(cardCount * 0.65)` (was 96 / 75%)
- Features tagged `widthHint: "wide"` always single column

### 3. Weapon TYPE/PROPERTIES — ABBREVIATE

**Why:** Full strings overflow at small font sizes. Standard D&D abbreviations exist.

**Where:** `web/lib/pdf/front-page-renderer.ts` — `renderWeaponAttackRows()` cells for TYPE and PROPERTIES columns

**Action:** Add lookup tables:
- TYPE: Piercing → "Pier.", Slashing → "Slash.", Bludgeoning → "Bludg.", P/S for versatile
- PROPERTIES: Finesse → "Fin.", Versatile → "Vers.", Reach → "Reach", Thrown → "Thr.", Two-Handed → "2H", Heavy → "Hvy", Light → "Lt", Loading → "Load.", Ammunition → "Ammo"
- Show max 2-3 properties + "+N" overflow if more exist

### 4. Sheet Tag Extraction — USE `<sheet>` NOT `<description>`

**Why:** `<sheet>` is gameplay-focused, concise. `<description>` is full rules text for appendices.

**Where:** `web/lib/pdf/from-builder.ts` — `getSheetSummary()` and related functions

**Action:** Create `getElementSheetText(element)` that:
1. Reads `<sheet>` tag text (concise gameplay text)
2. Falls back to `<description>` first paragraph if `<sheet>` is empty
3. Falls back to `<setters><set name="short">` for race traits without `<sheet>`
4. Uses `FEATURE_ACTION_RULES` only as final fallback

### 5. Action Economy — EXTRACT FROM XML `<sheet>` ATTRIBUTES

**Why:** XML `<sheet action="Bonus Action" usage="1/Short Rest">` is cleaner than regex heuristics.

**Where:** `web/lib/pdf/from-builder.ts` — `parseFeatureActionHint()` and `parseFeatureUsageHint()`

**Action:** In `buildFeatureCards()` or wherever features are processed:
1. Read `element.sheet.attributes` for `action` and `usage` XML attributes
2. Use XML values when available
3. Fall back to existing regex parsing for elements without `<sheet>` attributes

### 6. Consistent Typography — UNIFY FONT SIZE CONSTANTS

**Why:** Feature cards, racial traits, and combat hub currently use different size ranges.

**Where:** `web/lib/pdf/front-page-renderer.ts` — `FEATURE_CARD_TYPOGRAPHY` constants

**Action:** Review all size constants across sections. Ensure racial traits and combat hub use the same `FEATURE_CARD_TYPOGRAPHY` as class feature cards.

---

## Implementation Order

### Sprint 1: Font + Layout (Quick Wins)
1. Raise font floor 3.0 → 4.0
2. Tighten two-column thresholds

### Sprint 2: Weapon Box (Combat Detail)
3. Add TYPE/PROPERTIES abbreviation tables
4. Add "+N" overflow for extra properties

### Sprint 3: Sheet Tag Extraction (Content Quality)
5. Create `getElementSheetText()` helper
6. Update `getSheetSummary()` to use `<sheet>` first
7. Handle race traits with `<setters><set name="short">` fallback

### Sprint 4: Action Economy (XML-First)
8. Read `<sheet action="..." usage="...">` from Aurora XML
9. Use XML values as primary, regex as fallback
10. Standardize abbreviations: Act/BA/Rea/Leg, 1/SR, 1/LR, Rech: X–Y

---

## Open Questions (Not Blockers)

1. **Race traits `<sheet>` population:** Need to check dwarf.xml, elf.xml for actual `<sheet>` text vs just `<sheet display="false"/>` stat grants. May need fallback strategy.

2. **`<sheet>` non-empty validation:** Builder should enforce non-empty `<sheet>` for front-page gameplay elements.

3. **Session data extraction:** AION sessions (up to 2043 messages) contain implementation history. Could extract key decisions.

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `web/lib/pdf/front-page-renderer.ts` | Font floor (3.0→4.0), 2-col thresholds, weapon abbreviation tables, consistent typography |
| `web/lib/pdf/from-builder.ts` | `getElementSheetText()` helper, `<sheet>` first fallback chain, XML action/usage extraction |
| `web/lib/pdf/resolve.ts` | Update card building to use new helpers |

---

## Verification

After each change:
1. `PATH="/Users/max/.nvm/versions/node/v20.11.1/bin:$PATH" npm run build` — must pass
2. Test with a high-level character (level 15+) to verify font shrink behavior
3. Test with a character having 5+ weapons to verify properties overflow
4. Test with a spellcaster (Cleric/Wizard) to verify action economy display