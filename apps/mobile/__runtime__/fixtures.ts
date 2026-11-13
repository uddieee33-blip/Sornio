/**
 * Deterministic benchmark fixtures.
 *
 * Synthetic snapshots are built here rather than in the app so the benchmark
 * never influences product code. Sizes are chosen to exceed what a real Sornio
 * shop syncs today (a busy kirana is a few hundred stock rows, not thousands)
 * while still exposing list-rendering cost.
 */
import {
  MOBILE_SYNC_SCHEMA_VERSION,
  type ActivityItem,
  type CompanionSnapshot,
  type CustomerSummary,
  type InventoryItem,
} from '@sornio/mobile-contracts';
import { demoSession } from '@sornio/mobile-contracts';

const pad = (n: number) => String(n).padStart(5, '0');

export function bigActivity(count: number): ActivityItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `act-${pad(i)}`,
    sourceTransactionId: `src-${pad(i)}`,
    kind: i % 3 === 0 ? 'payment' : i % 3 === 1 ? 'invoice' : 'expense',
    status: 'posted',
    occurredAtIso: '2026-11-02T09:15:00Z',
    counterparty: `Party ${pad(i)}`,
    narrative: `Line ${i} · counter sale`,
    amountPaise: String(1000 + i * 7),
    cashPaise: String(500 + i),
    creditPaise: String(500 + i * 6),
  })) as unknown as ActivityItem[];
}

export function bigInventory(count: number): InventoryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${pad(i)}`,
    sourceProductId: `prod-${pad(i)}`,
    name: `Product ${pad(i)}`,
    sku: `SKU-${pad(i)}`,
    quantityMilli: String(1000 + i),
    reorderMilli: String(200),
    lowStock: i % 7 === 0,
    updatedAtIso: '2026-11-02T09:15:00Z',
  })) as unknown as InventoryItem[];
}

export function bigCustomers(count: number): CustomerSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cus-${pad(i)}`,
    name: `Customer ${pad(i)}`,
    phone: `+9198${pad(i)}`,
    outstandingPaise: String(i * 100),
    creditLimitPaise: String(500000),
  })) as unknown as CustomerSummary[];
}

export function benchmarkSnapshot(counts: { activity: number; inventory: number; customers: number }): CompanionSnapshot {
  const session = demoSession('owner', 'kirana');
  return {
    schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
    mode: 'demo',
    businessId: session.business.businessId,
    businessName: session.business.businessName,
    portalId: 'kirana',
    role: 'owner',
    userDisplayName: session.displayName,
    restoreGeneration: 'bench-generation' as never,
    cursor: '1' as never,
    producedAtIso: '2026-11-02T10:42:00Z',
    source: 'demo',
    overview: {
      todaySales: { totalPaise: '1245000', cashPaise: '820000', creditPaise: '425000' },
      todayCollectionsPaise: '870000',
      outstandingCreditPaise: '225000',
      lowStockCount: 12,
    },
    activity: bigActivity(counts.activity),
    inventory: bigInventory(counts.inventory),
    customers: bigCustomers(counts.customers),
    statements: {},
    alerts: [],
  } as unknown as CompanionSnapshot;
}
