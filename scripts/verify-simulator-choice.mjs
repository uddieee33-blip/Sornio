/**
 * Verify iOS Simulator selection without a Mac.
 *
 *   npm run verify:simulator-choice
 *
 * The Phase 20 simulator jobs failed in "Boot simulator" with exit code 2 and no
 * diagnostic, because the selection logic lived inline in YAML and demanded an
 * exact marketing model. That made it untestable anywhere except a paid macOS
 * run — which is precisely the thing that was broken.
 *
 * This suite pins the rules that must hold:
 *   - newest installed iOS runtime wins, with correct 9 vs 18 ordering
 *   - an iPhone request never yields an iPad and vice versa
 *   - a missing preferred model falls back instead of failing
 *   - a genuinely empty inventory fails with a specific, actionable code
 *   - existing simulators are reused rather than duplicated
 */
import { chooseExistingDevice, chooseSimulator, familyOf, parseDeviceType, parseRuntime, simulatorName } from './simulator-choice.mjs';

let checks = 0;
function ok(condition, label) {
  checks += 1;
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  }
}

const RUNTIMES = [
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2', name: 'iOS 18.2' },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-9-3', name: 'iOS 9.3' },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5', name: 'iOS 17.5' },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.watchOS-11-0', name: 'watchOS 11.0' },
];

const DEVICE_TYPES = [
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16', name: 'iPhone 16' },
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro', name: 'iPhone 16 Pro' },
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation', name: 'iPhone SE (3rd generation)' },
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB', name: 'iPad Pro 11-inch (M4)' },
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Air-11-inch-M2', name: 'iPad Air 11-inch (M2)' },
  { identifier: 'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4K', name: 'Apple TV 4K (3rd generation)' },
];

// --- runtime parsing -------------------------------------------------------
ok(parseRuntime(RUNTIMES[0].identifier).major === 18, 'parses iOS 18 runtime major version');
ok(parseRuntime('com.apple.CoreSimulator.SimRuntime.watchOS-11-0') === null, 'ignores non-iOS runtimes');
ok(parseRuntime('nonsense') === null, 'rejects a malformed runtime identifier');
ok(
  parseRuntime(RUNTIMES[0].identifier).sortKey > parseRuntime(RUNTIMES[1].identifier).sortKey,
  'iOS 18 sorts above iOS 9 (the bug a plain string compare would introduce)',
);
ok(parseRuntime(RUNTIMES[0].identifier).sortKey > parseRuntime(RUNTIMES[2].identifier).sortKey, 'iOS 18.2 sorts above iOS 17.5');

// --- device type parsing ---------------------------------------------------
ok(parseDeviceType(DEVICE_TYPES[0].identifier).family === 'iPhone', 'classifies iPhone device types');
ok(parseDeviceType(DEVICE_TYPES[3].identifier).family === 'iPad', 'classifies iPad device types');
ok(parseDeviceType(DEVICE_TYPES[5].identifier).family === null, 'classifies Apple TV as neither iPhone nor iPad');
ok(familyOf('iPad Pro 11-inch (M4)') === 'iPad', 'familyOf reads an iPad name');
ok(familyOf('iPhone 16') === 'iPhone', 'familyOf reads an iPhone name');

// --- happy path ------------------------------------------------------------
const iphone = chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES, family: 'iPhone', preferredModel: 'iPhone 16' });
ok(iphone.ok === true, 'selects an iPhone from a normal inventory');
ok(iphone.ok && iphone.runtime.major === 18, 'uses the newest iOS runtime, not the first listed');
ok(iphone.ok && iphone.deviceType.name === 'iPhone 16', 'honours the preferred model when installed');

const ipad = chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES, family: 'iPad', preferredModel: 'iPad Pro 11-inch (M4)' });
ok(ipad.ok === true, 'selects an iPad from a normal inventory');
ok(ipad.ok && ipad.deviceType.family === 'iPad', 'iPad request yields an iPad');

// --- the exact failure that broke CI: a model the runner does not have -----
const missingIphone = chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES.filter((t) => !/iPhone-16"/.test(`${t.identifier}"`)), family: 'iPhone', preferredModel: 'iPhone 16' });
ok(missingIphone.ok === true, 'falls back when the preferred iPhone model is absent instead of failing');
ok(missingIphone.ok && missingIphone.deviceType.family === 'iPhone', 'the fallback is still an iPhone');

const missingIpad = chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES.filter((t) => !/iPad/.test(t.identifier)), family: 'iPad', preferredModel: 'iPad Pro 11-inch (M4)' });
ok(missingIpad.ok === false && missingIpad.code === 'no_device_type', 'fails with no_device_type when no iPad type exists at all');
ok(missingIpad.ok === false && /iPad/.test(missingIpad.reason), 'the no-iPad failure names the missing capability');

// --- never substitute one family for the other ----------------------------
const ipadOnly = chooseSimulator({ runtimes: RUNTIMES, deviceTypes: [DEVICE_TYPES[3]], family: 'iPhone' });
ok(ipadOnly.ok === false, 'an iPad-only inventory cannot satisfy an iPhone request');
ok(ipadOnly.ok === false && ipadOnly.code === 'no_device_type', 'and reports no_device_type rather than silently using the iPad');

// --- no runtime at all ----------------------------------------------------
const noRuntime = chooseSimulator({ runtimes: [], deviceTypes: DEVICE_TYPES, family: 'iPhone' });
ok(noRuntime.ok === false && noRuntime.code === 'no_runtime', 'reports no_runtime for an empty runtime inventory');
ok(noRuntime.ok === false && /downloadPlatform iOS/.test(noRuntime.reason), 'no_runtime tells the operator exactly which command installs one');

const unavailableRuntime = chooseSimulator({
  runtimes: [{ identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2', name: 'iOS 18.2', available: false }],
  deviceTypes: DEVICE_TYPES,
  family: 'iPhone',
});
ok(unavailableRuntime.ok === false && unavailableRuntime.code === 'no_runtime', 'an unavailable runtime is not treated as installed');

// --- bad input ------------------------------------------------------------
ok(chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES, family: 'Android' }).ok === false, 'rejects an unsupported family');
ok(chooseSimulator({ runtimes: RUNTIMES, deviceTypes: DEVICE_TYPES }).ok === false, 'rejects a missing family');

// --- reusing an existing simulator ---------------------------------------
const devices = [
  { udid: 'AAAAAAAA-0000-0000-0000-000000000001', name: 'Sornio iPhone acceptance', deviceTypeIdentifier: DEVICE_TYPES[0].identifier, state: 'Shutdown' },
  { udid: 'BBBBBBBB-0000-0000-0000-000000000002', name: 'Some iPad', deviceTypeIdentifier: DEVICE_TYPES[3].identifier, state: 'Booted' },
];
const reuse = chooseExistingDevice(devices, { deviceType: iphone.deviceType, family: 'iPhone' });
ok(reuse !== null && reuse.udid.startsWith('AAAA'), 'reuses a matching existing simulator instead of creating one');
ok(reuse.created === false, 'a reused device is marked as not created');
const noReuse = chooseExistingDevice(devices, { deviceType: parseDeviceType(DEVICE_TYPES[1].identifier), family: 'iPhone' });
ok(noReuse === null, 'does not reuse a simulator whose device type differs');
const unavailableReuse = chooseExistingDevice([{ ...devices[0], isAvailable: false }], { deviceType: iphone.deviceType, family: 'iPhone' });
ok(unavailableReuse === null, 'does not reuse an unavailable simulator');

// --- deterministic naming -------------------------------------------------
ok(simulatorName({ family: 'iPhone' }) === simulatorName({ family: 'iPhone' }), 'simulator names are stable across runs');
ok(simulatorName({ family: 'iPhone' }) !== simulatorName({ family: 'iPad' }), 'iPhone and iPad simulator names differ');

if (process.exitCode) {
  console.error(`\niOS Simulator choice: FAILED`);
} else {
  console.log(`iOS Simulator choice: ${checks} checks passed (runtime ordering, family isolation, fallback, provisioning reuse, diagnostics).`);
}
