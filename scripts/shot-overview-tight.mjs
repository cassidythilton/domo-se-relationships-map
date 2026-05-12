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

await page.screenshot({ path: resolve("scripts/shots/overview-tight-default.png"), fullPage: false });

const p2 = page.locator(".overview-panel-se").first();
await p2.screenshot({ path: resolve("scripts/shots/p2-default.png") });

const p3 = page.locator(".overview-panel-ae").first();
await p3.screenshot({ path: resolve("scripts/shots/p3-default.png") });

await browser.close();
console.log("done");
