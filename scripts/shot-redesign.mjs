// Verify the new compact SE manager cards + manager-mode Panel 2.
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const OUT = resolve("scripts/shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 980 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Default: no selection
await page.screenshot({ path: resolve(OUT, "redesign-default.png"), fullPage: false });
console.log("captured redesign-default");

// Click an SE manager card to enter team-roster mode in Panel 2
await page.locator('.ovr-mgr-card .ovr-mgr-head').nth(1).click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "redesign-mgr.png"), fullPage: false });
console.log("captured redesign-mgr");

// Then click an SE chip from within Panel 1 (should reframe Panel 2 to matrix)
await page.locator('.ovr-init-chip').first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "redesign-chip.png"), fullPage: false });
console.log("captured redesign-chip");

// Reset and click an RVP head in Panel 2 (should switch to RVP roster)
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.locator('.ovr-se-grid-head').first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "redesign-rvp.png"), fullPage: false });
console.log("captured redesign-rvp");

// Panel 1 close-up
const p1 = page.locator(".overview-panel-ribbon").first();
await p1.screenshot({ path: resolve(OUT, "redesign-p1.png") }).catch(() => {});

// Panel 2 close-up (current is RVP roster)
const p2 = page.locator(".overview-panel-se").first();
await p2.screenshot({ path: resolve(OUT, "redesign-p2-rvp.png") }).catch(() => {});

await browser.close();
console.log("done");
