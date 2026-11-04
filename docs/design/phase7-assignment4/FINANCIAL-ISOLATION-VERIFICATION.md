# FINANCIAL ISOLATION VERIFICATION

**SORNIO — Phase 7 / Assignment 4** · Proof that the proposed U1+U3 UI slice cannot alter financial
behaviour.
**Date:** 2026-11-04 (UTC). **Financial source modified:** none.

---

## 1. Claim under test

> Introducing a semantic token layer and recomposing the application shell requires **no** change to
> Rust financial logic, SQLCipher persistence, invoice calculation, mixed-payment reconciliation,
> customer credit, inventory deduction, operation identity/retry, native permissions, backup/recovery
> or printing authorization — and the native layer remains the sole financial authority.

This document verifies that claim by inspection, not assertion.

---

## 2. Evidence 1 — the shell invokes no financial command

`main.tsx` (the file U3 refactors) calls exactly **four** native commands:

```
load_workspace, save_workspace, restore_workspace, lock_workspace
```

All four are workspace-lifecycle operations. None creates an invoice, moves stock, touches credit,
records a payment, or prints a receipt. Verified by extracting every `invoke('…')` call site.

**Corollary:** the component that U3 restructures is *already* financially inert. Recomposing it
cannot move money.

---

## 3. Evidence 2 — no monetary arithmetic exists in the shell or stylesheet

| Check | Result |
|---|---|
| Arithmetic on money in `main.tsx` (`BigInt`, `Paise + - *`) | **no matches** |
| Monetary constants in `main.tsx` | none |
| `money()` / formatting calls in `main.tsx` | none (imported only by `CheckoutPanel`, `CustomerLookup`, `CustomerPanel`, `InventoryPanel`, `RetailPanel`, `SavedInvoice`, `retail-types`) |
| CSS declaring money values or units | none — `style.css` is presentation only |

Financial commands are issued only from the four panels that own them:
`CheckoutPanel.tsx`, `CustomerPanel.tsx`, `InventoryPanel.tsx`, `RetailPanel.tsx` — **none of which are
in the U1+U3 file allowlist**.

---

## 4. Evidence 3 — money representation is formatting-only in the UI

`billing-types.ts`:

```ts
/** Formatting only: never convert a cumulative native balance to a JS number. */
export function money(paise: number | string) {
  const value = BigInt(paise), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}₹${wholeRupees.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
}
```

Integer-paise `BigInt`, `en-IN` grouping, exact two-decimal rendering, no floating point anywhere on
the display path. A token/typography change can alter the *font and colour* of a rupee figure; it
cannot alter its value. `Intl.NumberFormat` grouping is asserted by `verify-native-money.mjs`
(12 invariants) and the 4,820-invoice sweep.

**Risk introduced by U1:** *rendering* a figure at a new size/colour must not clip it. That is covered
as an acceptance test (§7 T-7), not a financial change.

---

## 5. Evidence 4 — native split-payment authority (the ₹1,000 reference transaction)

`customers.rs:480 post_split_credit`:

```rust
if !(1..=MAX_VALUE).contains(&amount) || amount > invoice.total_paise {
    return Err(StoreError::InvalidCredit);
}
```

then rejects any conflicting customer operation and any completed/cancelled retail row sharing the
invoice id, and — per the P0 fix — deliberately does **not** treat the in-flight
`local_retail_pending` row as a conflict (`billing.rs:323`: "The parts must sum exactly to the invoice
total before any credit…").

### Reference transaction, worked in integer paise

| Element | Rupees | Paise | Authority |
|---|---|---|---|
| Invoice total | ₹1,000.00 | `100000` | `billing.rs` computes from lines |
| Cash part | ₹600.00 | `60000` | native validation |
| Credit part | ₹400.00 | `40000` | `post_split_credit` |
| Sum check | — | `60000 + 40000 = 100000` | equals total → accepted |
| Remaining allocation | ₹0.00 | `0` | derived, not stored |

Failure modes the native layer already enforces, unchanged by any UI work:
- over-allocation (`40000` → `40001`) → sum ≠ total → refused before posting;
- credit above limit → `CreditLimit` refusal, no invoice, no stock move, no ledger row;
- credit above invoice total → `InvalidCredit` (`amount > invoice.total_paise`);
- replayed operation id with different payload → `OperationConflict`.

**The UI may only display this arithmetic.** Presentation of a preview must never be reachable as a
commit; `confirm`/`post` remain the only path, and success may only be shown after authoritative
confirmation (enforced today by `pending` → F8/Enter → native response).

---

## 6. Evidence 5 — invariant-by-invariant isolation

| # | Invariant | Authority (source) | Touched by U1? | Touched by U3? |
|---|---|---|---|---|
| I1 | Integer-paise money (`BigInt`, no floats) | `billing-types.ts`, native i64 | No | No |
| I2 | Native financial calculation | `billing.rs` | No | No |
| I3 | Atomic checkout | `checkout.rs`, `retail.rs` path | No | No |
| I4 | Split-payment validation | `billing.rs:323`, `customers.rs:480` | No | No |
| I5 | Customer-credit constraints | `customers.rs` | No | No |
| I6 | Stock-deduction semantics | `billing.rs` / `catalog.rs` | No | No |
| I7 | Idempotency & operation identity | `recovery.rs`, pending rows | No | No |
| I8 | Transaction recovery | `recovery.rs`, `inventory_recovery.rs` | No | No |
| I9 | Backup/restore behaviour | `BackupPanel` → native, `lib.rs` | No | No (shell only hosts it) |
| I10 | SQLCipher persistence, `SCHEMA_VERSION = 12` | `lib.rs:150` | No | No |
| I11 | Native permission enforcement | `access.rs`, `identity.rs`, `authorization_tests.rs` | No | No (UI gates are additive, IP-2) |
| I12 | Offline-first operation | no network calls in financial path | No | No |
| I13 | Printing authorization (print only after save) | `receipt-print.ts` + save ordering | No | No (isolation must be preserved — IP-4) |
| I14 | Existing business rules | all of the above | No | No |

No invariant has a UI-layer dependency except I13's *isolation*, which is a constraint on U3 rather
than a change to it.

---

## 7. Evidence 6 — file-level proof of isolation

**Financial surface that must remain byte-identical:**
`packages/local-store/src/**` — 30 files, **16,038 lines**, including `billing.rs`, `customers.rs`,
`payments.rs`, `checkout.rs`, `catalog.rs`, `recovery.rs`, `inventory_recovery.rs`, `access.rs`,
`identity.rs`, `replication.rs`, the four `*-schema.sql` files and all eight test modules;
plus `apps/desktop/src-tauri/**`.

**Proposed U1+U3 allowlist:** `apps/desktop/src/styles/tokens.css` (new),
`apps/desktop/src/workspace/AppShell.tsx` (new), `apps/desktop/src/workspace/NavRail.tsx` (new),
`apps/desktop/src/main.tsx` (edit).

Intersection of the two sets: **empty**.

Enforcement: the PR must fail review if any file outside the allowlist appears in the diff. A
ready-to-run check is specified as T-1 in `U1-U3-REGRESSION-ACCEPTANCE-PLAN.md`.

---

## 8. What this verification does NOT claim

- It does not claim the *existing* financial behaviour is defect-free (see D4 defects DEF-1…DEF-8,
  including the two contrast defects found in this assignment). Isolation ≠ correctness.
- It does not claim regression suites currently pass on this commit — they have not been executed
  here (no toolchain, no browser, no Windows host). Suite status is `NOT EXECUTED` (§T of the
  acceptance plan), never "passing".
- It does not claim the ₹1,000 split was visually reviewed; it is CI-verified on
  `arena/2a724501-sornio` (runs 41709217989 / 41702800767) and pixel review is **BLOCKED**.

---

## 9. Verdict

**A6 — Financial logic isolated: PASS.**

The slice is provably presentation-only: the refactored component issues four lifecycle commands and
performs no monetary computation; every financial command lives in panels excluded from the
allowlist; the native layer retains exclusive arithmetic and validation authority; and the ₹1,000.00
= ₹600.00 + ₹400.00 reference continues to be enforced in integer paise by `customers.rs` /
`billing.rs`, untouched.
