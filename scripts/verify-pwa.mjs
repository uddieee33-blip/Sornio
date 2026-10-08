#!/usr/bin/env node

/**
 * Verify the installable app — the manifest, its icons, and the gate in front.
 *
 * Installability regressions are silent by design. Nothing throws when the
 * manifest 404s, when an icon is the wrong size, or when the auth gate starts
 * bouncing the manifest fetch to sign-in: Chrome simply never shows the
 * install prompt, and the shop phone keeps a bookmark instead of an app. No
 * owner reports that, because nothing looks broken.
 *
 * So this script checks what the browser checks, before the browser does:
 *
 *   1. **The manifest parses and carries the required fields.** A missing
 *      `start_url` or an empty `icons` list is a manifest Chrome ignores.
 *   2. **The short name fits a launcher.** Android truncates past 12
 *      characters; a truncated shop name under the icon is the kind of wrong
 *      nobody notices until the phone is in a customer's hand.
 *   3. **The start page sits inside the scope, and the id never moves.**
 *      `start_url` outside `scope` fails installation outright, and `id` is
 *      the app's identity — pinning it to `/` means the start page can move
 *      later without the device treating it as a different app.
 *   4. **The display mode is standalone.** Anything else opens a browser tab
 *      wearing an icon, which is precisely what the installed app is not.
 *   5. **Every icon is the file it claims to be.** Each entry must exist
 *      under `public/`, be a real PNG, and have the pixel dimensions its
 *      `sizes` declares — a 512 entry pointing at a 192 file installs a
 *      blurry tile. The set must include the 192 and 512 Chrome requires,
 *      plus a maskable 512 for the launchers that cut their own shape.
 *   6. **The flattened icons are really flattened.** The maskable icon and
 *      the Apple touch icon must be truecolour with no alpha channel, which
 *      proves no pixel relies on transparency — launchers and iOS fill
 *      transparent pixels unpredictably, usually black.
 *   7. **The Apple touch icon exists and is wired up.** iOS never reads the
 *      manifest; it reads the `apple-touch-icon` link, at exactly 180×180.
 *   8. **The splash colours track the default paint.** `theme_color` and
 *      `background_color` are what the phone paints before any script runs —
 *      the same job as the viewport `theme-color` — so they must equal the
 *      default paint's page, not a hex somebody typed once.
 *   9. **The route reads the manifest; it does not redefine it.** Copy in
 *      two places drifts; `app/manifest.ts` must import
 *      `lib/pwa/manifest.json`, the file every check above reads.
 *  10. **The gate leaves the manifest public.** The fetch comes from the
 *      landing page, before sign-in. `verify:auth` proves the behaviour;
 *      this holds the pairing, so the failure message says what the owner
 *      loses: the install prompt.
 *
 * Run: npm run verify:pwa
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(ROOT, ...parts));

/** Magic bytes, then the IHDR dimensions — no image library required. */
function pngInfo(relativePath) {
  assert(exists('public', relativePath), `${relativePath} is declared but missing from public/`);
  const bytes = fs.readFileSync(path.join(ROOT, 'public', relativePath));
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(bytes.length > 33 && bytes.subarray(0, 8).equals(magic), `${relativePath} is not a PNG`);
  assert(bytes.subarray(12, 16).toString('ascii') === 'IHDR', `${relativePath} has no IHDR chunk`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    // 2 is truecolour without alpha; 6 is truecolour with it. Anything else
    // (greyscale, palette) was never the brand tile.
    colorType: bytes.readUInt8(25),
  };
}

console.log('\nVerifying the installable app\n');

const manifest = JSON.parse(read('lib', 'pwa', 'manifest.json'));

check('the manifest parses and carries the required fields', () => {
  for (const field of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    assert(manifest[field] !== undefined && manifest[field] !== '', `manifest.json is missing ${field}`);
  }
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.json has no icons');
  assertEqual(JSON.stringify(manifest.categories), JSON.stringify(['business', 'finance']), 'the store listing changed');
  assertEqual(manifest.lang, 'en', 'manifest copy is English browser chrome — see app/manifest.ts');
});

check('the short name fits under a launcher icon', () => {
  assert(manifest.short_name.length <= 12, `short_name is ${manifest.short_name.length} characters; Android truncates past 12`);
});

check('the start page sits inside the scope, and the id never moves', () => {
  assertEqual(manifest.id, '/', 'id is the installed identity — it must not follow the start page around');
  assert(
    manifest.start_url === manifest.scope || manifest.start_url.startsWith(manifest.scope.endsWith('/') ? manifest.scope : `${manifest.scope}/`),
    `start_url ${manifest.start_url} is outside scope ${manifest.scope}, which fails installation`,
  );
});

check('the installed app opens standalone, not in a tab', () => {
  assertEqual(manifest.display, 'standalone', 'display');
});

check('every icon is the file it claims to be', () => {
  const seen = new Set();
  for (const icon of manifest.icons) {
    assert(icon.src.startsWith('/brand/'), `${icon.src} lives outside the brand directory`);
    const [declaredWidth, declaredHeight] = String(icon.sizes).split('x').map(Number);
    assert(Number.isInteger(declaredWidth) && declaredWidth > 0, `${icon.src} declares no usable sizes`);
    const info = pngInfo(icon.src.slice(1));
    assertEqual(info.width, declaredWidth, `${icon.src} width`);
    assertEqual(info.height, declaredHeight, `${icon.src} height`);
    assertEqual(icon.type, 'image/png', `${icon.src} type`);
    assert(['any', 'maskable'].includes(icon.purpose), `${icon.src} has purpose ${JSON.stringify(icon.purpose)}`);
    seen.add(`${icon.sizes} ${icon.purpose}`);
  }
  for (const required of ['192x192 any', '512x512 any', '512x512 maskable']) {
    assert(seen.has(required), `no ${required} icon — Chrome requires the first two, shaped launchers the third`);
  }
});

check('the flattened icons carry no transparency', () => {
  for (const file of ['brand/icon-512-maskable.png', 'brand/apple-touch-icon.png']) {
    const info = pngInfo(file);
    assertEqual(info.colorType, 2, `${file} must be truecolour without alpha, or the corners fill black`);
  }
});

check('the Apple touch icon exists, fits, and is wired up', () => {
  const info = pngInfo('brand/apple-touch-icon.png');
  assertEqual(info.width, 180, 'apple-touch-icon width');
  assertEqual(info.height, 180, 'apple-touch-icon height');
  assert(
    read('app', 'layout.tsx').includes("apple: '/brand/apple-touch-icon.png'"),
    'the root layout no longer links the Apple touch icon, so iOS falls back to a screenshot',
  );
});

check('the splash colours track the default paint', () => {
  const paints = JSON.parse(read('lib', 'theme', 'paints.generated.json'));
  const page = paints.paints.find((paint) => paint.id === paints.default)?.page;
  assert(page, 'the default paint has no page colour to track');
  assertEqual(manifest.theme_color, page, 'theme_color drifted from the default paint');
  assertEqual(manifest.background_color, page, 'background_color drifted from the default paint');
});

check('the manifest route reads the manifest file', () => {
  assert(exists('app', 'manifest.ts'), 'app/manifest.ts is missing — /manifest.webmanifest is a 404');
  const route = read('app', 'manifest.ts');
  assert(
    route.includes('@/lib/pwa/manifest.json'),
    'the route must import lib/pwa/manifest.json; copy in two places drifts',
  );
});

check('the gate leaves the manifest public', () => {
  assert(
    read('lib', 'auth', 'routes.ts').includes("'/manifest.webmanifest'"),
    'routes.ts no longer lists the manifest — the pre-sign-in fetch bounces to /auth and the prompt never appears',
  );
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
