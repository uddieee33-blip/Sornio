import { formatCurrency } from '@/lib/business-data';

type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> };

export function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: TooltipEntry[]; label?: string; money?: boolean }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#161a23]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      {label ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p> : null}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2 text-sm font-semibold text-white tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? '#818cf8' }} />
          {entry.name ? <span className="font-medium text-zinc-400">{entry.name}:</span> : null}
          {money && typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

export const CHART_COLORS = ['#818cf8', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185'];
