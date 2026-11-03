import { type Envelope, type Principal, type StreamName } from './types';

export type InvoiceRow = {
  invoiceId: string;
  billingOperationId: string;
  retailOperationId: string | null;
  occurredAtIso: string;
  counterparty: string;
  totalPaise: bigint;
  cashPaise: bigint;
  digitalPaise: bigint;
  customerCreditPaise: bigint;
  allocation: 'pending' | 'posted';
  customerId: string | null;
  tender: 'cash' | 'credit' | 'retail';
};

export type PendingRetail = {
  retailOperationId: string;
  invoiceId: string;
  occurredAtIso: string;
  payloadSha256: string;
  payments: unknown;
};

export type InventoryRow = {
  productId: string;
  name: string;
  sku: string;
  quantityMilli: bigint;
  reorderMilli: bigint;
  updatedAtIso: string;
};

export type CustomerRow = {
  customerId: string;
  name: string;
  phone: string | null;
  outstandingPaise: bigint;
  creditLimitPaise: bigint | null;
  lastActivityIso: string | null;
};

export type StoredEvent = Envelope & { cursor: string };

// Native billing and retail outboxes intentionally share the sale operation ID.
// Idempotency is scoped to the same stream and restore generation as SQL's
// UNIQUE (business_id, restore_generation, stream, operation_id) constraint.
export function operationKey(businessId: string, generation: string, stream: StreamName, id: string): string {
  return `${businessId}|${generation}|${stream}|${id}`;
}

export class CloudStore {
  businesses = new Map<string, { name: string; portalId: Principal['portalId'] }>();
  devices = new Map<string, Principal>();
  events: StoredEvent[] = [];
  byOperation = new Map<string, StoredEvent>();
  streamHead = new Map<string, bigint>();
  invoices = new Map<string, InvoiceRow>();
  pendingRetail = new Map<string, PendingRetail>();
  inventory = new Map<string, InventoryRow>();
  customers = new Map<string, CustomerRow>();
  statements = new Map<string, { id: string; occurredAtIso: string; narrative: string; amountPaise: bigint; direction: 'debit' | 'credit' }[]>();
  cursorByBusiness = new Map<string, bigint>();

  registerBusiness(businessId: string, name: string, portalId: Principal['portalId']): void {
    this.businesses.set(businessId, { name, portalId });
  }

  registerDevice(principal: Principal): void {
    this.devices.set(principal.deviceId, { ...principal });
    if (!this.businesses.has(principal.businessId)) {
      this.registerBusiness(principal.businessId, principal.businessName, principal.portalId);
    }
  }

  revoke(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) device.revoked = true;
  }

  rotateGeneration(businessId: string, next: string): void {
    for (const device of this.devices.values()) {
      if (device.businessId === businessId && device.role === 'publisher') {
        device.restoreGeneration = next;
      }
    }
  }

  headKey(businessId: string, generation: string, stream: StreamName): string {
    return `${businessId}|${generation}|${stream}`;
  }

  cursor(businessId: string): bigint {
    return this.cursorByBusiness.get(businessId) ?? 0n;
  }

  nextCursor(businessId: string): string {
    const next = this.cursor(businessId) + 1n;
    this.cursorByBusiness.set(businessId, next);
    return next.toString();
  }

  clone(): CloudStore {
    const copy = new CloudStore();
    copy.businesses = new Map(this.businesses);
    copy.devices = new Map([...this.devices].map(([key, value]) => [key, { ...value }]));
    copy.events = this.events.map((event) => ({ ...event }));
    copy.byOperation = new Map(copy.events.map((event) => [
      operationKey(event.businessId, event.restoreGeneration, event.stream, event.operationId), event,
    ]));
    copy.streamHead = new Map(this.streamHead);
    copy.invoices = new Map([...this.invoices].map(([key, value]) => [key, { ...value }]));
    copy.pendingRetail = new Map([...this.pendingRetail].map(([key, value]) => [key, { ...value }]));
    copy.inventory = new Map([...this.inventory].map(([key, value]) => [key, { ...value }]));
    copy.customers = new Map([...this.customers].map(([key, value]) => [key, { ...value }]));
    copy.statements = new Map(
      [...this.statements].map(([key, value]) => [key, value.map((line) => ({ ...line }))]),
    );
    copy.cursorByBusiness = new Map(this.cursorByBusiness);
    return copy;
  }

  adopt(other: CloudStore): void {
    this.businesses = other.businesses;
    this.devices = other.devices;
    this.events = other.events;
    this.byOperation = other.byOperation;
    this.streamHead = other.streamHead;
    this.invoices = other.invoices;
    this.pendingRetail = other.pendingRetail;
    this.inventory = other.inventory;
    this.customers = other.customers;
    this.statements = other.statements;
    this.cursorByBusiness = other.cursorByBusiness;
  }
}

export function tenantKey(businessId: string, id: string): string {
  return `${businessId}|${id}`;
}
