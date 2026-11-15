/**
 * Keeps the XCUITest target in the *generated* iOS project.
 *
 * Why a plugin rather than a one-off edit: `expo prebuild` regenerates
 * `ios/`, and CI runs it on every job, so a hand-added target would be erased
 * on the next run. The plugin runs as part of generation, which makes the target
 * reproducible instead of something a human has to remember to re-apply.
 *
 * Ordering matters and is not guesswork: Expo's mod compiler runs the
 * `dangerous` mod first (precedence -2) and `xcodeproj` second (-1). The xcodeproj
 * mod runs last, so the code written here is already on disk when the project is
 * loaded and saved. See @expo/config-plugins mod-compiler `precedences`.
 *
 * The source of truth for the tests is `ios-tests/SornioUITests/*.swift`, which
 * is committed. This plugin copies those files into the generated project
 * directory and wires them into a target.
 */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const { addUiTestTarget, addTestTargetToScheme } = require('../scripts/ui-test-target.cjs');

const SOURCE_DIR = 'SornioUITests';
const TARGET_NAME = 'SornioUITests';

function committedTestsDir(projectRoot) {
  // plugins/ and ios-tests/ are siblings inside apps/mobile.
  return path.join(projectRoot, 'ios-tests', SOURCE_DIR);
}

function readTests(projectRoot) {
  const dir = committedTestsDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.swift'))
    .sort();
}

function copyTestSources(projectRoot, platformProjectRoot) {
  const from = committedTestsDir(projectRoot);
  if (!fs.existsSync(from)) return 0;
  const to = path.join(platformProjectRoot, SOURCE_DIR);
  fs.mkdirSync(to, { recursive: true });
  const files = readTests(projectRoot);
  for (const file of files) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
  return files.length;
}

module.exports = function withUiTestTarget(config) {
  // 1. Put the Swift sources where the Xcode project expects them. Runs first.
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const copied = copyTestSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
      );
      if (copied === 0) {
        throw new Error(
          `No XCUITest sources found in ios-tests/${SOURCE_DIR}. The UI test target would ` +
            'compile to an empty bundle and pass without asserting anything.',
        );
      }
      return cfg;
    },
  ]);

  // 2. Add the target and point the scheme at it.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName =
      cfg.modRequest.projectName || path.basename(cfg.modRequest.platformProjectRoot);
    const bundleIdentifier =
      (cfg.ios && cfg.ios.bundleIdentifier) || cfg.modRequest.bundleIdentifier || 'com.sornio.companion';

    const tests = readTests(cfg.modRequest.projectRoot);
    const result = addUiTestTarget(project, {
      projectName,
      bundleIdentifier,
      testTargetName: TARGET_NAME,
      sourceDir: SOURCE_DIR,
      tests,
    });

    // The scheme file lives beside the project and is not part of modResults.
    const schemePath = path.join(
      cfg.modRequest.platformProjectRoot,
      `${projectName}.xcodeproj`,
      'xcshareddata',
      'xcschemes',
      `${projectName}.xcscheme`,
    );

    if (fs.existsSync(schemePath)) {
      const xml = fs.readFileSync(schemePath, 'utf8');
      const targetUuid =
        result.uuid ||
        (() => {
          const { findTargetUuid } = require('../scripts/ui-test-target.cjs');
          return findTargetUuid(project, TARGET_NAME);
        })();

      const validIds = Object.keys(project.pbxNativeTargetSection()).filter(
        (key) => !key.endsWith('_comment'),
      );
      const updated = addTestTargetToScheme(xml, {
        testTargetName: TARGET_NAME,
        blueprintId: targetUuid,
        validBlueprintIds: validIds,
        projectName,
      });
      if (updated.changed) fs.writeFileSync(schemePath, updated.xml);
    }

    if (result.added && !result.uuid) {
      throw new Error('UI test target was added but produced no identifier.');
    }
    return cfg;
  });

  return config;
};
