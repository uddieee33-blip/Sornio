'use client';

/**
 * Appearance — the whole paint shop on one screen.
 *
 * Four dials, each one stated as a plain question an owner can answer without
 * knowing what a "theme token" is: what colour, how tight, how much movement,
 * how big. Every change applies instantly to the console behind the panel —
 * there is no Save button, because there is nothing to validate and nothing
 * that could fail. The choice is written to this device and to a cookie, so
 * the next cold load opens in the same paint with no flash of the old one.
 */

import { Check, Contrast, Eye, EyeOff, Gauge, Monitor, Moon, RotateCcw, Sun, Type, Waves } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { PaintPreview } from './paint-preview';
import { useAppearance } from '@/lib/theme/appearance-provider';
import {
  DARK_PAINTS,
  LIGHT_PAINTS,
  SYSTEM_PAINT,
  type Density,
  type MotionLevel,
  type Paint,
  type TextScale,
} from '@/lib/theme/palettes';

function PaintTile({
  paint,
  selected,
  onSelect,
}: {
  paint: Paint;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-press="soft"
      className={`group relative flex touch-manipulation flex-col gap-2 rounded-2xl p-2.5 text-left transition-all duration-base ease-settle ${
        selected
          ? 'bg-portal/[0.07] ring-2 ring-portal'
          : 'bg-stone-50 ring-1 ring-inset ring-stone-200 hover:bg-stone-100 hover:ring-stone-300'
      }`}
    >
      <PaintPreview paint={paint} className="h-[74px] w-full" />
      <div className="min-w-0 px-0.5">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-bold text-stone-900">
          {paint.name}
          {selected ? <Check size={13} className="shrink-0 text-portal" /> : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-600">{paint.tagline}</p>
      </div>
    </button>
  );
}

function Choice<T extends string>({
  value,
  current,
  onSelect,
  children,
}: {
  value: T;
  current: T;
  onSelect: (value: T) => void;
  children: React.ReactNode;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`touch-manipulation inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-quick ease-settle ${
        active
          ? 'bg-portal-gradient text-white shadow-glow-sm'
          : 'bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      {children}
    </button>
  );
}

function Dial({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3.5 ring-1 ring-inset ring-stone-200">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-stone-700 ring-1 ring-inset ring-stone-200">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600">{hint}</p>
        </div>
      </div>
      <div className="mt-3 flex items-stretch gap-1.5">{children}</div>
    </div>
  );
}

export function AppearancePanel() {
  const { appearance, resolved, prefersDark, setTheme, setDensity, setMotion, setText, setPrivacy, reset } =
    useAppearance();

  const systemSelected = appearance.theme === SYSTEM_PAINT;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle icon={<Waves size={15} />}>Appearance</CardTitle>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-stone-50 px-3 py-1.5 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900"
        >
          <RotateCcw size={12} /> Reset to defaults
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Ten paints, and three dials that have nothing to do with colour. Everything applies the moment you tap it and is
        remembered on this device — including by the server, so the console opens in the right paint instead of flashing
        white first.
      </p>

      {/* ---------------------------------------------------------- match device */}
      <button
        type="button"
        onClick={() => setTheme(SYSTEM_PAINT)}
        aria-pressed={systemSelected}
        data-press="soft"
        className={`mt-5 flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3.5 text-left transition-all duration-base ease-settle ${
          systemSelected
            ? 'bg-portal/[0.07] ring-2 ring-portal'
            : 'bg-stone-50 ring-1 ring-inset ring-stone-200 hover:bg-stone-100'
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-stone-700 ring-1 ring-inset ring-stone-200">
          <Monitor size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
            Match my device
            {systemSelected ? <Check size={14} className="text-portal" /> : null}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-600">
            Warm Daylight by day, Midnight when the phone or the PC switches over.{' '}
            <span className="font-semibold text-stone-700">
              Right now your device is asking for {prefersDark ? 'dark' : 'light'}.
            </span>
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-600 ring-1 ring-inset ring-stone-200 sm:flex">
          {prefersDark ? <Moon size={11} /> : <Sun size={11} />}
          {resolved.name}
        </span>
      </button>

      {/* ------------------------------------------------------------- the paints */}
      <div className="mt-6">
        <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">
          <Sun size={11} /> Daylight paints
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {LIGHT_PAINTS.map((paint) => (
            <PaintTile
              key={paint.id}
              paint={paint}
              selected={appearance.theme === paint.id}
              onSelect={() => setTheme(paint.id)}
            />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">
          <Moon size={11} /> After the shutter comes down
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {DARK_PAINTS.map((paint) => (
            <PaintTile
              key={paint.id}
              paint={paint}
              selected={appearance.theme === paint.id}
              onSelect={() => setTheme(paint.id)}
            />
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------------- the dials */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Dial
          icon={<Gauge size={14} />}
          title="Density"
          hint="Compact tightens the padding so a 13-inch till shows twenty rows of a bill instead of twelve. Tap targets stay the same size — a smaller button on a touch screen is a mis-tap, not a saving."
        >
          <Choice<Density> value="comfortable" current={appearance.density} onSelect={setDensity}>
            Comfortable
          </Choice>
          <Choice<Density> value="compact" current={appearance.density} onSelect={setDensity}>
            Compact
          </Choice>
        </Dial>

        <Dial
          icon={<Waves size={14} />}
          title="Motion"
          hint="One multiplier that every animation in the console divides by. Calm halves it; Off means off, not faster. If your device already asks for reduced motion, that is honoured unless you pick Full here on purpose."
        >
          <Choice<MotionLevel> value="full" current={appearance.motion} onSelect={setMotion}>
            Full
          </Choice>
          <Choice<MotionLevel> value="calm" current={appearance.motion} onSelect={setMotion}>
            Calm
          </Choice>
          <Choice<MotionLevel> value="off" current={appearance.motion} onSelect={setMotion}>
            Off
          </Choice>
        </Dial>

        <Dial
          icon={<Type size={14} />}
          title="Text size"
          hint="Scales the root font size, so every measurement in the console follows it and the frame stays where it is. Browser zoom scales the layout too, which is what breaks a fixed sidebar on a small screen."
        >
          {(['90', '100', '110', '125'] as TextScale[]).map((size) => (
            <Choice<TextScale> key={size} value={size} current={appearance.text} onSelect={setText}>
              {size}%
            </Choice>
          ))}
        </Dial>

        <div className="rounded-2xl bg-stone-50 p-3.5 ring-1 ring-inset ring-stone-200">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-stone-700 ring-1 ring-inset ring-stone-200">
              <Contrast size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-stone-900">Privacy screen</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600">
                Blurs every figure on screen until you hover or tap it, and re-blurs the instant this window loses focus.
                A shop counter is a public place. It is a screen, not encryption — the real lock is the PIN below.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-stretch gap-1.5">
            <Choice<'off' | 'on'>
              value="off"
              current={appearance.privacy ? 'on' : 'off'}
              onSelect={() => setPrivacy(false)}
            >
              <Eye size={13} /> Off
            </Choice>
            <Choice<'off' | 'on'>
              value="on"
              current={appearance.privacy ? 'on' : 'off'}
              onSelect={() => setPrivacy(true)}
            >
              <EyeOff size={13} /> Blur figures
            </Choice>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">
        Paints are generated from one file (<code className="font-mono">lib/theme/palettes.json</code>) in OKLCH, which
        is why every ramp carries the same weight across ten very different colours instead of going muddy in the greens.
        The contrast pairings that matter — body text on a card, a hairline against a surface, a white label on a filled
        button — are checked by <code className="font-mono">npm run verify:theme</code> on every build.
      </p>
    </Card>
  );
}
