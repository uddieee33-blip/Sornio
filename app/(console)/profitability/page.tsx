'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useMemo } from 'react';
import { BarChart3, Percent, TrendingUp, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { HBarList } from '@/components/charts/HBarList';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

export default function ProfitabilityPage() {
  useLocaleRefresh();
  const { state } = useDukaanStore();
  const financials = summarizeFinancials(state.transactions);

  // Product-level profitability from traceable sale line items.
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; category: string; revenue: number; cogs: number; units: number }>();
    for (const tx of state.transactions) {
      if (tx.type !== 'sale' || !tx.items) continue;
      for (const item of tx.items) {
        const row = map.get(item.productId) ?? { name: item.name, category: '', revenue: 0, cogs: 0, units: 0 };
        row.revenue += item.quantity * item.rate;
        row.cogs += item.quantity * item.cost;
        row.units += item.quantity;
        const product = state.products.find((p) => p.id === item.productId);
        if (product) row.category = product.category;
        map.set(item.productId, row);
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.revenue - b.cogs) - (a.revenue - a.cogs));
  }, [state.transactions, state.products]);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { revenue: number; cogs: number }>();
    for (const row of productRows) {
      const key = row.category || 'Uncategorised';
      const entry = map.get(key) ?? { revenue: 0, cogs: 0 };
      entry.revenue += row.revenue;
      entry.cogs += row.cogs;
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.max(value.revenue - value.cogs, 0) })).sort((a, b) => b.value - a.value);
  }, [productRows]);

  const operatingMargin = financials.revenue > 0 ? (financials.operatingProfit / financials.revenue) * 100 : 0;
  const netMargin = financials.revenue > 0 ? (financials.netProfit / financials.revenue) * 100 : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Money"
        title="Profitability"
        subtitle="Margins and product-level profit — every figure derived from recorded sales and costs."
      />

      {state.transactions.length === 0 ? (
        <EmptyState icon={BarChart3} title="No profit picture yet" description="Profitability is calculated, never assumed. Record sales and expenses and this page shows real margins by product and category." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-fade-up">
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700"><TrendingUp size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Gross margin</p>
                  <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{financials.grossMargin.toFixed(1)}%</p></div>
              </div>
              <p className="mt-2.5 text-xs text-stone-600">Gross profit {formatCurrency(financials.grossProfit)}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Zap size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Operating margin</p>
                  <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{operatingMargin.toFixed(1)}%</p></div>
              </div>
              <p className="mt-2.5 text-xs text-stone-600">Operating profit {formatCurrency(financials.operatingProfit)}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700"><Percent size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Net margin</p>
                  <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{netMargin.toFixed(1)}%</p></div>
              </div>
              <p className="mt-2.5 text-xs text-stone-600">Est. net profit {formatCurrency(financials.netProfit)}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"><BarChart3 size={18} /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Revenue</p>
                  <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{formatCurrency(financials.revenue)}</p></div>
              </div>
              <p className="mt-2.5 text-xs text-stone-600">COGS {formatCurrency(financials.cogs)}</p>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="animate-fade-up">
              <div className="mb-5 flex items-center justify-between">
                <CardTitle icon={<BarChart3 size={17} />}>Product profitability</CardTitle>
                <Badge tone="brand" dot>{productRows.length} items sold</Badge>
              </div>
              {productRows.length === 0 ? (
                <p className="rounded-2xl bg-stone-50 p-6 text-sm text-stone-600">No itemised sales recorded yet. Sales made from here on record their exact items, so per-product profit appears automatically.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-stone-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                        <th className="px-4 py-3 text-right font-semibold">COGS</th>
                        <th className="px-4 py-3 text-right font-semibold">Profit</th>
                        <th className="px-4 py-3 text-right font-semibold">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((row) => {
                        const profit = row.revenue - row.cogs;
                        const margin = row.revenue > 0 ? (profit / row.revenue) * 100 : 0;
                        return (
                          <tr key={row.name} className="border-t border-stone-200">
                            <td className="px-4 py-3">
                              <p className="font-medium text-stone-800">{row.name}</p>
                              <p className="text-xs text-stone-600">{row.units} unit(s) · {row.category || 'Uncategorised'}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-stone-700 tabular-nums">{formatCurrency(row.revenue)}</td>
                            <td className="px-4 py-3 text-right text-stone-600 tabular-nums">{formatCurrency(row.cogs)}</td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(profit)}</td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${margin >= 40 ? 'text-emerald-700' : margin >= 15 ? 'text-amber-700' : 'text-red-700'}`}>{margin.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="animate-fade-up">
              <div className="mb-5"><CardTitle icon={<Percent size={17} />}>Profit by category</CardTitle></div>
              {categoryRows.length > 0 ? <HBarList data={categoryRows} /> : <p className="rounded-2xl bg-stone-50 p-6 text-sm text-stone-600">Category profit appears once itemised sales exist.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
