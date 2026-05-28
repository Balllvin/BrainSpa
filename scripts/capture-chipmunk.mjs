import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../output/playwright");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5173/chipmunk", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, "chipmunk-idle.png"), fullPage: true });
await page.getByRole("button", { name: /Activate Chipmunk/i }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, "chipmunk-active.png"), fullPage: true });
const hint = await page.locator(".chipmunk-hint").textContent();
console.log("hint after click:", hint?.trim());
await browser.close();
