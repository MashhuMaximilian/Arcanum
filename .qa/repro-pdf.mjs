// Quick repro: navigate the builder, create a multiclass character, export PDF, screenshot
import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") console.log(`[${t}] ${msg.text()}`);
});
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

console.log("→ goto /builder/new");
await page.goto("http://localhost:3000/builder/new", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "/Users/max/dev/Arcanum/.qa/repro-01-initial.png", fullPage: true });
console.log("  saved repro-01-initial.png");

// Check for steps UI
const stepCount = await page.locator("[data-step]").count().catch(() => 0);
console.log(`  steps found: ${stepCount}`);

// Try to find class picker
const classOptions = await page.locator("text=/Wizard|Sorcerer|Bard|Druid/").allTextContents().catch(() => []);
console.log(`  class labels found: ${classOptions.length} (${classOptions.slice(0, 5).join(", ")})`);

await browser.close();
console.log("done");
