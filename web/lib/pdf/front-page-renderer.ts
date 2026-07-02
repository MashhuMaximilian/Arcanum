import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, PdfRightColumnCompactTrait, PdfRightColumnNoteLine, ResolvedPdfCharacter } from "@/lib/pdf/types";
import {
  componentPoint,
  componentRadius,
  componentRect,
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
  drawWrappedClassName,
  fillCircle,
  fitTextSize,
  insetRect,
  maskRect,
  strokeCircle,
  strokeRule,
  type PdfRect,
  type PdfRenderContext,
  splitColumns,
  splitRows,
} from "@/lib/pdf/drawing";
import { FRONT_PAGE_REGIONS, PAGE_SIZE, rectFromFractions } from "@/lib/pdf/front-page-layout";

// --- Constants extracted from inline magic numbers ---

const COLORS = {
  textPrimary: "#000000",      // main text
  textSecondary: "#333333",    // defenses label side
  textTertiary: "#555555",     // skill level label
  textDark: "#222222",         // spell names
  pipe: "#aaaaaa",             // vertical divider lines
  underline: "#999999",        // header underline
  stroke: "#231f20",           // circle markers
} as const;

const FONT_SIZES = {
  statBoxNormal: 13.5,
  statBoxSmall: 11,
  statBoxShield: 12,
  statBoxMin: 7,
  headerName: { max: 18, min: 10 },
  defenses: { maxMulti: 2.8, maxSingle: 3.3, min: 2.0 },
  spellLevel: { max: 3.8, min: 2.8 },
  spellName: { max: 3.5, min: 2.4 },
  labelRect: { max: 5.0, min: 3.0 },
} as const;

const LAYOUT = {
  defenses: {
    leftPad: 5,
    rightPad: 5,
    contentFrac: { x: 0.06, y: 0.12, width: 0.88, height: 0.76 },
    rowGap: 0.3,
    midpointFrac: 0.5,
  },
  spellZones: {
    contentPadding: 3,
    zoneMarkerW: 30,
    zoneLabelW: 20,
    markerSize: 4.4,
    markerGap: 1.8,
    rowGap: 1.4,
  },
  spellColumns: {
    gap: 12,
    leftLevels: [0, 1, 2, 3, 4],
    rightLevels: [5, 6, 7, 8, 9],
  },
  pipeLineWidth: 0.4,
} as const;

const SPELL_LEFT_CELL_W = 20;
const SPELL_TEXT_GAP = 2.6;
const SPELL_LEVEL_CIRCLE_GAP = 1.1;
const SPELL_CIRCLE_GAP = 1.8;
const SPELL_TEXT_LINE_GAP = 1.0;
const SPELL_SUMMARY_MAX_CHARS = {
  cantrip: { single: 40, pair: 24, many: 14 },
  leveled: { single: 48, pair: 30, many: 18 },
} as const;

const DAMAGE_TYPE_ABBREV: Record<string, string> = {
  piercing: "piercing",
  slashing: "slashing",
  bludgeoning: "bludgeoning",
};

const FEATURE_CARD_TYPOGRAPHY = {
  // Revert title 11 → 8.5 (user rejected the round-8 bump as too
  // disruptive — class feature titles should read as inline headers,
  // not as competing display anchors inside a busy column).
  title: { max: 8.5, min: 5.5 },
  // Round-26 #9: user feedback 'font-size in first page for features
  // descriptions should be smaller by like 2 points, idk how big it is
  // tbh....but it should be smaller. Readable but smaller'. Measured
  // current rendered size via pdftotext -bbox on round-26-5b: 'Beginning'
  // word height = 6.08pt (= bodyMaxSize 6.4 × 0.85 ≈ 5.44pt Magra
  // ascender-to-descender ≈ 6pt at print). User asked for ~2pt smaller.
  // Reduced body max 6.4 → 4.5pt (fitter's default 4.5 × 0.85 ≈ 3.83pt)
  // and min 3.6 → 2.5pt to preserve shrink-to-fit flexibility for
  // overflowing long descriptions. Paired with the bodyMaxSize ceiling
  // drop 8.0 → 5.5 below so the breathing-room scaler doesn't bump
  // back up.
  body: { max: 4.5, min: 2.5 },
  // Bumped meta 5.5 → 6.4 so "Action" / "Long Rest" / "1/day" labels
  // match the smallest-font-is-feature-body floor.
  meta: { max: 6.4, min: 4.0 },
  // Bumped charges 5.0 → 6.4 for same reason (the "3 / LR" charge
  // counter).
  charges: { max: 6.4, min: 4.0 },
  titleRowHeight: 8.0,
  metaRowHeight: 5.4,
  // Round-28 #4: tighter breathing room inside feature cards.
  // User feedback: 'less padding on top and bottom, a bit less
  // space between features'. Reduced bodyTopPad 2.5 → 1.0
  // (the space between the title/meta row and the first body
  // line). Reduced separatorGap 7 → 4 (the gap between
  // consecutive feature cards in the deck). These two cuts
  // reclaim ~5pt per card, letting us fit more cards in the
  // same vertical space without shrinking body text.
  bodyTopPad: 1.0,
  separatorGap: 4,
  circleRadius: 1.45,
  circleGap: 1.55,
  metaWidth: { max: 72, min: 44 },
} as const;

// Racial / Subclass / Subracial / Feat cards render in the right
// column rail as standalone panels — they need a more impactful title
// than the inline-style class feature cards. Bump title to 13pt with
// a 13pt row height so the title reads as the visual anchor of the
// card instead of getting buried in body text.
const RACIAL_CARD_TYPOGRAPHY = {
  title: { max: 13, min: 7 },
  body: { max: 6.6, min: 4 },
  meta: { max: 5.5, min: 3 },
  titleRowHeight: 13,
  metaRowHeight: 5.4,
  // Round-28 #4: tighter top padding for racial/subclass/subracial/
  // feat cards (which use this typography). Reduced 3 → 1.5 to
  // match the ergonomic tightening on FEATURE_CARD_TYPOGRAPHY.
  bodyTopPad: 1.5,
} as const;

type StatBoxSpec = {
  key: string;
  fallback?: string;
  mode?: "normal" | "wide" | "small" | "shield";
  box: PdfRect;
};

type FeatureSummary = {
  title: string;
  category: string;
  body: string;
  // Card kind drives typography selection: racial/subclass/subracial/
  // feat cards use RACIAL_CARD_TYPOGRAPHY (bigger 13pt title), class
  // features use FEATURE_CARD_TYPOGRAPHY (smaller 8.5pt title).
  kind: "class" | "subclass" | "racial" | "subracial" | "feat" | "trait" | "other";
  actionHint?: string;
  rechargeHint?: string;
  usageHint?: string;
  chargeDisplay?: {
    count?: number;
    mode: "circles" | "number";
    label: string;
  };
  tags: string[];
};

// Pick typography config based on card kind. Racial/subclass/subracial/
// feat cards get the bigger title because they render as standalone
// panels in the right rail; class features get the inline title
// because they live inside the FEATURES & TRAITS column.
function cardTypography(kind: FeatureSummary["kind"]) {
  if (kind === "racial" || kind === "subclass" || kind === "subracial" || kind === "feat") {
    return RACIAL_CARD_TYPOGRAPHY;
  }
  return FEATURE_CARD_TYPOGRAPHY;
}

type DashedLineDocument = PdfRenderContext["doc"] & {
  dash: (length: number, options?: { space?: number }) => DashedLineDocument;
  undash: () => DashedLineDocument;
  lineCap: (cap: "butt" | "round" | "square") => DashedLineDocument;
  lineJoin: (join: "miter" | "round" | "bevel") => DashedLineDocument;
};

type TransformDocument = PdfRenderContext["doc"] & {
  save: () => TransformDocument;
  restore: () => TransformDocument;
  translate: (x: number, y: number) => TransformDocument;
  scale: (factor: number) => TransformDocument;
};

const TOP_STATS: StatBoxSpec[] = [
  { key: "proficiency bonus", box: { x: 12, y: 4.43, width: 44.52, height: 42 } },
  { key: "initiative", box: { x: 62.52, y: 4.43, width: 44.52, height: 42 } },
  { key: "attacks / action", box: { x: 113.05, y: 4.43, width: 44.52, height: 42 } },
  { key: "inspiration", fallback: "", box: { x: 163.57, y: 4.43, width: 44.52, height: 42 } },
  { key: "exhaustion", fallback: "", box: { x: 214.09, y: 4.43, width: 44.52, height: 42 } },
  { key: "hp", mode: "wide", box: { x: 264.61, y: 4.43, width: 36, height: 42 } },
  { key: "current hp", fallback: "", mode: "wide", box: { x: 301.61, y: 4.43, width: 62, height: 42 } },
  { key: "temp hp", fallback: "", mode: "small", box: { x: 363.61, y: 4.43, width: 35, height: 42 } },
  { key: "hit dice", mode: "wide", box: { x: 408.61, y: 4.43, width: 54.71, height: 42 } },
  { key: "ac", mode: "shield", box: { x: 469.32, y: 3.43, width: 38.38, height: 44 } },
  { key: "defenses", fallback: "", box: { x: 513.71, y: 4.43, width: 44.52, height: 42 } },
];

const STAT_BLOCKS = [
  { label: "STR", x: 3, y: 0 },
  { label: "DEX", x: 63, y: 0 },
  { label: "CON", x: 123, y: 0 },
  { label: "INT", x: 3, y: 80 },
  { label: "WIS", x: 63, y: 80 },
  { label: "CHA", x: 123, y: 80 },
] as const;

const ABILITY_PANEL_VIEWBOX = { width: 384, height: 152 } as const;
const PASSIVES_VIEWBOX = { width: 378, height: 40 } as const;
const SKILL_BLOCK_VIEWBOX = { width: 78, height: 63 } as const;
const STAT_BLOCK_VIEWBOX = { width: 55, height: 72 } as const;
const TOP_STAT_VIEWBOX = { width: 570, height: 51 } as const;
const HEADER_SHELL_VIEWBOX = { width: 575, height: 69 } as const;

const SKILL_BLOCKS = [
  { x: 190, y: 8, width: 88, height: 70, ability: "STR + DEX", skills: ["Athletics", "Acrobatics", "Sleight of Hand", "Stealth"] },
  { x: 284, y: 8, width: 88, height: 70, ability: "INT", skills: ["Arcana", "History", "Investigation", "Nature", "Religion"] },
  { x: 190, y: 82, width: 88, height: 70, ability: "WIS", skills: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"] },
  { x: 284, y: 82, width: 88, height: 70, ability: "CHA", skills: ["Deception", "Intimidation", "Performance", "Persuasion"] },
] as const;

const STAT_ROW_BACKGROUNDS = [
  { x: -1, y: 9, width: 184, height: 54 },
  { x: -1, y: 89, width: 184, height: 54 },
] as const;

const STAT_VALUE_SLOTS = {
  // Save pip slot grown 9.2 → 18pt tall so 14pt save digits can
  // actually fit at full size (was clamped by 14pt slot — heightOfString
  // at 14pt Magra-Bold lineGap=0 = 17.01pt > 14pt). y 7.2 → 5 to keep
  // the digit vertically centered against the new height without
  // colliding with the score slot below.
  save: { x: 11, y: 3, width: 33, height: 18 },
  // Score slot grown 15.5 → 30pt tall (y 26.8 → 18, height 30) so
  // 28pt scores have room to render — see companion page2-renderer
  // comment for the same change. Modifier slot y 57.2 → 56 to stay
  // aligned with the new score slot.
  score: { x: 10.5, y: 18, width: 34, height: 30 },
  // BUGFIX: the _Stat Block.svg has TWO labels baked in — a small grey
  // "STR DEX" at the top (around y 14-22) and a bold "STR DEX" at
  // the bottom (around y 46-52). The previous mask only covered the
  // bottom area, so the top label remained visible, producing
  // duplicate "STD / STR" labels in the rendered PDF. Extend the
  // mask to cover BOTH label areas so only the code-drawn label
  // (rendered last at the bottom slot) is visible.
  labelMask: { x: 8, y: 14, width: 40, height: 10 },
  // Round-30 #1: SHIFT bottom mask UP 4pt + EXTEND height 5 → 8
  // (y 42..50, was 46..51). The SVG-baked bottom "STR" label
  // (path 5) extends from y=46..50 with the letterform glyphs.
  // A mask with height 5 only covered y=42..47, leaving the
  // bottom half of the baked "STR" letterforms (y=48..50)
  // visible behind the code-drawn label — producing a
  // strikethrough effect where the user saw "SOIR" instead of
  // "CON" or similar. Extending the mask to y=42..50 covers
  // BOTH the divider line at y=43.04 AND the full bottom STR
  // baked glyphs. The mask stops at y=50 to clear the modifier
  // bubble starting at y=52.28. The code-drawn label (y=44..52)
  // renders ON TOP of this white area.
  labelMaskBottom: { x: 8, y: 42, width: 40, height: 8 },
  // Round-30 #1: SHIFT label UP 2pt (y 46 → 44). User feedback:
  // 'label for ability score has to be nudged up a bit'. The label
  // now sits just below the SVG-baked divider line (y=43.04) with
  // ~1pt breathing room, in the gap between the divider and the
  // modifier bubble starting at y=52.28. The mask above (y=42..47)
  // covers the baked bold "STR" text behind the code-drawn label
  // AND the divider line so the label appears cleanly without
  // strikethrough.
  label: { x: 10, y: 44, width: 35, height: 8 },
  // Modifier slot grown 13→18pt tall so 14pt modifier digits can
  // actually fit (was clamped to ~11pt by the 13pt slot). x 12 stays
  // — the slot is wide enough for "+10" and a 14pt Magra-Bold. y
  // shifted up 56→53 so the modifier text centers inside the SVG
  // circle (the bottom circle is at SVG center y≈61.77 with radius
  // ~13.5; slot center y=62 lines up with that circle center).
  modifier: { x: 12, y: 53, width: 31, height: 18 },
} as const;

const SKILL_ROW_SLOTS = {
  circleX: 11.5,
  firstCenterY: 9.5,
  // Bumped rowGap 9→10 so each skill row gets more vertical breathing
  // room — needed to host the larger bonus/label slot heights below.
  // 6 rows × 10pt gap + 9.5 firstCenterY = 59.5, fits in 63pt viewBox.
  rowGap: 10,
  bonusMask: { x: 16, yOffset: -4, width: 6.15, height: 5 },
  // Bonus digit slot — height 7.2→11pt so 10.5pt maxSize actually fits
  // (was silently clamped to ~6.4pt by the 7.2pt slot, making bonuses
  // look like footnotes). yOffset -3.6→-5.5 keeps the digit vertically
  // centered in the new 11pt slot. Width 11.4→10 leaves room for a
  // leading "+" sign without crowding the label.
  bonusValue: { x: 14.5, yOffset: -5.5, width: 10, height: 11 },
  line: { x: 9, width: 57, height: 5 },
  lineLabelMask: { x: 14, width: 43, height: 5 },
  // Label slot — same yOffset as bonusValue so both anchor at the
  // same vertical position. Height 7.2→11pt matches bonusValue so the
  // label and the digit share a row band and a baseline.
  label: { x: 26.4, yOffset: -5.5, width: 46.6, height: 11 },
} as const;

const PASSIVE_BOXES = [
  { x: 0, y: 6.04, width: 28.14, height: 33.96 },
  { x: 29.14, y: 6.04, width: 28.14, height: 33.96 },
  { x: 58.28, y: 6.04, width: 28.14, height: 33.96 },
  { x: 87.42, y: 6.04, width: 28.14, height: 33.96 },
  { x: 131.22, y: 6.04, width: 28.14, height: 33.96 },
  { x: 160.36, y: 6.04, width: 28.14, height: 33.96 },
  { x: 189.5, y: 6.04, width: 28.14, height: 33.96 },
  { x: 233.3, y: 6.04, width: 28.14, height: 33.96 },
  { x: 262.44, y: 6.04, width: 28.14, height: 33.96 },
  { x: 291.58, y: 6.04, width: 28.14, height: 33.96 },
  { x: 320.72, y: 6.04, width: 28.14, height: 33.96 },
  { x: 349.86, y: 6.04, width: 28.14, height: 33.96 },
] as const;

const HEADER_FIELD_SLOTS = [
  // Round-21 size-parity fix: previous labelRect height 6.4pt was
  // smaller than PDFKit's heightOfString at 6.4pt Magra (≈7.78pt
  // including lineGap), so drawFittedText auto-shrunk the label to
  // ≈4.5pt. Now labelRect height = 9pt → fits 6.8pt Magra (needs
  // 8.27pt) without shrinking. Font size bumped 6.4 → 6.8pt to
  // compensate for the 0.94× print-safe scale applied to the front
  // page (6.8 × 0.94 = 6.39pt visual — matches the unscaled 6.4pt
  // companion header). Value rects shifted down 1pt to make room
  // for the taller label band and avoid colliding with the underline.
  //
  // Round-27 #3: tighten label↔value gap. Old gap was 10pt between
  // label center (y≈29) and value center (y≈39). User feedback:
  // 'the label and value closer to each other'. Moved valueRect y
  // 34.5 → 33 (1.5pt up), closing the visual gap to ≈8pt between
  // centers. Also bumped lineRect up 0.5pt to keep the underline
  // tight under the now-higher value.
  { key: "race", label: "RACE", labelRect: { x: 242, y: 24.5, width: 83, height: 9 }, valueRect: { x: 242, y: 33, width: 83, height: 9 }, lineRect: { x: 242, y: 39, width: 83, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "class", label: "CLASS & LEVEL", labelRect: { x: 333, y: 24.5, width: 139, height: 9 }, valueRect: { x: 333, y: 33, width: 139, height: 9 }, lineRect: { x: 333, y: 39, width: 139, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "exp", label: "EXP", labelRect: { x: 480.5, y: 24.5, width: 44, height: 9 }, valueRect: { x: 480.5, y: 33, width: 44, height: 9 }, lineRect: { x: 480.5, y: 39, width: 44, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "background", label: "BACKGROUND", labelRect: { x: 242, y: 41, width: 71.5, height: 9 }, valueRect: { x: 242, y: 49.5, width: 71.5, height: 9 }, lineRect: { x: 242, y: 55.5, width: 71.5, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "alignment", label: "ALIGNMENT", labelRect: { x: 321.5, y: 41, width: 71.5, height: 9 }, valueRect: { x: 321.5, y: 49.5, width: 71.5, height: 9 }, lineRect: { x: 321.5, y: 55.5, width: 71.5, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "deity", label: "DEITY", labelRect: { x: 401, y: 41, width: 71.5, height: 9 }, valueRect: { x: 401, y: 49.5, width: 71.5, height: 9 }, lineRect: { x: 401, y: 55.5, width: 71.5, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
  { key: "player", label: "PLAYER NAME", labelRect: { x: 480.5, y: 41, width: 71.5, height: 9 }, valueRect: { x: 480.5, y: 49.5, width: 71.5, height: 9 }, lineRect: { x: 480.5, y: 55.5, width: 71.5, height: 5.0 }, maxSize: 6.4, minSize: 6.4 },
] as const;

const SPELLCASTING_REGION: PdfRect = FRONT_PAGE_REGIONS.spellcasting;
const RESOURCE_ONLY_SLOTS = [
  // Grown height 42→60pt to match the new 65pt SPELLCASTING_REGION.
  // Combined with drawShellMetricCard's bumped value-rect ratio, the
  // BONUS / SAVE DC / Ki Save DC values now render at the full 22pt
  // instead of being clamped to ~14pt.
  { x: 10, y: 1, width: 82, height: 60 },
  { x: 104, y: 1, width: 82, height: 60 },
] as const;

const FRONT_PAGE_PRINT_SAFE_SCALE = 0.94;
const FRONT_PAGE_PRINT_SAFE_OFFSET = {
  x: (PAGE_SIZE.width * (1 - FRONT_PAGE_PRINT_SAFE_SCALE)) / 2,
  y: (PAGE_SIZE.height * (1 - FRONT_PAGE_PRINT_SAFE_SCALE)) / 2,
} as const;

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim() || fallback;
}

function truncateText(value: string, maxLength: number) {
  const cleaned = cleanText(value).replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function statValue(character: ResolvedPdfCharacter, key: string, fallback = "") {
  const stat = character.frontPage.stats.find((candidate) => normalizeKey(candidate.label) === key);
  return cleanText(stat?.value, fallback);
}

function findStat(character: ResolvedPdfCharacter, key: string) {
  return character.frontPage.stats.find((candidate) => normalizeKey(candidate.label) === key);
}

function findStatsByIdPrefix(character: ResolvedPdfCharacter, prefix: string) {
  const normalizedPrefix = normalizeKey(prefix);
  return character.frontPage.stats.filter((candidate) => normalizeKey(candidate.id).startsWith(normalizedPrefix));
}

function fitSingleLineSize(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: { font?: string; maxSize: number; minSize: number },
) {
  for (let size = options.maxSize; size >= options.minSize; size -= 0.25) {
    ctx.doc.save();
    ctx.doc.font(options.font || ctx.bodyFont).fontSize(size);
    const width = ctx.doc.widthOfString(text);
    ctx.doc.restore();
    if (width <= rect.width && size * 0.95 <= rect.height) {
      return size;
    }
  }

  return options.minSize;
}

function drawSocketText(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: { font?: string; maxSize: number; minSize: number; color?: string },
) {
  if (!text.trim()) {
    return;
  }

  const font = options.font || ctx.bodyFont;
  const size = fitSingleLineSize(ctx, text, rect, options);
  ctx.doc.save();
  ctx.doc.font(font).fontSize(size);
  const width = ctx.doc.widthOfString(text);
  const x = rect.x + Math.max(0, (rect.width - width) / 2);
  // Pdfkit treats the `y` argument as the visual midline of the em-box
  // (it internally applies `dy = ascender` so the baseline lands ~size
  // below the y coordinate). Empirically verified: setting `y` to the
  // rect midpoint renders cap-height band centred in the rect for both
  // Magra-Regular and Teko-Medium (the "Helvetica-Bold" alias). Centring
  // on the cap-top (`(rect.height - capHeight) / 2`) puts digits LOW; the
  // earlier cap-top formula left numbers visibly sitting toward the bottom
  // of their sockets.
  const y = rect.y + rect.height / 2;
  ctx.doc.fillColor(options.color || "#000000");
  ctx.doc.text(text, x, y, {
    width,
    height: rect.height,
    lineBreak: false,
  });
  ctx.doc.restore();
}

function drawValueOnlyStatBox(ctx: PdfRenderContext, rect: PdfRect, value: string, mode: StatBoxSpec["mode"] = "normal") {
  if (!value) {
    return;
  }

  // Match the companion bonus-box slot proportions: value sits in the
  // top ~65% of the box (y=8/42..30/42 in the 45×42 viewBox), so the
  // label can occupy the lower third without colliding. With this
  // larger slot the digits can scale up to a maxSize that the old
  // 15.5pt slot could never accommodate. Bumped 22→28pt for normal
  // boxes, 18→24pt for shield (AC), 16→22pt for small (temp HP) —
  // user requested stat strip numbers be visibly bigger so the page
  // reads at a glance without a magnifier. Height ratio 0.50→0.65
  // gives the value enough vertical room to actually fit 28pt text
  // (was clamped to ~14pt by the 0.50-ratio slot).
  const valueRect = rectFromFractions(rect, {
    x: mode === "shield" ? 0.10 : mode === "wide" ? 0.04 : 0.08,
    y: mode === "shield" ? 0.16 : mode === "wide" ? 0.10 : 0.12,
    width: mode === "shield" ? 0.80 : mode === "wide" ? 0.92 : 0.84,
    height: mode === "shield" ? 0.52 : 0.65,
  });
  drawCenteredTextInRect(ctx, value, valueRect, {
    font: "Helvetica-Bold",
    maxSize: mode === "small" ? 22 : mode === "shield" ? 24 : 28,
    minSize: 8,
    color: "#000000",
  });
}

function drawDefensesStatBox(ctx: PdfRenderContext, rect: PdfRect, rawValue: string) {
  const lines = String(rawValue ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .split(/\n/)
    .flatMap((line) =>
      cleanText(line)
        // If upstream/newline handling ever flattens AC contributors into one string,
        // split after each completed AC value before the next "Name | Value" row.
        .replace(/\bAC\s*,?\s+(?=[^|]{1,48}\|\s*[+-]?\d)/g, "AC\n")
        .split(/\n/),
    )
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!lines.length) {
    return;
  }

  // Guard against NaN/Infinity with finite fallbacks for every dimension.
  const safeRect: PdfRect = {
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width: Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 100,
    height: Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 20,
  };

// Reserve bottom ~24% of card height so rows do not overlap DEFENSES label.
// This is a bottom reserve only; insetRect would remove the same amount from top and bottom.
// Round-26 #4: reduce horizontal padding 5pt → 1pt so the cell content
// width grows from ~31pt → ~43pt, enough to fit "Unarmored | 10 +1 AC"
// at 6pt without mid-word truncation. The defenses SVG cell is ~45pt
// wide on page; previous 5pt inset per side wasted ~20% of usable
// horizontal space on internal padding that the SVG doesn't actually
// require.
  const bottomPadFrac = 0.24;
  const bottomPad = Number.isFinite(safeRect.height) && safeRect.height > 0
    ? safeRect.height * bottomPadFrac
    : 5;
  const contentRect: PdfRect = {
    x: safeRect.x + 1,
    y: safeRect.y + 3,
    width: Math.max(1, safeRect.width - 2),
    height: Math.max(1, safeRect.height - 3 - bottomPad),
  };

  const rowCount = lines.length;
  // Round-26 #4: bump defenses font 5.5pt → 6.5pt with minSize 4.5
  // so the AC contributors read clearly. The defenses cell on page
  // is only ~30pt wide (the SVG statStrip maps 44.52 viewBox units
  // to ~30 actual points), so 7pt "Unarmored" overflows. fitTextSize
  // auto-shrinks in 0.25pt steps until the text fits the width —
  // for "Unarmored | 10 +1 AC" the longest typical row, the largest
  // fitting size is ~4.5pt. minSize 4.5 ensures we never go below
  // readable-at-print size.
  const maxFontSize = Math.min(6.5, (contentRect.height / Math.max(1, rowCount)) * 0.85);
  const minFontSize = 4.5;
  const fittedFontSize = Math.min(
    maxFontSize,
    ...lines.map((line) =>
      fitTextSize(ctx, line.includes("|") ? line : `${line} | `, { ...contentRect, height: maxFontSize + 2 }, {
        font: "Helvetica",
        maxSize: maxFontSize,
        minSize: minFontSize,
        align: "left",
        lineGap: 0,
        lineBreak: false,
      }),
    ),
  );
  const effectiveFontSize = Number.isFinite(fittedFontSize) && fittedFontSize > 0 ? fittedFontSize : minFontSize;
  const rowHeight = Math.max(effectiveFontSize + 1.1, effectiveFontSize * 1.35);
  const totalRowsHeight = rowHeight * lines.length;
  const startY = contentRect.y + Math.max(0, (contentRect.height - totalRowsHeight) / 2);

  lines.forEach((line, index) => {
    const rowTop = startY + index * rowHeight;
    const rowRect: PdfRect = {
      x: contentRect.x,
      y: rowTop,
      width: contentRect.width,
      height: rowHeight,
    };

    if (!line.includes("|")) {
      line = line + " | ";
    }

    drawText(ctx, line, rowRect, {
      font: "Helvetica",
      size: effectiveFontSize,
      align: "left",
      color: COLORS.textPrimary,
      lineGap: 0,
      lineBreak: false,
    });
  });
}

function headerRect(rect: PdfRect) {
  return componentRect(FRONT_PAGE_REGIONS.header, HEADER_SHELL_VIEWBOX, rect);
}

function drawHeaderUnderline(ctx: PdfRenderContext, rect: PdfRect, color = "#999999", width = 0.2) {
  const doc = ctx.doc as DashedLineDocument;
  const y = rect.y + rect.height / 2;
  doc.save();
  doc
    .lineWidth(width)
    .strokeColor(color)
    .lineCap("round")
    .lineJoin("round")
    .dash(0.5, { space: 0.5 })
    .moveTo(rect.x, y)
    .lineTo(rect.x + rect.width, y)
    .stroke()
    .undash();
  doc.restore();
}

function renderHeader(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  maskRect(ctx, FRONT_PAGE_REGIONS.header);
  if (assets.frontPageHeaderShell) {
    drawSvg(ctx, assets.frontPageHeaderShell, FRONT_PAGE_REGIONS.header);
  } else if (assets.frontPageHeader) {
    drawSvg(ctx, assets.frontPageHeader, FRONT_PAGE_REGIONS.header);
  } else {
    maskRect(ctx, FRONT_PAGE_REGIONS.header);
  }

  drawFittedText(ctx, cleanText(character.name, "Unnamed character"), headerRect({ x: 24, y: 28, width: 178, height: 30 }), {
    font: "Times-Bold",
    maxSize: 28,
    minSize: 12,
    color: "#000000",
  });

  const classLevelLines = ((): string[] => {
    const totalLevel = character.level;
    const classes = (character.classLabel || "").split("/").map((s) => s.trim()).filter(Boolean);
    const subclasses = (character.subclassLabel || "")
      .split("/")
      .map((s) => s.trim());
    const entryLevels = character.source?.classEntries?.map((entry) => entry.level) ?? [];
    if (classes.length > 1 || (entryLevels.length > 0 && entryLevels.some((l) => l > 0 && l < totalLevel))) {
      // Round-26 #8: multiclass path — user wants the header to show
      // ONLY the total level, not the per-class breakdown. Per-class
      // names + levels go into the SPELLCASTING card instead.
      // "Multiclass lvl {totalLevel}" reads cleaner than the previous
      // "(Lvl N) | Class A / Class B / Class C" which crashed the
      // header card layout when the character has 3+ classes.
      return [`Multiclass lvl ${totalLevel}`];
    }
    // Single-class path — fits comfortably on a single line.
    const single = classes[0] || character.classLabel || "Character";
    const sub = subclasses[0] || "";
    // Strip trailing level number from classLabel — the (Lvl N) header
    // already shows the level, so showing "Ranger 5" after subclass
    // "Beast Master Ranger" produces "(Lvl 5) | Beast Master Ranger
    // Ranger 5" with the class name duplicated. Use subclass if
    // available, else the cleaned class name.
    const cleanSingle = single.replace(/\s+\d+\s*$/, "").trim();
    const seg = sub || cleanSingle;
    return [`(Lvl ${totalLevel}) | ${seg}`.trim()];
  })();
  const raceLine = [character.raceLabel, character.subraceLabel].filter(Boolean).join(" / ");
  const values: Record<(typeof HEADER_FIELD_SLOTS)[number]["key"], string[]> = {
    race: [raceLine],
    class: classLevelLines,
    background: [character.backgroundLabel],
    alignment: [character.alignment],
    deity: [character.deity],
    exp: [""],
    player: [character.playerName],
  };

  HEADER_FIELD_SLOTS.forEach((field) => {
    // Use Magra body face for the section header labels so the front
    // page header matches the companion page header exactly (companion
    // uses Magra for its CREATURE / OWNER / SIZE / TYPE / ALIGNMENT
    // labels). Previous Teko-Medium (Helvetica-Bold alias) made the
    // front-page labels feel chunkier and a different typeface than
    // companion — user: "we need the same fonts and sizes".
    // Round-21: switch from drawFittedText to drawText with explicit
    // 6.8pt to compensate for the 0.94× print-safe scale. The
    // companion/backstory header labels are 6.4pt WITHOUT scale; the
    // front page wraps everything in 0.94× (line 3684) which made
    // the same 6.4pt label render ~6% smaller. Bumping to 6.8pt
    // (6.8 × 0.94 = 6.39pt visual) matches the companion header
    // exactly. drawFittedText was also shrinking the label to ~4.5pt
    // because the old 6.4pt labelRect height was smaller than
    // PDFKit's heightOfString at 6.4pt Magra (≈7.78pt including
    // lineGap). The companion uses drawText directly — same fix.
    //
    // Round-26 #7: user feedback "the label to be smaller in font size
    // so we do not overlap the line underneath the value with the
    // label below it". 6.8pt × Magra cap-height (~6.5pt) + descender
    // (~2pt) was visible-ink-extending past the labelRect top edge
    // and crashing into the dashed underline below. Reduced label size
    // 6.8 → 5.5pt (still larger than value text 6.4pt × 0.94 = 6.0pt
    // but with more vertical breathing room above the separator).
    // Also lifted labelRect.y 0.5pt so the ink sits closer to the
    // separator line above the labelRect (visually hugging the top
    // of the field card).
    drawText(ctx, field.label.toUpperCase(), headerRect(field.labelRect), {
      font: "Helvetica",
      size: 5.5,
      align: "left",
      color: "#777777",
      lineBreak: false,
    });
    const line = headerRect(field.lineRect);
    drawHeaderUnderline(ctx, line);

    const lines = values[field.key].map((v) => cleanText(v)).filter((v) => v.length > 0);
    if (lines.length === 0) {
      return;
    }

    if (lines.length === 1) {
      // Round-21: use drawText with explicit 6.8pt to (a) compensate
      // for the 0.94× print-safe scale and (b) avoid the auto-shrink
      // bug that drawFittedText triggers when the valueRect height
      // is smaller than PDFKit's heightOfString at the font size.
      // The value rects were sized for ~7.4pt but 6.4pt Magra needs
      // 7.78pt, so drawFittedText kept halving until ~5.5pt. The
      // bigger valueRect below (height 9) lets the value render at
      // 6.8pt without auto-shrinking. If the value is too long for
      // 6.8pt, fall back to a smaller size via minSize on a fitText
      // helper.
      drawText(ctx, lines[0], headerRect(field.valueRect), {
        font: "Helvetica",
        size: 6.8,
        align: "left",
        color: "#000000",
        lineBreak: false,
      });
      return;
    }

    // Multi-line values (currently only the CLASS & LEVEL field) share the
    // existing valueRect height across N equal-sized strips so the bottom
    // edge of the value stays anchored to the underline regardless of line
    // count. Round-21: use drawText with explicit 6.8pt to match the
    // single-line path (compensate for 0.94× scale + avoid auto-shrink).
    const fullRect = headerRect(field.valueRect);
    const perLineH = fullRect.height / lines.length;
    lines.forEach((lineText, idx) => {
      const lineRect = { x: fullRect.x, y: fullRect.y + idx * perLineH, width: fullRect.width, height: perLineH };
      drawText(ctx, lineText, lineRect, {
        font: "Helvetica",
        size: 6.8,
        align: "left",
        color: "#000000",
        lineBreak: false,
      });
    });
  });
}

function renderStatStrip(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, drawShell: boolean) {
  if (drawShell) {
    drawSvg(ctx, assets.hpPanel, FRONT_PAGE_REGIONS.statStrip);
  }

  TOP_STATS.forEach((spec) => {
    const rect = componentRect(FRONT_PAGE_REGIONS.statStrip, TOP_STAT_VIEWBOX, spec.box);
    if (spec.key === "defenses") {
      const defensesValue = findStat(character, spec.key)?.value ?? spec.fallback ?? "";
      drawDefensesStatBox(ctx, rect, defensesValue);
      return;
    }
    if (spec.key === "hit dice") {
      // The hit dice cell is wider than the other stat boxes (54.71pt × 42pt)
      // but the value string can be long ("3d8 • 3d8 • 1d6 • 1d6" for a 4-class
      // multiclass). Bumped maxSize 18→24pt so single-class "3d10" reads
      // as large as the other stat-box numbers.
      const value = statValue(character, spec.key, spec.fallback);
      const valueRect = rectFromFractions(rect, { x: 0.04, y: 0.12, width: 0.92, height: 0.50 });
      drawCenteredTextInRect(ctx, value, valueRect, {
        font: "Helvetica-Bold",
        maxSize: 24,
        minSize: 6.4,
        color: "#000000",
      });
      return;
    }
    const value = statValue(character, spec.key, spec.fallback);
    drawValueOnlyStatBox(ctx, rect, value, spec.mode);
  });
}

function spellcastingRect(rect: PdfRect) {
  return {
    x: SPELLCASTING_REGION.x + rect.x,
    y: SPELLCASTING_REGION.y + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function parseClassResource(resource: { label: string; value: string }) {
  const parts = resource.label
    .split("\n")
    .map((part) => cleanText(part))
    .filter(Boolean);
  return {
    className: parts[0] ?? "",
    name: parts[1] ?? "Class Resource",
    cadence: parts[2] ?? "",
    value: resource.value,
  };
}

function formatResourceCadence(value: string, cadence?: string) {
  const cleanedCadence = cleanText(cadence);
  if (!cleanedCadence) {
    return undefined;
  }

  // Returns JUST the clean label, capitalized. No "per" prefix, no leading count.
  // Examples: "Long Rest", "Short Rest", "Per Day", "At Will".
  const cadenceMap: Record<string, string> = {
    lr: "Long Rest",
    long: "Long Rest",
    "long rest": "Long Rest",
    sr: "Short Rest",
    short: "Short Rest",
    "short rest": "Short Rest",
    "per day": "Per Day",
    day: "Per Day",
    daily: "Per Day",
    "1/day": "Per Day",
    "at will": "At Will",
    unlimited: "At Will",
    "at dawn": "At Dawn",
    "at dusk": "At Dusk",
  };
  return cadenceMap[cleanedCadence.toLowerCase()] ?? capitalizeWords(cleanedCadence);
}

function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function drawShellMetricCard(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  box: PdfRect,
  content: { value: string; label: string; cadence?: string; labelFont?: string },
) {
  drawSvg(ctx, assets.proficiencyBox1, box);
  const cadence = formatResourceCadence(content.value, content.cadence);
  const hasCadence = Boolean(cadence);
  // Value rect height 0.40→0.55 (and width 0.84→0.88) so the 22pt
  // BONUS / SAVE DC / ABILITY digits can actually fit. Was clamped to
  // ~14pt by the 0.40-ratio slot — round-10 maxSize bump was a silent
  // no-op until now.
  drawCenteredTextInRect(ctx, content.value, rectFromFractions(box, {
    x: 0.06,
    y: hasCadence ? 0.08 : 0.12,
    width: 0.88,
    height: hasCadence ? 0.50 : 0.55,
  }), {
    font: "Helvetica-Bold",
    maxSize: box.width > 100 ? 22 : 18,
    minSize: 6.4,
    color: "#000000",
  });
  if (cadence) {
    drawCenteredTextInRect(ctx, cadence, rectFromFractions(box, { x: 0.10, y: 0.62, width: 0.80, height: 0.14 }), {
      font: "Helvetica-Bold",
      maxSize: box.width > 100 ? 6.4 : 5.4,
      minSize: 6.4,
      color: "#000000",
    });
  }
  // Label rect bumped yOffset (0.68→0.78) and height (0.16→0.20) so
  // the BONUS / SAVE DC / ABILITY label sits in the bottom 20% of the
  // box without overlapping the value rect above.
  drawCenteredTextInRect(ctx, content.label, rectFromFractions(box, {
    x: 0.06,
    y: hasCadence ? 0.78 : 0.80,
    width: 0.88,
    height: 0.18,
  }), {
    font: content.labelFont || "Helvetica-Bold",
    maxSize: box.width > 100 ? 6.4 : 5.4,
    minSize: 6.4,
    color: "#000000",
  });
}

function renderSpellcasting(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const kiSaveDc = statValue(character, "ki save dc");
  // ── Class resources parsing ──────────────────────────────────────────────
  function expandResourceCadence(value: string) {
    const cleaned = cleanText(value, "").replace(/[.]+$/g, "").trim();
    if (!cleaned) {
      return "";
    }
    if (/^(lr|long rest)$/i.test(cleaned)) {
      return "Long Rest";
    }
    if (/^(sr|short rest)$/i.test(cleaned)) {
      return "Short Rest";
    }
    if (/^(per )?day|daily$|^1\s*\/\s*day$/i.test(cleaned)) {
      return "Per Day";
    }
    if (/^at will$|unlimited/i.test(cleaned)) {
      return "At Will";
    }
    if (/^at dawn$/i.test(cleaned)) {
      return "At Dawn";
    }
    if (/^at dusk$/i.test(cleaned)) {
      return "At Dusk";
    }
    return cleaned
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseClassResource(resource: { label: string; meta: string; value: string }) {
    const parts = resource.meta
      .split("\n")
      .map((part) => cleanText(part))
      .filter(Boolean);
    const className = parts[0] ?? "";
    const cadence = expandResourceCadence(parts[2] ?? "");
    const fallbackLabel = cleanText(resource.label, "");
    let name = cleanText(parts[1] ?? fallbackLabel, "");
    if (className) {
      name = name.replace(new RegExp(`^${escapeRegExp(className)}\\s+`, "i"), "");
    }
    if (cadence) {
      name = name.replace(new RegExp(`\\s+${escapeRegExp(cadence)}$`, "i"), "");
    }
    name = name.replace(/\s+\b(?:lr|sr)\b$/i, "").trim();
    return {
      className,
      name: name || "Class Resource",
      cadence,
      value: resource.value,
    };
  }

  const classResources = findStatsByIdPrefix(character, "class-resource-")
    .map((resource) => ({
      label: cleanText(resource.label, "Class Resource"),
      meta: cleanText(resource.meta, ""),
      value: cleanText(resource.value, ""),
    }))
    .map(parseClassResource)
    .filter((resource) => resource.value);

  // Collect per-source spellcasting entries — one object per class/race/feat
  // Labels arrive as "Wizard Bonus", "Wizard DC", "Wizard Ability" so strip the suffix to group
  const rawSpellStats = findStatsByIdPrefix(character, "spellcasting-source-");
  const spellSources = rawSpellStats.reduce<
    { bonus: string; dc: string; ability: string; label: string }[]
  >((acc, stat) => {
    const match = stat.id.match(/^(spellcasting-source-[^.]+)-(bonus|dc|ability)$/);
    if (!match) return acc;
    const [, , field] = match;
    // Strip " Bonus" / " DC" / " Ability" suffix to get the class name
    const classLabel = stat.label.replace(/ (Bonus|DC|Ability)$/, "");
    let entry = acc.find((e) => e.label === classLabel);
    if (!entry) {
      entry = { bonus: "", dc: "", ability: "", label: classLabel };
      acc.push(entry);
    }
    if (field === "bonus") entry.bonus = stat.value;
    else if (field === "dc") entry.dc = stat.value;
    else if (field === "ability") entry.ability = stat.value;
    return acc;
  }, []);

  // Round-26 #8: for multiclass characters, the SPELLCASTING card must
  // list ALL classes (including non-spellcasters like Monk) — not just
  // the classes that have `spellcasting-source-*` stats. Inject
  // synthetic entries for any class in character.classLabel (which is
  // already split by '/' for multiclass) that doesn't already appear
  // in spellSources. These synthetic entries have empty bonus/dc/
  // ability so the renderer prints blanks instead of numbers. For
  // Monk (Ki-only), we surface the Ki Save DC + Wisdom ability from
  // the existing kiSaveDc stat so the row reads meaningfully.
  if (spellSources.length > 1 && character.classLabel) {
    const knownLabels = new Set(spellSources.map((s) => normalizeKey(s.label)));
    const allClassNames = (character.classLabel || "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const className of allClassNames) {
      if (knownLabels.has(normalizeKey(className))) continue;
      const isMonkKi = /monk/i.test(className) && kiSaveDc;
      spellSources.push({
        label: className,
        bonus: "",
        dc: isMonkKi ? kiSaveDc : "",
        ability: isMonkKi ? "Wisdom" : "",
      });
    }
  }

  const hasSpellcasting = spellSources.length > 0;
  const hasKiDc = Boolean(kiSaveDc);
  const hasClassResource = classResources.length > 0;
  const isMulticlass = spellSources.length > 1;

  if (!hasSpellcasting && !hasKiDc && !hasClassResource) {
    return;
  }

  maskRect(ctx, SPELLCASTING_REGION);

  // ── Ki-only path (unchanged) ────────────────────────────────────────────
  if (!hasSpellcasting && hasKiDc) {
    const kiBox = spellcastingRect(hasClassResource ? RESOURCE_ONLY_SLOTS[0] : { x: 40, y: 4, width: 116, height: 42 });
    drawShellMetricCard(ctx, assets, kiBox, { value: kiSaveDc, label: "Ki Save DC", labelFont: "Helvetica" });
    if (hasClassResource) {
      const resource = classResources[0];
      drawShellMetricCard(ctx, assets, spellcastingRect(RESOURCE_ONLY_SLOTS[1]), {
        value: resource.value, label: resource.name, cadence: resource.cadence,
      });
    }
    return;
  }

  // ── Resources-only path (unchanged) ────────────────────────────────────
  if (!hasSpellcasting && hasClassResource) {
    const resourceBoxes =
      classResources.length > 1
        ? RESOURCE_ONLY_SLOTS.map(spellcastingRect)
        : [spellcastingRect({ x: 40, y: 4, width: 116, height: 42 })];
    classResources.slice(0, resourceBoxes.length).forEach((resource, index) => {
      drawShellMetricCard(ctx, assets, resourceBoxes[index], {
        value: resource.value, label: resource.name, cadence: resource.cadence,
      });
    });
    return;
  }

  if (!hasSpellcasting) {
    return;
  }

  // ── SINGLE-CLASS SPELLCASTING ─────────────────────────────────────
  if (!isMulticlass) {
    const src = spellSources[0];
    // Box grown 48→60pt tall to match the new 65pt SPELLCASTING_REGION.
    // With h=60 the value rect at 0.05→0.65 (33pt tall) comfortably
    // holds 22pt text (lineGap-adjusted height 24.6pt) — was clamped
    // to ~14pt by the 0.48-ratio slot in the 48pt-tall box.
    const spellBox = spellcastingRect(hasClassResource ? { x: 9, y: 1, width: 120, height: 60 } : { x: 9, y: 1, width: 178, height: 60 });
    drawSvg(ctx, assets.proficiencyBox1, spellBox);
    const thirds = splitColumns(insetRect(spellBox, 9, 6), 3, 8);
    const labels = ["BONUS", "SAVE DC", "ABILITY"];
    const singleStats = [src?.bonus, src?.dc, src?.ability];

    // Bumped single-class spellcasting numbers 16→22 (bonus/ability)
    // and 12.5→20 (save DC), labels 5.0→7pt (bonus/ability) and
    // 4.6→6pt (save DC) — user requested the spellcasting card
    // numbers be visibly bigger so they match the stat strip scale.
    singleStats.forEach((value, index) => {
      if (!value) return;
      drawCenteredTextInRect(ctx, value, rectFromFractions(thirds[index], { x: 0.03, y: 0.05, width: 0.94, height: 0.65 }), {
        font: "Helvetica-Bold", maxSize: index === 1 ? 20 : 22, minSize: 6.4, color: "#000000",
      });
      drawCenteredTextInRect(ctx, labels[index], rectFromFractions(thirds[index], { x: 0.02, y: 0.75, width: 0.96, height: 0.20 }), {
        font: "Helvetica-Bold", maxSize: index === 1 ? 6.4 : 7.0, minSize: 6.4, color: "#000000",
      });
    });

    maskRect(ctx, rectFromFractions(spellBox, { x: 0.18, y: 0.86, width: 0.64, height: 0.10 }));
    drawCenteredTextInRect(ctx, "SPELLCASTING", rectFromFractions(spellBox, { x: 0.14, y: 0.84, width: 0.72, height: 0.13 }), {
      font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000",
    });

    if (hasClassResource) {
      const primaryResource = classResources[0];
      drawShellMetricCard(ctx, assets, spellcastingRect({ x: 133, y: 1, width: 60, height: 60 }), {
        value: primaryResource.value, label: primaryResource.name, cadence: primaryResource.cadence,
      });
    }
    return;
  }

  // ── MULTICLASS SPELLCASTING CARD ────────────────────────────────────────────
  // Cards stay in spellcasting region. Move left and up to align with senses card below.
  const numRows = spellSources.length;
  const labelH = 8;
  const headerH = 8;
  const rowH = 10;
  const gap = 5;
  const spellCardW = 116;
  const resourceCardW = SPELLCASTING_REGION.width - spellCardW - gap;
  const spellCardH = labelH + 4 + headerH + 1 + numRows * rowH + 2;
  // Move left and up: x=0, y=-2 → spellcastingRect adds 400,140 → x=400, y=138
  const spellBox = spellcastingRect({ x: -6, y: -5, width: spellCardW, height: spellCardH });

  // Shell border only - no white fill that overlaps borders
  drawSvg(ctx, assets.proficiencyBox1, spellBox);

  // Column headers: CLASS | BONUS | DC | ABL
  const spellRuleX = spellBox.x + 8;
  const spellRuleW = spellBox.width - 16;
  const colW = [spellRuleW * 0.40, spellRuleW * 0.20, spellRuleW * 0.18, spellRuleW * 0.22];
  const colX = [
    spellRuleX,
    spellRuleX + colW[0],
    spellRuleX + colW[0] + colW[1],
    spellRuleX + colW[0] + colW[1] + colW[2],
  ];
  const labelY = spellBox.y + 4; // title 4px from top border
  const headerY = labelY + labelH + 2;
  const dataY = headerY + headerH + 1;
  const contentW = spellBox.width - 6;

  // "SPELLCASTING" top label
  drawCenteredTextInRect(ctx, "SPELLCASTING", {
    x: spellBox.x + 3, y: labelY, width: contentW, height: labelH,
  }, { font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000" });

  const headerLabels = ["CLASS", "BONUS", "DC", "ABL"];
  headerLabels.forEach((lbl, i) => {
    drawCenteredTextInRect(ctx, lbl, { x: colX[i], y: headerY, width: colW[i], height: headerH }, {
      font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000",
    });
  });

  // Thin rule under column headers - light gray, shorter
  strokeRule(ctx, spellRuleX, headerY + headerH, spellRuleW, "#c8c8c8");

  // Build orderedClassResources: match class resources to spellSources order, append unmatched
  const matchedResourceIds = new Set<number>();
  const classResourcesBySpellSource = spellSources.flatMap((source) => {
    const sourceKey = normalizeKey(source.label);
    const matches = classResources
      .map((resource, index) => ({ resource, index }))
      .filter(({ resource, index }) => !matchedResourceIds.has(index) && normalizeKey(resource.className) === sourceKey);
    matches.forEach(({ index }) => matchedResourceIds.add(index));
    return matches.map(({ resource }) => resource);
  });
  const orderedClassResources = [
    ...classResourcesBySpellSource,
    ...classResources.filter((_, index) => !matchedResourceIds.has(index)),
  ];

  // Data rows
  // Build a parallel array of class levels by matching each spellSource
  // (in order) to character.source.classEntries. The order matches
  // because spellSources is built from the same per-class owner labels
  // that flow from classLabel (split by '/' for multiclass).
  const classLevels: number[] = (() => {
    const entryLevels = character.source?.classEntries?.map((entry) => entry.level) ?? [];
    return spellSources.map((src) => {
      // Find the class entry whose classId maps to this label. We can't
      // reverse-map classId→name easily here, so fall back to the level
      // of the entry at the same index (best-effort positional match).
      return entryLevels.shift() ?? character.level;
    });
  })();

  spellSources.forEach((src, idx) => {
    const rowY = dataY + idx * rowH;
    // Round-26 #8: append class level to the class name cell so the
    // user sees "Bard 3", "Cleric 3", "Druid 2", "Monk 2" — the
    // explicit per-class level. Render as a single string via
    // drawCenteredTextInRect (the drawWrappedClassName path was
    // splitting on the embedded space and stacking "BARD" / "3" on
    // two lines at a tiny font). Use shrink-to-fit (maxSize 5.5 →
    // minSize 4.5) so a single line of "CLERIC 3" still fits when
    // the CLASS column is narrow.
    const classLevel = classLevels[idx];
    const displayLabel = classLevel ? `${src.label.toUpperCase()} ${classLevel}` : src.label.toUpperCase();
    const vals = [displayLabel, src.bonus, src.dc, src.ability];
    vals.forEach((val, ci) => {
      if (!val) return;
      const colOpts = {
        font: "Helvetica-Bold",
        maxSize: ci === 0 ? 5.5 : 6.0,
        minSize: ci === 0 ? 4.5 : 3.5, color: "#000000",
      };
      if (ci === 0) {
        // Class name cell: single line, shrink-to-fit. For multi-word
        // class names like "FIGHTER EK" or "COLLEGE OF LORE" the
        // embedded space stays a single space and we let PDFKit
        // break to two lines via lineBreak=true.
        const cellRect = { x: colX[ci] + 1, y: rowY, width: colW[ci] - 1, height: rowH - 1 };
        drawCenteredTextInRect(ctx, val, cellRect, {
          ...colOpts,
          align: "left",
          lineBreak: true,
          ellipsis: true,
        });
      } else {
        drawCenteredTextInRect(ctx, val, { x: colX[ci], y: rowY, width: colW[ci], height: rowH - 1 }, colOpts);
      }
    });
    if (idx < numRows - 1) {
      strokeRule(ctx, spellRuleX, rowY + rowH - 1, spellRuleW, "#d4d4d4");
    }
  });

  // ── MULTICLASS CLASS RESOURCES CARD ─────────────────────────────────────
  if (hasClassResource) {
    // Use orderedClassResources for row count and rendering
    const rNumRows = orderedClassResources.length;
    const rLabelH = 8;
    const rRowH = 10;
    const rCardH = rLabelH + 4 + rNumRows * rRowH + 2;
    const maxCardH = Math.max(spellCardH, rCardH);
    // Position after spell card with gap - same y as spell card
    const rBox = spellcastingRect({ x: -6 + spellCardW + gap, y: -5, width: resourceCardW, height: maxCardH });

    // Shell border only - no white fill that overlaps borders
    drawSvg(ctx, assets.proficiencyBox1, rBox);

    const rContentW = rBox.width - 6;
    const rLabelY = rBox.y + 4; // title 4px from top border
    const rHeaderY = rLabelY + rLabelH + 2;
    const rDataY = rHeaderY + headerH + 1;

    // "CLASS RESOURCES" top label
    drawCenteredTextInRect(ctx, "CLASS RESOURCES", {
      x: rBox.x + 3, y: rLabelY, width: rContentW, height: rLabelH,
    }, { font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000" });

    // Round-26 #8: column widths — added a CLASS column to surface the
    // class name on each resource row (user: 'in CLASS RESOURCES we
    // have resources for Ki DC, but we do not have the name of the
    // class'). VAL stays narrow (~15%); CLASS gets ~22% for multi-word
    // class names like "College of Lore"; RESOURCE keeps the largest
    // share (~40%); RECHARGE shrinks to ~23% but still fits "Long Rest".
    const resourceRuleX = rBox.x + 8;
    const resourceRuleW = rBox.width - 16;
    const rv1 = resourceRuleX;
    const rw1 = resourceRuleW * 0.15;
    const rwClass = resourceRuleW * 0.22;
    const rw2 = resourceRuleW * 0.40;
    const rw3 = resourceRuleW * 0.23;
    const rvClass = rv1 + rw1;
    const rv2 = rvClass + rwClass;
    const rv3 = rv2 + rw2;

    // Column header labels
    const rHeaderLabels = ["VAL", "CLASS", "RESOURCE", "RECHARGE"];
    const rColX = [rv1, rvClass, rv2, rv3];
    const rColW = [rw1, rwClass, rw2, rw3];
    rHeaderLabels.forEach((lbl, i) => {
      drawCenteredTextInRect(ctx, lbl, { x: rColX[i], y: rHeaderY, width: rColW[i], height: headerH }, {
        font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000",
      });
    });

    // Thin rule under column headers - light gray, shorter
    strokeRule(ctx, resourceRuleX, rHeaderY + headerH, resourceRuleW, "#c8c8c8");

    // Data rows: VAL | CLASS | RESOURCE | RECHARGE
    orderedClassResources.forEach((resource, idx) => {
      const rowY = rDataY + idx * rRowH;

      // Value (e.g. "2d6" or "3") — matches the spellcasting card body font.
      drawCenteredTextInRect(ctx, resource.value, { x: rv1, y: rowY, width: rw1, height: rRowH - 1 }, {
        font: "Helvetica-Bold", maxSize: 6.0, minSize: 6.4, color: "#000000",
      });
      // Round-26 #8: Class name (e.g. "Bard", "Monk"). Fall back to
      // empty string if the parseClassResource couldn't extract one
      // (older data without ownerLabel metadata).
      drawCenteredTextInRect(ctx, (resource.className || "").toUpperCase(), { x: rvClass, y: rowY, width: rwClass, height: rRowH - 1 }, {
        font: "Helvetica-Bold", maxSize: 6.0, minSize: 4.5, color: "#000000",
        ellipsis: false,
      });
      // Resource name (e.g. "Arcane Recovery", "Sorcery Points")
      drawCenteredTextInRect(ctx, resource.name, { x: rv2, y: rowY, width: rw2, height: rRowH - 1 }, {
        font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000",
      });
      // Recharge (e.g. "Long Rest", "Short Rest", "At Will", "Per Day").
      drawCenteredTextInRect(ctx, resource.cadence, { x: rv3, y: rowY, width: rw3, height: rRowH - 1 }, {
        font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#000000",
      });

      if (idx < rNumRows - 1) {
        strokeRule(ctx, resourceRuleX, rowY + rRowH - 1, resourceRuleW, "#d4d4d4");
      }
    });
  }
}

function cardHasGroup(card: PdfPageCard, group: string) {
  return card.tags.includes(`pdf-group:${group}`);
}

function drawSkillMarker(ctx: PdfRenderContext, center: { x: number; y: number }, row: { proficient: boolean; expertise: boolean }) {
  if (row.expertise) {
    strokeCircle(ctx, center.x, center.y, 1.95, "#000000", 0.65);
    fillCircle(ctx, center.x, center.y, 0.78, "#000000");
    return;
  }

  if (row.proficient) {
    fillCircle(ctx, center.x, center.y, 1.92, "#000000");
  }
}

function renderAbilities(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, drawShell: boolean) {
  const canRecompose = Boolean(assets.statBlock && assets.generalContainer);
  const abilityRegion = FRONT_PAGE_REGIONS.abilities;
  if (canRecompose) {
    maskRect(ctx, {
      x: abilityRegion.x - 10,
      y: abilityRegion.y,
      width: abilityRegion.width + 10,
      height: abilityRegion.height + 12,
    });
  } else if (drawShell && (!assets.statBlock || !assets.skillBlock)) {
    drawSvg(ctx, assets.abilityPanel, abilityRegion);
  }

  const hasPrintedTemplate = !drawShell && !canRecompose;
  const abilityRowsByLabel = new Map(character.frontPage.abilityRows.map((row) => [row.label.toUpperCase(), row]));
  const skillRows = new Map(character.frontPage.skillRows.map((row) => [normalizeKey(row.label), row]));

  if (assets.statBlock) {
    if (!hasPrintedTemplate && assets.greyBackground) {
      STAT_ROW_BACKGROUNDS.forEach((background) => {
        drawSvg(ctx, assets.greyBackground, componentRect(abilityRegion, ABILITY_PANEL_VIEWBOX, background));
      });
    }

    STAT_BLOCKS.forEach((slot) => {
      const row = abilityRowsByLabel.get(slot.label);
      if (!row) {
        return;
      }

      const block = componentRect(abilityRegion, ABILITY_PANEL_VIEWBOX, {
        x: slot.x,
        y: slot.y,
        width: STAT_BLOCK_VIEWBOX.width,
        height: STAT_BLOCK_VIEWBOX.height,
      });
      if (!hasPrintedTemplate) {
        drawSvg(ctx, assets.statBlock, block);
        // Round-27 #1c: mask out the SVG-baked "STR" label at the bottom
        // of every stat block. The _Stat Block.svg is a single template
        // that bakes "STR" into all 6 cells, so without masking every
        // cell showed "STR" regardless of ability. Now we mask the bottom
        // label area and code-draw the correct label (STR/DEX/CON/INT/
        // WIS/CHA) below the score digit.
        maskRect(ctx, componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.labelMaskBottom));
      }
      if (row.saveProficient) {
        const saveMarker = componentPoint(block, STAT_BLOCK_VIEWBOX, { x: 27.7, y: 3 });
        fillCircle(ctx, saveMarker.x, saveMarker.y, componentRadius(block, STAT_BLOCK_VIEWBOX, 2.1), "#000000");
      }
      // Use the same measured-height fitting as the companion so the
      // score digit and the save/modifier pips stay cleanly inside
      // their slots instead of overflowing into each other. The old
      // drawSocketText used a loose `size*0.95 <= height` check which
      // let the score render at 16.25pt in a 15.5pt slot — pushing
      // cap-tops above the save pip and descenders below the modifier.
      // Bumped sizes to match the companion page so both pages use the
      // same stat-block geometry.
      //
      // Round-29 #1: REVERT save pip y-lift to 0 (was -5pt in
      // round-28). User feedback: 'save valoarea (+3 de ex) trebuie
      // sa fie mai jos sa fie pe centru cumva sau putin mai sus nu
      // neaprat centrat cat sa nu se scrie peste save'. The
      // round-28 -5pt lift put the digit too high — visibly above
      // the pip circle's center, sitting OUTSIDE the pip instead of
      // inside. Setting lift to 0 lets PDFKit's drawCenteredTextInRect
      // (which centers the digit vertically inside the saveSlot
      // y=5..23 height=18) place the digit at slot center y=14. The
      // SVG-baked "SAVE" text band lives at y=18-22; the digit
      // baseline at y≈14 with a 14pt Magra-Bold ascent of ~10pt
      // puts the digit top at y≈4 — clears the pip border at y≈-2
      // and the baked SAVE text at y=18-22 with ~4pt breathing room
      // on the bottom side (digit descender ≈3pt ends at y≈17).
      // If the digit ever overlaps the baked SAVE text the fix
      // should be to MOVE THE BAKE TEXT (delete or repaint the SVG)
      // not to lift the digit further — that's the
      // "no white-box mask" philosophy from R28 #2.
      const saveSlot = componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.save);
      drawCenteredTextInRect(ctx, signed(row.saveBonus), { ...saveSlot, y: saveSlot.y }, {
        font: "Helvetica-Bold",
        maxSize: 14,
        minSize: 6.4,
        color: "#000000",
        lineGap: 0,
      });
      drawCenteredTextInRect(ctx, `${row.score}`, componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.score), {
        font: "Helvetica-Bold",
        maxSize: 28,
        minSize: 12,
        color: "#000000",
      });
      // Round-27 #1c: code-draw the per-cell ability label (STR/DEX/
      // CON/INT/WIS/CHA) at the bottom of each stat block. Previously
      // we relied on the SVG-baked "STR" template label which showed
      // "STR" for every cell. Magra-Bold 7pt with the same #555 color
      // used by the companion page ability cards for visual parity.
      drawCenteredTextInRect(ctx, row.label.toUpperCase(), componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.label), {
        font: "Helvetica-Bold",
        maxSize: 7,
        minSize: 6.4,
        color: "#555555",
        lineGap: 0,
      });
      // Round-27 #1b: modifier Y was nudged UP 7pt in round-26 to
      // optically center it in the bottom circle. User feedback
      // ('modifiers Have to be nudged down to be inside the circle')
      // shows the previous lift overshot — the modifier now sits
      // ABOVE the circle outline. Revert: render at the original
      // slot Y so the digit lands inside the circle bubble.
      const modifierSlot = componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.modifier);
      drawCenteredTextInRect(ctx, signed(row.modifier), modifierSlot, {
        font: "Helvetica-Bold",
        // Bumped 11→14 so modifier +1/+3 etc. read at the same
        // weight as the score digit. lineGap=0 so 14pt Magra-Bold
        // fits the modifier slot (h=18) without fitTextSize
        // shrinking to ~13pt (same rationale as the save bonus).
        maxSize: 14,
        minSize: 6.4,
        color: "#000000",
        lineGap: 0,
      });
    });
  }

  if (assets.skillBlock || assets.generalContainer) {
    if (drawShell || canRecompose) {
      drawCenteredTextInRect(ctx, "ABILITY CHECKS", { x: 204, y: abilityRegion.y - 0.5, width: 170, height: 8 }, {
        // Bumped 4.4→6.4 to match the smallest-font-is-feature-body floor
        // user requested, and bumped color #9a9a9a→#555 for visibility.
        font: "Helvetica-Bold",
        maxSize: 6.4,
        minSize: 6.4,
        color: "#555555",
      });
    }

    SKILL_BLOCKS.forEach((slot) => {
      const block = componentRect(abilityRegion, ABILITY_PANEL_VIEWBOX, {
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
      });
      if (canRecompose && assets.proficiencyBox1) {
        drawSvg(ctx, assets.proficiencyBox1, block);
      } else if (!hasPrintedTemplate && assets.skillBlock) {
        drawSvg(ctx, assets.skillBlock, block);
      }

      slot.skills.forEach((skill, index) => {
        const row = skillRows.get(normalizeKey(skill));
        if (!row) {
          return;
        }

        const centerY = SKILL_ROW_SLOTS.firstCenterY + index * SKILL_ROW_SLOTS.rowGap;
        const circleCenter = componentPoint(block, SKILL_BLOCK_VIEWBOX, { x: SKILL_ROW_SLOTS.circleX, y: centerY });

        if (canRecompose && assets.skillLine) {
          const lineRect = componentRect(block, SKILL_BLOCK_VIEWBOX, {
            x: SKILL_ROW_SLOTS.line.x,
            y: centerY - SKILL_ROW_SLOTS.line.height / 2,
            width: SKILL_ROW_SLOTS.line.width,
            height: SKILL_ROW_SLOTS.line.height,
          });
          drawSvg(ctx, assets.skillLine, lineRect);
          maskRect(ctx, componentRect(lineRect, { width: 57, height: 5 }, {
            x: SKILL_ROW_SLOTS.lineLabelMask.x,
            y: 0,
            width: SKILL_ROW_SLOTS.lineLabelMask.width,
            height: SKILL_ROW_SLOTS.lineLabelMask.height,
          }));
        } else {
          maskRect(ctx, componentRect(block, SKILL_BLOCK_VIEWBOX, {
            x: hasPrintedTemplate ? SKILL_ROW_SLOTS.bonusMask.x : 15,
            y: centerY + (hasPrintedTemplate ? SKILL_ROW_SLOTS.bonusMask.yOffset : -3.2),
            width: hasPrintedTemplate ? SKILL_ROW_SLOTS.bonusMask.width : 60,
            height: hasPrintedTemplate ? SKILL_ROW_SLOTS.bonusMask.height : 6.4,
          }));
        }
        drawSkillMarker(ctx, circleCenter, row);

        drawCenteredTextInRect(ctx, signed(row.total), componentRect(block, SKILL_BLOCK_VIEWBOX, {
          x: SKILL_ROW_SLOTS.bonusValue.x,
          y: centerY + SKILL_ROW_SLOTS.bonusValue.yOffset,
          width: SKILL_ROW_SLOTS.bonusValue.width,
          height: SKILL_ROW_SLOTS.bonusValue.height,
        }), {
          font: "Helvetica-Bold",
          maxSize: 10.5,
          minSize: 6.4,
          color: "#000000",
        });
        if (!hasPrintedTemplate || canRecompose) {
          drawCenteredTextInRect(ctx, skill, componentRect(block, SKILL_BLOCK_VIEWBOX, {
            x: SKILL_ROW_SLOTS.label.x,
            // Match bonus slot yOffset + height so both text runs are
            // vertically centered in the same row band, putting the
            // digit and the label baseline on a shared visual line.
            y: centerY + SKILL_ROW_SLOTS.label.yOffset,
            width: SKILL_ROW_SLOTS.label.width,
            height: SKILL_ROW_SLOTS.label.height,
          }), {
            font: "Helvetica",
            maxSize: 6.2,
            minSize: 6.4,
            color: "#000000",
          });
        }
      });
      if (!hasPrintedTemplate || canRecompose) {
        maskRect(ctx, componentRect(block, SKILL_BLOCK_VIEWBOX, { x: 24, y: 52, width: 30, height: 8 }));
        drawCenteredTextInRect(ctx, slot.ability, componentRect(block, SKILL_BLOCK_VIEWBOX, { x: 0, y: 53, width: 78, height: 7 }), {
          font: "Helvetica-Bold",
          maxSize: 6.5,
          minSize: 6.4,
          color: "#9a9a9a",
        });
      }
    });
  }
}

function renderPassives(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, drawShell: boolean) {
  if (drawShell) {
    drawSvg(ctx, assets.passivesAndSpeeds, {
      ...FRONT_PAGE_REGIONS.passives,
      y: FRONT_PAGE_REGIONS.passives.y - 7,
    });
  }

  const abilityRows = new Map(character.frontPage.abilityRows.map((row) => [row.label.toUpperCase(), row]));
  const skillRows = new Map(character.frontPage.skillRows.map((row) => [normalizeKey(row.label), row]));
  const strength = abilityRows.get("STR")?.score ?? 10;
  const values = [
    `${strength}`,
    `${Math.max(0, Math.floor((strength + 3) / 4))}`,
    `${strength * 30}`,
    "",
    statValue(character, "passive perception"),
    skillRows.has("insight") ? `${10 + (skillRows.get("insight")?.total ?? 0)}` : "",
    skillRows.has("investigation") ? `${10 + (skillRows.get("investigation")?.total ?? 0)}` : "",
    statValue(character, "speed").replace(/\s*ft\.?/i, ""),
    "",
    "",
    "",
    "",
  ];

  values.forEach((value, index) => {
    if (!value) {
      return;
    }
    const cell = componentRect(FRONT_PAGE_REGIONS.passives, PASSIVES_VIEWBOX, PASSIVE_BOXES[index]);
    const valueRect = rectFromFractions(cell, { x: 0.06, y: 0.12, width: 0.88, height: 0.53 });
    // Round-26 #2: nudge the passive/speed value Y UP by fontSize*0.3
    // (≈4.2pt for 14pt Magra-Bold) so the digit lands in the optical
    // center of its circle bubble. Without this lift, the digit
    // visually sits low because Magra-Bold's tall descender makes
    // PDFKit's geometric center calculation read as bottom-heavy.
    drawCenteredTextInRect(ctx, value, { ...valueRect, y: valueRect.y - 4.2 }, {
      font: "Helvetica-Bold",
      // Round-25: size parity with companion SPEED card. Companion
      // slot height is 18pt (y=4 of 34pt viewBox), so front passive
      // slot grown 0.44 → 0.53 (0.53 × 33.96 = 18pt) to match. With
      // lineGap=0, heightOfString at 14pt Magra-Bold = 17.01pt which
      // fits 18pt. Without lineGap=0 the default 0.12 × size lineGap
      // pushes fitTextSize to shrink below 14pt — that's why the
      // front "70 / Walking" digit was rendering at ~11pt while
      // companion "40 / Walking" rendered at ~13pt. Both pages now
      // render the passive/speed value at 14pt Magra-Bold.
      maxSize: 14,
      minSize: 6.4,
      color: "#000000",
      lineGap: 0,
    });
  });
}

function renderProficiencies(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const cells = splitColumns(insetRect(FRONT_PAGE_REGIONS.proficiencies, 8, 0), 5, 13);
  const groups = character.frontPage.proficiencyGroups;
  const values = [groups.weapons, groups.armor, groups.tools, groups.vehicles, groups.languages];
  // Round-29 #2: shortened "TOOLS & INSTR." → "TOOLS&INSTR" (no
  // space around ampersand). User feedback: 'TOOLS & INSTR tot
  // face overflow. Poate ar putea fi "TOOLS&INSTR" nu
  // "TOOLS & INSTR"'. Removing the spaces around the ampersand
  // shrinks the label from 13 chars to 10 chars — fits cleanly
  // inside the 25pt-wide SVG bubble ornament at 3.0pt.
  const labels = ["WEAPONS", "ARMOR", "TOOLS&INSTR", "VEHICLES", "LANGUAGES"];

  values.forEach((items, index) => {
    const cell = cells[index];
    drawSvg(ctx, assets.proficiencyBox0, cell);
    // Round-27 #7: REMOVE the top-14% white-box mask entirely. The
    // _Proficiency Box 0.svg contains NO text baked in (verified by
    // grepping the SVG file) — only the decorative frame and the
    // white-filled bubble ornament at the bottom. The previous mask
    // was drawn over the empty top area, leaving a visible white
    // rectangle that "messed up the card" per the user. No label
    // masking is needed; just render the value text + bottom label.
    //
    // The bottom label is rendered INSIDE the SVG's white bubble
    // ornament (the small rounded badge that sits at y=37-47 of the
    // box viewBox, ~80% from top). This matches the original
    // aesthetic intent — the bubble is meant to hold a label.
    if (!items.length) {
      // No items — still draw the bottom label so the empty card
      // is visually consistent with the others.
      // Round-29 #2: label centered (x=0.04, width=0.92 to span
      // full bubble width) and shrunk 3.5pt → 3.0pt with minSize
      // also 3.0pt. User feedback: 'labels trebuie sa fie mai jos
      // sa fie centrate calumea si sa fie si mai mici putin'. The
      // previous 3.5pt + x=0.12 left the label slightly off-center
      // and a touch too big to fit the bubble's rounded corners.
      // 3.0pt + width 0.92 + y offset puts the label visually
      // centered in the bubble.
      drawCenteredTextInRect(ctx, labels[index], rectFromFractions(cell, { x: 0.04, y: 0.82, width: 0.92, height: 0.14 }), {
        font: "Helvetica",
        maxSize: 3.0,
        minSize: 3.0,
        color: "#777777",
        lineBreak: false,
      });
      return;
    }
    const itemText = items.join(", ");
    // Round-27 #2: dynamic font shrink. The previous fixed 5.5/4.5pt
    // band worked for 4-5 item lists but clipped on the Ranger's
    // 6-item weapons list ("Longsword, Shortsword, Shortbow, Longbow,
    // Simple Weapons, Martial Weapons"). Now we let fitTextSize pick
    // anywhere between 6.4pt (1-2 items — matches the SPEED-card
    // label weight) and 3.5pt (6+ items — small but readable) based
    // on what actually fits. Aggressive shrinking lets us reclaim
    // ~25% more vertical space for long lists without truncating.
    const valueRect = rectFromFractions(cell, { x: 0.06, y: 0.06, width: 0.88, height: 0.72 });
    const valueSize = fitTextSize(ctx, itemText, valueRect, {
      font: "Helvetica",
      maxSize: 6.4,
      minSize: 3.5,
      align: "left",
      color: "#000000",
      lineBreak: true,
      ellipsis: false,
      lineGap: 0,
    });
    drawText(ctx, itemText, valueRect, {
      font: "Helvetica",
      size: valueSize,
      align: "left",
      color: "#000000",
      lineBreak: true,
      ellipsis: false,
      lineGap: 0,
    });
    // Round-29 #2: bottom label drawn INSIDE the SVG's white bubble
    // ornament. User feedback: 'labels trebuie sa fie mai jos sa
    // fie centrate calumea si sa fie si mai mici putin'.
    // - y: 0.80 → 0.82 (push label slightly down for visual
    //   centering inside the bubble — bubble centerline is at
    //   SVG y=42 of the 66x48 viewBox, i.e. fraction 0.875)
    // - x: 0.10 → 0.04 (extend width to fill bubble)
    // - width: 0.80 → 0.92 (full bubble width)
    // - maxSize 3.5 → 3.0, minSize 3.5 → 3.0 (shrink to fit)
    // Result: label visually centered in the bubble, no overflow,
    // no crowding against the rounded corners.
    drawCenteredTextInRect(ctx, labels[index], rectFromFractions(cell, { x: 0.04, y: 0.82, width: 0.92, height: 0.14 }), {
      font: "Helvetica",
      maxSize: 3.0,
      minSize: 3.0,
      color: "#777777",
      lineBreak: false,
    });
  });
}

function drawWeaponCell(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  value: string,
  options: { maxSize?: number; minSize?: number; bold?: boolean; align?: "left" | "center" } = {},
) {
  if (assets.weaponBg) {
    drawSvg(ctx, assets.weaponBg, rect);
  } else {
    maskRect(ctx, rect, "#ececec");
  }

  const cleanedValue = cleanText(value);
  if (!cleanedValue) {
    return;
  }

  const textRect = {
    x: rect.x + rect.width * 0.06,
    y: rect.y + rect.height * 0.1,
    width: rect.width * 0.88,
    height: rect.height * 0.8,
  };
  const textOptions = {
    font: options.bold === false ? "Helvetica" : "Helvetica-Bold",
    maxSize: options.maxSize ?? 5.2,
    minSize: options.minSize ?? 3.2,
    color: "#000000",
    lineGap: 0.5,
  };
  if (options.align === "left") {
    drawFittedText(ctx, cleanedValue, textRect, { ...textOptions, align: "left" });
    return;
  }

  drawCenteredTextInRect(ctx, cleanedValue, textRect, textOptions);
}

function abbreviateDamageType(value: string): string {
  return value; // use full names — no abbreviations
}

const WEAPON_PROP_CODE_TO_NAME: Record<string, string> = {
  fin: "finesse",
  vers: "versatile",
  reach: "reach",
  thr: "thrown",
  "2h": "two-handed",
  hvy: "heavy",
  lt: "light",
  load: "loading",
  ammo: "ammunition",
};

function abbreviateWeaponProperties(value: string): string {
  return value
    .split(/[,;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Strip " property" suffix and normalize code
      const normalized = p.replace(/ property$/i, "").trim().toLowerCase();
      const base = normalized.replace(/\s*\([^)]*\)\s*/g, "").trim(); // strip parenthetical like (1d10)
      const match = base.match(/^(\w+)\s*(.*)$/);
      const code = match ? match[1] : normalized;
      const suffix = match && match[2] ? ` ${match[2]}` : "";
      return (WEAPON_PROP_CODE_TO_NAME[code] ?? code) + suffix;
    })
    .join(", ");
}

function renderWeaponAttackRows(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  rows: { name: string; hit: string; damage: string; type?: string; properties?: string }[],
) {
  const maxRows = 6;
  const displayRows = rows.slice(0, maxRows);
  const columnGap = 3;
  const rowGap = 1.0;
  const headerHeight = 7;
  const columnSpecs = [
    { key: "name", label: "NAME", width: 0.29 },
    { key: "hit", label: "HIT", width: 0.12 },
    { key: "damage", label: "DAMAGE", width: 0.20 },
    { key: "type", label: "TYPE", width: 0.14 },
    { key: "properties", label: "PROPERTIES", width: 0.25 },
  ] as const;
  const totalGap = columnGap * (columnSpecs.length - 1);
  const availableWidth = rect.width - totalGap;
  let cursorX = rect.x;
  const columns = columnSpecs.map((column) => {
    const width = availableWidth * column.width;
    const colRect = { x: cursorX, y: rect.y, width, height: rect.height };
    cursorX += width + columnGap;
    return { ...column, rect: colRect };
  });

  // Headers render once; all data rows below still draw blank cells when empty.
  // Bumped header maxSize 5 → 6.4pt + color #555 → #444 so they read
  // as proper section anchors (user said weapon attack labels were
  // too small — match the smallest-font-is-feature-body floor).
  columns.forEach((column) => {
    drawCenteredTextInRect(
      ctx,
      column.label,
      { x: column.rect.x, y: rect.y, width: column.rect.width, height: headerHeight },
      { font: "Helvetica-Bold", maxSize: 6.4, minSize: 6.4, color: "#444444" },
    );
  });

  const rowArea = {
    x: rect.x,
    y: rect.y + headerHeight + 1.5,
    width: rect.width,
    height: Math.min(52, rect.height - headerHeight - 1.5),
  };
  const rowRects = splitRows(rowArea, maxRows, rowGap);

  rowRects.forEach((dataRowRect, index) => {
    const row = displayRows[index];

    columns.forEach((column) => {
      const cell = { x: column.rect.x, y: dataRowRect.y, width: column.rect.width, height: dataRowRect.height };

      let value = "";
      if (column.key === "name") value = row?.name ?? "";
      else if (column.key === "hit") value = row?.hit ?? "";
      else if (column.key === "damage") value = row?.damage ?? "";
      else if (column.key === "type") value = row?.type ?? "";
      else if (column.key === "properties") value = row?.properties ?? "";

      // Bumped cell sizes: name 4.6 → 6pt, hit 5.3 → 7pt, damage
      // 4.9 → 6.5pt, type 3.7 → 5pt, properties 2.8 → 4pt. User said
      // weapon attack values were too small to read at arm's length.
      if (column.key === "name") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 7, minSize: 6.4, align: "left" });
      } else if (column.key === "hit") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 8, minSize: 6.4 });
      } else if (column.key === "damage") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 7.5, minSize: 6.4 });
      } else if (column.key === "type") {
        drawWeaponCell(ctx, assets, cell, abbreviateDamageType(value), { maxSize: 6.4, minSize: 6.4, bold: false, align: "left" });
      } else {
        drawWeaponCell(ctx, assets, cell, abbreviateWeaponProperties(value), { maxSize: 6.4, minSize: 6.4, bold: false, align: "left" });
      }
    });
  });
}

function renderSpellTracker(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  spellColumn: NonNullable<ResolvedPdfCharacter["frontPage"]["combatHub"]>["spellColumn"],
  _spellCards: PdfPageCard[],
  targetBottomY: number,
) {
  if (!spellColumn) return;

  const { cantrips, slots, spellsByLevel } = spellColumn;
  const standardSlots = slots.standardSlots ?? (slots.hasPactMagic ? [] : slots.slots);
  const pactSlots = slots.pactSlots ?? (slots.hasPactMagic ? slots.slots : []);
  const contentPadding = 1;
  const contentRect = {
    x: rect.x + contentPadding,
    y: rect.y + 2,
    width: rect.width - contentPadding * 2,
    height: rect.height - 4,
  };

  drawCenteredTextInRect(ctx, "Spell List", { x: contentRect.x, y: contentRect.y, width: contentRect.width, height: 6 }, {
    font: "Helvetica-Bold",
    maxSize: 6.4,
    minSize: 6.4,
    color: "#555555",
  });

  // --- Cantrips row (two-cell layout matching leveled spell rows) ---
  const cantripNames = formatSpellEntriesForFrontPage(cantrips, "cantrip");
  const cantripY = contentRect.y + 9;
  const leftCellW = SPELL_LEFT_CELL_W;
  // Left cell: "Cantrips" label at top, no circles. Bumped 5.5→7pt
  // so the section label reads as a proper anchor, not a footnote
  // (user: "cantrips and lvl too small").
  drawFittedText(ctx, "Cantrips", { x: contentRect.x, y: cantripY, width: leftCellW, height: 8 }, {
    font: "Helvetica-Bold",
    maxSize: 7,
    minSize: 6.4,
    align: "right",
    color: "#222222",
    lineBreak: false,
  });
  // Right cell: cantrip spell names. Bumped 5 → 6.4pt so the actual
  // spell list matches the feature description body size and reads
  // as a proper anchor.
  drawFittedText(
    ctx,
    cantripNames,
    {
      x: contentRect.x + leftCellW + SPELL_TEXT_GAP,
      y: cantripY,
      width: contentRect.width - leftCellW - SPELL_TEXT_GAP,
      height: 8,
    },
    { font: "Helvetica", maxSize: 6.4, minSize: 6.4, align: "left", color: "#222222", lineBreak: false },
  );

  const pactSummary = formatPactSlotSummary(pactSlots);
  const pactLineHeight = pactSummary ? 4.4 : 0;
  if (pactSummary) {
    drawFittedText(ctx, pactSummary, {
      x: contentRect.x,
      y: cantripY + 5.8,
      width: contentRect.width,
      height: pactLineHeight,
    }, {
      font: "Helvetica-Bold",
      maxSize: 6.4,
      minSize: 6.4,
      align: "right",
      color: "#555555",
      lineBreak: false,
    });
  }

  // --- Spell slots and spell names by level ---
  // slotsY grown 6.5 → 9 below cantripY so the level rows don't
  // collide with the cantrip row above (user: "in spell list those
  // overlap — Contrips — / Level 1 overlapping"). The cantrip row
  // text height is 8pt (height in the rect passed to drawFittedText
  // above), so 9pt gap keeps the level-row circles / label clear
  // of the cantrip names.
  const slotsY = cantripY + 9 + pactLineHeight;
  const slotsAreaHeight = Math.max(1, Math.min(contentRect.height - (slotsY - contentRect.y), targetBottomY - slotsY));
  const highestSpellLevel = spellsByLevel.reduce(
    (max, entry) => entry.spells.length ? Math.max(max, entry.level) : max,
    0,
  );
  const visibleLevels = spellsByLevel
    .filter((entry) => entry.spells.length > 0)
    .map((entry) => entry.level);

  if (highestSpellLevel > 0) {
    // Three compact level groups: 1-3, 4-6, 7-9. Cantrips stay full-width above.
    const levelGroups = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]
      .map((group) => group.filter((level) => visibleLevels.includes(level)))
      .filter((group) => group.length > 0);
    const gap = 0.1;
    const groupWidth = (contentRect.width - gap * (levelGroups.length - 1)) / levelGroups.length;

    levelGroups.forEach((levels, index) => {
      const groupRect = {
        x: contentRect.x + index * (groupWidth + gap),
        y: slotsY,
        width: groupWidth,
        height: slotsAreaHeight,
      };
      renderSpellLevelGroup(ctx, assets, groupRect, levels, standardSlots, spellsByLevel);
    });
  }
}

function renderSpellLevelGroup(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  levels: number[],
  slotLevels: { level: number; slots: number }[],
  spellsByLevel: { level: number; spells: { id: string; name: string; level: number; sourceLabel?: string; page1DisplaySummary?: string }[] }[],
) {
  const rowGap = 0.35;

  // Two-cell row layout per spell level:
  // LEFT CELL (leftCellW): Lvl N: label at top, circles below.
  // Circles NOT on same baseline as label — they are vertically separated below the label.
  // RIGHT CELL: spell names.
  const leftCellW = SPELL_LEFT_CELL_W; // minimum viable label/slots cell; maximizes spell-name width
  const circleSize = 3.4;
  const circleGap = SPELL_CIRCLE_GAP;
  // Round-21: labelH 4 → 9pt so "Level N" actually renders. The 7pt
  // Magra-Bold label needs ~8.5pt of vertical room including
  // PDFKit's lineGap; the old 4pt labelRect couldn't hold it and
  // drawFittedText kept shrinking the text until it disappeared
  // (the round-17 render shows "Level 1" missing entirely — circles
  // render but no label). 9pt is comfortable for 7pt text with
  // lineGap. Circle gap bumped 1.1 → 2.5pt so the circles sit
  // visibly below the label band instead of touching it
  // (user: 'the level and the resources are overlapping').
  const labelH = 9;
  const circleGapBelowLabel = 2.5;
  const minLeftBlockHeight = labelH + circleGapBelowLabel + circleSize;
  const nameWidth = rect.width - leftCellW - SPELL_TEXT_GAP;
  const availableRowsHeight = Math.max(1, rect.height - rowGap * (levels.length - 1));

  const rowData = levels.map((level) => {
    const slotCount = slotLevels.find((s) => s.level === level)?.slots ?? 0;
    const spells = spellsByLevel.find((entry) => entry.level === level)?.spells ?? [];
    const spellNames = formatSpellEntriesForFrontPage(spells, "leveled");
    ctx.doc.save();
    ctx.doc.font("Helvetica");
    ctx.doc.fontSize(3.7);
    const measuredTextHeight = ctx.doc.heightOfString(spellNames === "—" && slotCount === 0 ? "" : spellNames, {
      width: nameWidth,
      lineBreak: true,
      ellipsis: false,
      lineGap: SPELL_TEXT_LINE_GAP,
    });
    ctx.doc.restore();

    return {
      level,
      slotCount,
      spellNames,
      minHeight: minLeftBlockHeight,
      desiredHeight: Math.max(minLeftBlockHeight, measuredTextHeight + 0.6),
    };
  });

  const minHeightTotal = rowData.reduce((sum, row) => sum + row.minHeight, 0);
  const desiredHeightTotal = rowData.reduce((sum, row) => sum + row.desiredHeight, 0);
  const extraAvailable = Math.max(0, availableRowsHeight - minHeightTotal);
  const desiredExtra = Math.max(0, desiredHeightTotal - minHeightTotal);
  const rowHeights = rowData.map((row) => {
    if (minHeightTotal >= availableRowsHeight) {
      return availableRowsHeight / rowData.length;
    }
    if (desiredHeightTotal <= availableRowsHeight) {
      const spare = (availableRowsHeight - desiredHeightTotal) / rowData.length;
      return row.desiredHeight + spare;
    }
    if (desiredExtra <= 0) {
      return availableRowsHeight / rowData.length;
    }
    return row.minHeight + (row.desiredHeight - row.minHeight) * (extraAvailable / desiredExtra);
  });

  let cursorY = rect.y;
  rowData.forEach((row, idx) => {
    const level = row.level;
    const rowRect = {
      x: rect.x,
      y: cursorY,
      width: rect.width,
      height: rowHeights[idx],
    };
    cursorY += rowRect.height + rowGap;
    const rowTop = rowRect.y;
    const rowHeight = rowRect.height;
    const slotCount = row.slotCount;
    const spellNames = row.spellNames;

    // LEFT CELL — "Level N" label right-aligned at top, circles directly below.
    // Bumped 5 → 7pt and color #222 so the level anchors read at the
    // same weight as the new "Cantrips" label (user: "lvl too small").
    const labelRect: PdfRect = {
      x: rowRect.x,
      y: rowTop,
      width: leftCellW,
      height: labelH,
    };
    drawFittedText(ctx, `Level ${level}`, labelRect, {
      font: "Helvetica-Bold",
      maxSize: 7,
      minSize: 6.4,
      align: "right",
      color: "#222222",
      lineBreak: false,
    });

    // Circles sit directly below the right-aligned label, making the left cell a compact unit.
    const circleAreaTop = labelRect.y + labelRect.height + circleGapBelowLabel;
    const circleAreaBottom = rowRect.y + rowHeight;
    const circleY = Math.min(circleAreaBottom - circleSize, circleAreaTop);

    const markerTotalW = slotCount * (circleSize + circleGap) - circleGap;
    let markerCursorX = rowRect.x + leftCellW - markerTotalW; // right-align circles in left cell
    for (let i = 0; i < slotCount; i += 1) {
      const markerX = markerCursorX + circleSize / 2;
      strokeCircle(ctx, markerX, circleY + circleSize / 2, circleSize / 2, "#231f20", 0.5);
      markerCursorX += circleSize + circleGap;
    }

    // RIGHT CELL — spell names can wrap to two lines inside the full level row.
    const namesX = rowRect.x + leftCellW + SPELL_TEXT_GAP;
    const namesRect: PdfRect = {
      x: namesX,
      y: rowTop,
      width: rowRect.width - leftCellW - SPELL_TEXT_GAP,
      height: rowHeight,
    };
    drawCenteredTextInRect(ctx, spellNames === "—" && slotCount === 0 ? "" : spellNames, namesRect, {
      font: "Helvetica",
      maxSize: 6.4,
      minSize: 6.4,
      align: "left",
      color: "#222222",
      lineGap: SPELL_TEXT_LINE_GAP,
      lineBreak: true,
      ellipsis: false,
    });
  });
}

function getCombatSpellPanel(character: ResolvedPdfCharacter): PdfRect | null {
  const spellColumn = character.frontPage.combatHub.spellColumn;
  if (!character.frontPage.combatHub.hasSpells || !spellColumn) {
    return null;
  }
  const visibleLevels = spellColumn.spellsByLevel
    .filter((entry) => entry.spells.length > 0)
    .map((entry) => entry.level);
  if (spellColumn.cantrips.length === 0 && visibleLevels.length === 0) {
    return null;
  }
  const levelBands = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const rowsInTallestColumn = Math.max(
    0,
    ...levelBands.map((band) => band.filter((level) => visibleLevels.includes(level)).length),
  );
  return {
    ...FRONT_PAGE_REGIONS.combatSpells,
    height: Math.max(
      42,
      Math.min(FRONT_PAGE_REGIONS.combatSpells.height, 32 + rowsInTallestColumn * 15),
    ),
  };
}

function renderCombatSpellcastingHub(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const contentTopPad = 6;
  const contentBottomPad = 6;
  const attackRect = FRONT_PAGE_REGIONS.attacks;
  maskRect(ctx, attackRect);
  drawSvg(ctx, assets.generalContainer, attackRect);

  const attackContent = {
    x: attackRect.x + 9,
    y: attackRect.y + contentTopPad,
    width: attackRect.width - 18,
    height: attackRect.height - contentTopPad - contentBottomPad,
  };
  const combatHub = character.frontPage.combatHub;
  renderWeaponAttackRows(ctx, assets, attackContent, combatHub.weaponRows);

  if (!combatHub.hasSpells) {
    return;
  }

  const spellColumn = combatHub.spellColumn;
  if (!spellColumn) {
    return;
  }
  const spellPanel = getCombatSpellPanel(character);
  if (!spellPanel) {
    return;
  }
  maskRect(ctx, spellPanel);
  drawSvg(ctx, assets.generalContainer, spellPanel);
  const spellRect = {
    x: spellPanel.x + 9,
    y: spellPanel.y + 5,
    width: spellPanel.width - 18,
    height: spellPanel.height - 10,
  };
  const spellTargetBottomY = spellRect.y + spellRect.height;
  renderSpellTracker(ctx, assets, spellRect, spellColumn, character.spellCards, spellTargetBottomY);
}

function cardCategory(card: PdfPageCard) {
  const explicitGroup = card.tags.find((tag) => tag.startsWith("pdf-group:"))?.slice("pdf-group:".length);
  if (explicitGroup === "race") {
    return "Racial";
  }
  if (explicitGroup === "subrace") {
    return "Subracial";
  }
  if (explicitGroup === "class") {
    return "Class";
  }
  if (explicitGroup === "subclass") {
    return "Subclass";
  }
  if (explicitGroup === "feat") {
    return "Feat";
  }
  if (explicitGroup === "additional") {
    return "Additional";
  }
  if (explicitGroup === "other") {
    return "Other";
  }

  const text = `${card.title} ${card.summary} ${card.tags.join(" ")} ${card.sourceLabel ?? ""}`.toLowerCase();
  if (card.kind === "trait" || /\b(race|racial|subrace|lineage|dragonmark)\b/.test(text)) {
    return "Race";
  }
  if (/\b(subclass|college|archetype|circle|oath|patron|domain|tradition)\b/.test(text)) {
    return "Subclass";
  }
  if (/\b(feat|ability score improvement)\b/.test(text)) {
    return "Feat";
  }
  if (card.kind === "proficiency" || card.kind === "language") {
    return "Proficiency";
  }
  return "Class";
}

function normalizeFeatureActionHint(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }
  // Keep full text for all action types; just capitalize consistently
  return cleaned
    .replace(/\bfree action\b/i, "Free Action")
    .replace(/\bbonus action\b/i, "Bonus action")
    .replace(/\blegendary action\b/i, "Legendary Action")
    .replace(/\bfree object interaction\b/i, "Free Object Interaction")
    .replace(/\bobject interaction\b/i, "Object Interaction");
}

function parseFeatureActionHint(value: string, element?: { sheet?: { action?: string } }) {
  // Priority 1: structured sheet action field
  if (element?.sheet?.action) {
    const cleaned = cleanText(element.sheet.action);
    if (cleaned && /\b(action|reaction|object interaction)\b/i.test(cleaned)) {
      return normalizeFeatureActionHint(cleaned);
    }
  }
  // Priority 2: regex on value string
  const cleaned = cleanText(value);
  if (!cleaned || !/\b(action|reaction|object interaction)\b/i.test(cleaned)) {
    return undefined;
  }
  return normalizeFeatureActionHint(cleaned);
}

function normalizeFeatureRechargeHint(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  const normalized = cleaned.toLowerCase();
  if (normalized === "sr" || normalized === "short rest") {
    return "Short Rest";
  }
  if (normalized === "lr" || normalized === "long rest") {
    return "Long Rest";
  }
  if (normalized === "at will") {
    return "At Will";
  }
  return cleaned;
}

/**
 * Parse a usage string into recharge hint, charge display, or usage hint.
 * Handles common class feature placeholders like {{bardic-inspiration:count}} by
 * substituting the correct count based on character level.
 */
type FeatureUsageResult = {
  rechargeHint?: string;
  usageHint?: string;
  chargeDisplay?: {
    count?: number; // optional for "Unlimited" mode
    mode: "circles" | "number";
    label: string;
  };
};

function parseFeatureUsageHint(value: string, level = 1): FeatureUsageResult {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return {};
  }

  // Resolve level-dependent class feature placeholders before regex matching.
  // baseToken is the feature name, scaleToken is the sub-field (count, damage, etc.)
  const baseTokenMatch = cleaned.match(/\{\{([^:}]+):(\w+)\}\}/);
  let resolved = cleaned;

  if (baseTokenMatch) {
    const [, baseToken, scaleToken] = baseTokenMatch;

    if (baseToken === "bardic-inspiration" && scaleToken === "count") {
      resolved = resolved.replace(/\{\{bardic-inspiration:count\}\}/gi, String(Math.max(1, Math.floor((level + 1) / 2))));
    }
    if (baseToken === "barbarian rage" && scaleToken === "count") {
      // Rage uses: 2 (1-2), 3 (3-5), 4 (6-8), 5 (9-12), 6 (13-19), unlimited (20)
      if (level >= 20) {
        resolved = resolved.replace(/\{\{barbarian rage:count\}\}/gi, "unlimited");
      } else {
        const rageUses = level >= 13 ? 6 : level >= 9 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
        resolved = resolved.replace(/\{\{barbarian rage:count\}\}/gi, String(rageUses));
      }
    }
    if (baseToken === "barbarian rage" && scaleToken === "damage") {
      const rageDmg = level >= 16 ? 4 : level >= 9 ? 3 : 2;
      resolved = resolved.replace(/\{\{barbarian rage:damage\}\}/gi, String(rageDmg));
    }
    if (baseToken === "channel divinity") {
      // Cleric Channel Divinity: 1 (lvl 1-5), 2 (lvl 6-17), 3 (lvl 18+)
      const cdCount = level >= 18 ? 3 : level >= 6 ? 2 : 1;
      resolved = resolved.replace(/\{\{channel divinity:count\}\}/gi, String(cdCount));
    }
    if (baseToken === "divine sense") {
      // Divine Sense: 4 + charisma modifier (min 1 at low levels, roughly 4-6 at low-mid)
      const dsCount = Math.max(4, 4); // baseline 4 uses
      resolved = resolved.replace(/\{\{divine sense:count\}\}/gi, String(dsCount));
    }
    if (baseToken === "lay on hands") {
      // Lay on Hands: pool of 5 × paladin level (shown as pool, not count)
      // Show as "pool" text since it's not a per-use count
      resolved = resolved.replace(/\{\{lay on hands:hp pool\}\}/gi, "pool");
    }
    if (baseToken === "cleansing touch") {
      // Cleansing Touch: charisma modifier uses (min 1)
      const ctCount = Math.max(1, Math.floor((level - 1) / 4) + 1);
      resolved = resolved.replace(/\{\{cleansing touch:count\}\}/gi, String(ctCount));
    }
    if (baseToken === "indomitable" && scaleToken === "usage") {
      // Indomitable: 1 (lvl 9-13), 2 (lvl 14-19), 3 (lvl 20)
      const indomUses = level >= 20 ? 3 : level >= 14 ? 2 : level >= 9 ? 1 : 0;
      resolved = resolved.replace(/\{\{indomitable:usage\}\}/gi, String(indomUses));
    }
    if (baseToken === "war priest") {
      // War Priest: 2 uses at level 2, scales
      resolved = resolved.replace(/\{\{war priest:count\}\}/gi, "2");
    }
    if (baseToken === "wrath of the storm") {
      // Wrath of the Storm: 2 uses (wisdom modifier, but base 2)
      resolved = resolved.replace(/\{\{wrath of the storm:count\}\}/gi, "2");
    }
    if (baseToken === "warding flare") {
      // Warding Flare: 2 uses (wisdom modifier, base 2)
      resolved = resolved.replace(/\{\{warding flare:count\}\}/gi, "2");
    }
    if (baseToken === "flash of genius" && scaleToken === "usage") {
      // Flash of Genius: intelligence modifier uses per long rest
      const foUses = Math.max(1, Math.floor((level + 1) / 2));
      resolved = resolved.replace(/\{\{flash of genius:usage\}\}/gi, String(foUses));
    }
  }

  if (/^at will$/i.test(resolved)) {
    return { rechargeHint: "At Will" };
  }

  if (/^unlimited$/i.test(resolved)) {
    return {
      chargeDisplay: {
        mode: "number" as const,
        label: "Unlimited",
      },
    };
  }

  if (/^pool$/i.test(resolved)) {
    // Pool-based resource (e.g., Lay on Hands) — no per-rest count circles
    return { rechargeHint: "Long Rest" };
  }

  const chargesWithRecharge = resolved.match(/^(\d+)\s*(?:uses?)?\s*\/\s*(.+)$/i);
  if (chargesWithRecharge) {
    const count = Number.parseInt(chargesWithRecharge[1], 10);
    if (Number.isFinite(count)) {
      return {
        rechargeHint: normalizeFeatureRechargeHint(chargesWithRecharge[2]),
        chargeDisplay: {
          count,
          mode: count < 7 ? "circles" as const : "number" as const,
          label: `${count}`,
        },
      };
    }
  }

  const chargesOnly = resolved.match(/^(\d+)\s*(?:uses?)?$/i);
  if (chargesOnly) {
    const count = Number.parseInt(chargesOnly[1], 10);
    if (Number.isFinite(count)) {
      return {
        chargeDisplay: {
          count,
          mode: count < 7 ? "circles" as const : "number" as const,
          label: `${count}`,
        },
      };
    }
  }

  const rechargeOnly = normalizeFeatureRechargeHint(cleaned); // use original cleaned for recharge hints (no placeholder)
  if (rechargeOnly && rechargeOnly !== cleaned) {
    return { rechargeHint: rechargeOnly };
  }

  return {
    usageHint: cleaned,
  };
}

/** Stub — parseFeatureUsageHint is now the full implementation */
function parseFeatureUsageHintRaw(_value: string): FeatureUsageResult {
  return {};
}

function summarizeCardParts(
  title: string,
  category: string,
  summary: string,
  detail: string | undefined,
  tags: string[],
  kind: FeatureSummary["kind"],
  element?: { sheet?: { action?: string } },
  level = 5,
) {
  const parts = summary
    .split(" | ")
    .map((part) => cleanText(part))
    .filter(Boolean);
  let actionHint: string | undefined;
  let rechargeHint: string | undefined;
  let usageHint: string | undefined;
  let chargeDisplay: FeatureSummary["chargeDisplay"];
  let body = "";

  if (parts.length >= 3) {
    actionHint = parseFeatureActionHint(parts[0], element);
    const parsedUsage = parseFeatureUsageHint(parts[1], level);
    rechargeHint = parsedUsage.rechargeHint;
    usageHint = parsedUsage.usageHint;
    chargeDisplay = parsedUsage.chargeDisplay;
    body = cleanText(parts.slice(2).join(" | "));
  } else if (parts.length === 2) {
    const parsedAction = parseFeatureActionHint(parts[0], element);
    const parsedUsage = parseFeatureUsageHint(parts[0], level);
    const hasUsageMeta = Boolean(parsedUsage.rechargeHint || parsedUsage.usageHint || parsedUsage.chargeDisplay);

    if (parsedAction) {
      actionHint = parsedAction;
      const parsedSecondaryUsage = parseFeatureUsageHint(parts[1], level);
      const hasSecondaryUsageMeta = Boolean(
        parsedSecondaryUsage.rechargeHint || parsedSecondaryUsage.usageHint || parsedSecondaryUsage.chargeDisplay,
      );
      if (hasSecondaryUsageMeta) {
        rechargeHint = parsedSecondaryUsage.rechargeHint;
        usageHint = parsedSecondaryUsage.usageHint;
        chargeDisplay = parsedSecondaryUsage.chargeDisplay;
        body = cleanText(detail || summary || "");
      } else {
        body = cleanText(parts[1]);
      }
    } else if (hasUsageMeta) {
      rechargeHint = parsedUsage.rechargeHint;
      usageHint = parsedUsage.usageHint;
      chargeDisplay = parsedUsage.chargeDisplay;
      body = cleanText(parts[1]);
    } else {
      body = cleanText(parts.join(" | "));
    }
  } else if (parts.length === 1) {
    body = cleanText(parts[0]);
  }

  if (!body) {
    body = cleanText(detail || summary || "");
  }

  if (usageHint) {
    body = cleanText(body ? `${body} (${usageHint})` : usageHint);
  }

  return {
    title: cleanText(title, "Feature"),
    category,
    body,
    kind,
    actionHint,
    rechargeHint,
    usageHint,
    chargeDisplay,
    tags,
  } satisfies FeatureSummary;
}

function summarizeCard(card: PdfPageCard, level = 5): FeatureSummary {
  return summarizeCardParts(
    card.title,
    cardCategory(card),
    card.summary || "",
    card.detail,
    card.tags || [],
    card.kind ?? "class",
    card.sourceAction ? { sheet: { action: card.sourceAction } } : undefined,
    level,
  );
}

/** Section-level layout config shared between measure and render passes */
interface FeatureLayoutConfig {
  bodyMaxSize: number;
  bodyMinSize: number;
  lineGap: number;
  featureGap: number;
  bottomPadding: number;
  compact: boolean;
}

const DEFAULT_FEATURE_CONFIG: FeatureLayoutConfig = {
  bodyMaxSize: FEATURE_CARD_TYPOGRAPHY.body.max,
  bodyMinSize: FEATURE_CARD_TYPOGRAPHY.body.min,
  lineGap: 1.2,
  featureGap: FEATURE_CARD_TYPOGRAPHY.separatorGap,
  // Round-28 #4: tighter bottom padding inside feature card groups.
  // User feedback: 'less padding on top and bottom'. Reduced 10 → 6.
  bottomPadding: 6,
  compact: false,
};

const MIN_FEATURE_CONFIG: FeatureLayoutConfig = {
  bodyMaxSize: 4.2,
  // Minimum body font size floor for print legibility.
  // 4.0pt ensures text remains readable when printed at standard resolution;
  // 3.0 was too small to render clearly on most consumer printers.
  bodyMinSize: 4.0,
  lineGap: 0.8,
  // Round-28 #4: tighter feature gap in the emergency-min config too.
  featureGap: 3,
  // Round-28 #4: tighter bottom padding in emergency-min config too.
  bottomPadding: 5,
  compact: true,
};

function summarizeCompactTraitCard(card: PdfRightColumnCompactTrait) {
  // Propagate the source kind so RACIAL_CARD_TYPOGRAPHY (13pt title)
  // actually fires for racial/subclass/subracial/feat cards instead
  // of collapsing to the 8.5pt trait typography. Plain traits keep
  // the smaller inline-header style.
  const kind = card.kind ?? "trait";
  return summarizeCardParts(card.title, "Trait", card.summary, undefined, [], kind);
}

function getFeatureMetaWidth(width: number, summary: FeatureSummary) {
  if (!summary.actionHint && !summary.rechargeHint && !summary.chargeDisplay) {
    return 0;
  }

  // Estimate width: action hint (max 14 wide) + " / " + recharge hint + circles (3.5 each)
  const actionWidth = summary.actionHint ? Math.min(18, width * 0.08) : 0;
  const rechargeWidth = summary.rechargeHint ? Math.min(14, width * 0.06) : 0;
  const circleWidth = summary.chargeDisplay?.count
    ? Math.min(12, summary.chargeDisplay.count * 2.2 + 2)
    : 0;
  const sepWidth = summary.actionHint && (summary.rechargeHint || summary.chargeDisplay) ? 3 : 0;

  return Math.max(
    FEATURE_CARD_TYPOGRAPHY.metaWidth.min,
    Math.min(FEATURE_CARD_TYPOGRAPHY.metaWidth.max, actionWidth + sepWidth + rechargeWidth + circleWidth),
  );
}

function drawFeatureChargeDisplay(
  ctx: PdfRenderContext,
  rect: PdfRect,
  chargeDisplay: NonNullable<FeatureSummary["chargeDisplay"]>,
) {
  if (chargeDisplay.mode === "number" || !chargeDisplay.count) {
    drawFittedText(ctx, chargeDisplay.label, rect, {
      font: "Helvetica-Bold",
      maxSize: FEATURE_CARD_TYPOGRAPHY.charges.max,
      minSize: FEATURE_CARD_TYPOGRAPHY.charges.min,
      align: "right",
      color: "#111111",
      lineBreak: false,
    });
    return;
  }

  const circleDiameter = FEATURE_CARD_TYPOGRAPHY.circleRadius * 2;
  const totalWidth =
    chargeDisplay.count * circleDiameter +
    Math.max(0, chargeDisplay.count - 1) * FEATURE_CARD_TYPOGRAPHY.circleGap;
  let cursorX = rect.x + Math.max(0, rect.width - totalWidth);
  const centerY = rect.y + rect.height / 2;

  for (let index = 0; index < chargeDisplay.count; index += 1) {
    strokeCircle(
      ctx,
      cursorX + FEATURE_CARD_TYPOGRAPHY.circleRadius,
      centerY,
      FEATURE_CARD_TYPOGRAPHY.circleRadius,
      COLORS.stroke,
      0.45,
    );
    cursorX += circleDiameter + FEATURE_CARD_TYPOGRAPHY.circleGap;
  }
}

/**
 * Draw meta block (action hint + recharge + circles) all on one line.
 * Parts are ordered left-to-right: [action] [recharge] [circles].
 * All text parts are aligned to the same baseline (rect.y + fontAscent).
 * 1.5pt gap between each consecutive part.
 * Returns the total row height (titleRowHeight + bodyTopPad).
 */
function drawFeatureMetaBlock(
  ctx: PdfRenderContext,
  summary: FeatureSummary,
  rect: PdfRect,
) {
  if (!summary.actionHint && !summary.rechargeHint && !summary.chargeDisplay) {
    return FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
  }

  // Build parts in rendering order: action | recharge | circles
  interface MetaPart {
    label: string;
    isCircles?: true;
    count?: number;
    width: number;
  }
  const parts: MetaPart[] = [];
  const metaFSize = FEATURE_CARD_TYPOGRAPHY.meta.max;
  // Font ascent (baseline offset) for Helvetica at this size — approximates cap-height alignment
  const fontAscent = metaFSize * 0.72;

  // Action hint (leftmost)
  if (summary.actionHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(metaFSize);
    const w = ctx.doc.widthOfString(summary.actionHint);
    ctx.doc.restore();
    parts.push({ label: summary.actionHint, width: w });
  }
  // Recharge hint (middle)
  if (summary.rechargeHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica").fontSize(metaFSize);
    const w = ctx.doc.widthOfString(summary.rechargeHint);
    ctx.doc.restore();
    parts.push({ label: summary.rechargeHint, width: w });
  }
  // Circles (rightmost)
  if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
    const circleD = Math.min(4.5, rect.width * 0.07); // matches larger circles in drawFeatureMetaBlock
    const circleGap = 1.2;
    const totalCirclesWidth = summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap;
    parts.push({ label: summary.chargeDisplay.label, isCircles: true, count: summary.chargeDisplay.count, width: totalCirclesWidth });
  }

  if (parts.length === 0) {
    return FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
  }

// Layout: space parts left-to-right across rect.width.
  // All elements (title, meta text, circles) share the SAME visual center: rect.y + rect.height / 2.
  // Title baseline = rect.y; title center = rect.y + titleRowHeight/2.
  // Meta text: baseline = rect.y + rect.height/2 - metaCapHeight/2 (centers meta cap-height on row center).
  // Circles: center = rect.y + rect.height/2 (centers circle on row center).
  const partGap = 1.5;
  let cursorX = rect.x; // left edge of meta area (caller positions this after title)
  const rowCenter = rect.y + rect.height / 2;
  const metaCapHeight = metaFSize * 0.72;
  const circleCenterBaseline = rowCenter; // circles centered on row visual center
  const metaTextBaseline = rowCenter - metaCapHeight / 2; // meta cap-height centered on row center

  for (const part of parts) {
    if (part.isCircles && part.count !== undefined) {
      // Circles: center vertically on the row center
      const circleD = Math.min(4.5, rect.width * 0.07); // larger circles for readability
      const circleGap = 1.2;
      for (let c = 0; c < part.count; c += 1) {
        const cx = cursorX + c * (circleD + circleGap) + circleD / 2;
        const cy = circleCenterBaseline;
        strokeCircle(ctx, cx, cy, circleD / 2, "#888888", 0.45);
      }
      cursorX += part.width + partGap;
    } else {
      // Draw text part with cap-height centered on the row center
      const isAction = part.label === summary.actionHint;
      ctx.doc.save();
      ctx.doc.font(isAction ? "Helvetica-Bold" : "Helvetica").fontSize(metaFSize).fillColor(isAction ? "#444444" : "#555555");
      ctx.doc.text(part.label, cursorX, metaTextBaseline, { lineBreak: false });
      ctx.doc.restore();
      cursorX += part.width + partGap;
    }
  }

  return FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
}

function getAdaptiveFeatureColumnCount(cards: PdfPageCard[], width: number, level = 5) {
  if (width < 180 || cards.length < 4) {
    return 1;
  }

  const summaries = cards.map(summarizeCard);
  const averageBodyLength =
    summaries.reduce((total, summary) => total + summary.body.length, 0) / Math.max(1, summaries.length);
  const shortBodies = summaries.filter((summary) => summary.body.length <= 120).length;
  return averageBodyLength <= 80 && shortBodies >= Math.ceil(summaries.length * 0.65) ? 2 : 1;
}

/** Compute the effective config to use, running a fit pass to ensure all groups fit in rect.height.
 *  After fitting, if there's spare vertical space, scale up bodyMaxSize for better readability.
 *  Low-level chars with few features get larger text; high-level with many features get smaller.
 */
function computeFitConfig(
  ctx: PdfRenderContext,
  groups: ReturnType<typeof buildFeatureDeckGroups>,
  rect: PdfRect,
  columnCount: number,
  gap: number,
  cellWidth: number,
  level = 5,
): FeatureLayoutConfig {
  let config = { ...DEFAULT_FEATURE_CONFIG };
  // Max iterations: reduce lineGap, then bodyMaxSize
  for (let iter = 0; iter < 20; iter++) {
    const listW = cellWidth - 10;
    const colHeights = new Array(columnCount).fill(0);
    groups.forEach((g) => {
      const listRect = { x: 0, y: 0, width: listW, height: rect.height };
      const contentH = measureFeatureListHeightWithConfig(
        ctx,
        g.cards,
        listRect,
        config,
        getAdaptiveFeatureColumnCount(g.cards, listRect.width, level),
        level,
      );
      const minCol = idxForShortestColumn(colHeights);
      const groupHeight = contentH + config.bottomPadding;
      colHeights[minCol] += (colHeights[minCol] > 0 ? gap : 0) + groupHeight;
    });
    const maxBottom = Math.max(...colHeights);
    if (maxBottom <= rect.height) break;
    if (config.lineGap > MIN_FEATURE_CONFIG.lineGap + 0.1) {
      config = { ...config, lineGap: Math.max(MIN_FEATURE_CONFIG.lineGap, config.lineGap - 0.2) };
    } else if (config.bodyMaxSize > MIN_FEATURE_CONFIG.bodyMaxSize + 0.1) {
      config = {
        ...config,
        bodyMaxSize: Math.max(MIN_FEATURE_CONFIG.bodyMaxSize, config.bodyMaxSize - 0.5),
        bodyMinSize: Math.min(config.bodyMinSize, Math.max(MIN_FEATURE_CONFIG.bodyMinSize, config.bodyMinSize - 0.3)),
      };
    } else {
      config = { ...MIN_FEATURE_CONFIG };
      break;
    }
  }

  // Post-fit: measure actual usage with the minimum config that fits.
  // If there's spare vertical space, scale up bodyMaxSize for better readability.
  const listW = cellWidth - 10;
  const measuredHeights = groups.map((g) => {
    const listRect = { x: 0, y: 0, width: listW, height: rect.height };
    return measureFeatureListHeightWithConfig(
      ctx,
      g.cards,
      listRect,
      config,
      getAdaptiveFeatureColumnCount(g.cards, listRect.width, level),
      level,
    );
  });

  const maxBottom = Math.max(...measuredHeights) + config.bottomPadding;
  const usageRatio = maxBottom / rect.height;

  // Scale up bodyMaxSize if there's breathing room (content uses < 85% of available height)
  // Round-26 #9: lowered hard ceiling 8.0 → 5.5pt to keep feature
  // bodies visually smaller per user feedback. With the breathing-room
  // scaler still active, a feature card with very little content
  // could otherwise balloon back up to 8pt.
  if (usageRatio < 0.85 && config.bodyMaxSize < 5.5) {
    // How much headroom do we have?
    const headroomRatio = 1 / Math.max(0.3, usageRatio); // e.g., 0.5 → 2x headroom
    const scaledSize = Math.min(
      5.5, // hard ceiling (round-26 #9)
      Math.max(config.bodyMaxSize + 0.5, config.bodyMaxSize * Math.min(1.3, headroomRatio)),
    );
    const minSize = Math.max(MIN_FEATURE_CONFIG.bodyMinSize, scaledSize - 1.0);
    config = { ...config, bodyMaxSize: scaledSize, bodyMinSize: minSize };
  }

  return config;
}

/** Measure feature list height using a given config, with paired feature support. */
function measureFeatureListHeightWithConfig(
  ctx: PdfRenderContext,
  cards: PdfPageCard[],
  rect: PdfRect,
  cfg: FeatureLayoutConfig,
  columns = 1,
  level = 5,
): number {
  const summaries = cards.map((card) => summarizeCard(card, level));
  const columnRects = splitColumns(rect, columns, 12);
  const cursors = columnRects.map(() => 0);
  const maxW = columnRects[0]?.width ?? rect.width;
  const fSize = cfg.bodyMaxSize * 0.85;
  const lineH = fSize + cfg.lineGap;

  let idx = 0;
  while (idx < summaries.length) {
    const summary = summaries[idx];
    const columnIndex = idxForShortestColumn(cursors);

    // Check if this feature can be paired with the next one
    const canPair = (
      columns === 1 &&
      idx + 1 < summaries.length &&
      summary.body.length <= 200 &&
      summaries[idx + 1].body.length <= 200
    );

    if (canPair) {
      const nextSummary = summaries[idx + 1];
      const colGap = 8;
      const colWidth = (maxW - colGap) / 2;

      // Measure height of both features (use max)
      const h1 = measureSingleCardHeight(ctx, summary, colWidth, fSize, lineH, cfg);
      const h2 = measureSingleCardHeight(ctx, nextSummary, colWidth, fSize, lineH, cfg);
      const cardHeight = Math.max(h1, h2);
      cursors[columnIndex] += cardHeight + cfg.featureGap;
      idx += 2;
    } else {
      const cardHeight = measureSingleCardHeight(ctx, summary, maxW, fSize, lineH, cfg);
      cursors[columnIndex] += cardHeight + cfg.featureGap;
      idx += 1;
    }
  }

  return Math.max(30, Math.max(...cursors) - cfg.featureGap + 10);
}

/** Measure height of a single feature card. Returns total height used by header + body. */
function measureSingleCardHeight(
  ctx: PdfRenderContext,
  summary: FeatureSummary,
  width: number,
  fSize: number,
  lineH: number,
  cfg: FeatureLayoutConfig,
): number {
  const typo = cardTypography(summary.kind);
  const titleFSize = typo.title.max;
  const metaFSize = typo.meta.max;

  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const renderedTitleWidth = ctx.doc.widthOfString(summary.title.toUpperCase());
  ctx.doc.restore();

  // Measure meta widths
  let totalMetaWidth = 0;
  if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
    const circleD = Math.min(2.2, width * 0.04);
    const circleGap = 0.8;
    totalMetaWidth += summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap + 2;
  }
  if (summary.rechargeHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.rechargeHint) + 2;
    ctx.doc.restore();
  }
  if (summary.actionHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
    ctx.doc.restore();
  }

  const gapAfterTitle = 4;
  const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
  const singleRowFits = hasMeta && (renderedTitleWidth + gapAfterTitle + totalMetaWidth <= width);

  const bodyCharsPerLine = Math.max(18, Math.floor(width / Math.max(2.2, fSize * 0.52)));
  const bodyLines = Math.max(1, Math.ceil(summary.body.length / bodyCharsPerLine));
  const bodyHeight = bodyLines * lineH;

  if (singleRowFits) {
    return typo.titleRowHeight + typo.bodyTopPad + bodyHeight;
  } else {
    return typo.titleRowHeight + typo.metaRowHeight + typo.bodyTopPad + bodyHeight;
  }
}

/** Draw text with action-economy words bolded: bonus action, reaction, action. Returns { cursorY } for height measurement. */
function drawTextWithBoldActionWords(
  ctx: PdfRenderContext,
  text: string,
  opts: { x: number; y: number; width: number; height: number; fontSize: number; minFontSize: number; color: string; lineGap: number },
): { cursorY: number } {
  interface TextRun {
    text: string;
    bold: boolean;
  }
  // Tokenize: longest phrase first, case-insensitive. Strip markdown
  // ** / * / ` markers first so bold-tagged source text ("use your
  // **action** and...") doesn't leave the asterisks visible in the
  // output — the marker is the signal, not content.
  const stripped = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const tokens: TextRun[] = [];
  const actionWords: [string][] = [
    // Order: longest phrases first so multi-word phrases win over
    // their standalone components (e.g. "bonus action" matches
    // before a bare "action" suffix). Round-21 expansion per user
    // request: players scan item and feature descriptions for
    // action-economy cues first — bold the trigger terms inline so
    // they pop visually. Added: opportunity attack, legendary
    // resistance, action surge, free action, advantage,
    // disadvantage, saving throw, spell slot/slots, check. Same
    // list mirrored in page2-renderer.ts ACTION_WORD_PHRASES.
    ["free object interaction"],
    ["object interaction"],
    ["opportunity attack"],
    ["ranged weapon attack"],
    ["melee weapon attack"],
    ["ranged spell attack"],
    ["melee spell attack"],
    ["legendary resistance"],
    ["legendary action"],
    ["lair action"],
    ["action surge"],
    ["bonus action"],
    ["unarmed strike"],
    ["ranged attack"],
    ["ranged strike"],
    ["melee attack"],
    ["weapon attack"],
    ["cast a spell"],
    ["spell attack"],
    ["attack action"],
    ["saving throw"],
    ["use an object"],
    ["free action"],
    ["advantage"],
    ["disadvantage"],
    ["spell slot"],
    ["spell slots"],
    ["reaction"],
    ["grapple"],
    ["shove"],
    ["dash"],
    ["disengage"],
    ["dodge"],
    ["help"],
    ["hide"],
    ["ready"],
    ["search"],
    ["attack"],
    ["action"],
    ["move"],
    ["movement"],
    ["check"],
  ];
  let remaining = stripped;
  while (remaining.length > 0) {
    let matched = false;
    for (const [phrase] of actionWords) {
      const idx = remaining.toLowerCase().indexOf(phrase);
      if (idx !== -1) {
        if (idx > 0) tokens.push({ text: remaining.slice(0, idx), bold: false });
        tokens.push({ text: remaining.slice(idx, idx + phrase.length), bold: true });
        remaining = remaining.slice(idx + phrase.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: remaining, bold: false });
      break;
    }
  }
  // Merge adjacent bold/non-bold runs
  const runs: TextRun[] = [];
  for (const token of tokens) {
    const prev = runs[runs.length - 1];
    if (prev && prev.bold === token.bold) {
      prev.text += token.text;
    } else {
      runs.push({ ...token });
    }
  }

  // Render runs sequentially, wrapping lines manually
  const fSize = Math.max(opts.minFontSize, opts.fontSize * 0.85);
  const lineH = fSize + opts.lineGap;
  let cursorY = opts.y;
  let lineX = opts.x;
  let lineRemaining = opts.width;
  const maxW = opts.width;
  const doc = ctx.doc;

  interface RenderedRun {
    text: string;
    bold: boolean;
    width: number;
  }

  for (const run of runs) {
    const words = run.text.split(/(\s+)/);
    for (const w of words) {
      if (w.length === 0) continue;
      // Round-28 #3: body uses Magra-Regular (the same physical
      // font as the bold runs, just the Regular weight). Both
      // face variants share sTypoAscender=968 per TTF OS/2 so
      // baselines align naturally — no Y offset needed. Previous
      // 'Helvetica' alias mapped to Magra-Regular too, but the
      // font-family switch from 'Helvetica' to 'Magra-Bold' is
      // fine here because they are both Magra family under the
      // hood (per generate.ts registerFont lines 215-216).
      const wordFont = run.bold ? "Magra-Bold" : "Magra";
      doc.save();
      doc.font(wordFont).fontSize(fSize);
      const w2 = doc.widthOfString(w);
      doc.restore();

      if (lineX + w2 > opts.x + maxW && lineX > opts.x) {
        // Start new line
        cursorY += lineH;
        lineX = opts.x;
        lineRemaining = maxW;
      }

// Render this run with lineBreak: false to prevent PDFKit auto page breaks.
// Round-28 #3: REMOVE the -2.4pt hardcoded Y lift for bold runs.
// User feedback: 'these bolded items should all be a bit lower to
// be in-line I guess, but we should not make this hardcoded, they
// are part of the same sentence, same text, same font, same size,
// same everything'. Both Magra-Regular and Magra-Bold share the
// same sTypoAscender=968 in TTF OS/2, so PDFKit positions their
// baselines at the same Y — no offset needed. Previous
// compensation was for a font-family switch (Teko-Medium vs
// Magra-Regular) on page 2; on the front page the round-15/-21
// lifts were unnecessary even before this round since both fonts
// are Magra. Trust the font metrics; the bold word will sit in
// the same visual band as the body word.
      if (cursorY > opts.y + opts.height) break;
      doc.save();
      doc.font(wordFont).fontSize(fSize).fillColor(opts.color).text(w, lineX, cursorY, { lineBreak: false });
      doc.restore();
      lineX += w2;
      lineRemaining -= w2;
    }
  }
  return { cursorY };
}

/** Returns header height and body height for a paired feature card */
function getPairedFeatureHeights(
  ctx: PdfRenderContext,
  summary: FeatureSummary,
  width: number,
  bodyMaxSize: number,
  bodyMinSize: number,
): { headerH: number; bodyH: number } {
  const typo = cardTypography(summary.kind);
  const titleFSize = typo.title.max;
  const metaFSize = typo.meta.max;
  const fSize = Math.max(bodyMinSize, bodyMaxSize * 0.85);
  const lineH = fSize + 1.2;

  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const renderedTitleWidth = ctx.doc.widthOfString(summary.title.toUpperCase());
  ctx.doc.restore();

  let totalMetaWidth = 0;
  if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
    const circleD = Math.min(4.5, width * 0.07); // matches larger circles in drawFeatureMetaBlock
    const circleGap = 1.2;
    totalMetaWidth += summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap + 2;
  }
  if (summary.rechargeHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.rechargeHint) + 2;
    ctx.doc.restore();
  }
  if (summary.actionHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
    ctx.doc.restore();
  }

  const gapAfterTitle = 4;
  const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
  const singleRowFits = hasMeta && (renderedTitleWidth + gapAfterTitle + totalMetaWidth <= width);

  const bodyCharsPerLine = Math.max(18, Math.floor(width / Math.max(2.2, fSize * 0.52)));
  const bodyLines = Math.max(1, Math.ceil(summary.body.length / bodyCharsPerLine));

  if (singleRowFits) {
    const headerH = typo.titleRowHeight + typo.bodyTopPad;
    return { headerH, bodyH: bodyLines * lineH };
  } else {
    const headerH = typo.titleRowHeight + typo.metaRowHeight + typo.bodyTopPad;
    return { headerH, bodyH: bodyLines * lineH };
  }
}

/** Draw a paired feature card. Returns the y-coordinate where the body text ends. */
function drawPairedFeatureFull(
  ctx: PdfRenderContext,
  summary: FeatureSummary,
  x: number,
  y: number,
  width: number,
  bodyMaxSize: number,
  bodyMinSize: number,
  cfg: FeatureLayoutConfig,
): number {
  const typo = cardTypography(summary.kind);
  const titleFSize = typo.title.max;
  const metaFSize = typo.meta.max;

  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const renderedTitleWidth = ctx.doc.widthOfString(summary.title.toUpperCase());
  ctx.doc.restore();

  let totalMetaWidth = 0;
  if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
    const circleD = Math.min(4.5, width * 0.07);
    const circleGap = 1.2;
    totalMetaWidth += summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap + 2;
  }
  if (summary.rechargeHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.rechargeHint) + 2;
    ctx.doc.restore();
  }
  if (summary.actionHint) {
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(metaFSize);
    totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
    ctx.doc.restore();
  }

  const gapAfterTitle = 4;
  const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
  const singleRowFits = hasMeta && (renderedTitleWidth + gapAfterTitle + totalMetaWidth <= width);

  let bodyTopOffset: number;
  if (singleRowFits) {
    bodyTopOffset = typo.titleRowHeight + typo.bodyTopPad;
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
    ctx.doc.text(summary.title.toUpperCase(), x, y, { lineBreak: false });
    ctx.doc.restore();

    const metaStartX = x + renderedTitleWidth + gapAfterTitle;
    const metaAvailableWidth = Math.max(4, width - renderedTitleWidth - gapAfterTitle);
    drawFeatureMetaBlock(ctx, summary, {
      x: metaStartX, y, width: metaAvailableWidth, height: typo.titleRowHeight,
    });
  } else {
    // Two-row: title, then meta row, then body.
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
    ctx.doc.text(summary.title.toUpperCase(), x, y, { lineBreak: false });
    ctx.doc.restore();

    if (hasMeta) {
      const metaRowY = y + typo.titleRowHeight;
      drawFeatureMetaBlock(ctx, summary, {
        x, y: metaRowY, width, height: typo.metaRowHeight,
      });
    }
    bodyTopOffset =
      typo.titleRowHeight +
      (hasMeta ? typo.metaRowHeight : 0) +
      typo.bodyTopPad;
  }

  // Draw body text — use rect.y + rect.height as absolute bottom boundary
  const bodyY = y + bodyTopOffset;
  const computedFSize = Math.max(bodyMinSize, bodyMaxSize * 0.85);
  const computedLineH = computedFSize + cfg.lineGap;
  const bodyResult = drawTextWithBoldActionWords(ctx, summary.body, {
    x, y: bodyY, width, height: 9999,
    fontSize: bodyMaxSize, minFontSize: bodyMinSize, color: "#111111", lineGap: cfg.lineGap,
  });
  // Return the actual bottom of drawn text + one line breathing room
  return bodyResult.cursorY - bodyY + computedLineH > 0 ? bodyResult.cursorY + computedLineH : bodyY;
}

function renderFeatureList(ctx: PdfRenderContext, cards: PdfPageCard[], rect: PdfRect, columns: number, compactOrConfig?: boolean | FeatureLayoutConfig, level?: number) {
  let cfg: FeatureLayoutConfig = DEFAULT_FEATURE_CONFIG;
  if (typeof compactOrConfig === "object" && compactOrConfig !== null) {
    cfg = compactOrConfig as FeatureLayoutConfig;
  }
  const summaries = cards.map((card) => summarizeCard(card, level));
  const columnRects = splitColumns(rect, columns, columns > 1 ? 12 : 16);
  // Use column.height from rect (full available height), not cursor.y (modified per feature)
  const fullColumnHeight = columnRects[0].height;
  const cursors = columnRects.map((column) => ({ ...column, y: column.y }));

  // Scan ahead: pair up consecutive short features (<=200 chars each) for side-by-side layout.
  // Only in single-column mode with 3+ cards remaining (need at least 2 to pair).
  let i = 0;
  while (i < summaries.length) {
    const summary = summaries[i];
    const isLast = (i === summaries.length - 1);
    const columnIndex = idxForShortestColumn(cursors.map((entry) => entry.y));
    const column = cursors[columnIndex];
    const bodyMaxSize = cfg.bodyMaxSize;
    const bodyMinSize = cfg.bodyMinSize;

    // Check if we can pair this feature with the next one
    const canPair = (
      columns === 1 &&
      !isLast &&
      summary.body.length <= 200 &&
      summaries[i + 1].body.length <= 200
    );

    if (canPair) {
      // Draw two features side-by-side in the same row
      const nextSummary = summaries[i + 1];
      const colGap = 8;
      const colWidth = (column.width - colGap) / 2;

      // Draw both features, get actual rendered bottom y for each
      const end1 = drawPairedFeatureFull(ctx, summary, column.x, column.y, colWidth, bodyMaxSize, bodyMinSize, cfg);
      const end2 = drawPairedFeatureFull(ctx, nextSummary, column.x + colWidth + colGap, column.y, colWidth, bodyMaxSize, bodyMinSize, cfg);

      // Separator at max of both actual bottoms
      const separatorY = Math.max(end1, end2);
      ctx.doc.save();
      ctx.doc.strokeColor("#bdbdbd").lineWidth(0.5)
        .moveTo(column.x, separatorY).lineTo(column.x + column.width, separatorY).stroke();
      ctx.doc.restore();
      column.y = separatorY + (cfg.featureGap);

      i += 2; // skip both paired cards
    } else {
      // Draw single feature card
      const typo = cardTypography(summary.kind);
      const titleFSize = typo.title.max;
      const metaFSize = typo.meta.max;

      ctx.doc.save();
      ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
      const renderedTitleWidth = ctx.doc.widthOfString(summary.title.toUpperCase());
      ctx.doc.restore();

      // Measure meta widths
      let totalMetaWidth = 0;
      if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
        const circleD = Math.min(4.5, column.width * 0.07); // matches larger circles in drawFeatureMetaBlock
        const circleGap = 1.2;
        totalMetaWidth += summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap + 2;
      }
      if (summary.rechargeHint) {
        ctx.doc.save();
        ctx.doc.font("Helvetica").fontSize(metaFSize);
        totalMetaWidth += ctx.doc.widthOfString(summary.rechargeHint) + 2;
        ctx.doc.restore();
      }
      if (summary.actionHint) {
        ctx.doc.save();
        ctx.doc.font("Helvetica-Bold").fontSize(metaFSize);
        totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
        ctx.doc.restore();
      }

      const gapAfterTitle = 4;
      const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
      const singleRowFits = hasMeta && (renderedTitleWidth + gapAfterTitle + totalMetaWidth <= column.width);

      if (singleRowFits) {
        // Single-row: title left, meta right after. Always use fixed offset so body starts below header.
        // The meta text is drawn above rect.y (aligned to title cap-height) but body always starts below header row.
        const bodyTopOffset = typo.titleRowHeight + typo.bodyTopPad;
        ctx.doc.save();
        ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
        ctx.doc.text(summary.title.toUpperCase(), column.x, column.y, { lineBreak: false });
        ctx.doc.restore();

        const metaStartX = column.x + renderedTitleWidth + gapAfterTitle;
        const metaAvailableWidth = Math.max(4, column.width - renderedTitleWidth - gapAfterTitle);
        drawFeatureMetaBlock(ctx, summary, {
          x: metaStartX, y: column.y, width: metaAvailableWidth, height: typo.titleRowHeight,
        });

        const bodyResult = drawTextWithBoldActionWords(ctx, summary.body, {
          x: column.x, y: column.y + bodyTopOffset, width: column.width,
          height: Math.max(6, (rect.y + rect.height) - (column.y + bodyTopOffset) - (isLast ? 2 : 0)),
          fontSize: bodyMaxSize, minFontSize: bodyMinSize, color: "#111111", lineGap: cfg.lineGap,
        });
        const computedFSize = Math.max(bodyMinSize, bodyMaxSize * 0.85);
        const computedLineH = computedFSize + cfg.lineGap;
        // Add 1 line of breathing room below body so text never clips at the divider
        const bodyStartY = column.y + bodyTopOffset;
        const bodyHeight = bodyResult.cursorY - bodyStartY + computedLineH;
        const separatorY = bodyStartY + bodyHeight;
        ctx.doc.save();
        ctx.doc.strokeColor("#bdbdbd").lineWidth(0.5)
          .moveTo(column.x, separatorY).lineTo(column.x + column.width, separatorY).stroke();
        ctx.doc.restore();
        column.y = separatorY + (isLast ? 0 : cfg.featureGap);
      } else {
        // Two-row: title full width, meta below (if meta exists)
        ctx.doc.save();
        ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
        ctx.doc.text(summary.title.toUpperCase(), column.x, column.y, { lineBreak: false });
        ctx.doc.restore();

        const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
        if (hasMeta) {
          const metaRowY = column.y + typo.titleRowHeight;
          drawFeatureMetaBlock(ctx, summary, {
            x: column.x, y: metaRowY, width: column.width, height: typo.metaRowHeight,
          });
          column.y = metaRowY + typo.metaRowHeight + typo.bodyTopPad;
        } else {
          // No meta — body starts at titleRowHeight + bodyTopPad from original y
          column.y += typo.titleRowHeight + typo.bodyTopPad;
        }

        const bodyResult = drawTextWithBoldActionWords(ctx, summary.body, {
          x: column.x, y: column.y, width: column.width,
          height: Math.max(6, (rect.y + rect.height) - column.y - (isLast ? 2 : 0)),
          fontSize: bodyMaxSize, minFontSize: bodyMinSize, color: "#111111", lineGap: cfg.lineGap,
        });
        const computedFSize = Math.max(bodyMinSize, bodyMaxSize * 0.85);
        const computedLineH = computedFSize + cfg.lineGap;
        // Add 1 line of breathing room below body so text never clips at the divider
        const bodyStartY = column.y;
        const bodyHeight = bodyResult.cursorY - bodyStartY + computedLineH;
        const separatorY = bodyStartY + bodyHeight;
        ctx.doc.save();
        ctx.doc.strokeColor("#bdbdbd").lineWidth(0.5)
          .moveTo(column.x, separatorY).lineTo(column.x + column.width, separatorY).stroke();
        ctx.doc.restore();
        column.y = separatorY + (isLast ? 0 : cfg.featureGap);
      }
      i += 1;
    }
  }
}

type FeatureGroupSection = {
  id: string;
  title: string;
  cards: PdfPageCard[];
};

function toFeatureDeckGroupId(card: PdfPageCard) {
  if (cardHasGroup(card, "race")) {
    return "race";
  }
  if (cardHasGroup(card, "subrace")) {
    return "subrace";
  }
  if (cardHasGroup(card, "class")) {
    return "class";
  }
  if (cardHasGroup(card, "subclass")) {
    return "subclass";
  }
  if (cardHasGroup(card, "feat")) {
    return "feat";
  }
  if (cardHasGroup(card, "additional")) {
    return "additional";
  }
  return "other";
}

function buildFeatureDeckGroups(cards: PdfPageCard[]) {
  const groups = new Map<string, FeatureGroupSection>([
    ["race", { id: "race", title: "RACIAL FEATURES", cards: [] }],
    ["subrace", { id: "subrace", title: "SUBRACIAL FEATURES", cards: [] }],
    ["class", { id: "class", title: "CLASS FEATURES", cards: [] }],
    ["subclass", { id: "subclass", title: "SUBCLASS FEATURES", cards: [] }],
    ["feat", { id: "feat", title: "FEATS", cards: [] }],
    ["additional", { id: "additional", title: "ADDITIONAL FEATURES", cards: [] }],
    ["other", { id: "other", title: "OTHER / CONDITIONAL", cards: [] }],
  ]);

  cards.forEach((card) => {
    groups.get(toFeatureDeckGroupId(card))?.cards.push(card);
  });

  return [...groups.values()]
    .filter((group) => group.cards.length)
    .flatMap((group) => {
      // Round-29 #4: for class/subclass groups, split chunks BY
      // class identity (the `pdf-className:<NAME>` tag set in
      // buildFeatureCards) so each chunk represents ONE class.
      // Result: multiclass characters see "DRUID" / "RANGER"
      // chunk titles instead of "CLASS 1" / "CLASS 2".
      //
      // For non-class groups (race/subrace/feat/additional/other)
      // we keep the existing chunk-by-weight behavior because
      // those groups don't have class identity — they're broken
      // up purely by content weight.
      const isClassLike = group.id === "class" || group.id === "subclass";
      if (isClassLike) {
        // Group cards by className tag
        const byClass = new Map<string, PdfPageCard[]>();
        const orderOfFirstAppearance: string[] = [];
        for (const card of group.cards) {
          const tag = card.tags.find((t) => t.startsWith("pdf-className:"));
          const classKey = tag ? tag.slice("pdf-className:".length) : "_unknown";
          if (!byClass.has(classKey)) {
            byClass.set(classKey, []);
            orderOfFirstAppearance.push(classKey);
          }
          byClass.get(classKey)!.push(card);
        }
        return orderOfFirstAppearance.map((classKey) => ({
          ...group,
          id: `${group.id}-${classKey}`,
          // Use class name (e.g. "DRUID") as the title so
          // getFeatureGroupDisplayTitle returns it directly
          // (no " FEATURES" strip needed — already stripped)
          title: classKey === "_unknown" ? group.title : classKey.toUpperCase(),
          cards: byClass.get(classKey)!,
        }));
      }
      // Non-class groups: existing weight-based chunking
      const chunks: PdfPageCard[][] = [];
      let current: PdfPageCard[] = [];
      let currentWeight = 0;

      group.cards.forEach((card) => {
        const weight = summarizeCard(card).body.length;
        if (current.length && (current.length >= 4 || currentWeight + weight > 720)) {
          chunks.push(current);
          current = [];
          currentWeight = 0;
        }
        current.push(card);
        currentWeight += weight;
      });
      if (current.length) {
        chunks.push(current);
      }

      return chunks.map((chunk, index) => ({
        ...group,
        id: chunks.length > 1 ? `${group.id}-${index + 1}` : group.id,
        title: chunks.length > 1 ? `${group.title} ${index + 1}` : group.title,
        cards: chunk,
      }));
    });
}

function getFeatureGroupDisplayTitle(group: FeatureGroupSection) {
  return group.title.replace(" FEATURES", "").trim();
}

function estimateFeatureListHeight(cards: PdfPageCard[]) {
  return cards
    .map(summarizeCard)
    .reduce((total, summary) => total + Math.max(16, Math.min(48, 8 + Math.ceil(summary.body.length / 55) * 6)) + 8, 0);
}

function renderGroupedFeatureDeck(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, cards: PdfPageCard[], rect: PdfRect, level = 5) {
  const groups = buildFeatureDeckGroups(cards);
  if (!groups.length) {
    return;
  }
  // Round-29 #4: tighter gap between feature card groups.
  // User feedback: 'Mai putin spatiu intre ele ... e prea mult
  // padding sus si jos'. Reduced 7 → 4.
  const gap = 4;
  const columnCount = Math.min(2, groups.length);
  const totalGapWidth = (columnCount - 1) * gap;
  const cellWidth = Math.floor((rect.width - totalGapWidth) / columnCount);

  // Fit pass: compute config that makes all groups fit in rect.height
  const fitCfg = computeFitConfig(ctx, groups, rect, columnCount, gap, cellWidth, level);

  // Measure using the fit config
  const measuredHeights = groups.map((g) => {
    const listRect = { x: 0, y: 0, width: cellWidth - 10, height: rect.height };
    return measureFeatureListHeightWithConfig(
      ctx,
      g.cards,
      listRect,
      fitCfg,
      getAdaptiveFeatureColumnCount(g.cards, listRect.width, level),
      level,
    );
  });

  // Masonry/column-flow: 2-column grid, place each group in shortest column
  const colHeights = new Array(columnCount).fill(rect.y);

  groups.forEach((group, gIdx) => {
    const col = idxForShortestColumn(colHeights);
    const groupHeight = measuredHeights[gIdx] + fitCfg.bottomPadding;
    const groupY = colHeights[col];
    const groupRect: PdfRect = {
      x: rect.x + col * (cellWidth + gap),
      y: groupY,
      width: cellWidth,
      height: groupHeight,
    };
    colHeights[col] += groupHeight + gap;

    maskRect(ctx, groupRect);
    drawSvg(ctx, assets.generalContainer, groupRect);

    // Round-29 #4: less top padding above the group title. User
    // feedback: 'sus deasupra titlului "Class" sau "Class 2" e
    // prea mult padding'. Reduced titleY offset 12 → 7 (and
    // corresponding listRect y 18 → 13) so the title sits closer
    // to the top of the card. Tightens vertical rhythm and
    // reduces wasted space at the top of each card.
    const titleY = groupRect.y + 7;
    const displayTitle = getFeatureGroupDisplayTitle(group);
    drawFittedText(ctx, displayTitle.toUpperCase(), { x: groupRect.x + 5, y: titleY, width: groupRect.width - 10, height: 6 }, {
      font: "Helvetica-Bold",
      maxSize: 6.4,
      minSize: 6.4,
      color: "#1a1a1a",
    });

    const listRect = {
      x: groupRect.x + 5,
      y: groupRect.y + 13,
      // Round-29 #4: less bottom padding below the body list.
      // User feedback: 'prea mult padding ... sub feature/ultimul
      // feature la unele'. Reduced the -15 → -10 reserved
      // bottom space inside the list rect so the last feature
      // sits closer to the bottom edge of the card.
      width: groupRect.width - 10,
      height: groupRect.height - fitCfg.bottomPadding - 10,
    };
    renderFeatureList(ctx, group.cards, listRect, getAdaptiveFeatureColumnCount(group.cards, listRect.width), fitCfg, level);
  });
}

/** Measure actual rendered height of a feature list. Last item has no post-separator gap; card hugs last separator. */
function measureFeatureListHeight(ctx: PdfRenderContext, cards: PdfPageCard[], rect: PdfRect): number {
  const summaries = cards.map(summarizeCard);
  let cursorY = rect.y;
  const maxW = rect.width;
  const fSize = 5.8 * 0.85; // matches body maxSize in renderFeatureList
  const lineH = fSize + 1.2;
  const doc = ctx.doc;

  summaries.forEach((summary, sIdx) => {
    // Title row
    cursorY += 5.5; // title height

    // Body - measure wrapped lines using PDFKit widthOfString
    let lineX = rect.x;
    const actionWords: [string][] = [
      ["bonus action"], ["legendary action"], ["reaction"],
      ["free object interaction"], ["object interaction"], ["action"],
    ];
    // Tokenize to get bold/plain runs
    let remaining = summary.body;
    const runs: { text: string; bold: boolean }[] = [];
    while (remaining.length > 0) {
      let matched = false;
      for (const [phrase] of actionWords) {
        const idx = remaining.toLowerCase().indexOf(phrase);
        if (idx !== -1) {
          if (idx > 0) runs.push({ text: remaining.slice(0, idx), bold: false });
          runs.push({ text: remaining.slice(idx, idx + phrase.length), bold: true });
          remaining = remaining.slice(idx + phrase.length);
          matched = true;
          break;
        }
      }
      if (!matched) { runs.push({ text: remaining, bold: false }); break; }
    }
    // Merge adjacent runs
    const merged: { text: string; bold: boolean }[] = [];
    for (const r of runs) {
      const prev = merged[merged.length - 1];
      if (prev && prev.bold === r.bold) { prev.text += r.text; }
      else { merged.push({ ...r }); }
    }
    for (const run of merged) {
      const words = run.text.split(/(\s+)/);
      for (const w of words) {
        if (w.length === 0) continue;
        doc.save();
        doc.font(run.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fSize);
        const w2 = doc.widthOfString(w);
        doc.restore();
        if (lineX + w2 > rect.x + maxW && lineX > rect.x) {
          cursorY += lineH;
          lineX = rect.x;
        }
        lineX += w2;
      }
    }
    cursorY += lineH; // body text for this entry
    // Separator at body bottom, 8pt gap ONLY if another entry follows
    if (sIdx < summaries.length - 1) {
      cursorY += 8; // gap before next feature title
    } else {
      // Last entry: no post-separator gap; card height ends at separator + small bottom padding
      cursorY += 4; // minimal bottom padding
    }
  });
  // Card = title/header area (18pt from card top to first title) + measured content
  return Math.max(30, cursorY - rect.y + 18);
}

function idxForShortestColumn(colHeights: number[]): number {
  let minH = colHeights[0];
  let minIdx = 0;
  for (let i = 1; i < colHeights.length; i++) {
    if (colHeights[i] < minH) { minH = colHeights[i]; minIdx = i; }
  }
  return minIdx;
}

function renderRightColumnCardShell(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, title: string, rect: PdfRect) {
  maskRect(ctx, rect);
  drawSvg(ctx, assets.generalContainer, rect);
  const content = insetRect(rect, 6, 7);
  drawFittedText(ctx, title, { x: content.x, y: content.y + 1.5, width: content.width, height: 6 }, {
    font: "Helvetica-Bold",
    maxSize: 6.4,
    minSize: 6.4,
    color: "#000000",
  });
  return content;
}

function renderRightColumnNotesCard(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  notes: PdfRightColumnNoteLine[],
  rect: PdfRect,
) {
  const content = renderRightColumnCardShell(ctx, assets, "Senses & Conditions", rect);
  notes.forEach((line, index) => {
    const y = content.y + 11.2 + index * 6;
    if (y + 6 > content.y + content.height) {
      return;
    }
    drawFittedText(ctx, `${line.title}: ${line.value}`, { x: content.x, y, width: content.width, height: 6 }, {
      font: "Helvetica",
      maxSize: 6.4,
      minSize: 6.4,
      color: "#111111",
    });
  });
}

function renderCompactTraitLines(
  ctx: PdfRenderContext,
  title: string,
  cards: PdfRightColumnCompactTrait[],
  content: PdfRect,
  cursorY: number,
) {
  let nextY = cursorY;
  if (cards.length) {
    // Section header uses RACIAL typography size (13pt) so the
    // "Racial Traits" / "Subracial Traits" anchor reads as a panel
    // header, not a footnote. Down-clamped to 10pt max so it doesn't
    // overwhelm the right column.
    drawFittedText(ctx, `${title} Traits`, { x: content.x, y: nextY, width: content.width, height: 8 }, {
      font: "Helvetica-Bold",
      maxSize: 10,
      minSize: 6.4,
      color: "#222222",
    });
    strokeRule(ctx, content.x, nextY + 7.5, content.width, "#bdbdbd");
    nextY += 10;
  }

  cards.forEach((card, index) => {
    const summary = summarizeCompactTraitCard(card);
    const typo = cardTypography(summary.kind);
    const titleFSize = typo.title.max;
    const bodyFontSize = typo.body.max;
    const bodyMinSize = typo.body.min;
    const bodyLineGap = 0.35;

    // Title width: leave room for meta on same row
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
    const titleW = ctx.doc.widthOfString(summary.title.toUpperCase());
    ctx.doc.restore();

    let metaStartX = content.x + titleW + 4;
    let metaW = 0;
    let totalMetaWidth = 0;
    if (summary.actionHint) {
      ctx.doc.save();
      ctx.doc.font("Helvetica-Bold").fontSize(typo.meta.max);
      totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
      ctx.doc.restore();
    }
    if (summary.rechargeHint) {
      ctx.doc.save();
      ctx.doc.font("Helvetica").fontSize(typo.meta.max);
      totalMetaWidth += ctx.doc.widthOfString(summary.rechargeHint) + 2;
      ctx.doc.restore();
    }
    if (summary.chargeDisplay && summary.chargeDisplay.count !== undefined) {
      const circleD = Math.min(4.5, content.width * 0.07);
      const circleGap = 1.2;
      totalMetaWidth += summary.chargeDisplay.count * circleD + (summary.chargeDisplay.count - 1) * circleGap + 2;
    }
    const hasMeta = Boolean(summary.actionHint || summary.rechargeHint || summary.chargeDisplay);
    const allFits = hasMeta && (titleW + 4 + totalMetaWidth <= content.width);

    const titleRowHeight = typo.titleRowHeight;
    const bodyTopPad = typo.bodyTopPad;

    if (nextY + titleRowHeight > content.y + content.height) return;

    // Draw title — hardcoded 5.5pt, baseline at nextY (same as Features section)
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
    ctx.doc.text(summary.title.toUpperCase(), content.x, nextY, { lineBreak: false });
    ctx.doc.restore();

    if (allFits) {
      // Single-row: meta to the right of title, body below header
      if (hasMeta) {
        drawFeatureMetaBlock(ctx, summary, {
          x: metaStartX, y: nextY, width: Math.max(4, content.width - titleW - 4), height: titleRowHeight,
        });
      }
      const bodyY = nextY + titleRowHeight + bodyTopPad;
      const maxBodyH = (content.y + content.height) - bodyY - (index < cards.length - 1 ? 2 : 0);
      const bodyResult = drawTextWithBoldActionWords(ctx, summary.body, {
        x: content.x, y: bodyY, width: content.width, height: Math.max(4, maxBodyH),
        fontSize: bodyFontSize, minFontSize: bodyMinSize, color: "#111111", lineGap: bodyLineGap,
      });
      const computedFSize = Math.max(bodyMinSize, bodyFontSize * 0.85);
      const computedLineH = computedFSize + bodyLineGap;
      const bodyStartY = bodyY;
      const bodyH = bodyResult.cursorY - bodyStartY + computedLineH;
      const entryEnd = bodyStartY + bodyH;
      if (index < cards.length - 1) {
        ctx.doc.save();
        ctx.doc.strokeColor("#bdbdbd").lineWidth(0.5)
          .moveTo(content.x, entryEnd).lineTo(content.x + content.width, entryEnd).stroke();
        ctx.doc.restore();
      }
      nextY = entryEnd + (index < cards.length - 1 ? 3 : 0);
    } else {
      // Two-row: title full width, meta below (if any), body below meta
      if (hasMeta) {
        drawFeatureMetaBlock(ctx, summary, {
          x: content.x, y: nextY + titleRowHeight, width: content.width,
          height: typo.metaRowHeight,
        });
      }
      const bodyY =
        nextY +
        titleRowHeight +
        (hasMeta ? typo.metaRowHeight : 0) +
        bodyTopPad;
      const maxBodyH = (content.y + content.height) - bodyY - (index < cards.length - 1 ? 2 : 0);
      const bodyResult = drawTextWithBoldActionWords(ctx, summary.body, {
        x: content.x, y: bodyY, width: content.width, height: Math.max(4, maxBodyH),
        fontSize: bodyFontSize, minFontSize: bodyMinSize, color: "#111111", lineGap: bodyLineGap,
      });
      const computedFSize = Math.max(bodyMinSize, bodyFontSize * 0.85);
      const computedLineH = computedFSize + bodyLineGap;
      const bodyStartY = bodyY;
      const bodyH = bodyResult.cursorY - bodyStartY + computedLineH;
      const entryEnd = bodyStartY + bodyH;
      if (index < cards.length - 1) {
        ctx.doc.save();
        ctx.doc.strokeColor("#bdbdbd").lineWidth(0.5)
          .moveTo(content.x, entryEnd).lineTo(content.x + content.width, entryEnd).stroke();
        ctx.doc.restore();
      }
      nextY = entryEnd + (index < cards.length - 1 ? 3 : 0);
    }
  });

  return nextY;
}

function renderRightColumnFeatureCard(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, rect: PdfRect) {
  const { racialCards, subracialCards } = character.frontPage.rightColumn;
  const content = renderRightColumnCardShell(ctx, assets, "Racial & Subracial Features", rect);
  const paddedContent = insetRect(content, 2.5, 1.5);
  let cursorY = paddedContent.y + 11.8;
  cursorY = renderCompactTraitLines(ctx, "Racial", racialCards, paddedContent, cursorY);
  if (racialCards.length && subracialCards.length) {
    cursorY += 2.4;
  }
  renderCompactTraitLines(ctx, "Subracial", subracialCards, paddedContent, cursorY);
}

function renderRail(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const { rightColumn } = character.frontPage;
  const classResourceCount = findStatsByIdPrefix(character, "class-resource-")
    .filter((resource) => cleanText(resource.value, "")).length;
  const spellSourceCount = new Set(
    findStatsByIdPrefix(character, "spellcasting-source-")
      .map((stat) => stat.id.match(/^(spellcasting-source-[^.]+)-(?:bonus|dc|ability)$/)?.[1])
      .filter(Boolean),
  ).size;
  const hasKiDc = Boolean(statValue(character, "ki save dc"));
  let usedRight = SPELLCASTING_REGION.x;

  if (spellSourceCount > 1) {
    usedRight = classResourceCount > 0
      ? SPELLCASTING_REGION.x - 6 + SPELLCASTING_REGION.width
      : SPELLCASTING_REGION.x - 6 + 116;
  } else if (spellSourceCount === 1) {
    usedRight = SPELLCASTING_REGION.x + (classResourceCount > 0 ? 193 : 187);
  } else if (hasKiDc && classResourceCount > 0) {
    usedRight = SPELLCASTING_REGION.x + RESOURCE_ONLY_SLOTS[1].x + RESOURCE_ONLY_SLOTS[1].width;
  } else if (hasKiDc || classResourceCount === 1) {
    usedRight = SPELLCASTING_REGION.x + 40 + 116;
  } else if (classResourceCount > 1) {
    usedRight = SPELLCASTING_REGION.x + RESOURCE_ONLY_SLOTS[1].x + RESOURCE_ONLY_SLOTS[1].width;
  }

  const railRight = FRONT_PAGE_REGIONS.rail.x + FRONT_PAGE_REGIONS.rail.width;
  const railX = Math.min(railRight - 80, usedRight + 6);
  renderRightColumnNotesCard(ctx, assets, rightColumn.sensesAndConditions, {
    ...FRONT_PAGE_REGIONS.rail,
    x: railX,
    width: railRight - railX,
  });

  // Round-28 #4: REMOVE the duplicate bottom "Racial & Subracial
  // Features" card. User feedback: 'the racial ones are weird, like
  // card Racial & Subracial Features Is pinned on the bottom? But
  // the one on the bottom should not be there because it is
  // duplicated, we already have the good one at the top.'
  //
  // The top version is rendered by renderGroupedFeatureDeck (called
  // from renderFeatureDeck line 3846) which includes racial,
  // subracial, class, subclass, and feat cards in masonry layout.
  // The bottom call here was a redundant re-render that took ~80pt
  // of vertical space at the bottom of the FEATURES & TRAITS column.
  //
  // Removing the bottom call frees that space for the deck above to
  // expand naturally — fewer cramped cards, better breathing room,
  // and no visual duplication.
}

function collectFrontPageFeatureCards(character: ResolvedPdfCharacter) {
  const cardsById = new Map<string, PdfPageCard>();
  [
    ...character.frontPage.deck,
    ...character.frontPage.deckOverflow,
    ...character.frontPage.railCards.filter(
      (card) =>
        card.kind !== "condition" &&
        card.kind !== "sense" &&
        card.kind !== "proficiency" &&
        card.kind !== "language",
    ),
  ].forEach((card) => cardsById.set(card.id, card));
  return [...cardsById.values()];
}

function getCompactLeftFeatureCards(character: ResolvedPdfCharacter, cards: PdfPageCard[]) {
  const spellPanel = getCombatSpellPanel(character);
  const freeTop = spellPanel
    ? spellPanel.y + spellPanel.height + 5
    : FRONT_PAGE_REGIONS.combatSpells.y;
  const freeBottom = FRONT_PAGE_REGIONS.combatSpells.y + FRONT_PAGE_REGIONS.combatSpells.height;
  const freeHeight = freeBottom - freeTop;
  if (freeHeight < 30) {
    return [];
  }
  return [...cards]
    .filter((card) => summarizeCard(card).body.length <= 180)
    .sort((left, right) => summarizeCard(left).body.length - summarizeCard(right).body.length)
    .slice(0, freeHeight >= 66 ? 2 : 1);
}

function renderCompactLeftFeatures(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  character: ResolvedPdfCharacter,
  cards: PdfPageCard[],
) {
  const compactCards = getCompactLeftFeatureCards(character, cards);
  if (!compactCards.length) {
    return;
  }
  const spellPanel = getCombatSpellPanel(character);
  const y = spellPanel
    ? spellPanel.y + spellPanel.height + 5
    : FRONT_PAGE_REGIONS.combatSpells.y;
  renderGroupedFeatureDeck(ctx, assets, compactCards, {
    x: FRONT_PAGE_REGIONS.combatSpells.x,
    y,
    width: FRONT_PAGE_REGIONS.combatSpells.width,
    height: FRONT_PAGE_REGIONS.combatSpells.y + FRONT_PAGE_REGIONS.combatSpells.height - y,
  }, character.level);
}

function renderFeatureDeck(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const allCards = collectFrontPageFeatureCards(character);
  const compactLeftIds = new Set(getCompactLeftFeatureCards(character, allCards).map((card) => card.id));
  const cards = allCards.filter((card) => !compactLeftIds.has(card.id));

  if (!cards.length) {
    return;
  }

  drawCenteredTextInRect(ctx, "FEATURES & TRAITS", {
    x: FRONT_PAGE_REGIONS.features.x,
    y: FRONT_PAGE_REGIONS.features.y - 13,
    width: FRONT_PAGE_REGIONS.features.width,
    height: 9,
  }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 6.4,
    color: "#222222",
  });
  // Push boxes down ~one title-text height below title so they don't crowd the heading
  renderGroupedFeatureDeck(ctx, assets, cards, FRONT_PAGE_REGIONS.features, character.level);
}

function compactSpellSummary(summary: string, maxChars: number) {
  const cleaned = cleanText(summary).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function formatPactSlotSummary(pactSlots: { level: number; slots: number }[]) {
  if (!pactSlots.length) {
    return "";
  }

  const primary = pactSlots[pactSlots.length - 1];
  const slotLabel = primary.slots === 1 ? "slot" : "slots";
  return `PACT MAGIC: ${primary.slots} ${slotLabel} at L${primary.level}`;
}

function formatSpellEntriesForFrontPage(
  spells: Array<{ name: string; level: number; sourceLabel?: string; page1DisplaySummary?: string }>,
  mode: keyof typeof SPELL_SUMMARY_MAX_CHARS,
) {
  if (!spells.length) {
    return "—";
  }

  const summaryBudget =
    spells.length === 1
      ? SPELL_SUMMARY_MAX_CHARS[mode].single
      : spells.length === 2
        ? SPELL_SUMMARY_MAX_CHARS[mode].pair
        : SPELL_SUMMARY_MAX_CHARS[mode].many;

  return spells
    .map((spell) => {
      const summary = spell.page1DisplaySummary;
      if (!summary) {
        return spell.name;
      }
      return `${spell.name} — ${compactSpellSummary(summary, summaryBudget)}`;
    })
    .join("; ");
}

export function renderFrontPage(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  ctx.doc.addPage({ size: [PAGE_SIZE.width, PAGE_SIZE.height], margin: 0 });

  const doc = ctx.doc as TransformDocument;
  doc.save();
  doc
    .translate(FRONT_PAGE_PRINT_SAFE_OFFSET.x, FRONT_PAGE_PRINT_SAFE_OFFSET.y)
    .scale(FRONT_PAGE_PRINT_SAFE_SCALE);

  renderHeader(ctx, assets, character);
  renderStatStrip(ctx, assets, character, true);
  renderAbilities(ctx, assets, character, true);
  renderSpellcasting(ctx, assets, character);
  renderPassives(ctx, assets, character, true);
  renderProficiencies(ctx, assets, character);
  renderRail(ctx, assets, character);
  renderCombatSpellcastingHub(ctx, assets, character);
  renderCompactLeftFeatures(ctx, assets, character, collectFrontPageFeatureCards(character));
  renderFeatureDeck(ctx, assets, character);

  doc.restore();
}

