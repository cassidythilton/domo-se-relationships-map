// Captures PNG previews of mocks/shape-a.html so we can view them inline.
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "shots");
mkdirSync(OUT, { recursive: true });
const HTML = resolve(__dirname, "shape-a.html");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1620, height: 1100 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(`file://${HTML}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const states = [
  { id: "state-1", file: "shape-a-1-overview.png" },
  { id: "state-2", file: "shape-a-2-sa-centric.png" },
  { id: "state-3", file: "shape-a-3-bench.png" },
  { id: "state-4", file: "shape-a-4-discrepancies.png" },
  { id: "state-5", file: "shape-a-5-panel3-fanout.png" },
  { id: "state-6", file: "shape-a-6-panel3-modes.png" },
];

for (const s of states) {
  const el = await page.$(`#${s.id}`);
  if (!el) {
    console.warn(`missing: ${s.id}`);
    continue;
  }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: resolve(OUT, s.file) });
  console.log(`captured ${s.file}`);
}

await browser.close();
console.log("done");
