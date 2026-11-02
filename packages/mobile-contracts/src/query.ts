import type { Role } from './identity';
import { screensFor } from './capabilities';
import type { ActivityItem, CompanionSnapshot, CustomerSummary, InventoryItem } from './snapshot';

export type ActivityFilter = 'all' | 'invoice' | 'payment' | 'repayment' | 'expense';

export function searchText(value: string): string {
  return value.trim().toLowerCase();
}

export function filterActivity(rows: readonly ActivityItem[], query: string, kind: ActivityFilter): ActivityItem[] {
  const needle = searchText(query);
  return rows.filter((row) => {
    if (kind !== 'all' && row.kind !== kind) return false;
    if (!needle) return true;
    return `${row.counterparty} ${row.narrative} ${row.sourceTransactionId}`.toLowerCase().includes(needle);
  });
}

export function filterInventory(rows: readonly InventoryItem[], query: string, lowOnly: boolean): InventoryItem[] {
  const needle = searchText(query);
  return rows.filter((row) => {
    if (lowOnly && !row.lowStock) return false;
    if (!needle) return true;
    return `${row.name} ${row.sku}`.toLowerCase().includes(needle);
  });
}

export function filterCustomers(rows: readonly CustomerSummary[], query: string): CustomerSummary[] {
  const needle = searchText(query);
  if (!needle) return [...rows];
  return rows.filter((row) => `${row.name} ${row.phone ?? ''}`.toLowerCase().includes(needle));
}

export function navigationFor(snapshot: CompanionSnapshot): ReturnType<typeof screensFor> {
  return screensFor(snapshot.role as Role, snapshot.portalId);
}

export function snapshotIsDemo(snapshot: CompanionSnapshot): boolean {
  return snapshot.mode === 'demo';
}
