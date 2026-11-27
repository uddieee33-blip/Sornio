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

  /**
   * Operation identity is `(business, stream, operationId)`.
   *
   * `stream` is part of the key because one native checkout commit legitimately
   * writes the SAME operation id to more than one outbox upstream: a desktop
   * retail sale writes `local_retail_outbox` (stream `retail`) and
   * `local_billing_outbox` (stream `billing`) under one `operationId`, and a
   * split-retail or credit customer effect adds another stream. Keying without
   * the stream rejected the second envelope of every such sale as a CONFLICT and
   * let `hydrateFromPostgres` overwrite one stream's entry with another's.
   * The durable schema has always scoped identity as
   * `(business_id, restore_generation, stream, operation_id)`; `restore_generation`
   * is deliberately NOT part of identity (cross-generation dedup is required).
   */
  operationKey(businessId: string, stream: StreamName, operationId: string): string {
    return `${businessId}|${stream}|${operationId}`;
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
    // Derived from this copy's own event log, one entry per
    // (business, stream, operation) identity. The stream component is what keeps
    // a retail envelope and a billing envelope that share one operation id from
    // evicting each other.
    copy.byOperation = new Map();
    for (const event of copy.events) {
      copy.byOperation.set(
        copy.operationKey(event.businessId, event.stream, event.operationId),
        event,
      );
    }
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
