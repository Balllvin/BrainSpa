/**
 * Smoke-test Snake RL surfaces: Test lab, Datasets rollout, Tune policy.
 * Requires: npm run start (default http://127.0.0.1:5173).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "../output/playwright");
const baseUrl = process.env.BRAIN_SPA_URL ?? "http://127.0.0.1:5173";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

async function shot(name) {
  const file = path.join(outDir, `snake-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("screenshot:", file);
}

async function goto(pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(800);
}

console.log("Smoke base URL:", baseUrl);

await goto("/test");
const snakeCard = page.getByRole("link", { name: /snake policy/i });
await snakeCard.waitFor({ state: "visible", timeout: 10_000 });
await shot("test-picker");

await goto("/test/snake");
const snakeScenario = page.getByRole("link", { name: /autonomous train/i });
await snakeScenario.waitFor({ state: "visible", timeout: 10_000 });
await shot("test-home");

await goto("/test/snake/autonomous-train");
await page.locator(".snake-lab-slot").first().waitFor({ state: "visible", timeout: 10_000 });
const boardCount = await page.locator(".snake-lab-slot").count();
if (boardCount !== 6) {
  throw new Error(`Expected 6 parallel boards, saw ${boardCount}`);
}
const runBtn = page.getByRole("button", { name: /^run$/i });
await runBtn.waitFor({ state: "visible", timeout: 10_000 });
await shot("train-lab-idle");
await runBtn.click();
await page.waitForTimeout(2500);
await shot("train-lab-running");
const stopBtn = page.getByRole("button", { name: /^stop$/i });
if (await stopBtn.isVisible()) {
  await stopBtn.click();
  await page.waitForTimeout(500);
}

await goto("/test/snake/autonomous-watch");
await page.locator(".snake-canvas").first().waitFor({ state: "visible", timeout: 10_000 });
await page.getByText(/policy plays/i).waitFor({ state: "visible", timeout: 10_000 });
await page.waitForTimeout(800);
await shot("watch");

await goto("/test/snake/human-play");
await page.locator(".snake-canvas").first().waitFor({ state: "visible", timeout: 10_000 });
await page.getByText(/arrow keys or wasd/i).waitFor({ state: "visible", timeout: 10_000 });
await shot("human-play");

await goto("/datasets/snake/rollout");
await shot("datasets-rollout");

await goto("/tune/snake");
await shot("tune-policy");

await browser.close();

if (errors.length) {
  console.error("Console errors:", errors);
  process.exit(1);
}

console.log("Snake smoke passed with no page errors.");
