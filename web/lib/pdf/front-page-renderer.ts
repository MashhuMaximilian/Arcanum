import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, PdfRightColumnCompactTrait, PdfRightColumnNoteLine, ResolvedPdfCharacter } from "@/lib/pdf/types";
import {
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
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
  title: { max: 5.5, min: 4.0 },
  body: { max: 6.4, min: 3.6 },
  meta: { max: 5.0, min: 2.7 },
  charges: { max: 4.8, min: 3.0 },
  titleRowHeight: 5.0,
  metaRowHeight: 3.8,
  bodyTopPad: 2.5,
  separatorGap: 7,
  circleRadius: 1.45,
  circleGap: 1.55,
  metaWidth: { max: 72, min: 44 },
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
  save: { x: 11, y: 7.2, width: 33, height: 9.2 },
  score: { x: 10.5, y: 26.8, width: 34, height: 15.5 },
  labelMask: { x: 14, y: 44.4, width: 28, height: 6.8 },
  label: { x: 10, y: 45, width: 35, height: 8 },
  modifier: { x: 12, y: 57.2, width: 31, height: 10.6 },
} as const;

const SKILL_ROW_SLOTS = {
  circleX: 11.5,
  firstCenterY: 9.5,
  rowGap: 9,
  bonusMask: { x: 16, yOffset: -2.5, width: 6.15, height: 5 },
  bonusValue: { x: 14.8, yOffset: -2.7, width: 10.4, height: 5.4 },
  line: { x: 9, width: 57, height: 5 },
  lineLabelMask: { x: 14, width: 43, height: 5 },
  label: { x: 26.4, yOffset: -3.35, width: 46.6, height: 6.7 },
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
  { key: "race", label: "RACE", labelRect: { x: 242, y: 27.2, width: 83, height: 5.0 }, valueRect: { x: 242, y: 33.3, width: 83, height: 7.4 }, lineRect: { x: 242, y: 36.8, width: 83, height: 5.0 }, maxSize: 5.0, minSize: 3.0 },
  { key: "class", label: "CLASS & LEVEL", labelRect: { x: 333, y: 27.2, width: 139, height: 5.0 }, valueRect: { x: 333, y: 33.3, width: 139, height: 7.4 }, lineRect: { x: 333, y: 36.8, width: 139, height: 5.0 }, maxSize: 5.0, minSize: 3.0 },
  { key: "exp", label: "EXP", labelRect: { x: 480.5, y: 27.2, width: 44, height: 5.0 }, valueRect: { x: 480.5, y: 33.3, width: 44, height: 7.4 }, lineRect: { x: 480.5, y: 36.8, width: 44, height: 5.0 }, maxSize: 4.3, minSize: 2.8 },
  { key: "background", label: "BACKGROUND", labelRect: { x: 242, y: 44.2, width: 71.5, height: 5.0 }, valueRect: { x: 242, y: 50.3, width: 71.5, height: 7.0 }, lineRect: { x: 242, y: 53.9, width: 71.5, height: 5.0 }, maxSize: 4.4, minSize: 2.9 },
  { key: "alignment", label: "ALIGNMENT", labelRect: { x: 321.5, y: 44.2, width: 71.5, height: 5.0 }, valueRect: { x: 321.5, y: 50.3, width: 71.5, height: 7.0 }, lineRect: { x: 321.5, y: 53.9, width: 71.5, height: 5.0 }, maxSize: 4.1, minSize: 2.8 },
  { key: "deity", label: "DEITY", labelRect: { x: 401, y: 44.2, width: 71.5, height: 5.0 }, valueRect: { x: 401, y: 50.3, width: 71.5, height: 7.0 }, lineRect: { x: 401, y: 53.9, width: 71.5, height: 5.0 }, maxSize: 4.1, minSize: 2.8 },
  { key: "player", label: "PLAYER NAME", labelRect: { x: 480.5, y: 44.2, width: 71.5, height: 5.0 }, valueRect: { x: 480.5, y: 50.3, width: 71.5, height: 7.0 }, lineRect: { x: 480.5, y: 53.9, width: 71.5, height: 5.0 }, maxSize: 4.3, minSize: 2.8 },
] as const;

const SPELLCASTING_REGION: PdfRect = { x: 394, y: 140, width: 196, height: 50 };
const RESOURCE_ONLY_SLOTS = [
  { x: 10, y: 4, width: 82, height: 42 },
  { x: 104, y: 4, width: 82, height: 42 },
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

function componentRect(region: PdfRect, viewBox: { width: number; height: number }, rect: PdfRect): PdfRect {
  const scaleX = region.width / viewBox.width;
  const scaleY = region.height / viewBox.height;
  return {
    x: region.x + rect.x * scaleX,
    y: region.y + rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

function componentPoint(region: PdfRect, viewBox: { width: number; height: number }, point: { x: number; y: number }) {
  return {
    x: region.x + point.x * (region.width / viewBox.width),
    y: region.y + point.y * (region.height / viewBox.height),
  };
}

function componentRadius(region: PdfRect, viewBox: { width: number; height: number }, radius: number) {
  return radius * Math.min(region.width / viewBox.width, region.height / viewBox.height);
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
  const y = rect.y + Math.max(0, (rect.height - size * 0.82) / 2) - size * 0.05;
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

  const valueRect = rectFromFractions(rect, {
    x: mode === "shield" ? 0.13 : mode === "wide" ? 0.07 : 0.12,
    y: mode === "shield" ? 0.20 : mode === "wide" ? 0.17 : 0.16,
    width: mode === "shield" ? 0.74 : mode === "wide" ? 0.86 : 0.76,
    height: mode === "shield" ? 0.36 : 0.36,
  });
  drawCenteredTextInRect(ctx, value, valueRect, {
    font: "Helvetica-Bold",
    maxSize: mode === "small" ? 11 : mode === "shield" ? 12 : 13.5,
    minSize: 7,
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
  const bottomPadFrac = 0.24;
  const bottomPad = Number.isFinite(safeRect.height) && safeRect.height > 0
    ? safeRect.height * bottomPadFrac
    : 5;
  const contentRect: PdfRect = {
    x: safeRect.x + 5,
    y: safeRect.y + 3,
    width: Math.max(1, safeRect.width - 10),
    height: Math.max(1, safeRect.height - 3 - bottomPad),
  };

  const rowCount = lines.length;
  const maxFontSize = Math.min(7.2, (contentRect.height / Math.max(1, rowCount)) * 0.85);
  const minFontSize = 1.5;
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

  drawFittedText(ctx, cleanText(character.name, "Unnamed character"), headerRect({ x: 30, y: 36, width: 166, height: 18 }), {
    font: "Times-Bold",
    maxSize: 18,
    minSize: 10,
    color: "#000000",
  });

  const classLevel = [
    character.level ? `Lvl ${character.level}` : "",
    character.subclassLabel,
    character.classLabel || "Character",
  ]
    .filter(Boolean)
    .join(" ");
  const raceLine = [character.raceLabel, character.subraceLabel].filter(Boolean).join(" / ");
  const values = {
    race: raceLine,
    class: classLevel,
    background: character.backgroundLabel,
    alignment: character.alignment,
    deity: character.deity,
    exp: "",
    player: character.playerName,
  } satisfies Record<(typeof HEADER_FIELD_SLOTS)[number]["key"], string>;

  HEADER_FIELD_SLOTS.forEach((field) => {
    drawFittedText(ctx, field.label.toUpperCase(), headerRect(field.labelRect), {
      font: "Helvetica-Bold",
      maxSize: 3.8,
      minSize: 2.8,
      align: "left",
      color: "#555555",
    });
    const line = headerRect(field.lineRect);
    drawHeaderUnderline(ctx, line);

    const value = values[field.key];
    if (!value) {
      return;
    }
    drawFittedText(ctx, cleanText(value), headerRect(field.valueRect), {
      font: "Helvetica-Bold",
      maxSize: field.maxSize,
      minSize: field.minSize,
      align: "left",
      color: "#000000",
    });
  });
}

function renderStatStrip(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, drawShell: boolean) {
  if (drawShell) {
    drawSvg(ctx, assets.hpPanel, { ...FRONT_PAGE_REGIONS.statStrip, y: FRONT_PAGE_REGIONS.statStrip.y - 7 });
  }

  TOP_STATS.forEach((spec) => {
    const rect = componentRect(FRONT_PAGE_REGIONS.statStrip, TOP_STAT_VIEWBOX, spec.box);
    if (spec.key === "defenses") {
      const defensesValue = findStat(character, spec.key)?.value ?? spec.fallback ?? "";
      drawDefensesStatBox(ctx, rect, defensesValue);
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
  const [name, cadence] = resource.label
    .split("\n")
    .map((part) => cleanText(part))
    .filter(Boolean);

  return {
    name: name || "Class Resource",
    cadence,
    value: resource.value,
  };
}

function formatResourceCadence(value: string, cadence?: string) {
  const cleanedCadence = cleanText(cadence);
  if (!cleanedCadence) {
    return undefined;
  }

  const uses = cleanText(value).match(/^(\d+)/)?.[1];
  const cadenceMap: Record<string, string> = {
    lr: "per long rest",
    long: "per long rest",
    "long rest": "per long rest",
    sr: "per short rest",
    short: "per short rest",
    "short rest": "per short rest",
  };
  const normalized = cadenceMap[cleanedCadence.toLowerCase()] ?? cleanedCadence;
  return uses ? `${uses} ${normalized}` : normalized;
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
  drawCenteredTextInRect(ctx, content.value, rectFromFractions(box, {
    x: 0.08,
    y: hasCadence ? 0.11 : 0.18,
    width: 0.84,
    height: hasCadence ? 0.32 : 0.36,
  }), {
    font: "Helvetica-Bold",
    maxSize: box.width > 100 ? 14.2 : 12.5,
    minSize: 5,
    color: "#000000",
  });
  if (cadence) {
    drawCenteredTextInRect(ctx, cadence, rectFromFractions(box, { x: 0.10, y: 0.48, width: 0.80, height: 0.14 }), {
      font: "Helvetica-Bold",
      maxSize: box.width > 100 ? 4.2 : 3.2,
      minSize: 2.0,
      color: "#000000",
    });
  }
  drawCenteredTextInRect(ctx, content.label, rectFromFractions(box, {
    x: 0.08,
    y: hasCadence ? 0.70 : 0.68,
    width: 0.84,
    height: 0.16,
  }), {
    font: content.labelFont || "Helvetica-Bold",
    maxSize: box.width > 100 ? 5.3 : 4.1,
    minSize: 2.3,
    color: "#000000",
  });
}

function renderSpellcasting(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const stats = [
    statValue(character, "spellcasting bonus"),
    statValue(character, "save dc"),
    statValue(character, "spellcasting ability"),
  ];
  const kiSaveDc = statValue(character, "ki save dc");
  const classResources = findStatsByIdPrefix(character, "class-resource-")
    .map((resource) => ({
      label: cleanText(resource.meta, "Class Resource"),
      value: cleanText(resource.value, ""),
    }))
    .map(parseClassResource)
    .filter((resource) => resource.value);
  const hasSpellcasting = stats.some(Boolean);
  const hasKiDc = Boolean(kiSaveDc);
  const hasClassResource = classResources.length > 0;

  if (!hasSpellcasting && !hasKiDc && !hasClassResource) {
    return;
  }

  maskRect(ctx, SPELLCASTING_REGION);

  if (!hasSpellcasting && hasKiDc) {
    const kiBox = spellcastingRect(hasClassResource ? RESOURCE_ONLY_SLOTS[0] : { x: 40, y: 4, width: 116, height: 42 });
    drawShellMetricCard(ctx, assets, kiBox, { value: kiSaveDc, label: "Ki Save DC", labelFont: "Helvetica" });

    if (hasClassResource) {
      const resource = classResources[0];
      drawShellMetricCard(ctx, assets, spellcastingRect(RESOURCE_ONLY_SLOTS[1]), {
        value: resource.value,
        label: resource.name,
        cadence: resource.cadence,
      });
    }
    return;
  }

  if (!hasSpellcasting && hasClassResource) {
    const resourceBoxes =
      classResources.length > 1
        ? RESOURCE_ONLY_SLOTS.map(spellcastingRect)
        : [spellcastingRect({ x: 40, y: 4, width: 116, height: 42 })];
    classResources.slice(0, resourceBoxes.length).forEach((resource, index) => {
      drawShellMetricCard(ctx, assets, resourceBoxes[index], {
        value: resource.value,
        label: resource.name,
        cadence: resource.cadence,
      });
    });
    return;
  }

  if (!hasSpellcasting) {
    return;
  }

  const spellBox = spellcastingRect(hasClassResource ? { x: 4, y: 1, width: 126, height: 48 } : { x: 9, y: 1, width: 178, height: 48 });
  drawSvg(ctx, assets.proficiencyBox1, spellBox);
  const thirds = splitColumns(insetRect(spellBox, 9, 6), 3, 8);
  const labels = ["BONUS", "SAVE DC", "ABILITY"];

  stats.forEach((value, index) => {
    if (!value) {
      return;
    }
    drawCenteredTextInRect(ctx, value, rectFromFractions(thirds[index], { x: 0.03, y: 0.12, width: 0.94, height: 0.42 }), {
      font: "Helvetica-Bold",
      maxSize: index === 1 ? 11.2 : 14.5,
      minSize: 6,
      color: "#000000",
    });
    drawCenteredTextInRect(ctx, labels[index], rectFromFractions(thirds[index], { x: 0.02, y: 0.66, width: 0.96, height: 0.20 }), {
      font: "Helvetica-Bold",
      maxSize: index === 1 ? 4.2 : 4.7,
      minSize: 2.8,
      color: "#000000",
    });
  });

  maskRect(ctx, rectFromFractions(spellBox, { x: 0.18, y: 0.84, width: 0.64, height: 0.12 }));
  drawCenteredTextInRect(ctx, "SPELLCASTING", rectFromFractions(spellBox, { x: 0.14, y: 0.80, width: 0.72, height: 0.13 }), {
    font: "Helvetica-Bold",
    maxSize: 4.8,
    minSize: 3.2,
    color: "#000000",
  });

  if (hasClassResource) {
    const primaryResource = classResources[0];
    drawShellMetricCard(ctx, assets, spellcastingRect({ x: 133, y: 1, width: 60, height: 48 }), {
      value: primaryResource.value,
      label: primaryResource.name,
      cadence: primaryResource.cadence,
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
  const abilityRegion = canRecompose
    ? { ...FRONT_PAGE_REGIONS.abilities, y: 136 }
    : FRONT_PAGE_REGIONS.abilities;
  if (canRecompose) {
    maskRect(ctx, { x: 0, y: 136, width: 394, height: 164 });
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
        maskRect(ctx, componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.labelMask));
      }
      if (row.saveProficient) {
        const saveMarker = componentPoint(block, STAT_BLOCK_VIEWBOX, { x: 27.7, y: 3 });
        fillCircle(ctx, saveMarker.x, saveMarker.y, componentRadius(block, STAT_BLOCK_VIEWBOX, 2.1), "#000000");
      }
      drawSocketText(ctx, signed(row.saveBonus), componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.save), {
        font: "Helvetica-Bold",
        maxSize: 10.4,
        minSize: 4.4,
        color: "#000000",
      });
      drawSocketText(ctx, `${row.score}`, componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.score), {
        font: "Helvetica-Bold",
        maxSize: 15.4,
        minSize: 8,
        color: "#000000",
      });
      if (!hasPrintedTemplate) {
        drawCenteredTextInRect(ctx, slot.label, componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.label), {
          font: "Helvetica",
          maxSize: 7.2,
          minSize: 5,
          color: "#000000",
        });
      }
      drawSocketText(ctx, signed(row.modifier), componentRect(block, STAT_BLOCK_VIEWBOX, STAT_VALUE_SLOTS.modifier), {
        font: "Helvetica-Bold",
        maxSize: 8.6,
        minSize: 5,
        color: "#000000",
      });
    });
  }

  if (assets.skillBlock || assets.generalContainer) {
    if (drawShell || canRecompose) {
      drawCenteredTextInRect(ctx, "ABILITY CHECKS", { x: 204, y: abilityRegion.y - 0.5, width: 170, height: 8 }, {
        maxSize: 4.4,
        minSize: 3.5,
        color: "#9a9a9a",
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

        drawSocketText(ctx, signed(row.total), componentRect(block, SKILL_BLOCK_VIEWBOX, {
          x: SKILL_ROW_SLOTS.bonusValue.x,
          y: centerY + SKILL_ROW_SLOTS.bonusValue.yOffset,
          width: SKILL_ROW_SLOTS.bonusValue.width,
          height: SKILL_ROW_SLOTS.bonusValue.height,
        }), {
          font: "Helvetica-Bold",
          maxSize: 5.1,
          minSize: 2.5,
          color: "#000000",
        });
        if (!hasPrintedTemplate || canRecompose) {
          drawFittedText(ctx, skill, componentRect(block, SKILL_BLOCK_VIEWBOX, {
            x: SKILL_ROW_SLOTS.label.x,
            y: centerY + SKILL_ROW_SLOTS.label.yOffset,
            width: SKILL_ROW_SLOTS.label.width,
            height: SKILL_ROW_SLOTS.label.height,
          }), {
            font: "Helvetica",
            maxSize: 5.45,
            minSize: 3.1,
            color: "#000000",
          });
        }
      });
      if (!hasPrintedTemplate || canRecompose) {
        maskRect(ctx, componentRect(block, SKILL_BLOCK_VIEWBOX, { x: 24, y: 52, width: 30, height: 8 }));
        drawCenteredTextInRect(ctx, slot.ability, componentRect(block, SKILL_BLOCK_VIEWBOX, { x: 0, y: 53, width: 78, height: 7 }), {
          font: "Helvetica-Bold",
          maxSize: 5.2,
          minSize: 3.8,
          color: "#9a9a9a",
        });
      }
    });
  }
}

function renderPassives(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, drawShell: boolean) {
  if (drawShell) {
    drawSvg(ctx, assets.passivesAndSpeeds, { ...FRONT_PAGE_REGIONS.passives, y: FRONT_PAGE_REGIONS.passives.y - 7 });
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
    drawCenteredTextInRect(ctx, value, rectFromFractions(cell, { x: 0.06, y: 0.07, width: 0.88, height: 0.40 }), {
      font: "Helvetica-Bold",
      maxSize: 10.2,
      minSize: 4.2,
      color: "#000000",
    });
  });
}

function renderProficiencies(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const cells = splitColumns(insetRect(FRONT_PAGE_REGIONS.proficiencies, 8, 0), 5, 13);
  const groups = character.frontPage.proficiencyGroups;
  const values = [groups.weapons, groups.armor, groups.tools, groups.vehicles, groups.languages];
  const labels = ["WEAPONS", "ARMOR", "TOOLS & INSTR.", "VEHICLES", "LANGUAGES"];

  values.forEach((items, index) => {
    drawSvg(ctx, assets.proficiencyBox0, cells[index]);
    drawCenteredTextInRect(ctx, labels[index], rectFromFractions(cells[index], { x: 0.22, y: 0.87, width: 0.56, height: 0.08 }), {
      font: "Helvetica-Bold",
      maxSize: 3.0,
      minSize: 2.0,
      color: "#333333",
    });
    if (!items.length) {
      return;
    }
    const itemText = items.join(", ");
    const itemMaxSize = itemText.length <= 18
      ? 6.4
      : itemText.length <= 40
        ? 5.6
        : itemText.length <= 70
          ? 4.8
          : 4.2;
    drawCenteredTextInRect(ctx, itemText, rectFromFractions(cells[index], { x: 0.08, y: 0.18, width: 0.82, height: 0.56 }), {
      maxSize: itemMaxSize,
      minSize: 2.1,
      align: "left",
      color: "#000000",
      lineGap: 0,
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
  columns.forEach((column) => {
    drawCenteredTextInRect(
      ctx,
      column.label,
      { x: column.rect.x, y: rect.y, width: column.rect.width, height: headerHeight },
      { font: "Helvetica-Bold", maxSize: 3.5, minSize: 2.4, color: "#555555" },
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

      if (column.key === "name") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 4.6, minSize: 3, align: "left" });
      } else if (column.key === "hit") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 5.3, minSize: 3.3 });
      } else if (column.key === "damage") {
        drawWeaponCell(ctx, assets, cell, value, { maxSize: 4.9, minSize: 3.1 });
      } else if (column.key === "type") {
        drawWeaponCell(ctx, assets, cell, abbreviateDamageType(value), { maxSize: 3.7, minSize: 2.4, bold: false, align: "left" });
      } else {
        drawWeaponCell(ctx, assets, cell, abbreviateWeaponProperties(value), { maxSize: 2.8, minSize: 2.4, bold: false, align: "left" });
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
    maxSize: 4.2,
    minSize: 3,
    color: "#555555",
  });

  // --- Cantrips row (two-cell layout matching leveled spell rows) ---
  const cantripNames = formatSpellEntriesForFrontPage(cantrips, "cantrip");
  const cantripY = contentRect.y + 9;
  const leftCellW = SPELL_LEFT_CELL_W;
  // Left cell: "Cantrips" label at top, no circles
  drawFittedText(ctx, "Cantrips", { x: contentRect.x, y: cantripY, width: leftCellW, height: 8 }, {
    font: "Helvetica-Bold",
    maxSize: 4.0,
    minSize: 4.0,
    align: "right",
    color: "#222222",
    lineBreak: false,
  });
  // Right cell: cantrip spell names
  drawFittedText(
    ctx,
    cantripNames,
    {
      x: contentRect.x + leftCellW + SPELL_TEXT_GAP,
      y: cantripY,
      width: contentRect.width - leftCellW - SPELL_TEXT_GAP,
      height: 8,
    },
    { font: "Helvetica", maxSize: 3.7, minSize: 3.7, align: "left", color: "#222222", lineBreak: false },
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
      maxSize: 3.1,
      minSize: 2.5,
      align: "right",
      color: "#555555",
      lineBreak: false,
    });
  }

  // --- Spell slots and spell names by level ---
  const slotsY = cantripY + 6.5 + pactLineHeight;
  const slotsAreaHeight = Math.max(1, Math.min(contentRect.height - (slotsY - contentRect.y), targetBottomY - slotsY));
  const highestSpellLevel = spellsByLevel.reduce((max, entry) => Math.max(max, entry.level), 0);
  const maxTrackedLevel = Math.max(
    highestSpellLevel,
    standardSlots.length ? Math.max(...standardSlots.map((entry) => entry.level)) : 0,
  );

  if (maxTrackedLevel > 0) {
    // Three compact level groups: 1-3, 4-6, 7-9. Cantrips stay full-width above.
    const levelGroups = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]
      .map((group) => group.filter((level) => level <= maxTrackedLevel))
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
  const labelH = 4;
  const minLeftBlockHeight = labelH + SPELL_LEVEL_CIRCLE_GAP + circleSize;
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

    // LEFT CELL — "Level N" label right-aligned at top, circles directly below
    const labelRect: PdfRect = {
      x: rowRect.x,
      y: rowTop,
      width: leftCellW,
      height: labelH,
    };
    drawFittedText(ctx, `Level ${level}`, labelRect, {
      font: "Helvetica-Bold",
      maxSize: 4.0,
      minSize: 4.0,
      align: "right",
      color: "#555555",
      lineBreak: false,
    });

    // Circles sit directly below the right-aligned label, making the left cell a compact unit.
    const circleAreaTop = labelRect.y + labelRect.height + SPELL_LEVEL_CIRCLE_GAP;
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
      maxSize: 3.7,
      minSize: 3.2,
      align: "left",
      color: "#222222",
      lineGap: SPELL_TEXT_LINE_GAP,
      lineBreak: true,
      ellipsis: false,
    });
  });
}

function renderCombatSpellcastingHub(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const topMargin = 6;
  const contentTopPad = 6;
  const contentBottomPad = 6;
  const weaponHeaderHeight = 7;
  const weaponHeaderGap = 1.5;
  const weaponRowAreaTargetHeight = 52;
  const rect = {
    ...FRONT_PAGE_REGIONS.attacks,
    y: FRONT_PAGE_REGIONS.attacks.y + topMargin,
    height: contentTopPad + weaponHeaderHeight + weaponHeaderGap + weaponRowAreaTargetHeight + contentBottomPad,
  };
  maskRect(ctx, rect);
  drawSvg(ctx, assets.generalContainer, rect);

  const content = {
    x: rect.x + 9,
    y: rect.y + contentTopPad,
    width: rect.width - 18,
    height: rect.height - contentTopPad - contentBottomPad,
  };
  const combatHub = character.frontPage.combatHub;

  if (!combatHub.hasSpells) {
    // Non-spellcaster: full-width weapon column
    renderWeaponAttackRows(ctx, assets, content, combatHub.weaponRows);
    return;
  }

  // Spellcaster: give the spell list extra width while keeping the weapon table stable.
  const columnGap = 3;
  const weaponWidth = content.width * 0.48;
  const weaponRect = { x: content.x, y: content.y, width: weaponWidth, height: content.height };
  const spellRect = {
    x: weaponRect.x + weaponRect.width + columnGap,
    y: content.y,
    width: content.x + content.width - (weaponRect.x + weaponRect.width + columnGap),
    height: content.height,
  };

  renderWeaponAttackRows(ctx, assets, weaponRect, combatHub.weaponRows);
  const weaponRowAreaY = weaponRect.y + weaponHeaderHeight + weaponHeaderGap;
  const weaponRowAreaHeight = Math.min(weaponRowAreaTargetHeight, weaponRect.height - weaponHeaderHeight - weaponHeaderGap);
  const weaponRowRects = splitRows({ x: weaponRect.x, y: weaponRowAreaY, width: weaponRect.width, height: weaponRowAreaHeight }, 6, 1.0);
  const weaponSixthRow = weaponRowRects[5] ?? weaponRowRects[weaponRowRects.length - 1];
  const spellTargetBottomY = weaponSixthRow ? weaponSixthRow.y + weaponSixthRow.height : spellRect.y + spellRect.height;
  renderSpellTracker(ctx, assets, spellRect, combatHub.spellColumn, character.spellCards, spellTargetBottomY);
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

function summarizeCardParts(title: string, category: string, summary: string, detail: string | undefined, tags: string[], element?: { sheet?: { action?: string } }, level = 5) {
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
  bottomPadding: 10,
  compact: false,
};

const MIN_FEATURE_CONFIG: FeatureLayoutConfig = {
  bodyMaxSize: 4.2,
  // Minimum body font size floor for print legibility.
  // 4.0pt ensures text remains readable when printed at standard resolution;
  // 3.0 was too small to render clearly on most consumer printers.
  bodyMinSize: 4.0,
  lineGap: 0.8,
  featureGap: 5,
  bottomPadding: 8,
  compact: true,
};

function summarizeCompactTraitCard(card: PdfRightColumnCompactTrait) {
  return summarizeCardParts(card.title, "Trait", card.summary, undefined, []);
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
  if (usageRatio < 0.85 && config.bodyMaxSize < 8.0) {
    // How much headroom do we have?
    const headroomRatio = 1 / Math.max(0.3, usageRatio); // e.g., 0.5 → 2x headroom
    const scaledSize = Math.min(
      8.0, // hard ceiling
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
      const cardHeight = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad + Math.max(h1, h2);
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
  const titleFSize = FEATURE_CARD_TYPOGRAPHY.title.max;
  const metaFSize = FEATURE_CARD_TYPOGRAPHY.meta.max;

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
    return FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad + bodyHeight;
  } else {
    return FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.metaRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad + bodyHeight;
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
  // Tokenize: longest phrase first, case-insensitive
  const tokens: TextRun[] = [];
  const actionWords: [string][] = [
    ["bonus action"],
    ["legendary action"],
    ["reaction"],
    ["free object interaction"],
    ["object interaction"],
    ["action"],
  ];
  let remaining = text;
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
      // Measure width with correct font set (PDFKit API)
      doc.save();
      doc.font(run.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fSize);
      const w2 = doc.widthOfString(w);
      doc.restore();

      if (lineX + w2 > opts.x + maxW && lineX > opts.x) {
        // Start new line
        cursorY += lineH;
        lineX = opts.x;
        lineRemaining = maxW;
      }

      // Render this run with lineBreak: false to prevent PDFKit auto page breaks
      if (cursorY > opts.y + opts.height) break;
      doc.save();
      doc.font(run.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fSize).fillColor(opts.color).text(w, lineX, cursorY, { lineBreak: false });
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
  const titleFSize = FEATURE_CARD_TYPOGRAPHY.title.max;
  const metaFSize = FEATURE_CARD_TYPOGRAPHY.meta.max;
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
    const headerH = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
    return { headerH, bodyH: bodyLines * lineH };
  } else {
    const headerH = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.metaRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
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
  const titleFSize = FEATURE_CARD_TYPOGRAPHY.title.max;
  const metaFSize = FEATURE_CARD_TYPOGRAPHY.meta.max;

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
    bodyTopOffset = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
    ctx.doc.text(summary.title.toUpperCase(), x, y, { lineBreak: false });
    ctx.doc.restore();

    const metaStartX = x + renderedTitleWidth + gapAfterTitle;
    const metaAvailableWidth = Math.max(4, width - renderedTitleWidth - gapAfterTitle);
    drawFeatureMetaBlock(ctx, summary, {
      x: metaStartX, y, width: metaAvailableWidth, height: FEATURE_CARD_TYPOGRAPHY.titleRowHeight,
    });
  } else {
    // Two-row: title, then meta row, then body — body always starts at titleRowHeight + bodyTopPad from y
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
    ctx.doc.text(summary.title.toUpperCase(), x, y, { lineBreak: false });
    ctx.doc.restore();

    if (hasMeta) {
      const metaRowY = y + FEATURE_CARD_TYPOGRAPHY.titleRowHeight;
      drawFeatureMetaBlock(ctx, summary, {
        x, y: metaRowY, width, height: FEATURE_CARD_TYPOGRAPHY.metaRowHeight,
      });
    }
    bodyTopOffset = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
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
      const titleFSize = FEATURE_CARD_TYPOGRAPHY.title.max;
      const metaFSize = FEATURE_CARD_TYPOGRAPHY.meta.max;

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
        const bodyTopOffset = FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
        ctx.doc.save();
        ctx.doc.font("Helvetica-Bold").fontSize(titleFSize).fillColor("#000000");
        ctx.doc.text(summary.title.toUpperCase(), column.x, column.y, { lineBreak: false });
        ctx.doc.restore();

        const metaStartX = column.x + renderedTitleWidth + gapAfterTitle;
        const metaAvailableWidth = Math.max(4, column.width - renderedTitleWidth - gapAfterTitle);
        drawFeatureMetaBlock(ctx, summary, {
          x: metaStartX, y: column.y, width: metaAvailableWidth, height: FEATURE_CARD_TYPOGRAPHY.titleRowHeight,
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
          const metaRowY = column.y + FEATURE_CARD_TYPOGRAPHY.titleRowHeight;
          drawFeatureMetaBlock(ctx, summary, {
            x: column.x, y: metaRowY, width: column.width, height: FEATURE_CARD_TYPOGRAPHY.metaRowHeight,
          });
          // Move column.y past meta row — body will start at titleRowHeight + bodyTopPad from original y
          column.y = metaRowY + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
        } else {
          // No meta — body starts at titleRowHeight + bodyTopPad from original y
          column.y += FEATURE_CARD_TYPOGRAPHY.titleRowHeight + FEATURE_CARD_TYPOGRAPHY.bodyTopPad;
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
    ["class", { id: "class", title: "CLASS FEATURES", cards: [] }],
    ["subclass", { id: "subclass", title: "SUBCLASS FEATURES", cards: [] }],
    ["feat", { id: "feat", title: "FEATS", cards: [] }],
    ["additional", { id: "additional", title: "ADDITIONAL FEATURES", cards: [] }],
    ["other", { id: "other", title: "OTHER / CONDITIONAL", cards: [] }],
  ]);

  cards.forEach((card) => {
    groups.get(toFeatureDeckGroupId(card))?.cards.push(card);
  });

  return [...groups.values()].filter((group) => group.cards.length);
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
  const gap = 7;
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

    const titleY = groupRect.y + 12;
    const displayTitle = getFeatureGroupDisplayTitle(group);
    drawFittedText(ctx, displayTitle.toUpperCase(), { x: groupRect.x + 5, y: titleY, width: groupRect.width - 10, height: 5 }, {
      font: "Helvetica-Bold",
      maxSize: 3.8,
      minSize: 3.0,
      color: "#1a1a1a",
    });

    const listRect = {
      x: groupRect.x + 5,
      y: groupRect.y + 18,
      width: groupRect.width - 10,
      height: groupRect.height - fitCfg.bottomPadding - 15,
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
    maxSize: 4.7,
    minSize: 3.4,
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
      maxSize: 4.15,
      minSize: 3,
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
    drawFittedText(ctx, `${title} Traits`, { x: content.x, y: nextY, width: content.width, height: 6 }, {
      font: "Helvetica-Bold",
      maxSize: FEATURE_CARD_TYPOGRAPHY.title.max,
      minSize: FEATURE_CARD_TYPOGRAPHY.title.min,
      color: "#333333",
    });
    strokeRule(ctx, content.x, nextY + 6.2, content.width, "#bdbdbd");
    nextY += 8.4;
  }

  cards.forEach((card, index) => {
    const summary = summarizeCompactTraitCard(card);
    const titleFSize = FEATURE_CARD_TYPOGRAPHY.title.max; // 5.5pt — same as Features section
    const bodyFontSize = FEATURE_CARD_TYPOGRAPHY.body.max;
    const bodyMinSize = FEATURE_CARD_TYPOGRAPHY.body.min;
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
      ctx.doc.font("Helvetica-Bold").fontSize(FEATURE_CARD_TYPOGRAPHY.meta.max);
      totalMetaWidth += ctx.doc.widthOfString(summary.actionHint) + 2;
      ctx.doc.restore();
    }
    if (summary.rechargeHint) {
      ctx.doc.save();
      ctx.doc.font("Helvetica").fontSize(FEATURE_CARD_TYPOGRAPHY.meta.max);
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

    const titleRowHeight = FEATURE_CARD_TYPOGRAPHY.titleRowHeight;
    const bodyTopPad = FEATURE_CARD_TYPOGRAPHY.bodyTopPad;

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
          height: FEATURE_CARD_TYPOGRAPHY.metaRowHeight,
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
  const headerRight = FRONT_PAGE_REGIONS.header.x + FRONT_PAGE_REGIONS.header.width;
  const railY = FRONT_PAGE_REGIONS.rail.y + 2;
  const railBottom = FRONT_PAGE_REGIONS.proficiencies.y + FRONT_PAGE_REGIONS.proficiencies.height;
  const rail = {
    x: FRONT_PAGE_REGIONS.rail.x,
    y: railY,
    width: headerRight - FRONT_PAGE_REGIONS.rail.x,
    height: Math.max(0, railBottom - railY),
  };
  const notesHeight = Math.min(70, Math.max(34, 20 + rightColumn.sensesAndConditions.length * 6));
  const notesRect = { x: rail.x, y: rail.y, width: rail.width, height: notesHeight };
  const featureRect = {
    x: rail.x,
    y: notesRect.y + notesRect.height + 6,
    width: rail.width,
    height: Math.max(0, rail.y + rail.height - (notesRect.y + notesRect.height + 6)),
  };

  renderRightColumnNotesCard(ctx, assets, rightColumn.sensesAndConditions, notesRect);
  renderRightColumnFeatureCard(ctx, assets, character, featureRect);
}

function renderFeatureDeck(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const cards = [
    ...character.frontPage.deck,
    ...character.frontPage.deckOverflow,
  ].filter(
    (card) =>
      card.kind !== "proficiency" &&
      card.kind !== "language" &&
      !cardHasGroup(card, "race") &&
      !cardHasGroup(card, "subrace"),
  );

  if (!cards.length) {
    return;
  }

  drawCenteredTextInRect(ctx, "FEATURES & TRAITS", { x: 10, y: 476, width: 575, height: 9 }, {
    font: "Helvetica-Bold",
    maxSize: 5.5,
    minSize: 4.3,
    color: "#222222",
  });
  // Push boxes down ~one title-text height below title so they don't crowd the heading
  renderGroupedFeatureDeck(ctx, assets, cards, { x: 10, y: 490, width: 575, height: 290 }, character.level);
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
  renderFeatureDeck(ctx, assets, character);

  doc.restore();
}
