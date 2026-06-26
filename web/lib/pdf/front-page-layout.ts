import type { PdfRect } from "@/lib/pdf/drawing";

export const PAGE_SIZE = {
  width: 842,
  height: 595,
} as const;

export const FRONT_PAGE_REGIONS = {
  header: { x: 10, y: 0, width: 390, height: 69 },
  // Stat strip grown 35→50pt tall so the 28pt value can actually fit in
  // the value rect (was clamped to ~14pt by the 0.50-height-ratio slot in
  // a 28.81pt-tall page box). Also scales the SVG-baked PROFICIENCY
  // BONUS / INITIATIVE / HIT DICE labels from 0.686x to 0.98x, making
  // them visible at a glance.
  statStrip: { x: 10, y: 76, width: 390, height: 50 },
  // Cascade +15pt: stat strip grew by 15pt, so all regions below it
  // shift down 15pt to maintain spacing. Combat spells still ends at
  // 588pt, well within the 595pt page height.
  abilities: { x: 10, y: 135, width: 384, height: 152 },
  proficiencies: { x: 10, y: 293, width: 378, height: 47 },
  passives: { x: 10, y: 356, width: 378, height: 40 },
  attacks: { x: 10, y: 404, width: 378, height: 78 },
  combatSpells: { x: 10, y: 489, width: 378, height: 99 },
  // Spellcasting card grown 52→65pt tall so the 22pt BONUS / SAVE DC /
  // ABILITY numbers can actually fit in the value rect. Also makes the
  // SVG-baked SPELLCASTING label and the inner bonus-box labels scale
  // up from 0.685x to 0.856x.
  spellcasting: { x: 410, y: 4, width: 280, height: 65 },
  rail: { x: 696, y: 4, width: 136, height: 65 },
  features: { x: 410, y: 88, width: 422, height: 485 },
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
