// Capture screenshots of the V1+V2 lenses against the running dev server.
// Run with `npm run dev` in another terminal first, then:
//   node scripts/screenshot.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.argv[2] || "http://localhost:5173/";
const OUT = resolve("scripts/shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 980 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

async function dismissAll() {
  await page.keyboard.press("Escape").catch(() => {});
  await page
    .locator(".drawer-overlay")
    .click({ force: true, timeout: 500 })
    .catch(() => {});
  await page.waitForTimeout(150);
}

const tabs = [
  { key: "fullOrg", label: "Full org" },
  { key: "focus-empty", label: "Focus" },
  { key: "corpNL", label: "Corp New Logo" },
  { key: "corpUpsell", label: "Corp Upsell" },
  { key: "ent", label: "Enterprise" },
  { key: "discrepancies", label: "Discrepancies" },
];

for (const tab of tabs) {
  await dismissAll();
  await page
    .getByRole("tab", { name: tab.label })
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, `${tab.key}.png`), fullPage: false });
  console.log("captured", tab.key);
}

// Click an SE in the matrix → Focus reframes
await dismissAll();
await page.getByRole("tab", { name: "Corp New Logo" }).first().click();
await page.waitForTimeout(500);
await page.locator(".matrix-row-head").first().click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT, "focus-se.png"), fullPage: false });

// Now click an AE chip somewhere — opens drawer
await dismissAll();
await page.getByRole("tab", { name: "Corp New Logo" }).first().click();
await page.waitForTimeout(400);
await page.locator(".ae-chip").first().click().catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(OUT, "drawer-ae.png"), fullPage: false });

// Open in Focus from drawer → AE-centric dual chain
await page.getByRole("button", { name: "Open in Focus" }).first().click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT, "focus-ae.png"), fullPage: false });

// Apply a filter and capture the ribbon hide-not-dim behavior
await dismissAll();
await page.getByRole("tab", { name: "Full org" }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Filters" }).first().click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('.filter-chip:has-text("ENT")').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT, "fullOrg-filtered.png"), fullPage: false });

await browser.close();

if (errors.length) {
  console.log("\nERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exitCode = 1;
} else {
  console.log("\nNo console errors.");
}
