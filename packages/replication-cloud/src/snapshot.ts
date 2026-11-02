import type { CompanionSnapshot } from '../../mobile-contracts/src/snapshot';
import type { PaiseString, QuantityMilliString } from '../../mobile-contracts/src/money';
import type { SyncEnvelope } from '../../mobile-contracts/src/sync';
import { canSeeCustomers, requireReader } from './auth';
import { CloudStore } from './store';
import { ReplicationError, type Principal } from './types';

function money(value: bigint): PaiseString {
  return value.toString() as PaiseString;
}

function quantity(value: bigint): QuantityMilliString {
  return value.toString() as QuantityMilliString;
}

function startOfUtcDay(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function buildCompanionSnapshot(
  store: CloudStore,
  principal: Principal,
  nowIso: string,
  nowMs: number,
): CompanionSnapshot {
  const reader = requireReader(principal, nowMs);
  const business = store.businesses.get(reader.businessId);
  if (!business) throw new ReplicationError('WRONG_BUSINESS', 'Business is not enrolled.');
  const prefix = `${reader.businessId}|`;
  const day = startOfUtcDay(nowIso);
  const invoices = [...store.invoices.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, row]) => row)
    .filter((row) => row.splitComplete)
    .sort((a, b) => a.occurredAtIso.localeCompare(b.occurredAtIso));
  let todayTotal = 0n;
  let todayCash = 0n;
  let todayCredit = 0n;
  const activity = invoices.map((row) => {
    if (Date.parse(row.occurredAtIso) >= day) {
      todayTotal += row.totalPaise;
      todayCash += row.cashPaise;
      todayCredit += row.creditPaise;
    }
    const split = row.cashPaise > 0n && row.creditPaise > 0n;
    return {
      id: row.operationId,
      sourceTransactionId: row.operationId,
      kind: (row.creditPaise > 0n && row.cashPaise === 0n ? 'credit_sale' : 'invoice') as 'invoice' | 'credit_sale',
      status: 'posted' as const,
      occurredAtIso: row.occurredAtIso,
      counterparty: row.counterparty,
      narrative: split ? 'Split cash and credit sale' : row.creditPaise > 0n ? 'Credit sale' : 'Cash sale',
      amountPaise: money(row.totalPaise),
      cashPaise: money(row.cashPaise),
      creditPaise: money(row.creditPaise),
    };
  });
  const inventory = [...store.inventory.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, row]) => {
      const lowStock = row.quantityMilli <= row.reorderMilli;
      return {
        id: row.productId,
        sourceProductId: row.productId,
        name: row.name,
        sku: row.sku,
        quantityMilli: quantity(row.quantityMilli),
        reorderMilli: quantity(row.reorderMilli),
        lowStock,
        updatedAtIso: row.updatedAtIso,
      };
    });
  const lowStockCount = inventory.filter((item) => item.lowStock).length;
  const showCustomers = canSeeCustomers(reader.role);
  const customerRows = [...store.customers.entries()].filter(([key]) => key.startsWith(prefix));
  const customers = showCustomers
    ? customerRows.map(([, row]) => ({
        id: row.customerId,
        sourceCustomerId: row.customerId,
        name: row.name,
        phone: row.phone,
        outstandingPaise: money(row.outstandingPaise),
        creditLimitPaise: row.creditLimitPaise == null ? null : money(row.creditLimitPaise),
        lastActivityIso: row.lastActivityIso,
      }))
    : [];
  const statements: CompanionSnapshot['statements'] = {};
  if (showCustomers) {
    for (const [key, row] of customerRows) {
      statements[row.customerId] = (store.statements.get(key) ?? []).map((line) => ({
        id: line.id,
        occurredAtIso: line.occurredAtIso,
        narrative: line.narrative,
        amountPaise: money(line.amountPaise),
        direction: line.direction,
      }));
    }
  }
  const outstanding = showCustomers
    ? customerRows.reduce((sum, [, row]) => sum + row.outstandingPaise, 0n)
    : 0n;
  const cursor = store.cursor(reader.businessId).toString();
  return {
    schemaVersion: 1,
    mode: 'live',
    businessId: reader.businessId,
    businessName: business.name,
    portalId: business.portalId,
    role: reader.role as Exclude<Principal['role'], 'publisher'>,
    userDisplayName: reader.displayName,
    restoreGeneration: reader.restoreGeneration as CompanionSnapshot['restoreGeneration'],
    cursor: cursor as CompanionSnapshot['cursor'],
    producedAtIso: nowIso,
    source: 'desktop-outbox',
    overview: {
      todaySales: {
        totalPaise: money(todayTotal),
        cashPaise: money(todayCash),
        creditPaise: money(todayCredit),
      },
      todayCollectionsPaise: money(todayCash),
      outstandingCreditPaise: money(outstanding),
      lowStockCount,
    },
    activity: reader.role === 'cashier' ? activity.slice(-20) : activity,
    inventory,
    customers,
    statements,
    alerts:
      lowStockCount > 0
        ? [
            {
              id: 'low-stock',
              severity: 'warning',
              title: 'Low stock',
              detail: `${lowStockCount} products are at or below reorder.`,
            },
          ]
        : [],
  };
}

export function toSyncEnvelope(snapshot: CompanionSnapshot, deviceId: string, revoked = false): SyncEnvelope {
  return {
    schemaVersion: snapshot.schemaVersion,
    businessId: snapshot.businessId,
    restoreGeneration: snapshot.restoreGeneration,
    cursor: snapshot.cursor,
    serverTimeIso: snapshot.producedAtIso,
    source: snapshot.source,
    deviceId,
    revoked,
  };
}
