'use client';

/**
 * The figure card used across every cockpit.
 *
 * Three things changed when the theme engine and the motion layer landed:
 *
 *   1. **No hex.** The tones were six hardcoded light-theme colours, which on
 *      a dark paint put a mid-green line on a near-black card — technically
 *      visible, actually unreadable. They now read the paint's own ramps, so
 *      a sparkline is always the green *of the theme the owner chose*.
 *   2. **The number counts.** Only on arrival, and only ever from a stable
 *      start, so a figure that re-renders because something else on the page
 *      changed does not re-roll and make the owner look twice.
 *   3. **It can be sensitive.** The day's takings on a counter facing the
 *      street is the single most shoulder-surfed number in the product, so
 *      the card opts into the privacy screen like every other figure.
 *
 * `value` stays a *string*, because formatting money is the caller's job and
 * always has been — `₹1.2L`, `₹1,20,000` and `1,200 units` are not the same
 * decision. When the caller also passes `numeric`, the card animates towards
 * it and formats each frame through the same function that produced `value`.
 */

import type { LucideIcon } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { AnimatedNumber } from '@/components/motion/animated-number';

export type StatTone = 'emerald' | 'blue' | 'violet' | 'amber' | 'brand' | 'rose';

const chipTones: Record<StatTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
  blue: 'bg-sky-500/10 text-sky-700 ring-sky-500/20',
  violet: 'bg-violet-500/10 text-violet-700 ring-violet-500/20',
  amber: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',
  brand: 'bg-brand-500/10 text-brand-600 ring-brand-500/20',
  rose: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',
};

/** Line colour. 600 rather than 500: a 2px stroke needs the darker step to hold. */
const sparkTones: Record<StatTone, string> = {
  emerald: 'rgb(var(--c-emerald-600) / 1)',
  blue: 'rgb(var(--c-sky-600) / 1)',
  violet: 'rgb(var(--c-violet-600) / 1)',
  amber: 'rgb(var(--c-amber-600) / 1)',
  brand: 'rgb(var(--c-brand-600) / 1)',
  rose: 'rgb(var(--c-rose-600) / 1)',
};

const fillTones: Record<StatTone, string> = {
  emerald: 'rgb(var(--c-emerald-500) / 0.12)',
  blue: 'rgb(var(--c-sky-500) / 0.12)',
  violet: 'rgb(var(--c-violet-500) / 0.12)',
  amber: 'rgb(var(--c-amber-500) / 0.12)',
  brand: 'rgb(var(--c-brand-500) / 0.14)',
  rose: 'rgb(var(--c-rose-500) / 0.12)',
};

type StatCardProps = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: StatTone;
  delta?: string;
  deltaTone?: 'up' | 'down';
  spark?: number[];
  /** The raw figure behind `value`. Supply it with `format` to make it count. */
  numeric?: number;
  /** Must produce the same string as `value` when given `numeric`. */
  format?: (value: number) => string;
  /** Blur until hovered, and re-blur when the window loses focus. */
  sensitive?: boolean;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  delta,
  deltaTone = 'up',
  spark,
  numeric,
  format,
  sensitive = false,
}: StatCardProps) {
  const countable = typeof numeric === 'number' && Number.isFinite(numeric) && typeof format === 'function';

  return (
    <div
      data-reveal-item
      // `transition-[transform,box-shadow,border-color]`, never `transition-all`:
      // `all` animates the ring and background too, which forces paint on a
      // card that is already hovering a blurred radial gradient.
      className="group relative overflow-hidden rounded-2xl bg-stone-50 p-5 shadow-card ring-1 ring-stone-200 transition-[transform,box-shadow] duration-slow ease-settle hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-400/30"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.10] blur-2xl transition-opacity duration-slow ease-swift group-hover:opacity-[0.2]"
        style={{ backgroundColor: sparkTones[tone] }}
      />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-stone-600">{label}</p>
          {countable ? (
            <AnimatedNumber
              value={numeric}
              format={format}
              sensitive={sensitive}
              className="mt-2 block truncate font-display text-2xl font-bold tracking-tight text-stone-900 tabular-nums"
            />
          ) : (
            <p
              data-sensitive={sensitive || undefined}
              className="mt-2 truncate font-display text-2xl font-bold tracking-tight text-stone-900 tabular-nums"
            >
              {value}
            </p>
          )}
        </div>
        {Icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${chipTones[tone]}`}
          >
            <Icon size={19} strokeWidth={2.2} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex h-9 items-end justify-between gap-3">
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${deltaTone === 'up' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-red-500/20'}`}
          >
            {deltaTone === 'up' ? '▲' : '▼'} {delta}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} width={104} height={34} stroke={sparkTones[tone]} fill={fillTones[tone]} />
        ) : null}
      </div>
    </div>
  );
}
