'use client';

import { useLocaleRefresh } from '@/lib/i18n';

import { useMemo } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaySupplierPanel } from '@/components/payments/dues-panels';
import { formatCurrency, summarizeFinancials } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';

/**
 * Suppliers. The payable here is the ledger's real figure (goods received on
 * credit, less payments). A per-supplier split is not tracked yet, so this page
 * does not invent one; the supplier name on each delivery is kept for reference.
 */
export default function SuppliersPage() {
  useLocaleRefresh();
  const { state } = useDukaanStore();
  const payable = useMemo(
    () => summarizeFinancials(state.transactions, state.products, state.customers).payables,
    [state.transactions, state.products, state.customers],
  );

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="People"
        title="Suppliers"
        subtitle="What the business owes its suppliers for goods received on credit, and payments made against it."
        actions={<Badge tone="brand" dot>{formatCurrency(payable)} payable</Badge>}
      />
      <PaySupplierPanel />
      <Card>
        <p className="text-sm text-stone-600">
          Total payable across all suppliers: <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(payable)}</span>
        </p>
        <p className="mt-2 text-xs text-stone-500">Record each delivery on the scan page with its supplier name. Per-supplier balances will be shown once payments are linked to a supplier.</p>
      </Card>
    </div>
  );
}
