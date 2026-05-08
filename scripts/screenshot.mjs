// Capture a single screenshot of the running dev server using puppeteer
// (which is already shipped via @vitejs/plugin-react's transitive deps?
// fallback: try playwright). We'll prefer playwright/chromium since it's
// the more reliable headless browser.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.argv[2] || "http://localhost:5174/";
const OUT = resolve("scripts/shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`); });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const tabs = [
  { key: "scOrg",       label: "SC Org" },
  { key: "corpNL",      label: "Corp NL" },
  { key: "corpUpsell",  label: "Corp Upsell" },
  { key: "ent",         label: "ENT" },
  { key: "reverse",     label: "Reverse" },
  { key: "specialist",  label: "Specialist Map" },
  { key: "capacity",    label: "Capacity / Load" },
  { key: "roadmap",     label: "Roadmap" },
];

for (const tab of tabs) {
  await page.getByRole("tab", { name: tab.label }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${tab.key}.png`), fullPage: false });
  console.log("captured", tab.key);
}

// Density 3 on Corp NL
await page.getByRole("tab", { name: "Corp NL" }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /L3/ }).click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT, "corpNL-L3.png"), fullPage: false });

// Click first rep token to open drawer
await page.locator(".rep-token").first().click().catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(OUT, "drawer.png"), fullPage: false });

await browser.close();

if (errors.length) {
  console.log("\nERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exitCode = 1;
} else {
  console.log("\nNo console errors.");
}
