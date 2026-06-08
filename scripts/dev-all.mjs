#!/usr/bin/env node
/**
 * Start Brain Spa API + Vite dev server together.
 * Reuses processes already listening on :8000 and :5173 when healthy.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_HEALTH = "http://127.0.0.1:8000/api/health";
const WEB_URL = "http://127.0.0.1:5173";

const env = {
  ...process.env,
  BRAIN_SPA_DISABLE_TELEGRAM_POLLING: process.env.BRAIN_SPA_DISABLE_TELEGRAM_POLLING ?? "1",
};

const children = [];

function spawnTracked(command, args, label) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${label}] stopped (${signal})`);
      shutdown(1);
      return;
    }
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

async function waitForHealth(url, maxMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function shutdown(code = 0) {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(code), 100);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (await isReachable(API_HEALTH)) {
    console.log("API already running on http://127.0.0.1:8000");
  } else {
    console.log("Starting API on http://127.0.0.1:8000 …");
    spawnTracked("node", ["scripts/run-python.mjs", "-m", "apps.api.brainspa_api"], "api");
    if (!(await waitForHealth(API_HEALTH))) {
      console.error("API did not become healthy on port 8000.");
      shutdown(1);
      return;
    }
    console.log("API ready.");
  }

  if (await isReachable(WEB_URL)) {
    console.log(`Web UI already running at ${WEB_URL}`);
  } else {
    console.log(`Starting Vite on ${WEB_URL} …`);
    spawnTracked("npx", ["vite"], "web");
    if (!(await waitForHealth(`${WEB_URL}/`))) {
      console.error(
        "Vite did not start on port 5173. Another process may hold the port — stop it and run npm run start again.",
      );
      shutdown(1);
      return;
    }
    console.log("Web UI ready.");
  }

  console.log("");
  console.log("Brain Spa");
  console.log(`  Home:  ${WEB_URL}/`);
  console.log(`  Test:  ${WEB_URL}/test`);
  console.log(`  API:   http://127.0.0.1:8000/api/health`);
  console.log("");
  console.log("Press Ctrl+C to stop processes started by this command.");
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
