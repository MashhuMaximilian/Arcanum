import type { PdfRect } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

export const PAGE2_PRINT_SAFE_SCALE = 0.94;
export const PAGE2_PRINT_SAFE_OFFSET = {
  x: (PAGE_SIZE.width * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
  y: (PAGE_SIZE.height * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
} as const;

// Page 2 regions for inventory (page 2A) — v7 layout:
//   y=0..18     INVENTORY header (full width)
//   y=18..363   TOP AREA (345pt) — 2 columns: Equipped | Item Descriptions
//   y=480..795  BOTTOM 3 COLUMNS (315pt) — stored, additional treasure, quest items
//                  (3 equal-width columns, same style)
export const PAGE2_INVENTORY_REGIONS = {
  outer: { x: 10, y: 10, width: 822, height: 575 },
  inventoryHeader: { x: 10, y: 0, width: 822, height: 18 },
  inventoryIndex: { x: 10, y: 18, width: 250, height: 345 },
  itemDescriptions: { x: 265, y: 18, width: 567, height: 345 },
  attuned: { x: 10, y: 321, width: 70, height: 42 },
  currency: { x: 85, y: 321, width: 250, height: 42 },
  encumbrance: { x: 340, y: 321, width: 120, height: 42 },
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
