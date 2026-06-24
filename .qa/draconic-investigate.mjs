// /Users/max/dev/Arcanum/.qa/draconic-investigate.mjs
// Drive the actual app, capture real warnings, and dump the actual subrace id format.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleLines = [];
const warnings = [];
const pageErrors = [];
const networkLog = [];

page.on("console", (msg) => {
  const text = msg.text();
  const entry = { type: msg.type(), text, location: msg.location() };
  consoleLines.push(entry);
  if (
    text.includes("Unresolved placeholder") ||
    text.includes("draconic-ancestry") ||
    text.includes("{{draconic")
  ) {
    warnings.push(entry);
  }
});
page.on("pageerror", (err) => {
  pageErrors.push(err.message);
});
page.on("response", async (resp) => {
  if (resp.url().includes("/api/srd-catalogs")) {
    try {
      const body = await resp.text();
      networkLog.push({ url: resp.url(), status: resp.status(), len: body.length, head: body.slice(0, 200) });
    } catch (e) {
      networkLog.push({ url: resp.url(), status: resp.status(), err: String(e) });
    }
  }
});

// Go to /characters
await page.goto(`${BASE}/characters`, { waitUntil: "networkidle" });

// Dump any existing drafts
const existingDrafts = await page.evaluate(() => {
  const raw = localStorage.getItem("arcanum.characterDrafts");
  if (!raw) return null;
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? arr.map((d) => ({ id: d.id, name: d.name, raceId: d.raceId, subraceId: d.subraceId, progressionSelections: d.progressionSelections })) : null;
});
console.log("=== EXISTING DRAFTS IN LOCALSTORAGE ===");
console.log(JSON.stringify(existingDrafts, null, 2));

// Hit the race-step catalog via fetch in-page to get the live data
const catalogResult = await page.evaluate(async () => {
  const r = await fetch("/api/srd-catalogs?step=race", { cache: "no-store" });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, status: r.status, snippet: text.slice(0, 300) }; }
  const races = data.races || [];
  const progs = data.progressionElements || [];
  const dragonborn = races.find((e) => e?.race?.id === "ID_RACE_DRAGONBORN");
  const draconicAncestryChoices = progs.filter((e) => /^ID_RACIAL_TRAIT_DRACONIC_ANCESTRY_[A-Z]+$/.test(e.id));
  return {
    ok: true,
    status: r.status,
    raceCount: races.length,
    progCount: progs.length,
    dragonborn: dragonborn ? { subraceCount: dragonborn.subraces.length, traitCount: dragonborn.traits.length, subraceIds: dragonborn.subraces.map((s) => s.id), traitIds: dragonborn.traits.map((t) => t.id) } : null,
    draconicAncestryChoices: draconicAncestryChoices.map((c) => ({ id: c.id, name: c.name, type: c.type, ruleCount: (c.rules || []).length })),
  };
});
console.log("=== SRD CATALOG (race step) ===");
console.log(JSON.stringify(catalogResult, null, 2));

// Find an existing Dragonborn draft to test on, or seed one
let target = (existingDrafts || []).find((d) => /dragonborn/i.test(d.name || "") || /dragonborn/i.test(d.raceId || ""));
if (!target && catalogResult.ok) {
  // Seed a Dragonborn + Red draft with the proper progressionSelection for Red Draconic Ancestry
  const seedResult = await page.evaluate(async () => {
    const r = await fetch("/api/srd-catalogs", { cache: "no-store" });
    const d = await r.json();
    const progs = d.progressionElements || [];
    const red = progs.find((p) => p.id === "ID_RACIAL_TRAIT_DRACONIC_ANCESTRY_RED");
    if (!red) return { ok: false, error: "RED not in progressionElements" };
    return { ok: true, redName: red.name, redId: red.id, ruleCount: (red.rules || []).length };
  });
  console.log("=== SEED CHECK ===");
  console.log(JSON.stringify(seedResult, null, 2));

  if (seedResult.ok) {
    const draftId = "test-dragonborn-red-" + Date.now();
    const now = new Date().toISOString();
    // Find the progression-select step id for Dragonborn's Draconic Ancestry
    const progStepInfo = await page.evaluate(() => {
      // Try to find the step id by inspecting the Dragonborn's traits and their select rules
      return null;
    });
    const draft = {
      id: draftId,
      createdAt: now,
      updatedAt: now,
      name: "Test Dragonborn Red",
      playerName: "",
      raceId: "ID_RACE_DRAGONBORN",
      subraceId: null,
      level: 1,
      classEntries: [{ classId: "ID_CLASS_FIGHTER", subclassId: "", level: 1 }],
      backgroundId: "",
      useTashasCustomizedOrigin: false,
      abilityMode: "standard-array",
      abilities: { strength: 15, dexterity: 12, constitution: 13, intelligence: 10, wisdom: 11, charisma: 14 },
      improvementSelections: {},
      progressionSelections: { "ID_RACIAL_TRAIT_DRACONIC_ANCESTRY": ["ID_RACIAL_TRAIT_DRACONIC_ANCESTRY_RED"] },
      spellSelections: {},
      equipmentAcquisitionMode: "gear",
      equipmentGoldOverrideGp: null,
      equipmentSelections: {},
      removedInventoryItemIds: [],
      inventoryCurrency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      inventoryItems: [],
      equipmentNotes: {
        additionalTreasure: "", questItems: "", additionalSpells: "",
        additionalProficiencies: "", additionalLanguages: "", additionalFeats: "",
        additionalFeatures: "", additionalAbilityScores: "",
      },
      manualGrants: [],
      backstory: {
        alignment: "", deity: "", personalityTraits: "", ideals: "",
        bonds: "", flaws: "", alliesAndOrganizations: "", backstory: "", additionalFeatures: "",
      },
      sourceManifest: [],
    };

    await page.evaluate((draft) => {
      const key = "arcanum.characterDrafts";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push(draft);
      localStorage.setItem(key, JSON.stringify(arr));
    }, draft);
    target = { id: draftId, name: "Test Dragonborn Red", raceId: "ID_RACE_DRAGONBORN", subraceId: null, progressionSelections: draft.progressionSelections };
    console.log("Seeded draft:", target);
  }
}

// Reload /characters and click "Download Sheet" for the target
await page.goto(`${BASE}/characters`, { waitUntil: "networkidle" });
const row = page.locator(`text=${target.name}`).first();
const rowVisible = await row.isVisible({ timeout: 5000 }).catch(() => false);
console.log("Target row visible:", rowVisible, "for", target.name);

if (rowVisible) {
  // Find the Download Sheet button in the same row. The character-list has a
  // vertical button stack per row, so find the first "Download Sheet" button
  // that is visible.
  const dlBtn = page.getByRole("button", { name: /Download Sheet/i }).first();
  const btnVisible = await dlBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log("Download Sheet button visible:", btnVisible);
  if (btnVisible) {
    // The download triggers a network request to /pdf-export (or blob URL)
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    const responsePromise = page.waitForResponse((r) => r.url().includes("/pdf-export") || r.url().includes("/api/pdf"), { timeout: 20000 }).catch(() => null);
    await dlBtn.click();
    const dl = await downloadPromise;
    const resp = await responsePromise;
    if (dl) {
      const path = `/Users/max/dev/Arcanum/.qa/draconic-test.pdf`;
      await dl.saveAs(path);
      console.log("PDF saved to", path);
    } else {
      console.log("No download event captured");
    }
    if (resp) {
      console.log("PDF response:", resp.status(), "url:", resp.url());
    } else {
      console.log("No /pdf-export network request observed");
    }
    // Wait a bit more for any async console activity
    await page.waitForTimeout(3000);
  }
}

writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-console.json", JSON.stringify(consoleLines, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-warnings.json", JSON.stringify(warnings, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-errors.json", JSON.stringify(pageErrors, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-network.json", JSON.stringify(networkLog, null, 2));

console.log("=== WARNINGS ===");
console.log(JSON.stringify(warnings, null, 2));
console.log("=== PAGE ERRORS ===");
console.log(JSON.stringify(pageErrors, null, 2));
console.log("=== NETWORK (srd-catalogs) ===");
console.log(JSON.stringify(networkLog.slice(0, 5), null, 2));

await browser.close();
