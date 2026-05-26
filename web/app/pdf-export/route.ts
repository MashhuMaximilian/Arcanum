import { NextResponse } from "next/server";

import { loadPdfSvgAssetBundle, PDF_EXPORT_SVG_ASSET_PATHS } from "@/lib/pdf/svg-assets.server";
import type { ResolvedPdfCharacter } from "@/lib/pdf/types";
import { generatePdfBytes } from "@/lib/pdf/generate";

export const runtime = "nodejs";

const PDF_EXPORT_ASSET_KEYS = [
  "frontPageHeader",
  "frontPageHeaderShell",
  "hpPanel",
  "passivesAndSpeeds",
  "weaponAttacks",
  "generalContainer",
  "weaponBg",
  "greyBackground",
  "proficiencyBoolean",
  "proficiencyBox0",
  "proficiencyBox1",
  "line",
  "skillLine",
  "statBlock",
] as const satisfies Array<keyof typeof PDF_EXPORT_SVG_ASSET_PATHS>;

function sanitizeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "arcanum-character";
}

export async function POST(request: Request) {
  try {
    let character: ResolvedPdfCharacter;

    try {
      character = (await request.json()) as ResolvedPdfCharacter;
    } catch {
      return NextResponse.json({ error: "Invalid export payload." }, { status: 400 });
    }

    if (!character?.frontPage?.stats || !character?.name) {
      return NextResponse.json({ error: "Missing character export data." }, { status: 400 });
    }

    const svgAssets = await loadPdfSvgAssetBundle([...PDF_EXPORT_ASSET_KEYS]);
    const pdfBytes = await generatePdfBytes(character, svgAssets);
    const fileName = `${sanitizeFileName(character.name)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF export failed", error);
    const message = error instanceof Error ? error.message : "PDF export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
