import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, ResolvedPdfCharacter } from "@/lib/pdf/types";
import type { CharacterInventoryItem } from "@/lib/characters/types";
import {
  componentRect,
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
  maskRect,
  type PdfRect,
  type PdfRenderContext,
} from "@/lib/pdf/drawing";
import {
  PAGE2_INVENTORY_REGIONS,
  PAGE2_PRINT_SAFE_OFFSET,
  PAGE2_PRINT_SAFE_SCALE,
} from "@/lib/pdf/page2-layout";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

// Companion pages stay A4 portrait. The desired composition is translated
// into three balanced columns below the full-width decorative header:
// picture/abilities, core stats/senses, and actions.
const COMPANION_PAGE = {
  width: PAGE_SIZE.width,
  height: PAGE_SIZE.height,
  margin: 10,
  headerHeight: 69,
  bodyTop: 84,
  bodyBottom: 832,
  gutter: 9,
  leftWidth: 190,
  middleWidth: 170,
} as const;

// --- Typography constants for page 2 ---
const COLORS = {
  textPrimary: "#000000",
  textSecondary: "#333333",
  textTertiary: "#555555",
  border: "#231F20",
  line: "#999999",
} as const;

const TYPOGRAPHY = {
  sectionTitle: { maxSize: 9, minSize: 6 },
  body: { maxSize: 7.5, minSize: 5 },
  small: { maxSize: 6, minSize: 4 },
  currency: { maxSize: 8, minSize: 5 },
} as const;

// --- Currency constants ---
const CURRENCY_TYPES = ["cp", "sp", "ep", "gp", "pp"] as const;
const CURRENCY_LABELS = { cp: "COPPER", sp: "SILVER", ep: "ELECTRUM", gp: "GOLD", pp: "PLATINUM" } as const;

// Currency: 5 standalone _Proficiency box 1.svg (viewBox 66×43) boxes across
const CURRENCY_BOX_WIDTH = 32;
const CURRENCY_BOX_HEIGHT = 22;
const CURRENCY_BOX_GAP = 3;
const CURRENCY_LABEL_HEIGHT = 5;
const CURRENCY_LABEL_GAP = 1;

// Bonus box viewBox: 45×42. Used for the attuned numeric values
// (intentionally NOT passiveBox, which has "INSIGHT" baked into the asset).
const ATTUNED_BOX_SIZE = 20;
const ATTUNED_BOX_GAP = 3;

// --- Line constants ---
const LINE_WIDTH = 364;
const LINE_HEIGHT = 10;
const LINE_ROW_GAP = 2;

// --- Index column constants ---
const INDEX_HEADER_HEIGHT = 10;
const INDEX_ROW_HEIGHT = 8;
const INDEX_ROW_GAP = 1;
const INDEX_MAX_ROWS = 22;

// --- Stored/quest column constants ---
const STORED_ROW_HEIGHT = 9;
const STORED_ROW_GAP = 1;
const STORED_MAX_ROWS = 20; // distributed across the two stored columns
const QUEST_MAX_ROWS = 20;
const ADDITIONAL_TREASURE_ROWS = 4;

// --- Label strip constants ---
const LABEL_STRIP_HEIGHT = 12;

// ============================================================
// RENDERING HELPERS
// ============================================================

function drawSectionTitle(ctx: PdfRenderContext, title: string, rect: PdfRect) {
  // Inset the title comfortably below the upper frame edge so it never
  // overlaps the container's top border. 15pt of top padding gives the
  // generalContainer's decorative ornament enough room above the text.
  drawText(ctx, title, { x: rect.x + 6, y: rect.y + 14, width: rect.width - 12, height: 12 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.sectionTitle.maxSize,
    color: COLORS.textPrimary,
    lineBreak: false,
  });
}

function drawCenteredSectionTitle(ctx: PdfRenderContext, title: string, rect: PdfRect, options: { maxSize?: number; minSize?: number; topOffset?: number } = {}) {
  const maxSize = options.maxSize ?? TYPOGRAPHY.sectionTitle.maxSize;
  const minSize = options.minSize ?? TYPOGRAPHY.small.maxSize;
  const topOffset = options.topOffset ?? 14;
  drawCenteredTextInRect(ctx, title, { x: rect.x, y: rect.y + topOffset, width: rect.width, height: 12 }, {
    font: "Helvetica-Bold",
    maxSize,
    minSize,
    color: COLORS.textPrimary,
    lineBreak: false,
  });
}

function cleanHtmlText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip basic markdown markers from the text. Used as a final pass
 * after the rich-text renderer has already extracted the inline
 * spans. Supports: **bold**, *italic*, `code`, [link](url).
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

type InlineRun = { text: string; bold: boolean; italic: boolean };

/**
 * Tokenize a text line into inline runs of bold/italic/regular text
 * based on markdown markers (**bold**, *italic*).
 */
function tokenizeInlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  // Combined regex: **bold** | *italic*
  const regex = /(\*\*([^*\n][^*]*?)\*\*)|((?<!\*)\*([^*\n]+)\*(?!\*))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    }
    if (match[2] !== undefined) {
      // **bold**
      runs.push({ text: match[2], bold: true, italic: false });
    } else if (match[4] !== undefined) {
      // *italic*
      runs.push({ text: match[4], bold: false, italic: true });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }
  return runs;
}

type FreeformSegment = {
  kind: "heading" | "paragraph" | "blockquote" | "list" | "blank";
  text: string;
};

/**
 * Parse a freeform text block (used by Additional Treasure and Quest
 * Items) into markdown-aware segments. Recognizes:
 * - # / ## / ### headings
 * - > blockquote lines
 * - - or * list items
 * - blank lines as paragraph spacers
 */
function parseFreeformText(text: string): FreeformSegment[] {
  if (!text) return [];
  const lines = text.split("\n");
  const segments: FreeformSegment[] = [];
  let currentPara: string[] = [];
  let currentQuote: string[] = [];
  let currentList: string[] = [];

  const flushPara = () => {
    if (currentPara.length > 0) {
      const para = currentPara.join(" ").trim();
      if (para) segments.push({ kind: "paragraph", text: para });
      currentPara = [];
    }
  };
  const flushQuote = () => {
    if (currentQuote.length > 0) {
      segments.push({ kind: "blockquote", text: currentQuote.join(" ") });
      currentQuote = [];
    }
  };
  const flushList = () => {
    if (currentList.length > 0) {
      segments.push({ kind: "list", text: currentList.join("\n") });
      currentList = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushQuote();
      flushList();
      segments.push({ kind: "blank", text: "" });
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      flushPara();
      flushQuote();
      flushList();
      segments.push({ kind: "heading", text: line });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      currentQuote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      flushQuote();
      currentList.push(line.replace(/^[-*]\s+/, "• "));
      continue;
    }
    flushQuote();
    flushList();
    currentPara.push(line);
  }
  flushPara();
  flushQuote();
  flushList();

  return segments;
}

/**
 * Render a paragraph of text with inline **bold** and *italic* spans.
 * The text is wrapped to fit the available width. Returns the total
 * vertical height used.
 */
function drawRichParagraph(
  ctx: PdfRenderContext,
  text: string,
  rect: { x: number; y: number; width: number; maxHeight: number },
  options: { font: string; size: number; color: string; lineGap: number; italic?: boolean },
): number {
  if (!text) return 0;

  const runs = tokenizeInlineRuns(text);

  let y = rect.y;
  let cursorX = rect.x;

  for (const run of runs) {
    if (!run.text) continue;
    const isBold = run.bold;
    const isItalic = run.italic || options.italic;
    const font = isBold && isItalic
      ? "Helvetica-BoldOblique"
      : isBold
        ? "Helvetica-Bold"
        : isItalic
          ? "Helvetica-Oblique"
          : options.font;

    // Split on spaces so we can wrap.
    const words = run.text.split(/(\s+)/); // keep spaces
    for (const word of words) {
      if (!word) continue;
      ctx.doc.save();
      ctx.doc.font(font).fontSize(options.size);
      const wordWidth = ctx.doc.widthOfString(word);
      ctx.doc.restore();
      if (cursorX + wordWidth > rect.x + rect.width && cursorX > rect.x) {
        y += options.size + options.lineGap;
        cursorX = rect.x;
        if (y - rect.y > rect.maxHeight) return y - rect.y;
      }
      drawText(ctx, word, {
        x: cursorX,
        y,
        width: wordWidth + 1,
        height: options.size + options.lineGap,
      }, {
        font,
        size: options.size,
        color: options.color,
        lineBreak: false,
        lineGap: 0,
      });
      cursorX += wordWidth;
    }
  }
  return y + options.size + options.lineGap - rect.y;
}

// (FreeformSegment type is defined earlier in the file.)


/**
 * Strip the leading mechanics <ul>...</ul> block AND any <table> blocks
 * from an item's detailHtml so we can show just the rules/description
 * prose below the item name. Tables flatten into unreadable wall-of-
 * text when HTML is stripped (e.g. Cube of Force faces / charges lost
 * tables), so we drop them entirely.
 *
 * Also cleans up:
 * - Stray "TM™" placeholder artifacts (any 2+ char run of TM/™)
 * - Garbled character runs (e.g. mojibake from imported catalog
 *   entries with mismatched encoding) — sequences of 3+ non-ASCII
 *   characters that look like encoding garbage are replaced with "…"
 * - Stray non-ASCII chars that are alone (e.g. "™" with nothing
 *   before/after that makes sense in English prose)
 */
function extractItemDescription(detailHtml: string | undefined, fallback: string): string {
  if (!detailHtml) return fallback;
  // Drop the first <ul>...</ul> block (mechanics bullets).
  let stripped = detailHtml.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/i, "").trim();
  // Drop all <table>...</table> blocks (e.g. Cube of Force faces /
  // charges lost tables) — they flatten into unreadable prose.
  stripped = stripped.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, "").trim();

  let cleaned = cleanHtmlText(stripped);

  // Strip stray TM/™ placeholder artifacts. The user's imported
  // catalog emits things like "TM™" or "™™" as leftover templating
  // markers; drop them entirely (any run of TM/™ chars).
  cleaned = cleaned.replace(/(?:TM\s*)*™\s*/g, " ");
  cleaned = cleaned.replace(/\bTM\b\s*/g, " ");

  // Collapse runs of non-ASCII "garbled" characters (mojibake from
  // imported catalogs with mismatched encoding) to a single ellipsis.
  cleaned = cleaned.replace(/[^\x00-\x7F]{3,}/g, "…");

  // Collapse whitespace created by the above removals.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+/g, "\n").trim();

  return stripMarkdown(cleaned || fallback);
}

/**
 * Build the compact inline metadata line shown beneath an item name
 * in the description column. Mirrors the example format the user
 * asked for: "{rarity} | {category/type} | {weight} | {attunement}".
 */
function buildItemMetadataLine(item: CharacterInventoryItem): string {
  const parts: string[] = [];
  if (item.rarity) parts.push(item.rarity);
  if (item.itemType || item.family || item.category) {
    parts.push(item.itemType || item.family || item.category);
  }
  if (item.weight) parts.push(item.weight);
  if (item.attunable || item.attuned) {
    parts.push(item.attuned ? "Attuned" : "Attunement Required");
  }
  return parts.join(" · ");
}

// ============================================================
// RENDER INVENTORY PAGE
// ============================================================

function renderInventoryHeader(ctx: PdfRenderContext, _assets: PdfSvgAssetBundle) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryHeader;
  drawSvg(ctx, _assets.generalContainer, rect);
  drawCenteredTextInRect(ctx, "INVENTORY", { x: rect.x, y: rect.y + 4, width: rect.width, height: 10 }, {
    font: "Helvetica-Bold",
    maxSize: 10,
    minSize: 8,
    color: COLORS.textPrimary,
  });
}

function renderInventoryIndex(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: CharacterInventoryItem[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryIndex;
  drawSvg(ctx, assets.generalContainer, rect);

  // Use a generous top offset (20pt) so the title sits clearly below
  // the generalContainer's decorative upper border ornament.
  drawCenteredSectionTitle(ctx, "EQUIPPED", rect, { topOffset: 20 });

  // Column headers sit well below the title so the title's decorative
  // border doesn't visually crowd the first row of data.
  const colX = [rect.x + 4, rect.x + 18, rect.x + 132, rect.x + 160];
  const headerY = rect.y + 42;

  const headers = ["#", "Name", "Qty", "lb"];
  headers.forEach((h, i) => {
    drawText(ctx, h, { x: colX[i], y: headerY, width: 30, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textSecondary,
    });
  });

  const rowStartY = headerY + 8;
  const visibleItems = items.slice(0, INDEX_MAX_ROWS);
  const hasMore = items.length > INDEX_MAX_ROWS;

  visibleItems.forEach((item, index) => {
    const rowY = rowStartY + index * (INDEX_ROW_HEIGHT + INDEX_ROW_GAP);

    const truncatedName = item.name.length > 20 ? item.name.slice(0, 19) + "…" : item.name;
    const rowData = [
      String(index + 1),
      truncatedName,
      String(item.quantity),
      item.weight ?? "—",
    ];

    rowData.forEach((text, i) => {
      drawText(ctx, text, { x: colX[i], y: rowY + 1, width: i === 1 ? 110 : 30, height: 7 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textPrimary,
      });
    });
  });

  if (hasMore) {
    const lastY = rowStartY + INDEX_MAX_ROWS * (INDEX_ROW_HEIGHT + INDEX_ROW_GAP);
    const moreCount = items.length - INDEX_MAX_ROWS;
    drawText(ctx, `…${moreCount} more`, { x: rect.x + 4, y: lastY + 1, width: rect.width - 8, height: 7 }, {
      font: "Helvetica-Oblique",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textTertiary,
    });
  }
}

function renderItemDescriptions(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: CharacterInventoryItem[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.itemDescriptions;
  drawSvg(ctx, assets.generalContainer, rect);

  drawCenteredSectionTitle(ctx, "ITEM DESCRIPTIONS", rect, { topOffset: 18 });

  const describedItems = items.filter((item) => item.includeInItemDescriptions);

  if (describedItems.length === 0) {
    drawText(
      ctx,
      "No items requiring description.",
      { x: rect.x + 6, y: rect.y + 36, width: rect.width - 12, height: 12 },
      { font: "Helvetica-Oblique", size: TYPOGRAPHY.small.maxSize, color: COLORS.textTertiary },
    );
    return;
  }

  const contentStartY = rect.y + 34;
  const contentBottomY = rect.y + rect.height - 4;
  let currentY = contentStartY;

  const innerWidth = rect.width - 8;
  const textFont = "Helvetica";
  const lineGap = 0.3;

  // Fixed body size for ALL item descriptions. Small enough that the
  // full rules text fits for typical items without overflowing.
  const bodySize = 5.5;
  const titleSize = 7;

  for (const item of describedItems) {
    // Item name (bold, primary color) on the same line as inline
    // metadata (gray, same font size as the name).
    const metaLine = buildItemMetadataLine(item);
    if (currentY + titleSize + 2 > contentBottomY) break;

    // Measure the item name's width so the metadata sits right next to it.
    let nameWidth = 0;
    ctx.doc.save();
    ctx.doc.font("Helvetica-Bold").fontSize(titleSize);
    nameWidth = ctx.doc.widthOfString(item.name);
    ctx.doc.restore();
    const separator = metaLine ? "  —  " : "";
    const separatorWidth = ctx.doc.widthOfString(separator);
    const metaX = rect.x + 4 + nameWidth + separatorWidth;
    const metaWidth = Math.max(0, innerWidth - nameWidth - separatorWidth);

    // Bold black item name (with ellipsis if it doesn't fit alone)
    drawText(ctx, item.name, { x: rect.x + 4, y: currentY, width: innerWidth, height: titleSize + 1 }, {
      font: "Helvetica-Bold",
      size: titleSize,
      color: COLORS.textPrimary,
      lineGap: 0,
      ellipsis: true,
    });

    // Inline gray metadata (same font size as the name, sits right after)
    if (metaLine && metaWidth > 20) {
      if (separatorWidth > 0) {
        drawText(ctx, separator, { x: rect.x + 4 + nameWidth, y: currentY, width: separatorWidth + 1, height: titleSize + 1 }, {
          font: "Helvetica-Bold",
          size: titleSize,
          color: COLORS.textPrimary,
          lineGap: 0,
        });
      }
      drawText(ctx, metaLine, { x: metaX, y: currentY, width: metaWidth, height: titleSize + 1 }, {
        font: "Helvetica-Bold",
        size: titleSize,
        color: COLORS.textSecondary,
        lineGap: 0,
        ellipsis: true,
      });
    }
    currentY += titleSize + 1;

    // Item description from the item's <sheet> description. Fixed
    // body size so all items share the same font and the description
    // fits within the remaining vertical space.
    const description = extractItemDescription(
      item.sheetDescription || item.detailHtml,
      item.notes ?? item.name,
    );
    if (description) {
      ctx.doc.save();
      ctx.doc.font(textFont).fontSize(bodySize);
      const bodyHeight = ctx.doc.heightOfString(description, {
        width: innerWidth,
        lineBreak: true,
        lineGap,
      });
      ctx.doc.restore();

      const remainingForBody = contentBottomY - currentY - 2;
      const renderedHeight = Math.min(bodyHeight, Math.max(0, remainingForBody));
      if (renderedHeight > 3) {
        drawText(ctx, description, { x: rect.x + 4, y: currentY, width: innerWidth, height: renderedHeight }, {
          font: textFont,
          size: bodySize,
          color: COLORS.textPrimary,
          lineGap,
          lineBreak: true,
        });
        currentY += renderedHeight;
      }
    }

    currentY += 2; // tight breathing room between items
  }
}

function renderAttuned(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  attunedCount: number,
  maxAttuned: number,
) {
  // Same visual language as Currency: a single _Proficiency box 1.svg
  // with the value inside, and a small label above.
  const rect = PAGE2_INVENTORY_REGIONS.attuned;

  // Small "ATTUNED" label above the box.
  const labelY = rect.y + 3;
  drawCenteredTextInRect(ctx, "ATTUNED", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 5,
    color: COLORS.textPrimary,
    lineBreak: false,
  });

  // Single _Proficiency box 1.svg with the "0/3" value inside.
  const boxW = 28;
  const boxH = 18;
  const boxX = rect.x + (rect.width - boxW) / 2;
  const boxY = rect.y + 13;
  const boxRect: PdfRect = { x: boxX, y: boxY, width: boxW, height: boxH };
  drawSvg(ctx, assets.proficiencyBox1, boxRect);
  drawCenteredTextInRect(ctx, `${attunedCount}/${maxAttuned}`, boxRect, {
    font: "Helvetica-Bold",
    maxSize: 8,
    minSize: 6,
    color: COLORS.textPrimary,
    lineBreak: false,
  });
}

function renderValuables(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  valuables: string[],
) {
  // Valuables: a row of standalone _Proficiency box 1.svg boxes — same
  // visual language as Currency. Each box contains the valuable's name.
  // If there are no valuables, the entire section is hidden (no card,
  // no placeholder text).
  if (valuables.length === 0) {
    return;
  }

  const rect = PAGE2_INVENTORY_REGIONS.valuables;

  // Small "VALUABLES" label above the row.
  const labelY = rect.y + 4;
  drawCenteredTextInRect(ctx, "VALUABLES", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 5,
    color: COLORS.textPrimary,
    lineBreak: false,
  });

  // Fit as many boxes in the row as possible.
  const boxW = 30;
  const boxH = 18;
  const boxGap = 2;
  const sidePad = 4;
  const usableWidth = rect.width - 2 * sidePad;
  const boxesPerRow = Math.max(1, Math.floor((usableWidth + boxGap) / (boxW + boxGap)));
  const startX = rect.x + sidePad;
  const startY = rect.y + 14;
  const rowGap = 2;

  valuables.slice(0, boxesPerRow * 2).forEach((name, i) => {
    const row = Math.floor(i / boxesPerRow);
    const col = i % boxesPerRow;
    const boxX = startX + col * (boxW + boxGap);
    const boxY = startY + row * (boxH + rowGap);
    const boxRect: PdfRect = { x: boxX, y: boxY, width: boxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, name, boxRect, {
      font: "Helvetica-Bold",
      maxSize: 6,
      minSize: 4,
      color: COLORS.textPrimary,
      lineBreak: false,
      ellipsis: true,
    });
  });
}

function renderCurrency(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number },
) {
  // Standalone boxes — no big generalContainer frame around them.
  const rect = PAGE2_INVENTORY_REGIONS.currency;

  const totalBoxesWidth = 5 * CURRENCY_BOX_WIDTH + 4 * CURRENCY_BOX_GAP;
  const startOffset = Math.max(0, (rect.width - totalBoxesWidth) / 2);
  const labelY = rect.y + 3;
  const boxY = rect.y + 13;

  CURRENCY_TYPES.forEach((type, index) => {
    const boxX = rect.x + startOffset + index * (CURRENCY_BOX_WIDTH + CURRENCY_BOX_GAP);

    // Per-box label sits above the box (the per-box label acts as the title,
    // so we don't need a "CURRENCY" section header). Inset slightly so
    // the label doesn't crowd the very top of the section.
    drawCenteredTextInRect(ctx, CURRENCY_LABELS[type], {
      x: boxX,
      y: labelY,
      width: CURRENCY_BOX_WIDTH,
      height: CURRENCY_LABEL_HEIGHT,
    }, {
      font: "Helvetica-Bold",
      maxSize: 5,
      minSize: 3.5,
      color: COLORS.textSecondary,
    });

    const boxRect: PdfRect = { x: boxX, y: boxY, width: CURRENCY_BOX_WIDTH, height: CURRENCY_BOX_HEIGHT };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);

    drawCenteredTextInRect(ctx, String(currency[type]), boxRect, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.currency.maxSize,
      minSize: 5,
      color: COLORS.textPrimary,
    });
  });
}

function renderEncumbrance(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  carriedWeight: number,
  capacity: number,
) {
  // Same visual language as Currency: small label above, then 3
  // standalone _Proficiency box 1.svg boxes — one per value.
  const rect = PAGE2_INVENTORY_REGIONS.encumbrance;

  // Small "ENCUMBRANCE" label above the row.
  const labelY = rect.y + 3;
  drawCenteredTextInRect(ctx, "ENCUMBRANCE", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 5,
    color: COLORS.textPrimary,
    lineBreak: false,
  });

  const pushDragLift = capacity * 2;
  // Short labels so all three fit cleanly above their boxes.
  const values: Array<{ labelTop: string; value: string }> = [
    { labelTop: "CARRIED", value: `${carriedWeight} lb` },
    { labelTop: "CAPACITY", value: `${capacity} lb` },
    { labelTop: "PUSH/DRAG", value: `${pushDragLift} lb` },
  ];

  const boxW = 24;
  const boxH = 18;
  const boxGap = 3;
  const totalWidth = 3 * boxW + 2 * boxGap;
  const startX = rect.x + (rect.width - totalWidth) / 2;
  const boxY = rect.y + 13;
  const labelBoxY = rect.y + 11;

  values.forEach((entry, i) => {
    const boxX = startX + i * (boxW + boxGap);

    // Per-box label sits above the box.
    drawCenteredTextInRect(ctx, entry.labelTop, {
      x: boxX,
      y: labelBoxY,
      width: boxW,
      height: 4,
    }, {
      font: "Helvetica-Bold",
      maxSize: 4.5,
      minSize: 3.5,
      color: COLORS.textSecondary,
      lineBreak: false,
    });

    const boxRect: PdfRect = { x: boxX, y: boxY, width: boxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, entry.value, boxRect, {
      font: "Helvetica-Bold",
      maxSize: 6.5,
      minSize: 4.5,
      color: COLORS.textPrimary,
      lineBreak: false,
    });
  });
}

function renderLinedSection(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  title: string,
  lines: string[],
  lineCount: number,
) {
  drawSvg(ctx, assets.generalContainer, rect);
  drawSectionTitle(ctx, title, rect);

  // Title sits at y+9 (height 12), so body content starts comfortably
  // below it.
  const contentStartY = rect.y + 26;
  const lineGap = (rect.height - (contentStartY - rect.y) - 4) / lineCount;

  for (let i = 0; i < lineCount; i++) {
    const lineY = contentStartY + i * lineGap;
    const lineRect: PdfRect = { x: rect.x + 2, y: lineY, width: rect.width - 4, height: LINE_HEIGHT };
    drawSvg(ctx, assets.line, lineRect);

    if (lines[i]) {
      drawText(ctx, lines[i], { x: rect.x + 4, y: lineY + 1, width: rect.width - 8, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textSecondary,
      });
    }
  }
}

function renderAdditionalTreasure(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  additionalTreasureText: string,
) {
  // Show ALL content. Markdown-aware rendering: **text** → bold,
  // ### text → heading. No truncation, no raw markdown markers.
  const rect = PAGE2_INVENTORY_REGIONS.additionalTreasure;
  drawSvg(ctx, assets.generalContainer, rect);
  drawSectionTitle(ctx, "ADDITIONAL TREASURE", rect);

  const segments = parseFreeformText(additionalTreasureText);

  const contentStartY = rect.y + 32;
  const lineHeight = 6.5;
  const availableHeight = rect.y + rect.height - contentStartY - 4;
  const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));

  let y = contentStartY;
  let linesDrawn = 0;
  for (const seg of segments) {
    if (linesDrawn >= maxLines) break;
    if (y + lineHeight > rect.y + rect.height - 4) break;

    if (seg.kind === "heading") {
      if (linesDrawn + 1 > maxLines) break;
      drawText(ctx, stripMarkdown(seg.text), {
        x: rect.x + 4,
        y: y,
        width: rect.width - 8,
        height: lineHeight,
      }, {
        font: "Helvetica-Bold",
        size: 7,
        color: COLORS.textPrimary,
        lineBreak: true,
      });
      y += lineHeight;
      linesDrawn += 1;
    } else if (seg.kind === "blank") {
      y += lineHeight * 0.5;
    } else if (seg.kind === "blockquote") {
      // Indented, italic, grey
      if (linesDrawn + 1 > maxLines) break;
      const quoteHeight = drawRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 8, y, width: rect.width - 16, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += paraHeight;
      linesDrawn += Math.max(1, Math.round(paraHeight / lineHeight));
    }
  }
}

function renderStoredItems(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: Array<{ name: string; quantity: number; weight?: string }>,
) {
  // Stored Items: 2 columns within the card. All items shown — no
  // "X more" truncation. Distribute items evenly between the two
  // columns regardless of the available card height.
  const rect = PAGE2_INVENTORY_REGIONS.storedItems;
  drawSvg(ctx, assets.generalContainer, rect);
  drawCenteredSectionTitle(ctx, "STORED ITEMS", rect, { topOffset: 18 });

  const contentStartY = rect.y + 34;
  const contentEndY = rect.y + rect.height - 4;
  const availableHeight = contentEndY - contentStartY;
  const rowHeight = 8;
  // Distribute items so the two columns are roughly balanced.
  // perColumn caps at how many rows fit in the available height.
  const perColumn = Math.max(
    1,
    Math.min(
      Math.ceil(items.length / 2),
      Math.floor(availableHeight / rowHeight),
    ),
  );
  const colWidth = (rect.width - 12) / 2; // 6pt total padding
  const colGap = 4;

  items.forEach((item, index) => {
    const col = Math.floor(index / perColumn);
    const row = index % perColumn;
    if (col > 1) return; // max 2 columns
    const colX = rect.x + 4 + col * (colWidth + colGap);
    const lineY = contentStartY + row * rowHeight;

    const lineRect: PdfRect = { x: colX, y: lineY, width: colWidth, height: rowHeight - 2 };
    drawSvg(ctx, assets.line, lineRect);

    const itemLabel = `${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.name}`;
    drawText(ctx, itemLabel, {
      x: colX + 2,
      y: lineY + 1,
      width: colWidth - 24,
      height: rowHeight - 3,
    }, {
      font: "Helvetica",
      size: 5.5,
      color: COLORS.textPrimary,
      lineGap: 0,
    });

    if (item.weight) {
      drawText(ctx, `${item.weight}`, {
        x: colX + colWidth - 20,
        y: lineY + 1,
        width: 18,
        height: rowHeight - 3,
      }, {
        font: "Helvetica",
        size: 5,
        color: COLORS.textTertiary,
        align: "right",
        lineGap: 0,
      });
    }
  });
}

function renderQuestItems(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  questItemsText: string,
) {
  // Show ALL content from the quest items field. Markdown-aware:
  // **text** → bold, ### text → heading. No truncation, no raw
  // markdown markers.
  const rect = PAGE2_INVENTORY_REGIONS.questItems;
  drawSvg(ctx, assets.generalContainer, rect);
  drawCenteredSectionTitle(ctx, "QUEST ITEMS & TRINKETS", rect, { topOffset: 18 });

  const segments = parseFreeformText(questItemsText);

  const contentStartY = rect.y + 32;
  const lineHeight = 6.5;
  const availableHeight = rect.y + rect.height - contentStartY - 4;
  const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));

  let y = contentStartY;
  let linesDrawn = 0;
  for (const seg of segments) {
    if (linesDrawn >= maxLines) break;
    if (y + lineHeight > rect.y + rect.height - 4) break;

    if (seg.kind === "heading") {
      if (linesDrawn + 1 > maxLines) break;
      drawText(ctx, stripMarkdown(seg.text), {
        x: rect.x + 4,
        y: y,
        width: rect.width - 8,
        height: lineHeight,
      }, {
        font: "Helvetica-Bold",
        size: 7,
        color: COLORS.textPrimary,
        lineBreak: true,
      });
      y += lineHeight;
      linesDrawn += 1;
    } else if (seg.kind === "blank") {
      y += lineHeight * 0.5;
    } else if (seg.kind === "blockquote") {
      if (linesDrawn + 1 > maxLines) break;
      const quoteHeight = drawRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 8, y, width: rect.width - 16, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += paraHeight;
      linesDrawn += Math.max(1, Math.round(paraHeight / lineHeight));
    }
  }
}

function extractInventoryData(character: ResolvedPdfCharacter) {
  const items = character.source.inventoryItems ?? [];
  const currency = character.source.inventoryCurrency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  const equipment = items.filter((item) => item.equipped || item.attuned);
  const storedItems = items.filter((item) => !item.equipped && !item.attuned);

  const valuables = items
    .filter((item) => item.category === "valuables" || item.itemType === "valuable")
    .map((item) => item.name);

  const attunedCount = items.filter((item) => item.attuned).length;
  const maxAttuned = 3;

  const carriedWeight = equipment.reduce((sum, item) => {
    if (item.weight) {
      const weightNum = parseFloat(item.weight) * item.quantity;
      return sum + (isNaN(weightNum) ? 0 : weightNum);
    }
    return sum;
  }, 0);

  const strScore = character.stats.find((s) => s.id === "str")?.value ?? "10";
  const strNum = parseInt(strScore) ?? 10;
  const capacity = strNum * 15;

  return {
    equipment,
    storedItems,
    valuables,
    attunedCount,
    maxAttuned,
    carriedWeight,
    capacity,
    currency,
    additionalTreasure: character.source.equipmentNotes?.additionalTreasure ?? "",
    questItems: character.source.equipmentNotes?.questItems ?? "",
  };
}

export function renderInventoryPage(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  character: ResolvedPdfCharacter,
) {
  ctx.doc.addPage({ size: [PAGE_SIZE.width, PAGE_SIZE.height], margin: 0 });

  const doc = ctx.doc as unknown as { save: () => void; restore: () => void; translate: (x: number, y: number) => { scale: (s: number) => void } };
  doc.save();
  doc.translate(PAGE2_PRINT_SAFE_OFFSET.x, PAGE2_PRINT_SAFE_OFFSET.y).scale(PAGE2_PRINT_SAFE_SCALE);

  const data = extractInventoryData(character);

  // 1. Top: Inventory/Equipped (left) | Item Descriptions (right)
  renderInventoryHeader(ctx, assets);
  renderInventoryIndex(ctx, assets, data.equipment);
  renderItemDescriptions(ctx, assets, data.equipment);

  // 2. Middle utility row: 4 sections on the same row, same height
  //    Attuned | Valuables | Currency | Encumbrance
  //    One coordinated band — no grey headers, consistent framing.
  renderAttuned(ctx, assets, data.attunedCount, data.maxAttuned);
  renderValuables(ctx, assets, data.valuables);
  renderCurrency(ctx, assets, data.currency);
  renderEncumbrance(ctx, assets, Math.round(data.carriedWeight), data.capacity);

  // 3. Bottom 3 equal columns: Stored Items | Additional Treasure | Quest Items
  renderStoredItems(ctx, assets, data.storedItems);

  // Additional treasure only renders when the player has content. Otherwise
  // the slot stays empty (no card, no placeholder) per the user's request.
  if (data.additionalTreasure && data.additionalTreasure.trim().length > 0) {
    renderAdditionalTreasure(ctx, assets, data.additionalTreasure);
  }

  renderQuestItems(ctx, assets, data.questItems);

  doc.restore();
}

// ============================================================
// RENDER COMPANION PAGE
// ============================================================

type CompanionAbilityCell = {
  key: "str" | "dex" | "con" | "int" | "wis" | "cha";
  label: string;
  rect: PdfRect;
};

type CompanionRects = {
  header: PdfRect;
  leftColumn: PdfRect;
  middleColumn: PdfRect;
  rightColumn: PdfRect;
  picture: PdfRect;
  abilityCells: CompanionAbilityCell[];
  bonusBoxes: PdfRect[];
  hp: PdfRect;
  ac: PdfRect;
  speedLabel: PdfRect;
  speedBoxes: PdfRect[];
  skills: PdfRect;
  traits: PdfRect;
  actions: PdfRect;
  abilitiesBottom: number;
};

const STAT_VIEWBOX = { width: 55, height: 72 } as const;

// SVG viewBox dimensions for the bonus/HP/AC/passive assets used by the
// companion middle column. All masks/values below use these viewBox coords
// so they stay aligned with the SVG's internal text bands no matter how
// the rect is resized.
const BONUS_BOX_VIEWBOX = { width: 45, height: 42 } as const;
const HP_VIEWBOX = { width: 138, height: 42 } as const;
const AC_VIEWBOX = { width: 39, height: 44 } as const;
const PASSIVE_BOX_VIEWBOX = { width: 29, height: 34 } as const;

// Slots are written in viewBox units and follow each ornament's visible
// interior rather than its full outer bounds.
const BONUS_BOX_SLOTS = {
  value: { x: 3, y: 8, width: 39, height: 22 },
  label: { x: 2, y: 29, width: 41, height: 12 },
} as const;

const HP_SLOTS = {
  // Cell 0 (MAX HP) ends at x=36 in the source SVG.
  maxHpValue: { x: 0, y: 9, width: 32, height: 23 },
} as const;

const AC_SLOTS = {
  // Shield's inner body above the baked-in AC label.
  value: { x: 4, y: 10, width: 31, height: 23 },
} as const;

const PASSIVE_BOX_SLOTS = {
  // Top half: speed value. Bottom: speed mode label.
  value: { x: 2, y: 8, width: 25, height: 18 },
  label: { x: 1, y: 25, width: 27, height: 8 },
} as const;

/**
 * Several source SVG components include their placeholder labels as path
 * outlines rather than text nodes. Keep only the decorative frame paths so
 * companion values can be rendered without opaque masks touching the border.
 */
function frameOnlySvg(svg: string | undefined, framePathCount: number) {
  if (!svg) return undefined;
  let pathIndex = 0;
  return svg.replace(/<path\b[^>]*\/?>/g, (path) => {
    pathIndex += 1;
    return pathIndex <= framePathCount ? path : "";
  });
}

function computeCompanionLayout(): CompanionRects {
  const pageWidth = COMPANION_PAGE.width;
  const bodyHeight = COMPANION_PAGE.bodyBottom - COMPANION_PAGE.bodyTop;
  const leftX = COMPANION_PAGE.margin;
  const middleX = leftX + COMPANION_PAGE.leftWidth + COMPANION_PAGE.gutter;
  const rightX = middleX + COMPANION_PAGE.middleWidth + COMPANION_PAGE.gutter;
  const rightWidth = pageWidth - COMPANION_PAGE.margin - rightX;

  const leftColumn: PdfRect = {
    x: leftX,
    y: COMPANION_PAGE.bodyTop,
    width: COMPANION_PAGE.leftWidth,
    height: bodyHeight,
  };
  const middleColumn: PdfRect = {
    x: middleX,
    y: COMPANION_PAGE.bodyTop,
    width: COMPANION_PAGE.middleWidth,
    height: bodyHeight,
  };
  const rightColumn: PdfRect = {
    x: rightX,
    y: COMPANION_PAGE.bodyTop,
    width: rightWidth,
    height: bodyHeight,
  };

  const picture: PdfRect = {
    x: leftColumn.x,
    y: leftColumn.y,
    width: leftColumn.width,
    height: 260,
  };

  const abilityGapX = 7.5;
  const abilityGapY = 10;
  const abilityWidth = (leftColumn.width - abilityGapX * 2) / 3;
  const abilityHeight = abilityWidth * (STAT_VIEWBOX.height / STAT_VIEWBOX.width);
  const abilityTop = picture.y + picture.height + 12;
  const abilitySpecs = [
    ["str", "STR"],
    ["dex", "DEX"],
    ["con", "CON"],
    ["int", "INT"],
    ["wis", "WIS"],
    ["cha", "CHA"],
  ] as const;
  const abilityCells = abilitySpecs.map(([key, label], index) => ({
    key,
    label,
    rect: {
      x: leftColumn.x + (index % 3) * (abilityWidth + abilityGapX),
      y: abilityTop + Math.floor(index / 3) * (abilityHeight + abilityGapY),
      width: abilityWidth,
      height: abilityHeight,
    },
  }));

  const bonusGap = 5;
  const bonusWidth = (middleColumn.width - bonusGap * 2) / 3;
  const bonusHeight = bonusWidth * (42 / 45);
  const bonusBoxes = Array.from({ length: 3 }, (_, index) => ({
    x: middleColumn.x + index * (bonusWidth + bonusGap),
    y: middleColumn.y,
    width: bonusWidth,
    height: bonusHeight,
  }));

  const hpRowY = middleColumn.y + bonusHeight + 12;
  const acWidth = 42;
  const hpWidth = middleColumn.width - acWidth - 6;
  const hpHeight = hpWidth * (42 / 138);
  const hp: PdfRect = {
    x: middleColumn.x,
    y: hpRowY + Math.max(0, (44 - hpHeight) / 2),
    width: hpWidth,
    height: hpHeight,
  };
  const ac: PdfRect = {
    x: middleColumn.x + hpWidth + 6,
    y: hpRowY,
    width: acWidth,
    height: 44,
  };

  // Keep the speed row visually attached to HP/AC while retaining enough
  // breathing room for the centered SPEED caption.
  const speedTop = hpRowY + 45;
  const speedLabel: PdfRect = {
    x: middleColumn.x,
    y: speedTop,
    width: middleColumn.width,
    height: 8,
  };
  const speedBoxGap = (middleColumn.width - 29 * 5) / 4;
  const speedBoxes = Array.from({ length: 5 }, (_, index) => ({
    x: middleColumn.x + index * (29 + speedBoxGap),
    y: speedTop + 8,
    width: 29,
    height: 34,
  }));
  const skillsTop = speedTop + 47;
  // Bottom of the abilities column: the last ability cell (row 1, index 5)
  // ends at abilityTop + 2*abilityHeight + abilityGapY. Use this as the
  // visual floor for the right-column cards.
  const abilitiesBottom = abilityTop + abilityHeight * 2 + abilityGapY;
  const cardBottomLimit = abilitiesBottom - 12; // 12pt padding below abilities
  const skills: PdfRect = {
    x: middleColumn.x,
    y: skillsTop,
    width: middleColumn.width,
    height: Math.max(0, Math.min(COMPANION_PAGE.bodyBottom - skillsTop, cardBottomLimit - skillsTop)),
  };

  // Re-derive the right-column cards so the bottom edge respects the abilities
  // column bottom. Split the available band (rightColumn.y → cardBottomLimit)
  // 50/50 with a 6pt gutter between TRAITS (top) and ACTIONS (bottom).
  const rightAvailableHeight = Math.max(0, cardBottomLimit - rightColumn.y);
  const traitsHeight = Math.floor((rightAvailableHeight - 6) / 2);

  return {
    header: {
      x: COMPANION_PAGE.margin,
      y: 7,
      width: pageWidth - COMPANION_PAGE.margin * 2,
      height: COMPANION_PAGE.headerHeight,
    },
    leftColumn,
    middleColumn,
    rightColumn,
    picture,
    abilityCells,
    bonusBoxes,
    hp,
    ac,
    speedLabel,
    speedBoxes,
    skills,
    traits: {
      ...rightColumn,
      height: traitsHeight,
    },
    actions: {
      ...rightColumn,
      y: rightColumn.y + traitsHeight + 6,
      height: Math.max(0, rightAvailableHeight - traitsHeight - 6),
    },
    abilitiesBottom,
  };
}

function drawCompanionHeaderLine(ctx: PdfRenderContext, rect: PdfRect) {
  const doc = ctx.doc as unknown as {
    save: () => void;
    restore: () => void;
    strokeColor: (color: string) => {
      lineWidth: (width: number) => {
        dash: (length: number, options: { space: number }) => {
          moveTo: (x: number, y: number) => {
            lineTo: (x: number, y: number) => {
              stroke: () => {
                undash: () => void;
              };
            };
          };
        };
      };
    };
  };
  doc.save();
  doc
    .strokeColor("#a7a7a7")
    .lineWidth(0.25)
    .dash(0.7, { space: 0.8 })
    .moveTo(rect.x, rect.y)
    .lineTo(rect.x + rect.width, rect.y)
    .stroke()
    .undash();
  doc.restore();
}

function drawCompanionHeaderField(
  ctx: PdfRenderContext,
  label: string,
  value: string,
  rect: PdfRect,
) {
  drawText(ctx, label.toUpperCase(), {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: 6,
  }, {
    font: "Helvetica",
    size: 3.5,
    color: "#777777",
    lineBreak: false,
  });
  drawCompanionHeaderLine(ctx, {
    x: rect.x,
    y: rect.y + rect.height - 1,
    width: rect.width,
    height: 0,
  });
  if (value) {
    drawFittedText(ctx, value, {
      x: rect.x,
      y: rect.y + 6,
      width: rect.width,
      height: rect.height - 7,
    }, {
      font: "Helvetica",
      maxSize: 6.4,
      minSize: 4.2,
      color: "#000000",
      lineBreak: false,
      ellipsis: true,
    });
  }
}

function renderCompanionHeader(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  data: {
    name: string;
    creature: string;
    owner: string;
    size: string;
    type: string;
    alignment: string;
  },
) {
  drawSvg(ctx, assets.frontPageHeaderShell || assets.frontPageHeader, rects.header);

  drawFittedText(ctx, data.name, {
    x: rects.header.x + 58,
    y: rects.header.y + 35,
    width: 150,
    height: 17,
  }, {
    font: "Times-Bold",
    maxSize: 17,
    minSize: 9,
    color: "#000000",
    lineBreak: false,
  });

  const rightX = rects.header.x + 247;
  const rightWidth = rects.header.width - 267;
  drawCompanionHeaderField(ctx, "Creature", data.creature, {
    x: rightX,
    y: rects.header.y + 25,
    width: 105,
    height: 16,
  });
  drawCompanionHeaderField(ctx, "Owner", data.owner, {
    x: rightX + 110,
    y: rects.header.y + 25,
    width: rightWidth - 110,
    height: 16,
  });
  drawCompanionHeaderField(ctx, "Size", data.size, {
    x: rightX,
    y: rects.header.y + 43,
    width: 86,
    height: 15,
  });
  drawCompanionHeaderField(ctx, "Type", data.type, {
    x: rightX + 91,
    y: rects.header.y + 43,
    width: 100,
    height: 15,
  });
  drawCompanionHeaderField(ctx, "Alignment", data.alignment, {
    x: rightX + 196,
    y: rects.header.y + 43,
    width: rightWidth - 196,
    height: 15,
  });
}

function renderCompanionPicture(ctx: PdfRenderContext, rect: PdfRect) {
  const doc = ctx.doc as unknown as {
    save: () => void;
    restore: () => void;
    rect: (x: number, y: number, width: number, height: number) => {
      lineWidth: (width: number) => {
        strokeColor: (color: string) => {
          stroke: () => void;
        };
      };
    };
  };
  doc.save();
  doc.rect(rect.x, rect.y, rect.width, rect.height)
    .lineWidth(0.8)
    .strokeColor("#b8b8b8")
    .stroke();
  doc.restore();
  drawCenteredTextInRect(ctx, "Picture", rect, {
    font: "Helvetica",
    maxSize: 14,
    minSize: 10,
    color: "#111111",
  });
}

function renderCompanionAbilities(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  scores: Record<CompanionAbilityCell["key"], number>,
) {
  const slots = {
    save: { x: 11, y: 7.2, width: 33, height: 9.2 },
    score: { x: 10.5, y: 26.8, width: 34, height: 15.5 },
    label: { x: 10, y: 45, width: 35, height: 8 },
    modifier: { x: 12, y: 57.2, width: 31, height: 10.6 },
  } satisfies Record<string, PdfRect>;

  for (const cell of rects.abilityCells) {
    drawSvg(ctx, assets.statBlock, cell.rect, "contain");
    const score = scores[cell.key];
    const modifier = Math.floor((score - 10) / 2);
    const valueOptions = {
      font: "Helvetica-Bold",
      minSize: 5,
      color: "#000000",
    } as const;

    drawCenteredTextInRect(ctx, formatModifier(modifier), componentRect(cell.rect, STAT_VIEWBOX, slots.save), {
      ...valueOptions,
      maxSize: 8.4,
    });
    drawCenteredTextInRect(ctx, String(score), componentRect(cell.rect, STAT_VIEWBOX, slots.score), {
      ...valueOptions,
      maxSize: 14.5,
      minSize: 8,
    });
    maskRect(ctx, componentRect(cell.rect, STAT_VIEWBOX, {
      x: 13.5,
      y: 43.8,
      width: 28,
      height: 8,
    }));
    drawCenteredTextInRect(ctx, cell.label, componentRect(cell.rect, STAT_VIEWBOX, slots.label), {
      font: "Helvetica",
      maxSize: 7,
      minSize: 5,
      color: "#000000",
    });
    drawCenteredTextInRect(ctx, formatModifier(modifier), componentRect(cell.rect, STAT_VIEWBOX, slots.modifier), {
      ...valueOptions,
      maxSize: 8.2,
    });
  }
}

function renderCompanionBonusBox(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  value: string,
  label: string,
) {
  drawSvg(ctx, frameOnlySvg(assets.bonusBox, 2), rect, "contain");
  drawCenteredTextInRect(ctx, value, componentRect(rect, BONUS_BOX_VIEWBOX, BONUS_BOX_SLOTS.value), {
    font: "Helvetica-Bold",
    maxSize: 14,
    minSize: 8,
    color: "#000000",
  });

  drawCenteredTextInRect(ctx, label, componentRect(rect, BONUS_BOX_VIEWBOX, BONUS_BOX_SLOTS.label), {
    font: "Helvetica",
    maxSize: 5.1,
    minSize: 3.5,
    color: "#000000",
    lineGap: 0,
  });
}

function renderCompanionHpAndAc(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  hp: string,
  ac: string,
) {
  drawSvg(ctx, assets.hp, rects.hp, "contain");

  // The HP SVG has no placeholder number in the MAX HP value socket, so
  // drawing directly into its local slot preserves every border and label.
  drawCenteredTextInRect(ctx, hp, componentRect(rects.hp, HP_VIEWBOX, HP_SLOTS.maxHpValue), {
    font: "Helvetica-Bold",
    maxSize: 14,
    minSize: 8,
    color: "#000000",
  });

  drawSvg(ctx, assets.ac, rects.ac, "contain");
  // Likewise, keep the shield's baked-in AC label and draw only the value.
  drawCenteredTextInRect(ctx, ac, componentRect(rects.ac, AC_VIEWBOX, AC_SLOTS.value), {
    font: "Helvetica-Bold",
    maxSize: 15,
    minSize: 9,
    color: "#000000",
  });
}

function parseMovementSpeeds(raw: string) {
  const normalized = raw.toLowerCase();
  const findMode = (mode: string) => normalized.match(new RegExp(`${mode}(?:ing)?\\s*(\\d+)\\s*ft`))?.[1] ?? "";
  const walking = normalized.match(/(?:^|[,;])\s*(?:walk(?:ing)?\s*)?(\d+)\s*ft/)?.[1] ?? "";
  return [
    { label: "Walking", value: walking },
    { label: "Flying", value: findMode("fly") },
    { label: "Climbing", value: findMode("climb") },
    { label: "Swimming", value: findMode("swim") },
    { label: "Burrowing", value: findMode("burrow") },
  ];
}

function renderCompanionSpeeds(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  speed: string,
) {
  drawCenteredTextInRect(ctx, "SPEED", rects.speedLabel, {
    font: "Helvetica",
    maxSize: 4.5,
    minSize: 3.5,
    color: "#777777",
  });
  const entries = parseMovementSpeeds(speed);
  const passiveFrame = frameOnlySvg(assets.passiveBox, 4);
  rects.speedBoxes.forEach((rect, index) => {
    drawSvg(ctx, passiveFrame, rect, "contain");
    drawCenteredTextInRect(ctx, entries[index].value, componentRect(rect, PASSIVE_BOX_VIEWBOX, PASSIVE_BOX_SLOTS.value), {
      font: "Helvetica-Bold",
      maxSize: 9,
      minSize: 6,
      color: "#000000",
    });
    drawCenteredTextInRect(ctx, entries[index].label, componentRect(rect, PASSIVE_BOX_VIEWBOX, PASSIVE_BOX_SLOTS.label), {
      font: "Helvetica",
      maxSize: 3.8,
      minSize: 2.8,
      color: "#333333",
      lineGap: 0,
    });
  });
}

function renderCompanionSkills(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  skills: string[],
) {
  drawSvg(ctx, assets.generalContainer, rect);
  drawCenteredTextInRect(ctx, "SKILLS & SENSES", {
    x: rect.x + 8,
    y: rect.y + 19,
    width: rect.width - 16,
    height: 10,
  }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 5,
    color: "#222222",
  });
  let y = rect.y + 38;
  for (const line of skills) {
    drawText(ctx, line, {
      x: rect.x + 10,
      y,
      width: rect.width - 20,
      height: 13,
    }, {
      font: "Helvetica",
      size: 7.5,
      color: "#000000",
      lineGap: 0,
    });
    y += 15;
  }
}

function companionSection(card: PdfPageCard) {
  return card.tags.find((tag) => tag.startsWith("companion-section:"))?.split(":")[1] ?? "actions";
}

function companionTagValue(card: PdfPageCard, prefix: string) {
  return card.tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function companionCardBody(card: PdfPageCard) {
  const action = companionTagValue(card, "companion-action:");
  const usage = companionTagValue(card, "companion-usage:");
  const body = cleanHtmlText(card.summary || card.detail || "");
  const metadata = [action, usage].filter(Boolean);

  if (!metadata.length || !body.includes("|")) {
    return body;
  }

  const parts = body.split("|").map((part) => part.trim()).filter(Boolean);
  while (
    parts.length > 1 &&
    metadata.some((value) => value.toLowerCase() === parts[0].toLowerCase())
  ) {
    parts.shift();
  }
  return parts.join(" | ");
}

function renderCompanionSection(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  title: string,
  cards: PdfPageCard[],
) {
  drawSvg(ctx, assets.generalContainer, rect);

  drawCenteredTextInRect(ctx, title, {
    x: rect.x + 10,
    y: rect.y + 10,
    width: rect.width - 20,
    height: 11,
  }, {
    font: "Helvetica-Bold",
    maxSize: 6.5,
    minSize: 5,
    color: "#222222",
  });

  if (cards.length === 0) {
    drawCenteredTextInRect(ctx, "—", {
      x: rect.x + 12,
      y: rect.y + rect.height / 2 - 6,
      width: rect.width - 24,
      height: 12,
    }, {
      font: "Helvetica",
      maxSize: 9,
      minSize: 6,
      color: "#999999",
    });
    return;
  }

  let y = rect.y + 28;
  const maxY = rect.y + rect.height - 10;
  for (const card of cards) {
    const action = companionTagValue(card, "companion-action:");
    const usage = companionTagValue(card, "companion-usage:");
    const metadata = [action, usage].filter(Boolean).join(" · ");
    const body = companionCardBody(card);
    const titleHeight = metadata ? 10 : 11;
    if (y + titleHeight + (metadata ? 8 : 0) + 7 > maxY) return;

    drawText(ctx, `${card.title}.`, {
      x: rect.x + 12,
      y,
      width: rect.width - 24,
      height: titleHeight,
    }, {
      font: "Helvetica-Bold",
      size: 8,
      color: "#000000",
    });
    y += titleHeight;

    if (metadata) {
      drawText(ctx, metadata.toUpperCase(), {
        x: rect.x + 12,
        y,
        width: rect.width - 24,
        height: 8,
      }, {
        font: "Helvetica-Bold",
        size: 7,
        color: "#555555",
      });
      y += 8;
    }

    ctx.doc.save();
    ctx.doc.font("Helvetica").fontSize(7.2);
    const bodyHeight = Math.min(
      maxY - y,
      ctx.doc.heightOfString(body, {
        width: rect.width - 24,
        lineGap: 1,
      }),
    );
    ctx.doc.restore();
    drawText(ctx, body, {
      x: rect.x + 12,
      y,
      width: rect.width - 24,
      height: bodyHeight,
    }, {
      font: "Helvetica",
      size: 7.2,
      color: "#000000",
      lineGap: 1,
    });
    y += bodyHeight + 8;
  }
}

function renderCompanionTraits(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  cards: PdfPageCard[],
) {
  renderCompanionSection(ctx, assets, rect, "TRAITS", cards);
}

function renderCompanionActions(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  cards: PdfPageCard[],
) {
  renderCompanionSection(ctx, assets, rect, "ACTIONS", cards);
}

function formatModifier(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function proficiencyBonusForCr(rawCr: string) {
  const [numerator, denominator] = rawCr.split("/").map(Number);
  const cr = denominator ? numerator / denominator : Number(rawCr);
  if (!Number.isFinite(cr) || cr <= 4) return 2;
  if (cr <= 8) return 3;
  if (cr <= 12) return 4;
  if (cr <= 16) return 5;
  if (cr <= 20) return 6;
  if (cr <= 24) return 7;
  if (cr <= 28) return 8;
  return 9;
}

export function renderCompanionPage(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  character: ResolvedPdfCharacter,
) {
  ctx.doc.addPage({ size: [COMPANION_PAGE.width, COMPANION_PAGE.height], margin: 0 });

  const companionCards = character.companionCards ?? [];
  const root = companionCards[0];
  if (!root) return;

  const rects = computeCompanionLayout();
  const getTag = (prefix: string) => {
    const tag = root.tags.find((candidate) => candidate.toLowerCase().startsWith(`${prefix.toLowerCase()}:`));
    return tag?.slice(tag.indexOf(":") + 1).trim() ?? "";
  };

  const name = root.title || "Companion";
  const cr = getTag("cr");
  const hpRaw = getTag("hp");
  const hp = hpRaw.match(/\d+/)?.[0] ?? "";
  const speed = getTag("speed");
  const scores = {
    str: Number(getTag("str")) || 10,
    dex: Number(getTag("dex")) || 10,
    con: Number(getTag("con")) || 10,
    int: Number(getTag("int")) || 10,
    wis: Number(getTag("wis")) || 10,
    cha: Number(getTag("cha")) || 10,
  };
  const skillLines = getTag("skills").split(",").map((entry) => entry.trim()).filter(Boolean);
  const senses = getTag("senses");
  const passiveFromSenses = senses.match(/passive\s+perception\s+(\d+)/i)?.[1];
  const perceptionBonus = skillLines.find((entry) => /^perception\b/i.test(entry))?.match(/[+-]?\d+/)?.[0];
  const passivePerception = passiveFromSenses
    ?? (perceptionBonus ? String(10 + Number(perceptionBonus)) : "");
  if (passivePerception && !skillLines.some((entry) => /passive perception/i.test(entry))) {
    skillLines.push(`Passive Perception ${passivePerception}`);
  }
  if (senses && !/passive perception/i.test(senses)) {
    skillLines.push(senses);
  }

  renderCompanionHeader(ctx, assets, rects, {
    name,
    creature: name,
    owner: character.name || "Player",
    size: getTag("size"),
    type: getTag("type"),
    alignment: getTag("alignment"),
  });
  renderCompanionPicture(ctx, rects.picture);
  renderCompanionAbilities(ctx, assets, rects, scores);

  const proficiencyBonus = proficiencyBonusForCr(cr);
  const initiative = Math.floor((scores.dex - 10) / 2);
  [
    [formatModifier(proficiencyBonus), "PROFICIENCY\nBONUS"],
    [formatModifier(initiative), "INITIATIVE\nBONUS"],
    [cr, "CHALLENGE\nRATING"],
  ].forEach(([value, label], index) => {
    renderCompanionBonusBox(ctx, assets, rects.bonusBoxes[index], value, label);
  });
  renderCompanionHpAndAc(ctx, assets, rects, hp, getTag("ac").match(/\d+/)?.[0] ?? "");
  renderCompanionSpeeds(ctx, assets, rects, speed);
  renderCompanionSkills(ctx, assets, rects.skills, skillLines);

  const traitCards = companionCards.slice(1).filter((card) => companionSection(card) === "traits");
  const actionCards = companionCards.slice(1).filter(
    (card) => companionSection(card) === "actions" || companionSection(card) === "reactions",
  );
  renderCompanionTraits(ctx, assets, rects.traits, traitCards);
  renderCompanionActions(ctx, assets, rects.actions, actionCards);
}
