import type { PdfRect } from "@/lib/pdf/drawing";

export const PAGE_SIZE = {
  width: 842,
  height: 595,
} as const;

export const FRONT_PAGE_REGIONS = {
  header: { x: 10, y: 0, width: 390, height: 69 },
  statStrip: { x: 10, y: 76, width: 390, height: 35 },
  abilities: { x: 10, y: 120, width: 384, height: 152 },
  proficiencies: { x: 10, y: 278, width: 378, height: 47 },
  passives: { x: 10, y: 341, width: 378, height: 40 },
  attacks: { x: 10, y: 389, width: 378, height: 78 },
  combatSpells: { x: 10, y: 474, width: 378, height: 99 },
  spellcasting: { x: 410, y: 4, width: 280, height: 52 },
  rail: { x: 696, y: 4, width: 136, height: 52 },
  features: { x: 410, y: 75, width: 422, height: 498 },
} satisfies Record<string, PdfRect>;

export function rectFromFractions(region: PdfRect, fractions: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    x: region.x + region.width * fractions.x,
    y: region.y + region.height * fractions.y,
    width: region.width * fractions.width,
    height: region.height * fractions.height,
  };
}
