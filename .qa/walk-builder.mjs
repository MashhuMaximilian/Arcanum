// Walk through /builder/new to create a wizard character, then export PDF
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") {
    const txt = msg.text();
    if (!txt.includes("Failed to load resource") && !txt.includes("favicon")) {
      console.log(`[${t}] ${txt.slice(0, 200)}`);
    }
  }
});
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message.slice(0, 300)}`));

console.log("→ goto /builder/new");
await page.goto("http://localhost:3000/builder/new", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/Users/max/dev/Arcanum/.qa/walk-01-initial.png", fullPage: true });
console.log("  saved walk-01-initial.png");

// Look for the Step 1 'Frame' inputs
const html1 = await page.content();
const hasNameInput = html1.includes('placeholder="Character name"') || html1.includes("name") || html1.includes("Name");
console.log(`  has name input: ${hasNameInput}`);

// Try to find an input field
const inputs = await page.locator("input").all().catch(() => []);
console.log(`  inputs found: ${inputs.length}`);
for (let i = 0; i < Math.min(5, inputs.length); i++) {
  const ph = await inputs[i].getAttribute("placeholder").catch(() => "");
  const name = await inputs[i].getAttribute("name").catch(() => "");
  console.log(`    [${i}] placeholder="${ph}" name="${name}"`);
}

// Get all buttons
const buttons = await page.locator("button").all().catch(() => []);
console.log(`  buttons found: ${buttons.length}`);
for (let i = 0; i < Math.min(15, buttons.length); i++) {
  const txt = await buttons[i].textContent().catch(() => "");
  if (txt && txt.trim()) console.log(`    [${i}] "${txt.trim().slice(0, 60)}"`);
}

await browser.close();
console.log("done");
