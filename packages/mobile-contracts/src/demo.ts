import { CompanionError } from './errors';
import type { AuthenticationPort, CachePort, RequestControls, SnapshotPort } from './adapters';
import type { PortalId, Role } from './identity';
import type { PaiseString, QuantityMilliString } from './money';
import type { CompanionSession } from './session';
import type {
  ActivityItem,
  BusinessAlert,
  CompanionSnapshot,
  CustomerStatementLine,
  CustomerSummary,
  InventoryItem,
} from './snapshot';
import { MOBILE_SYNC_SCHEMA_VERSION, type RestoreGeneration, type SyncCursor } from './sync';
import { vocabularyFor } from './vocabulary';

const DEMO_NOW = '2026-11-02T10:42:00Z';
const DEMO_GENERATION = 'demo-generation' as RestoreGeneration;
const DEMO_CURSOR = '1' as SyncCursor;

function paise(value: string): PaiseString {
  return value as PaiseString;
}
function milli(value: string): QuantityMilliString {
  return value as QuantityMilliString;
}

/** Canonical teaching example: ₹1,000 sale = ₹600 cash + ₹400 credit. */
export const DEMO_SPLIT_SALE: ActivityItem = {
  id: 'act-invoice-1000',
  sourceTransactionId: 'inv-native-1000',
  kind: 'invoice',
  status: 'posted',
  occurredAtIso: '2026-11-02T09:15:00Z',
  counterparty: 'Harpreet Kaur',
  narrative: 'Invoice ₹1,000 · cash ₹600 · credit ₹400',
  amountPaise: paise('100000'),
  cashPaise: paise('60000'),
  creditPaise: paise('40000'),
};

export function demoSession(role: Role = 'owner', portalId: PortalId = 'kirana'): CompanionSession {
  const terms = vocabularyFor(portalId);
  return {
    mode: 'demo',
    userId: 'demo-owner',
    displayName: 'Aman Singh',
    role,
    business: {
      businessId: 'demo-kirana',
      businessName: `Sornio Demo ${terms.desk}`,
      portalId,
    },
    device: {
      deviceId: 'demo-device',
      displayName: 'Review phone',
      platform: 'unknown',
      enrollmentStatus: 'granted',
    },
    accessTokenPresent: false,
    expiresAtIso: null,
  };
}

export function demoSnapshot(role: Role = 'owner', portalId: PortalId = 'kirana'): CompanionSnapshot {
  const session = demoSession(role, portalId);
  const terms = vocabularyFor(portalId);
  const inventory: InventoryItem[] = portalId === 'gym'
    ? []
    : [
        {
          id: 'sku-atta',
          sourceProductId: 'prod-atta',
          name: portalId === 'cafe' ? 'House blend 250g' : 'Aashirvaad Atta 10kg',
          sku: 'ATA-10',
          quantityMilli: milli('4500'),
          reorderMilli: milli('8000'),
          lowStock: true,
          updatedAtIso: '2026-11-02T08:10:00Z',
        },
        {
          id: 'sku-oil',
          sourceProductId: 'prod-oil',
          name: portalId === 'salon' ? 'Keratin treatment' : 'Fortune Oil 1L',
          sku: 'OIL-1',
          quantityMilli: milli('24000'),
          reorderMilli: milli('6000'),
          lowStock: false,
          updatedAtIso: '2026-11-02T08:10:00Z',
        },
        {
          id: 'sku-soap',
          sourceProductId: 'prod-soap',
          name: 'Dove Soap 75g',
          sku: 'DOV-75',
          quantityMilli: milli('18000'),
          reorderMilli: milli('10000'),
          lowStock: false,
          updatedAtIso: '2026-11-01T18:40:00Z',
        },
      ];
  const customers: CustomerSummary[] = [
    {
      id: 'cust-harpreet',
      sourceCustomerId: 'cus-harpreet',
      name: 'Harpreet Kaur',
      phone: '+91 98765 11111',
      outstandingPaise: paise('40000'),
      creditLimitPaise: paise('500000'),
      lastActivityIso: DEMO_SPLIT_SALE.occurredAtIso,
    },
    {
      id: 'cust-ravi',
      sourceCustomerId: 'cus-ravi',
      name: 'Ravi Traders',
      phone: '+91 98140 22222',
      outstandingPaise: paise('185000'),
      creditLimitPaise: paise('300000'),
      lastActivityIso: '2026-11-01T16:05:00Z',
    },
    {
      id: 'cust-neha',
      sourceCustomerId: 'cus-neha',
      name: 'Neha Sharma',
      phone: null,
      outstandingPaise: paise('0'),
      creditLimitPaise: null,
      lastActivityIso: '2026-10-28T11:00:00Z',
    },
  ];
  const activity: ActivityItem[] = [
    DEMO_SPLIT_SALE,
    {
      id: 'act-repay-ravi',
      sourceTransactionId: 'pay-ravi-1',
      kind: 'repayment',
      status: 'posted',
      occurredAtIso: '2026-11-02T09:40:00Z',
      counterparty: 'Ravi Traders',
      narrative: 'Udhaar collection',
      amountPaise: paise('50000'),
      cashPaise: paise('50000'),
      creditPaise: paise('0'),
    },
    {
      id: 'act-expense-rent',
      sourceTransactionId: 'exp-rent-nov',
      kind: 'expense',
      status: 'posted',
      occurredAtIso: '2026-11-02T08:00:00Z',
      counterparty: 'Shop rent',
      narrative: 'November rent',
      amountPaise: paise('2500000'),
      cashPaise: paise('2500000'),
      creditPaise: paise('0'),
    },
    {
      id: 'act-payment-upi',
      sourceTransactionId: 'pay-neha-1',
      kind: 'payment',
      status: 'posted',
      occurredAtIso: '2026-11-01T16:05:00Z',
      counterparty: 'Neha Sharma',
      narrative: 'UPI collection',
      amountPaise: paise('85000'),
      cashPaise: paise('85000'),
      creditPaise: paise('0'),
    },
  ];
  const alerts: BusinessAlert[] = [
    {
      id: 'alert-demo',
      severity: 'info',
      title: 'Demonstration copy',
      detail: 'These figures are labelled DEMO and are not a live ledger.',
    },
  ];
  if (inventory.some((row) => row.lowStock)) {
    alerts.push({
      id: 'alert-low-stock',
      severity: 'warning',
      title: `Low ${terms.stock.toLowerCase()}`,
      detail: inventory.filter((row) => row.lowStock).map((row) => row.name).join(', '),
    });
  }
  const statements: Record<string, { id: string; occurredAtIso: string; narrative: string; amountPaise: typeof DEMO_SPLIT_SALE.amountPaise; direction: 'debit' | 'credit' }[]> = {
    'cust-harpreet': [
      {
        id: 'stmt-h-1',
        occurredAtIso: DEMO_SPLIT_SALE.occurredAtIso,
        narrative: 'Credit portion of invoice ₹1,000',
        amountPaise: paise('40000'),
        direction: 'debit',
      },
    ],
    'cust-ravi': [
      {
        id: 'stmt-r-1',
        occurredAtIso: '2026-11-01T16:05:00Z',
        narrative: 'Opening udhaar',
        amountPaise: paise('235000'),
        direction: 'debit',
      },
      {
        id: 'stmt-r-2',
        occurredAtIso: '2026-11-02T09:40:00Z',
        narrative: 'Collection',
        amountPaise: paise('50000'),
        direction: 'credit',
      },
    ],
  };
  return {
    schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
    mode: 'demo',
    businessId: session.business.businessId,
    businessName: session.business.businessName,
    portalId,
    role,
    userDisplayName: session.displayName,
    restoreGeneration: DEMO_GENERATION,
    cursor: DEMO_CURSOR,
    producedAtIso: DEMO_NOW,
    source: 'demo',
    overview: {
      todaySales: {
        totalPaise: paise('1245000'),
        cashPaise: paise('820000'),
        creditPaise: paise('425000'),
      },
      todayCollectionsPaise: paise('870000'),
      outstandingCreditPaise: paise('225000'),
      lowStockCount: inventory.filter((row) => row.lowStock).length,
    },
    activity,
    inventory,
    customers,
    statements: statements as Record<string, CustomerStatementLine[]>,
    alerts,
  };
}

export class MemoryCache implements CachePort {
  private session: CompanionSession | null = null;
  async readSession(): Promise<CompanionSession | null> {
    return this.session;
  }
  async writeSession(session: CompanionSession): Promise<void> {
    this.session = session;
  }
  async clear(): Promise<void> {
    this.session = null;
  }
}

export class DemoAuth implements AuthenticationPort {
  constructor(private readonly cache: CachePort, private readonly role: Role = 'owner') {}
  async current(): Promise<CompanionSession | null> {
    return this.cache.readSession();
  }
  async signInDemo(): Promise<CompanionSession> {
    const session = demoSession(this.role);
    await this.cache.writeSession(session);
    return session;
  }
  async signOut(): Promise<void> {
    await this.cache.clear();
  }
  async signInLive(): Promise<CompanionSession> {
    throw new CompanionError('PRODUCTION_DISABLED', 'Live sign-in is not enabled in Phase 1.');
  }
}

export class DemoSnapshotAdapter implements SnapshotPort {
  async load(session: CompanionSession, controls?: RequestControls): Promise<CompanionSnapshot> {
    if (controls?.signal?.aborted) throw new CompanionError('CANCELLED', 'The request was cancelled.');
    if (session.mode !== 'demo') {
      throw new CompanionError('DEMO_FORBIDDEN', 'The demo adapter cannot serve a live session.');
    }
    return demoSnapshot(session.role, session.business.portalId);
  }
}
