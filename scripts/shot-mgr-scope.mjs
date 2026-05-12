// Click an SE manager and verify Panel 1 narrows to that manager's book + Focus view shows only SE direct reports.
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

// Click Chris Hunter's manager card head (3rd SE-side card)
await page.locator('.ovr-mgr-card .ovr-mgr-head').nth(2).click().catch((e) => console.log("err mgr", e.message));
await page.waitForTimeout(600);
await page.screenshot({ path: resolve("scripts/shots/mgr-scoped-overview.png"), fullPage: false });
console.log("captured mgr-scoped-overview");

// Now jump to Focus tab to see manager focus
await page.getByRole("tab", { name: /Focus/i }).first().click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: resolve("scripts/shots/mgr-focus.png"), fullPage: false });
console.log("captured mgr-focus");

await browser.close();
console.log("done");
