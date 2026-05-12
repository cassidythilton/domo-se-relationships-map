// Verify Panel 1 auto-focuses when an SE / AE is selected.
import { chromium } from "playwright";
import { resolve } from "node:path";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 980 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: resolve("scripts/shots/autofocus-default.png"), fullPage: false });

// Click an SE chip (Dan Gouveia is in Chris Hunter's group, 3rd manager card)
await page.locator('.ovr-mgr-card').nth(2).locator('.ovr-init-chip').first().click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: resolve("scripts/shots/autofocus-se.png"), fullPage: false });
console.log("captured autofocus-se");

// Reset and click an AE in panel 1 sales side
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-ribbon-col-sales .ovr-ribbon-node-ae').nth(0).click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: resolve("scripts/shots/autofocus-ae.png"), fullPage: false });
console.log("captured autofocus-ae");

// Reset, click an RVP head in panel 2
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-se-grid-head').first().click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: resolve("scripts/shots/autofocus-rvp.png"), fullPage: false });
console.log("captured autofocus-rvp");

await browser.close();
console.log("done");
