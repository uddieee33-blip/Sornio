import type { PortalId, Role } from './identity';
import type { PaiseString, QuantityMilliString } from './money';
import type { RestoreGeneration, SyncCursor } from './sync';
import type { MobileSyncSchemaVersion } from './sync';

export const ACTIVITY_KINDS = [
  'invoice',
  'payment',
  'repayment',
  'expense',
  'credit_sale',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_STATUSES = ['posted', 'void', 'pending'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export type MoneySplit = {
  totalPaise: PaiseString;
  cashPaise: PaiseString;
  creditPaise: PaiseString;
  /**
   * UPI + card paise awaiting statement match. Absent on schema v1.
   * Never customer credit. cash + credit + digital = total on schema v2.
   */
  digitalPaise?: PaiseString;
};

export type FinancialOverview = {
  todaySales: MoneySplit;
  todayCollectionsPaise: PaiseString;
  outstandingCreditPaise: PaiseString;
  lowStockCount: number;
};

export type ActivityItem = {
  id: string;
  sourceTransactionId: string;
  kind: ActivityKind;
  status: ActivityStatus;
  occurredAtIso: string;
  counterparty: string;
  narrative: string;
  amountPaise: PaiseString;
  cashPaise: PaiseString;
  creditPaise: PaiseString;
  digitalPaise?: PaiseString;
};

export type InventoryItem = {
  id: string;
  sourceProductId: string;
  name: string;
  sku: string;
  quantityMilli: QuantityMilliString;
  reorderMilli: QuantityMilliString;
  lowStock: boolean;
  updatedAtIso: string;
};

export type CustomerSummary = {
  id: string;
  sourceCustomerId: string;
  name: string;
  phone: string | null;
  outstandingPaise: PaiseString;
  creditLimitPaise: PaiseString | null;
  lastActivityIso: string | null;
};

export type CustomerStatementLine = {
  id: string;
  occurredAtIso: string;
  narrative: string;
  amountPaise: PaiseString;
  direction: 'debit' | 'credit';
};

export type BusinessAlert = {
  id: string;
  severity: 'info' | 'warning';
  title: string;
  detail: string;
};

export type CompanionSnapshot = {
  schemaVersion: MobileSyncSchemaVersion;
  mode: 'demo' | 'live';
  businessId: string;
  businessName: string;
  portalId: PortalId;
  role: Role;
  userDisplayName: string;
  restoreGeneration: RestoreGeneration;
  cursor: SyncCursor;
  producedAtIso: string;
  source: 'desktop-outbox' | 'demo';
  /** Schema v2 only. False when ingested events are waiting on a correlated stream. */
  projectionComplete?: boolean;
  overview: FinancialOverview;
  activity: ActivityItem[];
  inventory: InventoryItem[];
  customers: CustomerSummary[];
  statements: Record<string, CustomerStatementLine[]>;
  alerts: BusinessAlert[];
};

export const EMPTY_SPLIT: MoneySplit = {
  totalPaise: '0' as PaiseString,
  cashPaise: '0' as PaiseString,
  creditPaise: '0' as PaiseString,
};
