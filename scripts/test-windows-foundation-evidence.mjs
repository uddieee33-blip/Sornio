#!/usr/bin/env node
/**
 * Negative tests for scripts/verify-windows-foundation-evidence.mjs.
 *
 * A validator that only ever says "valid" is worse than none. Each case here
 * takes a well-formed record and breaks exactly one thing, asserting the gate
 * rejects it with a message naming that thing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gate = join(root, 'scripts/verify-windows-foundation-evidence.mjs');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'win-acceptance-'));

let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`  ok    ${label}`);
};

/** A record that SHOULD validate: everything passed, hardware honestly blocked. */
const validRecord = () => {
  const gates = {};
  const names = [
    'W-01-installation', 'W-02-webview2', 'W-03-startup-shutdown', 'W-04-sqlcipher-init',
    'W-05-schema-upgrade', 'W-06-offline-billing', 'W-07-offline-inventory', 'W-08-recovery',
    'W-09-restart', 'W-10-backup-restore', 'W-11-install-uninstall', 'W-12-ntfs-acls',
  ];
  for (const name of names) gates[name] = { state: 'passed', evidence: [`evidence/${name}.txt`] };
  gates['H-13-barcode-scanner'] = { state: 'blocked', evidence: [], reason: 'no scanner attached to the workstation' };
  gates['H-14-thermal-printer'] = { state: 'blocked', evidence: [], reason: 'no printer attached to the workstation' };
  gates['H-15-cash-drawer'] = { state: 'blocked', evidence: [], reason: 'no cash drawer attached to the workstation' };
  const snapshot = { cashPaise: 10164, customerOutstandingPaise: 463, stockMilli: { 'atta-001': 1500 }, lastInvoiceNumber: 'S-000000000042' };
  return {
    milestone: 'foundation',
    commitSha: head,
    recordedAt: '2026-11-27T10:00:00Z',
    recordedBy: 'Acceptance Tester',
    environment: {
      workstation: 'Dell OptiPlex 3000', windowsEdition: 'Windows 11 Pro', windowsBuild: '22631.4460',
      cpu: 'i5-12500', ramGb: 16, accountType: 'standard', webview2: 'absent',
      databasePath: 'C:\\Users\\tester\\AppData\\Local\\com.sornio.localreview\\sornio.db',
      schemaBefore: 12, schemaAfter: 13,
    },
    installer: {
      fileName: 'Sornio Local Review_0.3.0_x64-setup.exe',
      sha256: 'a'.repeat(64),
      installedExeSha256: 'b'.repeat(64),
      signatureStatus: 'unsigned',
    },
    gates,
    hardwareClaimed: { barcodeScanner: false, thermalPrinter: false, cashDrawer: false },
    financialParity: { before: snapshot, after: { ...snapshot, stockMilli: { ...snapshot.stockMilli } } },
    nonClaims: [
      'This record does not establish a signed consumer release; the build is an unsigned engineering build.',
      'This record covers one workstation only.',
    ],
  };
};

const run = (record) => {
  const path = join(dir, `record-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(record));
  try {
    const stdout = execFileSync(process.execPath, [gate, '--record', path], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

console.log('\nWindows Foundation acceptance validator');

const baseline = run(validRecord());
check(baseline.code === 0, 'a complete, honest record is accepted');
check(/VALID/.test(baseline.out), 'the accepted record reports VALID');

const cases = [
  ['a battery-typed scan does not pass the hardware gate', (r) => {
    r.gates['H-13-barcode-scanner'] = { state: 'blocked', evidence: [], reason: 'typed manually, not scanned' };
    r.hardwareClaimed.barcodeScanner = true;
  }, /hardwareClaimed\.barcodeScanner is true but H-13-barcode-scanner is 'blocked'/],
  ['claiming a gate passed with no evidence is refused', (r) => {
    r.gates['W-06-offline-billing'] = { state: 'passed', evidence: [] };
  }, /W-06-offline-billing is marked passed with no evidence/],
  ['an un-run gate blocks the record', (r) => {
    r.gates['W-05-schema-upgrade'] = { state: 'not-run', evidence: [] };
  }, /W-05-schema-upgrade was never run/],
  ['a failed gate blocks the record', (r) => {
    r.gates['W-08-recovery'] = { state: 'failed', evidence: ['evidence/x.txt'] };
  }, /W-08-recovery FAILED/],
  ['a blocked gate without a reason is refused', (r) => {
    r.gates['H-14-thermal-printer'] = { state: 'blocked', evidence: [] };
  }, /H-14-thermal-printer is blocked without a reason/],
  ['money moving across the upgrade is caught', (r) => {
    r.financialParity.after.cashPaise = 999999;
  }, /financialParity\.cashPaise changed across the upgrade/],
  ['stock drifting across the upgrade is caught', (r) => {
    r.financialParity.after.stockMilli['atta-001'] = 1499;
  }, /stock for atta-001 changed across the upgrade/],
  ['a placeholder commit SHA is refused', (r) => {
    r.commitSha = '0'.repeat(40);
  }, /commitSha .* does not match the checked-out HEAD/],
  ['a placeholder installer hash is refused', (r) => {
    r.installer.sha256 = '0'.repeat(64);
  }, /installer\.sha256 is a placeholder hash/],
  ['an unsigned build cannot be described as signed', (r) => {
    delete r.installer.signatureStatus;
  }, /installer\.signatureStatus is required/],
  ['a missing non-claim about signing is refused', (r) => {
    r.nonClaims = ['This record covers one workstation only.'];
  }, /nonClaims must disclose that the build is not a signed consumer release/],
  ['an invented gate is refused', (r) => {
    r.gates['W-99-imaginary'] = { state: 'passed', evidence: ['evidence/x.txt'] };
  }, /unknown gates: W-99-imaginary/],
  ['a record with no upgrade direction is refused', (r) => {
    r.environment.schemaBefore = 13;
    r.environment.schemaAfter = 12;
  }, /schemaBefore must be lower than schemaAfter/],
  ['the template placeholder tester name is refused', (r) => {
    r.recordedBy = 'REPLACE WITH TESTER NAME';
  }, /recordedBy is still the template placeholder/],
];

for (const [label, mutate, pattern] of cases) {
  const record = validRecord();
  mutate(record);
  const result = run(record);
  check(result.code === 1, `${label} (exit 1)`);
  check(pattern.test(result.out), `  ↳ message names the reason`);
}

check(
  (() => {
    const result = run({ ...validRecord(), gates: {} });
    return result.code === 1 && /is missing from the record/.test(result.out);
  })(),
  'a record with no gates at all is refused',
);

rmSync(dir, { recursive: true, force: true });
console.log(`\nwindows-foundation evidence gate: ${checks} checks passed`);
