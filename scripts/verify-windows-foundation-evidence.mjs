#!/usr/bin/env node
/**
 * Validates a Sornio Windows Foundation acceptance record.
 *
 * This gate exists so that a Windows acceptance claim cannot be manufactured.
 * It refuses a record unless:
 *
 *  - every foundation gate (W-01..W-12) was actually executed and passed;
 *  - `blocked` is used only for the hardware gates (H-13..H-15), because a
 *    blocked foundation gate means the foundation was not accepted;
 *  - the upgrade is specifically schema 12 -> 13, with financial figures that
 *    are integer-typed, complete, and unchanged;
 *  - the commit SHA and the installer hashes match reality, not a template;
 *  - the hardware claim flags agree with the hardware gate states.
 *
 * It deliberately does NOT validate screenshots (no pixels are inspected) —
 * `apps/desktop/check-windows-evidence.py` owns that on the runner. This gate
 * owns the *structure and honesty* of the record.
 *
 * A foundation record that validates is a FOUNDATION acceptance. It is never a
 * hardware acceptance: H-13..H-15 stay blocked and unclaimed.
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

/** Foundation gates. Every one of these must be `passed`; `blocked` is not a pass. */
const FOUNDATION = [
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
];
/** Hardware gates. These may be `blocked` - and then must never be claimed. */
const HARDWARE = {
  'H-13-barcode-scanner': 'barcodeScanner',
  'H-14-thermal-printer': 'thermalPrinter',
  'H-15-cash-drawer': 'cashDrawer',
};
const REQUIRED = [...FOUNDATION, ...Object.keys(HARDWARE)];
const STATES = new Set(['passed', 'failed', 'not-run', 'blocked']);
const ALLOWED_TOP = new Set([
  'milestone', 'commitSha', 'recordedAt', 'recordedBy', 'environment',
  'installer', 'gates', 'hardwareClaimed', 'financialParity', 'nonClaims',
]);
/** The upgrade this milestone is defined by. Anything else is a different record. */
const SCHEMA_BEFORE = 12;
const SCHEMA_AFTER = 13;
/** W-05 records stock for three products so a drift cannot hide in an unrecorded row. */
const MIN_STOCK_PRODUCTS = 3;

const failures = [];
const fail = (message) => failures.push(message);
const section = (name) => console.log(`\n${name}`);

const isInteger = (value) => typeof value === 'number' && Number.isInteger(value);
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFilledString = (value) => typeof value === 'string' && value.trim().length > 0;
const isPlaceholder = (value) => typeof value === 'string' && /\bREPLACE\b/i.test(value);
/** Evidence rows are file/transcript names: non-empty strings, never blank padding. */
const isEvidenceList = (value) =>
  Array.isArray(value) && value.every((item) => isFilledString(item));

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
  for (const gate of REQUIRED) {
    if (!schema.properties?.gates?.required?.includes(gate)) {
      fail(`the schema does not require gate ${gate}`);
    }
  }
  console.log('  ok    acceptance schema parses and is the expected document');
} catch (error) {
  fail(`acceptance schema is missing or malformed: ${error.message}`);
}

if (schemaOnly) {
  // The shipped template must never look like a half-finished acceptance, and
  // must never suggest that a blocked foundation gate is acceptable.
  try {
    const example = JSON.parse(readFileSync(join(root, 'docs/windows/foundation-acceptance.example.json'), 'utf8'));
    for (const gate of Object.keys(HARDWARE)) {
      if (example.gates?.[gate]?.state !== 'blocked') {
        fail(`the shipped example must keep ${gate} 'blocked', found '${example.gates?.[gate]?.state}'`);
      }
    }
    for (const gate of FOUNDATION) {
      const state = example.gates?.[gate]?.state;
      if (state === 'blocked') fail(`the shipped example must not model ${gate} as 'blocked'`);
      if (state === 'passed') fail(`the shipped example must not ship ${gate} as already 'passed'`);
    }
    if (Object.values(example.hardwareClaimed ?? {}).some(Boolean)) {
      fail('the shipped example must not claim any hardware');
    }
    if (example.environment?.schemaBefore !== SCHEMA_BEFORE || example.environment?.schemaAfter !== SCHEMA_AFTER) {
      fail(`the shipped example must model the ${SCHEMA_BEFORE} -> ${SCHEMA_AFTER} upgrade`);
    }
    if (!failures.length) {
      console.log('  ok    the example claims no hardware, blocks only the hardware gates, and models schema 12 -> 13');
    }
  } catch (error) {
    fail(`example record is missing or malformed: ${error.message}`);
  }

  section('Windows Foundation acceptance package template');
  try {
    const doc = readFileSync(join(root, 'docs/windows/foundation-acceptance.md'), 'utf8');
    for (const gate of REQUIRED) {
      if (!doc.includes(gate)) fail(`the procedure does not document gate ${gate}`);
    }
    // Prose checks run against a whitespace-flattened copy so that line wrapping
    // in the Markdown can never change whether the procedure says a thing.
    const flat = (text) => text.replace(/\s+/g, ' ');
    const prose = flat(doc);
    const requires = (pattern, message) => {
      if (!pattern.test(prose)) fail(message);
    };
    requires(
      /cannot pass without a physical Windows workstation/i,
      'the procedure must state that the package cannot pass without a physical Windows workstation',
    );
    requires(/does not/i, 'the procedure must carry its non-claims');
    requires(
      /reserved for the hardware gates/i,
      "the procedure must state that 'blocked' is reserved for the hardware gates",
    );
    requires(
      new RegExp(`schema[\\s-]?${SCHEMA_BEFORE} -> schema[\\s-]?${SCHEMA_AFTER}`, 'i'),
      `the procedure must name the schema-${SCHEMA_BEFORE} -> schema-${SCHEMA_AFTER} upgrade explicitly`,
    );
    requires(
      /(WebView2 Runtime|fallback path) cannot be exercised/i,
      'the procedure must state that W-02 cannot pass on a workstation that already has the WebView2 Runtime',
    );
    requires(
      /not a hardware acceptance/i,
      'the procedure must state that a foundation pass is not a hardware acceptance',
    );
    requires(
      /the three hardware gates remain blocked and unclaimed/i,
      'the procedure must state that the hardware gates remain blocked and unclaimed',
    );
    if (!failures.length) {
      console.log(`  ok    the procedure documents all ${REQUIRED.length} gates, the blocked policy and its non-claims`);
    }
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
if (isFilledString(record.recordedAt)) {
  const stamp = Date.parse(record.recordedAt);
  if (Number.isNaN(stamp)) fail(`recordedAt is not a parseable ISO-8601 timestamp: '${record.recordedAt}'`);
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(record.recordedAt)) {
    fail('recordedAt must be a full date-time (YYYY-MM-DDTHH:MM:SSZ), not a bare date');
  }
} else {
  fail('recordedAt must be a date-time string');
}
if (!isFilledString(record.recordedBy)) fail('recordedBy must be a non-empty string');
if (!isPlainObject(record.environment)) fail('environment must be an object');
if (!isPlainObject(record.installer)) fail('installer must be an object');
if (!isPlainObject(record.gates)) fail('gates must be an object');
if (!isPlainObject(record.hardwareClaimed)) fail('hardwareClaimed must be an object');
if (failures.length === 0) console.log('  ok    top-level fields match the schema and are the right types');

section('Provenance');
let head = null;
try {
  head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch (error) {
  fail(`cannot read the checked-out HEAD: ${error.message}`);
}
const sha = record.commitSha;
if (!/^[0-9a-f]{40}$/.test(String(sha ?? ''))) {
  fail('commitSha must be a 40-character hex SHA');
} else if (/^0+$/.test(String(sha))) {
  fail('commitSha is a placeholder; record the real commit under test');
} else if (head && sha !== head) {
  fail(`commitSha ${sha} does not match the checked-out HEAD ${head}`);
}
for (const field of ['sha256', 'installedExeSha256']) {
  const value = record.installer?.[field] ?? '';
  if (!/^[0-9a-f]{64}$/.test(String(value))) fail(`installer.${field} must be a 64-character hex SHA-256`);
  else if (/^0+$/.test(String(value))) fail(`installer.${field} is a placeholder hash, not a measurement`);
}
if (!isFilledString(record.installer?.fileName)) fail('installer.fileName is required');
if (!isFilledString(record.installer?.signatureStatus)) {
  fail('installer.signatureStatus is required (record what you saw)');
}
if (isPlaceholder(String(record.recordedBy ?? ''))) fail('recordedBy is still the template placeholder');
if (!isFilledString(record.environment?.windowsBuild)) fail('environment.windowsBuild is required (from winver)');
if (record.environment?.webview2 === 'present') {
  fail(
    'environment.webview2 is "present": W-02 (the offline-runtime fallback) cannot be exercised on this ' +
      'workstation, so the record cannot claim it',
  );
}
for (const [field, expected] of [['schemaBefore', SCHEMA_BEFORE], ['schemaAfter', SCHEMA_AFTER]]) {
  const value = record.environment?.[field];
  if (!isInteger(value)) fail(`environment.${field} must be an integer, found ${JSON.stringify(value)}`);
  else if (value !== expected) {
    fail(`environment.${field} must be ${expected}: this milestone is defined by the ${SCHEMA_BEFORE} -> ${SCHEMA_AFTER} upgrade`);
  }
}
if (isInteger(record.environment?.schemaBefore) && isInteger(record.environment?.schemaAfter)
  && record.environment.schemaBefore >= record.environment.schemaAfter) {
  fail('environment.schemaBefore must be lower than schemaAfter for an upgrade record');
}
if (record.environment?.ramGb !== undefined && !(typeof record.environment.ramGb === 'number' && record.environment.ramGb > 0)) {
  fail(`environment.ramGb must be a positive number, found ${JSON.stringify(record.environment.ramGb)}`);
}
if (failures.length === 0) console.log('  ok    commit, installer hashes, environment and the 12 -> 13 upgrade are real values');

section('Gate states');
const gates = record.gates ?? {};
for (const gate of REQUIRED) {
  const entry = gates[gate];
  if (!isPlainObject(entry)) {
    fail(`${gate} is missing from the record`);
    continue;
  }
  if (!STATES.has(entry.state)) {
    fail(`${gate} has an unknown state '${entry.state}'`);
    continue;
  }
  if (entry.evidence !== undefined && !isEvidenceList(entry.evidence)) {
    fail(`${gate}.evidence must be a list of non-empty file or transcript names`);
    continue;
  }
  const isHardwareGate = gate in HARDWARE;
  if (entry.state === 'blocked') {
    if (!isHardwareGate) {
      fail(
        `${gate} is 'blocked': a blocked foundation gate is not an acceptance — execute it on the ` +
          'workstation or do not record this milestone as met',
      );
      continue;
    }
    if (!(isFilledString(entry.reason) && entry.reason.trim().length >= 8)) {
      fail(`${gate} is blocked without a reason`);
    }
  }
  if (entry.state === 'passed' && !(Array.isArray(entry.evidence) && entry.evidence.length > 0)) {
    fail(`${gate} is marked passed with no evidence attached`);
  }
  if (entry.state === 'not-run') fail(`${gate} was never run; a record with un-run gates cannot pass`);
  if (entry.state === 'failed') fail(`${gate} FAILED — the milestone is not met`);
}
const unknown = Object.keys(gates).filter((gate) => !REQUIRED.includes(gate));
if (unknown.length) fail(`record contains unknown gates: ${unknown.join(', ')}`);
const foundationBlocked = FOUNDATION.filter((gate) => gates[gate]?.state === 'blocked');
if (foundationBlocked.length) {
  fail(`foundation gates cannot be blocked: ${foundationBlocked.join(', ')}`);
}
if (failures.length === 0) console.log('  ok    every foundation gate passed; only hardware gates may be blocked');

section('Hardware honesty');
for (const [gate, field] of Object.entries(HARDWARE)) {
  const claimed = record.hardwareClaimed?.[field];
  const state = gates[gate]?.state;
  if (typeof claimed !== 'boolean') {
    fail(`hardwareClaimed.${field} must be a boolean, found ${JSON.stringify(claimed)}`);
    continue;
  }
  if (claimed === true && state !== 'passed') {
    fail(`hardwareClaimed.${field} is true but ${gate} is '${state}' — a claim needs an executed gate`);
  }
  if (claimed === false && state === 'passed') {
    fail(`hardwareClaimed.${field} is false but ${gate} passed — mark the claim true`);
  }
  if (state === 'passed' && !(gates[gate]?.evidence?.length > 0)) {
    fail(`${gate} passed without evidence`);
  }
}
if (failures.length === 0) console.log('  ok    hardware claims agree with the hardware gates');

section('Financial parity across the schema upgrade');
const before = record.financialParity?.before;
const after = record.financialParity?.after;
if (!isPlainObject(before) || !isPlainObject(after)) {
  fail(`financialParity.before/after are required: the schema ${SCHEMA_BEFORE} -> ${SCHEMA_AFTER} upgrade must prove no money moved`);
} else {
  for (const field of ['cashPaise', 'customerOutstandingPaise']) {
    if (!isInteger(before[field])) fail(`financialParity.before.${field} must be an integer, found ${JSON.stringify(before[field])}`);
    if (!isInteger(after[field])) fail(`financialParity.after.${field} must be an integer, found ${JSON.stringify(after[field])}`);
    if (before[field] !== after[field]) {
      fail(`financialParity.${field} changed across the upgrade (${before[field]} -> ${after[field]})`);
    }
  }
  if (!isFilledString(before.lastInvoiceNumber) || isPlaceholder(before.lastInvoiceNumber)) {
    fail('financialParity.before.lastInvoiceNumber must be the real invoice number observed before the upgrade');
  }
  if (before.lastInvoiceNumber !== after.lastInvoiceNumber) {
    fail(`financialParity.lastInvoiceNumber changed across the upgrade (${before.lastInvoiceNumber} -> ${after.lastInvoiceNumber})`);
  }
  const beforeStock = before.stockMilli;
  const afterStock = after.stockMilli;
  if (!isPlainObject(beforeStock) || !isPlainObject(afterStock)) {
    fail('financialParity.before.stockMilli and after.stockMilli must be objects of product id -> milli-unit balance');
  } else {
    const beforeKeys = Object.keys(beforeStock).sort();
    const afterKeys = Object.keys(afterStock).sort();
    if (beforeKeys.length < MIN_STOCK_PRODUCTS) {
      fail(
        `financialParity.before.stockMilli records ${beforeKeys.length} product(s); record at least ` +
          `${MIN_STOCK_PRODUCTS} so drift cannot hide in an unrecorded row`,
      );
    }
    if (beforeKeys.join() !== afterKeys.join()) {
      fail(
        `financialParity stock snapshots record different products before (${beforeKeys.join(', ')}) and ` +
          `after (${afterKeys.join(', ')}) — the same products must be recorded on both sides`,
      );
    }
    for (const product of beforeKeys) {
      if (!isFilledString(product) || isPlaceholder(product)) {
        fail(`financialParity stock product id '${product}' is a placeholder, not a real product`);
        continue;
      }
      const b = beforeStock[product];
      const a = afterStock[product];
      if (!isInteger(b)) fail(`financialParity.before.stockMilli.${product} must be an integer, found ${JSON.stringify(b)}`);
      if (!isInteger(a)) fail(`financialParity.after.stockMilli.${product} must be an integer, found ${JSON.stringify(a)}`);
      if (b !== a) fail(`stock for ${product} changed across the upgrade (${b} -> ${a})`);
    }
  }
  if (failures.length === 0) console.log('  ok    cash, outstanding, stock and invoice number are integer-typed and unchanged by the upgrade');
}

section('Non-claims');
if (!isEvidenceList(record.nonClaims) || record.nonClaims.length === 0) {
  fail('nonClaims must be a list of statements describing what the record does not establish');
} else if (!record.nonClaims.some((claim) => /sign/i.test(claim))) {
  fail('nonClaims must disclose that the build is not a signed consumer release');
} else if (!record.nonClaims.some((claim) => /hardware/i.test(claim))) {
  fail('nonClaims must disclose that the hardware gates were not executed');
}

console.log('');
if (failures.length) {
  console.log('Windows Foundation acceptance: FAILED');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `Windows Foundation acceptance: VALID — foundation gates ${FOUNDATION[0]}..W-12 ` +
    `(${FOUNDATION.length} executed, all passed) on the recorded workstation.`,
);
console.log(
  '  This is a FOUNDATION acceptance, not a hardware acceptance: ' +
    `${Object.keys(HARDWARE).join(', ')} remain blocked and unclaimed.`,
);
