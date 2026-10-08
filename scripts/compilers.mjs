/**
 * Which TypeScript runs when — and why two of them are installed.
 *
 * This is not a migration left half-finished, and neither copy is spare:
 *
 *   `typescript` 6.x          the JavaScript API (lib/typescript.js)
 *   `typescript-native` 7.x   the native compiler, `tsgo` — no JavaScript API
 *
 * TypeScript 7 is the native port. It is fast, it is where the language is
 * going, and `require('typescript')` under 7.x hands back a version string and
 * nothing else. Three things in this repository consume that API rather than
 * the command line, so `typescript` has to stay on the API line until they can
 * move:
 *
 *   1. typescript-eslint, which `eslint-config-next` configures — every typed
 *      lint rule in the project. It refuses to start against a 7.x
 *      `typescript` rather than linting without types.
 *   2. `scripts/extract-i18n.mjs`, which walks the tree with
 *      `ts.createSourceFile`. Without the API the i18n gate cannot run, and a
 *      gate that cannot run is how 22 locales quietly fill up with English.
 *   3. Next's own build-time type check.
 *
 * So the native compiler is installed *beside* the API one and run as its own
 * gate — `npm run typecheck:native` — which is what keeps the source tree
 * TS-7-clean today instead of on the day typescript-eslint can read the native
 * API (tracked upstream as typescript-eslint#10940). When that lands, the two
 * slots collapse and this file is the one place that has to change.
 *
 * Callers resolve the compiler by package path and never through
 * `node_modules/.bin`: both packages ship an executable named `tsc`, npm links
 * whichever it installs last, and a gate that runs "whichever compiler won the
 * race" is not a gate.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * The slots are described by *capability*, not by version number: bumping a
 * package is then free, and losing the thing we depend on is what fails.
 */
const SLOTS = {
  api: {
    package: 'typescript',
    label: 'the JavaScript-API compiler',
    // lib/typescript.js is the API itself, and is exactly what 7.x stopped
    // shipping. If it is missing, this slot no longer holds an API compiler
    // whatever its version string says.
    requires: [join('lib', 'tsc.js'), join('lib', 'typescript.js')],
  },
  native: {
    package: 'typescript-native',
    label: 'the native compiler (tsgo)',
    requires: [join('lib', 'tsc.js')],
  },
};

/**
 * Resolve one of the two compilers.
 *
 * @param {'api' | 'native'} slot
 * @param {string} [root] repository root, for callers that already resolved it
 * @returns {{ package: string, label: string, version: string, file: string }}
 *          where `file` is the compiler entry point, to be run with `node`.
 */
export function compiler(slot, root = ROOT) {
  const spec = SLOTS[slot];
  if (!spec) throw new Error(`Unknown compiler slot “${slot}” — expected “api” or “native”.`);

  const dir = join(root, 'node_modules', spec.package);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) {
    throw new Error(`“${spec.package}” is not installed. Run \`npm ci\`.`);
  }

  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  for (const relative of spec.requires) {
    if (!existsSync(join(dir, relative))) {
      throw new Error(
        `“${spec.package}” ${version} does not look like ${spec.label}: it has no ${relative}. ` +
          'The two-compiler split is documented at the top of scripts/compilers.mjs — ' +
          'read that before moving a package between slots.',
      );
    }
  }

  return { package: spec.package, label: spec.label, version, file: join(dir, 'lib', 'tsc.js') };
}
