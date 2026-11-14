#!/usr/bin/env node
/**
 * Builds the production iOS bundle the way the Release build does.
 *
 * Why this exists: the simulator jobs use a Debug build, where
 * `SKIP_BUNDLING=1` and the app waits for Metro. Nothing in CI was bundling
 * JavaScript, so a Release-only bundling failure was invisible until XCUITest
 * needed a self-contained app. It turned out to be real: Metro could not resolve
 * `expo-asset`, because the lockfile nested expo's runtime modules under
 * `node_modules/expo/` where the bundler cannot see them.
 *
 * A bundle that builds here is a prerequisite for any native UI acceptance.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sornio-bundle-')), 'main.jsbundle');

let failure = null;
let modules = null;
try {
  const log = execFileSync(
    'npx',
    [
      'expo', 'export:embed',
      '--platform', 'ios',
      '--dev', 'false',
      '--bundle-output', out,
      '--entry-file', 'index.ts',
    ],
    { cwd: mobile, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000 },
  );
  const match = log.match(/\((\d+) modules\)/);
  modules = match ? Number(match[1]) : null;
} catch (error) {
  failure = String(error.stderr || error.stdout || error.message).slice(-1500);
}

if (failure) {
  console.error('iOS production bundle FAILED. XCUITest needs a self-contained app.\n');
  console.error(failure);
  process.exit(1);
}

const stat = fs.statSync(out);
fs.rmSync(path.dirname(out), { recursive: true, force: true });

if (!stat.size || stat.size < 100_000) {
  console.error(`Bundle is implausibly small (${stat.size} bytes); treating as failed.`);
  process.exit(1);
}
console.log(
  `iOS production bundle: ${modules ?? '?'} modules, ${stat.size} bytes, no Metro required at runtime.`,
);
