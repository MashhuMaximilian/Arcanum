import type { PdfRect } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

export const PAGE2_PRINT_SAFE_SCALE = 0.94;
export const PAGE2_PRINT_SAFE_OFFSET = {
  x: (PAGE_SIZE.width * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
  y: (PAGE_SIZE.height * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
} as const;

// Page 2 regions for inventory (page 2A) — v8 layout:
//   y=0..18     INVENTORY header (full width)
//   y=18..363   TOP AREA (345pt) — 2 columns: Equipped | Item Descriptions
//                  inventoryIndex narrowed 250 → 200 to free 50pt for
//                  item descriptions (round-25 #G user feedback)
//   y=480..795  BOTTOM 3 COLUMNS (315pt) — stored, additional treasure, quest items
//                  (3 equal-width columns, same style)
export const PAGE2_INVENTORY_REGIONS = {
  outer: { x: 10, y: 10, width: 822, height: 575 },
  inventoryHeader: { x: 10, y: 0, width: 822, height: 18 },
  inventoryIndex: { x: 10, y: 18, width: 200, height: 345 },
  itemDescriptions: { x: 215, y: 18, width: 617, height: 345 },
  // Round-25 #G: footer split into TWO rows. Row 1 holds encumbrance
  // (3 boxes) + attuned (1 box). Row 2 holds the 5 currency boxes.
  // Each row is 20pt tall with a 2pt gap between them, fitting in
  // the same 42pt footer space as before. Encumbrance boxes span
  // x=10..78 (3 × 22pt boxes with 1pt gaps). Attuned sits at x=85
  // (just past the last encumbrance box). Currency row spans x=10..210
  // (full width of the narrowed equipped card).
  encumbrance: { x: 10, y: 321, width: 70, height: 20 },
  attuned: { x: 85, y: 321, width: 60, height: 20 },
  currency: { x: 10, y: 343, width: 200, height: 20 },
  // valuables no longer used in the footer (round-25 #G redesign);
  //   kept as a region for backwards compatibility.
  valuables: { x: 465, y: 321, width: 367, height: 42 },
  storedItems: { x: 10, y: 363, width: 269, height: 198 },
  additionalTreasure: { x: 286, y: 363, width: 269, height: 198 },
  questItems: { x: 562, y: 363, width: 270, height: 198 },
} satisfies Record<string, PdfRect>;

// Page 2 regions for companion (page 2B)
export const PAGE2_COMPANION_REGIONS = {
  // Header: companion name + type + CR
  header: { x: 10, y: 10, width: 822, height: 22 },

  // Left column: Portrait (25%) + Ability Scores (below portrait)
  portrait: { x: 10, y: 40, width: 120, height: 120 },
  abilityScores: { x: 10, y: 168, width: 120, height: 140 },

  // Center-left: STATS ROW ( Proficiency + Initiative + Hit Dice ), stacked vertically above HP
  statsRow: { x: 138, y: 40, width: 84, height: 108 },

  // Center-left below stats: HP strip (standalone, below statsRow)
  hpStrip: { x: 138, y: 152, width: 84, height: 56 },

  // Center: AC (spans statsRow vertical space + hpStrip space combined)
  acStrip: { x: 230, y: 40, width: 84, height: 168 },

  // Bottom center+right: Speeds row (full width, below AC and HP)
  speedsRow: { x: 138, y: 216, width: 250, height: 40 },

  // Saves/Prof/Skills and Languages below speeds
  savesAndSkills: { x: 138, y: 264, width: 250, height: 100 },
  sensesAndLangs: { x: 138, y: 372, width: 250, height: 60 },

  // Right: Traits & Actions (full scrollable block)
  traitsAndActions: { x: 396, y: 40, width: 189, height: 600 },
} satisfies Record<string, PdfRect>;

export function rectFromFractions(
  region: PdfRect,
  fractions: { x: number; y: number; width: number; height: number }
) {
  return {
    x: region.x + region.width * fractions.x,
    y: region.y + region.height * fractions.y,
    width: region.width * fractions.width,
    height: region.height * fractions.height,
  };
}
