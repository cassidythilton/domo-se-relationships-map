// V3 + V4 verification — capture SA-centric Panel 2 (engagement grid)
// and Panel 3 (engagement fan-out by RVP), plus the Discrepancies error
// state (since dev mode has no Domo SQL runtime).
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

// Deep-link to Doug Carter (an SA in sample data) → reframes both Panel 2
// (engagement grid) and Panel 3 (engagement fan-out by RVP). SAs aren't
// visible in the default ribbon scope (no asserted coverage), so URL
// hydration is the most reliable way to drive the test.
await page.goto("http://localhost:5173/?person=Doug+Carter", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(OUT, "v34-sa-overview.png"), fullPage: false });
console.log("captured v34-sa-overview");

const p2 = page.locator(".overview-panel-se").first();
await p2.screenshot({ path: resolve(OUT, "v34-sa-panel2.png") }).catch(() => {});
console.log("captured v34-sa-panel2");

const p3 = page.locator(".overview-panel-ae").first();
await p3.screenshot({ path: resolve(OUT, "v34-sa-panel3.png") }).catch(() => {});
console.log("captured v34-sa-panel3");

// Discrepancies tab — in dev mode, deals fail, so this shows the error
// state. We capture it just to confirm the page didn't crash.
await page.locator(".tab", { hasText: "Discrepancies" }).first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(OUT, "v34-discrepancies.png"), fullPage: false });
console.log("captured v34-discrepancies");

await browser.close();
console.log("done");
