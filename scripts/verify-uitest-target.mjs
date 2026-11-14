#!/usr/bin/env node
/**
 * Verifies the XCUITest target integration without a Mac.
 *
 * The native half of Phase 20C can only be proven on macOS, but everything that
 * *decides* what the Xcode project should look like can be proven here, against
 * the real committed `project.pbxproj` and scheme. This exists because a config
 * plugin that silently no-ops would leave the UI suites compiling to an empty
 * bundle and passing vacuously — the worst possible outcome.
 *
 * Run with `npm run verify:uitest-target`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile');
// The plugin code under test is CommonJS, so it is loaded through createRequire.
const require = createRequire(import.meta.url);
const xcode = require(path.join(mobile, 'node_modules', 'xcode'));
const { addUiTestTarget, addTestTargetToScheme } = require(path.join(
  mobile,
  'scripts/ui-test-target.cjs',
));

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} (expected ${expected}, got ${actual})`);
}

const pbxPath = path.join(mobile, 'ios', 'Sornio.xcodeproj', 'project.pbxproj');
const schemePath = path.join(
  mobile,
  'ios',
  'Sornio.xcodeproj',
  'xcshareddata',
  'xcschemes',
  'Sornio.xcscheme',
);

function freshProject() {
  const project = xcode.project(pbxPath);
  project.parseSync();
  return project;
}

function apply(project, extra) {
  return addUiTestTarget(project, {
    projectName: 'Sornio',
    bundleIdentifier: 'com.sornio.companion',
    tests: ['SornioIPhoneAcceptanceTests.swift', 'SornioIPadAcceptanceTests.swift', 'SornioUITestSupport.swift'],
    ...extra,
  });
}

/** Renders the project the way Xcode would read it, and re-reads it. */
function roundTrip(project) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sornio-pbx-'));
  const file = path.join(dir, 'project.pbxproj');
  fs.writeFileSync(file, project.writeSync());
  const reread = xcode.project(file);
  reread.parseSync();
  const text = fs.readFileSync(file, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { reread, text };
}

// --- 1. The target is created with the right identity --------------------
check('adds a UI test target beside the existing app target', () => {
  const project = freshProject();
  const before = Object.keys(project.pbxNativeTargetSection()).filter((k) => !k.endsWith('_comment'));
  const result = apply(project);
  const after = Object.keys(project.pbxNativeTargetSection()).filter((k) => !k.endsWith('_comment'));
  assertEqual(result.added, true, 'target should have been added');
  assertEqual(after.length, before.length + 1, 'exactly one target should be added');
});

check('uses the ui-testing product type', () => {
  const project = freshProject();
  const result = apply(project);
  const target = project.pbxNativeTargetSection()[result.uuid];
  assertEqual(
    String(target.productType).replace(/"/g, ''),
    'com.apple.product-type.bundle.ui-testing',
    'product type',
  );
});

check('names the bundle after the application', () => {
  const project = freshProject();
  const result = apply(project);
  assertEqual(result.bundleIdentifier, 'com.sornio.companion.uitests', 'test bundle identifier');
});

// --- 2. It actually compiles the committed sources ----------------------
check('adds every Swift source to the Sources build phase', () => {
  const project = freshProject();
  const result = apply(project);
  const target = project.pbxNativeTargetSection()[result.uuid];
  const phase = target.buildPhases.find((entry) => entry.comment === 'Sources');
  assert(phase, 'no Sources build phase on the test target');
  const objects = project.hash.project.objects;
  const files = objects.PBXSourcesBuildPhase[phase.value].files || [];
  const names = files.map((file) => objects.PBXBuildFile[file.value].fileRef_comment).sort();
  assertEqual(names.length, 3, 'three source files should be compiled');
  assert(names.includes('SornioUITestSupport.swift'), 'support file missing');
});

check('gives the target a host application to launch', () => {
  const project = freshProject();
  const result = apply(project);
  const target = project.pbxNativeTargetSection()[result.uuid];
  const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
  for (const entry of configList.buildConfigurations) {
    const settings = project.pbxXCBuildConfigurationSection()[entry.value].buildSettings;
    assertEqual(settings.TEST_TARGET_NAME, 'Sornio', `${entry.comment} TEST_TARGET_NAME`);
    assertEqual(settings.GENERATE_INFOPLIST_FILE, 'YES', `${entry.comment} generated Info.plist`);
    assert(!('INFOPLIST_FILE' in settings), `${entry.comment} must not point at a missing Info.plist`);
    assertEqual(settings.CODE_SIGNING_ALLOWED, 'NO', `${entry.comment} simulator signing`);
    assert(!('CODE_SIGN_IDENTITY' in settings), `${entry.comment} must not set an empty signing identity`);
  }
});

check('produces an .xctest product, not the unit-test default', () => {
  const project = freshProject();
  const result = apply(project);
  const target = project.pbxNativeTargetSection()[result.uuid];
  const productRef = project.pbxFileReferenceSection()[target.productReference];
  // xcode@4 derives `.mdimporter` for a unit-test bundle; the scheme and
  // xcodebuild both look for `SornioUITests.xctest`.
  assertEqual(productRef.path, '"SornioUITests.xctest"', 'product path');
  assert(
    !JSON.stringify(project.hash.project.objects).includes('mdimporter'),
    'the product must not keep the mdimporter extension',
  );
});

check('writes no literal undefined values into the project', () => {
  const project = freshProject();
  apply(project);
  const { text } = roundTrip(project);
  assert(!/= undefined;/.test(text), 'a literal `undefined` value would make the project unreadable');
  assert(!text.includes('undefined'), 'the generated project contains `undefined`');
});

check('targets both iPhone and iPad device families', () => {
  const project = freshProject();
  const result = apply(project);
  const target = project.pbxNativeTargetSection()[result.uuid];
  const settings = project.pbxXCBuildConfigurationSection()[
    project.pbxXCConfigurationList()[target.buildConfigurationList].buildConfigurations[0].value
  ].buildSettings;
  assertEqual(settings.TARGETED_DEVICE_FAMILY, '"1,2"', 'device family must be quoted');
});

// --- 3. The generated project is still valid pbxproj --------------------
check('writes a project Xcode can parse back', () => {
  const project = freshProject();
  apply(project);
  const { reread } = roundTrip(project);
  const targets = Object.keys(reread.pbxNativeTargetSection()).filter((k) => !k.endsWith('_comment'));
  assertEqual(targets.length, 2, 'both targets survive a write/read cycle');
});

check('leaves the application target untouched', () => {
  const before = freshProject();
  const after = freshProject();
  apply(after);
  // `getFirstTarget()` returns the target section itself in xcode@4.
  const first = before.getFirstTarget();
  const appUuid = first.uuid || first.firstTarget.uuid;
  const appBefore = before.pbxNativeTargetSection()[appUuid];
  const appAfter = after.pbxNativeTargetSection()[appUuid];
  assertEqual(appAfter.productType, appBefore.productType, 'app product type changed');
  assertEqual(
    JSON.stringify(appAfter.buildPhases),
    JSON.stringify(appBefore.buildPhases),
    'app build phases changed',
  );
});

// --- 4. Idempotency: prebuild runs on every CI job ---------------------
check('is safe to run twice', () => {
  const project = freshProject();
  apply(project);
  const first = project.writeSync();
  const second = apply(project);
  const after = project.writeSync();
  assertEqual(second.added, false, 'second run must not add another target');
  assertEqual(after, first, 'second run must not modify the project');
});

check('does not duplicate targets when prebuild reruns from scratch', () => {
  const project = freshProject();
  apply(project);
  apply(project);
  apply(project);
  const targets = Object.keys(project.pbxNativeTargetSection()).filter((k) => !k.endsWith('_comment'));
  assertEqual(targets.length, 2, 'target count after three runs');
});

// --- 5. The scheme actually runs the tests -----------------------------
function schemeFixture() {
  return fs.readFileSync(schemePath, 'utf8');
}

check('adds the test target to the scheme Test action', () => {
  const xml = schemeFixture();
  const updated = addTestTargetToScheme(xml, {
    testTargetName: 'SornioUITests',
    blueprintId: 'ABCDEF0123456789ABCDEF01',
    validBlueprintIds: ['13B07F861A680F5B00A75B9A', 'ABCDEF0123456789ABCDEF01'],
    projectName: 'Sornio',
  });
  assert(updated.changed, 'scheme should have changed');
  assert(updated.xml.includes('BlueprintName = "SornioUITests"'), 'test target not referenced');
  assert(
    updated.xml.includes('BlueprintIdentifier = "ABCDEF0123456789ABCDEF01"'),
    'blueprint identifier must be the real target id',
  );
});

check('drops the scheme reference to a target that does not exist', () => {
  const xml = schemeFixture();
  // The committed scheme points at SornioTests, which is not in the project.
  assert(xml.includes('SornioTests'), 'fixture assumption: the scheme references a phantom target');
  const updated = addTestTargetToScheme(xml, {
    testTargetName: 'SornioUITests',
    blueprintId: 'ABCDEF0123456789ABCDEF01',
    validBlueprintIds: ['13B07F861A680F5B00A75B9A', 'ABCDEF0123456789ABCDEF01'],
    projectName: 'Sornio',
  });
  assert(
    !updated.xml.includes('BlueprintName = "SornioTests"'),
    'a dangling testable would make xcodebuild test fail',
  );
});

check('is safe to apply to an already-updated scheme', () => {
  const options = {
    testTargetName: 'SornioUITests',
    blueprintId: 'ABCDEF0123456789ABCDEF01',
    validBlueprintIds: ['13B07F861A680F5B00A75B9A', 'ABCDEF0123456789ABCDEF01'],
    projectName: 'Sornio',
  };
  const once = addTestTargetToScheme(schemeFixture(), options).xml;
  const twice = addTestTargetToScheme(once, options);
  assertEqual(twice.changed, false, 'second scheme run must not change anything');
  assertEqual(twice.xml, once, 'second scheme run must be byte-identical');
});

check('keeps the application in the scheme Build action', () => {
  const updated = addTestTargetToScheme(schemeFixture(), {
    testTargetName: 'SornioUITests',
    blueprintId: 'ABCDEF0123456789ABCDEF01',
    validBlueprintIds: ['13B07F861A680F5B00A75B9A', 'ABCDEF0123456789ABCDEF01'],
    projectName: 'Sornio',
  });
  assert(updated.xml.includes('BlueprintName = "Sornio"'), 'the app is no longer buildable');
  assertEqual(
    (updated.xml.match(/<TestableReference/g) || []).length,
    1,
    'exactly one testable should remain',
  );
});

// --- 6. The sources the plugin depends on are really committed ---------
check('the committed Swift suites exist and are non-trivial', () => {
  const dir = path.join(mobile, 'ios-tests', 'SornioUITests');
  assert(fs.existsSync(dir), 'ios-tests/SornioUITests is missing');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.swift'));
  assertEqual(files.length, 3, 'three Swift files expected');
  const body = files
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
  for (const symbol of ['XCUIApplication', 'app.ready', 'session.signout', 'tablet.rail', 'tablet.detail']) {
    assert(body.includes(symbol), `the suites never reference ${symbol}`);
  }
  const testCount = (body.match(/func test[ABCDEF]_/g) || []).length;
  assert(testCount >= 12, `expected at least 12 native tests, found ${testCount}`);
});

check('every identifier the suites use is declared in the app', () => {
  const identifiers = fs.readFileSync(path.join(mobile, 'src', 'testing', 'identifiers.ts'), 'utf8');
  const literals = [
    'app.ready',
    'app.demo.enter',
    'session.signout',
    'session.signed-out',
    'session.reopen-demo',
    'tablet.rail',
    'tablet.list',
    'tablet.detail',
    'restaurant.open',
    'restaurant.kitchen',
    'screen.restaurant',
  ];
  for (const literal of literals) {
    assert(identifiers.includes(literal), `${literal} is not declared in identifiers.ts`);
  }
});

check('the plugin is registered in app.json', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(mobile, 'app.json'), 'utf8'));
  const plugins = appJson.expo.plugins || [];
  assert(
    plugins.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === './plugins/with-uitest-target'),
    'with-uitest-target is not registered, so prebuild would not recreate the target',
  );
});

check('the plugin refuses to run with no sources', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
    const mobile=${JSON.stringify(mobile)};
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'sornio-empty-'));
    const plugin=require(path.join(mobile,'plugins','with-uitest-target.js'));
    // Minimal config shape: only the dangerous mod is exercised.
    let config={mods:{}};
    config=plugin(config);
    const action=config.mods.ios.dangerous;
    (async()=>{
      try{
        await action({modRequest:{projectRoot:root,platformProjectRoot:path.join(root,'ios')}});
        console.log('NO_ERROR');
      }catch(e){console.log('THREW:'+e.message)}
    })();
  `;
  const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert(out.includes('THREW:'), 'the plugin must fail loudly when there are no test sources');
});

// --- report ------------------------------------------------------------
const total = passed + failures.length;
if (failures.length) {
  console.error(`\nXCUITest target integration: ${passed}/${total} checks passed.\n`);
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log(
  `XCUITest target integration: ${passed} checks passed ` +
    '(target identity, sources, build settings, pbxproj round-trip, idempotency, scheme, committed suites).',
);
