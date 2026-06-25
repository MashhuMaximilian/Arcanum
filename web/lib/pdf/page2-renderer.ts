import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, ResolvedPdfCharacter } from "@/lib/pdf/types";
import type { CharacterInventoryItem } from "@/lib/characters/types";
import {
  componentRect,
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
  insetRect,
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

// Companion pages use the same A4 landscape canvas as every other page.
// The composition keeps three balanced columns below the full-width header:
// picture/abilities, core stats/senses, and actions.
const COMPANION_PAGE = {
  width: PAGE_SIZE.width,
  height: PAGE_SIZE.height,
  margin: 10,
  headerHeight: 69,
  bodyTop: 84,
  bodyBottom: 585,
  gutter: 9,
  leftWidth: 225,
  middleWidth: 215,
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
const STORED_MAX_ROWS = 14; // distributed across the two stored columns
const QUEST_MAX_ROWS = 14;
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
    // Preserve inline emphasis as markdown so the rich-text
    // renderer (and downstream section parser) still sees bold/italic
    // runs after HTML tags are stripped. Without this, a description
    // that uses <strong>Section:</strong> loses its visual anchors
    // and the dashboard-grid layout can't detect section boundaries.
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
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

  // Split into paragraph blocks on blank lines. Hard `\n` inside a
  // paragraph is preserved as a soft line break; double `\n\n`
  // becomes a paragraph break with extra vertical space.
  const paragraphBlocks = text.split(/\n{2,}/);
  let y = rect.y;
  const paragraphSpacing = options.lineGap + options.size * 0.4;
  let firstBlock = true;

  for (const blockRaw of paragraphBlocks) {
    const block = blockRaw.trim();
    if (!block) continue;

    if (!firstBlock) {
      y += paragraphSpacing;
    }
    firstBlock = false;

    // Within a block, honor hard `\n` as soft line breaks. Tokenize
    // each line independently so soft breaks reset the cursor cleanly
    // instead of being treated as wrap-eligible whitespace.
    const hardLines = block.split(/\n/);
    let firstLine = true;
    for (const lineRaw of hardLines) {
      const line = lineRaw.trim();
      if (!line) {
        // Empty soft-break line still gets a line height so consecutive
        // `\n` inside a paragraph reads as vertical breathing room.
        y += options.size + options.lineGap;
        firstLine = false;
        continue;
      }
      if (!firstLine) {
        y += options.size + options.lineGap;
      }
      firstLine = false;

      if (y - rect.y + options.size > rect.maxHeight) {
        return y - rect.y;
      }

      const runs = tokenizeInlineRuns(line);
      let cursorX = rect.x;
      let lineHasContent = false;

      for (const run of runs) {
        if (!run.text) continue;
        const isBold = run.bold;
        const isItalic = run.italic || options.italic;
        // Bold body text uses Magra-Bold (the body family in bold
        // weight) so **Bonus Action** style markers render in the same
        // metric as the surrounding paragraph instead of jumping to
        // the Teko-Medium display face. Italic reuses Magra (we have
        // no italic cut; the visual distinction still reads through
        // run separation).
        const font = isBold && isItalic
          ? "Magra-Bold"
          : isBold
            ? "Magra-Bold"
            : isItalic
              ? "Helvetica-Oblique"
              : options.font;

        // Split on spaces so we can wrap. Use a non-newline split
        // since newlines are already handled at the block level above.
        const words = run.text.split(/[ \t]+/);
        for (let wi = 0; wi < words.length; wi++) {
          const word = words[wi];
          if (!word) continue;
          ctx.doc.save();
          ctx.doc.font(font).fontSize(options.size);
          const wordWidth = ctx.doc.widthOfString(word);
          ctx.doc.restore();

          if (cursorX + wordWidth > rect.x + rect.width && cursorX > rect.x) {
            y += options.size + options.lineGap;
            cursorX = rect.x;
            if (y - rect.y + options.size > rect.maxHeight) {
              return y - rect.y;
            }
          }

          // Add a space before the word if not at the start of a line
          // and not directly after another word. The trailing-space
          // marker on the previous run is omitted; we just emit a
          // single space-width gap using a single space character.
          if (cursorX > rect.x && lineHasContent) {
            ctx.doc.save();
            ctx.doc.font(font).fontSize(options.size);
            const spaceWidth = ctx.doc.widthOfString(" ");
            ctx.doc.restore();
            drawText(ctx, " ", {
              x: cursorX,
              y,
              width: spaceWidth,
              height: options.size + options.lineGap,
            }, {
              font,
              size: options.size,
              color: options.color,
              lineBreak: false,
              lineGap: 0,
            });
            cursorX += spaceWidth;
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
          lineHasContent = true;
        }
      }
    }
  }
  return y + options.size + options.lineGap - rect.y;
}

/**
 * Measure the wrapped height of a rich-text paragraph (with **bold**
 * and *italic* inline runs) at the given font size. Mirrors the
 * paragraph / hard-line-break / word-wrap accounting in
 * `drawRichParagraph` so the fitted-sizing primitive reports the
 * height the renderer will actually consume.
 */
function measureRichParagraphHeight(
  ctx: PdfRenderContext,
  text: string,
  width: number,
  size: number,
  lineGap: number,
  baseFont: string,
): number {
  if (!text) return 0;
  const paragraphSpacing = lineGap + size * 0.4;
  const paragraphBlocks = text.split(/\n{2,}/);
  let totalHeight = 0;
  let firstBlock = true;

  for (const blockRaw of paragraphBlocks) {
    const block = blockRaw.trim();
    if (!block) continue;

    if (!firstBlock) {
      totalHeight += paragraphSpacing;
    }
    firstBlock = false;

    const hardLines = block.split(/\n/);
    let firstLine = true;
    for (const lineRaw of hardLines) {
      const line = lineRaw.trim();
      if (!line) {
        totalHeight += size + lineGap;
        firstLine = false;
        continue;
      }
      if (!firstLine) {
        totalHeight += size + lineGap;
      }
      firstLine = false;

      const runs = tokenizeInlineRuns(line);
      let cursorX = 0;
      let lineHasContent = false;
      for (const run of runs) {
        if (!run.text) continue;
        const font = run.bold && run.italic
          ? "Magra-Bold"
          : run.bold
            ? "Magra-Bold"
            : run.italic
              ? "Helvetica-Oblique"
              : baseFont;
        const words = run.text.split(/[ \t]+/);
        for (const word of words) {
          if (!word) continue;
          ctx.doc.save();
          ctx.doc.font(font).fontSize(size);
          const wordWidth = ctx.doc.widthOfString(word);
          ctx.doc.restore();

          if (cursorX + wordWidth > width && cursorX > 0) {
            totalHeight += size + lineGap;
            cursorX = 0;
          }

          // Account for the inter-word space the renderer emits.
          if (cursorX > 0 && lineHasContent) {
            ctx.doc.save();
            ctx.doc.font(font).fontSize(size);
            const spaceWidth = ctx.doc.widthOfString(" ");
            ctx.doc.restore();
            cursorX += spaceWidth;
          }

          cursorX += wordWidth;
          lineHasContent = true;
        }
      }
    }
  }
  return totalHeight + size + lineGap;
}

/**
 * Render a rich-text paragraph (with **bold** and *italic* inline runs)
 * while shrinking the font size until the paragraph fits within the
 * available height. Returns the actual height used.
 *
 * Inventory-card analog of the backstory's `drawFittedText` behavior —
 * item descriptions, additional treasure, and quest items can now
 * show long content without clipping, and shrink gracefully when a
 * single item fills most of the card.
 */
function drawFittedRichParagraph(
  ctx: PdfRenderContext,
  text: string,
  rect: { x: number; y: number; width: number; maxHeight: number },
  options: { font: string; size: number; minSize: number; color: string; lineGap: number; italic?: boolean },
): number {
  if (!text) return 0;

  const step = 0.25;
  let chosenSize = options.minSize;
  for (let size = options.size; size >= options.minSize - 1e-6; size -= step) {
    const measured = measureRichParagraphHeight(ctx, text, rect.width, size, options.lineGap, options.font);
    if (measured <= rect.maxHeight + 0.25) {
      chosenSize = size;
      break;
    }
    chosenSize = size;
  }
  return drawRichParagraph(
    ctx,
    text,
    rect,
    {
      font: options.font,
      size: chosenSize,
      color: options.color,
      lineGap: options.lineGap,
      italic: options.italic,
    },
  );
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

  // Strip stray markdown list-marker artifacts that some imported
  // catalogs emit. Patterns like "### 1.", "### 2)", "* 1.", "- 1)"
  // appear mid-paragraph as leftover templating noise; the surrounding
  // bolded **Term:** label is what actually structures the prose.
  cleaned = cleaned.replace(/#{1,6}\s+\d+[.)]\s*/g, "");
  cleaned = cleaned.replace(/(^|\s)\*\s+\d+[.)]\s+/g, "$1");
  cleaned = cleaned.replace(/(^|\s)-\s+\d+[.)]\s+/g, "$1");

  // Collapse whitespace created by the above removals.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+/g, "\n").trim();

  // NOTE: do NOT strip markdown markers here — we want **bold** and
  // *italic* spans to survive into the rich-text renderer so item
  // descriptions can highlight in-line rules terms (damage types,
  // conditions, weapon names) the same way Additional Treasure and
  // Quest Items already do.
  return cleaned || fallback;
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
  const headerSizes = [6, 6.5, 6.5, 6.5];

  const headers = ["#", "Name", "Qty", "lb"];
  headers.forEach((h, i) => {
    drawText(ctx, h, { x: colX[i], y: headerY, width: 30, height: 8 }, {
      font: "Magra-Bold",
      size: headerSizes[i],
      color: COLORS.textSecondary,
    });
  });

  const rowStartY = headerY + 8;
  const visibleItems = items.slice(0, INDEX_MAX_ROWS);
  const hasMore = items.length > INDEX_MAX_ROWS;

  visibleItems.forEach((item, index) => {
    const rowY = rowStartY + index * (INDEX_ROW_HEIGHT + INDEX_ROW_GAP);

    const truncatedName = item.name.length > 20 ? item.name.slice(0, 19) + "…" : item.name;
    // Mirror the stored-items weight pattern: show the raw weight string
    // (e.g. "12 lb.", "½ lb.") when present, fall back to "—". Qty shows the
    // integer quantity; weight shows the formatted string.
    const weightText = (item.weight ?? "").trim() || "—";
    const rowData = [
      String(index + 1),
      truncatedName,
      String(item.quantity),
      weightText,
    ];

    rowData.forEach((text, i) => {
      const width = i === 1 ? 110 : 28;
      const align = i === 3 ? "right" : "left";
      drawText(ctx, text, { x: colX[i], y: rowY + 1, width, height: 7 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textPrimary,
        align,
        lineGap: 0,
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

  drawCenteredSectionTitle(ctx, "ITEM DESCRIPTIONS", rect, { topOffset: 20 });

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

  const contentStartY = rect.y + 36;
  const contentBottomY = rect.y + rect.height - 4;
  const columnGap = 6;
  const columnPadding = 4;
  // Bumped column count 2 → 3 per user request: "we have 2 columns
  // there which is ok, but we need to make it like a page. In column 1
  // we write, then what does not fit goes to second column and so on.
  // Now that I think of it, let's make 3 columns in item description
  // cards." 3 columns give a true newspaper-style flow with shorter
  // column heights per item card, more even rhythm, and less wasted
  // white space at the bottom of the page.
  const columnCount = 3;
  const fullWidth = rect.width - columnPadding * 2;
  const columnWidth = (rect.width - columnGap * (columnCount - 1) - columnPadding * 2) / columnCount;
  const textFont = "Helvetica";
  const lineGap = 0.3;
  const compactBodySize = 6;
  const denseBodySize = 5.5;
  const titleSize = 8.5;
  // Tightened cardGap 1.5 → 0.5 so consecutive item cards stack with
  // minimal dead space between them. The user said "we have too much
  // space for each end line" — a 0.5pt gap is essentially a hairline
  // that visually unifies the column without leaving awkward gaps.
  const cardGap = 0.5;
  const subColumnGap = 6;
  const availableHeight = contentBottomY - contentStartY;
  // Items whose natural height is more than 35% of the available area
  // (e.g. Prayer Beads) get promoted to the dense strip below; in a
  // narrow column they would either overflow or be shrunk to
  // unreadable body sizes. 35% is a soft threshold — a slightly
  // larger card can still be "compact" if both columns are empty.
  const denseThreshold = availableHeight * 0.35;

  // --- Phase 1: Prepare items ---------------------------------------
  // Each item becomes a self-contained "card" with a measured natural
  // height and (for dense items) a pre-parsed list of paragraph
  // sections so the dashboard grid can render each one as its own
  // mini-card.
  type Section = { title: string; body: string };
  type PreparedItem = {
    item: CharacterInventoryItem;
    description: string;
    titleMetaHeight: number;
    bodyHeight: number;
    totalHeight: number;
    isDense: boolean;
    sections: Section[];
  };

  const stripTrailingPunct = (s: string) =>
    s.replace(/[\s]*[:\-—–=]+[\s]*$/, "").trim();
  const extractTitleAndBody = (block: string): Section => {
    const boldMatch = block.match(/^\*\*([^*]+)\*\*\s*[:\-—–=]?\s*/);
    if (boldMatch) {
      const title = stripTrailingPunct(boldMatch[1]);
      const body = block.slice(boldMatch[0].length).trim();
      // BUGFIX: the previous `body || block` fallback returned the
      // ENTIRE block (including the original `**Title**` markers)
      // when the section body was empty. That made the section title
      // appear twice in the rendered PDF: once as the uppercased
      // section title and once again as a body line that still
      // contained `**...**`. Now return an empty string when there
      // is no body content after the title — the renderer already
      // skips empty bodies.
      return { title, body };
    }
    return { title: "", body: block };
  };
  const parseSections = (description: string): Section[] => {
    if (!description) return [];
    // Two-pass parser: handle both newline-bounded descriptions
    // (cleanHtmlText emits `\n` between <p>...</p> blocks) and
    // single-paragraph descriptions where the user has bolded inline
    // section markers (e.g. Prayer Beads description: a single wall
    // of prose with `**Bead Count:**`, `**Iron Feet** = ...`,
    // `**Mantra of Evasion**` markers, all separated only by `. `).
    // The first pass uses newlines (legacy behavior). When the
    // description has no newlines but contains 2+ bold-prefixed
    // sentences, we split on `(?<=\.)\s+(?=\*\*[^*]+\*\*)` — period
    // boundary followed by a new bold-starting sentence — to
    // reconstruct the implicit section list.
    const text = description.trim();
    if (text.includes("\n")) {
      return text
        .split(/\n+/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map(extractTitleAndBody);
    }
    // Single block: split on period + space + new bold sentence.
    const sentenceSplit = text.split(/(?<=\.)\s+(?=\*\*[^*]+\*\*)/);
    if (sentenceSplit.length >= 2) {
      return sentenceSplit
        .map((b) => b.trim())
        .filter(Boolean)
        .map(extractTitleAndBody);
    }
    return [{ title: "", body: text }];
  };

  const prepared: PreparedItem[] = describedItems.map((item) => {
    const description = extractItemDescription(
      item.sheetDescription || item.detailHtml,
      item.notes ?? item.name,
    );
    // Measure body height using the compact column width; dense items
    // get re-measured in the wider full-width strip during render.
    const bodyHeight = description
      ? measureRichParagraphHeight(ctx, description, columnWidth, compactBodySize, lineGap, textFont)
      : 0;
    // Bumped from titleSize + 1 (8.2) → 12 to match the new titleH in
    // renderItemCard so compact-card height estimates don't under-count
    // and collide with the row below.
    const titleMetaHeight = 14;
    const totalHeight = titleMetaHeight + bodyHeight + cardGap;
    const sections = parseSections(description);
    return {
      item,
      description,
      titleMetaHeight,
      bodyHeight,
      totalHeight,
      isDense: totalHeight > denseThreshold,
      sections,
    };
  });

  // --- Phase 2: Layout compact items in 2 columns -------------------
  // Greedy bin-packing with overflow protection: each card goes in
  // the smaller column; if neither column has room, the card is
  // promoted to the dense strip. After this pass the compact lists
  // are final and their placement is decided purely by measured
  // heights — no estimate-vs-actual mismatch.
  //
  // Items with 2+ parsed sections (e.g. Prayer Beads with its
  // Bead Count / Activation / Mantis Style / Saving Face blocks) are
  // routed to a dedicated "dashboard" strip below the 2-column flow.
  // The dashboard strip renders each section as its own mini-card
  // in a 2-column sub-grid — the "dashboard grid" the user asked
  // for. Simple items stay in the 2-column flow.
  const columns: PreparedItem[][] = Array.from({ length: columnCount }, () => []);
  const denseQueue: PreparedItem[] = [];
  const dashboardQueue: PreparedItem[] = [];

  for (const p of prepared) {
    // BUGFIX: previously isDense took priority and routed multi-
    // section items (like Prayer Beads with 25 sections) to the
    // dense strip, where renderDenseItemCard uses the same 2-column
    // sub-grid but with much less vertical space available (denseY
    // starts late, after the compact columns end). Result: Prayer
    // Beads overflowed the column. Now route multi-section items
    // to the dashboard FIRST so they get the wider denseY = contentStartY
    // strip at the top of the layout.
    if (p.sections.length >= 2) {
      dashboardQueue.push(p);
      continue;
    }
    if (p.isDense) {
      denseQueue.push(p);
      continue;
    }
    // Pick the shortest column that has space. Now 3 columns so we
    // iterate all of them and pick the minimum.
    let bestCol = 0;
    let bestY = columnHeightsSum(columns, 0) + contentStartY;
    for (let c = 1; c < columnCount; c++) {
      const candidateY = columnHeightsSum(columns, c) + contentStartY;
      if (candidateY < bestY) {
        bestY = candidateY;
        bestCol = c;
      }
    }
    if (bestY + p.totalHeight <= contentBottomY) {
      columns[bestCol].push(p);
    } else {
      // No column has space — promote to dense strip.
      p.isDense = true;
      denseQueue.push(p);
    }
  }

  // --- Phase 3: Render compact items --------------------------------
  // Walk each column top-to-bottom, using the actual rendered height
  // for each card to update the cursorY. This is the fix for the
  // overlap: previous versions used the estimated height to position
  // the next card, which could place it inside the previous card's
  // body if the estimate was low.
  const columnCursors = Array.from({ length: columnCount }, () => contentStartY);
  for (let col = 0; col < columnCount; col++) {
    for (const p of columns[col]) {
      renderItemCard(ctx, p, {
        x: rect.x + columnPadding + col * (columnWidth + columnGap),
        y: columnCursors[col],
        width: columnWidth,
      }, { bodySize: compactBodySize, maxBottomY: contentBottomY });
      const rendered = measureItemCardHeight(ctx, p, columnWidth, compactBodySize);
      columnCursors[col] = columnCursors[col] + Math.min(p.totalHeight, rendered) + cardGap;
    }
  }

  // --- Phase 4: Render dense items in a wider strip -----------------
  // The dense strip starts after the columns end. If a column ended
  // higher, the dense strip is lifted so it doesn't leave dead space.
  const compactEndY = Math.max(...columnCursors);
  let denseY = compactEndY + 6;
  for (const p of denseQueue) {
    if (denseY + p.titleMetaHeight + 8 >= contentBottomY) break;
    renderDenseItemCard(ctx, p, {
      x: rect.x + columnPadding,
      y: denseY,
      width: fullWidth,
    }, { bodySize: denseBodySize, maxBottomY: contentBottomY, subColumnGap });
    // Approximate dense card height: title + grid height. Re-measure
    // would require running the renderer, which we just did; use a
    // conservative measure based on the parsed sections so the next
    // dense card lands below this one cleanly.
    const sectionsPerRow = 2;
    const rows = Math.ceil(p.sections.length / sectionsPerRow);
    const subW = (fullWidth - subColumnGap) / sectionsPerRow;
    let maxRowH = 0;
    for (let r = 0; r < rows; r++) {
      let rowH = 0;
      for (let s = 0; s < sectionsPerRow; s++) {
        const idx = r * sectionsPerRow + s;
        if (idx >= p.sections.length) break;
        const sec = p.sections[idx];
        const titleH = sec.title ? 5 : 0;
        const bodyH = sec.body
          ? measureRichParagraphHeight(ctx, sec.body, subW, denseBodySize, lineGap, textFont)
          : 0;
        rowH = Math.max(rowH, titleH + bodyH + cardGap);
      }
      maxRowH += rowH;
    }
    const denseCardH = p.titleMetaHeight + Math.max(maxRowH, measureRichParagraphHeight(ctx, p.description, fullWidth, denseBodySize, lineGap, textFont));
    denseY = denseY + denseCardH + cardGap;
  }

  // --- Phase 5: Render dashboard items -------------------------------
  // Each dashboard item is a full-width strip below the dense strip.
  // Sections are laid out in a 2-column sub-grid: row 1 has section 0
  // + section 1, row 2 has section 2 + section 3, and so on. The last
  // row may have a single section (odd count). Each cell has a bold
  // section title and its body in the body face, giving the player
  // scannable visual anchors instead of a wall of prose.
  console.log(`[DEBUG-DASH] contentStartY=${contentStartY} contentBottomY=${contentBottomY} denseY=${denseY} dashboardQueue=${dashboardQueue.length} fullWidth=${fullWidth} subColumnGap=${subColumnGap} cardGap=${cardGap}`);
  let dashY = denseY;
  for (const p of dashboardQueue) {
    console.log(`[DEBUG-DASH] item="${p.item.name}" dashY=${dashY} sections=${p.sections.length} titleMeta=${p.titleMetaHeight}`);
    if (dashY + p.titleMetaHeight >= contentBottomY) {
      console.log(`[DEBUG-DASH] SKIP ${p.item.name}: dashY+titleMeta=${dashY + p.titleMetaHeight} >= contentBottomY=${contentBottomY}`);
      break;
    }
    renderDashboardItem(ctx, p, {
      x: rect.x + columnPadding,
      y: dashY,
      width: fullWidth,
    }, { bodySize: denseBodySize, maxBottomY: contentBottomY, subColumnGap });
    // BUGFIX: previous version estimated the rendered height by
    // summing per-section body heights measured at denseBodySize.
    // drawFittedRichParagraph shrinks body text when cellRemaining
    // gets small, so the actual rendered height per section can be
    // larger than the measurement. To avoid overlap with the next
    // dashboard item, use a safer fallback: count the number of
    // rows actually drawn (each row = max(left, right) cell height +
    // 1.5pt gap) by replaying the loop with the same shrinking rules.
    // For simplicity here, use the maximum of estimate and a per-row
    // floor (titleH + minBodyH + cardGap per row).
    const subW = (fullWidth - subColumnGap) / 2;
    const rows = Math.ceil(p.sections.length / 2);
    let actualTotalH = 0;
    let cursorY = dashY + p.titleMetaHeight + 2;
    let drawnRows = 0;
    for (let r = 0; r < rows; r++) {
      if (cursorY >= contentBottomY) break;
      let rowH = 0;
      for (let s = 0; s < 2; s++) {
        const idx = r * 2 + s;
        if (idx >= p.sections.length) break;
        const sec = p.sections[idx];
        const titleH = sec.title ? 6 : 0;
        const cellRemaining = contentBottomY - cursorY - titleH;
        let bodyH = 0;
        if (sec.body) {
          if (cellRemaining > 6) {
            bodyH = measureRichParagraphHeight(ctx, sec.body, subW, denseBodySize, lineGap, textFont);
            // Cap bodyH to available cellRemaining (drawFittedRichParagraph shrinks).
            if (bodyH > cellRemaining - 1) bodyH = Math.max(6, cellRemaining - 1);
          } else {
            bodyH = 0;
          }
        }
        rowH = Math.max(rowH, titleH + bodyH + cardGap);
      }
      actualTotalH += rowH;
      cursorY += rowH + cardGap;
      drawnRows++;
    }
    console.log(`[DEBUG-DASH] drew ${drawnRows}/${rows} rows for ${p.item.name}, actualTotalH=${actualTotalH}, new dashY=${dashY + p.titleMetaHeight + 2 + actualTotalH + cardGap}`);
    dashY += p.titleMetaHeight + 2 + actualTotalH + cardGap;
  }
}

function renderDashboardItem(
  ctx: PdfRenderContext,
  p: PreparedItem,
  rect: { x: number; y: number; width: number },
  options: { bodySize: number; maxBottomY: number; subColumnGap: number },
) {
  // Title row spans the full width. Bumped 7.2 → 8.5pt + 2pt body gap
  // to match the compact renderItemCard layout — the user wants
  // item titles more prominent and a visible gap before body text.
  const titleFSize = 8.5;
  const titleH = 10;
  const titleBodyGap = 2;
  const metaLine = buildItemMetadataLine(p.item);
  const separator = metaLine ? "  —  " : "";
  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const nameWidth = ctx.doc.widthOfString(p.item.name);
  const separatorWidth = separator ? ctx.doc.widthOfString(separator) : 0;
  const metaWidth = metaLine ? Math.max(0, rect.width - nameWidth - separatorWidth) : 0;
  ctx.doc.restore();
  drawText(ctx, p.item.name, { x: rect.x, y: rect.y, width: rect.width, height: titleH }, {
    font: "Helvetica-Bold", size: titleFSize, color: COLORS.textPrimary, lineGap: 0, ellipsis: true,
  });
  if (metaLine && metaWidth > 20) {
    if (separatorWidth > 0) {
      drawText(ctx, separator, { x: rect.x + nameWidth, y: rect.y, width: separatorWidth + 1, height: titleH }, {
        font: "Helvetica-Bold", size: titleFSize, color: COLORS.textPrimary, lineGap: 0,
      });
    }
    drawText(ctx, metaLine, { x: rect.x + nameWidth + separatorWidth, y: rect.y, width: metaWidth, height: titleH }, {
      font: "Helvetica-Bold", size: titleFSize, color: COLORS.textSecondary, lineGap: 0, ellipsis: true,
    });
  }

  const bodyY = rect.y + titleH + titleBodyGap;
  const subW = (rect.width - options.subColumnGap) / 2;
  let rowY = bodyY;
  const rows = Math.ceil(p.sections.length / 2);
  for (let r = 0; r < rows; r++) {
    // BUGFIX: stop rendering additional rows once rowY exceeds
    // maxBottomY. Previous version always ran all 13 rows for
    // Prayer Beads, drawing past the content bottom and overlapping
    // the next item.
    if (rowY >= options.maxBottomY) break;
    let rowH = 0;
    for (let s = 0; s < 2; s++) {
      const idx = r * 2 + s;
      if (idx >= p.sections.length) break;
      const sec = p.sections[idx];
      const cellX = rect.x + s * (subW + options.subColumnGap);
      let cellCursorY = rowY;
      // BUGFIX: also stop per-cell when cellCursorY exceeds
      // maxBottomY (a single section can be tall enough to overflow
      // even on its first row).
      if (cellCursorY < options.maxBottomY) {
        if (sec.title) {
          // Visual anchor: section title in bold uppercase, body face
          // (Magra-Bold) so it reads as inline emphasis of the same
          // paragraph family, not a different display face.
          drawText(ctx, sec.title.toUpperCase(), {
            x: cellX, y: cellCursorY, width: subW, height: 5,
          }, {
            font: "Magra-Bold", size: 6, color: COLORS.textPrimary, lineGap: 0, lineBreak: false,
          });
          cellCursorY += 6;
        }
        if (sec.body) {
          const cellRemaining = options.maxBottomY - cellCursorY;
          if (cellRemaining > 6) {
            const h = drawFittedRichParagraph(
              ctx,
              sec.body,
              { x: cellX, y: cellCursorY, width: subW, maxHeight: cellRemaining },
              { font: "Helvetica", size: options.bodySize, minSize: 4, color: COLORS.textPrimary, lineGap: 0.3 },
            );
            cellCursorY += h;
          }
        }
      }
      rowH = Math.max(rowH, cellCursorY - rowY);
    }
    rowY += rowH + 1.5;
  }
}

function columnHeightsSum(columns: PreparedItem[][], _col: number): number {
  // Helper: returns the cumulative height of cards already placed in
  // column `col`. Used by the layout pass to decide which column is
  // the smaller one (greedy bin-packing).
  return columns[_col].reduce((sum, p) => sum + p.totalHeight, 0);
}

function renderItemCard(
  ctx: PdfRenderContext,
  p: PreparedItem,
  rect: { x: number; y: number; width: number },
  options: { bodySize: number; maxBottomY: number },
) {
  // Title row: "Name — metadata" or just "Name". Bumped 7.2pt → 8.5pt
  // for better visual weight against the body face (the user said
  // card titles are too small). Title height 10 → 14pt and a 3pt
  // breathing gap before the body so the body doesn't visually crash
  // into the title (user: "titles too close to description").
  const titleFSize = 8.5;
  const titleH = 14;
  const titleBodyGap = 3;
  const metaLine = buildItemMetadataLine(p.item);
  const separator = metaLine ? "  —  " : "";
  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const nameWidth = ctx.doc.widthOfString(p.item.name);
  const separatorWidth = separator ? ctx.doc.widthOfString(separator) : 0;
  const metaWidth = metaLine ? Math.max(0, rect.width - nameWidth - separatorWidth) : 0;
  ctx.doc.restore();
  drawText(ctx, p.item.name, { x: rect.x, y: rect.y, width: rect.width, height: titleH }, {
    font: "Helvetica-Bold",
    size: titleFSize,
    color: COLORS.textPrimary,
    lineGap: 0,
    ellipsis: true,
  });
  if (metaLine && metaWidth > 20) {
    if (separatorWidth > 0) {
      drawText(ctx, separator, { x: rect.x + nameWidth, y: rect.y, width: separatorWidth + 1, height: titleH }, {
        font: "Helvetica-Bold", size: titleFSize, color: COLORS.textPrimary, lineGap: 0,
      });
    }
    drawText(ctx, metaLine, { x: rect.x + nameWidth + separatorWidth, y: rect.y, width: metaWidth, height: titleH }, {
      font: "Helvetica-Bold", size: titleFSize, color: COLORS.textSecondary, lineGap: 0, ellipsis: true,
    });
  }

  if (p.description) {
    const bodyY = rect.y + titleH + titleBodyGap;
    const remaining = options.maxBottomY - bodyY;
    if (remaining > 6) {
      drawFittedRichParagraph(
        ctx,
        p.description,
        { x: rect.x, y: bodyY, width: rect.width, maxHeight: remaining },
        { font: "Helvetica", size: options.bodySize, minSize: 4, color: COLORS.textPrimary, lineGap: 0.3 },
      );
    }
  }
}

function measureItemCardHeight(
  ctx: PdfRenderContext,
  p: PreparedItem,
  width: number,
  bodySize: number,
): number {
  // Bumped titleH 12→14 and titleBodyGap 2→3 so item titles sit
  // visibly above the body description (user: "names of the features
  // are too close to the descriptions"). The denser rendering needs
  // a touch more breathing room when stacked in a column.
  const titleH = 14;
  const bodyH = p.description
    ? measureRichParagraphHeight(ctx, p.description, width, bodySize, 0.3, "Helvetica")
    : 0;
  return titleH + 3 + bodyH;
}

function renderDenseItemCard(
  ctx: PdfRenderContext,
  p: PreparedItem,
  rect: { x: number; y: number; width: number },
  options: { bodySize: number; maxBottomY: number; subColumnGap: number },
) {
  // Title row spans the full width. Bumped titleH 10→14 and
  // titleBodyGap 2→3 so item titles sit visibly above the body
  // description (user: "names of the features are too close to the
  // descriptions").
  const titleFSize = 8.5;
  const titleH = 14;
  const titleBodyGap = 3;
  const metaLine = buildItemMetadataLine(p.item);
  const separator = metaLine ? "  —  " : "";
  ctx.doc.save();
  ctx.doc.font("Helvetica-Bold").fontSize(titleFSize);
  const nameWidth = ctx.doc.widthOfString(p.item.name);
  const separatorWidth = separator ? ctx.doc.widthOfString(separator) : 0;
  const metaWidth = metaLine ? Math.max(0, rect.width - nameWidth - separatorWidth) : 0;
  ctx.doc.restore();
  drawText(ctx, p.item.name, { x: rect.x, y: rect.y, width: rect.width, height: titleH }, {
    font: "Helvetica-Bold", size: titleFSize, color: COLORS.textPrimary, lineGap: 0, ellipsis: true,
  });
  if (metaLine && metaWidth > 20) {
    if (separatorWidth > 0) {
      drawText(ctx, separator, { x: rect.x + nameWidth, y: rect.y, width: separatorWidth + 1, height: titleH }, {
        font: "Helvetica-Bold", size: titleFSize, color: COLORS.textPrimary, lineGap: 0,
      });
    }
    drawText(ctx, metaLine, { x: rect.x + nameWidth + separatorWidth, y: rect.y, width: metaWidth, height: titleH }, {
      font: "Helvetica-Bold", size: titleFSize, color: COLORS.textSecondary, lineGap: 0, ellipsis: true,
    });
  }

  const bodyY = rect.y + titleH + titleBodyGap;
  const remaining = options.maxBottomY - bodyY;
  if (remaining < 6) return;

  // If we have 2+ sections, render them as a 2-column sub-grid
  // (the "dashboard grid" the user asked for). Each section is a
  // mini-card with a bold title and its own body, giving the player
  // a scannable visual anchor for each Mantra / Style / Face.
  if (p.sections.length >= 2) {
    const subW = (rect.width - options.subColumnGap) / 2;
    const sectionsPerRow = 2;
    const rows = Math.ceil(p.sections.length / sectionsPerRow);
    let rowY = bodyY;
    for (let r = 0; r < rows; r++) {
      // BUGFIX: stop rendering additional rows once rowY exceeds
      // maxBottomY. Without this, renderDenseItemCard renders all
      // 13 rows for Prayer Beads even when denseY is so low (after
      // the compact columns) that only ~57pt remain, overflowing
      // into the next item.
      if (rowY >= options.maxBottomY) break;
      let rowH = 0;
      for (let s = 0; s < sectionsPerRow; s++) {
        const idx = r * sectionsPerRow + s;
        if (idx >= p.sections.length) break;
        const sec = p.sections[idx];
        const cellX = rect.x + s * (subW + options.subColumnGap);
        const cellY = rowY;
        let cellCursorY = cellY;
        // BUGFIX: also stop per-cell when cellCursorY exceeds
        // maxBottomY (a single section can be tall enough to overflow
        // even on its first row).
        if (cellCursorY < options.maxBottomY) {
          if (sec.title) {
            // Use Magra-Bold (the body's font family in bold weight) so
            // the section header sits on the same baseline as the body
            // text underneath. The previous Helvetica-Bold (= Teko-Medium
            // display face) had a different ascender bbox and rendered
            // visibly LOWER than the body line (user: "bold items are
            // still lower than the line of writing"). Magra-Bold shares
            // ascender 968 with Magra body so the baselines align.
            drawText(ctx, sec.title.toUpperCase(), {
              x: cellX, y: cellCursorY, width: subW, height: 7,
            }, {
              font: "Magra-Bold", size: 6, color: COLORS.textPrimary, lineGap: 0, lineBreak: false,
            });
            cellCursorY += 7;
          }
          if (sec.body) {
            const cellRemaining = options.maxBottomY - cellCursorY;
            if (cellRemaining > 6) {
              const h = drawFittedRichParagraph(
                ctx,
                sec.body,
                { x: cellX, y: cellCursorY, width: subW, maxHeight: cellRemaining },
                { font: "Helvetica", size: options.bodySize, minSize: 4, color: COLORS.textPrimary, lineGap: 0.3 },
              );
              cellCursorY += h;
            }
          }
        }
        rowH = Math.max(rowH, cellCursorY - cellY);
      }
      rowY += rowH + 4;
    }
    return;
  }

  // Single-section dense item (or description with no parseable
  // paragraphs): render the body across the full width, falling
  // back to a fitted-shrink so the text never overflows the
  // container bounds.
  if (p.description) {
    drawFittedRichParagraph(
      ctx,
      p.description,
      { x: rect.x, y: bodyY, width: rect.width, maxHeight: remaining },
      { font: "Helvetica", size: options.bodySize, minSize: 4, color: COLORS.textPrimary, lineGap: 0.3 },
    );
  }
}

function renderAttuned(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  attunedCount: number,
  maxAttuned: number,
  rectOverride?: PdfRect,
) {
  // Same visual language as Currency: a single _Proficiency box 1.svg
  // with the value inside, and a small label above.
  const rect = rectOverride ?? PAGE2_INVENTORY_REGIONS.attuned;

  // Small "ATTUNED" label above the box.
  const labelY = rect.y + 3;
  drawCenteredTextInRect(ctx, "ATTUNED", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Magra-Bold",
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
  rectOverride?: PdfRect,
) {
  // Valuables: a row of standalone _Proficiency box 1.svg boxes — same
  // visual language as Currency. Each box contains the valuable's name.
  // If there are no valuables, the entire section is hidden (no card,
  // no placeholder text).
  if (valuables.length === 0) {
    return;
  }

  const rect = rectOverride ?? PAGE2_INVENTORY_REGIONS.valuables;

  // Small "VALUABLES" label above the row.
  const labelY = rect.y + 4;
  drawCenteredTextInRect(ctx, "VALUABLES", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Magra-Bold",
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
  rectOverride?: PdfRect,
) {
  // Standalone boxes — no big generalContainer frame around them.
  const rect = rectOverride ?? PAGE2_INVENTORY_REGIONS.currency;

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
      font: "Magra-Bold",
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
  rectOverride?: PdfRect,
) {
  // Same visual language as Currency: small label above, then 3
  // standalone _Proficiency box 1.svg boxes — one per value.
  const rect = rectOverride ?? PAGE2_INVENTORY_REGIONS.encumbrance;

  // Small "ENCUMBRANCE" label above the row.
  const labelY = rect.y + 3;
  drawCenteredTextInRect(ctx, "ENCUMBRANCE", { x: rect.x, y: labelY, width: rect.width, height: 7 }, {
    font: "Magra-Bold",
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
      font: "Magra-Bold",
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

function renderInventoryFooter(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  data: {
    attunedCount: number;
    maxAttuned: number;
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
    carriedWeight: number;
    capacity: number;
  },
) {
  const rect = {
    x: PAGE2_INVENTORY_REGIONS.inventoryIndex.x + 4,
    y: PAGE2_INVENTORY_REGIONS.inventoryIndex.y + PAGE2_INVENTORY_REGIONS.inventoryIndex.height - 43,
    width: PAGE2_INVENTORY_REGIONS.inventoryIndex.width - 8,
    height: 30,
  };

  const textFont = "Magra-Bold";
  const labelSize = 4.2;
  const valueSize = 6.5;
  const boxW = 22;
  const boxH = 16;
  const groupGap = 3.5;
  const boxGap = 1.25;

  const attunedZone = { x: rect.x, y: rect.y, width: boxW, height: rect.height };
  const currencyZoneWidth = 5 * boxW + 4 * boxGap;
  const encumbranceZoneWidth = 3 * boxW + 2 * boxGap;
  const totalWidth = boxW + groupGap + currencyZoneWidth + groupGap + encumbranceZoneWidth;
  const startX = rect.x + Math.max(0, (rect.width - totalWidth) / 2);
  const currencyZone = { x: startX + boxW + groupGap, y: rect.y, width: currencyZoneWidth, height: rect.height };
  const encumbranceZone = { x: currencyZone.x + currencyZone.width + groupGap, y: rect.y, width: encumbranceZoneWidth, height: rect.height };

  // Attuned
  drawCenteredTextInRect(ctx, "ATTUNED", { x: attunedZone.x - 2, y: attunedZone.y, width: boxW + 4, height: 4 }, {
    font: textFont,
    maxSize: 4.9,
    minSize: 4.1,
    color: COLORS.textPrimary,
    lineBreak: false,
  });
  const attunedBox: PdfRect = { x: attunedZone.x, y: attunedZone.y + 8, width: boxW, height: boxH };
  drawSvg(ctx, assets.proficiencyBox1, attunedBox);
  drawCenteredTextInRect(ctx, `${data.attunedCount}/${data.maxAttuned}`, attunedBox, {
    font: textFont,
    maxSize: 6.2,
    minSize: 5.4,
    color: COLORS.textPrimary,
    lineBreak: false,
  });

  // Currency
  const currencyBoxW = boxW;
  const currencyGap = boxGap;
  const currencyTotalW = 5 * currencyBoxW + 4 * currencyGap;
  const currencyStartX = currencyZone.x + Math.max(0, (currencyZone.width - currencyTotalW) / 2);
  CURRENCY_TYPES.forEach((type, index) => {
    const boxX = currencyStartX + index * (currencyBoxW + currencyGap);
    drawCenteredTextInRect(ctx, CURRENCY_LABELS[type], {
      x: boxX - 1,
      y: currencyZone.y,
      width: currencyBoxW + 2,
      height: 3.5,
    }, {
      font: textFont,
      maxSize: labelSize,
      minSize: 3.2,
      color: COLORS.textSecondary,
      lineBreak: false,
    });
    const boxRect: PdfRect = { x: boxX, y: currencyZone.y + 8, width: currencyBoxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, String(data.currency[type]), boxRect, {
      font: textFont,
      maxSize: valueSize,
      minSize: 4.6,
      color: COLORS.textPrimary,
      lineBreak: false,
    });
  });

  // Encumbrance
  const encumbranceBoxW = boxW;
  const encumbranceGap = boxGap;
  const encumbranceTotalW = 3 * encumbranceBoxW + 2 * encumbranceGap;
  const encumbranceStartX = encumbranceZone.x + Math.max(0, (encumbranceZone.width - encumbranceTotalW) / 2);
  const encumbranceValues: Array<{ label: string; value: string }> = [
    { label: "CARRIED", value: `${data.carriedWeight} lb` },
    { label: "CAPACITY", value: `${data.capacity} lb` },
    { label: "PUSH/DRAG", value: `${data.capacity * 2} lb` },
  ];
  encumbranceValues.forEach((entry, index) => {
    const boxX = encumbranceStartX + index * (encumbranceBoxW + encumbranceGap);
    drawCenteredTextInRect(ctx, entry.label, {
      x: boxX - 1,
      y: encumbranceZone.y,
      width: encumbranceBoxW + 2,
      height: 3.5,
    }, {
      font: textFont,
      maxSize: 4.1,
      minSize: 3.1,
      color: COLORS.textSecondary,
      lineBreak: false,
    });
    const boxRect: PdfRect = { x: boxX, y: encumbranceZone.y + 8, width: encumbranceBoxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, entry.value, boxRect, {
      font: textFont,
      maxSize: 6.0,
      minSize: 4.6,
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

  if (!additionalTreasureText || additionalTreasureText.trim().length === 0) {
    return;
  }

  const segments = parseFreeformText(additionalTreasureText);

  const contentStartY = rect.y + 34;
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
      const quoteHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 8, y, width: rect.width - 16, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawFittedRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textPrimary, lineGap: 0.4 },
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
  drawCenteredSectionTitle(ctx, "STORED ITEMS", rect, { topOffset: 20 });

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
  drawCenteredSectionTitle(ctx, "QUEST ITEMS & TRINKETS", rect, { topOffset: 20 });

  const segments = parseFreeformText(questItemsText);

  const contentStartY = rect.y + 34;
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
      const quoteHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 8, y, width: rect.width - 16, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawFittedRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 4, color: COLORS.textPrimary, lineGap: 0.4 },
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

  // 2. Footer inside EQUIPPED: Attuned | Currency | Encumbrance
  renderInventoryFooter(ctx, assets, {
    attunedCount: data.attunedCount,
    maxAttuned: data.maxAttuned,
    currency: data.currency,
    carriedWeight: Math.round(data.carriedWeight),
    capacity: data.capacity,
  });

  // 3. Bottom 3 equal columns: Stored Items | Additional Treasure | Quest Items
  renderStoredItems(ctx, assets, data.storedItems);
  renderAdditionalTreasure(ctx, assets, data.additionalTreasure);

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
  // Top half: speed value (nudged up from y=8 → y=4 so the digit sits
  // centered in the box above the label, matching the user's request).
  // Bottom: speed mode label.
  value: { x: 2, y: 4, width: 25, height: 18 },
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

  const abilityGapX = 7.5;
  const abilityGapY = 6;
  const abilityWidth = (leftColumn.width - abilityGapX * 2) / 3;
  const abilityHeight = abilityWidth * (STAT_VIEWBOX.height / STAT_VIEWBOX.width);
  const abilityTop = leftColumn.y;
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
  const abilitiesBottom = abilityTop + abilityHeight * 2 + abilityGapY;
  const picture: PdfRect = {
    x: leftColumn.x,
    y: abilitiesBottom + 10,
    width: leftColumn.width,
    height: Math.max(120, COMPANION_PAGE.bodyBottom - (abilitiesBottom + 10)),
  };

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
  const speedTop = hpRowY + 53;
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
  const cardBottomLimit = COMPANION_PAGE.bodyBottom;
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
    x: rects.header.x + 48,
    y: rects.header.y + 28,
    width: 170,
    height: 30,
  }, {
    font: "Times-Bold",
    maxSize: 28,
    minSize: 12,
    color: "#000000",
    lineBreak: false,
  });

  const rightX = rects.header.x + 350;
  const rightWidth = rects.header.width - 370;
  drawCompanionHeaderField(ctx, "Creature", data.creature, {
    x: rightX,
    y: rects.header.y + 25,
    width: 120,
    height: 16,
  });
  drawCompanionHeaderField(ctx, "Owner", data.owner, {
    x: rightX + 125,
    y: rects.header.y + 25,
    width: rightWidth - 125,
    height: 16,
  });
  drawCompanionHeaderField(ctx, "Size", data.size, {
    x: rightX,
    y: rects.header.y + 43,
    width: 95,
    height: 15,
  });
  drawCompanionHeaderField(ctx, "Type", data.type, {
    x: rightX + 100,
    y: rects.header.y + 43,
    width: 120,
    height: 15,
  });
  drawCompanionHeaderField(ctx, "Alignment", data.alignment, {
    x: rightX + 225,
    y: rects.header.y + 43,
    width: rightWidth - 225,
    height: 15,
  });
}

function renderCompanionPicture(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, rect: PdfRect) {
  const doc = ctx.doc as unknown as {
    save: () => void;
    restore: () => void;
    image: (
      source: string,
      x: number,
      y: number,
      options: {
        fit: [number, number];
        align: "center";
        valign: "center";
      },
    ) => void;
    rect: (x: number, y: number, width: number, height: number) => {
      clip: () => void;
      lineWidth: (width: number) => {
        strokeColor: (color: string) => {
          stroke: () => void;
        };
      };
    };
  };

  drawSvg(ctx, assets.generalContainer, rect);
  const imageRect = insetRect(rect, 8, 10);

  if (ctx.companionPortraitImage) {
    doc.save();
    doc.rect(imageRect.x, imageRect.y, imageRect.width, imageRect.height).clip();
    doc.image(ctx.companionPortraitImage, imageRect.x, imageRect.y, {
      fit: [imageRect.width, imageRect.height],
      align: "center",
      valign: "center",
    });
    doc.restore();
  }

  if (!ctx.companionPortraitImage) {
    drawCenteredTextInRect(ctx, "Picture", imageRect, {
      font: "Helvetica",
      maxSize: 14,
      minSize: 10,
      color: "#111111",
    });
  }
}

function renderCompanionAbilities(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  scores: Record<CompanionAbilityCell["key"], number>,
) {
  const slots = {
    save: { x: 11, y: 7.2, width: 33, height: 9.2 },
    // Score slot grown 15.5 → 30pt tall (y 26.8 → 18, height 30) so
    // 28pt scores have room to render — fitTextSize was clamping
    // them to ~15pt in the old slot, making the digit look small
    // despite the 28pt request. Text overflows the original SVG
    // white-rect frame (which is only 20pt tall) — this is OK
    // because drawCenteredTextInRect doesn't apply a mask, it just
    // centers text in the rect. Modifier slot shifted down to make
    // room.
    score: { x: 10.5, y: 18, width: 34, height: 30 },
    label: { x: 10, y: 49, width: 35, height: 8 },
    modifier: { x: 12, y: 56, width: 31, height: 13 },
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
      maxSize: 14,
    });
    drawCenteredTextInRect(ctx, String(score), componentRect(cell.rect, STAT_VIEWBOX, slots.score), {
      ...valueOptions,
      maxSize: 28,
      minSize: 12,
    });
    maskRect(ctx, componentRect(cell.rect, STAT_VIEWBOX, {
      x: 13.5,
      y: 43.8,
      width: 28,
      height: 8,
    }));
    drawCenteredTextInRect(ctx, cell.label, componentRect(cell.rect, STAT_VIEWBOX, slots.label), {
      font: "Helvetica",
      maxSize: 7.2,
      minSize: 5,
      color: "#000000",
    });
    drawCenteredTextInRect(ctx, formatModifier(modifier), componentRect(cell.rect, STAT_VIEWBOX, slots.modifier), {
      ...valueOptions,
      maxSize: 11,
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
    maxSize: 22,
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
    maxSize: 22,
    minSize: 8,
    color: "#000000",
  });

  drawSvg(ctx, assets.ac, rects.ac, "contain");
  // Likewise, keep the shield's baked-in AC label and draw only the value.
  drawCenteredTextInRect(ctx, ac, componentRect(rects.ac, AC_VIEWBOX, AC_SLOTS.value), {
    font: "Helvetica-Bold",
    maxSize: 18,
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
      maxSize: 14,
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
  renderCompanionPicture(ctx, assets, rects.picture);
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
