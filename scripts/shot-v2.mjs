// V2 verification — capture Panel 3 fan-out across selection types,
// plus PocMark glyphs on Panel 1 ribbon nodes and Panel 2 matrix cells.
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const OUT = resolve("scripts/shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1620, height: 1100 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Default Overview — auto-picked SE. Captures Panel 3 fan-out at N>1.
await page.screenshot({ path: resolve(OUT, "v2-overview-default.png"), fullPage: false });
console.log("captured v2-overview-default");

// Click an SE chip in Panel 1 → reframe.
await page
  .locator(".ovr-mgr-chips .ovr-init-chip")
  .nth(2)
  .click({ timeout: 2000 })
  .catch((e) => console.warn("click SE failed:", e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "v2-overview-se.png"), fullPage: false });
console.log("captured v2-overview-se");

// Zoom Panel 3.
const p3 = page.locator(".overview-panel-ae").first();
await p3.screenshot({ path: resolve(OUT, "v2-panel3-fanout.png") }).catch(() => {});
console.log("captured v2-panel3-fanout");

// Click an AE in matrix → reframe (Panel 3 should switch to N=1 mode).
await page
  .locator(".ovr-se-grid .ae-chip")
  .first()
  .click({ timeout: 2000 })
  .catch((e) => console.warn("click AE failed:", e.message));
await page.waitForTimeout(500);
await p3.screenshot({ path: resolve(OUT, "v2-panel3-fanout-n1.png") }).catch(() => {});
console.log("captured v2-panel3-fanout-n1");

// Click an RVP group head in Panel 1 → RVP-side fan-out (commercial chain).
await page
  .locator(".ovr-ribbon-group-head")
  .first()
  .click({ timeout: 2000 })
  .catch((e) => console.warn("click RVP failed:", e.message));
await page.waitForTimeout(500);
await p3.screenshot({ path: resolve(OUT, "v2-panel3-fanout-rvp.png") }).catch(() => {});
console.log("captured v2-panel3-fanout-rvp");

// Click an SE manager card → manager fan-out (many AEs).
await page
  .locator(".ovr-mgr-head")
  .first()
  .click({ timeout: 2000 })
  .catch((e) => console.warn("click manager failed:", e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "v2-overview-manager.png"), fullPage: false });
console.log("captured v2-overview-manager");

await browser.close();
console.log("done");
