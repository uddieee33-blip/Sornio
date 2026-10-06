'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Columns2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { formatCurrency, getComparisonData } from '@/lib/business-data';
import { useFinancialSnapshot } from '@/lib/store';

export default function ComparisonsPage() {
  const snapshot = useFinancialSnapshot();
  const comparison = getComparisonData(snapshot);

  const chartData = comparison.map((item) => ({
    name: item.label,
    Current: Math.round(item.current),
    Previous: Math.round(item.previous),
  }));

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader eyebrow="Analysis" title="Comparisons" subtitle="Compare the current period against the previous one using real recorded activity." />

      <Card className="animate-fade-up mb-6">
        <div className="mb-5 flex items-center justify-between">
          <CardTitle icon={<Columns2 size={17} />}>Current vs previous period</CardTitle>
          <Badge tone="brand" dot>Live from ledger</Badge>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(122,112,83,0.16)" vertical={false} />
              <XAxis dataKey="name" stroke="#747a6e" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#747a6e" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => `₹${(value / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(70,84,57,0.07)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#747a6e' }} />
              <Bar dataKey="Previous" fill="rgba(76,96,67,0.22)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Current" fill="#28623b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {comparison.map((item) => {
          const change = item.previous > 0 ? ((item.current - item.previous) / item.previous) * 100 : 0;
          const improving = item.label === 'Operating Expenses' ? change <= 0 : change >= 0;
          const TrendIcon = change >= 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <Card key={item.label} className="animate-fade-up" hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Columns2 size={16} /></span>
                  <h2 className="text-base font-semibold text-stone-900">{item.label}</h2>
                </div>
                <Badge tone={improving ? 'emerald' : 'red'}>
                  <span className="inline-flex items-center gap-1"><TrendIcon size={12} /> {change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
                </Badge>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-brand-500/[0.08] p-4 ring-1 ring-inset ring-brand-500/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Current</p>
                  <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-stone-900">{formatCurrency(item.current)}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Previous</p>
                  <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-stone-600">{formatCurrency(item.previous)}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${Math.min(Math.abs(change), 100)}%`, opacity: item.label === 'Operating Expenses' ? 0.6 : 1 }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
