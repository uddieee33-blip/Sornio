import { formatCurrency } from '@/lib/financial-engine';

export function OverviewGrid({ snapshot }: { snapshot: Record<string, number> }) {
  const cards = [
    { label: 'Revenue', value: snapshot.revenue, tone: 'emerald' },
    { label: 'Gross Profit', value: snapshot.grossProfit, tone: 'blue' },
    { label: 'Operating Expenses', value: snapshot.operatingExpenses, tone: 'violet' },
    { label: 'Estimated Net Profit', value: snapshot.netProfit, tone: 'amber' },
    { label: 'Cash Position', value: snapshot.cashBalance, tone: 'slate' },
    { label: 'Inventory Value', value: snapshot.inventoryValue, tone: 'indigo' },
  ];

  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tones[card.tone]}`}>{card.label}</div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{formatCurrency(card.value)}</p>
        </div>
      ))}
    </div>
  );
}
