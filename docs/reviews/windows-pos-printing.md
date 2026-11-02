# Windows POS Keyboard Workflow, Saved Receipt Printing & Punjabi Receipt Review

**Date:** 2026-11-02  
**Baseline:** `main` (`03dd8b4b0e657f92a31dde6978cebaf89be40ecf`)  
**Evaluated PR:** `#128` (`feature/windows-pos-keyboard-printing`, head `ba182c09`)  
**Integration Branch:** `arena/5bcb50e7-sornio`

## 1. Scope & Non-Claims

This integration completes the PR `#128` cashier keyboard, saved-receipt printing (`58mm`, `80mm`, `a4`), and scoped Punjabi (`pa-IN`) Gurmukhi receipt localization capabilities on top of the consolidated `main` encrypted SQLCipher / Tauri Windows desktop foundation:

- **Native Rust financial authority preserved:** `packages/local-store` (`billing.rs`, `payments.rs`, `customers.rs`, `catalog.rs`, `access.rs`, `identity.rs`) owns all prices, stock revisions, integer-paise arithmetic, split cash + customer-credit subledger accounting, idempotent `operation_id` replay, and role/ownership authorization.
- **Honest print boundary:** Browser/WebView2 print-root DOM isolation, CSS `@page` sizing (`58mm` -> `52mm` printable width, `80mm` -> `74mm` printable width, `a4` -> `100%` width with `12mm` margins), and PDF generation verify software print preparation only. Returning from or cancelling `window.print()` does **not** prove physical paper output, Windows thermal driver margins, roll cutter behavior, USB barcode scanner HID timing, or cash-drawer kick pulses.
- **Honest receipt & localization scope:** Saved receipts render only persisted snapshot fields (`businessName`, `invoiceNumber`, `id`, `createdAt`, `tender`, `customerId`, `lines`, `subtotalPaise`, `taxPaise`, `totalPaise`, and retail `payments`). Missing legacy fields use explicit legacy placeholders; GST tax-invoice compliance, unrecorded discounts, and external UPI/card verification are never claimed. Punjabi translation in `apps/desktop/src/locales/pa.json` (33 keys) is intentionally scoped to receipt controls and printable receipt labels rather than full desktop workspace UI localization.

## 2. PR #128 13-File Integration Matrix

| # | PR #128 File | Classification | Disposition & `main` / Branch Code Reference |
|---|---|---|---|
| 1 | `apps/desktop/src/CheckoutPanel.tsx` | **Integrated & Expanded** | Preserved `main` retail split + customer-credit + stale-read-fencing foundation (`CheckoutPanel.tsx:16-468`), and added window-level `F2`/`F3`/`F4`/`F8`/`Escape` shortcuts, post-render focus restoration (`pendingFocus`), multi-line `F3` cycling, `F4` invalid-field focus + structured item/price/allocation/credit review summary, whitespace-trimmed barcode/SKU/ID lookup, key-repeat/IME guards, and retail payment loading on receipt reopen (`openReceipt`). |
| 2 | `apps/desktop/src/SavedInvoice.tsx` | **Integrated & Hardened** | Preserved native `read_local_invoice` snapshot verification (`SavedInvoice.tsx:15-57`), added optional `payments` + `username` props to render per-method retail split breakdowns (`cash`, `credit`, `upi`, `card` + unverified reference) and re-verify `read_local_retail` payment snapshots before `window.print()`, and localized all remaining receipt labels via `pa.json`. |
| 3 | `apps/desktop/src/main.tsx` | **Selectively Adapted** | Passed `username={session.principal.username}` to `CheckoutPanel` and added initial focus, `Escape` dismissal, and previous-focus restoration for `lockPrompt` and `reopenPrompt` (`main.tsx:39-53, 128-137, 159-181`). Intentionally rejected PR `#128`'s `I18nProvider` wrapper (from hosted `lib/i18n.tsx`, which relies on `localStorage`/`fetch`) and mutable draft `businessName` prop (which violated historical receipt immutability). |
| 4 | `apps/desktop/src/receipt-print.ts` | **Integrated & Hardened** | Preserved shared receipt/statement job lifecycle, `sornio-session-locked` abort listener, pre- and post-font native `await authorize()` gate, duplicate-ID stripping, and `window.print()` contract (`receipt-print.ts:1-60`), while adding `58mm`/`80mm`/`a4` typography (`11px/1.45` on `58mm`, `12px/1.45` on `80mm`/`a4`) and flex line-item/amount alignment so Gurmukhi matras and currency figures do not clip or collide. |
| 5 | `apps/desktop/src/style.css` | **Integrated** | Preserved `@font-face` (`Sornio Gurmukhi` -> `/fonts/noto-sans-gurmukhi.woff2`), appended `"Sornio Gurmukhi"` to `:root` font stack (`style.css:1-2`), and added `.checkout-review-summary` layout styles (`style.css:50`). |
| 6 | `apps/desktop/vite.config.ts` | **Integrated** | Added `resolve: { dedupe: ['react', 'react-dom'] }` (`vite.config.ts:6`) so shared workspace helpers never load duplicate React instances alongside `apps/desktop/node_modules/react`. |
| 7 | `apps/desktop/public/locales/pa.json` | **Relocated & Expanded** | Relocated in `main` to bundled `apps/desktop/src/locales/pa.json` (eliminating runtime `fetch('/locales/pa.json')`) and expanded from 18 to 33 keys covering split cash, customer credit, unverified UPI/card, references, sale numbers, legacy notices, and print status messages. |
| 8 | `apps/desktop/public/fonts/noto-sans-gurmukhi.woff2` | **Already Integrated (Byte-Identical)** | Present on `main` (`11,400` bytes, SHA-256 identical to PR `#128`), containing `GDEF`/`GPOS`/`GSUB` OpenType shaping tables and 104 mapped codepoints covering all 49/49 Indic characters used in `pa.json` plus `₹` (`U+20B9`). |
| 9 | `apps/desktop/public/fonts/NotoSansGurmukhi-OFL.txt` | **Already Integrated (Byte-Identical)** | SIL Open Font License 1.1 text bundled offline alongside the WOFF2 subset. |
| 10 | `apps/desktop/check-checkout.cjs` | **Superseded / Split on `main`** | Kept `main`'s 231-line real SQLCipher checkout/recovery acceptance suite intact (`check-checkout.cjs:1-231`); receipt/Punjabi/layout checks live in dedicated `apps/desktop/check-receipts.cjs` (`check-receipts.cjs:1-174`), which now also verifies split `₹600` cash + `₹400` credit keyboard review, `Escape` cancel, English/Punjabi printing, and saved-receipt reopen. |
| 11 | `apps/desktop/check-native.py` | **Already Integrated & Expanded** | `main` already incorporates exact-code `{ENTER}` cart entry (`check-native.py:260-261`) plus full cash, credit, cashier role boundary, retail split, backup/restore, and offline NSIS installer lifecycle stages (`check-native.py:1-620`). |
| 12 | `.github/workflows/windows-local.yml` | **Already Integrated & Superseded** | Root `npm ci` and dual lockfile caching from PR `#128` were re-applied in commit `94c5cfc` (`windows-local.yml:28-44`) alongside PR `#135` SHA-pinned actions, debug + release Rust encrypted-store suites, `Invoke-NativeCheck` fail-closed guards, and `::error::` failure annotations. |
| 13 | `docs/reviews/windows-pos-printing.md` | **Updated** | Replaced PR `#128`'s stale pre-consolidation note with this current baseline integration and verification record. |

## 3. Repeatable Interactive Timing Summary

Measured across `N = 50` iterations per operation against a 254-SKU active catalog and 124 persisted invoices (`Linux 6.1.158+ x64`, 2-core Intel Xeon @ 2.60 GHz, Node `v22.22.3`, React `19.2.5` + Vite `8.3.5` bundle + JSDOM + Python `3.11` SQLite3 IPC store):

| Operation | Sample Size (`N`) | Median (`p50`) | `p95` | Worst (`max`) |
|---|---:|---:|---:|---:|
| Product search filtering (254 active SKUs) | 50 | `2.25 ms` | `3.85 ms` | `7.52 ms` |
| Exact barcode/code lookup | 50 | `6.74 ms` | `19.20 ms` | `19.62 ms` |
| Keyboard cart entry (`Enter`) | 50 | `22.88 ms` | `38.46 ms` | `48.14 ms` |
| Quantity edit (`F3` + decimal preview math) | 50 | `2.11 ms` | `7.63 ms` | `8.19 ms` |
| Checkout review transition (`F4` -> `Confirm sale` focus) | 50 | `8.13 ms` | `19.59 ms` | `19.95 ms` |
| Receipt print preparation (`58mm` / `80mm` / `a4`, EN & PA) | 50 | `8.16 ms` | `9.86 ms` | `12.25 ms` |
| Saved invoice lookup & render (`#receipt-lookup` + `Enter`) | 50 | `15.36 ms` | `37.23 ms` | `40.96 ms` |

## 4. Remaining Physical Hardware Validation (Pre-Shop Pilot)

Automated CI and local suites validate React state transitions, SQLCipher/SQLite transactional invariants, role/ownership authorization, print DOM isolation, `@page` CSS rules, and bundled Gurmukhi glyph coverage. Before physical counter deployment, run manual pilot verification on target Windows shop hardware for:
1. Physical `58mm` and `80mm` thermal receipt printers (Windows GDI/POS driver margin clipping, paper feed, cutter behavior, and Gurmukhi contrast on thermal paper).
2. Physical A4 laser/inkjet printer output via the Windows print dialog.
3. Physical USB HID barcode scanner prefix/suffix termination (`Enter` vs `Tab`) and inter-keystroke cadence.
