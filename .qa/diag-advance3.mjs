#!/usr/bin/env node
/**
 * V3: After fix, verify:
 *  - name "TestChar" persists across the step change
 *  - new step is "Race" (not back to Foundation)
 *  - no remount / no flicker
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/Users/max/dev/Arcanum/.qa";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();

const errors = [];
const consoles = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => consoles.push({ type: m.type(), text: m.text() }));

await page.goto(`${BASE}/builder/new`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// Fill name
const nameInput = page.locator('input[placeholder*="Alyra" i]').first();
const nameCount = await page.locator('input[placeholder*="Alyra" i]').count();
console.log(`[init] name inputs: ${nameCount}`);
if (nameCount > 0) {
  await nameInput.fill("TestChar");
  await page.waitForTimeout(150);
}
const nameBefore = nameCount > 0 ? await nameInput.inputValue() : null;
console.log(`[init] name before click: "${nameBefore}"`);

// Get all the ability scores too
const plusBtns = await page.locator('button:has-text("+")').all();
console.log(`[init] "+" buttons: ${plusBtns.length}`);

// Click some + buttons to change ability scores
if (plusBtns.length >= 6) {
  for (let i = 0; i < 6; i++) {
    await plusBtns[i].click({ force: true }).catch(() => {});
    await page.waitForTimeout(50);
  }
}

await page.screenshot({ path: `${OUT}/diag3-01-foundation-filled.png`, fullPage: true });

// Click Continue to Race
const continueBtn = page.locator('button:has-text("Continue to Race")').first();
const contCount = await page.locator('button:has-text("Continue to Race")').count();
console.log(`[init] continue buttons: ${contCount}`);
const contEnabled = contCount > 0 ? !(await continueBtn.isDisabled()) : false;
console.log(`[init] continue enabled: ${contEnabled}`);
if (!contEnabled) {
  console.log("  ! continue disabled — canAdvance failed");
  await browser.close();
  process.exit(2);
}

console.log("\n=== CLICKING CONTINUE TO RACE ===");
const navBefore = (await page.evaluate(() => window.history.length));
await continueBtn.click();
await page.waitForTimeout(500);
const nav500 = (await page.evaluate(() => window.history.length));
await page.waitForTimeout(1500);
const nav2000 = (await page.evaluate(() => window.history.length));

console.log(`[after] history.length before=${navBefore} 500ms=${nav500} 2000ms=${nav2000}`);

await page.screenshot({ path: `${OUT}/diag3-02-after-continue.png`, fullPage: true });

// Is the new step "Race" visible? Look for race step content
const headings = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5")).map((h) =>
    (h.textContent || "").trim().slice(0, 100),
  );
});
console.log(`[after] headings: ${JSON.stringify(headings, null, 2)}`);

// Look for "Continue to Class" button (i.e. now on Race)
const classBtn = await page.locator('button:has-text("Continue to Class")').count();
const foundationBtn = await page.locator('button:has-text("Continue to Race")').count();
console.log(`[after] "Continue to Class" buttons: ${classBtn}, "Continue to Race" buttons: ${foundationBtn}`);

// Look for any input with "TestChar" still in the DOM
const nameAfter = nameCount > 0 ? await page.locator('input[placeholder*="Alyra" i]').first().inputValue().catch(() => null) : null;
console.log(`[after] name input value: "${nameAfter}"`);

// Look for "Race" step pill being marked active
const activePills = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('button, [role="tab"], li, a'));
  return all
    .filter((el) => {
      const cls = el.className || "";
      const aria = el.getAttribute("aria-current");
      return (typeof cls === "string" && /active|selected|current/i.test(cls)) || aria;
    })
    .map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 60),
      class: (el.className || "").slice(0, 80),
      aria: el.getAttribute("aria-current"),
    }));
});
console.log(`[after] active pills: ${JSON.stringify(activePills, null, 2)}`);

console.log(`\n[errors] ${errors.length}`);
for (const e of errors) console.log("  ", e);
console.log(`[console] ${consoles.length} (filtered non-info)`);
for (const m of consoles.filter(c => c.type !== "info" && c.type !== "debug").slice(0, 20)) {
  console.log(`  [${m.type}] ${m.text.slice(0, 300)}`);
}

await browser.close();
console.log("done");
