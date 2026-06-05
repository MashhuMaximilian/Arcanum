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

// ============================================================
// RENDER INVENTORY PAGE
// ============================================================

function renderInventoryHeader(ctx: PdfRenderContext, _assets: PdfSvgAssetBundle) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryHeader;
  drawSvg(ctx, _assets.generalContainer, rect);
  drawSectionTitle(ctx, "INVENTORY", rect);
}

function renderInventoryIndex(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  items: CharacterInventoryItem[],
) {
  const rect = PAGE2_INVENTORY_REGIONS.inventoryIndex;
  drawSvg(ctx, assets.generalContainer, rect);

  drawText(ctx, "EQUIPPED", { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  const colX = [rect.x + 4, rect.x + 20, rect.x + 140, rect.x + 168];
  const headerY = rect.y + 12;

  const headers = ["#", "Name", "Qty", "lb"];
  headers.forEach((h, i) => {
    drawText(ctx, h, { x: colX[i], y: headerY, width: 30, height: 10 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textSecondary,
    });
  });

  const sepDoc = ctx.doc as { moveTo: (x: number, y: number) => { lineTo: (x: number, y: number) => { stroke: () => void } } };
  sepDoc.moveTo(rect.x + 2, headerY + 3).lineTo(rect.x + rect.width - 2, headerY + 3).stroke();

  const rowStartY = headerY + 6;
  const maxRows = Math.floor((rect.height - (rowStartY - rect.y) - 6) / (LINE_HEIGHT + LINE_ROW_GAP));
  const visibleItems = items.slice(0, maxRows);
  const hasMore = items.length > maxRows;

  visibleItems.forEach((item, index) => {
    const rowY = rowStartY + index * (LINE_HEIGHT + LINE_ROW_GAP);

    const lineRect: PdfRect = { x: rect.x + 2, y: rowY, width: rect.width - 4, height: LINE_HEIGHT };
    drawSvg(ctx, assets.line, lineRect);

    const truncatedName = item.name.length > 22 ? item.name.slice(0, 20) + "…" : item.name;
    const rowData = [
      String(index + 1),
      truncatedName,
      String(item.quantity),
      item.weight ?? "—",
    ];

    rowData.forEach((text, i) => {
      drawText(ctx, text, { x: colX[i], y: rowY + 1, width: i === 1 ? 110 : 30, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.body.maxSize,
        color: COLORS.textPrimary,
      });
    });
  });

  if (hasMore) {
    const lastY = rowStartY + maxRows * (LINE_HEIGHT + LINE_ROW_GAP);
    const moreCount = items.length - maxRows;
    drawText(ctx, `…${moreCount} more`, { x: rect.x + 4, y: lastY + 1, width: rect.width - 8, height: 8 }, {
      font: "Helvetica-Oblique",
      size: TYPOGRAPHY.small.minSize,
      color: COLORS.textTertiary,
    });
  }
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
      "No items requiring description.",
      { x: rect.x + 4, y: rect.y + 16, width: rect.width - 8, height: 30 },
      { font: "Helvetica-Oblique", size: TYPOGRAPHY.small.maxSize, color: COLORS.textTertiary },
    );
    return;
  }

  const contentStartY = rect.y + 16;
  let currentY = contentStartY;

  magicItems.forEach((item) => {
    if (currentY + 22 > rect.y + rect.height - 4) return;

    drawText(ctx, item.name, { x: rect.x + 4, y: currentY, width: rect.width - 8, height: 8 }, {
      font: "Helvetica-Bold",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textPrimary,
    });
    currentY += 7;

    if (item.rarity) {
      drawText(ctx, item.rarity, { x: rect.x + 4, y: currentY, width: 100, height: 8 }, {
        font: "Helvetica-Oblique",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textSecondary,
      });
      currentY += 6;
    }

    if (item.sourceLabel) {
      drawText(ctx, item.sourceLabel, { x: rect.x + 4, y: currentY, width: 100, height: 8 }, {
        font: "Helvetica",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textTertiary,
      });
      currentY += 6;
    }

    if (item.detailHtml) {
      const cleanDesc = cleanHtmlText(item.detailHtml);
      const descLines = cleanDesc.split("\n").slice(0, 3);
      descLines.forEach((line) => {
        if (currentY + 6 > rect.y + rect.height - 4) return;
        const maxChars = Math.floor((rect.width - 8) / (TYPOGRAPHY.small.minSize * 0.6));
        const trimmed = line.length > maxChars ? line.slice(0, maxChars - 1) + "…" : line;
        drawText(ctx, trimmed, { x: rect.x + 4, y: currentY, width: rect.width - 8, height: 8 }, {
          font: "Helvetica",
          size: TYPOGRAPHY.small.minSize,
          color: COLORS.textSecondary,
        });
        currentY += 6;
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
  drawSvg(ctx, assets.generalContainer, rect);

  drawText(ctx, "ATTUNED", { x: rect.x + 4, y: rect.y + 4, width: 80, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  const passiveRect: PdfRect = { x: rect.x + 4, y: rect.y + 14, width: 50, height: 28 };
  drawSvg(ctx, assets.passiveBox, passiveRect);
  drawCenteredTextInRect(ctx, `${attunedCount}/${maxAttuned}`, passiveRect, {
    font: "Helvetica-Bold",
    maxSize: TYPOGRAPHY.body.maxSize,
    minSize: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  const midDoc = ctx.doc as { moveTo: (x: number, y: number) => { lineTo: (x: number, y: number) => { stroke: () => void } } };
  midDoc.moveTo(rect.x + rect.width / 2, rect.y + 4).lineTo(rect.x + rect.width / 2, rect.y + rect.height - 4).stroke();

  const midX = rect.x + rect.width / 2;
  drawText(ctx, "VALUABLES", { x: midX + 4, y: rect.y + 4, width: 100, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });

  if (valuables.length > 0) {
    const valText = valuables.slice(0, 3).join(", ");
    const maxChars = Math.floor((rect.width / 2 - 8) / (TYPOGRAPHY.body.maxSize * 0.5));
    const displayText = valText.length > maxChars ? valText.slice(0, maxChars - 2) + "…" : valText;
    drawText(ctx, displayText, { x: midX + 4, y: rect.y + 16, width: rect.width / 2 - 8, height: 30 }, {
      font: "Helvetica",
      size: TYPOGRAPHY.body.maxSize,
      color: COLORS.textSecondary,
    });
  } else {
    drawText(ctx, "—", { x: midX + 4, y: rect.y + 16, width: 30, height: 14 }, {
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
  drawSvg(ctx, assets.generalContainer, rect);

  drawSectionTitle(ctx, "CURRENCY", rect);

  const availableWidth = rect.width - 2 * CURRENCY_ROW_PADDING;
  const totalBonusBoxesWidth = 5 * BONUS_BOX_WIDTH + 4 * BONUS_BOX_GAP;
  const startOffset = Math.max(0, (availableWidth - totalBonusBoxesWidth) / 2);

  CURRENCY_TYPES.forEach((type, index) => {
    const x = rect.x + CURRENCY_ROW_PADDING + startOffset + index * (BONUS_BOX_WIDTH + BONUS_BOX_GAP);
    const y = rect.y + 16;

    const boxRect: PdfRect = { x, y, width: BONUS_BOX_WIDTH, height: BONUS_BOX_HEIGHT };
    drawSvg(ctx, assets.proficiencyBox1, boxRect);

    const value = currency[type];

    drawCenteredTextInRect(ctx, CURRENCY_LABELS[type], { ...boxRect, y: boxRect.y + 2, height: 12 }, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.small.minSize,
      minSize: 3,
      color: COLORS.textSecondary,
    });

    drawCenteredTextInRect(ctx, String(value), { ...boxRect, y: boxRect.y + 14, height: boxRect.height - 16 }, {
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

  drawSectionTitle(ctx, "ENCUMBRANCE", rect);

  const labelY = rect.y + 14;
  const valueY = rect.y + 26;

  drawText(ctx, "Carried:", { x: rect.x + 6, y: labelY, width: 50, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textPrimary,
  });
  drawText(ctx, `${carriedWeight} lb`, { x: rect.x + 50, y: labelY, width: 60, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textPrimary,
  });

  drawText(ctx, "Capacity:", { x: rect.x + 120, y: labelY, width: 55, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textSecondary,
  });
  drawText(ctx, `${capacity} lb`, { x: rect.x + 170, y: labelY, width: 60, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
  });

  const pushDragLift = capacity * 2;
  drawText(ctx, "Push/Drag/Lift:", { x: rect.x + 240, y: labelY, width: 90, height: 10 }, {
    font: "Helvetica-Bold",
    size: TYPOGRAPHY.small.maxSize,
    color: COLORS.textSecondary,
  });
  drawText(ctx, `${pushDragLift} lb`, { x: rect.x + 325, y: labelY, width: 60, height: 10 }, {
    font: "Helvetica",
    size: TYPOGRAPHY.body.maxSize,
    color: COLORS.textSecondary,
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
    drawSvg(ctx, assets.generalContainer, rect);

    const header = `STORED ITEMS #${colIndex + 1}`;
    drawCenteredTextInRect(ctx, header, { x: rect.x, y: rect.y + 2, width: rect.width, height: 10 }, {
      font: "Helvetica-Bold",
      maxSize: TYPOGRAPHY.small.maxSize,
      minSize: 5,
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
      const maxNameChars = Math.floor((rect.width - 44) / (TYPOGRAPHY.body.maxSize * 0.5));
      const displayName = itemLabel.length > maxNameChars ? itemLabel.slice(0, maxNameChars - 1) + "…" : itemLabel;
      drawText(ctx, displayName, { x: rect.x + 4, y: lineY + 1, width: rect.width - 40, height: 8 }, {
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

    const totalItems = items.length;
    if (totalItems > 16) {
      const moreCount = totalItems - 16;
      const lastLineY = contentStartY + 8 * lineGap;
      drawText(ctx, `…${moreCount} more`, { x: rect.x + 4, y: lastLineY + 1, width: rect.width - 8, height: 8 }, {
        font: "Helvetica-Oblique",
        size: TYPOGRAPHY.small.minSize,
        color: COLORS.textTertiary,
      });
    }
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
  renderInventoryIndex(ctx, assets, data.equipment);
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
        size: 5.5,
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
