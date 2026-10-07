'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { formatCurrency } from '@/lib/business-data';
import { CHART_COLORS } from './ChartTooltip';
import type { Slice } from '@/lib/chart-data';

/** Horizontal bar list — a lightweight chart for category breakdowns. */
export function HBarList({ data }: { data: Slice[] }) {
  useLocaleRefresh();
  const max = Math.max(...data.map((slice) => slice.value), 1);
  return (
    <div className="space-y-3.5">
      {data.map((slice, index) => (
        <div key={slice.name}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700">{slice.name}</span>
            <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(slice.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(slice.value / max) * 100}%`, background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}cc, ${CHART_COLORS[index % CHART_COLORS.length]})` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
