'use client';

import { ArrowDownRight, ArrowUpRight, Columns2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getComparisonData } from '@/lib/business-data';
import { useFinancialSnapshot } from '@/lib/store';

export default function ComparisonsPage() {
  const snapshot = useFinancialSnapshot();
  const comparison = getComparisonData(snapshot);

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative p-6 md:p-8">
        <PageHeader eyebrow="Analysis" title="Comparisons" subtitle="Compare current period against previous period using real recorded activity." />

        <div className="grid gap-6 md:grid-cols-2">
          {comparison.map((item, index) => {
            const change = item.previous > 0 ? ((item.current - item.previous) / item.previous) * 100 : 0;
            const improving = item.label === 'Operating Expenses' ? change <= 0 : change >= 0;
            const TrendIcon = change >= 0 ? ArrowUpRight : ArrowDownRight;
            return (
              <Card key={item.label} className="animate-fade-up" hover>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Columns2 size={16} /></span>
                    <h2 className="text-base font-semibold text-slate-900">{item.label}</h2>
                  </div>
                  <Badge tone={improving ? 'emerald' : 'red'}>
                    <span className="inline-flex items-center gap-1"><TrendIcon size={12} /> {change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-brand-50/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Current</p>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">{formatCurrency(item.current)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous</p>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-600">{formatCurrency(item.previous)}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${Math.min(Math.abs(change), 100)}%`, opacity: index === 2 ? 0.5 : 1 }} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
