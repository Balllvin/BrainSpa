/**
 * Smoke-test the ML Studio: catalog renders, a GridWorld + Q-learning run
 * launches, completes, and exposes a metric chart + result.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function shot(name) {
  const file = path.join(outDir, `studio-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("screenshot:", file);
}

console.log("Smoke base URL:", baseUrl);

await page.goto(`${baseUrl}/tune/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.getByText(/train anything/i).first().waitFor({ state: "visible", timeout: 15_000 });
const gridCard = page.locator("button.studio-card", { hasText: "GridWorld" }).first();
await gridCard.waitFor({ state: "visible", timeout: 15_000 });
await shot("home");

// Pick GridWorld + Tabular Q-learning for a fast deterministic run.
await gridCard.click();
await page.locator("button.studio-card", { hasText: "Tabular Q-learning" }).first().click();
const launch = page.getByRole("button", { name: /Train .* on GridWorld/ });
await launch.waitFor({ state: "visible", timeout: 10_000 });
await launch.click();

// We should land on the run detail page.
await page.waitForURL(/\/tune\/studio\/runs\/run-/, { timeout: 15_000 });
await page.getByText(/Run ·/).waitFor({ state: "visible", timeout: 10_000 });

// Wait for completion (status pill flips to complete).
await page.getByText(/complete/i).first().waitFor({ state: "visible", timeout: 60_000 });
await page.locator(".metric-chart").first().waitFor({ state: "visible", timeout: 10_000 });
await shot("run-complete");

// Run an inference rollout.
const runEpisode = page.getByRole("button", { name: /Run episode/i });
if (await runEpisode.isVisible()) {
  await runEpisode.click();
  await page.locator(".studio-result").waitFor({ state: "visible", timeout: 15_000 });
  await shot("rollout");
}

await browser.close();

if (errors.length) {
  console.error("Console errors:", errors);
  process.exit(1);
}
console.log("Studio smoke passed with no page errors.");
