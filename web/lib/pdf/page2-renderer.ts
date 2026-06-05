import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, ResolvedPdfCharacter } from "@/lib/pdf/types";
import type { CharacterInventoryItem } from "@/lib/characters/types";
import {
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
  fitTextSize,
  type PdfRect,
  type PdfRenderContext,
} from "@/lib/pdf/drawing";
import {
  PAGE2_COMPANION_REGIONS,
  PAGE2_INVENTORY_REGIONS,
  PAGE2_PRINT_SAFE_OFFSET,
  PAGE2_PRINT_SAFE_SCALE,
} from "@/lib/pdf/page2-layout";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

// --- Companion page layout (3-column redesign) ---
// Page 2 is A4 portrait (PAGE_SIZE = 595 x 842). The companion page splits the
// available body into three columns under a full-width header:
//   Left   = portrait + ability scores (single d20 stat-block frame, 3x2 grid)
//   Middle = vertical stack: Prof, Initiative, HP, AC, Speeds, Skills
//   Right  = single Features & Traits box
const COMPANION_LAYOUT = {
  header: { x: 10, y: 10, width: 575, height: 36 },
  bodyTop: 56,
  // Y of the bottom margin (page height - bottom margin)
  bodyBottom: 832,
  // Column footprints (x, width). Each column extends bodyTop..bodyBottom.
  left: { x: 10, width: 148 },
  middle: { x: 165, width: 200 },
  right: { x: 372, width: 213 },
  // Vertical positions in the left column
  portraitHeight: 170,
  statBlockTop: 188,
  statBlockHeight: 240,
  // Vertical positions in the middle column
  profInitRowHeight: 50,
  statBoxHeight: 50,
  statGap: 5,
  // Width of the Prof and Init boxes (each is half of middle column minus gap)
  halfBoxWidth: 96,
  halfBoxGap: 8,
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

// Bonus box: 45×42 pts per unit, 5 across with gaps
const BONUS_BOX_WIDTH = 45;
const BONUS_BOX_HEIGHT = 42;
const BONUS_BOX_GAP = 4;
const CURRENCY_ROW_PADDING = 10;

// --- Line constants ---
const LINE_WIDTH = 364;
const LINE_HEIGHT = 10;
const LINE_ROW_GAP = 2;

// ============================================================
// RENDERING HELPERS
// ============================================================

function drawSectionTitle(ctx: PdfRenderContext, title: string, rect: PdfRect) {
  drawText(ctx, title, { x: rect.x + 2, y: rect.y + 1, width: rect.width, height: 14 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.sectionTitle.maxSize,
    color: COLORS.textPrimary,
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

function fillRect(ctx: PdfRenderContext, rect: PdfRect, color: string) {
  const shapeDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { fill: (c?: string) => void; stroke: (c?: string, w?: number) => void } };
  shapeDoc.rect(rect.x, rect.y, rect.width, rect.height).fill(color);
}

function strokeRect(ctx: PdfRenderContext, rect: PdfRect, color: string, width: number) {
  const shapeDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { fill: (c?: string) => void; stroke: (c?: string, w?: number) => void } };
  shapeDoc.rect(rect.x, rect.y, rect.width, rect.height).stroke(color, width);
}

// ============================================================
// RENDER INVENTORY PAGE
// ============================================================

function renderInventoryHeader(ctx: PdfRenderContext, _assets: PdfSvgAssetBundle) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryHeader;
  drawSvg(ctx, _assets.generalContainer, rect);
  drawSectionTitle(ctx, "INVENTORY", rect);
}

function renderInventoryTable(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: CharacterInventoryItem[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryTable;
  drawSvg(ctx, assets.greyBackground, rect);

  // Column layout: # | Name | Qty | lb
  const colX = [rect.x + 2, rect.x + 20, rect.x + 130, rect.x + 220];
  const headerY = rect.y + 2;

  // Draw column headers
  const headers = ["#", "Name", "Qty", "lb"];
  headers.forEach((h, i) => {
    drawText(ctx, h, { x: colX[i], y: headerY, width: 30, height: 12 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
  });

  // Separator line under headers
  const sepDoc = ctx.doc as { moveTo: (x: number, y: number) => { lineTo: (x: number, y: number) => { stroke: () => void } } };
  sepDoc.moveTo(rect.x + 2, headerY + 4).lineTo(rect.x + rect.width - 2, headerY + 4).stroke();

  // Draw inventory rows
  const rowStartY = headerY + 7;
  const maxRows = Math.floor((rect.height - (rowStartY - rect.y) - 8) / (LINE_HEIGHT + LINE_ROW_GAP));
  const visibleItems = items.slice(0, maxRows);

  visibleItems.forEach((item, index) => {
    const rowY = rowStartY + index * (LINE_HEIGHT + LINE_ROW_GAP);

    // Draw line
    const lineRect: PdfRect = { x: rect.x + 2, y: rowY, width: LINE_WIDTH, height: LINE_HEIGHT };
    drawSvg(ctx, assets.line, lineRect);

    // Item data
    const rowData = [
      String(index + 1),
      item.name.length > 30 ? item.name.slice(0, 28) + "…" : item.name,
      String(item.quantity),
      item.weight ?? "—",
    ];

    rowData.forEach((text, i) => {
      drawText(ctx, text, { x: colX[i], y: rowY + 1, width: 100, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textPrimary,
      });
    });
  });
}

function renderItemDescriptions(
  ctx: PdfRenderContext,
  _assets: PdfSvgAssetBundle,
  items: CharacterInventoryItem[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.itemDescriptions;
  drawSvg(ctx, _assets.generalContainer, rect);

  drawSectionTitle(ctx, "ITEM DESCRIPTIONS", rect);

  const magicItems = items.filter(
    (item) => item.rarity || item.attuned || item.detailHtml,
  );

  if (magicItems.length === 0) {
    drawText(
      ctx,
      "No magic items or attuned equipment.",
      { x: rect.x + 4, y: rect.y + 16, width: rect.width - 8, height: 30 },
      { font: "Helvetica-Oblique", size: TYPOGRAPHY.small.maxSize, color: COLORS.textTertiary },
    );
    return;
  }

  const contentStartY = rect.y + 16;
  let currentY = contentStartY;

  magicItems.forEach((item) => {
    if (currentY + 22 > rect.y + rect.height - 4) return;

    // Item name (bold)
    drawText(ctx, item.name, { x: rect.x + 4, y: currentY, width: rect.width - 8, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textPrimary,
    });
    currentY += 6;

    if (item.rarity) {
      drawText(ctx, item.rarity, { x: rect.x + 4, y: currentY, width: 100, height: 8 }, {
        font: "Helvetica-Oblique",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textSecondary,
      });
      currentY += 5;
    }

    if (item.sourceLabel) {
      drawText(ctx, item.sourceLabel, { x: rect.x + 4, y: currentY, width: 100, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textTertiary,
      });
      currentY += 5;
    }

    if (item.detailHtml) {
      const cleanDesc = cleanHtmlText(item.detailHtml);
      const descLines = cleanDesc.split("\n").slice(0, 2);
      descLines.forEach((line) => {
        if (currentY + 5 > rect.y + rect.height - 4) return;
        const trimmed = line.length > 50 ? line.slice(0, 48) + "…" : line;
        drawText(ctx, trimmed, { x: rect.x + 4, y: currentY, width: rect.width - 8, height: 8 }, {
          font: "Helvetica",
          size: TYPOGRAPHY.small.minSize,
          color: COLORS.textSecondary,
        });
        currentY += 5;
      });
    }

    currentY += 4;
  });
}

function renderAttunedAndValuables(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  attunedCount: number,
  maxAttuned: number,
  valuables: string[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.attunedAndValuables;
  drawSvg(ctx, assets.greyBackground, rect);

  // Attuned section
  drawText(ctx, "ATTUNED", { x: rect.x + 4, y: rect.y + 4, width: 80, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });
  drawText(ctx, `${attunedCount}/${maxAttuned}`, { x: rect.x + 4, y: rect.y + 14, width: 80, height: 14 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
  });

  // Divider
  const midDoc = ctx.doc as { moveTo: (x: number, y: number) => { lineTo: (x: number, y: number) => { stroke: () => void } } };
  midDoc.moveTo(rect.x + rect.width / 2, rect.y + 4).lineTo(rect.x + rect.width / 2, rect.y + rect.height - 4).stroke();

  // Valuables section
  const midX = rect.x + rect.width / 2;
  drawText(ctx, "VALUABLES", { x: midX + 4, y: rect.y + 4, width: 100, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  if (valuables.length > 0) {
    const valText = valuables.slice(0, 3).join(", ");
    drawText(ctx, valText.length > 40 ? valText.slice(0, 38) + "…" : valText, { x: midX + 4, y: rect.y + 14, width: rect.width / 2 - 8, height: 20 }, {
      font: "Helvetica",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textSecondary,
    });
  } else {
    drawText(ctx, "—", { x: midX + 4, y: rect.y + 14, width: 30, height: 14 }, {
      font: "Helvetica",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textTertiary,
    });
  }
}

function renderCurrency(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number },
) {
  const rect = PAGE2_INVENTORY_REGIONS.currency;
  drawSvg(ctx, assets.greyBackground, rect);

  drawText(ctx, "CURRENCY", { x: rect.x + 4, y: rect.y + 2, width: 60, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  // Center the 5 bonus boxes
  const availableWidth = rect.width - 2 * CURRENCY_ROW_PADDING;
  const totalBonusBoxesWidth = 5 * BONUS_BOX_WIDTH + 4 * BONUS_BOX_GAP;
  const startOffset = Math.max(0, (availableWidth - totalBonusBoxesWidth) / 2);

  CURRENCY_TYPES.forEach((type, index) => {
    const x = rect.x + CURRENCY_ROW_PADDING + startOffset + index * (BONUS_BOX_WIDTH + BONUS_BOX_GAP);
    const y = rect.y + 16;

    const boxRect: PdfRect = { x, y, width: BONUS_BOX_WIDTH, height: BONUS_BOX_HEIGHT };
    drawSvg(ctx, assets.bonusBox, boxRect);

    const value = currency[type];

    // Label centered in top portion
    drawCenteredTextInRect(ctx, CURRENCY_LABELS[type], { ...boxRect, y: boxRect.y, height: 14 }, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.small.minSize,
      minSize: 3,
      color: COLORS.textSecondary,
    });

    // Value centered in bottom portion
    drawCenteredTextInRect(ctx, String(value), { ...boxRect, y: boxRect.y + 14, height: boxRect.height - 14 }, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.currency.maxSize,
      minSize: 5,
      color: COLORS.textPrimary,
    });
  });
}

function renderEncumbrance(
  ctx: PdfRenderContext,
  _assets: PdfSvgAssetBundle,
  carriedWeight: number,
  capacity: number,
) {
  const rect = PAGE2_INVENTORY_REGIONS.encumbrance;
  drawSvg(ctx, _assets.generalContainer, rect);

  drawText(ctx, "ENCUMBRANCE", { x: rect.x + 4, y: rect.y + 2, width: 80, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  drawText(ctx, `Carried: ${carriedWeight} lb`, { x: rect.x + 4, y: rect.y + 14, width: 100, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textPrimary,
  });

  drawText(ctx, `Capacity: ${capacity} lb`, { x: rect.x + 120, y: rect.y + 14, width: 100, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
  });

  const pushDragLift = capacity * 2;
  drawText(ctx, `Push/Drag/Lift: ${pushDragLift} lb`, { x: rect.x + 220, y: rect.y + 14, width: 130, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
  });

  // Visual bar
  const barX = rect.x + 4;
  const barY = rect.y + 26;
  const barWidth = rect.width - 8;
  const barHeight = 6;
  const fillRatio = Math.min(carriedWeight / capacity, 1);
  const fillWidth = Math.max(0, barWidth * fillRatio);

  const shapeDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { fill: (c?: string) => void; stroke: (c?: string, w?: number) => void } };
  shapeDoc.rect(barX, barY, barWidth, barHeight).fill("#E0E0E0");
  if (fillWidth > 0) {
    shapeDoc.rect(barX, barY, fillWidth, barHeight).fill(carriedWeight > capacity ? "#CC3333" : "#4A90D9");
  }
  shapeDoc.rect(barX, barY, barWidth, barHeight).stroke("#999999", 0.5);
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

  const contentStartY = rect.y + 14;
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

function renderStoredItems(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: Array<{ name: string; quantity: number; weight?: string }>,
) {
  const leftRect = PAGE2_INVENTORY_REGIONS.storedItemsLeft;
  const rightRect = PAGE2_INVENTORY_REGIONS.storedItemsRight;

  [leftRect, rightRect].forEach((rect, colIndex) => {
    drawSvg(ctx, assets.greyBackground, rect);

    const header = `STORED ITEMS #${colIndex + 1}`;
    drawText(ctx, header, { x: rect.x + 4, y: rect.y + 2, width: 120, height: 10 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textPrimary,
    });

    const colItems = items.slice(colIndex * 8, (colIndex + 1) * 8);
    const contentStartY = rect.y + 12;
    const lineGap = (rect.height - (contentStartY - rect.y) - 4) / 8;

    colItems.forEach((item, i) => {
      const lineY = contentStartY + i * lineGap;
      const lineRect: PdfRect = { x: rect.x + 2, y: lineY, width: rect.width - 4, height: LINE_HEIGHT };
      drawSvg(ctx, assets.line, lineRect);

      const itemLabel = `${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.name}`;
      drawText(ctx, itemLabel.length > 35 ? itemLabel.slice(0, 33) + "…" : itemLabel, { x: rect.x + 4, y: lineY + 1, width: rect.width - 40, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textPrimary,
      });

      if (item.weight) {
        drawText(ctx, `${item.weight} lb`, { x: rect.x + rect.width - 30, y: lineY + 1, width: 26, height: 8 }, {
          font: "Helvetica",
          size: TYPOGRAPHY.small.minSize,
          color: COLORS.textTertiary,
        });
      }
    });
  });
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

  renderInventoryHeader(ctx, assets);
  renderInventoryTable(ctx, assets, data.equipment);
  renderItemDescriptions(ctx, assets, data.equipment);
  renderAttunedAndValuables(ctx, assets, data.attunedCount, data.maxAttuned, data.valuables);
  renderCurrency(ctx, assets, data.currency);
  renderEncumbrance(ctx, assets, Math.round(data.carriedWeight), data.capacity);

  const treasureLines = data.additionalTreasure ? data.additionalTreasure.split("\n") : [];
  renderLinedSection(ctx, assets, PAGE2_INVENTORY_REGIONS.additionalTreasure, "ADDITIONAL TREASURE", treasureLines, 4);

  const questLines = data.questItems ? data.questItems.split("\n") : [];
  renderLinedSection(ctx, assets, PAGE2_INVENTORY_REGIONS.questItems, "QUEST ITEMS & TRINKETS", questLines, 7);

  if (data.storedItems.length > 0) {
    renderStoredItems(ctx, assets, data.storedItems);
  }

  doc.restore();
}

// ============================================================
// RENDER COMPANION PAGE
// ============================================================
//
// The companion page is a 3-column layout rendered from a single
// companionCard on the ResolvedPdfCharacter. Tag conventions on the
// card (see renderCompanionPage below) drive the data extraction.
//
//   ┌──────────────────────────────────────────────────────┐
//   │ HEADER  (name · type · CR)                           │
//   ├──────────┬────────────────────┬──────────────────────┤
//   │ PORTRAIT │  PROF    INIT      │                      │
//   │          │  HP                │  FEATURES & TRAITS   │
//   │  STAT    │  AC                │   (full height)      │
//   │  BLOCK   │  SPEED             │                      │
//   │  (3x2)   │  SKILLS            │                      │
//   └──────────┴────────────────────┴──────────────────────┘

/** Draws the full-width header bar with the companion's name, type, and CR. */
function renderCompanionHeaderNew(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  name: string,
  type: string,
  cr: string,
) {
  const rect = COMPANION_LAYOUT.header;
  drawSvg(ctx, assets.generalContainer, rect);

  // Big bold name on the left
  drawText(ctx, name.toUpperCase(), { x: rect.x + 6, y: rect.y + 5, width: rect.width - 220, height: 18 }, {
    font: "Helvetica-Bold",
    size: 14,
    color: COLORS.textPrimary,
  });

  // Type + CR aligned to the right
  drawText(ctx, `${type} · CR ${cr}`, { x: rect.x + rect.width - 210, y: rect.y + 9, width: 200, height: 14 }, {
    font: "Helvetica",
    size: 9,
    color: COLORS.textSecondary,
    align: "right",
  });
}

/** Renders the portrait frame (or placeholder if no image). */
function renderCompanionPortraitNew(ctx: PdfRenderContext) {
  const col = COMPANION_LAYOUT.left;
  const rect: PdfRect = {
    x: col.x,
    y: COMPANION_LAYOUT.bodyTop,
    width: col.width,
    height: COMPANION_LAYOUT.portraitHeight,
  };
  const shapeDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { stroke: (c: string, w: number) => void } };
  shapeDoc.rect(rect.x, rect.y, rect.width, rect.height).stroke("#999999", 0.6);
  drawText(ctx, "[Portrait]", { x: rect.x, y: rect.y + rect.height / 2 - 5, width: rect.width, height: 10 }, {
    font: "Helvetica-Oblique",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textTertiary,
    align: "center",
  });
}

/**
 * Renders the d20 stat block in the left column: an outer d20 frame
 * (statBlock SVG) with a 3x2 grid of abilities (STR/DEX/CON/INT/WIS/CHA)
 * painted inside it.
 */
function renderCompanionAbilityScoresStatBlock(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  scores: Record<string, number>,
) {
  const col = COMPANION_LAYOUT.left;
  const rect: PdfRect = {
    x: col.x,
    y: COMPANION_LAYOUT.statBlockTop,
    width: col.width,
    height: COMPANION_LAYOUT.statBlockHeight,
  };
  drawSvg(ctx, assets.statBlock, rect);

  const abilities: Array<{ key: string; label: string }> = [
    { key: "str", label: "STR" },
    { key: "dex", label: "DEX" },
    { key: "con", label: "CON" },
    { key: "int", label: "INT" },
    { key: "wis", label: "WIS" },
    { key: "cha", label: "CHA" },
  ];

  // 3 columns x 2 rows. Leave space at the top for the d20 frame's title.
  const innerX = rect.x + 6;
  const innerY = rect.y + 36;
  const innerW = rect.width - 12;
  const innerH = rect.height - 44;
  const cellW = innerW / 3;
  const cellH = innerH / 2;

  abilities.forEach((ab, i) => {
    const cellX = innerX + (i % 3) * cellW;
    const cellY = innerY + Math.floor(i / 3) * cellH;
    const score = scores[ab.key] ?? 10;
    const mod = Math.floor((score - 10) / 2);
    const modStr = (mod >= 0 ? "+" : "") + String(mod);

    // Label
    drawText(ctx, ab.label, { x: cellX + 2, y: cellY + 2, width: cellW - 4, height: 10 }, {
      font: "Helvetica-Bold",
      size: 7,
      color: COLORS.textSecondary,
      align: "center",
    });
    // Score (large)
    drawText(ctx, String(score), { x: cellX + 2, y: cellY + 14, width: cellW - 4, height: 24 }, {
      font: "Helvetica-Bold",
      size: 18,
      color: COLORS.textPrimary,
      align: "center",
    });
    // Modifier (small, below score)
    drawText(ctx, modStr, { x: cellX + 2, y: cellY + 40, width: cellW - 4, height: 10 }, {
      font: "Helvetica",
      size: 8,
      color: COLORS.textSecondary,
      align: "center",
    });
  });
}

/**
 * Generic stat box: draws the given SVG and stacks a label + value inside.
 * labelRect / valueRect are the inner sub-rects used to center the text.
 */
function drawLabeledStatBox(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  bg: "bonusBox" | "hp" | "ac" | "passiveBox" | "generalContainer" | "statBlock" | "greyBackground",
  rect: PdfRect,
  label: string,
  value: string,
  options?: { labelSize?: number; valueSize?: number; valueFont?: "Helvetica" | "Helvetica-Bold" },
) {
  drawSvg(ctx, assets[bg], rect);

  const labelSize = options?.labelSize ?? 6;
  const valueSize = options?.valueSize ?? 11;
  const valueFont = options?.valueFont ?? "Helvetica-Bold";

  // Label on top, value below — split the box roughly 1/3 label, 2/3 value.
  const labelHeight = Math.max(10, Math.floor(rect.height * 0.32));
  drawCenteredTextInRect(ctx, label, { x: rect.x, y: rect.y + 2, width: rect.width, height: labelHeight - 2 }, {
    font: "Helvetica-Bold",
    maxSize: labelSize,
    minSize: 4,
    color: COLORS.textSecondary,
  });
  drawCenteredTextInRect(ctx, value, { x: rect.x, y: rect.y + labelHeight, width: rect.width, height: rect.height - labelHeight - 2 }, {
    font: valueFont,
    maxSize: valueSize,
    minSize: 6,
    color: COLORS.textPrimary,
  });
}

/** Builds the middle column (Prof, Initiative, HP, AC, Speeds, Skills). */
function renderCompanionMiddleColumn(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  data: {
    prof: number;
    init: number;
    hp: string;
    ac: string;
    speed: string;
    skills: string[];
  },
) {
  const col = COMPANION_LAYOUT.middle;
  let y = COMPANION_LAYOUT.bodyTop;

  // Prof + Initiative side-by-side
  const profBoxWidth = (col.width - COMPANION_LAYOUT.halfBoxGap) / 2;
  const halfHeight = COMPANION_LAYOUT.profInitRowHeight;
  drawLabeledStatBox(ctx, assets, "bonusBox", { x: col.x, y, width: profBoxWidth, height: halfHeight }, "PROFICIENCY", `+${data.prof}`, { valueSize: 16 });
  drawLabeledStatBox(ctx, assets, "bonusBox", { x: col.x + profBoxWidth + COMPANION_LAYOUT.halfBoxGap, y, width: profBoxWidth, height: halfHeight }, "INITIATIVE", formatModifier(data.init), { valueSize: 16 });
  y += halfHeight + COMPANION_LAYOUT.statGap;

  // HP full-width
  drawLabeledStatBox(ctx, assets, "hp", { x: col.x, y, width: col.width, height: COMPANION_LAYOUT.statBoxHeight }, "HIT POINTS", data.hp, { valueSize: 18 });
  y += COMPANION_LAYOUT.statBoxHeight + COMPANION_LAYOUT.statGap;

  // AC full-width
  drawLabeledStatBox(ctx, assets, "ac", { x: col.x, y, width: col.width, height: COMPANION_LAYOUT.statBoxHeight }, "ARMOR CLASS", data.ac, { valueSize: 18 });
  y += COMPANION_LAYOUT.statBoxHeight + COMPANION_LAYOUT.statGap;

  // Speeds box (passive box shape — fits a short string)
  drawLabeledStatBox(ctx, assets, "passiveBox", { x: col.x, y, width: col.width, height: COMPANION_LAYOUT.statBoxHeight }, "SPEED", data.speed, { valueSize: 12, valueFont: "Helvetica" });
  y += COMPANION_LAYOUT.statBoxHeight + COMPANION_LAYOUT.statGap;

  // Skills box (general container; takes the remaining vertical space)
  const skillsHeight = COMPANION_LAYOUT.bodyBottom - y - 4;
  const skillsRect: PdfRect = { x: col.x, y, width: col.width, height: skillsHeight };
  drawSvg(ctx, assets.generalContainer, skillsRect);
  drawText(ctx, "SKILLS", { x: skillsRect.x + 4, y: skillsRect.y + 2, width: skillsRect.width - 8, height: 10 }, {
    font: "Helvetica-Bold",
    size: 7,
    color: COLORS.textSecondary,
  });
  let skillY = skillsRect.y + 14;
  if (data.skills.length === 0) {
    drawText(ctx, "—", { x: skillsRect.x + 4, y: skillY, width: skillsRect.width - 8, height: 8 }, {
      font: "Helvetica-Oblique",
      size: 6,
      color: COLORS.textTertiary,
    });
  } else {
    // 2-column skill list
    const halfW = (skillsRect.width - 12) / 2;
    const lineH = 9;
    data.skills.forEach((skill, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = skillsRect.x + 4 + col * (halfW + 4);
      const ly = skillY + row * lineH;
      if (ly + lineH > skillsRect.y + skillsRect.height - 2) return; // out of space
      drawText(ctx, skill, { x, y: ly, width: halfW, height: lineH - 1 }, {
        font: "Helvetica",
        size: 6.5,
        color: COLORS.textPrimary,
      });
    });
  }
}

/** Renders the right column: a single Features & Traits box. */
function renderCompanionRightColumn(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  cards: PdfPageCard[],
) {
  const col = COMPANION_LAYOUT.right;
  const rect: PdfRect = {
    x: col.x,
    y: COMPANION_LAYOUT.bodyTop,
    width: col.width,
    height: COMPANION_LAYOUT.bodyBottom - COMPANION_LAYOUT.bodyTop,
  };
  drawSvg(ctx, assets.generalContainer, rect);
  drawText(ctx, "FEATURES & TRAITS", { x: rect.x + 4, y: rect.y + 2, width: rect.width - 8, height: 10 }, {
    font: "Helvetica-Bold",
    size: 7,
    color: COLORS.textSecondary,
  });

  let y = rect.y + 14;
  const maxY = rect.y + rect.height - 4;
  if (cards.length === 0) {
    drawText(ctx, "—", { x: rect.x + 4, y, width: rect.width - 8, height: 8 }, {
      font: "Helvetica-Oblique",
      size: 6.5,
      color: COLORS.textTertiary,
    });
    return;
  }

  cards.forEach((card) => {
    if (y + 18 > maxY) return; // out of space, stop
    drawText(ctx, card.title, { x: rect.x + 4, y, width: rect.width - 8, height: 9 }, {
      font: "Helvetica-Bold",
      size: 6.5,
      color: COLORS.textPrimary,
    });
    y += 8;
    if (card.summary) {
      const summaryLines = card.summary.split("\n").slice(0, 6);
      summaryLines.forEach((line) => {
        if (y + 5 > maxY) return;
        const trimmed = line.length > 70 ? line.slice(0, 68) + "…" : line;
        drawText(ctx, trimmed, { x: rect.x + 6, y, width: rect.width - 12, height: 6 }, {
          font: "Helvetica",
          size: 5.5,
          color: COLORS.textSecondary,
        });
        y += 5.5;
      });
    }
    y += 4;
  });
}

/** Formats a numeric modifier with an explicit sign (e.g. +2, 0, -1). */
function formatModifier(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return String(n);
  return "0";
}

function renderCompanionHeader(
  ctx: PdfRenderContext,
  _assets: PdfSvgAssetBundle,
  name: string,
  type: string,
  cr: string,
) {
  const rect = PAGE2_COMPANION_REGIONS.header;
  drawSvg(ctx, _assets.generalContainer, rect);

  drawText(ctx, name.toUpperCase(), { x: rect.x + 4, y: rect.y + 3, width: 300, height: 14 }, {
    font: "Helvetica-Bold",
    size: 11,
    color: COLORS.textPrimary,
  });

  drawText(ctx, `${type} | CR ${cr}`, { x: rect.x + rect.width - 90, y: rect.y + 3, width: 80, height: 12 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
  });
}

function renderCompanionPortrait(ctx: PdfRenderContext) {
  const rect = PAGE2_COMPANION_REGIONS.portrait;

  // Draw placeholder frame
  const frameDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { stroke: (c: string, w: number) => void } };
  frameDoc.rect(rect.x, rect.y, rect.width, rect.height).stroke("#AAAAAA", 0.5);

  drawText(ctx, "[Portrait]", { x: rect.x + rect.width / 2 - 20, y: rect.y + rect.height / 2 - 4, width: 50, height: 10 }, {
    font: "Helvetica-Oblique",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textTertiary,
  });
}

function renderCompanionHPStrip(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  maxHP: number,
  currentHP: number,
) {
  const rect = PAGE2_COMPANION_REGIONS.hpStrip;
  drawSvg(ctx, assets.hp, rect);

  drawText(ctx, "HP MAX", { x: rect.x + 4, y: rect.y + 6, width: 50, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textSecondary,
  });
  drawText(ctx, String(maxHP), { x: rect.x + 4, y: rect.y + 18, width: 50, height: 18 }, {
    font: "Helvetica-Bold",
    size: 16,
    color: COLORS.textPrimary,
  });

  drawText(ctx, "CURRENT HP", { x: rect.x + 60, y: rect.y + 6, width: 70, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textSecondary,
  });

  const barX = rect.x + 60;
  const barY = rect.y + 20;
  const barW = 80;
  const barH = 12;
  const fillRatio = Math.min(currentHP / maxHP, 1);

  const shapeDoc = ctx.doc as unknown as { rect: (x: number, y: number, w: number, h: number) => { fill: (c?: string) => void; stroke: (c?: string, w?: number) => void } };
  shapeDoc.rect(barX, barY, barW, barH).fill("#E8E8E8");
  if (fillRatio > 0) {
    shapeDoc.rect(barX, barY, barW * fillRatio, barH).fill("#4A90D9");
  }
  shapeDoc.rect(barX, barY, barW, barH).stroke(COLORS.border, 0.4);
}

function renderCompanionStatsRow(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  prof: number,
  init: number,
  hitDice: string,
) {
  // Renders a stacked row: [ PROF | INIT | HIT DICE ] in statsRow region (138×108)
  const rect = PAGE2_COMPANION_REGIONS.statsRow;
  const cellW = rect.width; // 84 total
  const cellH = 30; // each stat gets 30px height

  // PROF
  drawSvg(ctx, assets.bonusBox, { x: rect.x, y: rect.y, width: cellW, height: cellH });
  drawText(ctx, "PROF", { x: rect.x + 2, y: rect.y + 3, width: cellW - 4, height: 10 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawText(ctx, `+${prof}`, { x: rect.x + 2, y: rect.y + 13, width: cellW - 4, height: 14 }, {
    font: "Helvetica-Bold",
    size: 10,
    color: COLORS.textPrimary,
    align: "center",
    lineBreak: false,
  });

  // INIT
  drawSvg(ctx, assets.bonusBox, { x: rect.x, y: rect.y + cellH, width: cellW, height: cellH });
  drawText(ctx, "INIT", { x: rect.x + 2, y: rect.y + cellH + 3, width: cellW - 4, height: 10 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawText(ctx, String(init), { x: rect.x + 2, y: rect.y + cellH + 13, width: cellW - 4, height: 14 }, {
    font: "Helvetica-Bold",
    size: 10,
    color: COLORS.textPrimary,
    align: "center",
    lineBreak: false,
  });

  // HIT DICE
  drawSvg(ctx, assets.bonusBox, { x: rect.x, y: rect.y + cellH * 2, width: cellW, height: cellH });
  drawText(ctx, "HIT DICE", { x: rect.x + 2, y: rect.y + cellH * 2 + 3, width: cellW - 4, height: 6 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  // Multiclass characters used to overflow here (e.g. "3d8 • 3d8 • 2d8 • 2d6"
  // at 5pt bold was 88pt wide vs 80pt cell). Hit dice are now combined into at
  // most 4 entries (Xd6 / Xd8 / Xd10 / Xd12) so the worst case is ~22 chars —
  // fits 80pt at 5pt. Restore a readable 5pt and trim height back to 19pt.
  drawText(ctx, hitDice || "—", { x: rect.x + 2, y: rect.y + cellH * 2 + 9, width: cellW - 4, height: 19 }, {
    font: "Helvetica-Bold",
    size: 5,
    color: COLORS.textPrimary,
    align: "center",
    lineBreak: true,
  });
}

function renderCompanionAbilityScores(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  scores: Record<string, number>,
) {
  const rect = PAGE2_COMPANION_REGIONS.abilityScores;
  drawSvg(ctx, assets.abilityPanel, rect);

  const abilities = ["str", "dex", "con", "int", "wis", "cha"];
  const colW = rect.width / 2;
  const rowH = rect.height / 3;

  abilities.forEach((ability, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = rect.x + col * colW + 4;
    const y = rect.y + row * rowH + 4;

    const score = scores[ability] ?? 10;
    const mod = Math.floor((score - 10) / 2);

    drawText(ctx, ability.toUpperCase(), { x, y, width: 20, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
    drawText(ctx, String(score), { x: x + 20, y, width: 20, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textPrimary,
    });
    drawText(ctx, (mod >= 0 ? "+" : "") + String(mod), { x: x + 40, y, width: 20, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textPrimary,
    });
  });
}

function renderCompanionACStrip(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  ac: string,
) {
  // AC spans the full height of statsRow + hpStrip combined (230×168)
  const rect = PAGE2_COMPANION_REGIONS.acStrip;
  drawSvg(ctx, assets.ac, rect);

  drawText(ctx, "AC", { x: rect.x + 4, y: rect.y + rect.height / 2 - 20, width: rect.width - 8, height: 14 }, {
    font: "Helvetica-Bold",
    size: 5,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawText(ctx, String(ac), { x: rect.x + 4, y: rect.y + rect.height / 2 - 6, width: rect.width - 8, height: 28 }, {
    font: "Helvetica-Bold",
    size: 26,
    color: COLORS.textPrimary,
    align: "center",
    lineBreak: false,
  });
}

function renderCompanionSpeedsRow(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  speed: string,
  senses: string,
) {
  // Bottom full-width row: Speeds + Passive Perception + Darkvision
  const rect = PAGE2_COMPANION_REGIONS.speedsRow;
  drawSvg(ctx, assets.passivesAndSpeeds || assets.greyBackground, rect);

  const totalW = rect.width;
  const statW = Math.floor(totalW / 4); // 4 equal cells

  // Speed cell (walk only shown, extract first number)
  const speedVal = speed ? speed.match(/\d+/)?.[0] || "30" : "30";
  const speedUnit = speed ? speed.match(/ft\.?/)?.[0] || "ft." : "ft.";
  fillRect(ctx, { x: rect.x + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, "#f1f1f1");
  strokeRect(ctx, { x: rect.x + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, COLORS.border, 0.4);
  drawText(ctx, "SPEED", { x: rect.x + 4, y: rect.y + 5, width: statW - 8, height: 8 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawText(ctx, `${speedVal}`, { x: rect.x + 4, y: rect.y + 14, width: statW - 8, height: 16 }, {
    font: "Helvetica-Bold",
    size: 12,
    color: COLORS.textPrimary,
    align: "center",
    lineBreak: false,
  });
  drawText(ctx, speedUnit, { x: rect.x + 4, y: rect.y + 30, width: statW - 8, height: 8 }, {
    font: "Helvetica",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });

  // Passive Perception cell
  const passive = senses ? senses.match(/passive\s*Perception\s*(\d+)/i)?.[1] || "—" : "—";
  fillRect(ctx, { x: rect.x + statW + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, "#f1f1f1");
  strokeRect(ctx, { x: rect.x + statW + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, COLORS.border, 0.4);
  drawText(ctx, "PASSIVE", { x: rect.x + statW + 4, y: rect.y + 5, width: statW - 8, height: 8 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawCenteredTextInRect(ctx, passive, { x: rect.x + statW, y: rect.y + 14, width: statW, height: 20 }, {
    font: "Helvetica-Bold",
    maxSize: 12,
    minSize: 7,
    color: COLORS.textPrimary,
  });

  // Darkvision cell
  const darkvision = senses ? senses.match(/darkvision\s*(\d+)\s*ft/i)?.[1] || "—" : "—";
  fillRect(ctx, { x: rect.x + statW * 2 + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, "#f1f1f1");
  strokeRect(ctx, { x: rect.x + statW * 2 + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, COLORS.border, 0.4);
  drawText(ctx, "DARKVISION", { x: rect.x + statW * 2 + 4, y: rect.y + 5, width: statW - 8, height: 8 }, {
    font: "Helvetica-Bold",
    size: 4,
    color: COLORS.textSecondary,
    align: "center",
    lineBreak: false,
  });
  drawCenteredTextInRect(ctx, darkvision, { x: rect.x + statW * 2, y: rect.y + 14, width: statW, height: 20 }, {
    font: "Helvetica-Bold",
    maxSize: 12,
    minSize: 7,
    color: COLORS.textPrimary,
  });

  // Empty 4th cell (reserved for future use)
  fillRect(ctx, { x: rect.x + statW * 3 + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, "#f1f1f1");
  strokeRect(ctx, { x: rect.x + statW * 3 + 2, y: rect.y + 2, width: statW - 4, height: rect.height - 4 }, COLORS.border, 0.4);
}

function renderCompanionSavesAndSkills(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  saves: string[],
  skills: string[],
) {
  const rect = PAGE2_COMPANION_REGIONS.savesAndSkills;
  drawSvg(ctx, assets.greyBackground, rect);

  let y = rect.y + 4;
  if (saves.length > 0) {
    drawText(ctx, "SAVES", { x: rect.x + 4, y, width: 60, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
    y += 6;
    saves.forEach((save) => {
      drawText(ctx, save, { x: rect.x + 4, y, width: 120, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textPrimary,
      });
      y += 5;
    });
    y += 4;
  }

  if (skills.length > 0) {
    drawText(ctx, "SKILLS", { x: rect.x + 4, y, width: 60, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
    y += 6;
    skills.forEach((skill) => {
      drawText(ctx, skill, { x: rect.x + 4, y, width: 120, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textPrimary,
      });
      y += 5;
    });
  }
}

function renderCompanionSensesAndLanguages(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  senses: string,
  languages: string,
) {
  const rect = PAGE2_COMPANION_REGIONS.sensesAndLangs;
  drawSvg(ctx, assets.greyBackground, rect);

  let y = rect.y + 4;
  const maxX = rect.x + rect.width - 4;

  if (senses) {
    drawText(ctx, "SENSES", { x: rect.x + 4, y, width: 60, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
    y += 7;
    drawText(ctx, senses, { x: rect.x + 4, y, width: maxX - rect.x - 8, height: 20 }, {
      font: "Helvetica",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textPrimary,
      lineBreak: true,
    });
    y += 14;
  }

  if (languages && languages.trim() !== "—" && languages.trim() !== "") {
    drawText(ctx, "LANGUAGES", { x: rect.x + 4, y, width: 80, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.maxSize,
      color: COLORS.textSecondary,
    });
    y += 7;
    drawText(ctx, languages, { x: rect.x + 4, y, width: maxX - rect.x - 8, height: 12 }, {
      font: "Helvetica",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textPrimary,
      lineBreak: true,
    });
  }
}

function renderCompanionTraitsAndActions(
  ctx: PdfRenderContext,
  _assets: PdfSvgAssetBundle,
  cards: PdfPageCard[],
) {
  const rect = PAGE2_COMPANION_REGIONS.traitsAndActions;
  drawSvg(ctx, _assets.generalContainer, rect);

  let y = rect.y + 4;
  const maxY = rect.y + rect.height - 4;

  cards.forEach((card) => {
    if (y > maxY - 20) return;

    drawText(ctx, card.title, { x: rect.x + 4, y, width: rect.width - 8, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textPrimary,
    });
    y += 6;

    if (card.summary) {
      const summaryLines = card.summary.split("\n").slice(0, 3);
      summaryLines.forEach((line) => {
        if (y > maxY - 5) return;
        const trimmed = line.length > 55 ? line.slice(0, 53) + "…" : line;
        drawText(ctx, trimmed, { x: rect.x + 4, y, width: rect.width - 8, height: 8 }, {
          font: "Helvetica",
          size: TYPOGRAPHY.small.minSize,
          color: COLORS.textSecondary,
        });
        y += 5;
      });
    }

    y += 6;
  });
}

export function renderCompanionPage(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  character: ResolvedPdfCharacter,
) {
  ctx.doc.addPage({ size: [PAGE_SIZE.width, PAGE_SIZE.height], margin: 0 });

  const doc = ctx.doc as unknown as { save: () => void; restore: () => void; translate: (x: number, y: number) => { scale: (s: number) => void } };
  doc.save();
  doc.translate(PAGE2_PRINT_SAFE_OFFSET.x, PAGE2_PRINT_SAFE_OFFSET.y).scale(PAGE2_PRINT_SAFE_SCALE);

  const companionCards = character.companionCards ?? [];
  const firstCompanion = companionCards[0];

  if (!firstCompanion) {
    doc.restore();
    return;
  }

  // Tag conventions on the companion card:
  //   "type:<text>"     creature type
  //   "cr:<n>"          challenge rating
  //   "ac:<n>"          armor class
  //   "hp:<n> [dice]"   hit points
  //   "speed:<text>"    speed, e.g. "40 ft., fly 60 ft."
  //   "str:<n>"         ability score
  //   "save:<ability>"  saving throw proficiency
  //   "skills:a,b,c"    comma-separated skill list
  const tags = firstCompanion.tags ?? [];
  const getTag = (prefix: string) => tags.find((t) => t.startsWith(prefix + ":"))?.replace(prefix + ":", "") ?? "";

  const companionName = firstCompanion.title;
  const companionType = getTag("type") || firstCompanion.sourceLabel || "Companion";
  const cr = getTag("cr") || "—";
  const ac = getTag("ac") || "—";
  const hpRaw = getTag("hp") || "—";
  const speed = getTag("speed") || "30 ft.";

  // HP: strip dice notation, show just the base number
  const hpBase = hpRaw.match(/^(\d+)/)?.[1] ?? hpRaw;

  const abilityScores = {
    str: parseInt(getTag("str")) || 10,
    dex: parseInt(getTag("dex")) || 10,
    con: parseInt(getTag("con")) || 10,
    int: parseInt(getTag("int")) || 10,
    wis: parseInt(getTag("wis")) || 10,
    cha: parseInt(getTag("cha")) || 10,
  };

  const skillsRaw = getTag("skills");
  const skills = skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  // Proficiency bonus: companion uses ranger scaling (PB at level 1 = +2)
  const prof = Math.max(2, Math.floor((character.level - 1) / 4) + 2);
  const dexMod = Math.floor((abilityScores.dex - 10) / 2);

  // Render the 3 columns under the header.
  renderCompanionHeaderNew(ctx, assets, companionName, companionType, cr);
  renderCompanionPortraitNew(ctx);
  renderCompanionAbilityScoresStatBlock(ctx, assets, abilityScores);
  renderCompanionMiddleColumn(ctx, assets, {
    prof,
    init: dexMod,
    hp: hpBase,
    ac,
    speed,
    skills,
  });
  renderCompanionRightColumn(ctx, assets, companionCards);

  doc.restore();
}