// /Users/max/dev/Arcanum/.qa/draconic-baseline.mjs
// BASELINE run (with the fix stashed). Same as draconic-investigate.mjs but
// isolates each step so we always capture warnings, even if the script errors.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleLines = [];
const warnings = [];
const pageErrors = [];

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

try {
  await page.goto(`${BASE}/characters`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Seed a Dragonborn + Red draft directly (skip the catalog dump)
  const seedResult = await page.evaluate(() => {
    const draftId = "test-dragonborn-red-" + Date.now();
    const now = new Date().toISOString();
    const draft = {
      id: draftId,
      createdAt: now,
      updatedAt: now,
      name: "Test Dragonborn Red " + Date.now(),
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
      equipmentNotes: { additionalTreasure: "", questItems: "", additionalSpells: "", additionalProficiencies: "", additionalLanguages: "", additionalFeats: "", additionalFeatures: "", additionalAbilityScores: "" },
      manualGrants: [],
      backstory: { alignment: "", deity: "", personalityTraits: "", ideals: "", bonds: "", flaws: "", alliesAndOrganizations: "", backstory: "", additionalFeatures: "" },
      sourceManifest: [],
    };
    const key = "arcanum.characterDrafts";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    arr.push(draft);
    localStorage.setItem(key, JSON.stringify(arr));
    return draft.id;
  });
  console.log("Seeded:", seedResult);

  // Hard reload to ensure the new draft is read
  await page.goto(`${BASE}/characters`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Find the row
  const row = page.locator("text=Test Dragonborn Red").first();
  const rowVisible = await row.isVisible({ timeout: 8000 }).catch(() => false);
  console.log("Row visible:", rowVisible);

  if (rowVisible) {
    // Find the download button. Try the most specific text first.
    const dlBtn = page.getByRole("button", { name: /Download Sheet/i }).first();
    const btnVisible = await dlBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("Download button visible:", btnVisible);
    if (btnVisible) {
      const downloadPromise = page.waitForEvent("download", { timeout: 25000 }).catch(() => null);
      await dlBtn.click();
      const dl = await downloadPromise;
      if (dl) {
        const path = "/Users/max/dev/Arcanum/.qa/draconic-baseline.pdf";
        await dl.saveAs(path);
        console.log("PDF saved to", path);
      } else {
        console.log("No download captured (baseline)");
      }
    }
  }
  await page.waitForTimeout(2000);
} catch (e) {
  console.log("Script error:", e.message);
}

writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-baseline-warnings.json", JSON.stringify(warnings, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-baseline-errors.json", JSON.stringify(pageErrors, null, 2));

console.log("=== BASELINE WARNINGS (no fix) ===");
console.log(JSON.stringify(warnings, null, 2));
console.log("=== BASELINE PAGE ERRORS ===");
console.log(JSON.stringify(pageErrors, null, 2));

await browser.close();
