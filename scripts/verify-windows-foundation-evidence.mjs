#!/usr/bin/env node
/**
 * Validates a Sornio Windows Foundation acceptance record.
 *
 * This gate exists so that a Windows acceptance claim cannot be manufactured:
 * it refuses a record unless every required gate was actually executed and
 * passed, every BLOCKED gate says why, the financial snapshot proves the
 * schema-12 -> 13 upgrade changed no money, and the commit SHA matches the
 * code actually checked out here.
 *
 * It deliberately does NOT validate screenshots (no pixels are inspected) —
 * `apps/desktop/check-windows-evidence.py` owns that on the runner. This gate
 * owns the *structure and honesty* of the record.
 *
 * Usage:
 *   node scripts/verify-windows-foundation-evidence.mjs --record path/to/record.json
 *   node scripts/verify-windows-foundation-evidence.mjs --schema-only
 *
 * Exit codes: 0 valid, 1 invalid, 2 usage/missing file.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = [
  'W-01-installation',
  'W-02-webview2',
  'W-03-startup-shutdown',
  'W-04-sqlcipher-init',
  'W-05-schema-upgrade',
  'W-06-offline-billing',
  'W-07-offline-inventory',
  'W-08-recovery',
  'W-09-restart',
  'W-10-backup-restore',
  'W-11-install-uninstall',
  'W-12-ntfs-acls',
  'H-13-barcode-scanner',
  'H-14-thermal-printer',
  'H-15-cash-drawer',
];
const HARDWARE = {
  'H-13-barcode-scanner': 'barcodeScanner',
  'H-14-thermal-printer': 'thermalPrinter',
  'H-15-cash-drawer': 'cashDrawer',
};
const STATES = new Set(['passed', 'failed', 'not-run', 'blocked']);
const ALLOWED_TOP = new Set([
  'milestone', 'commitSha', 'recordedAt', 'recordedBy', 'environment',
  'installer', 'gates', 'hardwareClaimed', 'financialParity', 'nonClaims',
]);

const failures = [];
const fail = (message) => failures.push(message);
const section = (name) => console.log(`\n${name}`);

const args = process.argv.slice(2);
const recordIndex = args.indexOf('--record');
const schemaOnly = args.includes('--schema-only');

section('Windows Foundation acceptance evidence');

let schema;
try {
  schema = JSON.parse(readFileSync(join(root, 'docs/windows/foundation-acceptance.schema.json'), 'utf8'));
  if (schema.title !== 'Sornio Windows Foundation acceptance record') {
    throw new Error('unexpected schema title');
  }
  console.log('  ok    acceptance schema parses and is the expected document');
} catch (error) {
  fail(`acceptance schema is missing or malformed: ${error.message}`);
}

if (schemaOnly) {
  // The milestone template must name hardware as blocked, never as passed.
  try {
    const example = JSON.parse(readFileSync(join(root, 'docs/windows/foundation-acceptance.example.json'), 'utf8'));
    for (const gate of Object.keys(HARDWARE)) {
      if (example.gates?.[gate]?.state !== 'blocked') {
        fail(`the shipped example must keep ${gate} 'blocked', found '${example.gates?.[gate]?.state}'`);
      }
    }
    if (Object.values(example.hardwareClaimed ?? {}).some(Boolean)) {
      fail('the shipped example must not claim any hardware');
    }
    if (!failures.length) console.log('  ok    the example record claims no hardware and blocks the hardware gates');
  } catch (error) {
    fail(`example record is missing or malformed: ${error.message}`);
  }

  section('Windows Foundation acceptance package template');
  try {
    const doc = readFileSync(join(root, 'docs/windows/foundation-acceptance.md'), 'utf8');
    for (const gate of REQUIRED) {
      if (!doc.includes(gate)) fail(`the procedure does not document gate ${gate}`);
    }
    if (!/cannot pass without a physical Windows workstation/i.test(doc)) {
      fail('the procedure must state that the package cannot pass without a physical Windows workstation');
    }
    if (!/does not/i.test(doc)) fail('the procedure must carry its non-claims');
    if (!failures.length) console.log(`  ok    the procedure documents all ${REQUIRED.length} gates and its non-claims`);
  } catch (error) {
    fail(`procedure document is missing: ${error.message}`);
  }

  if (failures.length) {
    console.log('\nWindows Foundation acceptance package: FAILED');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log('\nWindows Foundation acceptance package: valid (this is a TEMPLATE check, not a Windows pass)');
  process.exit(0);
}

if (recordIndex === -1) {
  console.error('usage: node scripts/verify-windows-foundation-evidence.mjs --record <file> | --schema-only');
  process.exit(2);
}
const path = resolve(args[recordIndex + 1] ?? '');
let record;
try {
  record = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`cannot read record ${path}: ${error.message}`);
  process.exit(2);
}

section('Document shape');
if (record.milestone !== 'foundation') fail("milestone must be 'foundation'");
for (const key of Object.keys(record)) {
  if (!ALLOWED_TOP.has(key)) fail(`unexpected top-level field '${key}'`);
}
for (const key of ALLOWED_TOP) {
  if (!(key in record)) fail(`missing top-level field '${key}'`);
}
if (failures.length === 0) console.log('  ok    top-level fields match the schema');

section('Provenance');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(record.commitSha ?? '')) {
  fail('commitSha must be a 40-character hex SHA');
} else if (record.commitSha !== head) {
  fail(`commitSha ${record.commitSha} does not match the checked-out HEAD ${head}`);
}
if (!/^[0-9a-f]{40}$/.test(record.commitSha ?? '') && /^0+$/.test(record.commitSha ?? 'x')) {
  fail('commitSha is a placeholder; record the real commit under test');
}
for (const field of ['sha256', 'installedExeSha256']) {
  const value = record.installer?.[field] ?? '';
  if (!/^[0-9a-f]{64}$/.test(value)) fail(`installer.${field} must be a 64-character hex SHA-256`);
  else if (/^0+$/.test(value)) fail(`installer.${field} is a placeholder hash, not a measurement`);
}
if (!record.installer?.fileName) fail('installer.fileName is required');
if (!record.installer?.signatureStatus) fail('installer.signatureStatus is required (record what you saw)');
if (/^REPLACE/i.test(String(record.recordedBy ?? ''))) fail('recordedBy is still the template placeholder');
if (!record.environment?.windowsBuild) fail('environment.windowsBuild is required (from winver)');
if (!(record.environment?.schemaBefore < record.environment?.schemaAfter)) {
  fail('environment.schemaBefore must be lower than schemaAfter for an upgrade record');
}
if (failures.length === 0) console.log('  ok    commit, installer hashes and environment are real values');

section('Gate states');
const gates = record.gates ?? {};
for (const gate of REQUIRED) {
  const entry = gates[gate];
  if (!entry) {
    fail(`${gate} is missing from the record`);
    continue;
  }
  if (!STATES.has(entry.state)) {
    fail(`${gate} has an unknown state '${entry.state}'`);
    continue;
  }
  if (entry.state === 'blocked' && !(typeof entry.reason === 'string' && entry.reason.trim().length >= 8)) {
    fail(`${gate} is blocked without a reason`);
  }
  if (entry.state === 'passed' && !(Array.isArray(entry.evidence) && entry.evidence.length > 0)) {
    fail(`${gate} is marked passed with no evidence attached`);
  }
  if (entry.state === 'not-run') fail(`${gate} was never run; a record with un-run gates cannot pass`);
  if (entry.state === 'failed') fail(`${gate} FAILED — the milestone is not met`);
}
const unknown = Object.keys(gates).filter((gate) => !REQUIRED.includes(gate));
if (unknown.length) fail(`record contains unknown gates: ${unknown.join(', ')}`);

section('Hardware honesty');
for (const [gate, field] of Object.entries(HARDWARE)) {
  const claimed = record.hardwareClaimed?.[field];
  const state = gates[gate]?.state;
  if (claimed === true && state !== 'passed') {
    fail(`hardwareClaimed.${field} is true but ${gate} is '${state}' — a claim needs an executed gate`);
  }
  if (claimed === false && state === 'passed') {
    fail(`hardwareClaimed.${field} is false but ${gate} passed — mark the claim true`);
  }
  if (state === 'passed' && gates[gate]?.evidence?.length === 0) {
    fail(`${gate} passed without evidence`);
  }
}
if (failures.length === 0) console.log('  ok    hardware claims agree with the hardware gates');

section('Financial parity across the schema upgrade');
const before = record.financialParity?.before;
const after = record.financialParity?.after;
if (!before || !after) {
  fail('financialParity.before/after are required: the schema-12 -> 13 upgrade must prove no money moved');
} else {
  for (const field of ['cashPaise', 'customerOutstandingPaise', 'lastInvoiceNumber']) {
    if (before[field] !== after[field]) {
      fail(`financialParity.${field} changed across the upgrade (${before[field]} -> ${after[field]})`);
    }
  }
  const products = new Set([...Object.keys(before.stockMilli ?? {}), ...Object.keys(after.stockMilli ?? {})]);
  for (const product of products) {
    const b = before.stockMilli?.[product];
    const a = after.stockMilli?.[product];
    if (b !== a) fail(`stock for ${product} changed across the upgrade (${b} -> ${a})`);
  }
  if (!products.size) fail('financialParity.stockMilli must record at least one product');
  if (failures.length === 0) console.log('  ok    cash, outstanding, stock and invoice number are unchanged by the upgrade');
}

section('Non-claims');
if (!Array.isArray(record.nonClaims) || record.nonClaims.length === 0) {
  fail('nonClaims must state what the record does not establish');
} else if (!record.nonClaims.some((claim) => /sign/i.test(claim))) {
  fail('nonClaims must disclose that the build is not a signed consumer release');
}

console.log('');
if (failures.length) {
  console.log('Windows Foundation acceptance: FAILED');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('Windows Foundation acceptance: VALID — every required gate passed on the recorded workstation');
