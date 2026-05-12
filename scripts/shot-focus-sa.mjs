// Capture Focus view for a Solutions Architect (Paul McCusker is one in
// the sample roster). Routes through the new FocusSa component.
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
await page.goto(
  "http://localhost:5173/#view=focus&person=Paul+McCusker",
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(OUT, "focus-sa.png"), fullPage: false });
console.log("captured focus-sa");
// Also full-page for the long fan-out section
await page.screenshot({ path: resolve(OUT, "focus-sa-full.png"), fullPage: true });
console.log("captured focus-sa-full");
await browser.close();
