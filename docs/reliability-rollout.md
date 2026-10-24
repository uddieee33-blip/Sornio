# Business-record reliability rollout

This branch fixes the failures reproduced in the first engineering review. It is not yet deployed to production.

## Changes

- The root layout supplies verified identity before the browser opens a vault. Vault names include both the user and the current business. A confirmed identity change reloads the document. Old unscoped records are retained for explicit owner-authorized recovery.
- Demo exploration uses a separate in-memory snapshot; demo records are neither persisted over the real vault nor sent to cloud writes. Leaving the demo restores the real snapshot.
- IndexedDB holds encrypted snapshots and their previous ciphertext in one transaction. Writes are serialized, recovery attempts the backup, and failed recovery leaves the original data untouched. LocalStorage remains the compatibility fallback.
- One sale-posting function handles cumulative per-product stock validation, stock movements, cost of goods sold, net sale value and tax. Issuing a new invoice records revenue and receivables; payments clear receivables without recognizing revenue a second time. Custom service lines remain supported.
- Customer IDs link charges, opening balances, collections and invoices. A collection allocates against open invoices before reducing unallocated customer dues. Customer collection QR codes target the business UPI account. Customer screens and exports share the same balance selector. Payment references and manual verification status are retained.
- Every durable operating collection uses versioned cloud records. The client pulls before pushing and refreshes on reconnect/focus and periodically. The database serializes each business's writes, enforces expected revisions, and rejects incompatible concurrent edits. Existing immutable entries are idempotent on retry.
- Owner resets advance a server generation. Older snapshots are refused. Team invitations are consumed and membership is created in one transaction. Provider-backed identities recheck the provider and current membership.

## Database migration

Apply `supabase/migrations/20261021174000_operating_record_reliability.sql` to the verified DukaanOS database before releasing the new app. It requires the existing repository schema and the earlier team/recovery migrations. It backfills existing relational cloud records and retains those tables. Once a business writes through the new protocol, the old snapshot upload RPC refuses further writes for that business.

Do **not** run the complete `schema.sql` over an arbitrary existing project to repair a mismatch. Confirm the project reference, inspect its schema and migration history, make a recoverable backup, and apply the incremental migration through the normal deployment process. The connected project inspected during this work had only `products`, `invoices`, `invoice_items`, and `shop_settings`, rather than the schema expected by this repository. No live database changes were made.

The reconciliation preserves the current owner/business/bank/GST onboarding, billing composer, trial access, owner plans, and server-only `redeem_team_invite_atomic` team endpoint. The obsolete draft `redeem_team_invite` RPC is revoked from browser roles; reapply the updated reliability migration on staging if that early draft was installed there. Fresh `schema.sql` now contains each recovery increment once and includes the later owner-plan, GST, and team migrations.

The migration has been executed in PGlite with role/RLS checks, idempotency, atomic rollback, revision conflicts, over-collection refusal, reset-generation refusal and single-use invitations. PGlite does not replace a staging test with real Supabase Auth/PostgREST and simultaneous browser sessions.

## Validation

- ESLint, both TypeScript compilers, and production build.
- All 23 verification suites, including `verify:reliability` (14 operating scenarios), invoice arithmetic/rapid-command regression checks (48 assertions), and `verify:operating-database` (59 database assertions including complete fresh-schema installation and invitation access controls).
- Previous branch HTTP checks are historical; hosted acceptance must be rerun for the reconciled branch.
- Hardware scans, real bank settlement, hosted login/onboarding and simultaneous browser flows remain staging acceptance checks.

## Rollback

Before a business first writes with the new protocol, the previous application remains compatible with its existing relational tables. After that first write, those tables are no longer the authoritative ledger. Do not roll back only the frontend and resume legacy uploads: that would omit new operating records.

For an incident after activation, pause writes, retain the migration and export both the operating records and the database backup. Restore a tested full application/database pair or reconcile those new records into a recovery release before reopening writes. Do not delete `operating_records` or reset its generation as a rollback shortcut.

## Release acceptance

1. Verify the actual Vercel project and its Supabase URL. Environment access returned 404 during this run, so that mapping could not be confirmed.
2. Back up the correct database and test the migration on staging.
3. Test two isolated browser profiles: issue a stocked invoice, collect a partial payment, reconnect an offline profile, and verify stock, tax, customer dues and CA export agree.
4. Confirm a different account on the same device opens its own vault; explicitly recover old records only after confirming ownership.
5. Test a reset while another device holds an old snapshot. The old upload must fail and preserve its local export for review.
6. Resolve new English fallbacks in the 22 language catalogues through translation and native review before claiming that all newly added recovery/error messages are localized. Existing translations are retained. The automated translation service returned HTTP 429 during this run.

Conflicting edits are reported without discarding the device's pending work. The owner must preserve an export and resolve the conflicting record; this branch intentionally does not silently choose a financial winner. Local data remains subject to device/browser storage availability, and cloud requests remain bounded; large-ledger pagination and throughput measurement should be tested before a broad rollout.
