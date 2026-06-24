// Quick test: screenshot /builder/new to see the current state
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    console.log(`[${msg.type()}] ${msg.text()}`);
  }
});

await page.goto("http://localhost:3000/builder/new", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: "/Users/max/dev/Arcanum/.qa/builder-new-current.png", fullPage: true });
console.log("Screenshot saved to /Users/max/dev/Arcanum/.qa/builder-new-current.png");

await browser.close();
