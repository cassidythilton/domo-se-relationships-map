// Verify clicks in Overview keep the user on Full org (not navigate to Focus).
import { chromium } from "playwright";
import { resolve } from "node:path";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 980 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 1. Click an SE in Panel 1's SE side
await page.locator('.ovr-ribbon-col-se .ovr-ribbon-node').nth(2).click().catch(() => {});
await page.waitForTimeout(400);
let active = await page.locator('.lens-tab-active').first().textContent();
console.log("After SE click, active tab:", active);
await page.screenshot({ path: resolve("scripts/shots/click-se-stays.png") });

// 2. Reset selection and click an SE manager group head
await page.locator('button[title*="Selected"], .selection-pill button').first().click().catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-ribbon-col-se .ovr-ribbon-group-head').nth(1).click().catch(() => {});
await page.waitForTimeout(400);
active = await page.locator('.lens-tab-active').first().textContent();
console.log("After SE manager group click, active tab:", active);
await page.screenshot({ path: resolve("scripts/shots/click-mgr-stays.png") });

// 3. Reset and click an RVP head in Panel 2
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-se-grid-head').first().click().catch(() => {});
await page.waitForTimeout(400);
active = await page.locator('.lens-tab-active').first().textContent();
console.log("After RVP head click, active tab:", active);
await page.screenshot({ path: resolve("scripts/shots/click-rvp-stays.png") });

// 4. Reset and click an AE node in Panel 1's sales side
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-ribbon-col-sales .ovr-ribbon-node-ae').nth(2).click().catch(() => {});
await page.waitForTimeout(400);
active = await page.locator('.lens-tab-active').first().textContent();
console.log("After AE click, active tab:", active);
await page.screenshot({ path: resolve("scripts/shots/click-ae-stays.png") });

// 5. Click a chain pill in Panel 3 (e.g. Cassidy)
await page.locator('.ovr-ae-pill').first().click().catch(() => {});
await page.waitForTimeout(400);
active = await page.locator('.lens-tab-active').first().textContent();
console.log("After P3 chain click, active tab:", active);
await page.screenshot({ path: resolve("scripts/shots/click-p3-stays.png") });

await browser.close();
console.log("done");
