import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { PdfPageCard, PdfPagePlan, ResolvedPdfCharacter } from "@/lib/pdf/types";
import {
  drawFittedText,
  drawSvg,
  drawText,
  insetRect,
  type PdfRect,
  type PdfRenderContext,
  splitColumns,
} from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

const PAGE_MARGIN = 20;
const HEADER_BOTTOM = 64;
const FOOTER_MARGIN = 24;

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

function renderPageHeader(ctx: PdfRenderContext, title: string, page: PdfPagePlan, character: ResolvedPdfCharacter) {
  drawText(ctx, cleanText(character.name, "Unnamed character"), { x: PAGE_MARGIN, y: 22, width: 320, height: 18 }, {
    font: "Times-Bold",
    size: 23,
    color: "#2a1c15",
  });
  drawText(ctx, title, { x: PAGE_MARGIN, y: 43, width: 260, height: 10 }, {
    size: 8.5,
    color: "#7b6a5f",
  });
  const pageMetaX = PAGE_SIZE.width - PAGE_MARGIN - 110;
  drawText(ctx, `Page ${page.number}`, { x: pageMetaX, y: 21, width: 110, height: 12 }, {
    font: "Helvetica-Bold",
    size: 12,
    align: "right",
  });
  drawText(ctx, cleanText(page.kind.toUpperCase()), { x: pageMetaX, y: 36, width: 110, height: 8 }, {
    size: 7.2,
    align: "right",
    color: "#7f7167",
  });
  ctx.doc.moveTo(PAGE_MARGIN, 60).lineTo(PAGE_SIZE.width - PAGE_MARGIN, 60).strokeColor("#d7b596").lineWidth(0.9).stroke();
}

function cardHeight(card: PdfPageCard) {
  const body = cleanText(card.summary || card.detail);
  return Math.max(72, Math.min(118, 52 + Math.ceil(body.length / 120) * 16));
}

function renderCard(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, card: PdfPageCard, rect: PdfRect) {
  drawSvg(ctx, assets.generalContainer, rect);
  const inner = insetRect(rect, 9, 8);
  const source = cleanText(card.sourceLabel);
  drawFittedText(ctx, cleanText(card.title, "Card"), { x: inner.x, y: inner.y, width: inner.width - 70, height: 12 }, {
    font: "Helvetica-Bold",
    maxSize: 8.6,
    minSize: 6,
    color: "#2a1c15",
  });
  if (source) {
    drawFittedText(ctx, source, { x: inner.x + inner.width - 76, y: inner.y + 1, width: 76, height: 8 }, {
      maxSize: 5.2,
      minSize: 4,
      align: "right",
      color: "#6f625a",
    });
  }
  drawFittedText(ctx, cleanText(card.summary || card.detail), { x: inner.x, y: inner.y + 16, width: inner.width, height: inner.height - 18 }, {
    maxSize: 6.8,
    minSize: 4.8,
    color: "#111111",
  });
}

type FlowState = {
  page: PdfPagePlan;
  cursorY: number;
};

function addFlowPage(ctx: PdfRenderContext, state: FlowState, character: ResolvedPdfCharacter) {
  ctx.doc.addPage({ size: [PAGE_SIZE.width, PAGE_SIZE.height], margin: 0 });
  renderPageHeader(ctx, state.page.title, state.page, character);
  state.cursorY = HEADER_BOTTOM + 10;
}

function ensureSpace(ctx: PdfRenderContext, state: FlowState, character: ResolvedPdfCharacter, needed: number) {
  if (state.cursorY + needed <= PAGE_SIZE.height - FOOTER_MARGIN) {
    return;
  }
  addFlowPage(ctx, state, character);
}

export function renderStandardPage(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, page: PdfPagePlan) {
  const state: FlowState = { page, cursorY: HEADER_BOTTOM + 10 };
  addFlowPage(ctx, state, character);

  page.sections.forEach((section) => {
    ensureSpace(ctx, state, character, 34);
    drawText(ctx, cleanText(section.title), { x: PAGE_MARGIN, y: state.cursorY, width: 350, height: 12 }, {
      font: "Helvetica-Bold",
      size: 12,
      color: "#5f3624",
    });
    if (section.description) {
      drawText(ctx, cleanText(section.description), { x: PAGE_MARGIN, y: state.cursorY + 13, width: 430, height: 9 }, {
        size: 6.8,
        color: "#7c6b5e",
      });
    }
    state.cursorY += 28;

    const columnCount = 3;
    const columns = splitColumns({ x: PAGE_MARGIN, y: state.cursorY, width: PAGE_SIZE.width - PAGE_MARGIN * 2, height: 1 }, columnCount, 8);
    for (let index = 0; index < section.cards.length; index += columnCount) {
      const rowCards = section.cards.slice(index, index + columnCount);
      const rowHeight = Math.max(...rowCards.map(cardHeight));
      ensureSpace(ctx, state, character, rowHeight + 10);
      rowCards.forEach((card, columnIndex) => {
        renderCard(ctx, assets, card, {
          x: columns[columnIndex].x,
          y: state.cursorY,
          width: columns[columnIndex].width,
          height: rowHeight,
        });
      });
      state.cursorY += rowHeight + 8;
    }

    state.cursorY += 8;
  });

  if (page.notes.length) {
    ensureSpace(ctx, state, character, 26);
    page.notes.slice(0, 3).forEach((note, index) => {
      drawText(ctx, cleanText(note), { x: PAGE_MARGIN, y: state.cursorY + index * 8, width: PAGE_SIZE.width - PAGE_MARGIN * 2, height: 7 }, {
        size: 6.4,
        color: "#7d6d61",
      });
    });
  }
}
