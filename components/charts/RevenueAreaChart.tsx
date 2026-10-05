'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import type { TimePoint } from '@/lib/chart-data';

type Props = {
  data: TimePoint[];
  color?: string;
  gradientId: string;
  height?: number;
};

const GRID = 'rgba(122,112,83,0.16)';
const TICK = '#747a6e';
const CURSOR = 'rgba(40,98,59,0.2)';
const REVENUE = '#28623b';
const EXPENSES = '#b84c58';

export function RevenueAreaChart({ data, color = REVENUE, gradientId, height = 240 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis
          tick={{ fill: TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(value: number) => (value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CURSOR, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="value" name="Amount" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DualAreaChart({ revenue, expenses, height = 240 }: { revenue: TimePoint[]; expenses: TimePoint[]; height?: number }) {
  const merged = revenue.map((point, index) => ({
    label: point.label,
    revenue: point.value,
    expenses: expenses[index]?.value ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REVENUE} stopOpacity={0.28} />
            <stop offset="95%" stopColor={REVENUE} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSES} stopOpacity={0.22} />
            <stop offset="95%" stopColor={EXPENSES} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={54} tickFormatter={(value: number) => (value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`)} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CURSOR, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={REVENUE} strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Area type="monotone" dataKey="expenses" name="Expenses" stroke={EXPENSES} strokeWidth={2.5} fill="url(#expGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
