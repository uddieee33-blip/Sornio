import { CompanionError } from './errors';
import { isPortalId, isRole, isStableId } from './identity';
import { addPaise, MoneyError, parsePaise, parseQuantityMilli } from './money';
import { parseIsoTimestamp } from './session';
import type { ActivityItem, CompanionSnapshot, CustomerSummary, InventoryItem, MoneySplit } from './snapshot';
import { ACTIVITY_KINDS, ACTIVITY_STATUSES } from './snapshot';
import {
  isMobileSyncSchemaVersion,
  parseRestoreGeneration,
  parseSyncCursor,
  type MobileSyncSchemaVersion,
} from './sync';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new CompanionError('INVALID_PAYLOAD', `${label} is missing or too long.`);
  }
  return value;
}

function moneySplit(value: unknown, label: string, schemaVersion: MobileSyncSchemaVersion): MoneySplit {
  if (!record(value)) throw new CompanionError('INVALID_PAYLOAD', `${label} is missing.`);
  const totalPaise = parsePaise(value.totalPaise);
  const cashPaise = parsePaise(value.cashPaise);
  const creditPaise = parsePaise(value.creditPaise);
  if (schemaVersion === 1) {
    if (value.digitalPaise != null && parsePaise(value.digitalPaise) !== parsePaise('0')) {
      throw new CompanionError('INVALID_PAYLOAD', `${label} v1 cannot carry digital tenders.`);
    }
    if (addPaise(cashPaise, creditPaise) !== totalPaise) {
      throw new CompanionError('INVALID_PAYLOAD', `${label} cash and credit must equal the total.`);
    }
    return { totalPaise, cashPaise, creditPaise };
  }
  const digitalPaise = parsePaise(value.digitalPaise);
  if (addPaise(addPaise(cashPaise, creditPaise), digitalPaise) !== totalPaise) {
    throw new CompanionError('INVALID_PAYLOAD', `${label} cash, credit and digital must equal the total.`);
  }
  return { totalPaise, cashPaise, creditPaise, digitalPaise };
}

function activityItem(value: unknown, schemaVersion: MobileSyncSchemaVersion): ActivityItem {
  if (!record(value)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid activity row.');
  if (!isStableId(value.id) || !isStableId(value.sourceTransactionId)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Activity ids are invalid.');
  }
  if (typeof value.kind !== 'string' || !(ACTIVITY_KINDS as readonly string[]).includes(value.kind)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Unknown activity kind.');
  }
  if (typeof value.status !== 'string' || !(ACTIVITY_STATUSES as readonly string[]).includes(value.status)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Unknown activity status.');
  }
  const amountPaise = parsePaise(value.amountPaise);
  const cashPaise = parsePaise(value.cashPaise);
  const creditPaise = parsePaise(value.creditPaise);
  const split = moneySplit(
    {
      totalPaise: amountPaise,
      cashPaise,
      creditPaise,
      digitalPaise: value.digitalPaise,
    },
    'Activity',
    schemaVersion,
  );
  return {
    id: value.id,
    sourceTransactionId: value.sourceTransactionId,
    kind: value.kind as ActivityItem['kind'],
    status: value.status as ActivityItem['status'],
    occurredAtIso: parseIsoTimestamp(value.occurredAtIso, 'Activity time'),
    counterparty: text(value.counterparty, 1, 120, 'Counterparty'),
    narrative: text(value.narrative, 1, 240, 'Narrative'),
    amountPaise: split.totalPaise,
    cashPaise: split.cashPaise,
    creditPaise: split.creditPaise,
    ...(schemaVersion === 2 ? { digitalPaise: split.digitalPaise } : {}),
  };
}

function inventoryItem(value: unknown): InventoryItem {
  if (!record(value)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid inventory row.');
  if (!isStableId(value.id) || !isStableId(value.sourceProductId)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Inventory ids are invalid.');
  }
  const quantityMilli = parseQuantityMilli(value.quantityMilli);
  const reorderMilli = parseQuantityMilli(value.reorderMilli);
  const lowStock = value.lowStock === true;
  const qty = BigInt(quantityMilli);
  const reorder = BigInt(reorderMilli);
  if (lowStock !== qty <= reorder) {
    throw new CompanionError('INVALID_PAYLOAD', 'Low-stock flag does not match quantity and reorder point.');
  }
  return {
    id: value.id,
    sourceProductId: value.sourceProductId,
    name: text(value.name, 1, 120, 'Product name'),
    sku: text(value.sku, 1, 40, 'SKU'),
    quantityMilli,
    reorderMilli,
    lowStock,
    updatedAtIso: parseIsoTimestamp(value.updatedAtIso, 'Inventory updated time'),
  };
}

function customerSummary(value: unknown): CustomerSummary {
  if (!record(value)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid customer row.');
  if (!isStableId(value.id) || !isStableId(value.sourceCustomerId)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Customer ids are invalid.');
  }
  if (value.phone != null && (typeof value.phone !== 'string' || value.phone.length > 20)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Customer phone is invalid.');
  }
  return {
    id: value.id,
    sourceCustomerId: value.sourceCustomerId,
    name: text(value.name, 1, 120, 'Customer name'),
    phone: value.phone == null ? null : value.phone,
    outstandingPaise: parsePaise(value.outstandingPaise),
    creditLimitPaise: value.creditLimitPaise == null ? null : parsePaise(value.creditLimitPaise),
    lastActivityIso: value.lastActivityIso == null ? null : parseIsoTimestamp(value.lastActivityIso, 'Customer activity'),
  };
}

function moneyBoundary<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new CompanionError('INVALID_PAYLOAD', error.message);
    }
    throw error;
  }
}

export function parseCompanionSnapshot(value: unknown): CompanionSnapshot {
  return moneyBoundary(() => parseCompanionSnapshotInner(value));
}

function parseCompanionSnapshotInner(value: unknown): CompanionSnapshot {
  if (!record(value)) throw new CompanionError('INVALID_PAYLOAD', 'Snapshot is not an object.');
  if (!isMobileSyncSchemaVersion(value.schemaVersion)) {
    throw new CompanionError('INVALID_PAYLOAD', 'Unsupported companion schema version.');
  }
  const schemaVersion = value.schemaVersion;
  if (value.mode !== 'demo' && value.mode !== 'live') {
    throw new CompanionError('INVALID_PAYLOAD', 'Snapshot mode must be demo or live.');
  }
  if (!isStableId(value.businessId)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid business id.');
  if (!isPortalId(value.portalId)) throw new CompanionError('INVALID_PAYLOAD', 'Unknown business type.');
  if (!isRole(value.role)) throw new CompanionError('INVALID_PAYLOAD', 'Unknown role.');
  if (value.source !== 'desktop-outbox' && value.source !== 'demo') {
    throw new CompanionError('INVALID_PAYLOAD', 'Unknown snapshot source.');
  }
  if (value.mode === 'live' && value.source === 'demo') {
    throw new CompanionError('DEMO_FORBIDDEN', 'A live snapshot cannot be sourced from demo data.');
  }
  if (value.mode === 'demo' && value.source !== 'demo') {
    throw new CompanionError('DEMO_FORBIDDEN', 'A demo snapshot must declare the demo source.');
  }
  if (!record(value.overview)) throw new CompanionError('INVALID_PAYLOAD', 'Missing financial overview.');
  if (!Array.isArray(value.activity) || value.activity.length > 500) {
    throw new CompanionError('INVALID_PAYLOAD', 'Activity list is invalid.');
  }
  if (!Array.isArray(value.inventory) || value.inventory.length > 5000) {
    throw new CompanionError('INVALID_PAYLOAD', 'Inventory list is invalid.');
  }
  if (!Array.isArray(value.customers) || value.customers.length > 5000) {
    throw new CompanionError('INVALID_PAYLOAD', 'Customer list is invalid.');
  }
  if (!Array.isArray(value.alerts) || value.alerts.length > 100) {
    throw new CompanionError('INVALID_PAYLOAD', 'Alert list is invalid.');
  }
  const overview = {
    todaySales: moneySplit(value.overview.todaySales, 'Today sales', schemaVersion),
    todayCollectionsPaise: parsePaise(value.overview.todayCollectionsPaise),
    outstandingCreditPaise: parsePaise(value.overview.outstandingCreditPaise),
    lowStockCount:
      typeof value.overview.lowStockCount === 'number' &&
      Number.isInteger(value.overview.lowStockCount) &&
      value.overview.lowStockCount >= 0 &&
      value.overview.lowStockCount <= 5000
        ? value.overview.lowStockCount
        : (() => {
            throw new CompanionError('INVALID_PAYLOAD', 'Low-stock count is invalid.');
          })(),
  };
  const inventory = value.inventory.map(inventoryItem);
  if (inventory.filter((row) => row.lowStock).length !== overview.lowStockCount) {
    throw new CompanionError('INVALID_PAYLOAD', 'Low-stock count does not match inventory rows.');
  }
  const statements: CompanionSnapshot['statements'] = {};
  if (value.statements != null) {
    if (!record(value.statements)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid statements map.');
    for (const [customerId, lines] of Object.entries(value.statements)) {
      if (!isStableId(customerId) || !Array.isArray(lines)) {
        throw new CompanionError('INVALID_PAYLOAD', 'Invalid statement lines.');
      }
      statements[customerId] = lines.map((line) => {
        if (!record(line) || !isStableId(line.id)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid statement line.');
        if (line.direction !== 'debit' && line.direction !== 'credit') {
          throw new CompanionError('INVALID_PAYLOAD', 'Invalid statement direction.');
        }
        return {
          id: line.id,
          occurredAtIso: parseIsoTimestamp(line.occurredAtIso, 'Statement time'),
          narrative: typeof line.narrative === 'string' ? line.narrative : '',
          amountPaise: parsePaise(line.amountPaise),
          direction: line.direction,
        };
      });
    }
  }
  return {
    schemaVersion,
    mode: value.mode,
    businessId: value.businessId,
    businessName: text(value.businessName, 1, 120, 'Business name'),
    portalId: value.portalId,
    role: value.role,
    userDisplayName: text(value.userDisplayName, 1, 80, 'User name'),
    restoreGeneration: parseRestoreGeneration(value.restoreGeneration),
    cursor: parseSyncCursor(value.cursor),
    producedAtIso: parseIsoTimestamp(value.producedAtIso, 'Snapshot time'),
    source: value.source,
    projectionComplete:
      schemaVersion === 2
        ? value.projectionComplete === true || value.projectionComplete === false
          ? value.projectionComplete
          : (() => {
              throw new CompanionError('INVALID_PAYLOAD', 'Schema v2 snapshots must declare projection completeness.');
            })()
        : undefined,
    overview,
    activity: value.activity.map((row) => activityItem(row, schemaVersion)),
    inventory,
    customers: value.customers.map(customerSummary),
    statements,
    alerts: value.alerts.map((alert) => {
      if (!record(alert) || !isStableId(alert.id)) throw new CompanionError('INVALID_PAYLOAD', 'Invalid alert.');
      if (alert.severity !== 'info' && alert.severity !== 'warning') {
        throw new CompanionError('INVALID_PAYLOAD', 'Invalid alert severity.');
      }
      return {
        id: alert.id,
        severity: alert.severity,
        title: text(alert.title, 1, 80, 'Alert title'),
        detail: text(alert.detail, 1, 240, 'Alert detail'),
      };
    }),
  };
}
