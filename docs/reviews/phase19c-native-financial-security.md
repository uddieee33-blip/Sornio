# Phase 19C — native financial correctness and SQLCipher remediation

Branch `arena/1b1cac28-sornio`, draft PR #182, based on the published Phase 19B
work. Every number below comes from a CI run on this branch; nothing here is a
projection. Where something was not executed it says so.

## Verdict

**NO-GO for release, and the blocking items are now narrow and precisely named.**

The two Phase 19C financial failures are fixed and proven on three native
platforms. The SQLCipher advisory is remediated and proven by the compiled
amalgamation, not by a version string in a manifest. One pre-existing security
coverage gap, which this phase uncovered rather than caused, still fails the
native jobs.

## 1. Root cause and correction — Failure A (cash payment persistence)

`held_bills::tests::held_checkout_and_completion_are_atomic_and_retry_safe`
asserted a stale expectation. The implementation is correct: a cash invoice does
write an authoritative `local_retail_payments` row with `method = 'cash'`, and
`read_cashier_state` derives `cash_recorded_paise` by joining
`local_retail_payments` to `local_invoice_actors` on `method = 'cash'`. A cash
invoice with no such row would report zero expected cash against real notes in
the drawer, which is exactly the class of bug this test exists to catch.

The assertion was therefore not weakened, it was made **stronger**. `financial_state`
now returns a five-tuple whose last element is `SUM(amount) WHERE method='cash'`,
and the test asserts the whole financial position `(invoices, credit, payments,
stock, cash)` plus each payment row's `(invoice_id, method, amount)`.

Two expectations had to be corrected, and both corrections came from CI failure
output rather than from guessing:

| Asserted | Actual | Why |
| --- | --- | --- |
| cash `98750` | `12500` | 98750 is the **stock remaining** after the sale; the invoice totals 1.25 kg at 10000 paise/kg = 12500 paise |
| `invoice_id == "held-3"` | `"held-sale"` | the column references the posted **invoice**, whose id is the sale operation id, not the held bill that was resumed to produce it |

These are corrections to test constants, not relaxations: the values are now
exact, and each is asserted per row rather than as a total.

Cash and non-cash now share one representation — one row per tender in
`local_retail_payments` — verified across retail invoices, split tenders, customer
credit, and held-bill/restaurant settlement through the shared `post_invoice`
path.

## 2. Root cause and correction — Failure B (replay appended `sale.posted`)

A successful checkout must produce exactly one authoritative sale-posted event.
Both write paths audited **before** checking whether the operation was a replay,
so a retry of a committed operation appended a second `sale.posted` — and, via
`identity::audit`, a second `local_identity_audit` row — for a sale that never
happened again.

Fixed in `billing.rs::post_into` and `payments.rs::post_retail` by reordering to:

1. `identity::verify` — same permission, session and generation checks, no writes
2. replay lookup — if the operation is already committed, return the recorded result
3. `identity::guard(..., "sale.posted", Some(operation_id))` — only on the first,
   authoritative posting

This is the ordering `prepare` already used, so the two entry points now agree.
No second ledger and no duplicate invoice path were introduced: replay returns the
previously committed receipt, and a replay now modifies **zero** tables, including
`local_identity_audit`.

## 3. Regression coverage

Ten tests added to `payments_tests.rs` (total lib tests 260 → 270); all ten are
covered by the green native run below. Every required scenario is present:

cash invoice writes one authoritative cash payment; digital invoice records
UPI and card without cash; split payment including a customer-credit part books
each tender once; failed checkout leaves no payment row and no `sale.posted`;
retried checkout with an identical operation id posts once (three retries, full
`snapshots()` equality); reused operation id with a conflicting payload is
refused; concurrent two-thread checkout posts financially once; restart recovery
after an uncertain response posts once; direct `post_invoice` is exactly-once;
invoice replay never double-books money or stock.

Integer-paise arithmetic, RBAC, stock consistency, credit limits and immutability
are unchanged; no unrelated business behaviour was touched.

## 4. SQLCipher remediation — verified, not assumed

The advisory is RUSTSEC-2026-0459 / CVE-2026-119375 / GHSA-72w2-rjgg-q729: SQLite
below **3.54.0**. The Rust advisory is honest that no patched Rust release is
listed, so "wait for a patched version" was not an available answer.

It had to be found by measurement. `rusqlite` does not track SQLite one-to-one,
and my first two answers were wrong:

| rusqlite | amalgamation actually compiled | SQLite |
| --- | --- | --- |
| 0.37 / 0.38 | SQLCipher 4.6.1 | 3.50.4 |
| 0.39 | — | 3.50.4 |
| 0.40.x | SQLCipher 4.6.1 | **3.51.3** (measured in CI — this disproved my assumption) |
| 0.41.0 | `sqlcipher-src 419.0.6` | 3.53.4 — still vulnerable; also needs rustc 1.89 |
| **0.42.0** | **`sqlcipher-src 420.0.0`** | **3.54.1 — fixed** |

The gate reports what the compiler actually built, because my first attempt chose
0.40 on a version-mapping assumption and CI proved it wrong. That first gate run
also exposed a flaw in the gate itself: it failed **before** pushing the review
branch and uploading the lockfile artifact, so the evidence explaining the failure
was discarded. It now records its verdict as a step output and a final `if: always()`
step enforces it, so evidence survives the failure.

Verified evidence from run `43389189938` (lockfiles now committed in `a72e891`):

```
compiled SQLite 3.54.1 is at or above the fixed 3.54.0
apps/desktop/src-tauri/Cargo.lock: sqlcipher-src 420.0.0+sqlcipher-4.20.0-sqlite-3.54.1-libtomcrypt-1.18.2
packages/local-store/Cargo.lock:   sqlcipher-src 420.0.0+sqlcipher-4.20.0-sqlite-3.54.1-libtomcrypt-1.18.2
```

`Dependency audit` now **passes for both lockfiles**. Encryption was preserved
throughout: still SQLCipher with `bundled-sqlcipher-vendored-openssl`, no switch
to unencrypted SQLite, no engine swap, no suppression or whitelisting of the
advisory.

On migration, the honest position: the format is unchanged in principle because
both the old and new builds are SQLCipher **4.x** (4.6.1 → 4.20.0), so no
migration step is expected, and the entire encrypted-store suite passes against
newly created databases on the fixed build. But **backward compatibility with an
already-deployed store is not empirically proven here**: the repository commits no
pre-built database fixture, so CI never opens a file written by the vulnerable
build. Confirming that needs one fixture written by `rusqlite` 0.40 and reopened
under 0.42. Until that exists, treat in-place upgrade of existing installations as
expected-but-unverified.

`--locked` is preserved; lockfiles were regenerated
with `cargo metadata` semantics so unrelated pins did not move (local-store
113 → 115 packages, src-tauri 468 → 469; the additions are `sqlcipher-src` and
its tree).

## 5. Platform results

Native debug run on `12d7f09`, run `43395232669`:

| Job | Result | Native lib suite |
| --- | --- | --- |
| `macos` | failure (one pre-existing test) | **264 passed, 0 failed, 6 ignored** |
| `local-windows` | failure (same test) | **264 passed, 0 failed, 6 ignored** |
| `browser` | failure (same test) | 261 passed |
| `android` | success | — |
| `Android debug compile` | success | — |
| `iOS simulator compile` | success | — |
| `Dependency audit` | **success** | — |
| `Contracts, types, security` | success | — |
| `Lint, types, build` | success | — |
| `Real PostgreSQL concurrency` | success | — |

Windows and macOS agree exactly — 264 passed, the same single failure — which is
the strongest signal available that the financial contract now behaves identically
on both.

The `Native tests (release profile)` step and the macOS bundle build are **skipped
because the debug step fails first**; they have not run on this branch, so release
profile, bundle identity and signing state are unverified and no signing or
notarisation is claimed.

## 6. The remaining blocker, stated precisely

The one failing target is `packages/local-store/examples/security/tests.rs`, in
`cashier_review_bridge`:

```
every_registered_command_has_an_explicit_security_case_and_scoped_wrapper
assertion `left == right` failed: New native commands need explicit negative cases
```

**This is pre-existing and this phase did not cause it.** The test is a pure
function of two files — `apps/desktop/src-tauri/src/main.rs` and
`packages/local-store/examples/security/tests.rs` — and both are byte-identical to
the 19B base (`git diff --quiet d146c73 HEAD` is clean for both). Registered
command count is 76 in both trees. Its verdict is therefore unchanged from 19B.

It was invisible until now because `cargo --all-targets` aborts at the first
failing binary, and the library failed first. Fixing Failure A and Failure B
exposed it — the same masking pattern as the release profile step above.

25 registered commands have no negative security case:
`restaurant_live`, `restaurant_workspace`, `restaurant_status`, `restaurant_menu`,
`edit_restaurant`, `amend_restaurant`, `takeover_restaurant`, `prepare_restaurant`,
`post_restaurant`, `read_restaurant`, `change_restaurant`, `save_restaurant_menu`,
`kitchen_view`, `kitchen_action`, `hub_live`, `hub_admin`, `hub_control`,
`hub_import_tls`, `hub_device`, `hub_batches`, `hub_dispatch`,
`list_local_held_bills`, `mutate_local_held_bill`, `prepare_local_held_checkout`,
`read_local_customer`.

Closing it is not a matter of adding names to a list. The harness's `dispatch` in
`examples/cashier_review_bridge.rs` has **no arm at all** for 25 of the 73
registered commands — it returns `InvalidInvoice` — so those commands would
inherit `WorkspaceMismatch`/`Locked` from scope enforcement whether or not it was
actually enforced. Adding dispatch arms for the restaurant, hub and kitchen
surfaces requires constructing payloads for domains whose argument types were not
verified here, and a wrong arm would produce a **false negative case that looks
like real coverage**. That is worse than an honest failure, and it is deliberately
not being done blind in this phase. It is scoped as its own piece of work.

## 7. Changes

| Commit | Concern |
| --- | --- |
| `614bd29` | payment/audit idempotency: `verify` → replay → `guard` in both write paths; strengthened held-bill financial assertion |
| `3efc4d9` | rusqlite 0.40 attempt + gate reporting the compiled SQLite version |
| `64c4873` | floor corrected to 0.42 after CI disproved 0.40 |
| `90a4b42` | gate publishes evidence before failing the job |
| `a72e891` | regenerated lockfiles for 0.42; rustfmt on the new tests |
| `632d064` | fix borrow in the new cash/digital tests |
| `e4b6276` | correct two stale expectations in the new tests |
| `12d7f09` | assert the invoice id the payment row actually references |

## 8. What must happen before GO

1. Add the 25 missing negative security cases **with working dispatch arms**, so
   the cases prove enforcement instead of inheriting a scope error.
2. With that green, let the release profile step and macOS bundle build actually
   run; report their counts.
3. Keep the SQLite gate as the standing control — it measures the compiled
   amalgamation, so a future dependency change cannot silently regress it.
4. Add one encrypted database fixture written by the 0.40 build and reopen it on
   0.42, to convert in-place upgrade from expected to verified.
