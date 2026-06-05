import type PDFDocument from "pdfkit";
import type SVGtoPDF from "svg-to-pdfkit";

export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTextOptions = {
  font?: string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineGap?: number;
  lineBreak?: boolean;
  ellipsis?: boolean;
};

type PdfShapeDocument = PDFDocument & {
  circle: (x: number, y: number, radius: number) => PdfShapeDocument;
  rect: (x: number, y: number, width: number, height: number) => PdfShapeDocument;
  fill: (color?: string) => PdfShapeDocument;
  fillColor: (color: string) => PdfShapeDocument;
  lineWidth: (width: number) => PdfShapeDocument;
  stroke: (color?: string) => PdfShapeDocument;
  strokeColor: (color: string) => PdfShapeDocument;
};

export type PdfRenderContext = {
  doc: PDFDocument;
  svgToPdf: typeof SVGtoPDF;
  bodyFont: string;
};

export function insetRect(rect: PdfRect, inset: number): PdfRect;
export function insetRect(rect: PdfRect, xInset: number, yInset: number): PdfRect;
export function insetRect(rect: PdfRect, xInset: number, yInset = xInset): PdfRect {
  return {
    x: rect.x + xInset,
    y: rect.y + yInset,
    width: Math.max(0, rect.width - xInset * 2),
    height: Math.max(0, rect.height - yInset * 2),
  };
}

export function splitColumns(rect: PdfRect, count: number, gap = 0) {
  const width = (rect.width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: rect.x + index * (width + gap),
    y: rect.y,
    width,
    height: rect.height,
  }));
}

export function splitRows(rect: PdfRect, count: number, gap = 0) {
  const height = (rect.height - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: rect.x,
    y: rect.y + index * (height + gap),
    width: rect.width,
    height,
  }));
}

export function drawSvg(
  ctx: PdfRenderContext,
  svg: string | undefined,
  rect: PdfRect,
  fit: "stretch" | "contain" = "stretch",
) {
  if (!svg) {
    return;
  }

  ctx.svgToPdf(ctx.doc, svg, rect.x, rect.y, {
    width: rect.width,
    height: rect.height,
    preserveAspectRatio: fit === "stretch" ? "none" : "xMidYMid meet",
    assumePt: true,
  });
}

function resolveFont(ctx: PdfRenderContext, font?: string) {
  return font || ctx.bodyFont;
}

export function fitTextSize(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: PdfTextOptions & { maxSize: number; minSize: number },
) {
  for (let size = options.maxSize; size >= options.minSize; size -= 0.25) {
    ctx.doc.save();
    ctx.doc.font(resolveFont(ctx, options.font));
    ctx.doc.fontSize(size);
    const lineBreak = options.lineBreak ?? true;
    const measuredHeight = ctx.doc.heightOfString(text, {
      width: rect.width,
      height: rect.height,
      align: options.align || "left",
      lineBreak,
      ellipsis: options.ellipsis ?? true,
      lineGap: options.lineGap ?? size * 0.12,
    });
    const measuredWidth = lineBreak ? 0 : ctx.doc.widthOfString(text);
    ctx.doc.restore();

    if (measuredHeight <= rect.height && (lineBreak || measuredWidth <= rect.width)) {
      return size;
    }
  }

  return options.minSize;
}

export function drawText(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: PdfTextOptions = {},
) {
  const size = options.size || 8;
  ctx.doc.font(resolveFont(ctx, options.font));
  ctx.doc.fontSize(size);
  ctx.doc.fillColor(options.color || "#111111");
  ctx.doc.text(text, rect.x, rect.y, {
    width: rect.width,
    height: rect.height,
    align: options.align || "left",
    lineBreak: options.lineBreak ?? true,
    ellipsis: options.ellipsis ?? true,
    lineGap: options.lineGap ?? size * 0.12,
  });
}

export function drawFittedText(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: PdfTextOptions & { maxSize: number; minSize: number },
) {
  drawText(ctx, text, rect, {
    ...options,
    size: fitTextSize(ctx, text, rect, options),
  });
}

export function drawCenteredTextInRect(
  ctx: PdfRenderContext,
  text: string,
  rect: PdfRect,
  options: PdfTextOptions & { maxSize: number; minSize: number },
) {
  if (!text.trim()) {
    return;
  }

  const size = fitTextSize(ctx, text, rect, {
    ...options,
    align: options.align || "center",
  });
  ctx.doc.save();
  ctx.doc.font(resolveFont(ctx, options.font));
  ctx.doc.fontSize(size);
  const lineGap = options.lineGap ?? size * 0.08;
  const measuredHeight = ctx.doc.heightOfString(text, {
    width: rect.width,
    align: options.align || "center",
    lineBreak: true,
    ellipsis: options.ellipsis ?? true,
    lineGap,
  });
  ctx.doc.restore();

  const y = rect.y + Math.max(0, (rect.height - measuredHeight) / 2);
  drawText(ctx, text, { ...rect, y }, {
    ...options,
    size,
    align: options.align || "center",
    lineGap,
  });
}

/**
 * Map a slot defined in SVG `viewBox` coordinates into a rect on the actual
 * page. Use this together with SVG viewBox constants to position masks,
 * labels, and values exactly where the SVG's own text bands sit —
 * independent of how the component is resized on the page.
 */
export function componentRect(
  region: PdfRect,
  viewBox: { width: number; height: number },
  rect: PdfRect,
): PdfRect {
  const scaleX = region.width / viewBox.width;
  const scaleY = region.height / viewBox.height;
  return {
    x: region.x + rect.x * scaleX,
    y: region.y + rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

export function componentPoint(
  region: PdfRect,
  viewBox: { width: number; height: number },
  point: { x: number; y: number },
) {
  return {
    x: region.x + point.x * (region.width / viewBox.width),
    y: region.y + point.y * (region.height / viewBox.height),
  };
}

export function componentRadius(
  region: PdfRect,
  viewBox: { width: number; height: number },
  radius: number,
) {
  return radius * Math.min(region.width / viewBox.width, region.height / viewBox.height);
}

export function maskRect(ctx: PdfRenderContext, rect: PdfRect, color = "#ffffff") {
  const shapeDoc = ctx.doc as PdfShapeDocument;
  ctx.doc.save();
  shapeDoc.rect(rect.x, rect.y, rect.width, rect.height).fill(color);
  ctx.doc.restore();
}

export function fillCircle(ctx: PdfRenderContext, centerX: number, centerY: number, radius: number, color = "#111111") {
  const shapeDoc = ctx.doc as PdfShapeDocument;
  ctx.doc.save();
  shapeDoc.circle(centerX, centerY, radius).fillColor(color).fill();
  ctx.doc.restore();
}

export function strokeCircle(ctx: PdfRenderContext, centerX: number, centerY: number, radius: number, color = "#111111", width = 0.35) {
  const shapeDoc = ctx.doc as PdfShapeDocument;
  ctx.doc.save();
  shapeDoc.circle(centerX, centerY, radius).strokeColor(color).lineWidth(width).stroke();
  ctx.doc.restore();
}

export function strokeRule(ctx: PdfRenderContext, x: number, y: number, width: number, color = "#c8c8c8") {
  ctx.doc.save();
  ctx.doc.moveTo(x, y)
    .lineTo(x + width, y)
    .strokeColor(color)
    .lineWidth(0.35)
    .stroke();
  ctx.doc.restore();
}

/**
 * Render a multi-word label inside a cell, one word per line, centered vertically
 * and using a font size that fits all words within the cell height. Each word
 * is drawn independently (no character-level wrapping), so single words never
 * break in the middle.
 */
export function drawWrappedClassName(
  ctx: PdfRenderContext,
  words: string[],
  rect: PdfRect,
  options: PdfTextOptions & { maxSize: number; minSize: number },
) {
  if (words.length === 0) return;
  const font = options.font || "Helvetica-Bold";
  const align = options.align || "center";
  const color = options.color || "#000000";

  // Find the largest font size that fits all words in one line within rect.width
  // and all lines within rect.height.
  let size = options.minSize;
  const sizes: number[] = [];
  for (const word of words) {
    sizes.push(size);
  }
  for (let s = options.maxSize; s >= options.minSize; s -= 0.25) {
    ctx.doc.save();
    ctx.doc.font(resolveFont(ctx, font));
    ctx.doc.fontSize(s);
    let allFit = true;
    const lineH = ctx.doc.heightOfString(words[0]!, { width: rect.width, align });
    for (const word of words) {
      const w = ctx.doc.widthOfString(word);
      if (w > rect.width) {
        allFit = false;
        break;
      }
    }
    if (allFit && lineH * words.length <= rect.height) {
      size = s;
      ctx.doc.restore();
      break;
    }
    ctx.doc.restore();
  }

  ctx.doc.save();
  ctx.doc.font(resolveFont(ctx, font));
  ctx.doc.fontSize(size);
  ctx.doc.fillColor(color);
  const lineH = ctx.doc.heightOfString(words[0]!, { width: rect.width, align });
  const totalH = lineH * words.length;
  const startY = rect.y + Math.max(0, (rect.height - totalH) / 2);
  words.forEach((word, i) => {
    const yPos = startY + i * lineH;
    const xPos =
      align === "left"
        ? rect.x
        : align === "right"
        ? rect.x + rect.width - ctx.doc.widthOfString(word)
        : rect.x + (rect.width - ctx.doc.widthOfString(word)) / 2;
    ctx.doc.text(word, xPos, yPos, { lineBreak: false, width: rect.width, align });
  });
  ctx.doc.restore();
}
