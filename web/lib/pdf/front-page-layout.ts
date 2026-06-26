import type { PdfRect } from "@/lib/pdf/drawing";

export const PAGE_SIZE = {
  width: 842,
  height: 595,
} as const;

export const FRONT_PAGE_REGIONS = {
  header: { x: 10, y: 0, width: 390, height: 69 },
  // Stat strip shrunk 50→38pt tall so the SVG-baked cards render
  // square (each card is 44.52 wide × 42 tall in the 570×51 viewBox,
  // so a W_pt/H_pt ratio of 10.54 keeps them square). At 38pt tall
  // × 400pt wide, each card renders ~31 × 31 — visually square.
  // Round-11's 50pt height stretched the cards into ~30 × 41 tall
  // rectangles; user: "the cards themselves are now longer/bigger
  // height which is wrong. They should be square".
  statStrip: { x: 10, y: 76, width: 400, height: 38 },
  // Cascade: stat strip shrank by 12pt, so all regions below it
  // shift up 12pt to maintain spacing with the header. Combat
  // spells now ends at 588-12=576pt, still inside the 595pt page.
  abilities: { x: 10, y: 123, width: 384, height: 152 },
  proficiencies: { x: 10, y: 281, width: 378, height: 47 },
  passives: { x: 10, y: 344, width: 378, height: 40 },
  attacks: { x: 10, y: 392, width: 378, height: 78 },
  combatSpells: { x: 10, y: 477, width: 378, height: 99 },
  // Spellcasting card shrunk 65→53pt tall to keep card height
  // proportional to statStrip (slightly bigger than statStrip so the
  // 22pt BONUS / SAVE DC / ABILITY numbers still fit, but not as
  // oversized as the round-11 65pt).
  spellcasting: { x: 420, y: 4, width: 280, height: 53 },
  rail: { x: 706, y: 4, width: 136, height: 53 },
  features: { x: 420, y: 76, width: 412, height: 497 },
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
