import fsPromises from "node:fs/promises";
import path from "node:path";

import type PDFDocument from "pdfkit";

import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { ResolvedPdfCharacter } from "@/lib/pdf/types";
import type { PdfRenderContext } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";
import { renderFrontPage } from "@/lib/pdf/front-page-renderer";
import { renderInventoryPage, renderCompanionPage } from "@/lib/pdf/page2-renderer";
import { renderStandardPage } from "@/lib/pdf/page-flow";

const PDF_TEXT_FONT_FAMILY = "Noto Sans";

async function resolvePdfFontPath() {
  const candidates = [
    path.resolve(process.cwd(), "public", "pdf-fonts", "NotoSans-Regular.ttf"),
    path.resolve(process.cwd(), "web", "public", "pdf-fonts", "NotoSans-Regular.ttf"),
  ];

  for (const candidate of candidates) {
    try {
      await fsPromises.access(candidate);
      return candidate;
    } catch {
      // Try the next known deployment/workspace location.
    }
  }

  throw new Error("Unable to locate the PDF font asset.");
}

async function loadPdfFontBuffer() {
  const fontPath = await resolvePdfFontPath();
  return fsPromises.readFile(fontPath);
}

function collectPdfBytes(doc: PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });
}

export async function generatePdfBytes(character: ResolvedPdfCharacter, assets: PdfSvgAssetBundle) {
  const fontBuffer = await loadPdfFontBuffer();
  const [{ default: PDFDocument }, { default: SVGtoPDF }] = await Promise.all([
    import("pdfkit/js/pdfkit.standalone.js"),
    import("svg-to-pdfkit"),
  ]);

  const doc = new PDFDocument({
    size: [PAGE_SIZE.width, PAGE_SIZE.height],
    margin: 0,
    autoFirstPage: false,
    compress: true,
  });
  doc.registerFont(PDF_TEXT_FONT_FAMILY, fontBuffer);

  const done = collectPdfBytes(doc);
  const ctx: PdfRenderContext = {
    doc,
    svgToPdf: SVGtoPDF,
    bodyFont: PDF_TEXT_FONT_FAMILY,
  };

  renderFrontPage(ctx, assets, character);

  // Render additional pages based on pagePlan
  console.log("[DEBUG] generatePdfBytes - pagePlan:", character.pagePlan.map((p) => p.kind));
  console.log("[DEBUG] generatePdfBytes - companionCards count:", character.companionCards?.length ?? 0);
  if (character.companionCards?.length) {
    console.log("[DEBUG] generatePdfBytes - first companion:", character.companionCards[0].title, "tags:", character.companionCards[0].tags);
  }
  
  console.log("[DEBUG] generatePdfBytes - character.companionCards full:", character.companionCards?.map((c) => ({ title: c.title, tags: c.tags })));
  for (const page of character.pagePlan) {
    if (page.kind === "inventory") {
      renderInventoryPage(ctx, assets, character);
    } else if (page.kind === "companion") {
      renderCompanionPage(ctx, assets, character);
    } else if (page.kind !== "front") {
      renderStandardPage(ctx, assets, character, page);
    }
  }

  doc.end();
  return done;
}
