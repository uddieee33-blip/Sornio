'use client';

/**
 * Appearance provider — the client half of the paint system.
 *
 * The server has already written the right attributes onto `<html>` from the
 * appearance cookie, so this component's job is **not** to apply the theme on
 * mount. By the time it runs, the console is already the right colour. What it
 * owns is everything the server could not know:
 *
 *   1. **The device's own preference.** `system` can only be resolved in a
 *      browser, so `prefers-color-scheme` is subscribed to as an external
 *      store and the attribute is reconciled — once, without a render loop.
 *   2. **Changes.** A new choice is written to `localStorage` (the device's
 *      memory) *and* to the cookie (the server's), so the next cold load is
 *      already correct and there is never a flash of the previous paint.
 *   3. **Tab focus.** The privacy screen re-blurs the moment the console stops
 *      being the foreground window, because the shoulder-surf case is someone
 *      picking the device up while the owner is away from it.
 *   4. **Reveal.** `data-reveal="on"` is set only after mount, which is what
 *      makes scroll reveals safe: with JavaScript off, or before hydration,
 *      the content was never hidden in the first place.
 *
 * Nothing here reads `localStorage` during render, and nothing writes an
 * attribute React also owns — the DOM mutation happens in a layout effect
 * against `document.documentElement`, which React does not manage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  APPEARANCE_COOKIE,
  APPEARANCE_COOKIE_MAX_AGE,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  PAINTS,
  SYSTEM_DARK,
  SYSTEM_LIGHT,
  SYSTEM_PAINT,
  appearanceAttributes,
  encodeAppearance,
  normalizeAppearance,
  paintById,
  themeColorFor,
  type Appearance,
  type Density,
  type MotionLevel,
  type Paint,
  type PaintChoice,
  type TextScale,
} from './palettes';

type AppearanceContextValue = {
  appearance: Appearance;
  /** The paint actually on screen — `system` already resolved. */
  resolved: Paint;
  /** True when the device is asking for a dark interface. */
  prefersDark: boolean;
  setTheme: (theme: PaintChoice) => void;
  setDensity: (density: Density) => void;
  setMotion: (motion: MotionLevel) => void;
  setText: (text: TextScale) => void;
  setPrivacy: (privacy: boolean) => void;
  reset: () => void;
  /** All shipped paints, for the picker. */
  paints: Paint[];
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/* ----------------------------------------------- the device's own preference */

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  // `addEventListener` on a MediaQueryList is the modern API; Safari < 14 only
  // has `addListener`. A console on an old iPad should still follow the device.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

const getColorSchemeSnapshot = () => window.matchMedia(DARK_QUERY).matches;

/**
 * The server has no device preference to report. Returning `false` rather than
 * `null` keeps the hook's type simple; the *attribute* for `system` is left
 * off entirely during SSR (see `appearanceAttributes`), so this value never
 * paints anything before the browser has had its say.
 */
const getColorSchemeServerSnapshot = () => false;

function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeToColorScheme, getColorSchemeSnapshot, getColorSchemeServerSnapshot);
}

/* --------------------------------------------------------------- persistence */

function writeCookie(appearance: Appearance) {
  // Lax, not Strict: a link into the console from a WhatsApp renewal reminder
  // should still arrive painted correctly. Not httpOnly and not signed on
  // purpose — see the note in palettes.ts; this cookie carries no authority.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${APPEARANCE_COOKIE}=${encodeURIComponent(
    encodeAppearance(appearance),
  )}; Path=/; Max-Age=${APPEARANCE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function readStoredAppearance(): Appearance | null {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAppearance(JSON.parse(raw));
  } catch {
    // A full disk, a locked-down browser, or private mode. The cookie value the
    // server already used stands; appearance is never worth an error.
    return null;
  }
}

function writeStoredAppearance(appearance: Appearance) {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    /* no-op — see above */
  }
}

/**
 * The stored appearance, as an external store.
 *
 * It would be shorter to read `localStorage` in a mount effect and call
 * `setState`, and that is what this used to do. It is also the pattern React
 * warns about: it renders once with the cookie's answer, then again with the
 * device's, and the second render is a cascading one that can land after the
 * browser has already painted. `useSyncExternalStore` asks the question at the
 * right moment instead — synchronously, before paint, with a server snapshot
 * that keeps hydration honest.
 *
 * Making it a real store buys something the effect never could: the `storage`
 * event. Two tabs open on the same till — the counter in one, reports in the
 * other — now repaint together instead of disagreeing until a reload.
 */
let storedCache: Appearance | null | undefined;
const appearanceListeners = new Set<() => void>();

function getStoredSnapshot(): Appearance | null {
  // Cached: `useSyncExternalStore` compares snapshots by identity, and parsing
  // JSON on every render would hand it a new object every time and loop.
  if (storedCache === undefined) storedCache = readStoredAppearance();
  return storedCache;
}

/** The server has no device to ask. The cookie-derived `initial` stands. */
const getStoredServerSnapshot = (): Appearance | null => null;

function subscribeStored(listener: () => void) {
  appearanceListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
    storedCache = undefined;
    for (const notify of appearanceListeners) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    appearanceListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function publishStored(next: Appearance) {
  storedCache = next;
  for (const listener of appearanceListeners) listener();
}

/* ------------------------------------------------------------------ provider */

export function AppearanceProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Decoded from the cookie on the server, so the first paint is correct. */
  initial?: Appearance;
}) {
  // `localStorage` is the device's memory and the cookie is the server's. They
  // agree almost always; when they do not (cookies cleared, a second browser
  // profile, a shared till that restored a backup), the device wins — it is
  // the one the person in front of the screen actually chose — and the cookie
  // is rewritten to match on the next write.
  const stored = useSyncExternalStore(subscribeStored, getStoredSnapshot, getStoredServerSnapshot);
  const appearance = stored ?? initial ?? DEFAULT_APPEARANCE;
  const prefersDark = usePrefersDark();

  const resolvedId =
    appearance.theme === SYSTEM_PAINT ? (prefersDark ? SYSTEM_DARK : SYSTEM_LIGHT) : appearance.theme;
  const resolved = paintById(resolvedId);

  /**
   * Apply to the document.
   *
   * A layout effect, not an effect: this runs before the browser paints, so a
   * change to `system` (or a restored `localStorage` value that disagrees with
   * the cookie) never shows a frame of the old paint.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const attributes = appearanceAttributes(appearance, prefersDark);
    for (const [key, value] of Object.entries(attributes)) root.setAttribute(key, value);
    if (!appearance.privacy) root.removeAttribute('data-privacy');

    // The phone's own browser chrome, painted to match the page it frames.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeColorFor(resolvedId));
  }, [appearance, prefersDark, resolvedId]);

  // Scroll reveals are opt-in at the document level so that content is never
  // hidden by CSS that only JavaScript knows how to un-hide.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-reveal', 'on');
    return () => document.documentElement.removeAttribute('data-reveal');
  }, []);

  /**
   * Privacy screen, away state.
   *
   * `visibilitychange` catches a tab switch; `blur` catches the whole window
   * losing focus (alt-tab to WhatsApp Web, the owner walking off). Both matter
   * on a shared counter, and both are cheap listeners rather than a timer.
   */
  useEffect(() => {
    if (!appearance.privacy) {
      document.documentElement.removeAttribute('data-away');
      return;
    }
    const root = document.documentElement;
    const away = () => root.setAttribute('data-away', 'true');
    const back = () => root.removeAttribute('data-away');
    const onVisibility = () => (document.hidden ? away() : back());

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', away);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', away);
      window.removeEventListener('focus', back);
      root.removeAttribute('data-away');
    };
  }, [appearance.privacy]);

  // A ref, so the setters below keep a stable identity and the context value
  // does not change on every unrelated render in the tree. Written in an
  // effect rather than during render: a render can be thrown away and
  // restarted, and a ref mutated on a discarded render is a lie the next one
  // inherits.
  const latest = useRef(appearance);
  useEffect(() => {
    latest.current = appearance;
  }, [appearance]);

  const commit = useCallback((next: Appearance) => {
    const safe = normalizeAppearance(next);
    // Set before publishing so a second setter called in the same tick (a
    // settings panel flipping two switches at once) reads the new value.
    latest.current = safe;
    writeStoredAppearance(safe);
    writeCookie(safe);
    publishStored(safe);
  }, []);

  const update = useCallback(
    (patch: Partial<Appearance>) => commit({ ...latest.current, ...patch }),
    [commit],
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolved,
      prefersDark,
      paints: PAINTS,
      setTheme: (theme) => update({ theme }),
      setDensity: (density) => update({ density }),
      setMotion: (motion) => update({ motion }),
      setText: (text) => update({ text }),
      setPrivacy: (privacy) => update({ privacy }),
      reset: () => commit(DEFAULT_APPEARANCE),
    }),
    [appearance, resolved, prefersDark, update, commit],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside AppearanceProvider');
  return context;
}

/**
 * Motion scale as a number, for the few places that animate in JavaScript
 * (the Web Animations API in the route template, the number roll-up) and
 * therefore cannot read a CSS variable.
 */
export function useMotionScale(): number {
  const { appearance } = useAppearance();
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReduced(query.matches);
    sync();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  if (appearance.motion === 'off') return 0;
  // An explicit "full" is the owner overriding their OS — honour it. Anything
  // else defers to the system preference, which is the accessible default.
  if (systemReduced && appearance.motion !== 'full') return 0;
  return appearance.motion === 'calm' ? 0.55 : 1;
}
