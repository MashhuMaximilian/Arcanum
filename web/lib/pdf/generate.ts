import fsPromises from "node:fs/promises";
import dnsPromises from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { Buffer } from "node:buffer";

import type PDFDocument from "pdfkit";

import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { ResolvedPdfCharacter } from "@/lib/pdf/types";
import type { PdfRenderContext } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";
import { renderFrontPage } from "@/lib/pdf/front-page-renderer";
import { renderInventoryPage, renderCompanionPage } from "@/lib/pdf/page2-renderer";
import { renderStandardPage } from "@/lib/pdf/page-flow";

const PDF_TEXT_FONT_FAMILY = "Noto Sans";
const MAX_PORTRAIT_BYTES = 8 * 1024 * 1024;

function isPrivateIpAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) {
    return isPrivateIpAddress(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicImageUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Portrait URL must use http or https.");
  }

  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Local portrait URLs are not supported.");
  }

  const addresses = await dnsPromises.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error("Portrait URL must resolve to a public host.");
  }
}

function isPdfKitImage(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isPng || isJpeg;
}

function getPortraitMimeType(bytes: Uint8Array) {
  return bytes[0] === 0x89 ? "image/png" : "image/jpeg";
}

async function loadRemotePortrait(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  let url = new URL(value);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await assertPublicImageUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.1",
        "User-Agent": "Arcanum-PDF-Exporter/1.0",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) {
        throw new Error("Portrait URL redirected too many times.");
      }
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Portrait download failed with status ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PORTRAIT_BYTES) {
      throw new Error("Portrait image is too large.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PORTRAIT_BYTES) {
      throw new Error("Portrait image is too large.");
    }
    if (isPdfKitImage(bytes)) {
      return `data:${getPortraitMimeType(bytes)};base64,${bytes.toString("base64")}`;
    }

    // Browsers commonly display WebP/AVIF portrait links that PDFKit cannot
    // decode. Normalize any supported raster input to JPEG before rendering.
    const { default: sharp } = await import("sharp");
    const normalized = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${normalized.toString("base64")}`;
  }

  return undefined;
}

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
  const [fontBuffer, companionPortraitImage] = await Promise.all([
    loadPdfFontBuffer(),
    loadRemotePortrait(character.source?.companionPortraitUrl ?? "").catch((error) => {
      console.warn("Unable to load companion portrait for PDF", error);
      return undefined;
    }),
  ]);
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
    companionPortraitImage,
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
