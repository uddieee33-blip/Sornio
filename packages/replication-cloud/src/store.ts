import { type Envelope, type Principal, type StreamName } from './types';

export type InvoiceRow = {
  operationId: string;
  occurredAtIso: string;
  counterparty: string;
  totalPaise: bigint;
  cashPaise: bigint;
  creditPaise: bigint;
  splitComplete: boolean;
  customerId: string | null;
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
  readonly businesses = new Map<string, { name: string; portalId: Principal['portalId'] }>();
  readonly devices = new Map<string, Principal>();
  readonly events: StoredEvent[] = [];
  readonly byOperation = new Map<string, StoredEvent>();
  readonly streamHead = new Map<string, bigint>();
  readonly invoices = new Map<string, InvoiceRow>();
  readonly inventory = new Map<string, InventoryRow>();
  readonly customers = new Map<string, CustomerRow>();
  readonly statements = new Map<string, { id: string; occurredAtIso: string; narrative: string; amountPaise: bigint; direction: 'debit' | 'credit' }[]>();
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
}

export function tenantKey(businessId: string, id: string): string {
  return `${businessId}|${id}`;
}
