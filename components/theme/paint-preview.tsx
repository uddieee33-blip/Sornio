'use client';

/**
 * A paint swatch that is not a swatch.
 *
 * Three coloured dots tell an owner nothing about whether they will be able to
 * read their own takings in Night Market at 9pm. So the preview is a *working
 * miniature of the console*: the same card, the same hairline, the same
 * secondary text, the same accent button.
 *
 * The trick is one attribute. `app/themes.css` defines every paint as a plain
 * `[data-theme='…']` block, and CSS custom properties inherit — so putting
 * `data-theme="midnight"` on this div makes everything inside it genuinely
 * Midnight, painted by the same stylesheet that will paint the real console.
 * A preview therefore cannot drift from the paint it is advertising, because
 * there is no second definition of the paint to drift from.
 */

import type { Paint } from '@/lib/theme/palettes';

export function PaintPreview({ paint, className = '' }: { paint: Paint; className?: string }) {
  return (
    <div
      data-theme={paint.id}
      aria-hidden
      className={`overflow-hidden rounded-xl bg-ink ring-1 ring-inset ring-stone-200 ${className}`}
    >
      <div className="flex h-full flex-col gap-1.5 p-2">
        {/* Top bar */}
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-portal-gradient" />
          <span className="h-1 w-8 rounded-full bg-stone-300" />
          <span className="ml-auto h-1 w-4 rounded-full bg-stone-200" />
        </div>

        {/* A stat card, which is the screen an owner actually stares at */}
        <div className="rounded-lg bg-white p-1.5 shadow-card ring-1 ring-stone-200">
          <span className="block h-1 w-6 rounded-full bg-stone-400" />
          <span className="mt-1 block h-2 w-10 rounded-full bg-stone-900" />
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="h-1 w-5 rounded-full bg-emerald-700/60" />
          </div>
        </div>

        {/* The accent action */}
        <div className="flex items-center gap-1">
          <span className="h-3 flex-1 rounded-md bg-portal-gradient" />
          <span className="h-3 w-5 rounded-md bg-stone-100 ring-1 ring-inset ring-stone-200" />
        </div>
      </div>
    </div>
  );
}
