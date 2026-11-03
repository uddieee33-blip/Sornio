# SORNIO — Phase 7 Cashier Workspace Redesign Blueprint

**Status:** reviewable blueprint only. **Do not implement automatically.** No production UI, shortcut, CSS, Tailwind configuration, Rust financial code, SQLCipher schema, transaction semantics or test assertion is changed by this document.

**Audit source:** `97b6899475cc3dfa3ff1370f59373401646eecfb` (PR #145 integration head; code parent of current `main`).
**Design target:** SORNIO — PRECISION WORKSPACE, light-first, offline, Windows desktop.
**Companion documents:** `PHASE-7-WINDOWS-UX-AUDIT.md` (evidence), `PHASE-7-SORNIO-DESIGN-SYSTEM.md` (tokens/components), `PHASE-7-ADAPTIVE-WORKSPACE-CONCEPT.md`, `PHASE-7-IMPLEMENTATION-ROADMAP.md`.

---

## 1. Critical review of the proposed three-region layout

The assignment proposes a persistent three-region cashier workspace: ~320px session/search/history region, flexible center cart/order region, ~400px checkout/payment/receipt region. That is the right *concept* — total and confirm should never disappear below a long cart — but a literal 320px left panel plus a 238px existing rail would leave a 1280px shop PC with only ~660px for product discovery. The evidence-based correction is:

> **Two primary work regions + one narrow global navigation rail, with an optional collapsible context strip.**

| Region | Proposed role | Why |
|---|---|---|
| Global navigation rail | 216px expanded / 64px icon rail / 48px at ≤1024 effective CSS px; dark `#182333` | Orientation across Counter, Stock, Khata, Day close, Admin. It is not a cashier data region and must not carry a second 320px sidebar. |
| Center — discovery + cart | Flexible 600–956px depending on viewport | Product search, scanner input, results, current cart, quantities, stock, long names. This is the keyboard operator's main work area. |
| Right — checkout + payment + result | 320–420px, pinned | Active customer, subtotal/tax/total, transaction type, cash/UPI/card/credit allocation, review/confirm, saved receipt and unresolved state. |
| Optional context strip | Collapsed by default; 280–320px only at ≥1600px | Saved receipts / customer history / shortcuts. It must never push total or confirm out of view. |

Rejected alternatives:

1. **Keep all modules on one long page.** Rejected because the source puts checkout, draft, inventory, customers, retail, staff, credentials and backup on one canvas (`main.tsx:165-193`) and the prior operator review already recorded deferred tab/layout work.
2. **Literal 320px left + 238px rail + 400px right on 1280px.** Rejected because it leaves insufficient width for product names, prices and quantities at 125% scaling.
3. **Single centered column with the existing right marketing panel.** Rejected because `A STRONGER FOUNDATION` is not an operational control and totals/confirm can fall below the fold at 720p.
4. **Replace the entire app with a new router/component library.** Rejected because `App` currently owns dirty/busy/refresh coordination, and pywinauto/Playwright tests assert exact accessible names and focus behavior. A view-level composition shell can preserve both.

### 1.1 What must remain unchanged conceptually

- `CheckoutPanel` remains the owner of cart, `operationId`, `submitting`, `readGeneration`, `pending`, `invoice`, `review`, `historyOpen`, `paymentAmounts`, `paymentReferences`, `customer`, `taxPercent`, `tender`, `preview` and `problemFieldId`.
- Native `prepare_*` → `post_*` → `clear_*` lifecycle and `Retry same sale` with the same operation ID.
- `money()` / `parseFixedDecimal()` / `calculateNativeInvoice()` integer-paise calculations.
- F2/F3/F4/F8/Escape/Enter bindings and the exact hint string in the DOM.
- `SavedInvoice` snapshot reauthorization before print; print does not post.
- `UPI (unverified)`, `Card (unverified)`, `Pending — unverified`, `Externally verified: ₹0.00`, `Customer credit stays outstanding`.
- Native session/role/scope/expiry revalidation in Rust; renderer visibility is not authority.
- `productionSyncEnabled=false`; `SCHEMA_VERSION=12`; no new dependency.

---

## 2. Viewport specifications

All widths below are CSS pixels at 100% scaling. At 125% scaling a 1280×720 physical screen is ~1024×576 CSS px; the narrow rules apply. No horizontal scrolling is permitted for primary checkout controls.

| Viewport | Shell padding | Nav | Gaps | Center | Right | Total / confirm | Behavior |
|---|---:|---:|---:|---:|---:|---|---|
| 1280×720 | 16px each | 64px icon rail | 16px ×2 | **792px** | **360px** | pinned in right panel | Search, at least 5 result rows, cart totals and confirm visible without page scroll; center list scrolls internally. |
| 1280×720 @125% (~1024×576) | 12px each | 48px icon rail | 12px ×2 | **600px** | **320px** | pinned | Hide revision/secondary metadata, compact rows, allow center vertical scroll, never hide remaining/total/confirm. |
| 1366×768 | 24px each | 200px labelled | 16px ×2 | **702px** | **384px** | pinned | Full labels, 6–8 result rows, sticky cart header. |
| 1600×900 | 32px each | 216px labelled | 24px ×2 | **872px** | **400px** | pinned | Optional 280px context strip can appear; center still ≥600px. |
| 1920×1080 | content max 1760px, 40px each | 240px labelled | 32px ×2 | **956px** | **420px** | pinned | Optional context strip 320px; center remains ≥700px; extra space becomes whitespace, not decorative cards. |

Arithmetic examples:

- 1280: `1280 − (16×2) − 64 − (16×2) − 360 = 792`.
- 1024 effective: `1024 − (12×2) − 48 − (12×2) − 320 = 600`.
- 1366: `1366 − (24×2) − 200 − (16×2) − 384 = 702`.
- 1600: `1600 − (32×2) − 216 − (24×2) − 400 = 872`.
- 1920 max content: `1760 − (40×2) − 240 − (32×2) − 420 = 956`.

Vertical budget at 1280×720: 56px top status + 16px top gutter + 56px search/toolbar + ~360px results/cart + 72px totals + 56px confirm + 16px bottom gutter = 632px of the available 648px. The cart/results region is the only scroll container. Windows taskbar/titlebar variations must be validated on physical hardware.

---

## 3. Cashier workspace behavior

### 3.1 Product discovery

- Keep `#checkout-search` with label `Search items for sale` and F2 focus/select.
- Preserve exact SKU/product-ID priority: `product.sku.toLowerCase() === query` or `product.id.toLowerCase() === query`; otherwise substring match only when exactly one product matches; otherwise show a chooser. Repeated exact scan increments quantity by `1.000`.
- Preserve guards: `event.defaultPrevented`, `event.repeat`, `event.nativeEvent.isComposing`, Alt/Ctrl/Meta, `disabled`, `busy`, lock/reopen prompt; whitespace trim.
- Show the first 50 matches with a `More matches available. Refine your search.` message. If a future virtualized list is introduced, it must not remove accessible names needed by `check-native.py`.
- Two-line result rows: product name (wrap, never truncate financial amount), SKU/ID, unit, price, available stock. Out-of-stock items are textually marked and cannot be added.
- Barcode scanner is a **keyboard wedge** into the search field, not a dedicated hardware API. Unknown barcode shows `Choose one item to add, then press Enter.` and never adds a wrong product.
- Empty state: `No matching sale items` for an empty catalog; `No matches — refine the SKU or name` for a failed search. Loading: `Opening checkout…`; errors use `role=alert`.

### 3.2 Cart

- Cart remains capped at 100 lines. Each row: quantity input with `sale-quantity-<index>` ID, product name, unit, price, available stock, line total, remove action.
- F3 focuses the first quantity or cycles to the next; Enter in quantity returns focus to search. Quantity parsing remains `parseFixedDecimal(...,3)` with a ceiling of 1,000,000,000.
- Long product names and mixed-script text wrap; money columns are right aligned, tabular and `₹`-prefixed.
- Sticky cart header shows line count, subtotal and a compact `Remove` / `F3 edit quantity` hint. Removing a line never creates a new sale operation ID.
- No discount control is proposed: `SavedInvoice.tsx` explicitly says `Discounts: not recorded in this invoice.` Adding a discount UI without a native financial model would be a correctness regression.
- Tax: `taxPercent` is parsed with `parseFixedDecimal(...,3)` and sent as `taxBasisPoints`; keep the existing `Tax %` label until tests are updated.

### 3.3 Customer selection

- Reuse `CustomerLookup.tsx`'s `find_local_customers` search (name, phone or customer ID), 150ms debounce, 100-result cap, and clear `Use customer <id>` accessible name.
- Show an active-customer chip with name, ID, `Outstanding ₹…`, `Available ₹…` or `No credit limit`, and `Change`. Keep those strings from the current component because they encode real native values.
- Customer is required when `tender === 'credit'` or when `credit > 0` in a retail split. Native Rust also rejects credit without a customer and enforces `credit_limit`; the UI may explain, never override.
- `Credit limit exceeded` must remain a refusal state, not a silent disabled button that hides the reason.
- Proposed auto-generated customer slug and optional override are deferred ergonomics; they require native ID validation to remain unchanged.

### 3.4 Split cash / UPI / card / credit

The right panel becomes an allocation reconciliation table, not four unrelated inputs.

```
Invoice total                       ₹1,000.00
● Cash              [ 600.00 ]       Cash recorded
○ UPI               [   0.00 ]       Pending — unverified
  UPI ref (optional, unverified) [________________]
○ Card              [   0.00 ]       Pending — unverified
  Card ref (optional, unverified)[________________]
▢ Customer credit   [ 400.00 ]       Outstanding · native-customer-2
────────────────────────────────────────────────
Allocated           ₹1,000.00
Remaining           ₹0.00
[Fill remaining into: Cash ▾]       [Review sale →]
```

Rules:

1. `cash + upi + card + credit === totalPaise` exactly; all inputs are parsed with `parseFixedDecimal(...,2)` and converted to paise with `BigInt`.
2. Customer credit requires a selected customer. Native `payments.rs` additionally allows at most one credit part and requires `(credit_parts == 1) === customer_id.is_some()`.
3. UPI/card references are optional, unverified notes. A reference or screenshot **does not** verify a transfer. `Externally verified: ₹0.00` remains visible in payment records.
4. `Fill remaining` is a **presentation convenience** that writes into one chosen amount field. It must use the already computed integer-paise total, never a floating-point subtraction, and must not bypass review.
5. Live `Remaining` is a derived display value only; native posting still revalidates the exact request.
6. `Transaction type` remains `Cash`, `Credit`, or `UPI / card / split`; the label must not imply UPI/card verification. A copy improvement to `Split / UPI / card` requires UIA test coordination.
7. Errors: `Split payment amounts must equal the invoice total exactly.`, `Choose a customer before using customer credit.`, `A credit amount must be greater than zero.`, `UPI and card amounts must not be negative.` Preserve these exact strings where asserted.

### 3.5 Review, confirm and receipt

- `F4` calls `startConfirmation(false)`; review focuses the `Confirm sale` button. Escape cancels back to search without posting.
- Before posting: `prepare_local_checkout` / `prepare_local_retail` persists the exact request, then `post_local_invoice` / `post_local_retail`. The operation ID is generated once in `postNew()`.
- On `StoreError` with `refusedCodes`, show `Refused — edit this sale`; otherwise show `Result uncertain — retry same sale`. Both preserve the same operation ID and cart.
- Success shows `Sale saved on this PC`, `Saved total: ₹1,000.00`, stable saved invoice UUID, payment breakdown, print controls and `Start next sale`.
- Receipt recovery uses `Find saved receipt`, exact `#receipt-lookup` UUID, `read_local_invoice` + `read_local_retail` snapshot, `Ctrl+P`, language (`English` / `ਪੰਜਾਬੀ`) and paper layout (`58mm`, `80mm`, `a4`). `SavedInvoice.print()` reauthorizes before printing; a changed snapshot is refused.
- Punjabi receipt must use the bundled Gurmukhi font, `lang="pa-IN"`, `overflow-wrap:anywhere`, extra inline start padding and physical 58/80mm/A4 validation. Browser previews show possible clipping; installed-app and physical print remain unverified.
- Printing never changes a sale. Print cancellation or failure leaves the ledger untouched and keeps the receipt available to retry.
- `Start next sale` clears the checkpoint and returns focus to search. It must never create a second invoice.

---

## 4. Keyboard workflow and focus

| Key | Current behavior to preserve | Proposed focus / visual treatment |
|---|---|---|
| `F2` | Focus/select item search; exit review or history back to search | Search field gets visible ring + `F2` hint; no modal intercept. |
| `Enter` in search | Add exact SKU/ID or single substring match; repeated exact scan increments `1.000` | Result row briefly marked `Added`, cart focus unchanged, search text cleared. |
| `F3` | Focus first quantity or cycle to next | Quantity input ring; `F3` hint shown in cart header. |
| `Enter` in quantity | Return focus to search | No posting; quantity helper remains associated. |
| `F4` | Start review; focus invalid field if present; otherwise `confirmButton` | Review summary in right panel; `Confirm sale` primary and focused. |
| `Enter` on focused `Confirm sale` | Post new sale | Busy state disables fieldset; no duplicate submit. |
| `F8` | Retry pending sale with same operation ID | Persistent uncertain banner; retry button focused if body has focus. |
| `Escape` | Cancel review/history; also closes lock/reopen prompts with previous-focus restoration | No posting; focus returns to the triggering control. |
| `Ctrl/Cmd+P` | `SavedInvoice.print()` | Print notice; sale state unchanged. |
| `Tab / Shift+Tab` | Normal DOM order | Skip link → nav → search → results → cart → allocation → confirm → receipt actions. |

Global handler ignores `defaultPrevented`, `repeat`, IME composition, Alt/Ctrl/Meta modifiers, `disabled`, `busy`, and lock/reopen prompts. Do not add new global shortcuts in this redesign. A `? Shortcuts` help popover is non-modal and does not steal focus until opened.

---

## 5. Failure and retry state taxonomy

| State | Native / React evidence | Visible copy | Primary action | Secondary |
|---|---|---|---|---|
| `Opening` | `status='opening'` in `main.tsx` | `Opening local storage` | none | — |
| `Checkout unavailable` | `checkoutOpenError`, `failed=true` | `Checkout could not be opened. Refresh checkout to retry.` | `Refresh checkout` | — |
| `Preview invalid` | `problem` / `problemFieldId` | exact split/quantity/customer/tax message | fix field | — |
| `Review` | `review=true`, `preview` | item/price/allocation/credit summary | `Confirm sale` | `Edit sale` / Escape |
| `Posting` | `busy`, `submitting` | `Confirming sale on this PC…` | none | — |
| `Saved` | `invoice` loaded | `Sale saved on this PC` + receipt | `Start next sale` | Print / Find receipt |
| `Saved — refresh failed` | `refreshFailed=true` | `Sale was saved. Refresh checkout before the next sale.` | `Refresh checkout` | Start next sale after refresh |
| `Result uncertain` | non-`refusedCodes` error | `The sale result is uncertain. Retry the same sale; do not enter it again.` | `Retry same sale` / F8 | Copy confirmation ID |
| `Refused` | `refusedCodes` e.g. `day_closed`, `stock_conflict` | native refusal text | `Edit refused sale` | — |
| `Recovered saved invoice` | `openReceipt` after restart | `Recovered the saved invoice from this PC.` | `Start next sale` | Print |
| `Print failed` | `SavedInvoice` notice | `Printing could not open…` | `Print saved receipt` again | — |
| `Session locked` | `AccessGate` / `sornio-session-locked` | `This workspace is locked. Unlock to continue.` | Unlock | checkpoint preserved |

No state may be represented by colour alone. No financial error may auto-dismiss. No retry may generate a fresh `crypto.randomUUID()`.

---

## 6. Financial invariant preservation matrix

| Invariant | Current authority | Existing protection | Blueprint change | Must remain true | Future regression test |
|---|---|---|---|---|---|
| Integer paise only | `money.ts`, `fixed-decimal.ts`, `native-invoice.ts`, Rust | `BigInt`, `Intl.NumberFormat('en-IN')`, random 4,820-invoice sweep | Visual table, live remaining | No float division or JS-number cumulative balance | Existing `verify-native-money.mjs`, `verify-checkout.mjs`, `verify-native-invoice.mjs` + new UI en-IN screenshot check for `₹1,000.00`. |
| `₹1,000.00` grouped display | `money()` | installed-UI acceptance run 41702800767 | Larger 24px total | Grouping never removed | Assert exact receipt `Saved total: ₹1,000.00`. |
| Split equality | `CheckoutPanel.tsx:300-330`, `payments.rs:593-638` | exact sum + one credit part + customer requirement | Allocation table + fill helper | `cash + upi + card + credit === totalPaise` | Existing ₹1,000 split + new `Fill remaining` browser/UIA test. |
| Credit requires customer | `postNew()`, Rust | `customerId` null rejected | Customer chip | Native still rejects | Existing credit-without-customer refusal test. |
| Credit limit | native `customers.rs`/`payments.rs` | `credit_limit` refusal | Show available credit | UI never overrides limit | Existing `check-customers.cjs` / native tests. |
| UPI/card unverified | `CheckoutPanel`, `RetailPanel`, receipts | explicit text, `Externally verified: ₹0.00` | Status icons/shapes | No text implies verification | Existing `check-retail.cjs` + new string-presence UI check. |
| Exactly-once operation ID | `postNew()` + `prepare_*` | stable UUID, `submitting`, `readGeneration`, repeated Enter/Space burst | Right-panel success state | Retry never new ID | Existing `check-native.py` burst + `verify-desktop-contract.mjs` 37/37. |
| Restart recovery | native pending tables | forced `taskkill` restart preserves invoice | Recovered banner | No duplicate posting | Existing restart/reinstall checks. |
| Stock deduction once | Rust `billing.rs` | `local_invoice_stock`, revision fencing | Cart table presentation | One deduction per invoice | Existing native test + installed-UI balances. |
| Snapshot reauthorization | `SavedInvoice.print()` | re-read invoice/retail payments before print | Receipt success region | Print never posts | Existing `check-receipts.cjs`, `check-statement-print.cjs`. |
| Native permission boundary | `access.rs`, `native.ts` | session/role/expiry per command | Nav hides modules | Renderer never grants permission | Existing `check-authorization.cjs`, `check-focus.cjs`. |
| Dirty/busy coordination | `main.tsx` | `dirtyOwners`, `busyOwners`, `beforeunload` | Workspace views | No lock/restore with unsaved work | New cross-view dirty-state regression; existing focus tests. |
| Offline | Tauri capabilities + CSP | no remote auth/font/JS in ledger path | Static tokens/system font | No network required | Existing offline launch test + new network-blocked build check. |
| Replication disabled | `apps/mobile/app.json` | `productionSyncEnabled=false` | none | remains `false` | Existing contract `verify-replication.mjs`. |
| Schema identity | `schema.sql` | `SCHEMA_VERSION=12`, fingerprint gate | none | remains 12 | Existing `verify-local-schema.py`. |
| GST non-claim | receipt notice | `Local sales receipt. GST tax-invoice compliance is not claimed.` | Same notice in success state | Never claim compliance | Existing print/receipt assertions. |

**Proposed future UI regression tests (not implemented here):**

1. `cashier-layout-1280`: at 1280×720 and 125% scaling, search, total and confirm are within viewport; no horizontal scroll.
2. `cashier-keyboard-preserved`: F2/F3/F4/Enter/F8/Escape focus and posting unchanged; exact hint string remains in DOM.
3. `split-fill-remaining`: `Fill remaining` writes `₹400.00` to credit for a `₹1,000.00` invoice with `₹600.00` cash; native split still posts once.
4. `split-status-non-color`: remove all CSS colours and assert `Pending — unverified`, `Cash recorded`, `Outstanding` text/icons remain.
5. `receipt-currency-format`: all amounts use `₹` + en-IN grouping + 2 decimals at 200% zoom and 150% Windows scaling.
6. `receipt-punjabi-clipping`: Gurmukhi lines, matras and right-aligned currency columns are not clipped in browser preview and on physical 58/80mm/A4 print.
7. `uncertain-retry-no-new-id`: forced mid-post failure → restart → F8 → same UUID, one invoice, one stock deduction.
8. `print-does-not-post`: cancel/Windows print dialog / print failure leaves balances and receipt unchanged.
9. `permission-view-boundary`: cashier sees no owner/admin controls; direct native command still refuses unauthorized operation.
10. `dirty-cross-view-lock`: unsaved checkout/inventory/backup draft blocks lock/restore and focus returns to the dirty view.
11. `reduced-motion-and-forced-colors`: all state changes are instant and status meaning survives Windows High Contrast.
12. `barcode-scanner-cadence`: physical HID scanner with Enter/Tab suffix, rapid repeated scans, unknown barcode; no dropped digits or duplicate line.

---

## 7. Lighter specs for other modules

### 7.1 Inventory

- Dedicated `Stock` view: search-first table, `Add item`, `Record stock change`, `Stock history`. Keep exact UIA labels and `Acknowledge item save` pending receipt.
- Show name, SKU/ID, unit, price, available stock, revision. Hide revision first on narrow viewports.
- Long product names wrap; stock/price columns are tabular. Low-stock signal is text + shape, not a colour-only dot. Reorder thresholds, suppliers, variants, batch inward and importer are **proposed future requirements**, not implemented features.
- Empty: `Your saved items will appear here`. Loading: `Opening items on this PC…`. Errors: duplicate SKU, stock conflict, inventory pending receipt.
- Do not alter `add_local_product`, `adjust_local_stock`, `acknowledge_local_inventory` or refresh-token behavior.

### 7.2 Customers & credit

- Dedicated `Khata` view: customer search → account header (`Outstanding`, `Overdue`, `Available` / `No credit limit`) → statement table → repayment/corrections.
- Preserve `CustomerLookup` strings, native statement escaping, `read_customer_statement` reauthorization and print notice.
- Statement table uses `scope`, sticky headers, right-aligned tabular `₹` amounts, and a disclosure for long reference text. `Load 100 more history entries` remains available.
- Repayment uses the existing review/confirm/start-next receipt. `Settle in full` is a future convenience that must still go through native `overpayment` / `credit_limit` rules.
- Empty / loading / error states are explicit; full Punjabi UI localization is a future phase.

### 7.3 Returns / refunds

- Dedicated `Returns` area inside Day close or Khata, not a lower fieldset on a long page.
- Inputs: invoice lookup (pre-filled when opened from a saved receipt), return quantities, condition, reason. The reason field must be adjacent to the return action it validates.
- Native quote remains authoritative: `Cash to refund`, `Customer credit reduction`, `Digital refund pending`, `Unverified pending payment cancelled`, and stock restoration must be shown before `Review invoice return`.
- Complex credit returns remain refused natively; the UI must show `Complex credit sale. This return needs owner review.` rather than pretending support.
- `Digital refund pending` must never be labelled paid or externally verified.
- Empty: `No invoice selected`. Loading: quote calculation. Error: `day_closed`, `complex_credit_return`, `payment_conflict`.

### 7.4 Daily closing

- Dedicated `Day close` view with business day, cashier, state, expected/counted/variance table, payment breakdown, invoice register, returns and CA CSV.
- `Expected cash`, `Counted cash`, `Variance -₹0.01`, sign explanation, `Closed` / `Reopened` history and reason are textual. No colour-only variance.
- Reopen reason field sits next to `Reopen day`, not in the returns fieldset.
- Closing remains immutable and reason-gated; `day_closed` / `duplicate_settlement` native errors remain visible.
- Empty: `No payment records yet`. Loading: `Opening payment records…`. Error: CSV export/snapshot conflict.

### 7.5 Business settings

- Dedicated `Admin` view with sections: Business, Staff & permissions, Receipts, Backup & recovery, Devices (future placeholder only).
- Business name/type are setup-time values; do not expose a mutable business name that could change a historical receipt. GSTIN/legal address/FSSAI are **not implemented** statutory fields; show them only under an explicit future-requirements note.
- Staff role matrix is informational; native `access.rs` remains the authority. Disabled accounts are textually marked.
- Backup retains two-step current/recovery/original passwords, SHA-256 preview, `RESTORE <hex>` confirmation, safety backup, fail-closed lock and staff-disable-on-restore behavior. Destructive actions are in a clearly labelled danger zone.
- Device settings are a **future module** with explicit detected/supported/configured/tested states. Windows Hello, fingerprint pad, cash drawer kick and direct thermal-printer configuration are not implemented.
- Empty / loading / error states are explicit; no settings screen may imply cloud sync. `productionSyncEnabled=false` stays.

---

## 8. Acceptance principles

1. **Financial truth first.** Every visible amount, payment state and stock effect comes from the native store.
2. **One sale, one ID, one posting.** Layout changes never introduce a second submit path.
3. **Total and confirm always visible** at required viewports and Windows scaling.
4. **Keyboard-first.** Existing shortcuts, focus order and scanner/IME guards remain intact.
5. **No colour-only status.** Text + icon + shape always carry meaning.
6. **Print is non-posting.** Receipt and statement print re-check immutable snapshots.
7. **Native authority.** UI visibility is not authorization; no financial logic moves to React.
8. **Offline by construction.** No runtime network dependency, no new runtime package, no remote font.
9. **Evidence before claims.** No invented screenshots, time savings, measured performance or hardware support.
10. **Founder approval gate.** This blueprint stops at review; implementation requires an explicit decision.
