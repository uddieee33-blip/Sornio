'use client';

import { useMemo } from 'react';
import { AlertTriangle, Bell, CheckCircle2, PackageX, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getAlerts, summarizeFinancials } from '@/lib/business-data';
import { daysUntil } from '@/lib/models/membership';
import { useDukaanStore } from '@/lib/store';

type AlertRow = { id: string; severity: 'critical' | 'warning' | 'info'; area: string; title: string; description: string; action: string };

const severityMeta = {
  critical: { icon: ShieldAlert, wrapper: 'border-red-500/25 bg-red-500/[0.07]', iconBox: 'bg-red-500/15 text-red-700', label: 'Critical', chip: 'bg-red-500/10 text-red-700 ring-red-500/25' },
  warning: { icon: AlertTriangle, wrapper: 'border-amber-500/25 bg-amber-500/[0.07]', iconBox: 'bg-amber-500/15 text-amber-700', label: 'Warning', chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/25' },
  info: { icon: Bell, wrapper: 'border-sky-500/20 bg-sky-500/[0.06]', iconBox: 'bg-sky-500/15 text-sky-700', label: 'Info', chip: 'bg-sky-500/10 text-sky-700 ring-sky-500/25' },
} as const;

export default function AlertsPage() {
  const { state } = useDukaanStore();

  const { alerts, healthy, lowStockCount } = useMemo(() => {
    const financials = summarizeFinancials(state.transactions);
    const rows: AlertRow[] = [];
    const ok: string[] = [];

    // Ledger-driven alerts (stock, receivables, payables)
    for (const engineAlert of getAlerts(financials, state.products)) {
      rows.push({
        id: engineAlert.type,
        severity: engineAlert.tone === 'red' ? 'critical' : engineAlert.tone === 'amber' ? 'warning' : 'info',
        area: engineAlert.type === 'low-stock' ? 'Inventory' : engineAlert.type === 'receivables' ? 'Cash flow' : 'Suppliers',
        title: engineAlert.type === 'low-stock' ? 'Stock below reorder level' : engineAlert.type === 'receivables' ? 'Money owed by customers' : 'Supplier payables open',
        description: engineAlert.message,
        action: engineAlert.type === 'low-stock' ? 'Open Inventory and create purchase orders for the flagged items.' : engineAlert.type === 'receivables' ? 'Follow up on the Customers page and request settlement via their UPI QR.' : 'Schedule supplier payouts from the Suppliers page.',
      });
    }

    // Membership renewals
    const membersById = new Map(state.members.map((member) => [member.id, member]));
    const expiring = state.subscriptions.filter((subscription) => { const days = daysUntil(subscription.expiryDate); return days >= 0 && days <= 7; });
    const expired = state.subscriptions.filter((subscription) => daysUntil(subscription.expiryDate) < 0);
    if (expired.length > 0) {
      rows.push({
        id: 'members-expired', severity: 'critical', area: 'Memberships', title: `${expired.length} membership${expired.length === 1 ? ' has' : 's have'} expired`,
        description: `${expired.map((subscription) => membersById.get(subscription.memberId)?.name ?? 'Unknown').slice(0, 3).join(', ')}${expired.length > 3 ? '…' : ''} ${expired.length === 1 ? 'has' : 'have'} lapsed. Renewal revenue is at risk.`,
        action: 'Open Memberships and tap Renew — reminders go out over the member’s preferred channel.',
      });
    }
    if (expiring.length > 0) {
      rows.push({
        id: 'members-expiring', severity: 'warning', area: 'Memberships', title: `${expiring.length} renewal${expiring.length === 1 ? '' : 's'} due within 7 days`,
        description: `${expiring.map((subscription) => membersById.get(subscription.memberId)?.name ?? 'Unknown').slice(0, 3).join(', ')}${expiring.length > 3 ? '…' : ''} need renewal attention this week.`,
        action: 'Send renewal reminders now to keep churn at zero.',
      });
    }

    // Payment pipeline
    const pending = state.paymentRecords.filter((record) => record.status === 'pending');
    if (pending.length > 0) {
      const amount = pending.reduce((sum, record) => sum + record.amount, 0);
      rows.push({
        id: 'payments-pending', severity: 'info', area: 'Payments', title: `${pending.length} payment${pending.length === 1 ? '' : 's'} awaiting settlement`,
        description: `${amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} is authorized but not yet in your bank (card and online settlements take 1–2 days).`,
        action: 'No action needed — watch the Payments page for settlement.',
      });
    }

    // Cash position
    if (financials.netCashFlow < 0) {
      rows.push({
        id: 'cash-negative', severity: 'critical', area: 'Cash flow', title: 'Cash out exceeds cash in',
        description: `Net cash flow is ${financials.netCashFlow.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} for the recorded period.`,
        action: 'Pause discretionary expenses and push outstanding receivables.',
      });
    } else {
      ok.push('Cash flow is positive for the recorded period.');
    }
    if (financials.customerReceivables === 0) ok.push('No outstanding customer dues.');
    if (expiring.length === 0 && expired.length === 0) ok.push('All memberships are healthy.');
    if (lowStockProductsCount(state) === 0) ok.push('Every product is above its reorder level.');

    return { alerts: rows, healthy: ok, lowStockCount: lowStockProductsCount(state) };
  }, [state]);

  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;

  const grouped = (['critical', 'warning', 'info'] as const).map((severity) => ({
    severity,
    items: alerts.filter((alert) => alert.severity === severity),
  }));

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader
        eyebrow="Operations"
        title="Alerts and anomalies"
        subtitle="Cash-flow, inventory, membership, and settlement checks — recomputed live from your ledger."
        actions={<Badge tone={criticalCount > 0 ? 'red' : 'emerald'} dot>{criticalCount > 0 ? `${criticalCount} critical` : 'All clear'}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-4 animate-fade-up">
        <Card className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-700"><ShieldAlert size={19} /></span>
          <div><p className="font-display text-2xl font-bold text-stone-900">{criticalCount}</p><p className="text-xs text-stone-600">Critical</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700"><AlertTriangle size={19} /></span>
          <div><p className="font-display text-2xl font-bold text-stone-900">{warningCount}</p><p className="text-xs text-stone-600">Warnings</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600"><PackageX size={19} /></span>
          <div><p className="font-display text-2xl font-bold text-stone-900">{lowStockCount}</p><p className="text-xs text-stone-600">Low stock items</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700"><CheckCircle2 size={19} /></span>
          <div><p className="font-display text-2xl font-bold text-stone-900">{healthy.length}</p><p className="text-xs text-stone-600">Healthy checks</p></div>
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        {grouped.map(({ severity, items }) => {
          const meta = severityMeta[severity];
          if (items.length === 0) return null;
          return (
            <Card key={severity} className="animate-fade-up">
              <div className="mb-5 flex items-center justify-between">
                <CardTitle>{meta.label} · {items.length}</CardTitle>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${meta.chip}`}>{severity.toUpperCase()}</span>
              </div>
              <div className="space-y-3">
                {items.map((alert) => {
                  const Icon = meta.icon;
                  return (
                    <div key={alert.id} className={`flex gap-3.5 rounded-2xl border p-4 ${meta.wrapper}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.iconBox}`}><Icon size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-stone-900">{alert.title}</p>
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">{alert.area}</span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-stone-600">{alert.description}</p>
                        <p className="mt-2 rounded-xl bg-stone-100 p-2.5 text-xs leading-relaxed text-stone-700">→ {alert.action}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}

        <Card className="animate-fade-up">
          <div className="mb-5"><CardTitle icon={<ShieldCheck size={17} />}>Healthy checks</CardTitle></div>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {healthy.map((item) => (
              <li key={item} className="flex items-start gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3 text-sm text-emerald-700">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {item}
              </li>
            ))}
            {healthy.length === 0 ? <li className="text-sm text-stone-600">Everything needs attention right now — start with the critical list above.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function lowStockProductsCount(state: { products: Array<{ stock: number; reorderLevel: number; status: string }> }): number {
  return state.products.filter((product) => product.stock <= product.reorderLevel && product.status === 'Active').length;
}
