#!/usr/bin/env node

/**
 * Type check the repository.
 *
 *   npm run typecheck          the JavaScript-API compiler   (typescript 6.x)
 *   npm run typecheck:native   the native compiler, tsgo    (typescript 7.x)
 *
 * Both run in CI, and neither is redundant. The API compiler's answer is the
 * one that gates the typed lint rules, the i18n extractor and the production
 * build; the native compiler's answer is the one the project is being migrated
 * onto. Running both means "a type TS 7 rejects and TS 6 accepts" (or the
 * reverse) is a red step today rather than a surprise on the day the linter can
 * consume the native API.
 *
 * `scripts/compilers.mjs` explains why those are two packages and not one.
 * Each run prints the package and version it used, so a CI log says which
 * compiler answered rather than leaving it to be inferred.
 */

import { spawnSync } from 'node:child_process';
import { compiler } from './compilers.mjs';

const slot = process.argv.includes('--native') ? 'native' : 'api';
const ts = compiler(slot);

console.log(`Type checking with ${ts.label} — ${ts.package} ${ts.version}`);

const { status, error } = spawnSync(process.execPath, [ts.file, '--noEmit'], { stdio: 'inherit' });
if (error) throw error;
if (status !== 0) process.exit(status ?? 1);

console.log(`${ts.label} reports no type errors.`);
