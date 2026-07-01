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
  sectionTitle: { maxSize: 9, minSize: 6.4 },
  body: { maxSize: 7.5, minSize: 6.4 },
  small: { maxSize: 6, minSize: 6.4 },
  currency: { maxSize: 8, minSize: 6.4 },
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
 * Tokenize a text line into inline runs of italic/regular text
 * based on markdown markers (`*italic*`). Round-13: dropped `**bold**`
 * rendering — we don't have a Magra-Italic cut, and bold-as-emphasis
 * in this body face visibly mis-aligned with surrounding Magra body
 * (Magra-Bold has a different ascender, so the bold word sat lower
 * than the rest of the line). Inline emphasis now renders as italic
 * only via the single-asterisk marker; `**word**` is just stripped to
 * `word` and rendered in the body face so it doesn't visually jump or
 * leave visible asterisks in the rendered output.
 *
 * Section headers (which the section parser extracts via
 * `**Title:**` at the start of a line) still get their bold-uppercase
 * treatment via `drawSectionTitle` — that path is independent of
 * this tokenizer.
 */
// Action-economy / DnD-combat phrase list. These words are bolded
// inline in item + feature descriptions so players scanning for
// "how do I use this thing" surface them first. The user wanted
// the same list as the front page's drawTextWithBoldActionWords:
// attack, move, bonus action, ranged attack, unarmed strike, etc.
// Order is longest-first so phrases like "bonus action" win over
// a standalone "action" later in the list.
// Order is longest-first so multi-word phrases win over their single
// components (e.g. "bonus action" matches before standalone "action").
// Expanded in round-21 per user request — players scan item and feature
// descriptions for action-economy cues first, so we bold the trigger
// terms inline: attacks, movement, reactions, conditions, advantage,
// disadvantage, saving throws, spell slots, legendary mechanics.
const ACTION_WORD_PHRASES = [
  "free object interaction",
  "object interaction",
  "opportunity attack",
  "ranged weapon attack",
  "melee weapon attack",
  "ranged spell attack",
  "melee spell attack",
  "legendary resistance",
  "legendary action",
  "lair action",
  "action surge",
  "bonus action",
  "unarmed strike",
  "ranged attack",
  "ranged strike",
  "melee attack",
  "weapon attack",
  "cast a spell",
  "spell attack",
  "attack action",
  "saving throw",
  "use an object",
  "free action",
  "advantage",
  "disadvantage",
  "spell slot",
  "spell slots",
  "reaction",
  "grapple",
  "shove",
  "dash",
  "disengage",
  "dodge",
  "help",
  "hide",
  "ready",
  "search",
  "attack",
  "action",
  "move",
  "movement",
  "check",
] as const;

function tokenizeInlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  // Combined regex: ***bold+italic*** | **bold** | *italic*. The
  // three-star form captures inner word with bold:true + italic:true so
  // the user-supplied triple-marker (e.g. `* ***Praying Mantis’
  // Swiftness*** =`) renders as a bullet line whose inner word reads in
  // bold-italic. The `**` match captures the inner word with bold:true
  // but we still strip the `**` markers — bold inline emphasis uses the
  // same Magra-Bold body face, no visible asterisks. Single `*italic*`
  // captures with italic:true.
  //
  // Order matters: try the longest match first (*** then ** then *) so
  // the regex engine doesn't split `***x***` into `*` + `**x**` + `*`.
  const regex = /\*\*\*([^*\n][^*\n]*?)\*\*\*|\*\*([^*\n][^*\n]*?)\*\*|(?<!\*)\*([^*\n][^*\n]*?)\*(?!\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      appendInlineRuns(runs, plain);
    }
    if (match[1] !== undefined) {
      // ***bold+italic*** — emit inner word with both flags so the
      // renderer picks Magra-Bold + oblique shear. The surrounding `***`
      // markers are stripped (no visible asterisks).
      runs.push({ text: match[1], bold: true, italic: true });
    } else if (match[2] !== undefined) {
      // **bold** — render inner word in bold body face. Markers
      // stripped so **Bonus Action** reads as body text in the same
      // Magra-Bold ink as the surrounding paragraph (no Teko jump).
      // Round-26 #5: explicitly mark bold:true so the renderer lifts
      // the baseline -2.4pt to align with body descenders.
      runs.push({ text: match[2], bold: true, italic: false });
    } else if (match[3] !== undefined) {
      // *italic* — render inner word in italic body face via PDFKit's
      // oblique shear (Magra has no italic cut).
      runs.push({ text: match[3], bold: false, italic: true });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    appendInlineRuns(runs, text.slice(lastIndex));
  }
  return runs;
}

// Split a plain-text chunk (no `**` or `*` markers) into bold/plain
// runs by matching the action-word phrase list. Longest phrases win
// (the list is pre-sorted longest-first). Matches are case-
// insensitive so "Action" and "ACTION" both bold.
function appendInlineRuns(runs: InlineRun[], chunk: string) {
  if (!chunk) return;
  let remaining = chunk;
  while (remaining.length > 0) {
    const lower = remaining.toLowerCase();
    let bestIdx = -1;
    let bestLen = 0;
    for (const phrase of ACTION_WORD_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx === -1) continue;
      // Don't match if previous char is alphanumeric (inside a word
      // like "attack"). Only match on word boundaries: start of string,
      // after whitespace, or after punctuation.
      const prev = idx > 0 ? remaining[idx - 1] : "";
      if (prev && /[a-zA-Z]/.test(prev)) continue;
      if (idx > bestIdx || (idx === bestIdx && phrase.length > bestLen)) {
        bestIdx = idx;
        bestLen = phrase.length;
      }
    }
    if (bestIdx === -1) {
      runs.push({ text: remaining, bold: false, italic: false });
      return;
    }
    if (bestIdx > 0) {
      runs.push({ text: remaining.slice(0, bestIdx), bold: false, italic: false });
    }
    runs.push({ text: remaining.slice(bestIdx, bestIdx + bestLen), bold: true, italic: false });
    remaining = remaining.slice(bestIdx + bestLen);
  }
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
              y: isBold ? y - 2.4 : y,
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
            // Round-21 baseline fix: PDFKit positions the baseline at
            // `y` using the current font's ascender. Magra and
            // Magra-Bold share sTypoAscender=968 (per TTF OS/2) but
            // Magra-Bold has heavier ink that fills more of the
            // cap-height box AND extends ~0.33pt further below the
            // body baseline at 6.4pt (verified via pdftotext -bbox).
            // The round-15 -1.5pt lift aligned baselines almost
            // perfectly on the front page (diff=0.00) but page 2's
            // tighter lineGap=0.2 vs front page's 0.5 still leaves
            // the bold descender hanging 0.33pt below the body line
            // — small at 400dpi but visible as "bold sits lower".
            // Bumped to -1.8pt to fully zero the descender delta on
            // page 2. Front page stays at -1.5 since it already
            // measured diff=0.00. Same fix mirrored in front-page
            // drawTextWithBoldActionWords (unchanged) for parity.
            y: isBold ? y - 2.4 : y,
            width: wordWidth + 1,
            height: options.size + options.lineGap,
          }, {
            font,
            size: options.size,
            color: options.color,
            lineBreak: false,
            lineGap: 0,
            // Round-25 #F: render *italic* spans with the oblique
            // shear so they read as italic. Without this the `*word*`
            // asterisks vanish but the word itself looks identical to
            // body text (Magra has no italic glyph cut).
            oblique: isItalic ? 12 : undefined,
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
  // Stop content drawing at y=298 so item descriptions don't bleed into
  // the utility row strip (attuned/currency/encumbrance) in the EQUIPPED
  // column. Round-26 #6: footer rows moved up to y=303/325, so item
  // descriptions now stop earlier to avoid collision with the row 1
  // encumbrance/attuned boxes.
  const contentBottomY = 298;
  const columnGap = 6;
  const columnPadding = 4;
  // 3-column newspaper flow (round-27 #5):
  //   "Treat the 3 columns as a single continuous text stream.
  //    If an item's description is too long for Column 1, let it
  //    naturally overflow and wrap into the top of Column 2.
  //    Start the next item immediately below where the previous
  //    one ends, regardless of which column it falls into."
  //
  // Implementation: each column has its own cursor (Y position).
  // We round-robin — fill column 0 from top down, when it fills
  // wrap to column 1, etc. When an item's title/body doesn't fit
  // in the current column AND there's still room in a later column,
  // we jump to that later column instead of starting a new column
  // (this is "continuous text stream" — not "each item gets its own
  // shortest column").
  const columnCount = 3;
  const columnWidth = (rect.width - columnGap * (columnCount - 1) - columnPadding * 2) / columnCount;
  const textFont = "Helvetica";
  const bodySize = 6.4;
  const lineGap = 0.2;
  const titleSize = 8.5;
  const titleH = 14;
  const titleBodyGap = 4;
  // Horizontal rule between items — small visual divider that the
  // user spec calls out as "--- or a bold line space". Implemented
  // as a 0.5pt line + ~2pt padding above and below.
  const ruleH = 1.5;
  const ruleGap = 2;

  // --- Phase 1: Prepare items ---------------------------------------
  type Run = { text: string; bold: boolean; italic?: boolean };
  type WrappedLine = { runs: Run[]; bullet?: boolean };
  type PreparedItem = {
    item: CharacterInventoryItem;
    titleMeta: string;
    lines: WrappedLine[];
  };

  const wrapBody = (description: string): WrappedLine[] => {
    if (!description) return [];
    const lines: WrappedLine[] = [];
    let currentRuns: Run[] = [];
    let currentWidth = 0;

    const flush = () => {
      if (currentRuns.length === 0) return;
      lines.push({ runs: currentRuns });
      currentRuns = [];
      currentWidth = 0;
    };

    const processLine = (line: string) => {
      const trimmed = line.trimStart();
      let bulletPrefix = "";
      let bodyText = trimmed;
      // Bullet detection: leading `*` followed by whitespace is a
      // bullet; `**` and `***` are inline emphasis markers (handled
      // by tokenizeInlineRuns) and do NOT count as bullets.
      if (
        trimmed.startsWith("*") &&
        !trimmed.startsWith("**") &&
        trimmed.length > 1 &&
        /\s/.test(trimmed[1])
      ) {
        bulletPrefix = "• ";
        bodyText = trimmed.slice(1).trimStart();
      }
      const runs = tokenizeInlineRuns(bodyText);
      // Inject bullet glyph as the first run of the first line.
      if (bulletPrefix) {
        if (runs.length > 0 && runs[0].text.startsWith(" ")) {
          runs[0] = { ...runs[0], text: bulletPrefix + runs[0].text.trimStart() };
        } else if (runs.length > 0) {
          runs[0] = { ...runs[0], text: bulletPrefix + runs[0].text };
        } else {
          runs.push({ text: bulletPrefix, bold: false, italic: false });
        }
      }
      for (const run of runs) {
        const segs = run.text.split(/(\s+|\n\n+)/).filter(Boolean);
        for (const seg of segs) {
          if (!seg) continue;
          // Round-28 #3: inline emphasis now uses Magra-Bold
          // (same family as body Magra-Regular) instead of
          // Helvetica-Bold (which aliased to Teko-Medium — a
          // different font family entirely). User feedback:
          // 'I see in item descriptions there is another font,
          // and in first page feature description it is the
          // same font. In reality they have to be formatted
          // the same'. The front page drawTextWithBoldActionWords
          // already used Magra-Bold; this brings page-2 item
          // descriptions in line.
          ctx.doc.save();
          ctx.doc.font(run.bold ? "Magra-Bold" : textFont).fontSize(bodySize);
          const segW = ctx.doc.widthOfString(seg);
          ctx.doc.restore();
          if (/^\n/.test(seg)) {
            flush();
          } else if (/^\s+$/.test(seg)) {
            currentRuns.push({ text: seg, bold: run.bold, italic: run.italic });
            currentWidth += segW;
          } else {
            if (currentWidth + segW > columnWidth && currentRuns.length > 0) {
              flush();
            }
            currentRuns.push({ text: seg, bold: run.bold, italic: run.italic });
            currentWidth += segW;
          }
        }
      }
    };

    const paragraphs = description.split(/\n\n+/);
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const paraLines = para.split(/\n/);
      for (const paraLine of paraLines) {
        if (!paraLine.trim()) continue;
        processLine(paraLine);
      }
      flush();
    }
    flush();
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      while (lastLine.runs.length > 0 && /^\s+$/.test(lastLine.runs[lastLine.runs.length - 1].text)) {
        lastLine.runs.pop();
      }
    }
    return lines;
  };

  const prepared: PreparedItem[] = describedItems.map((item) => {
    const description = extractItemDescription(
      item.sheetDescription || item.detailHtml,
      item.notes ?? item.name,
    );
    return {
      item,
      titleMeta: buildItemMetadataLine(item),
      lines: wrapBody(description),
    };
  });

  // --- Phase 2: Render in TRUE continuous newspaper flow ----------
  // Single text stream. Each item has: title (1 line) + body (N lines)
  // + horizontal rule (except the last item). We write items to the
  // current column top-down; when the current column fills up we move
  // to the NEXT column. Items do NOT restart at the top of a new
  // column — they continue from wherever the previous item's text
  // ended. This matches the user's spec:
  //   "If an item's description is too long for Column 1, let it
  //    naturally overflow and wrap into the top of Column 2.
  //    Start the next item immediately below where the previous one
  //    ends, regardless of which column it falls into."
  const lineH = bodySize + lineGap;
  // Initial cursor: all 3 columns start at contentStartY.
  const columnCursors = Array.from({ length: columnCount }, () => contentStartY);
  let col = 0;

  const fitsInCurrentColumn = (h: number) => columnCursors[col] + h <= contentBottomY;

  const drawTitle = (item: CharacterInventoryItem, titleMeta: string) => {
    const titleX = rect.x + columnPadding + col * (columnWidth + columnGap);
    const titleY = columnCursors[col];
    drawText(ctx, item.name, {
      x: titleX, y: titleY, width: columnWidth, height: titleH,
    }, {
      font: "Helvetica-Bold", size: titleSize, color: COLORS.textPrimary,
      lineGap: 0, ellipsis: true,
    });
    if (titleMeta) {
      ctx.doc.save();
      ctx.doc.font("Helvetica-Bold").fontSize(titleSize);
      const nameWidth = ctx.doc.widthOfString(item.name);
      ctx.doc.restore();
      drawText(ctx, `  —  ${titleMeta}`, {
        x: titleX + nameWidth, y: titleY,
        width: columnWidth - nameWidth, height: titleH,
      }, {
        font: "Helvetica-Bold", size: titleSize, color: COLORS.textSecondary,
        lineGap: 0, ellipsis: true,
      });
    }
    columnCursors[col] = titleY + titleH + titleBodyGap;
  };

  const drawBodyLine = (line: WrappedLine) => {
    if (!fitsInCurrentColumn(lineH)) return false;
    const lineX = rect.x + columnPadding + col * (columnWidth + columnGap);
    const lineY = columnCursors[col];
    let cursorX = lineX;
    for (const run of line.runs) {
      // Round-28 #3: inline emphasis now uses Magra-Bold (same family
      // as body Magra-Regular) instead of Helvetica-Bold (which
      // aliased to Teko-Medium). User feedback: 'These should be
      // formatted the same. ... same font family as the rest of
      // description'. Mirrors the front page change.
      const runFont = run.bold ? "Magra-Bold" : textFont;
      ctx.doc.save();
      ctx.doc.font(runFont).fontSize(bodySize);
      const runW = ctx.doc.widthOfString(run.text);
      ctx.doc.restore();
      const remainingW = lineX + columnWidth - cursorX;
      if (remainingW <= 0) break;
      // Round-28 #3: REMOVE the -2.4pt hardcoded Y lift for bold
      // runs. User feedback: 'these bolded items should all be a bit
      // lower to be in-line I guess, but we should not make this
      // hardcoded, they are part of the same sentence, same text,
      // same font, same size, same everything'. Both Magra-Regular
      // and Magra-Bold share sTypoAscender=968 so the TTF baseline
      // metrics align naturally — the previous lift was compensating
      // for the FONT FAMILY SWITCH (Teko-Medium vs Magra-Regular)
      // which had a 0.33pt ascender delta. Now that both runs use
      // Magra, the lift is unnecessary. Trust the font metrics.
      drawText(ctx, run.text, {
        x: cursorX, y: lineY, width: Math.min(runW, remainingW), height: lineH,
      }, {
        font: runFont,
        size: bodySize,
        color: COLORS.textPrimary,
        lineBreak: false,
        ellipsis: false,
        lineGap,
        oblique: run.italic ? 12 : undefined,
      });
      cursorX += runW;
    }
    columnCursors[col] = lineY + lineH;
    return true;
  };

  const drawHorizontalRule = () => {
    if (!fitsInCurrentColumn(ruleH + ruleGap * 2)) return;
    const ruleY = columnCursors[col] + ruleGap;
    const ruleX1 = rect.x + columnPadding + col * (columnWidth + columnGap);
    const ruleX2 = ruleX1 + columnWidth;
    ctx.doc.save();
    ctx.doc.lineWidth(0.5).strokeColor("#9a9a9a");
    ctx.doc.moveTo(ruleX1, ruleY).lineTo(ruleX2, ruleY).stroke();
    ctx.doc.restore();
    columnCursors[col] = ruleY + ruleGap;
  };

  // Round-27 #5: TRUE continuous newspaper flow. The cursor advances
  // column by column; when the current column fills up we move to the
  // NEXT column and continue writing. Items do NOT restart at the top
  // of a new column — they continue from wherever the previous item's
  // last line ended. This matches the user spec:
  //   "Treat the 3 columns as a single continuous text stream.
  //    If an item's description is too long for Column 1, let it
  //    naturally overflow and wrap into the top of Column 2.
  //    Start the next item immediately below where the previous
  //    one ends, regardless of which column it falls into."
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    // Skip items that have no description AND no title height — they
    // would render as a 14pt blank line. Just skip.
    if (p.lines.length === 0) continue;

    // If current column can't fit the title (14pt), jump to the next
    // column with room. We don't wrap around — once all 3 columns are
    // full, abort (the user has more items than the page can show).
    if (!fitsInCurrentColumn(titleH + titleBodyGap)) {
      let advanced = false;
      for (let offset = 1; offset < columnCount; offset++) {
        const c = (col + offset) % columnCount;
        if (columnCursors[c] + titleH + titleBodyGap <= contentBottomY) {
          col = c;
          advanced = true;
          break;
        }
      }
      if (!advanced) break; // truly out of room
    }

    drawTitle(p.item, p.titleMeta);
    for (const line of p.lines) {
      const ok = drawBodyLine(line);
      if (!ok) {
        // Column full — jump to next column with room for one more
        // body line.
        let advanced = false;
        for (let offset = 1; offset < columnCount; offset++) {
          const c = (col + offset) % columnCount;
          if (columnCursors[c] + lineH <= contentBottomY) {
            col = c;
            advanced = true;
            break;
          }
        }
        if (!advanced) break; // truly out of room
        if (!drawBodyLine(line)) break;
      }
    }
    // Draw horizontal rule between items (except after the last) IF
    // there's room. If the column is too full for a rule, skip it —
    // better no rule than clipping.
    if (i < prepared.length - 1) {
      drawHorizontalRule();
    }
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
    minSize: 6.4,
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
    minSize: 6.4,
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
    minSize: 6.4,
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
      minSize: 6.4,
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
      minSize: 6.4,
      color: COLORS.textSecondary,
    });

    const boxRect: PdfRect = { x: boxX, y: boxY, width: CURRENCY_BOX_WIDTH, height: CURRENCY_BOX_HEIGHT };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);

    drawCenteredTextInRect(ctx, String(currency[type]), boxRect, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.currency.maxSize,
      minSize: 6.4,
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
    minSize: 6.4,
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
      minSize: 6.4,
      color: COLORS.textSecondary,
      lineBreak: false,
    });

    const boxRect: PdfRect = { x: boxX, y: boxY, width: boxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, entry.value, boxRect, {
      font: "Helvetica-Bold",
      maxSize: 6.5,
      minSize: 6.4,
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
  // Round-25 #G: footer split into TWO rows.
  //   Row 1 (y=321, h=20): ENCUMBRANCE (3 boxes) + ATTUNED (1 box)
  //   Row 2 (y=343, h=20): CURRENCY (5 boxes)
  // Boxes are smaller (boxH=14 instead of 16) so both rows fit in the
  // 42pt footer space with a 2pt gap. Labels sit above the value in
  // each box at 3.2pt.
  const textFont = "Magra-Bold";
  const labelSize = 4.0;
  const valueSize = 6.4;
  const boxW = 22;
  const boxH = 14;
  const boxGap = 1.0;

  const encumbranceRegion = PAGE2_INVENTORY_REGIONS.encumbrance;
  const attunedRegion = PAGE2_INVENTORY_REGIONS.attuned;
  const currencyRegion = PAGE2_INVENTORY_REGIONS.currency;

  // Row 1 — Encumbrance boxes (3 across) anchored left, then Attuned.
  const encumbranceValues: Array<{ label: string; value: string }> = [
    { label: "CARRIED", value: `${data.carriedWeight} lb` },
    { label: "CAPACITY", value: `${data.capacity} lb` },
    { label: "PUSH/DRAG", value: `${data.capacity * 2} lb` },
  ];
  const encumbranceTotalW = 3 * boxW + 2 * boxGap;
  encumbranceValues.forEach((entry, index) => {
    const boxX = encumbranceRegion.x + index * (boxW + boxGap);
    // Label sits above the box
    drawCenteredTextInRect(ctx, entry.label, {
      x: boxX - 1,
      y: encumbranceRegion.y,
      width: boxW + 2,
      height: 3.2,
    }, {
      font: textFont,
      maxSize: labelSize,
      minSize: 4.0,
      color: COLORS.textSecondary,
      lineBreak: false,
    });
    const boxRect: PdfRect = { x: boxX, y: encumbranceRegion.y + 4, width: boxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, entry.value, boxRect, {
      font: textFont,
      maxSize: valueSize,
      minSize: 6.4,
      color: COLORS.textPrimary,
      lineBreak: false,
    });
  });

  // Row 1 — Attuned box (right of encumbrance)
  const attunedBoxX = attunedRegion.x;
  drawCenteredTextInRect(ctx, "ATTUNED", {
    x: attunedBoxX - 1,
    y: attunedRegion.y,
    width: boxW + 2,
    height: 3.2,
  }, {
    font: textFont,
    maxSize: labelSize,
    minSize: 4.0,
    color: COLORS.textSecondary,
    lineBreak: false,
  });
  const attunedBox: PdfRect = { x: attunedBoxX, y: attunedRegion.y + 4, width: boxW, height: boxH };
  drawSvg(ctx, assets.proficiencyBox1, attunedBox);
  drawCenteredTextInRect(ctx, `${data.attunedCount}/${data.maxAttuned}`, attunedBox, {
    font: textFont,
    maxSize: valueSize,
    minSize: 6.4,
    color: COLORS.textPrimary,
    lineBreak: false,
  });

  // Row 2 — Currency (5 boxes across the full width of the equipped card).
  // Use wider boxes (currencyBoxW = 36pt) so 5 boxes × 36 + 4 gaps × 1 = 184pt
  // fills the 200pt-wide equipped card row (centered, 8pt margin each side).
  const currencyBoxW = 36;
  const currencyGap = 1.0;
  const currencyTotalW = 5 * currencyBoxW + 4 * currencyGap;
  const currencyStartX = currencyRegion.x + Math.max(0, (currencyRegion.width - currencyTotalW) / 2);
  CURRENCY_TYPES.forEach((type, index) => {
    const boxX = currencyStartX + index * (currencyBoxW + currencyGap);
    drawCenteredTextInRect(ctx, CURRENCY_LABELS[type], {
      x: boxX - 1,
      y: currencyRegion.y,
      width: currencyBoxW + 2,
      height: 3.2,
    }, {
      font: textFont,
      maxSize: labelSize,
      minSize: 4.0,
      color: COLORS.textSecondary,
      lineBreak: false,
    });
    const boxRect: PdfRect = { x: boxX, y: currencyRegion.y + 4, width: currencyBoxW, height: boxH };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);
    drawCenteredTextInRect(ctx, String(data.currency[type]), boxRect, {
      font: textFont,
      maxSize: valueSize,
      minSize: 6.4,
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
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawFittedRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textPrimary, lineGap: 0.4 },
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
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textSecondary, lineGap: 0.4, italic: true },
      );
      y += quoteHeight;
      linesDrawn += Math.max(1, Math.round(quoteHeight / lineHeight));
    } else if (seg.kind === "list") {
      if (linesDrawn + 1 > maxLines) break;
      const listHeight = drawFittedRichParagraph(
        ctx,
        seg.text,
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textPrimary, lineGap: 0.4 },
      );
      y += listHeight;
      linesDrawn += Math.max(1, Math.round(listHeight / lineHeight));
    } else {
      const paraHeight = drawFittedRichParagraph(
        ctx,
        stripMarkdown(seg.text),
        { x: rect.x + 4, y, width: rect.width - 8, maxHeight: availableHeight - (y - contentStartY) },
        { font: "Helvetica", size: 5.5, minSize: 6.4, color: COLORS.textPrimary, lineGap: 0.4 },
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
  // Bumped 3.5 → 6.4pt to match the front page header label size
  // (user: "Header in front page has a different font-size vs the
  // companion and character backstory headers. But font family
  // seems good. Just see about size there."). All three header
  // styles — front, companion, backstory — now use the same
  // 6.4pt Magra body face at #777 for their labels.
  drawText(ctx, label.toUpperCase(), {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: 6.4,
  }, {
    font: "Helvetica",
    size: 6.4,
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
      minSize: 6.4,
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
    // Round-25: save slot grown 9.2 → 18pt tall to match the front
    // page and the companion modifier slot (h=18). At 14pt Magra-Bold
    // lineGap=0, heightOfString = 17.01pt — old 9.2pt slot forced
    // fitTextSize to shrink the save pip digit to ~7pt while the
    // modifier rendered at full 14pt (visible 30% size discrepancy).
    // y shifted from 7.2 → 5 to keep the digit vertically centered
    // within the new height.
    save: { x: 11, y: 5, width: 33, height: 18 },
    // Score slot grown 15.5 → 30pt tall (y 26.8 → 18, height 30) so
    // 28pt scores have room to render — fitTextSize was clamping
    // them to ~15pt in the old slot, making the digit look small
    // despite the 28pt request. Text overflows the original SVG
    // white-rect frame (which is only 20pt tall) — this is OK
    // because drawCenteredTextInRect doesn't apply a mask, it just
    // centers text in the rect. Modifier slot shifted down to make
    // room.
    score: { x: 10.5, y: 18, width: 34, height: 30 },
    // Label slot height grown 8 → 9pt so the overlay label has room
    // to render at 7.2pt Magra without being clamped by the height
    // check. Modifier slot y shifted up 56→53 to center the modifier
    // text inside the SVG circle (bottom circle is at SVG center
    // y≈61.77 with radius ~13.5; slot center y=62 lines up).
    modifier: { x: 12, y: 53, width: 31, height: 18 },
    // STR/DEX/CON/INT/WIS/CHA label slot. The SVG is a single
    // template reused for all 6 cells with the static "STR" text
    // path baked in at viewBox y=46-52. The mask at the call site
    // clears that baked label so this code-drawn overlay (using
    // Magra-Bold to match the front page) can render the correct
    // ability name for this cell.
    //
    // Round-29 #1: REVERT label y back to 46 (was 42 in round-28).
    // Mirrors the front-page change. Round-28 y=42 collided with
    // the SVG-baked divider line at y=43.04, producing strikethrough
    // across the labels. y=46 puts the label JUST BELOW the divider
    // (y≈44) and clears the modifier bubble at y=52 — sitting in
    // the gap with breathing room on both sides.
    label: { x: 10, y: 46, width: 35, height: 8 },
    // Mask slot for the SVG-baked bottom label area (y 46-52).
    // Round-29 #1: SHRUNK height 10 → 5 so the mask stops at y=51,
    // clearing the modifier bubble (which starts at y=52.28). The
    // previous y=46..56 height=10 was eating into the top of the
    // modifier circle, leaving a visible white sliver above the
    // modifier digit.
    labelMaskBottom: { x: 8, y: 46, width: 40, height: 5 },
  } satisfies Record<string, PdfRect>;

  for (const cell of rects.abilityCells) {
    drawSvg(ctx, assets.statBlock, cell.rect, "contain");
    // Round-27 #1c: mask the SVG-baked bottom label ("STR" baked
    // into every cell) before drawing the code-drawn per-cell label.
    maskRect(ctx, componentRect(cell.rect, STAT_VIEWBOX, slots.labelMaskBottom));
    const score = scores[cell.key];
    const modifier = Math.floor((score - 10) / 2);
    const valueOptions = {
      font: "Helvetica-Bold",
      minSize: 6.4,
      color: "#000000",
      // Round-25: explicit lineGap=0 so the 14pt / 28pt save,
      // modifier, and score digits render at full size. Without
      // this, fitTextSize auto-shrinks the score below 28pt because
      // heightOfString(28pt + default 3.36pt lineGap) = 37.38pt
      // exceeds the 30pt score slot.
      lineGap: 0,
    } as const;

    // Round-29 #1: REVERT save pip y-lift to 0 (was -5pt in
    // round-28). Mirrors the front-page change. Round-28's -5pt
    // lift put the digit too high — above the pip center, sitting
    // outside the save circle. Lift 0 lets drawCenteredTextInRect
    // center the digit vertically in the saveSlot (y=5..23) at
    // y≈14, inside the pip circle with breathing room from the
    // baked SAVE text at y=18-22.
    const saveSlot = componentRect(cell.rect, STAT_VIEWBOX, slots.save);
    drawCenteredTextInRect(ctx, formatModifier(modifier), { ...saveSlot, y: saveSlot.y }, {
      ...valueOptions,
      maxSize: 14,
    });
    drawCenteredTextInRect(ctx, String(score), componentRect(cell.rect, STAT_VIEWBOX, slots.score), {
      ...valueOptions,
      maxSize: 28,
      minSize: 12,
    });
    // Round-27 #1c: code-draw per-cell ability label (STR/DEX/CON/
    // INT/WIS/CHA). Matches the front page renderAbilities fix.
    drawCenteredTextInRect(ctx, cell.label, componentRect(cell.rect, STAT_VIEWBOX, slots.label), {
      font: "Helvetica-Bold",
      maxSize: 7,
      minSize: 6.4,
      color: "#555555",
      lineGap: 0,
    });
    // Round-27 #1b: revert round-26 #1 modifier Y lift — user feedback
    // says the modifier now sits ABOVE the circle outline. Render at
    // the original slot Y so the digit lands inside the circle.
    const modifierSlot = componentRect(cell.rect, STAT_VIEWBOX, slots.modifier);
    drawCenteredTextInRect(ctx, formatModifier(modifier), modifierSlot, {
      ...valueOptions,
      maxSize: 14,
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
    minSize: 6.4,
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
    minSize: 6.4,
    color: "#777777",
  });
  const entries = parseMovementSpeeds(speed);
  const passiveFrame = frameOnlySvg(assets.passiveBox, 4);
  rects.speedBoxes.forEach((rect, index) => {
    drawSvg(ctx, passiveFrame, rect, "contain");
    drawCenteredTextInRect(ctx, entries[index].value, componentRect(rect, PASSIVE_BOX_VIEWBOX, PASSIVE_BOX_SLOTS.value), {
      font: "Helvetica-Bold",
      // Round-25: explicit lineGap=0 so the 14pt Magra-Bold value
      // fits the 18pt slot without fitTextSize auto-shrinking below
      // 14pt. Without lineGap=0 the default 0.12×size lineGap pushes
      // heightOfString to 18.69pt > 18pt slot, so fitTextSize shrunk
      // to ~13pt. Both front passives and companion SPEED now render
      // at the same 14pt.
      maxSize: 14,
      minSize: 6.4,
      color: "#000000",
      lineGap: 0,
    });
    drawCenteredTextInRect(ctx, entries[index].label, componentRect(rect, PASSIVE_BOX_VIEWBOX, PASSIVE_BOX_SLOTS.label), {
      font: "Helvetica",
      // Fixed inverted maxSize/minSize — was 3.8 / 6.4 which made
      // the label clamp to 3.8pt (just above minSize floor is
      // unreachable since minSize > maxSize). Set maxSize 6.4 to
      // match the front page passive labels (also Magra 6.4pt) so
      // both pages render Walking/Flying/Climbing at the same size.
      maxSize: 6.4,
      minSize: 6.4,
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
    minSize: 6.4,
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
    minSize: 6.4,
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
      minSize: 6.4,
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
