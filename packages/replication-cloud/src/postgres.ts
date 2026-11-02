import { requirePublisher, requireReader } from './auth';
import { parseEnvelope } from './envelope';
import { projectEvent } from './project';
import { CloudStore, tenantKey } from './store';
import { ReplicationError, STREAMS, type DigestFn, type IngestAck, type Principal, type StreamName } from './types';

export type SqlQueryResult<T> = { rows: T[] };

export type SqlDatabase = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  exec(sql: string): Promise<unknown>;
};

export async function applyReplicationMigration(db: SqlDatabase, sql: string): Promise<void> {
  await db.exec(sql);
}

/** Transaction-scoped claims. Never session-sticky across pooled connections. */
export async function setJwtClaimsLocal(db: SqlDatabase, claims: { business_id: string; role: string }): Promise<void> {
  const json = JSON.stringify(claims).replace(/'/g, "''");
  await db.exec(`SELECT set_config('request.jwt.claims', '${json}', true)`);
}

export async function setJwtClaims(db: SqlDatabase, claims: { business_id: string; role: string }): Promise<void> {
  await setJwtClaimsLocal(db, claims);
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)) {
    return text.endsWith('Z') ? text : `${text.replace(/([+-]\d{2}:\d{2})$/, '')}Z`;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return new Date(0).toISOString();
  return new Date(parsed).toISOString();
}

function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  return 0n;
}

type DeviceRow = {
  device_id: string;
  business_id: string;
  role: Principal['role'];
  restore_generation: string;
  revoked: boolean;
};

type BusinessRow = {
  business_id: string;
  business_name: string;
  portal_id: Principal['portalId'];
};

export async function enrollPrivileged(db: SqlDatabase, principal: Principal): Promise<void> {
  await db.query(
    `INSERT INTO native_replication.businesses (business_id, business_name, portal_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (business_id) DO NOTHING`,
    [principal.businessId, principal.businessName, principal.portalId],
  );
  const existing = await db.query<DeviceRow>(
    `SELECT device_id, business_id, role, restore_generation, revoked
     FROM native_replication.devices WHERE device_id = $1`,
    [principal.deviceId],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.business_id !== principal.businessId) {
      throw new ReplicationError('WRONG_BUSINESS', 'Device is already enrolled to another business.');
    }
    if (row.revoked) throw new ReplicationError('REVOKED', 'A revoked device cannot re-enroll itself.');
    return;
  }
  await db.query(
    `INSERT INTO native_replication.devices (device_id, business_id, role, restore_generation, revoked)
     VALUES ($1,$2,$3,$4,$5)`,
    [principal.deviceId, principal.businessId, principal.role, principal.restoreGeneration, principal.revoked],
  );
}

export const enrollSql = enrollPrivileged;

export async function revokePrivileged(db: SqlDatabase, deviceId: string): Promise<void> {
  await db.query(`UPDATE native_replication.devices SET revoked = TRUE WHERE device_id = $1`, [deviceId]);
}

export async function rotatePublisherGeneration(db: SqlDatabase, businessId: string, generation: string): Promise<void> {
  await db.query(
    `UPDATE native_replication.devices
     SET restore_generation = $2
     WHERE business_id = $1 AND role = 'publisher' AND revoked = FALSE`,
    [businessId, generation],
  );
}

export async function hydrateFromPostgres(db: SqlDatabase, businessId: string): Promise<CloudStore> {
  const store = new CloudStore();
  const businesses = await db.query<BusinessRow>(
    `SELECT business_id, business_name, portal_id FROM native_replication.businesses WHERE business_id = $1`,
    [businessId],
  );
  const business = businesses.rows[0];
  if (business) store.registerBusiness(business.business_id, business.business_name, business.portal_id);
  const devices = await db.query<DeviceRow>(
    `SELECT device_id, business_id, role, restore_generation, revoked FROM native_replication.devices WHERE business_id = $1`,
    [businessId],
  );
  for (const row of devices.rows) {
    store.registerDevice({
      businessId: row.business_id,
      businessName: business?.business_name ?? row.business_id,
      portalId: business?.portal_id ?? 'general',
      deviceId: row.device_id,
      displayName: row.role,
      role: row.role,
      restoreGeneration: row.restore_generation,
      expiresAtMs: Date.now() + 3_600_000,
      revoked: row.revoked,
    });
  }
  const heads = await db.query<{ restore_generation: string; stream: StreamName; last_sequence: unknown }>(
    `SELECT restore_generation, stream, last_sequence FROM native_replication.stream_heads WHERE business_id = $1`,
    [businessId],
  );
  for (const row of heads.rows) {
    store.streamHead.set(store.headKey(businessId, row.restore_generation, row.stream), asBigInt(row.last_sequence));
  }
  const cursor = await db.query<{ cursor: string }>(
    `SELECT cursor FROM native_replication.projection_cursor WHERE business_id = $1`,
    [businessId],
  );
  if (cursor.rows[0]) store.cursorByBusiness.set(businessId, asBigInt(cursor.rows[0].cursor));
  const events = await db.query<{
    operation_id: string;
    payload_sha256: string;
    cursor: string | null;
    stream: StreamName;
    stream_sequence: unknown;
    restore_generation: string;
    event_type: string;
    payload: unknown;
    occurred_at: string;
    device_id: string;
  }>(
    `SELECT e.operation_id, e.payload_sha256, a.cursor, e.stream, e.stream_sequence, e.restore_generation,
            e.event_type, e.payload, e.occurred_at::text, e.device_id
     FROM native_replication.events e
     LEFT JOIN native_replication.acks a
       ON a.business_id = e.business_id AND a.restore_generation = e.restore_generation
      AND a.stream = e.stream AND a.operation_id = e.operation_id
     WHERE e.business_id = $1`,
    [businessId],
  );
  for (const row of events.rows) {
    const stored = {
      schemaVersion: 1 as const,
      businessId,
      deviceId: row.device_id,
      restoreGeneration: row.restore_generation,
      stream: row.stream,
      streamSequence: String(row.stream_sequence),
      operationId: row.operation_id,
      eventType: row.event_type,
      payload: row.payload,
      occurredAtIso: asIso(row.occurred_at),
      payloadSha256: row.payload_sha256,
      cursor: row.cursor ?? '0',
    };
    store.events.push(stored);
    store.byOperation.set(`${businessId}|${row.operation_id}`, stored);
  }
  const invoices = await db.query<Record<string, unknown>>(
    `SELECT invoice_id, billing_operation_id, retail_operation_id, occurred_at::text, counterparty, customer_id,
            tender, total_paise, cash_paise, digital_paise, customer_credit_paise, allocation_status
     FROM native_replication.invoices WHERE business_id = $1`,
    [businessId],
  );
  for (const row of invoices.rows) {
    const invoiceId = String(row.invoice_id);
    store.invoices.set(tenantKey(businessId, invoiceId), {
      invoiceId,
      billingOperationId: String(row.billing_operation_id),
      retailOperationId: row.retail_operation_id == null ? null : String(row.retail_operation_id),
      occurredAtIso: asIso(row.occurred_at),
      counterparty: String(row.counterparty),
      customerId: row.customer_id == null ? null : String(row.customer_id),
      tender: row.tender as 'cash' | 'credit' | 'retail',
      totalPaise: asBigInt(row.total_paise),
      cashPaise: asBigInt(row.cash_paise),
      digitalPaise: asBigInt(row.digital_paise),
      customerCreditPaise: asBigInt(row.customer_credit_paise),
      allocation: row.allocation_status === 'posted' ? 'posted' : 'pending',
    });
  }
  const pending = await db.query<Record<string, unknown>>(
    `SELECT invoice_id, retail_operation_id, payload, payload_sha256, occurred_at::text
     FROM native_replication.pending_retail WHERE business_id = $1`,
    [businessId],
  );
  for (const row of pending.rows) {
    store.pendingRetail.set(tenantKey(businessId, String(row.invoice_id)), {
      retailOperationId: String(row.retail_operation_id),
      invoiceId: String(row.invoice_id),
      occurredAtIso: asIso(row.occurred_at),
      payloadSha256: String(row.payload_sha256),
      payments: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    });
  }
  const inventory = await db.query<Record<string, unknown>>(
    `SELECT product_id, name, sku, quantity_milli, reorder_milli, updated_at::text
     FROM native_replication.inventory WHERE business_id = $1`,
    [businessId],
  );
  for (const row of inventory.rows) {
    store.inventory.set(tenantKey(businessId, String(row.product_id)), {
      productId: String(row.product_id),
      name: String(row.name),
      sku: String(row.sku),
      quantityMilli: asBigInt(row.quantity_milli),
      reorderMilli: asBigInt(row.reorder_milli),
      updatedAtIso: asIso(row.updated_at),
    });
  }
  const customers = await db.query<Record<string, unknown>>(
    `SELECT customer_id, name, phone, outstanding_paise, credit_limit_paise, last_activity_at::text
     FROM native_replication.customers WHERE business_id = $1`,
    [businessId],
  );
  for (const row of customers.rows) {
    store.customers.set(tenantKey(businessId, String(row.customer_id)), {
      customerId: String(row.customer_id),
      name: String(row.name),
      phone: row.phone == null ? null : String(row.phone),
      outstandingPaise: asBigInt(row.outstanding_paise),
      creditLimitPaise: row.credit_limit_paise == null ? null : asBigInt(row.credit_limit_paise),
      lastActivityIso: row.last_activity_at == null ? null : asIso(row.last_activity_at),
    });
  }
  const statements = await db.query<Record<string, unknown>>(
    `SELECT customer_id, line_id, occurred_at::text, narrative, amount_paise, direction
     FROM native_replication.customer_statements WHERE business_id = $1`,
    [businessId],
  );
  for (const row of statements.rows) {
    const key = tenantKey(businessId, String(row.customer_id));
    const lines = store.statements.get(key) ?? [];
    lines.push({
      id: String(row.line_id),
      occurredAtIso: asIso(row.occurred_at),
      narrative: String(row.narrative),
      amountPaise: asBigInt(row.amount_paise),
      direction: row.direction === 'credit' ? 'credit' : 'debit',
    });
    store.statements.set(key, lines);
  }
  return store;
}

async function persistProjections(db: SqlDatabase, businessId: string, store: CloudStore): Promise<void> {
  const prefix = `${businessId}|`;
  for (const [key, invoice] of store.invoices) {
    if (!key.startsWith(prefix)) continue;
    await db.query(
      `INSERT INTO native_replication.invoices (
         business_id, invoice_id, billing_operation_id, retail_operation_id, occurred_at,
         counterparty, customer_id, tender, total_paise, cash_paise, digital_paise,
         customer_credit_paise, allocation_status
       ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (business_id, invoice_id) DO UPDATE SET
         retail_operation_id = EXCLUDED.retail_operation_id,
         cash_paise = EXCLUDED.cash_paise,
         digital_paise = EXCLUDED.digital_paise,
         customer_credit_paise = EXCLUDED.customer_credit_paise,
         allocation_status = EXCLUDED.allocation_status,
         counterparty = EXCLUDED.counterparty`,
      [
        businessId,
        invoice.invoiceId,
        invoice.billingOperationId,
        invoice.retailOperationId,
        invoice.occurredAtIso,
        invoice.counterparty,
        invoice.customerId,
        invoice.tender,
        invoice.totalPaise.toString(),
        invoice.cashPaise.toString(),
        invoice.digitalPaise.toString(),
        invoice.customerCreditPaise.toString(),
        invoice.allocation,
      ],
    );
  }
  await db.query(`DELETE FROM native_replication.pending_retail WHERE business_id = $1`, [businessId]);
  for (const [key, pending] of store.pendingRetail) {
    if (!key.startsWith(prefix)) continue;
    await db.query(
      `INSERT INTO native_replication.pending_retail (
         business_id, invoice_id, retail_operation_id, payload, payload_sha256, occurred_at
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6::timestamptz)`,
      [businessId, pending.invoiceId, pending.retailOperationId, JSON.stringify(pending.payments), pending.payloadSha256, pending.occurredAtIso],
    );
  }
  for (const [key, item] of store.inventory) {
    if (!key.startsWith(prefix)) continue;
    await db.query(
      `INSERT INTO native_replication.inventory (
         business_id, product_id, name, sku, quantity_milli, reorder_milli, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)
       ON CONFLICT (business_id, product_id) DO UPDATE SET
         name = EXCLUDED.name, sku = EXCLUDED.sku, quantity_milli = EXCLUDED.quantity_milli,
         reorder_milli = EXCLUDED.reorder_milli, updated_at = EXCLUDED.updated_at`,
      [businessId, item.productId, item.name, item.sku, item.quantityMilli.toString(), item.reorderMilli.toString(), item.updatedAtIso],
    );
  }
  for (const [key, customer] of store.customers) {
    if (!key.startsWith(prefix)) continue;
    await db.query(
      `INSERT INTO native_replication.customers (
         business_id, customer_id, name, phone, outstanding_paise, credit_limit_paise, last_activity_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)
       ON CONFLICT (business_id, customer_id) DO UPDATE SET
         name = EXCLUDED.name, phone = EXCLUDED.phone, outstanding_paise = EXCLUDED.outstanding_paise,
         credit_limit_paise = EXCLUDED.credit_limit_paise, last_activity_at = EXCLUDED.last_activity_at`,
      [
        businessId,
        customer.customerId,
        customer.name,
        customer.phone,
        customer.outstandingPaise.toString(),
        customer.creditLimitPaise == null ? null : customer.creditLimitPaise.toString(),
        customer.lastActivityIso,
      ],
    );
  }
  await db.query(`DELETE FROM native_replication.customer_statements WHERE business_id = $1`, [businessId]);
  for (const [key, lines] of store.statements) {
    if (!key.startsWith(prefix)) continue;
    const customerId = key.slice(prefix.length);
    for (const line of lines) {
      await db.query(
        `INSERT INTO native_replication.customer_statements (
           business_id, customer_id, line_id, occurred_at, narrative, amount_paise, direction
         ) VALUES ($1,$2,$3,$4::timestamptz,$5,$6,$7)`,
        [businessId, customerId, line.id, line.occurredAtIso, line.narrative, line.amountPaise.toString(), line.direction],
      );
    }
  }
}

export async function ingestDurable(
  db: SqlDatabase,
  presented: Principal,
  raw: unknown,
  digest: DigestFn,
  nowMs: number,
): Promise<IngestAck> {
  await db.exec('BEGIN');
  try {
    const locked = await db.query<{ business_id: string }>(
      `SELECT business_id FROM native_replication.businesses WHERE business_id = $1 FOR UPDATE`,
      [presented.businessId],
    );
    if (!locked.rows[0]) throw new ReplicationError('UNAUTHENTICATED', 'This business is not enrolled.');
    const device = await db.query<DeviceRow>(
      `SELECT device_id, business_id, role, restore_generation, revoked
       FROM native_replication.devices WHERE device_id = $1 FOR UPDATE`,
      [presented.deviceId],
    );
    const enrolled = device.rows[0];
    if (!enrolled) throw new ReplicationError('UNAUTHENTICATED', 'This device is not enrolled.');
    const business = await db.query<BusinessRow>(
      `SELECT business_id, business_name, portal_id FROM native_replication.businesses WHERE business_id = $1`,
      [enrolled.business_id],
    );
    const store = new CloudStore();
    if (business.rows[0]) {
      store.registerBusiness(business.rows[0].business_id, business.rows[0].business_name, business.rows[0].portal_id);
    }
    store.registerDevice({
      businessId: enrolled.business_id,
      businessName: business.rows[0]?.business_name ?? presented.businessName,
      portalId: business.rows[0]?.portal_id ?? presented.portalId,
      deviceId: enrolled.device_id,
      displayName: presented.displayName,
      role: enrolled.role,
      restoreGeneration: enrolled.restore_generation,
      expiresAtMs: presented.expiresAtMs,
      revoked: enrolled.revoked,
    });
    const publisher = requirePublisher(store, presented, nowMs);
    const envelope = parseEnvelope(raw, digest);
    if (envelope.businessId !== publisher.businessId || envelope.deviceId !== publisher.deviceId) {
      throw new ReplicationError('WRONG_BUSINESS', 'Envelope identity does not match the enrolled publisher.');
    }
    if (envelope.restoreGeneration !== publisher.restoreGeneration) {
      throw new ReplicationError('STALE_GENERATION', 'Restore generation does not match the enrolled publisher.');
    }
    const existing = await db.query<{ payload_sha256: string; cursor: string | null }>(
      `SELECT e.payload_sha256, a.cursor
       FROM native_replication.events e
       LEFT JOIN native_replication.acks a
         ON a.business_id = e.business_id AND a.restore_generation = e.restore_generation
        AND a.stream = e.stream AND a.operation_id = e.operation_id
       WHERE e.business_id = $1 AND e.restore_generation = $2 AND e.stream = $3 AND e.operation_id = $4`,
      [publisher.businessId, publisher.restoreGeneration, envelope.stream, envelope.operationId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].payload_sha256 !== envelope.payloadSha256) {
        throw new ReplicationError('CONFLICT', 'Operation identity was reused with a different payload.');
      }
      if (!existing.rows[0].cursor) {
        throw new ReplicationError('CONFLICT', 'Event exists without a durable ack; ingest is incomplete.');
      }
      await db.exec('COMMIT');
      return { operationId: envelope.operationId, cursor: existing.rows[0].cursor, duplicate: true };
    }
    await db.query(
      `INSERT INTO native_replication.stream_heads (business_id, restore_generation, stream, last_sequence)
       VALUES ($1,$2,$3,0)
       ON CONFLICT (business_id, restore_generation, stream) DO NOTHING`,
      [publisher.businessId, publisher.restoreGeneration, envelope.stream],
    );
    const head = await db.query<{ last_sequence: unknown }>(
      `SELECT last_sequence FROM native_replication.stream_heads
       WHERE business_id = $1 AND restore_generation = $2 AND stream = $3
       FOR UPDATE`,
      [publisher.businessId, publisher.restoreGeneration, envelope.stream],
    );
    const last = asBigInt(head.rows[0]?.last_sequence ?? 0);
    const sequence = BigInt(envelope.streamSequence);
    if (sequence !== last + 1n) {
      if (sequence <= last) throw new ReplicationError('DUPLICATE_SEQUENCE', 'Stream sequence already committed.');
      throw new ReplicationError('GAP', 'Stream sequence skipped a gap.');
    }
    const working = await hydrateFromPostgres(db, publisher.businessId);
    working.registerDevice(publisher);
    const cursor = working.nextCursor(publisher.businessId);
    projectEvent(working, envelope);
    await db.query(
      `INSERT INTO native_replication.events (
         business_id, device_id, restore_generation, stream, stream_sequence,
         operation_id, event_type, payload, payload_sha256, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::timestamptz)`,
      [
        envelope.businessId,
        envelope.deviceId,
        envelope.restoreGeneration,
        envelope.stream,
        envelope.streamSequence,
        envelope.operationId,
        envelope.eventType,
        JSON.stringify(envelope.payload),
        envelope.payloadSha256,
        envelope.occurredAtIso,
      ],
    );
    await db.query(
      `UPDATE native_replication.stream_heads SET last_sequence = $4
       WHERE business_id = $1 AND restore_generation = $2 AND stream = $3`,
      [publisher.businessId, publisher.restoreGeneration, envelope.stream, envelope.streamSequence],
    );
    await db.query(
      `INSERT INTO native_replication.projection_cursor (business_id, restore_generation, cursor, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (business_id) DO UPDATE SET cursor = EXCLUDED.cursor, restore_generation = EXCLUDED.restore_generation, updated_at = now()`,
      [publisher.businessId, publisher.restoreGeneration, cursor],
    );
    await persistProjections(db, publisher.businessId, working);
    await db.query(
      `INSERT INTO native_replication.acks (business_id, restore_generation, stream, operation_id, cursor)
       VALUES ($1,$2,$3,$4,$5)`,
      [publisher.businessId, publisher.restoreGeneration, envelope.stream, envelope.operationId, cursor],
    );
    await db.exec('COMMIT');
    return { operationId: envelope.operationId, cursor, duplicate: false };
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // already aborted
    }
    throw error;
  }
}

/** @deprecated Hydrating ingest. Prefer ingestDurable. */
export async function ingestEnvelopeSql(
  db: SqlDatabase,
  _store: CloudStore,
  principal: Principal,
  raw: unknown,
  digest: DigestFn,
  nowMs: number,
): Promise<IngestAck> {
  return ingestDurable(db, principal, raw, digest, nowMs);
}

export async function snapshotFromPostgres(
  db: SqlDatabase,
  principal: Principal,
  nowIso: string,
  nowMs: number,
  build: (store: CloudStore, principal: Principal, nowIso: string, nowMs: number) => unknown,
): Promise<unknown> {
  const store = await hydrateFromPostgres(db, principal.businessId);
  requireReader(store, principal, nowMs);
  return build(store, principal, nowIso, nowMs);
}

export { STREAMS };
