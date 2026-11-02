import { requirePublisher } from './auth';
import { parseEnvelope } from './envelope';
import { projectEvent } from './project';
import { CloudStore, tenantKey } from './store';
import { ReplicationError, type DigestFn, type Envelope, type IngestAck, type Principal } from './types';

export type SqlQueryResult<T> = { rows: T[] };

export type SqlDatabase = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  exec(sql: string): Promise<unknown>;
};

export async function applyReplicationMigration(db: SqlDatabase, sql: string): Promise<void> {
  await db.exec(sql);
}

export async function setJwtClaims(db: SqlDatabase, claims: { business_id: string; role: string }): Promise<void> {
  const json = JSON.stringify(claims).replace(/'/g, "''");
  await db.exec(`SELECT set_config('request.jwt.claims', '${json}', false)`);
}

type EventRow = {
  payload_sha256: string;
  cursor: string | null;
};

export async function ingestEnvelopeSql(
  db: SqlDatabase,
  store: CloudStore,
  principal: Principal,
  raw: unknown,
  digest: DigestFn,
  nowMs: number,
): Promise<IngestAck> {
  await db.exec('BEGIN');
  try {
    const publisher = requirePublisher(store, principal, nowMs);
    const envelope = parseEnvelope(raw, digest);
    if (envelope.businessId !== publisher.businessId || envelope.deviceId !== publisher.deviceId) {
      throw new ReplicationError('WRONG_BUSINESS', 'Envelope identity does not match the enrolled publisher.');
    }
    const existing = await db.query<EventRow>(
      `SELECT e.payload_sha256, a.cursor
       FROM native_replication.events e
       LEFT JOIN native_replication.acks a
         ON a.business_id = e.business_id AND a.operation_id = e.operation_id
       WHERE e.business_id = $1 AND e.operation_id = $2`,
      [publisher.businessId, envelope.operationId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].payload_sha256 !== envelope.payloadSha256) {
        throw new ReplicationError('CONFLICT', 'Operation identity was reused with a different payload.');
      }
      await db.exec('COMMIT');
      return {
        operationId: envelope.operationId,
        cursor: existing.rows[0].cursor ?? '0',
        duplicate: true,
      };
    }
    const draft = store.clone();
    const ack = commitWorkingSet(draft, publisher, envelope);
    await persistCommitted(db, envelope, ack, draft);
    await db.exec('COMMIT');
    store.adopt(draft);
    return ack;
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // already aborted
    }
    throw error;
  }
}

function commitWorkingSet(store: CloudStore, publisher: Principal, envelope: Envelope): IngestAck {
  const sequence = BigInt(envelope.streamSequence);
  const headKey = store.headKey(publisher.businessId, publisher.restoreGeneration, envelope.stream);
  const last = store.streamHead.get(headKey) ?? 0n;
  if (sequence !== last + 1n) {
    if (sequence <= last) throw new ReplicationError('DUPLICATE_SEQUENCE', 'Stream sequence already committed.');
    throw new ReplicationError('GAP', 'Stream sequence skipped a gap.');
  }
  const draft = store.clone();
  const cursor = draft.nextCursor(publisher.businessId);
  projectEvent(draft, envelope);
  draft.events.push({ ...envelope, cursor });
  draft.byOperation.set(`${publisher.businessId}|${envelope.operationId}`, { ...envelope, cursor });
  draft.streamHead.set(headKey, sequence);
  store.adopt(draft);
  return { operationId: envelope.operationId, cursor, duplicate: false };
}

export async function enrollSql(db: SqlDatabase, principal: Principal): Promise<void> {
  await db.query(
    `INSERT INTO native_replication.businesses (business_id, business_name, portal_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (business_id) DO NOTHING`,
    [principal.businessId, principal.businessName, principal.portalId],
  );
  await db.query(
    `INSERT INTO native_replication.devices (device_id, business_id, role, restore_generation, revoked)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (device_id) DO UPDATE SET revoked = EXCLUDED.revoked, restore_generation = EXCLUDED.restore_generation, role = EXCLUDED.role`,
    [principal.deviceId, principal.businessId, principal.role, principal.restoreGeneration, principal.revoked],
  );
}

async function persistCommitted(db: SqlDatabase, envelope: Envelope, ack: IngestAck, store: CloudStore): Promise<void> {
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
      Number(envelope.streamSequence),
      envelope.operationId,
      envelope.eventType,
      JSON.stringify(envelope.payload),
      envelope.payloadSha256,
      envelope.occurredAtIso,
    ],
  );
  await db.query(
    `INSERT INTO native_replication.stream_heads (business_id, restore_generation, stream, last_sequence)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (business_id, restore_generation, stream)
     DO UPDATE SET last_sequence = EXCLUDED.last_sequence`,
    [envelope.businessId, envelope.restoreGeneration, envelope.stream, Number(envelope.streamSequence)],
  );
  await db.query(
    `INSERT INTO native_replication.projection_cursor (business_id, restore_generation, cursor, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (business_id) DO UPDATE SET cursor = EXCLUDED.cursor, restore_generation = EXCLUDED.restore_generation, updated_at = now()`,
    [envelope.businessId, envelope.restoreGeneration, ack.cursor],
  );
  await db.query(
    `INSERT INTO native_replication.acks (business_id, operation_id, cursor) VALUES ($1,$2,$3)`,
    [envelope.businessId, envelope.operationId, ack.cursor],
  );
  if (envelope.stream !== 'billing') return;
  const invoice = store.invoices.get(tenantKey(envelope.businessId, envelope.operationId));
  if (!invoice) return;
  await db.query(
    `INSERT INTO native_replication.invoices (
       business_id, invoice_id, billing_operation_id, retail_operation_id, occurred_at,
       counterparty, customer_id, tender, total_paise, cash_paise, digital_paise,
       customer_credit_paise, allocation_status
     ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      envelope.businessId,
      invoice.invoiceId,
      invoice.billingOperationId,
      invoice.retailOperationId,
      invoice.occurredAtIso,
      invoice.counterparty,
      invoice.customerId,
      invoice.tender,
      Number(invoice.totalPaise),
      Number(invoice.cashPaise),
      Number(invoice.digitalPaise),
      Number(invoice.customerCreditPaise),
      invoice.allocation,
    ],
  );
}
