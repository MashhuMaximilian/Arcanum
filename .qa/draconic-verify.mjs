// /Users/max/dev/Arcanum/.qa/draconic-verify.mjs
// POST-FIX verification: clear localStorage first, seed fresh, click download.

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
  // Start with a clean slate
  await page.goto(`${BASE}/characters`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("arcanum.characterDrafts");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Seed a fresh Dragonborn + Red Draconic Ancestry draft
  const seedInfo = await page.evaluate(() => {
    const draftId = "test-dragonborn-red";
    const now = new Date().toISOString();
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
      equipmentNotes: { additionalTreasure: "", questItems: "", additionalSpells: "", additionalProficiencies: "", additionalLanguages: "", additionalFeats: "", additionalFeatures: "", additionalAbilityScores: "" },
      manualGrants: [],
      backstory: { alignment: "", deity: "", personalityTraits: "", ideals: "", bonds: "", flaws: "", alliesAndOrganizations: "", backstory: "", additionalFeatures: "" },
      sourceManifest: [],
    };
    const key = "arcanum.characterDrafts";
    localStorage.setItem(key, JSON.stringify([draft]));
    return { id: draft.id, raceId: draft.raceId, progSelect: draft.progressionSelections };
  });
  console.log("Seeded:", JSON.stringify(seedInfo));

  // Hard reload so the new draft is rendered
  await page.goto(`${BASE}/characters`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Wait for our row to appear
  await page.locator("text=Test Dragonborn Red").first().waitFor({ timeout: 10000 });
  console.log("Row visible: true");

  // Click "Download Sheet"
  const dlBtn = page.getByRole("button", { name: /Download Sheet/i }).first();
  await dlBtn.waitFor({ timeout: 5000 });
  console.log("Download button visible: true");

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  const responsePromise = page.waitForResponse((r) => r.url().includes("/pdf-export") || r.url().includes("/api/pdf"), { timeout: 30000 }).catch(() => null);
  await dlBtn.click();
  const dl = await downloadPromise;
  const resp = await responsePromise;
  if (dl) {
    const path = "/Users/max/dev/Arcanum/.qa/draconic-postfix.pdf";
    await dl.saveAs(path);
    console.log("PDF saved to", path);
  } else {
    console.log("No download captured");
  }
  if (resp) {
    console.log("PDF response:", resp.status(), "url:", resp.url());
  }
  await page.waitForTimeout(3000);
} catch (e) {
  console.log("Script error:", e.message);
}

writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-postfix-warnings.json", JSON.stringify(warnings, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-postfix-errors.json", JSON.stringify(pageErrors, null, 2));
writeFileSync("/Users/max/dev/Arcanum/.qa/draconic-postfix-console.json", JSON.stringify(consoleLines, null, 2));

console.log("=== POST-FIX WARNINGS ===");
console.log(JSON.stringify(warnings, null, 2));
console.log("=== POST-FIX PAGE ERRORS ===");
console.log(JSON.stringify(pageErrors, null, 2));
console.log("=== CONSOLE SUMMARY ===");
const byType = {};
for (const c of consoleLines) byType[c.type] = (byType[c.type] || 0) + 1;
console.log(byType);

await browser.close();
