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

// Default view: shoot Panel 3
const panel3 = page.locator(".overview-panel-ae").first();
await panel3.screenshot({ path: resolve("scripts/shots/panel3-default.png") }).catch((e) => console.log("err1", e.message));
console.log("captured panel3-default");

// Click an AE chip in Panel 1 to switch the AE
await page.locator('.ovr-ribbon-col-sales .ovr-ribbon-node-ae:has-text("Greg Olson")').first().click().catch(() => {});
await page.waitForTimeout(500);
await panel3.screenshot({ path: resolve("scripts/shots/panel3-greg.png") }).catch((e) => console.log("err2", e.message));
console.log("captured panel3-greg");

// Try one more AE - Patrick Rice (deep sales chain)
await page.locator('.ovr-ribbon-col-sales .ovr-ribbon-node-ae').nth(8).click().catch(() => {});
await page.waitForTimeout(500);
await panel3.screenshot({ path: resolve("scripts/shots/panel3-other.png") }).catch((e) => console.log("err3", e.message));
console.log("captured panel3-other");

await browser.close();
