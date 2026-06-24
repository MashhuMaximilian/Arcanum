#!/usr/bin/env node
/**
 * Bug investigation: /builder/new "Continue to Race" causes page refresh.
 * Drive the dev server with Playwright and capture EVERYTHING.
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
  const t = msg.type();
  const txt = msg.text();
  if (t === "error" || t === "warning" || t === "log") {
    consoleMsgs.push({ type: t, text: txt });
  }
});

page.on("pageerror", (err) => {
  pageErrors.push({ name: err.name, message: err.message, stack: (err.stack || "").slice(0, 800) });
});

page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    navigationCount++;
    console.log(`[NAV #${navigationCount}] ${frame.url()}`);
  }
});

page.on("response", async (resp) => {
  const url = resp.url();
  // Only log interesting ones
  if (url.startsWith(BASE) || url.includes("/_next/") || url.includes("/api/")) {
    network.push({
      ts: Date.now(),
      method: resp.request().method(),
      url: url.replace(BASE, ""),
      status: resp.status(),
      type: resp.request().resourceType(),
    });
  }
});

console.log("=== STEP 1: Goto /builder/new ===");
await page.goto(`${BASE}/builder/new`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

console.log("  URL:", page.url());
console.log("  Title:", await page.title());

// Look at the initial DOM
const initialDom = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input")).map((i) => ({
    type: i.type,
    name: i.name,
    id: i.id,
    placeholder: i.placeholder,
    value: i.value,
  }));
  const buttons = Array.from(document.querySelectorAll("button")).map((b) => ({
    text: (b.textContent || "").trim().slice(0, 80),
    type: b.type,
    disabled: b.disabled,
  }));
  return { inputs: inputs.slice(0, 25), buttons: buttons.slice(0, 25) };
});
console.log("  inputs:", JSON.stringify(initialDom.inputs, null, 2));
console.log("  buttons:", JSON.stringify(initialDom.buttons, null, 2));

await page.screenshot({ path: `${OUT}/diag-01-initial.png`, fullPage: true });
console.log("  saved diag-01-initial.png");

// Look for name input — try several selectors
const nameSelectors = [
  'input[placeholder*="ame" i]',
  'input[name="name"]',
  'input[id*="name" i]',
  'input[type="text"]',
];
let nameFilled = false;
for (const sel of nameSelectors) {
  const c = await page.locator(sel).count();
  if (c > 0) {
    console.log(`  trying selector: ${sel} (count=${c})`);
    try {
      await page.locator(sel).first().fill("TestChar");
      nameFilled = true;
      console.log(`  filled name via ${sel}`);
      break;
    } catch (e) {
      console.log(`  fill failed: ${e.message}`);
    }
  }
}
if (!nameFilled) {
  console.log("  ! could not find a name input to fill");
}

// Look for level/number inputs
const numberInputs = await page.locator('input[type="number"]').all();
console.log(`  number inputs: ${numberInputs.length}`);
for (let i = 0; i < Math.min(5, numberInputs.length); i++) {
  const val = await numberInputs[i].inputValue().catch(() => "");
  const ph = await numberInputs[i].getAttribute("placeholder").catch(() => "");
  const nm = await numberInputs[i].getAttribute("name").catch(() => "");
  console.log(`    [${i}] name="${nm}" placeholder="${ph}" value="${val}"`);
}

await page.screenshot({ path: `${OUT}/diag-02-filled.png`, fullPage: true });
console.log("  saved diag-02-filled.png");

console.log("=== STEP 2: Find 'Continue to Race' button ===");
// Re-query buttons to get current state
const buttonsAfter = await page.locator("button").all();
console.log(`  total buttons now: ${buttonsAfter.length}`);
let continueBtnIdx = -1;
for (let i = 0; i < buttonsAfter.length; i++) {
  const txt = (await buttonsAfter[i].textContent().catch(() => "")) || "";
  if (/continue/i.test(txt) && /race/i.test(txt)) {
    continueBtnIdx = i;
    console.log(`  FOUND continue-to-race button at index ${i}: "${txt.trim().slice(0, 80)}"`);
    break;
  }
}
if (continueBtnIdx === -1) {
  // List all buttons
  for (let i = 0; i < buttonsAfter.length; i++) {
    const txt = (await buttonsAfter[i].textContent().catch(() => "")) || "";
    if (txt && txt.trim()) console.log(`    [${i}] "${txt.trim().slice(0, 60)}"`);
  }
  console.log("  ! could not find continue-to-race button");
  await browser.close();
  process.exit(1);
}

const continueBtn = buttonsAfter[continueBtnIdx];
const isDisabled = await continueBtn.isDisabled();
console.log(`  button disabled? ${isDisabled}`);
if (isDisabled) {
  console.log("  ! button is disabled — canAdvance failed. Reading console for clues.");
  await browser.close();
  process.exit(2);
}

console.log("=== STEP 3: Click Continue to Race ===");
const urlBefore = page.url();
const navCountBefore = navigationCount;
const netCountBefore = network.length;

await continueBtn.click();
console.log("  clicked");

// Wait for any change
await page.waitForTimeout(500);
console.log(`  URL after 500ms: ${page.url()}`);
console.log(`  nav count change: ${navigationCount - navCountBefore}`);

await page.waitForTimeout(1500);
console.log(`  URL after 2s: ${page.url()}`);
console.log(`  nav count change: ${navigationCount - navCountBefore}`);

await page.waitForTimeout(2000);
console.log(`  URL after 4s: ${page.url()}`);
console.log(`  nav count change: ${navigationCount - navCountBefore}`);

await page.screenshot({ path: `${OUT}/diag-03-after-click.png`, fullPage: true });
console.log("  saved diag-03-after-click.png");

// What does the DOM look like now?
const afterDom = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button")).map((b) => ({
    text: (b.textContent || "").trim().slice(0, 80),
    type: b.type,
    disabled: b.disabled,
  }));
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4")).map((h) =>
    (h.textContent || "").trim().slice(0, 80),
  );
  return { buttons: buttons.slice(0, 30), headings: headings.slice(0, 15) };
});
console.log("  headings after click:", JSON.stringify(afterDom.headings, null, 2));
console.log("  buttons after click:", JSON.stringify(afterDom.buttons, null, 2));

// Save everything
await writeFile(`${OUT}/diag-console.json`, JSON.stringify(consoleMsgs, null, 2));
await writeFile(`${OUT}/diag-pageerrors.json`, JSON.stringify(pageErrors, null, 2));
await writeFile(`${OUT}/diag-network.json`, JSON.stringify(network, null, 2));

console.log("\n=== SUMMARY ===");
console.log("console messages:", consoleMsgs.length);
console.log("page errors:", pageErrors.length);
console.log("network requests captured:", network.length);
console.log("navigations:", navigationCount);
console.log("URL change:", urlBefore, "->", page.url());

if (pageErrors.length > 0) {
  console.log("\n--- PAGE ERRORS ---");
  for (const e of pageErrors) console.log(JSON.stringify(e, null, 2));
}
if (consoleMsgs.length > 0) {
  console.log("\n--- CONSOLE ---");
  for (const m of consoleMsgs.slice(0, 30)) console.log(`[${m.type}] ${m.text.slice(0, 300)}`);
}

await browser.close();
console.log("\ndone");
