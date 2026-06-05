import type { PdfRect } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

export const PAGE2_PRINT_SAFE_SCALE = 0.94;
export const PAGE2_PRINT_SAFE_OFFSET = {
  x: (PAGE_SIZE.width * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
  y: (PAGE_SIZE.height * (1 - PAGE2_PRINT_SAFE_SCALE)) / 2,
} as const;

// Page 2 regions for inventory (page 2A)
export const PAGE2_INVENTORY_REGIONS = {
  outer: { x: 10, y: 10, width: 575, height: 822 },
  inventoryHeader: { x: 10, y: 10, width: 575, height: 18 },
  inventoryIndex: { x: 10, y: 28, width: 190, height: 280 },
  itemDescriptions: { x: 210, y: 28, width: 365, height: 280 },
  attunedAndValuables: { x: 10, y: 316, width: 230, height: 58 },
  currency: { x: 250, y: 316, width: 325, height: 58 },
  encumbrance: { x: 10, y: 382, width: 575, height: 42 },
  additionalTreasure: { x: 10, y: 432, width: 575, height: 80 },
  storedItemsLeft: { x: 10, y: 518, width: 285, height: 120 },
  storedItemsRight: { x: 300, y: 518, width: 285, height: 120 },
  questItems: { x: 10, y: 646, width: 575, height: 156 },
} satisfies Record<string, PdfRect>;

// Page 2 regions for companion (page 2B)
export const PAGE2_COMPANION_REGIONS = {
  // Header: companion name + type + CR
  header: { x: 10, y: 10, width: 575, height: 22 },

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