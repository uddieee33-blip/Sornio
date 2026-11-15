# Phase 21B — mobile purchasing, supplier operations and secure offline recovery

Date: 2026-11-15. Status: **implemented, unmerged, unreleased**.

Branch `arena/5de4cdf3-sornio`, based on `arena/110fa338-sornio` (Phase 21A,
PR #185) at `5883fee`. Draft PR: **#186**, base `arena/110fa338-sornio`.

Nothing in this phase was merged to `main`, released, deployed or force-pushed.

## 1. What actually runs

### Native hub — `packages/local-store/src/purchasing_hub.rs`

A narrow mobile surface, not an HTTP proxy for the Tauri commands:

| Route | Purpose | Authority |
| --- | --- | --- |
| `POST /v1/purchasing/workspace` | one bounded authenticated read | device session **and** `SupplierRead` |
| `POST /v1/purchasing/order` | one order with its receipts and returns | device session |
| `POST /v1/purchasing/statement` | bounded supplier statement | device session |
| `POST /v1/purchasing/submit` | one journalled write | device session, then the Phase 21A guard |
| `POST /v1/purchasing/operation` | committed-or-not for one identity | device session, digest-checked |

Advertised as the `purchasing.mobile.v1` capability in `/v1/identity`.

Ten operation kinds delegate to the existing Phase 21A methods:
`purchasing.supplier_saved`, `purchase_order_{created,updated,submitted,decided,cancelled,closed}`,
`goods_received`, `supplier_payment`, `purchase_return`.

Design decisions that matter:

- **No new table.** Operations journal into the v18 `local_hub_operations`
  table, so they inherit its append-only triggers and exactly-once contract.
  `SCHEMA_VERSION` stays 23.
- **Refusals are durable results.** A revision conflict, an over-receipt or an
  unauthorised action is stored once, with its reason, and the same identity
  always returns it.
- **A workspace read cannot assert its own authority.** A body carrying
  `actorId` or `role` is refused outright.

### Companion

- `packages/business-domain/src/purchasing-contract.ts` — strict wire types.
  Every document is re-validated on the way in; nothing is coerced.
- `packages/business-domain/src/purchasing-outbox.ts` — one unresolved operation
  per (hub, device, employee, kind), encrypted write before transport, status
  lookup before any resend, per-employee drafts and per-device snapshots.
- `apps/mobile/src/purchasing/client.ts` — the facade the screens call.
- The screens: suppliers (list, search, detail, role-aware actions), purchase
  orders (catalogue search, lines, estimate-only preview, save/resume, submit,
  approve/reject, cancel/close), goods receiving (ordered / already received /
  still due, damaged separate, review before submit), payables and statements,
  and returns bounded by what was actually received.
- A `Purchasing` destination in both the phone tab bar and the tablet rail.
  Demo mode runs the same client against a synthetic in-memory hub and labels
  every screen; without a paired device, pinned certificate and signed-in
  employee the live branch shows a "connect to your shop" state instead of an
  empty workspace.

## 2. Verified by execution

| Gate | Result |
| --- | --- |
| `cargo test --all-targets --locked` (debug) | passed — the last red run said 303 passed / 4 failed / 6 ignored, and those four are the fixes in §3 |
| `cargo test --all-targets --locked --release` | passed |
| `cargo fmt --check` (both manifests) | clean |
| `scripts/verify-purchasing-protocol.py` | 64 checks, 0 failed |
| `apps/mobile` runtime (`jest`) | 104 tests, 7 suites, all pass |
| `apps/mobile` `tsc --noEmit` | clean |
| `scripts/verify-mobile-contracts.mjs` | 63 checks |
| `scripts/extract-i18n.mjs --check` | 2749 phrases agree |

The offline and financial recovery scenarios are exercised twice, from both
sides of the wire:

- **Protocol level** (`apps/mobile/__runtime__/purchasing.test.ts`, 36 cases)
  against a reference hub with fault injection: A offline draft surviving a
  restart, B lost acknowledgement adopted by identity, C hub restart,
  D mobile restart, E permission revocation, F stale revision, G duplicate
  submission, H fail-closed storage — plus the identity-conflict refusal.
- **Native level** (`purchasing_hub_tests.rs`) against the real SQLite store:
  replay posts once, refusals replay forever, foreign-device journals conflict,
  damaged-vs-good stock, zero-sum payment journal, bounded statement.

## 3. Defects found and fixed during this phase

These are the reason the phase is worth reporting honestly; each was found by
running something, not by reading it.

1. **Replay ignored the payload.** The fast path compared device, actor and kind
   but never the digest, so an operation id reused for a *different* body was
   answered with the earlier operation's committed result. A phone would have
   reported work it never sent as done. `journal_lookup` now compares the
   recorded SHA-256.
2. **The status lookup answered by id alone.** A phone that lost its records
   could be handed another operation's result. The lookup now carries the
   payload and the hub compares digests.
3. **`submit()` minted a second identity** when the payload already carried one,
   so the journal and the purchasing rows could disagree.
4. **The reference hub subtracted every prior return from each receipt line**,
   letting one return immunise a whole receipt.
5. Two compile errors, caught by the first real `cargo test`: a `&Value`/`Value`
   mismatch in the status route, and a test reading a private field (now a
   test-only accessor, not a widened field).

## 4. Known limitations

- **No hardware acceptance.** Nothing was installed on an Android device, an
  iPhone or an iPad. The iPhone/iPad/Android results above are headless React
  Native execution with device profiles, which proves layout branching and
  state transitions, not native views, gestures or TLS.
- **Supplier create and edit are not exposed on the phone.** The screen says so
  and points at the desktop.
- **Opening balances and payable corrections are not exposed on mobile at all**,
  matching the owner-only native rule.
- **Draft totals are labelled estimates.** Only hub integers are authoritative.
- The statement screen composes its running list from the workspace snapshot;
  it does not yet page through `/v1/purchasing/statement` for long histories.

## 5. Release blockers

1. Physical-device acceptance on all three platforms, including a real paired
   hub, certificate pinning and a revoked-device case.
2. PR #185 (Phase 21A) must land first; this branch is stacked on it.
3. A human review of the digest and identity rules above — they are
   security-relevant and changed late.

## 6. Recommended next phase

21C should finish the mobile purchasing surface against real hardware: the
supplier editor, statement paging through the existing bounded route, and a
device lab run that records Android, iPhone and iPad evidence. Phase 21B's
wire contract is stable enough to build on without further changes.
