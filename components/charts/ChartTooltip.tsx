'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { formatCurrency } from '@/lib/business-data';

type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> };

export function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: TooltipEntry[]; label?: string; money?: boolean }) {
  useLocaleRefresh();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-stone-200 bg-panel/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      {label ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">{label}</p> : null}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2 text-sm font-semibold text-stone-900 tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? '#28623b' }} />
          {entry.name ? <span className="font-medium text-stone-600">{entry.name}:</span> : null}
          {money && typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

export const CHART_COLORS = ['#28623b', '#22677f', '#a83f54', '#287347', '#a16c1c', '#674594', '#b84c58'];
