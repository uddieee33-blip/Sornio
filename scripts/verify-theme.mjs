#!/usr/bin/env node

/**
 * Verify every paint.
 *
 * A theme switcher is the easiest feature in the product to ship broken,
 * because nothing throws. A paint with grey-on-grey body text renders
 * perfectly, passes typecheck, passes lint, and is only discovered by a
 * shopkeeper squinting at a screen in the afternoon. The build cannot be
 * allowed to depend on somebody remembering to look at all ten.
 *
 * So this script does what a person would do if they had the patience: for
 * each paint, it reads the generated CSS variables and measures the contrast
 * of the pairings that actually appear on screen.
 *
 * What is checked, and why each one is here rather than a longer list:
 *
 *   1. **Body text on every surface it lands on** — page, card, raised panel.
 *      WCAG AA, 4.5:1. This is the whole product; everything else is garnish.
 *   2. **Muted text on the same surfaces.** 4.5:1 too, *not* the 3:1 that
 *      large text is allowed, because our muted text is 11–13px. "Muted" is a
 *      tone, never a licence to be unreadable.
 *   3. **The label on a filled accent button.** 4.5:1. The single most
 *      clicked pixel in the console — if `--c-onaccent` and `--c-brand-500`
 *      drift apart, the primary action goes invisible.
 *   4. **Hairlines against their surface.** 1.25:1 *minimum* — a border that
 *      matches its background is not a border — and a sanity ceiling, because
 *      a hairline at 6:1 is not a hairline, it is a box.
 *   5. **Ramp direction.** Our ramps are semantic, not monotonic: in a dark
 *      paint `stone-900` is near-white. The check is therefore not "50 is
 *      lighter than 900" but "50 is the surface end and 900 is the text end,
 *      consistently, in this paint's mode" — the property every component
 *      silently relies on.
 *   6. **Contrast paints clear the higher bar.** `clarity` and `nocturne`
 *      exist for people who cannot read the others. If they only meet the
 *      same 4.5:1, they are a lie told in a settings menu — so they are held
 *      to 7:1, WCAG AAA.
 *   7. **The generated files match their source.** The CSS and the JSON are
 *      committed artefacts; if `palettes.json` moved and nobody re-ran
 *      `theme:build`, every check above was performed on a stale file.
 *
 * Run: npm run verify:theme   ·   Regenerate: npm run theme:build
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const CSS_FILE = path.join(ROOT, 'app', 'themes.css');
const JSON_FILE = path.join(ROOT, 'lib', 'theme', 'paints.generated.json');
const SOURCE_FILE = path.join(ROOT, 'lib', 'theme', 'palettes.json');
const BUILDER = path.join(ROOT, 'scripts', 'build-themes.mjs');

const AA = 4.5;
const AAA = 7;
// A decorative hairline has no WCAG floor — 1.4.11 governs controls, not
// rules between sections. 1.10 is set to catch the thing that actually goes
// wrong (a border token that collapsed into its own surface and draws
// nothing), not to legislate taste. The industry default, Tailwind's
// stone-200 on stone-50, sits at 1.16 and is perfectly legible.
const HAIRLINE_MIN = 1.1;
const HAIRLINE_MAX = 6;
/** WCAG 2.2 SC 1.4.11, which *does* bind: a focus indicator must hit 3:1. */
const FOCUS_MIN = 3;
const CONTRAST_PAINTS = new Set(['clarity', 'nocturne']);

const failures = [];
const warnings = [];

/* ------------------------------------------------------------------ colour */

/** `"247 246 243"` → `[247, 246, 243]`. */
function parseRgb(value) {
  const parts = String(value).trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return parts;
}

/**
 * `"rgb(62 120 78 / 0.85)"` → `{ rgb, alpha }`.
 *
 * The focus ring is translucent, and a translucent colour has no contrast of
 * its own — only the contrast of what it becomes once the surface behind it
 * shows through. Measuring the raw value would pass a ring that disappears.
 */
function parseRgbFunction(value) {
  const match = String(value).match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/);
  if (!match) return null;
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** Flatten a translucent colour onto the surface it sits on. */
function composite({ rgb, alpha }, backdrop) {
  return rgb.map((channel, i) => Math.round(channel * alpha + backdrop[i] * (1 - alpha)));
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const fmt = (ratio) => `${ratio.toFixed(2)}:1`;

/* --------------------------------------------------------------- the paints */

/**
 * Read every `[data-theme='x'] { … }` block out of the generated stylesheet.
 *
 * Parsed from the CSS rather than from `paints.generated.json` on purpose: the
 * JSON holds a six-colour summary for the preview swatches, while the CSS is
 * what the browser actually applies. Checking the summary would prove the
 * swatch is fine and nothing about the screen.
 */
function readPaints() {
  if (!fs.existsSync(CSS_FILE)) {
    failures.push(`${path.relative(ROOT, CSS_FILE)} is missing. Run \`npm run theme:build\`.`);
    return new Map();
  }
  const css = fs.readFileSync(CSS_FILE, 'utf8');
  const paints = new Map();
  const blocks = css.matchAll(/\[data-theme='([a-z0-9-]+)'\]\s*\{([^}]*)\}/g);
  for (const [, id, body] of blocks) {
    const tokens = new Map();
    for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(name, value.trim());
    }
    tokens.set('__scheme', /color-scheme:\s*dark/.test(body) ? 'dark' : 'light');
    paints.set(id, tokens);
  }
  return paints;
}

function token(tokens, name) {
  const raw = tokens.get(`c-${name}`);
  if (raw === undefined) return null;
  return parseRgb(raw);
}

/* ---------------------------------------------------------------- the rules */

function checkPaint(id, tokens) {
  const strict = CONTRAST_PAINTS.has(id);
  const floor = strict ? AAA : AA;
  const mode = tokens.get('__scheme');

  const need = (name) => {
    const value = token(tokens, name);
    if (!value) failures.push(`[${id}] missing token --c-${name}`);
    return value;
  };

  const page = need('page');
  const card = need('white');
  const lift = need('lift');
  const text = need('stone-900');
  const muted = need('stone-600');
  const line = need('stone-200');
  const accent = need('brand-500');
  const onAccent = need('onaccent');
  const ramp50 = need('stone-50');

  if (!page || !card || !lift || !text || !muted || !line || !accent || !onAccent || !ramp50) return;

  /* 1 + 2 — text on every surface it lands on. */
  const surfaces = [
    ['the page background', page],
    ['a card', card],
    ['a raised panel', lift],
  ];

  for (const [where, surface] of surfaces) {
    const body = contrast(text, surface);
    if (body < floor) {
      failures.push(`[${id}] body text on ${where} is ${fmt(body)}, below ${floor}:1.`);
    }
    const sub = contrast(muted, surface);
    if (sub < floor) {
      failures.push(
        `[${id}] muted text on ${where} is ${fmt(sub)}, below ${floor}:1. Muted is a tone, not a licence to be unreadable.`,
      );
    }
  }

  /* 3 — the label on the primary button. */
  const button = contrast(onAccent, accent);
  if (button < AA) {
    failures.push(
      `[${id}] the label on a filled accent button is ${fmt(button)}, below ${AA}:1. --c-onaccent and --c-brand-500 have drifted apart.`,
    );
  }

  /* 4 — hairlines must be visible without becoming boxes. */
  for (const [where, surface] of [
    ['a card', card],
    ['the page', page],
  ]) {
    const edge = contrast(line, surface);
    if (edge < HAIRLINE_MIN) {
      failures.push(`[${id}] the hairline on ${where} is ${fmt(edge)} — invisible. A border that matches its surface is not a border.`);
    } else if (edge > HAIRLINE_MAX) {
      warnings.push(`[${id}] the hairline on ${where} is ${fmt(edge)} — that reads as a box, not a rule.`);
    }
  }

  /* 4b — the focus ring, which WCAG genuinely does bind at 3:1. Composited
     first, because it is drawn at 85% opacity and a ring is only as visible
     as what it becomes over the surface behind it. */
  const focusRaw = tokens.get('c-focus');
  const focus = focusRaw ? parseRgbFunction(focusRaw) : null;
  if (!focus) {
    failures.push(`[${id}] missing or unreadable --c-focus (${focusRaw ?? 'absent'}).`);
  } else {
    for (const [where, surface] of surfaces) {
      const ring = contrast(composite(focus, surface), surface);
      if (ring < FOCUS_MIN) {
        failures.push(
          `[${id}] the focus ring on ${where} is ${fmt(ring)}, below WCAG 1.4.11's ${FOCUS_MIN}:1. ` +
            'Keyboard users lose their place.',
        );
      }
    }
  }

  /* 5 — ramp direction, by mode rather than by number. */
  const surfaceEnd = luminance(ramp50);
  const textEnd = luminance(text);
  if (mode === 'light' && surfaceEnd <= textEnd) {
    failures.push(`[${id}] is a light paint but stone-50 is darker than stone-900. The ramp is inverted.`);
  }
  if (mode === 'dark' && surfaceEnd >= textEnd) {
    failures.push(`[${id}] is a dark paint but stone-50 is lighter than stone-900. The ramp is inverted.`);
  }

  /*
   * The card must be distinguishable from the page behind it — otherwise the
   * layout flattens into one sheet and nothing reads as a separate thing.
   *
   * Except in a contrast paint, where flattening is the *point*: every unit
   * of tone spent separating two surfaces is a unit not spent on text, and
   * someone using `clarity` or `nocturne` needs the text. There the card edge
   * is carried by the hairline instead, so the exemption is conditional on
   * that hairline actually being drawn strongly enough to do the job.
   */
  const layering = contrast(card, page);
  const edgeOnCard = contrast(line, card);
  if (layering < 1.02) {
    if (!strict) {
      failures.push(`[${id}] a card is indistinguishable from the page behind it (${fmt(layering)}).`);
    } else if (edgeOnCard < 1.5) {
      failures.push(
        `[${id}] flattens card and page (${fmt(layering)}) but its hairline is only ${fmt(edgeOnCard)} — ` +
          'a contrast paint may drop the tonal step only if the border carries the edge instead.',
      );
    }
  }

  return {
    id,
    mode,
    strict,
    body: contrast(text, card),
    muted: contrast(muted, card),
    button,
  };
}

/* ------------------------------------------------------- freshness of build */

/**
 * Re-run the generator into a temporary directory and compare.
 *
 * Cheaper than it sounds, and it closes the one hole that makes every other
 * check meaningless: a palette edited in `palettes.json` with nobody running
 * `theme:build`, so the committed CSS — the thing we just measured — belongs
 * to a design that no longer exists.
 */
function checkFreshness() {
  if (!fs.existsSync(SOURCE_FILE) || !fs.existsSync(BUILDER)) return;
  const before = fs.readFileSync(CSS_FILE, 'utf8');
  const beforeJson = fs.existsSync(JSON_FILE) ? fs.readFileSync(JSON_FILE, 'utf8') : '';
  try {
    execFileSync(process.execPath, [BUILDER], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    failures.push(`scripts/build-themes.mjs failed to run: ${error.message}`);
    return;
  }
  const after = fs.readFileSync(CSS_FILE, 'utf8');
  const afterJson = fs.existsSync(JSON_FILE) ? fs.readFileSync(JSON_FILE, 'utf8') : '';
  if (before !== after || beforeJson !== afterJson) {
    failures.push(
      'The generated paints are stale — lib/theme/palettes.json has changed since `npm run theme:build` was last run. ' +
        'The files have been regenerated in place; review and commit them.',
    );
  }
}

/* -------------------------------------------------------------------- main */

console.log('\nVerifying paints\n');

checkFreshness();

const paints = readPaints();

if (paints.size === 0) {
  failures.push('No paints found in app/themes.css.');
}

const rows = [];
for (const [id, tokens] of paints) {
  const row = checkPaint(id, tokens);
  if (row) rows.push(row);
}

/* Default must exist, and both contrast paints must be present — they are the
   accessibility promise the Appearance panel makes in writing. */
const generated = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : null;
if (generated && !paints.has(generated.default)) {
  failures.push(`The default paint "${generated.default}" has no block in app/themes.css.`);
}
for (const id of CONTRAST_PAINTS) {
  if (!paints.has(id)) failures.push(`The high-contrast paint "${id}" is missing. It is promised in Appearance.`);
}

/* The cascade, not just the generated file. `html` and `:root` are one element,
   so a palette token declared on a bare `:root` block ties every
   `[data-theme]` block on specificity and wins by source order. That repainted
   every dark paint with Warm Daylight values, and none of the checks above could
   see it, because they read the generated variables rather than the cascade.
   Any `--c-*` palette token on a `:root` block that is not qualified by
   `:not([data-theme])` is therefore a failure. */
const globalsCss = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const block of globalsCss.matchAll(/(^|\n)\s*:root(?![\w:-])([^{]*)\{([^}]*)\}/g)) {
  const selector = block[2].trim();
  const body = block[3];
  if (/--c-/.test(body) && !/:not\(\[data-theme\]\)/.test(selector)) {
    failures.push(`app/globals.css sets palette tokens on a bare :root block, which overrides every paint. Qualify it with :not([data-theme]).`);
    break;
  }
}

const width = Math.max(...rows.map((row) => row.id.length), 8);
for (const row of rows) {
  const mark = row.strict ? '★' : ' ';
  console.log(
    `  ok  ${mark} ${row.id.padEnd(width)}  ${row.mode.padEnd(5)}  body ${fmt(row.body).padStart(8)}` +
      `   muted ${fmt(row.muted).padStart(8)}   button ${fmt(row.button).padStart(8)}`,
  );
}

for (const warning of warnings) console.log(`\n  warn  ${warning}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  `\n${rows.length} paints verified. Body and muted text clear WCAG AA on every surface` +
    ` (AAA on ${[...CONTRAST_PAINTS].join(' and ')}), and the generated files match lib/theme/palettes.json.\n`,
);
