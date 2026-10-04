/**
 * Loading placeholders.
 *
 * A layout that reserves its own space and then fills in reads as *fast*; a
 * spinner on an empty page reads as *slow*, even when both take the same time.
 * Every console route renders these during hydration and route transitions, so
 * the page never jumps and never flashes white.
 */

import type { CSSProperties, ReactNode } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`shimmer rounded-lg ${className}`} style={style} aria-hidden />;
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={`h-3.5 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Matches the stat-card grid used across the console. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/[0.06]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-32" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className = 'h-[320px]' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/[0.06] ${className}`} aria-hidden>
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 flex h-[calc(100%-3rem)] items-end gap-2">
        {[62, 40, 78, 52, 88, 46, 70, 34].map((height, index) => (
          <Skeleton key={index} className="flex-1" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]" aria-hidden>
      <div className="flex gap-4 border-b border-white/[0.06] px-5 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-white/[0.04] px-5 py-4 last:border-0">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className={`h-3.5 flex-1 ${columnIndex === 0 ? 'max-w-[220px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Full-route skeleton used by `loading.tsx`. Mirrors the shape of a typical
 * console page (header, stat row, content) so the transition is invisible.
 */
export function ConsolePageSkeleton({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-6 md:px-8 md:py-10" role="status" aria-label="Loading">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-72 max-w-full" />
        {title ? <span className="sr-only">{title}</span> : null}
        <Skeleton className="h-3.5 w-[28rem] max-w-full" />
      </div>
      <SkeletonStatGrid />
      <div className="mt-6">{children ?? <SkeletonChart />}</div>
    </div>
  );
}
