#!/usr/bin/env node

/**
 * Verify the motion layer.
 *
 * This script exists because of a specific bug, and it is worth writing down
 * which one. A stat card was given `data-reveal-item` so it would arrive with
 * the rest of its row — but the attribute is only *half* of the contract. The
 * other half is registering with the shared IntersectionObserver, which is
 * what eventually flips the element to visible. The card never registered.
 *
 * Nothing threw. Types passed, lint passed, the build was clean, and every
 * headline figure on four screens was `opacity: 0` forever.
 *
 * That is the shape of every motion bug: the failure is silent and visual, so
 * the only thing that catches it is a check that knows what the contract is.
 *
 * What is verified:
 *
 *   1. **The reveal contract.** Anything emitting `data-reveal-item` must also
 *      emit `data-shown` (the CSS now needs both, so forgetting one yields a
 *      card that does not animate rather than one that does not exist — but a
 *      half-written contract is still a bug, and it should be found here).
 *   2. **Every animation class exists.** `animate-fade-out` is a no-op if
 *      nobody added the keyframe; Tailwind does not warn, the element simply
 *      appears and vanishes. Each `animate-*` used in the codebase is matched
 *      against `tailwind.config.ts` and `globals.css`.
 *   3. **Durations come from the scale.** An arbitrary `duration-[300ms]`
 *      escapes `--motion-scale`, which means it keeps animating after the
 *      owner has set Motion to Off. That setting has to be absolute or it is
 *      not a setting.
 *   4. **Everything is multiplied by `--motion-scale`.** Every duration token
 *      and every named animation in the Tailwind config must be wrapped in
 *      the multiplier, for the same reason.
 *   5. **Reduced motion is still honoured.** The `prefers-reduced-motion`
 *      block has to survive, because the appearance toggle is a *preference*
 *      and the OS setting is a *requirement*.
 *
 * Run: npm run verify:motion
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'components', 'lib'];

const tailwind = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
const globals = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');

const failures = [];
const passed = [];

/** Every .ts/.tsx file under the source roots. */
function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    const dir = path.join(ROOT, root);
    if (fs.existsSync(dir)) walk(dir);
  }
  return files;
}

/**
 * Comments describe the contracts; they do not enter into them.
 *
 * `lib/motion/tokens.ts` documents `[data-reveal-item]` in prose, and a naive
 * substring search reported it as a component that had forgotten the other
 * half. Strip comments first and the check only ever looks at code.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

const files = sourceFiles().map((file) => ({
  path: path.relative(ROOT, file),
  text: withoutComments(fs.readFileSync(file, 'utf8')),
}));

/* ------------------------------------------------- 1. the reveal contract */

const halfWritten = files.filter(
  ({ text }) => text.includes('data-reveal-item') && !text.includes('data-shown'),
);

if (halfWritten.length === 0) {
  passed.push('every data-reveal-item also renders data-shown');
} else {
  for (const { path: where } of halfWritten) {
    failures.push(
      `${where} emits data-reveal-item without data-shown. The attribute is half a contract — the other half is registering with the observer (useRevealOnView) and rendering data-shown="false". Without it the element never animates, and under the old CSS it never appeared at all.`,
    );
  }
}

// Anything that registers with the observer should render the attribute too,
// or it has taken out a subscription to an event that can never reach it.
const orphanHooks = files.filter(
  ({ text, path: where }) =>
    text.includes('useRevealOnView(') &&
    !text.includes('data-reveal-item') &&
    !where.endsWith('reveal.tsx'),
);
for (const { path: where } of orphanHooks) {
  failures.push(`${where} calls useRevealOnView but never renders data-reveal-item, so nothing will ever animate.`);
}
if (orphanHooks.length === 0) passed.push('every useRevealOnView call renders the attribute it observes');

/* --------------------------------------------- 2. animation classes exist */

const used = new Set();
for (const { text } of files) {
  for (const [, name] of text.matchAll(/\banimate-([a-z0-9-]+)/g)) used.add(name);
}

// Tailwind ships these; everything else must be declared by us.
const BUILT_IN = new Set(['spin', 'ping', 'pulse', 'bounce', 'none']);

const declared = new Set();
for (const [, name] of tailwind.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'[a-z0-9-]+ calc\(/gm)) declared.add(name);
for (const [, name] of globals.matchAll(/\.animate-([a-z0-9-]+)\s*\{/g)) declared.add(name);
// Classes applied through globals.css rules rather than a utility.
for (const [, name] of globals.matchAll(/animation:\s*([a-z0-9-]+)\s/g)) declared.add(name);

const missing = [...used].filter((name) => !BUILT_IN.has(name) && !declared.has(name));
if (missing.length === 0) {
  passed.push(`${used.size} animation classes, all declared`);
} else {
  failures.push(
    `these animate-* classes are used but never declared: ${missing.map((n) => `animate-${n}`).join(', ')}. Tailwind does not warn about this — the element simply snaps instead of moving.`,
  );
}

/* ------------------------------------------- 3. no arbitrary durations */

const arbitrary = [];
for (const { path: where, text } of files) {
  for (const [match] of text.matchAll(/\b(?:duration|delay)-\[[^\]]+\]/g)) {
    arbitrary.push(`${where}: ${match}`);
  }
}
if (arbitrary.length === 0) {
  passed.push('no arbitrary duration or delay values');
} else {
  failures.push(
    `arbitrary timing values escape --motion-scale and keep animating after the owner sets Motion to Off: ${arbitrary.join(', ')}. Use the named tokens (duration-instant/quick/base/slow/lazy).`,
  );
}

/* ------------------------------------ 4. everything respects motion-scale */

const durationBlock = tailwind.match(/transitionDuration:\s*\{([\s\S]*?)\n\s{6}\}/);
if (!durationBlock) {
  failures.push('tailwind.config.ts has no transitionDuration scale — the motion tokens are gone.');
} else {
  const unscaled = [...durationBlock[1].matchAll(/^\s*([a-z]+):\s*'([^']+)'/gm)].filter(
    ([, , value]) => !value.includes('--motion-scale'),
  );
  if (unscaled.length === 0) {
    passed.push('every duration token is multiplied by --motion-scale');
  } else {
    failures.push(
      `these duration tokens ignore --motion-scale: ${unscaled.map(([, name]) => name).join(', ')}. Motion: Off has to be a real zero.`,
    );
  }
}

const animationBlock = tailwind.match(/\n\s{6}animation:\s*\{([\s\S]*?)\n\s{6}\}/);
if (animationBlock) {
  const unscaled = [...animationBlock[1].matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'([^']+)'/gm)].filter(
    ([, , value]) => !value.includes('--motion-scale'),
  );
  if (unscaled.length === 0) {
    passed.push('every named animation is multiplied by --motion-scale');
  } else {
    failures.push(
      `these animations ignore --motion-scale: ${unscaled.map(([, name]) => name).join(', ')}.`,
    );
  }
}

/* ------------------------------------------------- 5. reduced motion holds */

if (/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(globals)) {
  passed.push('the prefers-reduced-motion block is intact');
} else {
  failures.push(
    'app/globals.css has no prefers-reduced-motion block. The appearance toggle is a preference; the OS setting is a requirement, and it must hold even when the toggle says Full.',
  );
}

/* -------------------------------------------------------------------- out */

console.log('\nVerifying motion\n');
for (const label of passed) console.log(`  ok    ${label}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${passed.length} invariants hold across ${files.length} source files.\n`);
