// TEMPORARY debug route — accepts a raw CharacterDraft JSON and runs the
// full client-side resolve pipeline (buildPdfCharacterFromDraft +
// generatePdfBytes) to produce a PDF. Used by .qa/build-user-pdf.mjs to
// verify fixes against the user's actual rangies-arcanum-build.json.

import { NextResponse } from "next/server";

import { buildPdfCharacterFromDraft } from "@/lib/pdf/from-builder";
import { loadPdfSvgAssetBundle, PDF_EXPORT_SVG_ASSET_PATHS } from "@/lib/pdf/svg-assets.server";
import { generatePdfBytes } from "@/lib/pdf/generate";

import { getBuiltInSrdBackgroundElements, getBuiltInSrdBackgrounds } from "@/lib/builtins/backgrounds";
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from "@/lib/builtins/classes";
import { getBuiltInSrdFeats } from "@/lib/builtins/feats";
import { getBuiltInSrdRaces, getBuiltInSrdRaceElements } from "@/lib/builtins/races";
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from "@/lib/builtins/srd-companions";
import { getBuiltInSrdSpells } from "@/lib/builtins/spells";

export const runtime = "nodejs";

const ASSET_KEYS = [
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
  "hitDie",
  "bonusBox",
  "ac",
  "hp",
  "passiveBox",
  "skillBlock",
  "abilityPanel",
] as const satisfies Array<keyof typeof PDF_EXPORT_SVG_ASSET_PATHS>;

function buildCatalogs() {
  const backgrounds = getBuiltInSrdBackgrounds();
  const classes = getBuiltInSrdClasses();
  const feats = getBuiltInSrdFeats();
  const races = getBuiltInSrdRaces();
  const spells = getBuiltInSrdSpells();
  const progressionElements = [
    ...getBuiltInSrdRaceElements(),
    ...getBuiltInSrdClassElements(),
    ...getBuiltInSrdBackgroundElements(),
    ...getBuiltInSrdCompanions(),
    ...getBuiltInSrdCompanionSubElements(),
  ];
  return { backgrounds, classes, feats, races, spells, progressionElements };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draft = body?.character ?? body;
    const catalogs = buildCatalogs();
    const character = buildPdfCharacterFromDraft({ ...catalogs, draft });
    const svgAssets = await loadPdfSvgAssetBundle([...ASSET_KEYS]);
    console.log("proficiencyGroups:", JSON.stringify(character.frontPage.proficiencyGroups, null, 2));
    if (request.headers.get("x-debug") === "1") {
      return NextResponse.json({
        proficiencyGroups: character.frontPage.proficiencyGroups,
        combatHubSpellColumn: character.frontPage.combatHub?.spellColumn,
        combatHubHasSpells: character.frontPage.combatHub?.hasSpells,
        headerFields: character.frontPage?.header?.fields,
      });
    }
    // Capture browser console.log calls during PDF gen into a log file so
    // round-21 debugging can inspect the column packing decisions.
    const logBuffer: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logBuffer.push(args.map(String).join(" "));
      origLog(...args);
    };
    let pdf: Uint8Array;
    try {
      pdf = await generatePdfBytes(character, svgAssets);
    } finally {
      console.log = origLog;
    }
    const fs = await import("node:fs/promises");
    await fs.writeFile("/tmp/r22/pack-log.txt", logBuffer.join("\n"));
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rangies.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("pdf-export-draft failed", error);
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : "pdf-export-draft failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
