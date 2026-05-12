import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: "scripts/shots/fullOrg.png", fullPage: false });
await browser.close();
console.log("saved");
