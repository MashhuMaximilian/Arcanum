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

// --- Companion page layout (3 columns below header) ---
//
// Page 2 is A4 portrait (595 x 842). The companion page is laid out as:
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │ HEADER (full width, h=60)                                  │
//   │  Name banner (w=200)         │ Creature│Owner│Size│Type│Al  │
//   ├─────────────────────────────────────────────────────────────┤
//   │ LEFT  (x=10,  w=170)  │ MID  (x=185, w=130)  │ RIGHT       │
//   │ ┌────────┐             │ ┌P─┬I─┬CR┐           │ (x=320,     │
//   │ │PICTURE │             │ │  │  │  │           │  w=265,     │
//   │ │        │             │ ├─┴──┴──┤           │  h=752)     │
//   │ └────────┘             │ │ HP │AC│           │ ┌────────┐  │
//   │ ┌─┬─┬─┐ STR/DEX/CON   │ ├─┴───┴──┤           │ │Features│  │
//   │ │S│D│C│ (Stat Block)  │ │ Speed  │           │ │ &Traits│  │
//   │ ├─┼─┼─┤                │ ├────────┤           │ │        │  │
//   │ │I│W│H│ INT/WIS/CHA   │ │ Skills │           │ │        │  │
//   │ └─┴─┴─┘                │ │  ...   │           │ │        │  │
//   │                        │ └────────┘           │ └────────┘  │
//   └─────────────────────────────────────────────────────────────┘
const COMPANION_LAYOUT = {
  // Top header band
  header: { x: 10, y: 10, width: 575, height: 60 },
  nameBanner: { x: 10, y: 10, width: 200, height: 60 },
  fields: { x: 215, y: 10, width: 370, height: 60 },
  // Body top
  bodyTop: 80,
  bodyBottom: 832,
  // Left column (Picture + 6 abilities 3x2 grid)
  left: {
    x: 10,
    width: 170,
    picture: { x: 10, y: 80, width: 170, height: 170 },
    abilities: { x: 10, y: 260, width: 170, height: 270 },
  },
  // Middle column (Prof+Init+CR, HP+AC, Speeds, Skills)
  middle: { x: 185, width: 130 },
  // Right column (single Features box, full body height)
  right: {
    x: 320,
    width: 265,
    features: { x: 320, y: 80, width: 265, height: 752 },
  },
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
// RENDER COMPANION PAGE — clean 3-column layout below header
// ============================================================
//
// The companion page is a single A4 page with a header band and 3 body
// columns (LEFT, MIDDLE, RIGHT). All rects are computed up-front in
// computeCompanionLayout(), then the columns are drawn in order:
// container SVGs first, then text on top. This guarantees no overlap.
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ HEADER  Name banner (w=200)  │ 5 fields (w=370)              │
//   ├──────────┬───────────────────┬──────────────────────────────┤
//   │ LEFT     │ MIDDLE            │ RIGHT                         │
//   │ PICTURE  │ 3× BonusBox       │                               │
//   │ 6× Stat  │ HP + AC           │ FEATURES (full height)        │
//   │ Block    │ 1× Passive        │                               │
//   │ (3x2)    │ General Skills    │                               │
//   └──────────┴───────────────────┴──────────────────────────────┘

/** All bounding boxes for the companion page, computed once. */
type CompanionRects = {
  header: PdfRect;
  nameBanner: PdfRect;
  fields: PdfRect;
  // Field sub-rects (5 small fields inside the fields rect)
  fieldSlots: Array<{ label: string; rect: PdfRect }>;
  // Left column
  picture: PdfRect;
  abilityCells: Array<{ key: string; label: string; rect: PdfRect }>;
  // Middle column
  profInitCr: PdfRect[]; // 3 boxes
  hp: PdfRect;
  ac: PdfRect;
  speed: PdfRect;
  skills: PdfRect;
  // Right column
  features: PdfRect;
};

function computeCompanionLayout(): CompanionRects {
  const { header, nameBanner, fields, left, middle, right } = COMPANION_LAYOUT;

  // Field slots: 5 fields (Creature, Owner, Size, Type, Alignment)
  const fieldLabels = ["Creature", "Owner", "Size", "Type", "Alignment"];
  const fieldGap = 2;
  const slotW = (fields.width - fieldGap * (fieldLabels.length - 1)) / fieldLabels.length;
  const fieldSlots = fieldLabels.map((label, i) => ({
    label,
    rect: { x: fields.x + i * (slotW + fieldGap), y: fields.y, width: slotW, height: fields.height },
  }));

  // Ability cells: 3x2 grid, each cell preserves the SVG's natural aspect
  // ratio (55 × 72 = 0.764) so the stat block shapes don't get squished.
  const gap = 4;
  const cellW = (left.abilities.width - gap * 2) / 3;
  // Natural height for the cell width: 72/55 = 1.31, so cellH = cellW * 1.31
  const cellH = Math.min(110, cellW * (72 / 55));
  // 2 rows × cellH + 1 gap = total grid height. Center the grid vertically
  // inside the abilities area.
  const gridH = 2 * cellH + gap;
  const gridY = left.abilities.y + Math.max(0, (left.abilities.height - gridH) / 2);
  const abilities: Array<{ key: string; label: string }> = [
    { key: "str", label: "STR" },
    { key: "dex", label: "DEX" },
    { key: "con", label: "CON" },
    { key: "int", label: "INT" },
    { key: "wis", label: "WIS" },
    { key: "cha", label: "CHA" },
  ];
  const abilityCells = abilities.map((ab, i) => ({
    ...ab,
    rect: {
      x: left.abilities.x + (i % 3) * (cellW + gap),
      y: gridY + Math.floor(i / 3) * (cellH + gap),
      width: cellW,
      height: cellH,
    },
  }));

  // Middle column: vertical stack of stat boxes
  const m = { x: middle.x, width: middle.width };
  let y = COMPANION_LAYOUT.bodyTop;
  const boxH = 38;
  const profInitCrH = 40;
  // Row 1: 3 bonus boxes (Prof / Init / CR)
  const bonusW = (m.width - gap * 2) / 3;
  const profInitCr = [
    { x: m.x, y, width: bonusW, height: profInitCrH },
    { x: m.x + bonusW + gap, y, width: bonusW, height: profInitCrH },
    { x: m.x + 2 * (bonusW + gap), y, width: bonusW, height: profInitCrH },
  ];
  y += profInitCrH + gap;
  // Row 2: HP + AC (HP is wide, AC is narrow)
  const hpW = Math.floor(m.width * 0.62);
  const acW = m.width - hpW - gap;
  const hpRect: PdfRect = { x: m.x, y, width: hpW, height: boxH };
  const acRect: PdfRect = { x: m.x + hpW + gap, y, width: acW, height: boxH };
  y += boxH + gap;
  // Row 3: Speeds (a small passive box, full middle-column width as a labelled row)
  const speedRect: PdfRect = { x: m.x, y, width: m.width, height: boxH };
  y += boxH + gap;
  // Row 4: Skills (takes the rest of the column)
  const skillsHeight = COMPANION_LAYOUT.bodyBottom - y - 4;
  const skillsRect: PdfRect = { x: m.x, y, width: m.width, height: skillsHeight };

  return {
    header,
    nameBanner,
    fields,
    fieldSlots,
    picture: left.picture,
    abilityCells,
    profInitCr,
    hp: hpRect,
    ac: acRect,
    speed: speedRect,
    skills: skillsRect,
    features: right.features,
  };
}

/** Renders the full-width header band. */
function renderCompanionHeader(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  data: { name: string; fields: Record<string, string> },
) {
  // Outer header frame (use the front-page header shell as the bordered background)
  drawSvg(ctx, assets.frontPageHeaderShell, rects.header);

  // Name banner (left part of the header)
  const nb = rects.nameBanner;
  drawText(ctx, data.name.toUpperCase(), { x: nb.x + 6, y: nb.y + 6, width: nb.width - 12, height: 22 }, {
    font: "Times-Bold",
    size: 18,
    color: COLORS.textPrimary,
  });
  // Subtitle: the type line
  const sub = (data.fields.Type ? `${data.fields.Type} · ` : "") + (data.fields.Alignment || "Companion");
  drawText(ctx, sub, { x: nb.x + 6, y: nb.y + 30, width: nb.width - 12, height: 14 }, {
    font: "Times-Italic",
    size: 10,
    color: COLORS.textSecondary,
  });
  // CR small label (top-right of the banner)
  drawText(ctx, `CR ${data.fields["Challenge Rating"] || "—"}`, { x: nb.x + 6, y: nb.y + 44, width: nb.width - 12, height: 12 }, {
    font: "Helvetica-Bold",
    size: 8,
    color: COLORS.textSecondary,
  });

  // 5 small fields on the right
  for (const slot of rects.fieldSlots) {
    // Label at top
    drawText(ctx, slot.label.toUpperCase(), { x: slot.rect.x + 2, y: slot.rect.y + 4, width: slot.rect.width - 4, height: 10 }, {
      font: "Helvetica-Bold",
      size: 6,
      color: COLORS.textSecondary,
    });
    // Value below
    const value = data.fields[slot.label] || "—";
    drawCenteredTextInRect(ctx, value, { x: slot.rect.x, y: slot.rect.y + 16, width: slot.rect.width, height: slot.rect.height - 18 }, {
      font: "Helvetica",
      maxSize: 10,
      minSize: 6,
      color: COLORS.textPrimary,
    });
  }
}

/** Renders the LEFT column: PICTURE placeholder + 6 ability scores in 3x2 grid. */
function renderCompanionLeftColumn(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  scores: Record<string, number>,
) {
  // Picture frame (custom rectangle — no SVG per the spec)
  const pic = rects.picture;
  const docAny = ctx.doc as unknown as {
    rect: (x: number, y: number, w: number, h: number) => { stroke: (c: string, w: number) => void };
  };
  docAny.rect(pic.x, pic.y, pic.width, pic.height).stroke("#666666", 0.8);
  drawText(ctx, "[ Picture ]", { x: pic.x, y: pic.y + pic.height / 2 - 6, width: pic.width, height: 12 }, {
    font: "Helvetica-Oblique",
    size: 9,
    color: COLORS.textTertiary,
    align: "center",
  });

  // 6 ability score cells (each uses _Stat Block.svg, preserved aspect)
  for (const cell of rects.abilityCells) {
    // Letterbox the SVG inside the cell so the natural aspect is preserved.
    drawSvg(ctx, assets.statBlock, cell.rect, "contain");

    const score = scores[cell.key] ?? 10;
    const mod = Math.floor((score - 10) / 2);
    const modStr = formatModifier(mod);

    // Label (top of the cell)
    drawCenteredTextInRect(ctx, cell.label, { x: cell.rect.x, y: cell.rect.y + 4, width: cell.rect.width, height: 8 }, {
      font: "Helvetica-Bold",
      maxSize: 6.5,
      minSize: 4,
      color: COLORS.textSecondary,
    });
    // Score (big bold, centered in the cell)
    drawCenteredTextInRect(ctx, String(score), { x: cell.rect.x, y: cell.rect.y + cell.rect.height * 0.20, width: cell.rect.width, height: cell.rect.height * 0.55 }, {
      font: "Times-Bold",
      maxSize: 18,
      minSize: 10,
      color: COLORS.textPrimary,
    });
    // Modifier (small, below the score)
    drawCenteredTextInRect(ctx, modStr, { x: cell.rect.x, y: cell.rect.y + cell.rect.height * 0.78, width: cell.rect.width, height: cell.rect.height * 0.18 }, {
      font: "Times-Roman",
      maxSize: 8,
      minSize: 5,
      color: COLORS.textSecondary,
    });
  }
}

/** Renders the MIDDLE column: Prof/Init/CR, HP/AC, Speeds, Skills. */
function renderCompanionMiddleColumn(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  data: {
    prof: number;
    init: number;
    cr: string;
    maxHp: string;
    ac: string;
    speed: string;
    skills: string[];
  },
) {
  // Row 1: 3 bonus boxes (Prof / Init / CR)
  const labels1 = ["PROFICIENCY", "INITIATIVE", "CHALLENGE"];
  const values1 = [`+${data.prof}`, formatModifier(data.init), data.cr];
  rects.profInitCr.forEach((rect, i) => {
    drawLabeledStatBox(ctx, assets, rect, "bonusBox", labels1[i], values1[i]);
  });

  // Row 2: HP (wide) + AC (narrow)
  drawLabeledStatBox(ctx, assets, rects.hp, "hp", "HIT POINTS", data.maxHp, { valueSize: 18 });
  drawLabeledStatBox(ctx, assets, rects.ac, "ac", "ARMOR CLASS", data.ac, { valueSize: 18 });

  // Row 3: Speeds (small passive box, full middle-column width as a labelled row)
  drawLabeledStatBox(ctx, assets, rects.speed, "passiveBox", "SPEED", data.speed, { valueSize: 10, labelSize: 6 });

  // Row 4: Skills (general box)
  drawSvg(ctx, assets.generalContainer, rects.skills);
  drawText(ctx, "SKILLS", { x: rects.skills.x + 4, y: rects.skills.y + 2, width: rects.skills.width - 8, height: 9 }, {
    font: "Helvetica-Bold",
    size: 6.5,
    color: COLORS.textSecondary,
  });

  let sy = rects.skills.y + 14;
  if (data.skills.length === 0) {
    drawText(ctx, "—", { x: rects.skills.x + 4, y: sy, width: rects.skills.width - 8, height: 8 }, {
      font: "Times-Italic",
      size: 7,
      color: COLORS.textTertiary,
    });
    return;
  }
  // 1-column skill list (the middle column is too narrow for 2 columns)
  for (const skill of data.skills) {
    if (sy + 9 > rects.skills.y + rects.skills.height - 2) break;
    drawText(ctx, skill, { x: rects.skills.x + 4, y: sy, width: rects.skills.width - 8, height: 8 }, {
      font: "Helvetica",
      size: 6.5,
      color: COLORS.textPrimary,
    });
    sy += 9;
  }
}

/** Renders the RIGHT column: a single Features & Traits box. */
function renderCompanionRightColumn(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rects: CompanionRects,
  cards: PdfPageCard[],
) {
  const r = rects.features;
  drawSvg(ctx, assets.generalContainer, r);
  drawText(ctx, "FEATURES & TRAITS", { x: r.x + 6, y: r.y + 4, width: r.width - 12, height: 12 }, {
    font: "Times-Bold",
    size: 11,
    color: COLORS.textPrimary,
  });

  // Underline
  const docAny = ctx.doc as unknown as { moveTo: (x: number, y: number) => { lineTo: (x: number, y: number) => { stroke: (c: string, w: number) => void } } };
  docAny.moveTo(r.x + 6, r.y + 18).lineTo(r.x + r.width - 6, r.y + 18).stroke("#666666", 0.5);

  let y = r.y + 22;
  const maxY = r.y + r.height - 4;
  const innerW = r.width - 12;
  const bodySize = 7.5;

  if (cards.length === 0) {
    drawText(ctx, "—", { x: r.x + 6, y, width: innerW, height: 10 }, {
      font: "Times-Italic",
      size: 8,
      color: COLORS.textTertiary,
    });
    return;
  }

  for (const card of cards) {
    if (y + 14 > maxY) break;
    // Title
    drawText(ctx, card.title, { x: r.x + 6, y, width: innerW, height: 10 }, {
      font: "Times-Bold",
      size: 8,
      color: COLORS.textPrimary,
    });
    y += 10;
    if (card.summary) {
      const maxCharsPerLine = Math.floor(innerW / (bodySize * 0.55));
      const lines = card.summary.split("\n").flatMap((line) => wrapText(line, maxCharsPerLine));
      for (const line of lines) {
        if (y + bodySize + 1 > maxY) break;
        drawText(ctx, line, { x: r.x + 8, y, width: innerW - 4, height: bodySize + 1 }, {
          font: "Times-Roman",
          size: bodySize,
          color: COLORS.textPrimary,
        });
        y += bodySize + 1;
      }
    }
    y += 4;
  }
}

/** Draws a labeled stat box: an SVG frame with a small label on top and a
 *  large value below, both centered. */
function drawLabeledStatBox(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  rect: PdfRect,
  bg: "bonusBox" | "hp" | "ac" | "passiveBox" | "generalContainer",
  label: string,
  value: string,
  options?: { labelSize?: number; valueSize?: number },
) {
  drawSvg(ctx, assets[bg], rect);

  // Top strip: small caption label
  const labelHeight = Math.max(8, Math.floor(rect.height * 0.30));
  drawCenteredTextInRect(ctx, label, { x: rect.x, y: rect.y + 1, width: rect.width, height: labelHeight - 1 }, {
    font: "Helvetica-Bold",
    maxSize: options?.labelSize ?? 6,
    minSize: 4,
    color: COLORS.textSecondary,
  });

  // Bottom: large value
  drawCenteredTextInRect(ctx, value, { x: rect.x, y: rect.y + labelHeight, width: rect.width, height: rect.height - labelHeight - 1 }, {
    font: "Times-Bold",
    maxSize: options?.valueSize ?? 14,
    minSize: 6,
    color: COLORS.textPrimary,
  });
}

/** Wraps a single line of text to `width` characters per line. */
function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + " " + w).length <= width) {
      current += " " + w;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Formats a numeric modifier with an explicit sign (e.g. +2, 0, -1). */
function formatModifier(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return String(n);
  return "0";
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

  // Compute all rects up-front. This guarantees no overlap and makes the
  // layout self-documenting.
  const rects = computeCompanionLayout();

  // Tag conventions on the companion card:
  //   "type:<text>"      creature type (e.g. "beast", "dragon")
  //   "size:<text>"      size (e.g. "Medium", "Large")
  //   "cr:<n>"           challenge rating
  //   "ac:<n>"           armor class
  //   "hp:<n> [dice]"    hit points
  //   "speed:<text>"     speed, e.g. "40 ft., fly 60 ft."
  //   "alignment:<text>" alignment, e.g. "neutral"
  //   "senses:<list>"    senses
  //   "languages:<list>" languages
  //   "skills:<list>"    comma-separated skill list
  //   "str:<n>" .. "cha:<n>" ability scores
  const tags = firstCompanion.tags ?? [];
  const getTag = (prefix: string) => tags.find((t) => t.startsWith(prefix + ":"))?.replace(prefix + ":", "") ?? "";

  const companionName = firstCompanion.title || "Companion";
  const cr = getTag("cr") || "—";
  const ac = getTag("ac") || "—";
  const hpRaw = getTag("hp") || "—";
  const speed = getTag("speed") || "30 ft.";
  const hpBase = hpRaw.match(/^(\d+)/)?.[1] ?? hpRaw;

  const abilityScores = {
    str: parseInt(getTag("str")) || 10,
    dex: parseInt(getTag("dex")) || 10,
    con: parseInt(getTag("con")) || 10,
    int: parseInt(getTag("int")) || 10,
    wis: parseInt(getTag("wis")) || 10,
    cha: parseInt(getTag("cha")) || 10,
  };

  // Proficiency bonus: companion uses ranger scaling (PB at level 1 = +2)
  const prof = Math.max(2, Math.floor((character.level - 1) / 4) + 2);
  const dexMod = Math.floor((abilityScores.dex - 10) / 2);

  // Header fields: Creature, Owner, Size, Type, Alignment. Challenge Rating
  // is shown in the name banner (it has its own little slot at the bottom).
  //   Creature  = the creature's species/name (e.g. "Wolf")
  //   Type      = the D&D creature type (e.g. "beast")
  const ownerName = character.name || "Player";
  const creatureKind = companionName; // the root card's title is the species
  const senses = getTag("senses");
  const languages = getTag("languages");
  const skillsRaw = getTag("skills");
  const skills = [
    ...(skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : []),
    ...(senses ? [`Senses ${senses}`] : []),
    ...(languages && languages !== "—" ? [`Languages ${languages}`] : []),
  ];

  // Draw the header band
  renderCompanionHeader(ctx, assets, rects, {
    name: companionName,
    fields: {
      Creature: creatureKind,
      Owner: ownerName,
      Size: getTag("size") || "—",
      Type: getTag("type") || "—",
      Alignment: getTag("alignment") || "—",
      "Challenge Rating": cr,
    },
  });

  // Draw the 3 body columns
  renderCompanionLeftColumn(ctx, assets, rects, abilityScores);
  renderCompanionMiddleColumn(ctx, assets, rects, {
    prof,
    init: dexMod,
    cr,
    maxHp: hpBase,
    ac,
    speed,
    skills,
  });
  // Features box: skip the first card (the root creature card) — its data
  // is shown in the header.
  renderCompanionRightColumn(ctx, assets, rects, companionCards.slice(1));

  doc.restore();
}