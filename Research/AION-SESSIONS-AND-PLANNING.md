# AION Sessions and Planning — Research

**Date:** 2026-05-19
**Agent:** General (mvs_235fe6e3951b4ff184388c7e9dff899e)
**Parent:** mvs_cecd7f35adac4320bebdfbf19eef199a

---

## 1. Session Research — AION RS Sessions

### Session Index

The `/Users/max/dev/.aionrs/sessions/` directory contains 22 sessions from 2026-05-06 to 2026-05-12. Most used MiniMax-M2.7, some MiniMax-M2.5.

### Team Members Identified

| Agent | Sessions | Message Count | Role |
|-------|----------|--------------|------|
| `builder-fixer` | 06d27a75, c0c9a700, 61af6144, fbb875df | 2043 / 301 / 330 / 108 | Primary code implementer |
| `ui-ux-specialist` | d5abc1eb, 7ae31660 | 72 | UI work |
| `dnd-expert` | 678afdef, e8e89c89, 96642736, c04594da, 5a72783a | 71 / 104 / 6 / 2 / 6 | DnD rules expert |
| `investigator` | 72dc0730, c0f46edd | 18 / 8 | Research |
| `secretary` | c9c5181a | 197 | Documentation/coordination |
| `step5-finisher` | 6ef35866 | 6 | Task finishing |
| `r4-feature-implementer` | 8fe637cb, 34f1fb43, 36ad4c2b, f8a70664 | 785 / 48 / 589 / 23 | Feature implementation (R4) |
| **Team Leader** | 063cac6b | ~1200 | Orchestrated Cowork2/Cowork minimax teams |

### Team Names

Sessions reference **"Cowork2"** and **"Cowork minimax"** teams. The Team Leader (`063cac6b`) coordinated these AI agent teams from 2026-05-06 to 2026-05-12.

### What the Teams Were Working On

Based on session metadata and file modifications:
- PDF export/character sheet generation (M6 related)
- Digital character sheet implementation (M5 related)
- R4 feature implementation (combat/spellcasting hub redesign)
- Aurora elements integration (XML parsing, content sources)
- TypeScript implementation across inventory, PDF rendering, content sources, builtins
- Proficiency resolver, spell list fix, defenses card fix (feature log items)

### Key Sessions

- `063cac6b` — Team Leader (2026-05-06 to 2026-05-12): Orchestrated Cowork2/Cowork minimax team work
- `06d27a75` — builder-fixer (2043 messages): Heavy implementation session
- `8fe637cb` — r4-feature-implementer (785 messages, 2026-05-11): Feature implementation
- `e8e89c89` — dnd-expert (104 messages, 2026-05-11 to 2026-05-12): Rules expertise
- `c9c5181a` — secretary (197 messages, 2026-05-11): Documentation

---

## 2. M5 Plan Status

**File:** `/Users/max/dev/Arcanum/Planning/M5_DIGITAL_SHEET_PLAN.md`
**Status:** FOUND — location is `/Users/max/dev/aion/Arcanum/Planning/M5_DIGITAL_SHEET_PLAN.md`

The file at `/Users/max/dev/aion/Arcanum/Planning/` (different from `/Users/max/dev/aion-vault/Arcanum/Planning/`).

**M5 Goal:** Build the real web review page as a digital character sheet — table-usable, not print-first, derived from resolved builder state.

**M5 does NOT include:** Final PDF layout/export, print-first compromises, mobile overhaul, 5.2 ruleset mode.

**M5 Sheet Geometry:** Page 1 has two major zones — numeric/combat/rules summary + generated feature-card space.

---

## 3. M6 Plan Status

**File:** `/Users/max/dev/Arcanum/Planning/M6_PDF_EXPORT_PLAN.md`
**Status:** FOUND — location is `/Users/max/dev/aion/Arcanum/Planning/M6_PDF_EXPORT_PLAN.md`

**M6 Goal:** Turn the resolved M5 sheet model into a clean exported PDF without re-interpreting character rules a second time. M6 is an export composition problem, not a rules problem.

**M6 Implementation Sequence:**
1. M6.1 — Export Model: formalize PDF-ready character object from M5 resolved sheet
2. M6.2 — Page Map: define page roles (summary/table/detail/appendix), spill rules
3. M6.3 — Front Page Composition: build page-1 from SVG pieces, feature-card deck
4. M6.4 — Page Routing: conditional page allocator for companion/inventory/spell pages
5. M6.5 — Appendix Renderer: verbose detail page renderer for spells/items/features
6. M6.6 — Regression Corpus: sample-export regression checks

**Card Rules (M6):** Page 1 cards need title, source label, short summary, optional level/usage/action hint, optional tags. Overflow rules: don't shrink text into illegibility — preserve priority order when spilling.

---

## 4. Aurora XML Structure Summary

### Core Element Tags

```xml
<element name="Fighter" type="Class" source="Player's Handbook" id="ID_WOTC_PHB_CLASS_FIGHTER">
  <description>
    <p>...</p>  <!-- full rules text -->
  </description>
  <sheet action="Bonus Action" usage="1/Short Rest" display="false" />
    <description level="5">...</description>  <!-- level-gated sheet text -->
  </sheet>
  <setters>
    <set name="short">Concise gameplay text</set>
    <set name="hd">d10</set>
  </setters>
  <rules>
    <grant type="Proficiency" id="..." level="1"/>
    <select type="Proficiency" name="..." supports="..." number="2" level="1"/>
    <stat name="strength" value="1"/>
  </rules>
</element>
```

### Action/Economy Encoding

- `<sheet action="Bonus Action" usage="1/Short Rest">` — action type + resource usage
- `<sheet action="Reaction">` — for Parry, Riposte, etc.
- `<sheet usage="{{indomitable:usage}}/Long Rest">` — variable usage
- `<description level="5">` — text shown at level 5+

Usage string format: "1/Short Rest", "2/Short Rest", "{{indomitable:usage}}/Long Rest", "recharge (6)", "at will"

### Key Observations

1. **`<sheet>` is gameplay-focused:** Concise text designed for character sheet surface
2. **`<description>` is full rules:** HTML text for compendium and detail pages
3. **`<setters><set name="short">`:** Another short-text source (used for race traits without `<sheet>`)
4. **Level-gated:** `<description level="N">` and `<grant level="N">` for level-dependent content
5. **`display="false"`:** Effect granted but not shown on sheet (e.g., stat bonuses, languages)

### Element Types

- `Class` — with `<multiclass>` block
- `Class Feature` — level-gated, selectable via `<select>`
- `Race` / `Racial Trait` — ability score increases, speed, languages
- `Race Variant` — optional choices
- `Weapon` — with properties, damage, range
- `Feat` — prerequisites

---

## 5. Aurora Index Overview

### core.index → core/players-handbook.index

**Races (9):** dragonborn, dwarf, elf, gnome, halfelf, halfling, halforc, human, tiefling

**Classes (12):** barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard

**Backgrounds (13):** acolyte, charlatan, criminal, entertainer, folkhero, guildartisan, hermit, noble, outlander, sage, sailer, soldier, urchin

**Items:** armor, weapons, gear, packs, instrument, tools, mounts

**Path pattern:**
- Class features: `core/players-handbook/classes/class-<name>.xml`
- Racial traits: `core/players-handbook/races/race-<name>.xml`
- Feats: `core/players-handbook/feats.xml`
- Weapons: `core/players-handbook/items/items-weapons.xml`

### GitHub Raw URLs (from task)

```
https://raw.githubusercontent.com/aurorabuilder/elements/master/core.index
https://raw.githubusercontent.com/aurorabuilder/elements/master/supplements.index
https://raw.githubusercontent.com/aurorabuilder/elements/master/unearthed-arcana.index
https://raw.githubusercontent.com/aurorabuilder/elements/master/third-party.index
https://raw.githubusercontent.com/community-elements/elements-reddit/master/reddit.index
https://github.com/aurorabuilder
```

---

## 6. DnD Expert Context Summary

The `dnd-expert` agent was active in AION sessions (e8e89c89 with 104 messages). The agent's system prompt is at `/Users/max/.mavis/agents/dnd-expert/system.md`. Session data confirms it has deep knowledge of DnD 5e rules including:
- Class saving throw proficiencies (STR/CON for Fighter, WIS/CHA for Cleric, etc.)
- Proficiency bonus scaling by level
- Spell slot tables (Full Caster, Half Caster, Warlock Pact)
- Action economy (action, bonus action, reaction, legendary)
- Weapon properties and damage types

---

## 7. Open Questions

1. **Planning documents location:** The expected path `/Users/max/dev/aion-vault/Arcanum/Planning/` doesn't exist. Actual location is `/Users/max/dev/aion/Arcanum/Planning/`. Need to reconcile.

2. **M5 scope:** The digital sheet (web review page) was the primary output. What specific features were completed? The review sheet tab system, action cards, spell groups, etc. need to be verified.

3. **Aurora version:** The local aurora-elements copy may be outdated vs. GitHub master. The index files point to specific URLs for each XML file.

4. **Session archive extraction:** AION sessions contain rich implementation context (up to 2043 messages in builder-fixer session). Key decisions and code changes could be extracted from session history.

5. **`<sheet>` population:** Human.xml shows `<sheet display="false"/>` with no gameplay text — just stat grants. Other races may have the same pattern. Need to check dwarf.xml, elf.xml, etc. for `<sheet>` tags with actual text content.

6. **Cowork2 vs Cowork minimax distinction:** What was the difference between these two teams? Likely different model tiers or different task types, but not documented.