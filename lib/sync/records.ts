/** Pure, versioned representation of every durable operating entity. */
import type { StoreState } from '@/lib/store';
export const COLLECTIONS = [
  'products',
  'transactions',
  'customers',
  'plans',
  'members',
  'subscriptions',
  'reminderTemplates',
  'invoices',
  'paymentRecords',
  'checkIns',
  'scanEvents',
  'biometricCredentials',
  'appointments',
  'stockMovements',
  'audit',
  'campaigns',
] as const;
export type Collection = (typeof COLLECTIONS)[number];
export type RecordKind = Collection | 'settings';
export type OperatingRecord = {
  kind: RecordKind;
  id: string;
  data: Record<string, unknown>;
  revision: number;
};
export type SyncMetadata = {
  businessId: string;
  generation: number;
  revisions: Record<string, number>;
  hashes: Record<string, string>;
  ready: boolean;
};
export type OperatingSnapshot = {
  businessId: string;
  generation: number;
  records: OperatingRecord[];
};
export const recordKey = (kind: string, id: string) => `${kind}:${id}`;
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return JSON.stringify(canonical(value));
}
export function stateRecords(state: StoreState): OperatingRecord[] {
  return [
    ...COLLECTIONS.flatMap((kind) =>
      state[kind].map((row) => ({
        kind,
        id: row.id,
        data: (kind === 'products' ? { ...row, stock: 0 } : row) as unknown as Record<string, unknown>,
        revision: 0,
      })),
    ),
    {
      kind: 'settings' as const,
      id: 'settings',
      data: { ...state.settings },
      revision: 0,
    },
  ];
}
export function changesFor(state: StoreState): OperatingRecord[] {
  const meta = state.cloud;
  const rows = stateRecords(state);
  for (const key of Object.keys(meta?.hashes ?? {})) {
    if (!key.startsWith('biometricCredentials:')) continue;
    const id = key.slice('biometricCredentials:'.length),
      data = { id, revoked: true };
    if (
      !rows.some((row) => row.kind === 'biometricCredentials' && row.id === id) &&
      fingerprint(data) !== meta?.hashes[key]
    )
      rows.push({
        kind: 'biometricCredentials',
        id,
        data,
        revision: meta?.revisions[key] ?? 0,
      });
  }
  return rows
    .filter((row) => fingerprint(row.data) !== meta?.hashes[recordKey(row.kind, row.id)])
    .map((row) => ({
      ...row,
      revision: meta?.revisions[recordKey(row.kind, row.id)] ?? 0,
    }));
}
/** Never discard unsent local edits while adopting new records from other devices. */
export function mergeSnapshot(local: StoreState, snapshot: OperatingSnapshot, acknowledged?: StoreState): StoreState {
  if (!snapshot || !Array.isArray(snapshot.records) || snapshot.records.some((row) => !validRecord(row)))
    throw new Error('Invalid business records.');
  let prior = local.cloud;
  if (acknowledged && prior) {
    prior = {
      ...prior,
      revisions: { ...prior.revisions },
      hashes: { ...prior.hashes },
    };
    const sent = new Map(changesFor(acknowledged).map((row) => [recordKey(row.kind, row.id), row]));
    for (const row of snapshot.records) {
      const key = recordKey(row.kind, row.id);
      if (sent.has(key) && fingerprint(sent.get(key)!.data) === fingerprint(row.data)) {
        prior.revisions[key] = row.revision;
        prior.hashes[key] = fingerprint(row.data);
      }
    }
  }
  if (prior && prior.businessId !== snapshot.businessId)
    throw new Error('This backup belongs to a different business.');
  if (prior && prior.generation !== snapshot.generation)
    throw new Error('This business was reset on another device. Export this device before starting again.');
  const next = {
    ...local,
    ...Object.fromEntries(COLLECTIONS.map((kind) => [kind, [...local[kind]]])),
    cloud: {
      businessId: snapshot.businessId,
      generation: snapshot.generation,
      revisions: { ...prior?.revisions },
      hashes: { ...prior?.hashes },
      ready: true,
    },
  };
  const pendingRevocations = changesFor(local).filter(
    (row) => row.kind === 'biometricCredentials' && row.data.revoked === true,
  );
  const localRows = new Map(
    [...stateRecords(local), ...pendingRevocations].map((row) => [recordKey(row.kind, row.id), row]),
  );
  for (const row of snapshot.records) {
    const key = recordKey(row.kind, row.id),
      own = localRows.get(key),
      remoteHash = fingerprint(row.data);
    const dirty = own && fingerprint(own.data) !== prior?.hashes[key];
    const conflict =
      dirty &&
      prior?.revisions[key] !== undefined &&
      row.revision !== prior.revisions[key] &&
      fingerprint(own.data) !== remoteHash;
    if (conflict)
      throw new Error('The same record changed on another device. Export a backup before resolving the conflict.');
    // On first connection, preserve local edits but adopt an identical remote row.
    const adopt = (!prior && row.kind === 'settings') || !dirty || !own || fingerprint(own.data) === remoteHash;
    if (adopt) {
      if (row.kind === 'settings') next.settings = { ...local.settings, ...row.data };
      else {
        const rows = next[row.kind] as unknown as Record<string, unknown>[];
        next[row.kind] = [
          ...rows.filter((x) => x.id !== row.id),
          ...(row.kind === 'biometricCredentials' && row.data.revoked ? [] : [row.data]),
        ] as never;
      }
    }
    next.cloud.revisions[key] = row.revision;
    next.cloud.hashes[key] = remoteHash;
  }
  // Stock is the sum of unique movements across devices, not the last device's count.
  next.products = next.products.map((p) => {
    const movements = next.stockMovements.filter((m) => m.productId === p.id);
    return movements.length
      ? {
          ...p,
          stock: Math.round(movements.reduce((sum, m) => sum + m.delta, 0) * 1000) / 1000,
        }
      : p;
  });
  next.transactions.sort((a, b) => a.date.localeCompare(b.date));
  next.invoices.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  next.paymentRecords.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  next.audit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  next.stockMovements.sort((a, b) => b.at.localeCompare(a.at));
  next.scanEvents.sort((a, b) => b.at.localeCompare(a.at));
  next.checkIns.sort((a, b) => b.at.localeCompare(a.at));
  next.appointments.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return next;
}

/** Basic shape checks at both untrusted boundaries: imported backups and API payloads. */
export function validRecord(row: OperatingRecord): boolean {
  const d = row.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || !row.id || ![...COLLECTIONS, 'settings'].includes(row.kind))
    return false;
  if (row.kind !== 'settings' && d.id !== row.id) return false;
  const numeric = (key: string, min = -Infinity) =>
    typeof d[key] === 'number' && Number.isFinite(d[key]) && Number(d[key]) >= min;
  const text = (key: string) => typeof d[key] === 'string';
  switch (row.kind) {
    case 'products':
      return (
        text('name') &&
        ['product', 'service'].includes(String(d.itemType)) &&
        numeric('sellingPrice', 0) &&
        numeric('cost', 0) &&
        numeric('reorderLevel', 0)
      );
    case 'transactions':
      return (
        numeric('amount', 0) &&
        text('date') &&
        ['in', 'out'].includes(String(d.direction)) &&
        text('account') &&
        text('type')
      );
    case 'customers':
      return text('name') && numeric('openingBalance');
    case 'invoices':
      return (
        text('customerName') &&
        Array.isArray(d.items) &&
        numeric('subtotal', 0) &&
        numeric('tax', 0) &&
        numeric('totalAmount', 0) &&
        text('paymentStatus')
      );
    case 'paymentRecords':
      return text('customerName') && numeric('amount', 0) && text('paymentMethod') && text('status');
    case 'stockMovements':
      return text('productId') && numeric('delta') && numeric('balance') && text('at');
    case 'plans':
      return text('name') && numeric('price', 0) && numeric('durationMonths', 1);
    case 'members':
      return text('name') && text('phone');
    case 'subscriptions':
      return text('memberId') && text('planId') && text('expiryDate');
    case 'reminderTemplates':
      return text('name') && text('message');
    case 'checkIns':
      return text('memberId') && text('at');
    case 'scanEvents':
      return text('code') && text('at');
    case 'biometricCredentials':
      return d.revoked === true || (text('memberId') && text('credentialId'));
    case 'appointments':
      return text('customerName') && text('startAt') && numeric('minutes', 1);
    case 'audit':
      return text('summary') && text('createdAt');
    case 'campaigns':
      return text('name') && numeric('spend', 0);
    case 'settings':
      return text('receiptMode') && numeric('taxRate', 0);
  }
}
