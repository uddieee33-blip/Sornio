# Desktop → cloud replication roadmap

Phase 2 work. Not implemented here.

Native already commits atomically and writes outbox rows:

- `local_billing_outbox`
- `local_customer_outbox`
- `local_retail_outbox`
- `local_inventory_outbox`

Each row: monotonic `sequence`, durable `operation_id`, JSON `payload`.

## Adapter sketch

1. Authenticate the desktop workspace to the cloud as a business-scoped device.
   Do not reuse LAN `certificate_hash` pairing on the public internet.
2. Read unpublished outbox rows in sequence order.
3. PUT/POST each operation with `Idempotency-Key: operation_id`.
4. Server stores the event, projects integer paise / milli read models, advances
   `cursor`.
5. Desktop records the acknowledged sequence locally.
6. On restore, advertise the new `restoreGeneration` and require mobiles to
   drop cache.

## Reconciliation proof (required before Phase 3)

For the teaching sale:

- Invoice ₹1,000
- Cash ₹600
- Credit ₹400

Native ledger, outbox payload, cloud projection and companion snapshot must
print identical paise strings. A mismatch is a release blocker.

## What not to do

- Do not upload `workspace.db` or the vault key.
- Do not map native rows onto `lib/sync/records.ts` numbers.
- Do not let the phone write the projection.
