#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.error?.message || 'unknown git error';
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout;
};

const splitNul = (text) => text.split('\0').filter(Boolean);
const trackedFiles = splitNul(git(['ls-files', '-z']));
const candidateFiles = splitNul(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']));

const allowedEnvFiles = new Set(['.env.example']);
const rootRuntimePrefixes = [
  '.brain-spa/',
  '.brain-spa-runtime/',
  'artifacts/',
  'runtime/',
  'runs/',
  'outputs/',
  'generated/',
  'evidence/',
  'datasets/',
  'models/',
  'environments/',
  'personas/',
  'model-configs/',
  'adapters/',
  'checkpoints/',
  'transcripts/',
  'secrets/',
  'local-data/',
  'user-data/',
];
const blockedPathParts = [
  '/artifacts/',
  '/secrets/',
  '/checkpoints/',
  '/adapters/',
  '/runs/',
  '/outputs/',
  '/generated/',
];
const blockedBasenames = new Set([
  'telegram-bots.json',
  'local.env',
  'xai-api-key',
  'openai-api-key',
  'anthropic-api-key',
  'openrouter-api-key',
]);
const blockedExtensions = [
  '.jsonl',
  '.parquet',
  '.arrow',
  '.safetensors',
  '.gguf',
  '.pt',
  '.pth',
  '.ckpt',
  '.onnx',
  '.sqlite',
  '.sqlite3',
  '.db',
];
const binaryOrHugeExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.pdf', '.docx', '.pyc', '.mp3', '.mp4', '.ogg', '.wav', '.aiff', '.zip', '.tar', '.gz'
]);

const secretPatterns = [
  ['OpenAI-style API key', /sk-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{20,}/],
  ['xAI/OpenRouter-style API key', /\b(?:xai-|or-)[A-Za-z0-9_-]{20,}/i],
  ['Telegram bot token', /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const violations = [];

function extname(path) {
  const basename = path.split('/').pop() || path;
  const dot = basename.lastIndexOf('.');
  return dot >= 0 ? basename.slice(dot).toLowerCase() : '';
}

function basename(path) {
  return path.split('/').pop() || path;
}

function note(path, reason, scope = 'tracked') {
  violations.push({ path, reason, scope });
}

for (const path of candidateFiles) {
  const scope = trackedFiles.includes(path) ? 'tracked' : 'untracked-not-ignored';
  const name = basename(path);
  const ext = extname(path);

  if (path === '.env' || (path.startsWith('.env.') && !allowedEnvFiles.has(path))) {
    note(path, 'environment file must stay local; commit .env.example only', scope);
  }
  if (path.endsWith('.local') || path.includes('.local.')) {
    note(path, 'local override file must stay local', scope);
  }
  if (rootRuntimePrefixes.some((prefix) => path.startsWith(prefix))) {
    note(path, 'runtime/generated Brain Spa data must not live in the public shell repo', scope);
  }
  if (blockedPathParts.some((part) => path.includes(part))) {
    note(path, 'generated artifact/cache path must not be committed', scope);
  }
  if (blockedBasenames.has(name)) {
    note(path, 'secret/runtime credential filename must stay outside git', scope);
  }
  if (blockedExtensions.includes(ext)) {
    note(path, `${ext} files are treated as generated datasets/models/runtime state`, scope);
  }
}

for (const path of trackedFiles) {
  if (path.startsWith('node_modules/') || path.startsWith('dist/') || path.includes('/__pycache__/')) continue;
  if (binaryOrHugeExtensions.has(extname(path))) continue;
  let text;
  try {
    const raw = readFileSync(path);
    if (raw.includes(0)) continue;
    text = raw.toString('utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(line)) {
        violations.push({ path: `${path}:${index + 1}`, reason: label, scope: 'tracked-secret-scan' });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Public shell check failed. The GitHub repo must contain app shell/code/docs only, not Alvin runtime data, generated evidence, datasets, adapters, or secrets.');
  for (const item of violations) {
    console.error(`- ${item.path} [${item.scope}]: ${item.reason}`);
  }
  console.error('\nMove generated/personal data under ~/.brain-spa or another BRAIN_SPA_HOME outside this repository, then retry.');
  process.exit(1);
}

console.log(`Public shell check passed: ${trackedFiles.length} tracked files; no runtime artifacts, generated datasets/models, or high-confidence secrets detected.`);
