/**
 * Adds an XCUITest bundle target to the generated Xcode project.
 *
 * Kept separate from the Expo config plugin so it can be unit-tested on Linux
 * against the real committed `project.pbxproj`. The native build can only run on
 * macOS, so everything that *decides* what the project should look like is
 * verified here instead.
 *
 * Design notes:
 *  - Idempotent. `expo prebuild` runs on every CI job, so the function is
 *    written to be safe to apply repeatedly and to leave an existing target
 *    untouched rather than duplicating it.
 *  - Additive. It never edits the app target's build settings, so a broken test
 *    target can never change how the shipping app compiles.
 *  - It does not add a target dependency on the app. XCTest's
 *    `TEST_TARGET_NAME` combined with an app in the scheme's Test action is what
 *    makes XCUIApplication launch the host; a `PBXTargetDependency` would add a
 *    build-order edge we do not need.
 */
const path = require('node:path');

const BUNDLE_ID_SUFFIX = '.uitests';
const TARGET_NAME_SUFFIX = 'UITests';
const SWIFT_VERSION = '5.0';

/** Settings shared by both configurations. */
function baseSettings({ bundleId, productName }) {
  return {
    ALWAYS_SEARCH_USER_PATHS: 'NO',
    CLANG_ANALYZER_NONNULL: 'YES',
    CLANG_ENABLE_MODULES: 'YES',
    CLANG_ENABLE_OBJC_ARC: 'YES',
    // Simulator-only test bundles are never signed. An empty
    // CODE_SIGN_IDENTITY would be written as the invalid `= ;`, so the keys are
    // omitted entirely rather than set to ''.
    CODE_SIGNING_ALLOWED: 'NO',
    CODE_SIGNING_REQUIRED: 'NO',
    CURRENT_PROJECT_VERSION: '1',
    GENERATE_INFOPLIST_FILE: 'YES',
    IPHONEOS_DEPLOYMENT_TARGET: '15.1',
    MARKETING_VERSION: '1.0',
    PRODUCT_BUNDLE_IDENTIFIER: bundleId,
    PRODUCT_NAME: productName,
    SDKROOT: 'iphoneos',
    SWIFT_EMIT_LOC_STRINGS: 'YES',
    SWIFT_VERSION,
    // Quoted: an unquoted `1,2` is invalid pbxproj syntax.
    TARGETED_DEVICE_FAMILY: '"1,2"',
  };
}

function targetNameQuoted(name) {
  return `"${name}"`;
}

function unquote(value) {
  return String(value == null ? '' : value).replace(/^"|"$/g, '');
}

/** `pbxTargetByName` matches the comment key, which `xcode` does not always set. */
function findTargetUuid(project, name) {
  const targets = project.pbxNativeTargetSection();
  for (const key of Object.keys(targets)) {
    if (key.endsWith('_comment')) continue;
    if (unquote(targets[key].name) === name) return key;
  }
  return null;
}

/**
 * @param {object} project parsed `xcode` project (pbxproj AST)
 * @param {object} options
 * @param {string} options.projectName  e.g. 'Sornio'
 * @param {string} options.bundleIdentifier e.g. 'com.sornio.companion'
 * @param {string} [options.testTargetName]
 * @param {string} [options.sourceDir] path (relative to ios/) holding the Swift tests
 * @returns {{added: boolean, targetName: string, uuid?: string, tests: string[]}}
 */
function addUiTestTarget(project, options) {
  const projectName = options.projectName;
  const bundleIdentifier = options.bundleIdentifier;
  const testTargetName = options.testTargetName || `${projectName}${TARGET_NAME_SUFFIX}`;
  const sourceDir = options.sourceDir || 'SornioUITests';
  const tests = options.tests || [];

  if (findTargetUuid(project, testTargetName)) {
    return { added: false, targetName: testTargetName, tests };
  }

    const testBundleId = `${bundleIdentifier}${BUNDLE_ID_SUFFIX}`;

  // 1. The target itself. `xcode@4` has no `ui_testing` target type, so the
  //    target is created as a unit-test bundle and its product type and product
  //    file are then rewritten. Both are plain fields in the pbxproj.
  project.addTarget(testTargetName, 'unit_test_bundle', testTargetName, testBundleId);
  const targetUuid = findTargetUuid(project, testTargetName);
  if (!targetUuid) throw new Error(`could not add target ${testTargetName}`);

  // `xcode` records target names with embedded quotes and creates no build
  // phases, so both are normalised here rather than trusted.
  const nativeTargetsRaw = project.pbxNativeTargetSection();
  nativeTargetsRaw[targetUuid].name = targetNameQuoted(testTargetName);
  nativeTargetsRaw[targetUuid].productName = targetNameQuoted(testTargetName);

  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetUuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);

  const nativeTargets = project.pbxNativeTargetSection();
  const created = nativeTargets[targetUuid];
  // Quoted, exactly as Xcode writes it. An unquoted value containing hyphens is
  // not reliably read back by every pbxproj parser.
  created.productType = '"com.apple.product-type.bundle.ui-testing"';
  if (created.productType_comment) delete created.productType_comment;

  // `xcode` derives the product name and extension from the *unit-test* type it
  // created, which yields `SornioUITests.mdimporter`. The built product must be
  // `SornioUITests.xctest` or neither the scheme nor xcodebuild can find it.
  const productName = `${testTargetName}.xctest`;
  const productRefKey = created.productReference;
  if (productRefKey) {
    const productRef = project.pbxFileReferenceSection()[productRefKey];
    if (productRef) {
      productRef.name = `"${productName}"`;
      productRef.path = `"${productName}"`;
      productRef.explicitFileType = '"wrapper.cfbundle"';
      productRef.lastKnownFileType = '"wrapper.cfbundle"';
      delete productRef.fileEncoding;
      delete productRef.includeInIndex;
    }
    // The `_comment` keys are what `xcode` writes as the /* ... */ annotation
    // beside a uuid, so they need the new name too.
    project.hash.project.objects.PBXFileReference[`${productRefKey}_comment`] = productName;
    const objects = project.hash.project.objects;

    // Rename every annotation that still carries the old product name: the
    // build file's `fileRef_comment`, the Products group child comment, and the
    // build file's own `_comment`.
    for (const key of Object.keys(objects.PBXBuildFile)) {
      if (key.endsWith('_comment')) continue;
      const entry = objects.PBXBuildFile[key];
      if (entry && entry.fileRef === productRefKey) {
        entry.fileRef_comment = productName;
        objects.PBXBuildFile[`${key}_comment`] = `${productName} in Copy Files`;
      }
    }
    for (const key of Object.keys(objects.PBXGroup)) {
      if (key.endsWith('_comment')) continue;
      const children = objects.PBXGroup[key].children || [];
      for (const child of children) {
        if (child && child.value === productRefKey) child.comment = productName;
      }
    }
  }

  // 2. Source files. The Swift sources are written by the plugin next to the
  //    project; each one needs a PBXFileReference, a group entry and a build
  //    file in the Sources phase.
  const groupKey = project.findPBXGroupKey({ name: testTargetName });
  const groupUuid = groupKey || project.pbxCreateGroup(testTargetName, sourceDir);

  for (const file of tests) {
    project.addSourceFile(`${sourceDir}/${file}`, { target: targetUuid }, groupUuid);
  }

  // 3. Build settings. `xcode` has already created Debug/Release configs for
  //    the new target; fill them in. `buildConfigurations` is an array of
  //    {value, comment} pairs, not a map.
  const target = nativeTargets[targetUuid];
  const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
  for (const entry of configList.buildConfigurations) {
    const configurationName = entry.comment || entry.name;
    const buildConfig = project.pbxXCBuildConfigurationSection()[entry.value];
    buildConfig.buildSettings = {
      ...baseSettings({ bundleId: testBundleId, productName: testTargetName }),
      TEST_TARGET_NAME: projectName,
      ...(buildConfig.buildSettings || {}),
      // Keep the values above authoritative even if `xcode` seeded defaults.
      PRODUCT_BUNDLE_IDENTIFIER: testBundleId,
      PRODUCT_NAME: testTargetName,
      TEST_TARGET_NAME: projectName,
      SWIFT_VERSION,
      CODE_SIGNING_ALLOWED: 'NO',
      CODE_SIGNING_REQUIRED: 'NO',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    };
    buildConfig.name = configurationName;
    // `xcode` seeds INFOPLIST_FILE pointing at a plist it never creates, which
    // conflicts with GENERATE_INFOPLIST_FILE and fails the build.
    delete buildConfig.buildSettings.INFOPLIST_FILE;
    // A UITest bundle is a test bundle; without this Xcode tries to sign and
    // install it as an application on the simulator.
    buildConfig.buildSettings.WRAPPER_EXTENSION = 'xctest';
  }

  // The parser materialises present-but-empty pbxproj values (for example
  // `explicitFileType = ;`) as the *string* 'undefined', and `xcode` writes that
  // back verbatim, producing a project Xcode cannot read.
  const sections = project.hash.project.objects;
  for (const sectionName of Object.keys(sections)) {
    const section = sections[sectionName];
    if (!section || typeof section !== 'object') continue;
    for (const key of Object.keys(section)) {
      if (key.endsWith('_comment')) continue;
      const entry = section[key];
      if (!entry || typeof entry !== 'object') continue;
      for (const field of Object.keys(entry)) {
        if (entry[field] === 'undefined' || entry[field] === undefined) delete entry[field];
      }
    }
  }


  return { added: true, targetName: testTargetName, uuid: targetUuid, bundleIdentifier: testBundleId, tests };
}

/**
 * Points the shared scheme's Test action at the UI test target.
 *
 * `xcodebuild test -scheme Sornio` only runs the testables the scheme lists.
 *
 * Two things matter here:
 *  - the shipped scheme references a `SornioTests` target that does not exist in
 *    the project, so `xcodebuild test` fails on a phantom blueprint. Any
 *    testable whose blueprint is not a real target is dropped.
 *  - the reference must carry the real BlueprintIdentifier, which is why the
 *    target UUID is threaded through instead of guessed.
 *
 * @param {string} schemeXml
 * @param {{testTargetName: string, blueprintId: string, validBlueprintIds: string[], projectName: string}} options
 * @returns {{changed: boolean, xml: string}}
 */
function addTestTargetToScheme(schemeXml, options) {
  const { testTargetName, blueprintId, validBlueprintIds, projectName } = options;
  if (!schemeXml.includes('<TestAction')) {
    throw new Error('scheme has no TestAction; refusing to guess its structure');
  }

  const testableRe = /[ \t]*<TestableReference[\s\S]*?<\/TestableReference>\n?/g;
  const valid = new Set(validBlueprintIds);
  let changed = false;
  let kept = [];

  const existing = schemeXml.match(testableRe) || [];
  for (const block of existing) {
    const idMatch = block.match(/BlueprintIdentifier = "([^"]*)"/);
    const nameMatch = block.match(/BlueprintName = "([^"]*)"/);
    const id = idMatch ? idMatch[1] : '';
    const name = nameMatch ? nameMatch[1] : '';
    if (name === testTargetName) {
      kept.push(block);
      continue;
    }
    if (id && !valid.has(id)) {
      // Dangling reference to a target that is not in the project.
      changed = true;
      continue;
    }
    kept.push(block);
  }

  const alreadyListed = kept.some((b) => (b.match(/BlueprintName = "([^"]*)"/) || [])[1] === testTargetName);

  let xml = schemeXml;
  if (!alreadyListed) {
    const opened = xml.match(/<Testables>\n/);
    if (!opened) throw new Error('scheme TestAction has no <Testables> block');
    const at = opened.index + opened[0].length;
    const block = [
      '         <TestableReference',
      '            skipped = "NO">',
      '            <BuildableReference',
      '               BuildableIdentifier = "primary"',
      `               BlueprintIdentifier = "${blueprintId}"`,
      `               BuildableName = "${testTargetName}.xctest"`,
      `               BlueprintName = "${testTargetName}"`,
      `               ReferencedContainer = "container:${projectName}.xcodeproj">`,
      '            </BuildableReference>',
      '         </TestableReference>',
      '',
    ].join('\n');
    xml = `${xml.slice(0, at)}${block}${xml.slice(at)}`;
    changed = true;
  }

  // Drop references to targets that no longer exist, keeping the ones we kept.
  xml = xml.replace(testableRe, (block) => {
    const id = (block.match(/BlueprintIdentifier = "([^"]*)"/) || [])[1] || '';
    const name = (block.match(/BlueprintName = "([^"]*)"/) || [])[1] || '';
    if (name === testTargetName) return block;
    if (id && !valid.has(id)) return '';
    return block;
  });

  return { changed, xml };
}

module.exports = {
  addUiTestTarget,
  addTestTargetToScheme,
  findTargetUuid,
  TARGET_NAME_SUFFIX,
  BUNDLE_ID_SUFFIX,
};
