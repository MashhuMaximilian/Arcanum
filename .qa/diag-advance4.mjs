#!/usr/bin/env node
/**
 * V4: Verify draft state preservation when going back to Foundation.
 * Also verify network: no extra /api/srd-catalogs full fetch on step change.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/Users/max/dev/Arcanum/.qa";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const apiRequests = [];
page.on("request", (req) => {
  if (req.url().includes("/api/srd-catalogs")) {
    apiRequests.push({ method: req.method(), url: req.url() });
  }
});

await page.goto(`${BASE}/builder/new`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(5000);

const nameInput = page.locator('input[placeholder*="Alyra" i]').first();
const nameCount = await page.locator('input[placeholder*="Alyra" i]').count();
console.log(`[init] name inputs: ${nameCount}`);
if (nameCount > 0) {
  await nameInput.fill("PreservedName");
  await page.waitForTimeout(150);
}

// Click Continue to Race
const continueBtn = page.locator('button:has-text("Continue to Race")').first();
const contCount = await page.locator('button:has-text("Continue to Race")').count();
console.log(`[init] continue buttons: ${contCount}`);
if (contCount === 0) {
  console.log("  no continue button");
  await browser.close();
  process.exit(1);
}
const apiCountBeforeClick = apiRequests.length;
await continueBtn.click();
await page.waitForTimeout(2000);

// Now on Race step. Click the Foundation step pill to go back.
const foundationPill = page.locator('button:has-text("1Foundation")').first();
const pillCount = await page.locator('button:has-text("1Foundation")').count();
console.log(`[race] foundation pill count: ${pillCount}`);
if (pillCount > 0) {
  await foundationPill.click();
  await page.waitForTimeout(2000);
}

// Check name preserved
const nameAfterRoundtrip = await page.locator('input[placeholder*="Alyra" i]').first().inputValue().catch(() => null);
console.log(`[after-roundtrip] name input value: "${nameAfterRoundtrip}"`);

console.log(`\n[api-requests] ${apiRequests.length} total /api/srd-catalogs calls:`);
for (const r of apiRequests) console.log(`  ${r.method} ${r.url}`);

console.log(`[errors] ${errors.length}`);
for (const e of errors) console.log("  ", e);

await browser.close();
