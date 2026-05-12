// V1 verification — capture the new POC partner strip in PanelSeMatrix.
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

// Default lands on Full org with auto-picked SE → strip should render.
await page.screenshot({ path: resolve(OUT, "v1-overview-default.png"), fullPage: false });
console.log("captured v1-overview-default");

// Click an SE in Panel 1 (matrix-row chip) to verify reframe + strip update.
await page
  .locator(".ovr-mgr-chips .ovr-init-chip")
  .nth(2)
  .click({ timeout: 2000 })
  .catch((e) => console.warn("click SE failed:", e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(OUT, "v1-overview-se-selected.png"), fullPage: false });
console.log("captured v1-overview-se-selected");

// Zoom on Panel 2 to inspect the strip up close.
const p2 = page.locator(".overview-panel-se").first();
await p2.screenshot({ path: resolve(OUT, "v1-panel2-strip.png") }).catch(() => {});
console.log("captured v1-panel2-strip");

await browser.close();
console.log("done");
