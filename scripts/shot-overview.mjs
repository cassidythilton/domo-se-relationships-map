// Quick targeted screenshot of the Overview, with and without filters,
// to verify the gauge + filter wiring matches the mock.
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
await page.waitForTimeout(1200);

// 0. Open the filter rail (it's collapsed by default)
await page.getByRole("button", { name: /Filters/i }).first().click().catch(() => {});
await page.waitForTimeout(400);

// 1. Default Overview (rail open, no filters set)
await page.screenshot({ path: resolve(OUT, "overview-default.png"), fullPage: true });
console.log("captured overview-default");

// 2. Apply Corp NL segment filter
await page.locator('.filter-rail .filter-chip:has-text("Corp NL")').first().click({ timeout: 2000 }).catch((e) => console.log("err corpnl", e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "overview-filter-corpnl.png"), fullPage: true });
console.log("captured overview-filter-corpnl");

// 3. Add New Logo role-type
await page.locator('.filter-rail .filter-chip:has-text("New Logo")').first().click({ timeout: 2000 }).catch((e) => console.log("err nl", e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "overview-filter-newlogo.png"), fullPage: true });
console.log("captured overview-filter-newlogo");

// 4. Reset filters
await page.locator('.filter-clear').first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(500);

// 5. Click an SE node in Panel 1 to trigger linked selection (in place)
await page.locator('.ovr-ribbon-col-se .ovr-ribbon-node').nth(1).click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "overview-se-selected.png"), fullPage: true });
console.log("captured overview-se-selected");

// 6. Zoom in on the load gauge in Panel 2
const gauge = page.locator('.ovr-se-load').first();
await gauge.screenshot({ path: resolve(OUT, "overview-gauge.png") }).catch(() => {});
console.log("captured overview-gauge");

await browser.close();
console.log("done");
