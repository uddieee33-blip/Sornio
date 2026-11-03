# Desktop → cloud replication roadmap

Phase 2 implementation for review: [PHASE-2-DESKTOP-CLOUD-REPLICATION.md](./PHASE-2-DESKTOP-CLOUD-REPLICATION.md).

Depends on unmerged Phase 1 companion contracts in [PR #143](https://github.com/uddieee33-blip/Sornio/pull/143). Not production. Not live mobile sync.

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
5. Desktop records the acknowledged sequence in a sidecar keyed by restore generation.
6. On restore, advertise the new `restoreGeneration` and require mobiles to
   drop cache.

## Reconciliation proof (required before Phase 3)

For the teaching sale:

- Invoice ₹1,000
- Cash ₹600
- Credit ₹400

Native ledger, outbox payload, cloud projection and companion snapshot must
print identical paise strings. A mismatch is a release blocker.

`npm run verify:replication` asserts the cloud projection and companion snapshot
strings. It does not replace native Windows ledger tests.

## What not to do

- Do not upload `workspace.db` or the vault key.
- Do not map native rows onto `lib/sync/records.ts` numbers.
- Do not let the phone write the projection.
- Do not bump financial `SCHEMA_VERSION` for publisher acks.
- Do not enable `productionSyncEnabled` without founder authorization.
