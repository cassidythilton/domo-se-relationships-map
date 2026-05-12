// Capture the Full org Panel 1 (now showing 'Solutions Architects' /
// 'SAs') and a Panel 2 SA-engagements view (header now says 'Solutions
// Architect: <name>').
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
await page.waitForTimeout(1200);

// Trigger Doug Carter via search-style URL nav (he's a sample SA).
await page.goto(
  "http://localhost:5173/#person=Doug+Carter",
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(OUT, "rename-overview-sa.png"), fullPage: false });
console.log("captured rename-overview-sa");

const p2 = page.locator(".overview-panel-se").first();
await p2.screenshot({ path: resolve(OUT, "rename-panel2-sa.png") }).catch(() => {});
console.log("captured rename-panel2-sa");

await browser.close();
