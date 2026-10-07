#!/usr/bin/env node
/**
 * Paint mixer.
 *
 * Turns `lib/theme/palettes.json` into `app/themes.css` — one `[data-theme]`
 * block per paint, each one defining the complete set of colour tokens that
 * `tailwind.config.ts` reads. Nothing in the app hard-codes a colour any more:
 * every `text-stone-600`, `bg-white` and `ring-brand-500/20` already in the
 * codebase resolves through these variables, so a new paint is a data change,
 * not a rewrite of 163 files.
 *
 * Why OKLCH and not hex
 * ---------------------
 * A ramp written in hex goes muddy in the greens and neon in the blues, because
 * sRGB is not perceptual. OKLCH is: pick a lightness, pick a chroma, pick a hue,
 * and every step of every ramp carries the same *apparent* weight. That is what
 * makes ten paints look like ten deliberate designs instead of one design with
 * the hue slider dragged.
 *
 * The one rule that matters
 * -------------------------
 * These ramps are **semantic, not monotonic**. In the console, `text-stone-900`
 * means "the most important text" and `bg-stone-50` means "a surface just off
 * the page" — so in a dark paint the lightness order flips. Likewise
 * `bg-brand-500` is a *filled button with white text on it* while
 * `text-brand-600` is *coloured text on a surface*: in a dark paint the first
 * must stay dark enough for white to read, and the second must go light. The
 * ramps below encode that, which is why 600 is lighter than 500 in dark mode.
 *
 * Run: npm run theme:build   ·   Check: npm run verify:theme
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SOURCE = resolve(root, 'lib/theme/palettes.json');
const TARGET = resolve(root, 'app/themes.css');
const MANIFEST = resolve(root, 'lib/theme/paints.generated.json');

/* ------------------------------------------------------------------ colour */

/** OKLCH → linear sRGB (Björn Ottosson's matrices). */
function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = ([r, g, b]) =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001;

/** Gamma-encode one linear channel to 0–255. */
function encode(channel) {
  const clamped = Math.min(1, Math.max(0, channel));
  const v = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

/**
 * OKLCH → `"r g b"`, with chroma walked down until the colour fits in sRGB.
 *
 * Clipping RGB directly would shift the hue (a too-saturated green clips to a
 * yellower green); reducing chroma keeps the hue and the lightness and gives up
 * only the saturation that the display could not have shown anyway.
 */
function oklch(L, C, hue) {
  let chroma = C;
  let rgb = oklchToLinearSrgb(L, chroma, hue);
  let guard = 0;
  while (!inGamut(rgb) && chroma > 0 && guard++ < 200) {
    chroma = Math.max(0, chroma - 0.002);
    rgb = oklchToLinearSrgb(L, chroma, hue);
  }
  return rgb.map(encode).join(' ');
}

/* ------------------------------------------------------------------- ramps */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/**
 * Neutral lightness, by role rather than by number:
 *   50–300  surfaces and hairlines      600–950  text, darkest last
 *   400–500 icons, dots, disabled text
 *
 * The high-contrast ramps are written out rather than derived, because a
 * formula that darkens text also darkens borders into the surface or lightens
 * them out of existence. Contrast is a set of *pairings*, so the pairings are
 * stated: a hairline at 200 has to stay visible against a card at `--c-white`
 * in the same breath that body text at 600 gets pushed towards the ink.
 */
const NEUTRAL_L = {
  light: [0.988, 0.969, 0.923, 0.869, 0.715, 0.553, 0.444, 0.378, 0.268, 0.216, 0.147],
  dark: [0.242, 0.282, 0.332, 0.396, 0.53, 0.655, 0.752, 0.822, 0.888, 0.945, 0.978],
  lightContrast: [0.995, 0.975, 0.855, 0.775, 0.615, 0.455, 0.355, 0.275, 0.18, 0.1, 0.03],
  darkContrast: [0.2, 0.26, 0.425, 0.525, 0.66, 0.76, 0.845, 0.9, 0.95, 0.985, 1.0],
};

/** Chroma falls away at both ends: tinted mid-greys, honest paper, honest ink. */
const NEUTRAL_C = [0.35, 0.5, 0.7, 0.85, 1, 1, 0.9, 0.78, 0.6, 0.45, 0.3];

/**
 * Accent ramps (brand + every semantic tone) are split by *role*:
 *   50–300  tints behind icons, soft rings
 *   400     dots, borders, small marks
 *   500     FILLED surfaces that carry white text — must stay dark in both modes
 *   600–900 coloured text on a surface — must go light in a dark paint
 *
 * 500 sits at L 0.50 (light) / 0.545 (dark) for one reason: `bg-brand-500`,
 * `bg-emerald-500`, `bg-amber-500` and `bg-red-500` all carry `text-white` in
 * this codebase. Those lightnesses keep white above 4.5:1 on every one of them,
 * in every paint — which is why 500 is *darker* than 600 in a dark paint.
 */
const ACCENT_L = {
  light: [0.968, 0.94, 0.888, 0.805, 0.67, 0.5, 0.448, 0.388, 0.33, 0.276, 0.218],
  dark: [0.3, 0.35, 0.42, 0.51, 0.67, 0.545, 0.76, 0.83, 0.882, 0.928, 0.958],
  // Contrast paints boost chroma by 15%, and in a green a chroma boost *adds*
  // luminance — which quietly eats the contrast between a filled button and
  // its near-white label. The dark contrast paint therefore pins step 500 a
  // little darker to pay the boost back: `verify:theme` holds that pairing to
  // 4.5:1 and caught this at 4.46:1. Only 500 moves, because 500 is the only
  // step that is ever a filled surface under text.
  darkContrast: [0.3, 0.35, 0.42, 0.51, 0.67, 0.515, 0.76, 0.83, 0.882, 0.928, 0.958],
};

const ACCENT_C = [0.2, 0.33, 0.55, 0.78, 0.95, 1, 0.92, 0.8, 0.68, 0.56, 0.45];

/** Semantic hues, in OKLCH degrees. These do not change between paints: red is red. */
const SEMANTIC = {
  emerald: { hue: 158, chroma: 0.14 },
  amber: { hue: 78, chroma: 0.15 },
  red: { hue: 27, chroma: 0.17 },
  rose: { hue: 10, chroma: 0.16 },
  sky: { hue: 236, chroma: 0.14 },
  violet: { hue: 296, chroma: 0.16 },
};

/** Build one ramp as `{ 50: "r g b", … }`. */
function ramp({ hue, chroma }, mode, Ls, Cs, contrast) {
  const key = contrast && Ls[`${mode}Contrast`] ? `${mode}Contrast` : mode;
  const boost = contrast ? 1.15 : 1;
  const out = {};
  STEPS.forEach((step, i) => {
    out[step] = oklch(Ls[key][i], chroma * Cs[i] * boost, hue);
  });
  return out;
}

/* ------------------------------------------------------------------- paints */

function buildTheme(theme) {
  const { mode, neutral, brand, accent, surface } = theme;
  const contrast = theme.contrast === 1;
  const dark = mode === 'dark';

  const lines = [];
  const push = (k, v) => lines.push(`  ${k}: ${v};`);

  push('color-scheme', mode);

  // --- neutrals: the `stone` scale every screen already uses ---------------
  const stone = ramp(neutral, mode, NEUTRAL_L, NEUTRAL_C, contrast);
  for (const step of STEPS) push(`--c-stone-${step}`, stone[step]);

  // --- surfaces ------------------------------------------------------------
  // `white` is the *card* colour. Anything that needs to stay white on a filled
  // accent (button labels, portal headers) reads `--c-onaccent` instead, which
  // globals.css wires to the handful of `text-white` utilities in the app.
  push('--c-white', oklch(surface.card, dark ? neutral.chroma * 0.6 : 0, neutral.hue));
  push('--c-page', oklch(surface.page, dark ? neutral.chroma * 0.7 : neutral.chroma * 0.5, neutral.hue));
  push('--c-lift', oklch(surface.lift, dark ? neutral.chroma * 0.55 : 0, neutral.hue));
  push('--c-onaccent', oklch(0.985, 0.004, neutral.hue));
  push('--c-black', oklch(dark ? 0.06 : 0.1, 0, neutral.hue));

  // --- brand ---------------------------------------------------------------
  const brandRamp = ramp(brand, mode, ACCENT_L, ACCENT_C, contrast);
  for (const step of STEPS) push(`--c-brand-${step}`, brandRamp[step]);

  // --- semantics -----------------------------------------------------------
  for (const [name, spec] of Object.entries(SEMANTIC)) {
    const built = ramp(spec, mode, ACCENT_L, ACCENT_C, contrast);
    for (const step of STEPS) push(`--c-${name}-${step}`, built[step]);
  }

  // --- the portal accent's own default -------------------------------------
  // A business type still repaints the console on top of this; the paint only
  // decides what the accent looks like before a trade has been chosen, and how
  // deep its companion shade goes.
  push('--portal-accent', oklch(dark ? 0.68 : 0.52, accent.chroma, accent.hue));
  push('--portal-accent-deep', oklch(dark ? 0.3 : 0.26, accent.chroma * 0.75, accent.hue));

  // --- depth, light and texture --------------------------------------------
  // Shadows in a light paint are warm ink; in a dark paint a shadow is not a
  // darker colour (there is nothing darker) but a deeper one plus a rim-light
  // on the top edge, which is how depth actually reads on a dark surface.
  push('--c-shadow', oklch(dark ? 0.02 : 0.26, dark ? 0 : 0.02, neutral.hue));
  push('--shadow-strength', dark ? '0.55' : '0.22');
  push('--c-highlight', dark ? 'rgb(255 255 255 / 0.06)' : 'rgb(255 255 255 / 0.92)');
  push('--c-scrollbar', `rgb(${stone[dark ? 500 : 600]} / ${dark ? 0.3 : 0.24})`);
  push('--c-selection-bg', `rgb(${brandRamp[dark ? 600 : 400]} / ${dark ? 0.32 : 0.3})`);
  push('--c-selection-fg', `rgb(${stone[dark ? 950 : 900]})`);
  push('--c-focus', `rgb(${brandRamp[dark ? 600 : 500]} / 0.85)`);
  push('--c-ring-offset', `rgb(${oklch(surface.card, 0, neutral.hue)})`);
  push(
    '--c-glow-a',
    `rgb(${oklch(dark ? 0.6 : 0.72, accent.chroma * 0.9, (accent.hue + 60) % 360)} / ${dark ? 0.1 : 0.12})`,
  );
  push('--c-glow-b', `rgb(${oklch(dark ? 0.55 : 0.6, accent.chroma, accent.hue)} / ${dark ? 0.12 : 0.1})`);
  push(
    '--c-brand-gradient',
    `linear-gradient(135deg, rgb(${brandRamp[500]}) 0%, rgb(${oklch(
      dark ? 0.555 : 0.56,
      brand.chroma * 0.95,
      brand.hue + 10,
    )}) 55%, rgb(${oklch(dark ? 0.555 : 0.55, accent.chroma * 1.1, (accent.hue + 70) % 360)}) 100%)`,
  );

  const body = lines.join('\n');
  const selector = `[data-theme='${theme.id}']`;
  const css = `/* ${theme.name} — ${theme.tagline} */\n${selector} {\n${body}\n}\n`;

  // The manifest is what the picker and the <meta name="theme-color"> read, so
  // a swatch is literally the colour the stylesheet will paint — there is no
  // second table of hexes to fall out of date.
  const hex = (triple) =>
    '#' + triple.split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  const manifest = {
    id: theme.id,
    name: theme.name,
    tagline: theme.tagline,
    mode: theme.mode,
    page: hex(oklch(surface.page, dark ? neutral.chroma * 0.7 : neutral.chroma * 0.5, neutral.hue)),
    surface: hex(oklch(surface.card, dark ? neutral.chroma * 0.6 : 0, neutral.hue)),
    accent: hex(oklch(dark ? 0.68 : 0.52, accent.chroma, accent.hue)),
    ink: hex(stone[dark ? 900 : 900]),
    muted: hex(stone[dark ? 600 : 600]),
    line: hex(stone[200]),
  };

  return { css, manifest, body };
}

/* -------------------------------------------------------------------- main */

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const built = source.themes.map(buildTheme);
const blocks = built.map((entry) => entry.css);

const header = `/*
 * GENERATED FILE — do not edit by hand.
 *
 * Source:    lib/theme/palettes.json
 * Generator: scripts/build-themes.mjs      (npm run theme:build)
 * Check:     scripts/verify-theme.mjs      (npm run verify:theme)
 *
 * ${source.themes.length} paints, each one a complete set of colour tokens. Every Tailwind
 * colour in tailwind.config.ts resolves to one of these variables, so switching
 * the \`data-theme\` attribute on <html> repaints the entire console — including
 * screens nobody remembered to update — without a second stylesheet.
 *
 * The blocks are plain attribute selectors, which means they also work *nested*:
 * put data-theme="midnight" on a preview card and the card is genuinely painted
 * in Midnight. That is how the theme picker renders its previews, so a preview
 * can never drift from the paint it is advertising.
 */

`;

/*
 * The `system` fallback.
 *
 * When the owner has chosen "match my device", the server cannot know which
 * way that resolves, so it omits `data-theme` entirely rather than guessing.
 * These two blocks paint that first frame from the OS preference alone — no
 * script, no flash — and `AppearanceProvider` pins the real attribute in a
 * layout effect immediately afterwards.
 */
const byId = (id) => built.find((entry) => entry.manifest.id === id);
const systemLight = byId('daylight');
const systemDark = byId('midnight');

const fallback = `/* "Match my device" — painted before any script runs. */
html:not([data-theme]) {
${systemLight.body}
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme]) {
${systemDark.body
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
  }
}
`;

writeFileSync(TARGET, header + blocks.join('\n') + '\n' + fallback, 'utf8');

writeFileSync(
  MANIFEST,
  `${JSON.stringify(
    {
      _generated: 'scripts/build-themes.mjs — do not edit; run `npm run theme:build`',
      default: source.default,
      paints: built.map((entry) => entry.manifest),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const count = blocks.join('').split('--c-').length - 1;
console.log(
  `themes: wrote ${source.themes.length} paints (${count} tokens) → app/themes.css + lib/theme/paints.generated.json`,
);
