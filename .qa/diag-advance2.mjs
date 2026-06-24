#!/usr/bin/env node
/**
 * V2: Actually fill the name correctly via placeholder, then click Continue.
 * Diff the DOM before/after to see what changed.
 */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const OUT = "/Users/max/dev/Arcanum/.qa";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();

const consoleMsgs = [];
const pageErrors = [];
const network = [];
let navigationCount = 0;

page.on("console", (msg) => {
  consoleMsgs.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  pageErrors.push({ name: err.name, message: err.message, stack: (err.stack || "").slice(0, 1500) });
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    navigationCount++;
    console.log(`[NAV #${navigationCount}] ${frame.url()}`);
  }
});
page.on("response", async (resp) => {
  const url = resp.url();
  if (url.startsWith(BASE) || url.includes("/api/")) {
    network.push({
      ts: Date.now(),
      method: resp.request().method(),
      url: url.replace(BASE, ""),
      status: resp.status(),
      type: resp.request().resourceType(),
    });
  }
});

await page.goto(`${BASE}/builder/new`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

// Snapshot DOM and HTML
const before = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("input, select, textarea, button, [role='button']"));
  return all.map((el) => ({
    tag: el.tagName,
    type: el.type || null,
    name: el.getAttribute("name"),
    id: el.id || null,
    placeholder: el.placeholder || null,
    value: el.value || null,
    text: (el.textContent || "").trim().slice(0, 80),
    disabled: el.disabled || null,
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
  }));
});
const beforeHTML = await page.content();
console.log(`[BEFORE] elements: ${before.length}`);

// Find name input by placeholder
const nameInput = page.locator('input[placeholder*="Alyra" i]').first();
const nameCount = await page.locator('input[placeholder*="Alyra" i]').count();
console.log(`  name input count by "Alyra" placeholder: ${nameCount}`);
if (nameCount > 0) {
  await nameInput.fill("TestChar");
  console.log("  filled name=TestChar");
  await page.waitForTimeout(200);
}

// Also try any number inputs
const numCount = await page.locator('input[type="number"]').count();
console.log(`  number inputs: ${numCount}`);

// Look for any element with class containing "ability"
const abilityFields = await page.locator('[class*="ability"]').count();
console.log(`  ability-class elements: ${abilityFields}`);

await page.screenshot({ path: `${OUT}/diag2-01-pre-click.png`, fullPage: true });

// Capture current state of the "Continue to Race" button
const continueBtns = await page.locator('button:has-text("Continue to Race")').all();
console.log(`  "Continue to Race" buttons: ${continueBtns.length}`);
let cont = null;
for (const b of continueBtns) {
  const t = (await b.textContent().catch(() => "")) || "";
  const dis = await b.isDisabled();
  console.log(`    text="${t.trim().slice(0, 60)}" disabled=${dis}`);
  if (!dis) cont = b;
}
if (!cont) {
  console.log("  no enabled continue button. Looking for any button with 'Continue' text:");
  const anyCont = await page.locator('button:has-text("Continue")').all();
  for (const b of anyCont) {
    const t = (await b.textContent().catch(() => "")) || "";
    const dis = await b.isDisabled();
    console.log(`    [any] text="${t.trim().slice(0, 60)}" disabled=${dis}`);
  }
  await browser.close();
  process.exit(1);
}

const urlBefore = page.url();
const navBefore = navigationCount;
const netBefore = network.length;

console.log("\n=== CLICKING ===");
await cont.click();
console.log("  clicked");

// Wait & poll URL
for (const ms of [200, 500, 1000, 2000, 4000]) {
  await page.waitForTimeout(ms - (ms === 200 ? 0 : (ms === 500 ? 200 : (ms === 1000 ? 500 : (ms === 2000 ? 1000 : 2000)))));
  const url = page.url();
  const nav = navigationCount;
  const net = network.length;
  console.log(`  [t=${ms}ms] url=${url} navs=${nav - navBefore} newNet=${net - netBefore}`);
}

await page.screenshot({ path: `${OUT}/diag2-02-post-click.png`, fullPage: true });

// Compare
const after = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("input, select, textarea, button, [role='button']"));
  return all.map((el) => ({
    tag: el.tagName,
    type: el.type || null,
    name: el.getAttribute("name"),
    id: el.id || null,
    placeholder: el.placeholder || null,
    value: el.value || null,
    text: (el.textContent || "").trim().slice(0, 80),
    disabled: el.disabled || null,
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
  }));
});
const afterHTML = await page.content();

await writeFile(`${OUT}/diag2-elements-before.json`, JSON.stringify(before, null, 2));
await writeFile(`${OUT}/diag2-elements-after.json`, JSON.stringify(after, null, 2));

// Simple diff
const beforeJson = JSON.stringify(before);
const afterJson = JSON.stringify(after);
console.log(`\n[DIFF] before len=${beforeJson.length} after len=${afterJson.length}`);
console.log(`[DIFF] identical: ${beforeJson === afterJson}`);

// Save network & console
await writeFile(`${OUT}/diag2-network.json`, JSON.stringify(network, null, 2));
await writeFile(`${OUT}/diag2-console.json`, JSON.stringify(consoleMsgs, null, 2));
await writeFile(`${OUT}/diag2-pageerrors.json`, JSON.stringify(pageErrors, null, 2));

// Print network requests added after click
const newNet = network.slice(netBefore);
console.log(`\n[NET] ${newNet.length} new requests after click:`);
for (const r of newNet) {
  console.log(`  ${r.method} ${r.url} -> ${r.status} (${r.type})`);
}

if (pageErrors.length > 0) {
  console.log("\n--- PAGE ERRORS ---");
  for (const e of pageErrors) console.log(JSON.stringify(e, null, 2));
}
if (consoleMsgs.length > 0) {
  console.log("\n--- CONSOLE (first 40) ---");
  for (const m of consoleMsgs.slice(0, 40)) console.log(`[${m.type}] ${m.text.slice(0, 400)}`);
}

await browser.close();
