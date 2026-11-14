/**
 * Pick an iOS Simulator for a device class, without assuming a marketing model.
 *
 * WHY THIS IS A MODULE
 * --------------------
 * The Phase 20 simulator jobs both failed with `exit code 2` in the *Boot
 * simulator* step and nothing else. The cause was an inline `node -e` script
 * that required an exact device name ("iPhone 16", "iPad Pro 11-inch (M4)") to
 * exist on the runner. When that exact name was absent it called
 * `process.exit(2)` and produced no diagnostic at all — every downstream step
 * was skipped, so nothing was proven about the Sornio app either way.
 *
 * Logic that decides whether verification can run at all has to be testable on
 * a machine that has no Xcode. So selection is pure and lives here; the CLI
 * (scripts/select-ios-simulator.mjs) only gathers facts and applies the choice.
 *
 * The rules are deliberately narrow:
 *   - an iPhone request may only be satisfied by an iPhone
 *   - an iPad request may only be satisfied by an iPad
 *   - the newest installed iOS runtime wins
 *   - a preferred marketing model is a strong hint, never a requirement
 *
 * Everything returns a structured description of *why* a choice was made so the
 * workflow can print it and so a failure can say what was actually available.
 */

/** Runtime names look like `com.apple.CoreSimulator.SimRuntime.iOS-18-2`. */
const RUNTIME_PATTERN = /SimRuntime\.iOS-(\d+)-(\d+)/;

/** Device types look like `com.apple.CoreSimulator.SimDeviceType.iPhone-16`. */
const DEVICE_TYPE_PATTERN = /SimDeviceType\.([A-Za-z0-9-]+)/;

export function familyOf(text) {
  if (typeof text !== 'string') return null;
  if (/ipad/i.test(text)) return 'iPad';
  if (/iphone/i.test(text)) return 'iPhone';
  return null;
}

/** Parses an iOS runtime identifier into a comparable version. */
export function parseRuntime(identifier, name) {
  if (typeof identifier !== 'string') return null;
  const match = RUNTIME_PATTERN.exec(identifier);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isInteger(major)) return null;
  return {
    identifier,
    name: typeof name === 'string' ? name : `iOS ${major}.${minor}`,
    major,
    minor,
    /** Alphabetically sortable key: iOS 9 must not sort above iOS 18. */
    sortKey: `${String(major).padStart(3, '0')}.${String(minor).padStart(3, '0')}`,
  };
}

/** Extracts the device-type suffix, e.g. `iPhone-16` from the full identifier. */
export function parseDeviceType(identifier, name) {
  if (typeof identifier !== 'string') return null;
  const match = DEVICE_TYPE_PATTERN.exec(identifier);
  return {
    identifier,
    name: typeof name === 'string' ? name : (match ? match[1] : identifier),
    model: match ? match[1] : identifier,
    family: familyOf(match ? match[1] : identifier),
  };
}

/**
 * Chooses a runtime and device type for one device class.
 *
 * @param {object} input
 * @param {Array<{identifier:string,name?:string,available?:boolean,platform?:string}>} input.runtimes
 * @param {Array<{identifier:string,name?:string}>} input.deviceTypes
 * @param {'iPhone'|'iPad'} input.family
 * @param {string} [input.preferredModel] a marketing model hint, e.g. "iPhone 16"
 * @returns {{ok:true, runtime:object, deviceType:object, reason:string}
 *          | {ok:false, code:string, reason:string, availableRuntimes:string[], availableDeviceTypes:string[]}}
 */
export function chooseSimulator(input) {
  const family = input.family;
  if (family !== 'iPhone' && family !== 'iPad') {
    return { ok: false, code: 'bad_family', reason: `Unsupported device family "${family}". Use iPhone or iPad.`, availableRuntimes: [], availableDeviceTypes: [] };
  }

  const runtimes = (input.runtimes ?? [])
    .filter((row) => row && row.available !== false)
    .map((row) => parseRuntime(row.identifier, row.name))
    .filter(Boolean)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const deviceTypes = (input.deviceTypes ?? [])
    .map((row) => parseDeviceType(row.identifier, row.name))
    .filter((row) => row && row.family === family);

  if (runtimes.length === 0) {
    return {
      ok: false,
      code: 'no_runtime',
      reason: 'No installed iOS Simulator runtime was found. Install one with `xcodebuild -downloadPlatform iOS`.',
      availableRuntimes: (input.runtimes ?? []).map((row) => `${row.identifier} (${row.name ?? '?'})`),
      availableDeviceTypes: deviceTypes.map((row) => row.name),
    };
  }

  if (deviceTypes.length === 0) {
    return {
      ok: false,
      code: 'no_device_type',
      reason: `No installed SimDeviceType matches the ${family} family.`,
      availableRuntimes: runtimes.map((row) => row.name),
      availableDeviceTypes: (input.deviceTypes ?? []).map((row) => row.name ?? row.identifier),
    };
  }

  // A preferred marketing model is a hint: prefer it, never require it.
  const preferred = typeof input.preferredModel === 'string' ? input.preferredModel.trim() : '';
  const normalise = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = normalise(preferred);
  let deviceType = preferred
    ? deviceTypes.find((row) => normalise(row.name) === wanted) ?? deviceTypes.find((row) => normalise(row.model) === wanted)
    : undefined;
  let reason;

  if (deviceType) {
    reason = `Matched the preferred ${family} model "${preferred}".`;
  } else {
    // Nothing matched by name: take the newest model of the right family by
    // numeric suffix (iPhone-16 beats iPhone-8), which is a stable proxy for
    // "a current device" without hardcoding a marketing name.
    const score = (row) => {
      const numbers = (row.model.match(/\d+/g) ?? []).map(Number);
      return numbers.length ? Math.max(...numbers) : 0;
    };
    deviceType = [...deviceTypes].sort((a, b) => score(b) - score(a))[0];
    reason = preferred
      ? `Preferred model "${preferred}" is not installed; fell back to the newest available ${family} type "${deviceType.name}".`
      : `No model preference supplied; using the newest available ${family} type "${deviceType.name}".`;
  }

  const runtime = runtimes[0];
  return { ok: true, runtime, deviceType, reason: `${reason} Runtime ${runtime.name} is the newest installed.` };
}

/**
 * Picks the device to boot given existing devices, so a stale pre-created
 * simulator is reused instead of spawning another one on every run.
 *
 * @param {Array<{udid:string,name:string,deviceTypeIdentifier?:string,state?:string,available?:boolean,isAvailable?:boolean}>} devices
 * @param {{runtime:object, deviceType:object, family:'iPhone'|'iPad'}} choice
 */
export function chooseExistingDevice(devices, choice) {
  const usable = (devices ?? []).filter((row) => row && row.available !== false && row.isAvailable !== false && typeof row.udid === 'string');
  /* Match on the device type only. Requiring the simulator *name* to start with
     the family rejects the simulators this script creates itself (they are named
     "Sornio iPhone acceptance"), which would create a new device every run. */
  const exact = usable.find((row) => row.deviceTypeIdentifier === choice.deviceType.identifier);
  if (exact) return { udid: exact.udid, name: exact.name, state: exact.state ?? 'unknown', created: false };
  return null;
}

/** Stable, unique-ish simulator name so repeated runs reuse one device. */
export function simulatorName(choice) {
  return `Sornio ${choice.family} acceptance`;
}
