'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS, ChartTooltip } from './ChartTooltip';
import { formatCurrency } from '@/lib/business-data';
import type { Slice } from '@/lib/chart-data';

type DonutChartProps = {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
};

export function DonutChart({ data, centerLabel, centerValue, height = 220 }: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={3}
              strokeWidth={0}
              cornerRadius={6}
            >
              {data.map((slice, index) => (
                <Cell key={slice.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? <p className="font-display text-lg font-bold text-white tabular-nums">{centerValue}</p> : null}
          {centerLabel ? <p className="text-[10px] uppercase tracking-wide text-zinc-500">{centerLabel}</p> : null}
        </div>
      </div>

      <div className="w-full space-y-2.5">
        {data.map((slice, index) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <div key={slice.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate text-zinc-400">{slice.name}</span>
              </span>
              <span className="shrink-0 font-semibold text-white tabular-nums">
                {formatCurrency(slice.value)} <span className="ml-1 text-xs font-medium text-zinc-500">{pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
