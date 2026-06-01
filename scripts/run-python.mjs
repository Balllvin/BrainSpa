#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';

const minimum = { major: 3, minor: 11 };
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-python.mjs <python args...>');
  process.exit(2);
}

const requested = [process.env.PYTHON_BIN, process.env.PYTHON].filter(Boolean);
const candidates = [
  ...requested,
  'python',
  'python3',
  'python3.14',
  'python3.13',
  'python3.12',
  'python3.11',
];

function parseVersion(output) {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function isSupported(version) {
  return (
    version.major > minimum.major ||
    (version.major === minimum.major && version.minor >= minimum.minor)
  );
}

function inspectPython(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  if (!version || !isSupported(version)) return null;
  return { command, version };
}

const seen = new Set();
let selected = null;
for (const candidate of candidates) {
  if (seen.has(candidate)) continue;
  seen.add(candidate);
  selected = inspectPython(candidate);
  if (selected) break;
}

if (!selected) {
  console.error('Brain Spa needs Python 3.11 or newer. Set PYTHON_BIN=/path/to/python3.11+ or install Python 3.11+.');
  process.exit(1);
}

const child = spawn(selected.command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Python process terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
