#!/usr/bin/env node
/**
 * Boot (creating if needed) an iOS Simulator for acceptance, and prove it booted.
 *
 *   node scripts/select-ios-simulator.mjs --family iPhone [--preferred "iPhone 16"]
 *   node scripts/select-ios-simulator.mjs --family iPad
 *
 * Writes `udid=`, `name=` and `runtime=` to $GITHUB_OUTPUT when present, and
 * appends a human summary to $GITHUB_STEP_SUMMARY.
 *
 * Design notes
 * ------------
 * 1. This never calls `process.exit` from inside the selection logic — selection
 *    is pure and lives in scripts/simulator-choice.mjs, which is unit-tested on
 *    Linux. Here we only gather facts, act, and report.
 * 2. Every environment failure prints what *was* available. The previous version
 *    exited 2 with no output, which is why the real cause was invisible.
 * 3. Booting is verified by polling the device state to `Booted` and by asking
 *    the runtime for `bootstatus`. A device that is not `Booted` is a failure
 *    here, not a failure three steps later.
 * 4. It does not install a multi-gigabyte runtime silently. If no runtime is
 *    present it says exactly which command to run.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { chooseExistingDevice, chooseSimulator, simulatorName } from './simulator-choice.mjs';

const args = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}

const family = flag('family');
const preferred = flag('preferred', '');
if (family !== 'iPhone' && family !== 'iPad') {
  console.error('Usage: select-ios-simulator.mjs --family iPhone|iPad [--preferred "iPhone 16"]');
  process.exit(64);
}

const log = [];
function say(line = '') {
  log.push(line);
  console.log(line);
}

/** Runs a command and returns stdout, or null with the stderr recorded. */
function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    if (!allowFailure) {
      say(`! ${command} could not be executed: ${result.error.message}`);
    }
    return { ok: false, stdout: '', stderr: result.error.message };
  }
  if (result.status !== 0 && !allowFailure) {
    say(`! ${command} exited ${result.status}: ${(result.stderr || '').trim().split('\n').slice(0, 5).join(' | ')}`);
  }
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flushSummary() {
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Simulator selection\n\n\`\`\`\n${log.join('\n')}\n\`\`\`\n`);
    } catch {
      /* a missing summary file must never fail the run */
    }
  }
}

function fail(code, detail) {
  say('');
  say(`FAILED: ${detail}`);
  say(`code=${code}`);
  flushSummary();
  process.exit(1);
}

// ---------------------------------------------------------------- environment
const uname = run('uname', ['-a'], { allowFailure: true });
say(`runner: ${(uname.stdout || 'unknown').trim()}`);
const xcodeVersion = run('xcodebuild', ['-version'], { allowFailure: true });
say(`xcode: ${(xcodeVersion.stdout || '(xcodebuild unavailable)').trim().replace(/\n/g, ' ')}`);
if (!xcodeVersion.ok) {
  fail('no_xcode', 'xcodebuild is not available on this runner, so no iOS Simulator can be booted.');
}
const xcodePath = run('xcode-select', ['-p'], { allowFailure: true });
say(`xcode-select: ${(xcodePath.stdout || '?').trim()}`);

const runtimes = json(run('xcrun', ['simctl', 'list', 'runtimes', '--json'], { allowFailure: true }).stdout);
const runtimeRows = Array.isArray(runtimes?.runtimes) ? runtimes.runtimes : [];
say('');
say('installed runtimes:');
if (runtimeRows.length === 0) say('  (none)');
for (const row of runtimeRows) {
  say(`  ${row.identifier}  platform=${row.platform}  available=${row.isAvailable !== false}${row.name ? `  ${row.name}` : ''}`);
}

const deviceTypesJson = json(run('xcrun', ['simctl', 'list', 'devicetypes', '--json'], { allowFailure: true }).stdout);
const deviceTypeRows = Array.isArray(deviceTypesJson?.devicetypes) ? deviceTypesJson.devicetypes : [];
say('');
say(`installed device types: ${deviceTypeRows.length}`);

const selection = chooseSimulator({
  runtimes: runtimeRows.map((row) => ({ identifier: row.identifier, name: row.name, available: row.isAvailable !== false, platform: row.platform })),
  deviceTypes: deviceTypeRows,
  family,
  preferredModel: preferred,
});

if (!selection.ok) {
  say('');
  say(`requested family: ${family}${preferred ? ` (preferred "${preferred}")` : ''}`);
  say(`available runtimes: ${selection.availableRuntimes.join(', ') || '(none)'}`);
  say(`${family} device types: ${selection.availableDeviceTypes.join(', ') || '(none)'}`);
  fail(selection.code, selection.reason);
}

say('');
say(`requested family: ${family}${preferred ? ` (preferred "${preferred}")` : ''}`);
say(`selected device type: ${selection.deviceType.name}  (${selection.deviceType.identifier})`);
say(`selected runtime: ${selection.runtime.name}  (${selection.runtime.identifier})`);
say(`reason: ${selection.reason}`);

// --------------------------------------------------------------------- device
const devicesJson = json(
  run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { allowFailure: true }).stdout,
);
const byRuntime = devicesJson?.devices ?? {};
const existing = [];
for (const [runtimeId, rows] of Object.entries(byRuntime)) {
  for (const row of Array.isArray(rows) ? rows : []) {
    existing.push({ ...row, runtimeIdentifier: runtimeId });
  }
}
say('');
say(`available devices: ${existing.length}`);

let device = chooseExistingDevice(
  existing.map((row) => ({ ...row, available: row.isAvailable !== false })),
  { deviceType: selection.deviceType, family },
);

if (!device) {
  const name = simulatorName({ family, deviceType: selection.deviceType });
  say(`creating simulator: ${name}`);
  const created = run('xcrun', ['simctl', 'create', name, selection.deviceType.identifier, selection.runtime.identifier]);
  if (!created.ok) {
    fail('create_failed', `simctl could not create a ${family} simulator from ${selection.deviceType.identifier} on ${selection.runtime.identifier}.`);
  }
  const udid = created.stdout.trim().split('\n').pop().trim();
  if (!/^[0-9A-Fa-f-]{36}$/.test(udid)) {
    fail('create_returned_no_udid', `simctl create returned an unexpected identifier: ${JSON.stringify(udid)}`);
  }
  device = { udid, name, created: true, state: 'Shutdown' };
}

say(`selected simulator: ${device.name}  udid=${device.udid}  state=${device.state ?? 'unknown'}  created=${device.created ? 'yes' : 'no'}`);

// ----------------------------------------------------------------------- boot
const boot = run('xcrun', ['simctl', 'boot', device.udid], { allowFailure: true });
const bootMessage = `${boot.stdout} ${boot.stderr}`.trim();
if (!boot.ok && !/current state: Booted/i.test(bootMessage) && !/Unable to boot device in current state: Booted/i.test(bootMessage)) {
  say(`boot output: ${bootMessage || '(none)'}`);
  fail('boot_failed', `simctl could not boot ${device.name} (${device.udid}).`);
}

const bootStatus = run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
if (!bootStatus.ok) {
  say(`bootstatus output: ${(bootStatus.stderr || bootStatus.stdout || '').trim().slice(0, 800)}`);
  fail('boot_not_complete', `${device.name} did not finish booting.`);
}

// Independent confirmation from the device registry, not just the tool's word.
const confirmed = json(run('xcrun', ['simctl', 'list', 'devices', '--json'], { allowFailure: true }).stdout);
const confirmedState = Object.values(confirmed?.devices ?? {})
  .flatMap((rows) => (Array.isArray(rows) ? rows : []))
  .find((row) => row.udid === device.udid);
say(`boot confirmed: state=${confirmedState?.state ?? 'unknown'}`);
if (confirmedState?.state !== 'Booted') {
  fail('boot_state_not_booted', `${device.name} reports state "${confirmedState?.state ?? 'unknown'}" after bootstatus.`);
}

say('');
say(`READY ${family}: ${device.name} ${device.udid} on ${selection.runtime.name}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `udid=${device.udid}\nname=${device.name}\nruntime=${selection.runtime.identifier}\n`);
}
flushSummary();
