'use client';

/**
 * The paint switcher in the top bar.
 *
 * It exists because the single most common appearance action is not "configure
 * my theme", it is "the sun went down and I can't look at this any more". That
 * should be one tap from wherever the owner is standing, not four taps through
 * Settings — so the button itself toggles between the current light paint and
 * the current dark one, and the menu underneath is for actually choosing.
 *
 * The menu remembers the last light paint and the last dark paint separately,
 * so an owner on Night Market + Saffron keeps both halves of their choice when
 * they flip back and forth.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Monitor, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { useAppearance } from '@/lib/theme/appearance-provider';
import { DARK_PAINTS, LIGHT_PAINTS, SYSTEM_PAINT, type Paint } from '@/lib/theme/palettes';

const LAST_LIGHT_KEY = 'dukaanos.paint.lastLight';
const LAST_DARK_KEY = 'dukaanos.paint.lastDark';

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* appearance is never worth an error */
  }
}

function recall(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * One labelled group of paints.
 *
 * Declared at module scope, not inside the switcher. A component defined in a
 * render body is a *new component type* on every render, so React unmounts the
 * old subtree and mounts a fresh one each time — losing focus mid-keyboard-
 * navigation and restarting every transition. The props it used to close over
 * are passed in instead.
 */
function Section({
  label,
  paints,
  current,
  onChoose,
}: {
  label: string;
  paints: Paint[];
  current: string;
  onChoose: (paint: Paint) => void;
}) {
  return (
    <>
      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      {paints.map((paint) => {
        const active = current === paint.id;
        return (
          <button
            key={paint.id}
            type="button"
            onClick={() => onChoose(paint)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-quick ${
              active ? 'bg-portal/10 text-stone-900' : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            {/* The dot is painted by the paint itself, not by a hex we typed. */}
            <span
              data-theme={paint.id}
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink ring-1 ring-inset ring-stone-300"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-portal-gradient" />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{paint.name}</span>
            {active ? <Check size={13} className="shrink-0 text-portal" /> : null}
          </button>
        );
      })}
    </>
  );
}

export function PaintSwitcher({ className = '' }: { className?: string }) {
  const { appearance, resolved, setTheme } = useAppearance();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the two halves of the owner's choice alive across flips.
  useEffect(() => {
    if (appearance.theme === SYSTEM_PAINT) return;
    remember(resolved.mode === 'dark' ? LAST_DARK_KEY : LAST_LIGHT_KEY, resolved.id);
  }, [appearance.theme, resolved.id, resolved.mode]);

  // Close on an outside pointer or on Escape — a popover that traps the owner
  // on a counter is worse than no popover.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const flip = useCallback(() => {
    const goingDark = resolved.mode === 'light';
    setTheme(recall(goingDark ? LAST_DARK_KEY : LAST_LIGHT_KEY, goingDark ? 'midnight' : 'daylight'));
  }, [resolved.mode, setTheme]);

  const choose = (paint: Paint) => {
    setTheme(paint.id);
    setOpen(false);
  };


  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center rounded-xl bg-stone-50 ring-1 ring-inset ring-stone-200">
        <button
          type="button"
          onClick={flip}
          title={`Switch to ${resolved.mode === 'light' ? 'a dark paint' : 'a light paint'}`}
          aria-label={`Switch to ${resolved.mode === 'light' ? 'a dark paint' : 'a light paint'}`}
          className="touch-manipulation flex h-11 w-9 items-center justify-center rounded-l-xl text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 md:h-8"
        >
          {resolved.mode === 'light' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Choose a paint"
          aria-label="Choose a paint"
          className="touch-manipulation flex h-11 w-6 items-center justify-center rounded-r-xl border-l border-stone-200 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:h-8"
        >
          <ChevronDown size={12} className={`transition-transform duration-base ease-settle ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open ? (
        <div
          role="menu"
          className="animate-pop-in absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-60 overflow-y-auto rounded-2xl bg-panel p-1.5 shadow-float ring-1 ring-stone-200"
        >
          <button
            type="button"
            onClick={() => {
              setTheme(SYSTEM_PAINT);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs transition-colors duration-quick ${
              appearance.theme === SYSTEM_PAINT ? 'bg-portal/10 text-stone-900' : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-200">
              <Monitor size={11} />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">Match my device</span>
            {appearance.theme === SYSTEM_PAINT ? <Check size={13} className="shrink-0 text-portal" /> : null}
          </button>

          <Section label="Daylight" paints={LIGHT_PAINTS} current={appearance.theme} onChoose={choose} />
          <Section label="Night" paints={DARK_PAINTS} current={appearance.theme} onChoose={choose} />

          <div className="mt-1.5 border-t border-stone-200 pt-1.5">
            <Link
              href="/settings#appearance"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-600 transition-colors duration-quick hover:bg-stone-100 hover:text-stone-900"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-stone-100 ring-1 ring-inset ring-stone-200">
                <SlidersHorizontal size={11} />
              </span>
              Density, motion, text size…
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The icon-only form, for the public site and the sign-in screen. */
export function PaintSwitcherCompact({ className = '' }: { className?: string }) {
  const { resolved, setTheme } = useAppearance();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolved.mode === 'light' ? 'midnight' : 'daylight')}
      aria-label={`Switch to ${resolved.mode === 'light' ? 'the dark' : 'the light'} paint`}
      title={`Switch to ${resolved.mode === 'light' ? 'the dark' : 'the light'} paint`}
      className={`touch-manipulation inline-flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900 ${className}`}
    >
      {resolved.mode === 'light' ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
