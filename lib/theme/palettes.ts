/**
 * The paints, typed.
 *
 * Pure data and Edge-safe: middleware, the server layout and the client picker
 * all read the same list, so a cookie can never name a paint the app does not
 * ship, and the picker can never advertise one the stylesheet does not define.
 *
 * Appearance is four independent dials rather than one switch:
 *
 *   theme    which paint          10 of them, generated into app/themes.css
 *   density  comfortable/compact  how much air a counter screen can afford
 *   motion   full/calm/off        the multiplier every duration divides by
 *   text     90/100/110/125       root font size, so rem-based layout follows
 *
 * They compose. Night Market + compact + calm + 110% is a supported console,
 * and so is every other combination, because each dial is a separate attribute
 * on <html> and none of them knows about the others.
 */

import manifest from './paints.generated.json';

export type ThemeMode = 'light' | 'dark';

export type Paint = {
  id: string;
  name: string;
  tagline: string;
  mode: ThemeMode;
  /** The page colour, as the stylesheet will actually paint it. */
  page: string;
  /** The card colour. */
  surface: string;
  /** This paint's default accent, before a business type overrides it. */
  accent: string;
  ink: string;
  muted: string;
  line: string;
};

/**
 * Every paint, read from the generator's own output.
 *
 * Reading the manifest rather than re-deriving the colours here is the whole
 * point: a swatch in the picker is the colour `app/themes.css` will paint,
 * because both came out of the same run of `scripts/build-themes.mjs`.
 */
export const PAINTS: Paint[] = manifest.paints.map((paint) => ({
  ...paint,
  mode: paint.mode as ThemeMode,
}));

export const PAINT_IDS: string[] = PAINTS.map((paint) => paint.id);

/** The paint a console starts in before anyone has chosen. */
export const DEFAULT_PAINT = manifest.default;

/** The paint `system` resolves to, per OS preference. */
export const SYSTEM_LIGHT = 'daylight';
export const SYSTEM_DARK = 'midnight';

/**
 * `system` is a selectable value but not a paint: it means "ask the device".
 * Keeping it out of `PAINTS` is what stops it from ever reaching `data-theme`,
 * where it would match no stylesheet block and silently fall back to :root.
 */
export const SYSTEM_PAINT = 'system';

export type PaintChoice = string;

export function isPaintId(value: unknown): value is string {
  return typeof value === 'string' && PAINT_IDS.includes(value);
}

export function isPaintChoice(value: unknown): value is PaintChoice {
  return value === SYSTEM_PAINT || isPaintId(value);
}

export function paintById(id: unknown): Paint {
  return PAINTS.find((paint) => paint.id === id) ?? PAINTS.find((paint) => paint.id === DEFAULT_PAINT)!;
}

/** Light paints and dark paints, for the two groups in the picker. */
export const LIGHT_PAINTS = PAINTS.filter((paint) => paint.mode === 'light');
export const DARK_PAINTS = PAINTS.filter((paint) => paint.mode === 'dark');

/* ---------------------------------------------------------------- the dials */

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const MOTION_LEVELS = ['full', 'calm', 'off'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

export const TEXT_SCALES = ['90', '100', '110', '125'] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export type Appearance = {
  /** A paint id, or `system` to follow the device. */
  theme: PaintChoice;
  density: Density;
  motion: MotionLevel;
  text: TextScale;
  /** Blur every figure marked `data-sensitive` until it is hovered. */
  privacy: boolean;
};

/**
 * The look a first visit gets. It is a chosen paint, not `system`: the sign-in
 * screen is the first thing a new owner sees, and it should read the same on
 * every device. `system` stays one tap away in Appearance for anyone who wants
 * the console to follow their phone or PC.
 */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: DEFAULT_PAINT,
  density: 'comfortable',
  motion: 'full',
  text: '100',
  privacy: false,
};

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

/**
 * Parse anything — a cookie, a `localStorage` blob, an older version of this
 * app's own format — into a valid appearance. Every field falls back
 * independently, so one unrecognised dial never resets the other three.
 */
export function normalizeAppearance(value: unknown): Appearance {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    theme: isPaintChoice(raw.theme) ? raw.theme : DEFAULT_APPEARANCE.theme,
    density: isOneOf(DENSITIES, raw.density) ? raw.density : DEFAULT_APPEARANCE.density,
    motion: isOneOf(MOTION_LEVELS, raw.motion) ? raw.motion : DEFAULT_APPEARANCE.motion,
    text: isOneOf(TEXT_SCALES, raw.text) ? raw.text : DEFAULT_APPEARANCE.text,
    privacy: raw.privacy === true,
  };
}

/* ------------------------------------------------------------- the transport */

/**
 * The appearance cookie.
 *
 * Deliberately **not** httpOnly and deliberately **not** signed: it carries no
 * authority at all. The worst a rewritten value can do is paint the owner's own
 * console a colour they did not pick, which `normalizeAppearance` already
 * bounds to the ten shipped paints. Signing it would imply it protects
 * something, and a security control that protects nothing is noise in the
 * threat model.
 *
 * It exists for one reason: the server has to know the paint *before* it emits
 * `<html>`, or the first frame is the wrong colour. `localStorage` is read too
 * late for that; a cookie is not.
 */
export const APPEARANCE_COOKIE = 'dukaan.look';
export const APPEARANCE_STORAGE_KEY = 'dukaanos.appearance.v1';
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Compact wire form: `theme|density|motion|text|privacy`. */
export function encodeAppearance(appearance: Appearance): string {
  return [
    appearance.theme,
    appearance.density,
    appearance.motion,
    appearance.text,
    appearance.privacy ? '1' : '0',
  ].join('|');
}

export function decodeAppearance(raw: string | undefined | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  const [theme, density, motion, text, privacy] = raw.split('|');
  return normalizeAppearance({ theme, density, motion, text, privacy: privacy === '1' });
}

/**
 * The attributes to put on `<html>`.
 *
 * The server calls this with the cookie value and spreads the result straight
 * onto the element, which is what makes the first paint correct. The client
 * calls the same function and applies the same attributes, so there is exactly
 * one definition of how an appearance becomes a DOM state.
 *
 * `system` is resolved here only when the caller knows the device preference
 * (the client does; the server does not, and says so by passing `null` — in
 * which case the attribute is left off and `prefers-color-scheme` in the
 * stylesheet has the final word for that first frame).
 */
export function appearanceAttributes(
  appearance: Appearance,
  prefersDark: boolean | null,
): Record<string, string> {
  const resolved =
    appearance.theme === SYSTEM_PAINT
      ? prefersDark === null
        ? null
        : prefersDark
          ? SYSTEM_DARK
          : SYSTEM_LIGHT
      : appearance.theme;

  const attributes: Record<string, string> = {
    'data-density': appearance.density,
    'data-motion': appearance.motion,
    'data-text': appearance.text,
  };
  if (resolved) attributes['data-theme'] = resolved;
  if (appearance.privacy) attributes['data-privacy'] = 'on';
  return attributes;
}

/**
 * The `<meta name="theme-color">` value, so the phone's own browser chrome is
 * painted the same colour as the page it is framing. Read from the manifest,
 * which means it cannot drift from the stylesheet.
 */
export function themeColorFor(paintId: string): string {
  return paintById(paintId).page;
}
