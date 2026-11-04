# SORNIO — Phase 7 / Assignment 2: Windows–Android Experience Contract

**Status:** PROPOSED CONTRACT FOR FOUNDER REVIEW — not an approved specification.  
**Production implementation authorization:** NOT YET GRANTED. **Automatic merge authorization:** NONE.  
**Principle:** reliability over decoration; a verified transaction outranks an animation.

---

## 1. Purpose and scope

This contract defines the **experience rules** that any future, separately approved production UI work must preserve across the offline-first Windows POS and the read-only Android companion. It does not authorize implementation. It reconciles three currently inconsistent sources: desktop plain CSS, mobile Dawn/Dusk tokens, and the web ten-theme OKLCH palette system.

Non-negotiable boundaries:

- Windows remains the local financial authority; Android remains read-only unless separately authorized and fully tested.
- `productionSyncEnabled=false`; no live replication is deployed.
- GST PR #127 and multi-till LAN PR #126 remain isolated workstreams.
- `SCHEMA_VERSION=12`, integer-paise `BigInt`, native RBAC, stable operation IDs and review-before-post remain untouched.
- Every prototype remains `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE`; no synthetic visualization is mixed with authentic captures.

---

## 2. Shared identity contract — proposed, not hard-coded

| Semantic role | Explored candidate | Windows prototype | Android prototype | Rule |
|---|---|---|---|---|
| App background | `#F7F8FA` | Yes | Yes | One semantic token, not three unrelated palettes |
| Surface | `#FFFFFF` | Yes | Yes | White cards/lift surfaces |
| Navigation / ink | `#182333` | Dark rail + primary text | Ink text | 15.82:1 on white |
| Secondary text | `#667085` | Metadata | Metadata | 4.97:1 on white; **never on `#E7EEE9`** |
| Primary action / focus | `#246B65` | Buttons, focus, active nav | Accents, active tab | 6.24:1 on white; ≥3:1 non-text |
| Soft accent | `#E7EEE9` | Grouped totals | Selected sync state | Use `#52606D` text, add edge/text when conveying selection |
| Rejected current focus | `#829fce` | Not used | Not used | 2.69:1 on white; replace |
| Nav focus | `#7BC2B7` | Active marker | — | 7.72:1 on `#182333` |

**Contradictions resolved:**

1. Assignment 1 proposed a 200px labelled nav at 1366×768; the founder now asks for Direction A’s narrow rail. The 200px value is **not mandatory**. Direction A uses 64px; Direction B uses 180px.
2. Assignment 1 proposed an optional third context strip at 1600/1920. The V1 prototypes deliberately **omit** it: extra space becomes whitespace, not decorative cards.
3. Assignment 1 discussed dark/high-contrast and density modes as future options. They remain **open decisions**, not implemented.
4. Assignment 1 discussed salon/gym/cafe adaptive templates. V1 is narrowed to retail/grocery/kirana/cycle-spares/hardware; hardware/cycle labels are proposed, not current `PortalId`s.
5. Assignment 1 assumed Punjabi receipt-only scope. This contract keeps that scope; full Android/Hindi localization is proposed, not implemented.
6. Assignment 1’s 24-component library is a future architecture, not a V1 prerequisite. Seven Windows screens and five Android screens are the review surface.

---

## 3. Sixteen-item financial safety contract

These invariants are carried forward from Assignment 1 and current source. A visual change must not weaken any of them.

| # | Invariant | Current authority | Required future regression |
|---|---|---|---|
| 1 | Integer paise only; `BigInt`; no float cumulative balance | `money.ts`, `fixed-decimal.ts`, `native-invoice.ts`, Rust | `verify-native-money.mjs`, `verify-checkout.mjs`, `verify-native-invoice.mjs` |
| 2 | `₹1,000.00` / `en-IN` grouping / two decimals | `money()`, `Intl.NumberFormat('en-IN')` | Exact receipt `Saved total: ₹1,000.00`; 200% zoom and 150% scaling checks |
| 3 | Exact split equality: `cash + upi + card + credit === totalPaise` | `CheckoutPanel.tsx`, `payments.rs` | Existing `₹1,000 = ₹600 + ₹400` split and any future `Fill remaining` UI test |
| 4 | Credit always requires a customer | `postNew()`, Rust | Credit-without-customer refusal test |
| 5 | Native credit limit remains authoritative | `customers.rs` / `payments.rs` | Credit-limit refusal; UI never overrides |
| 6 | UPI/card remain explicitly unverified | `CheckoutPanel`, `RetailPanel`, receipts | String-presence check; `Externally verified: ₹0.00` preserved |
| 7 | Exactly-once stable `operationId` | `postNew()` + `prepare_*` | `verify-desktop-contract.mjs` 37/37; repeated Enter/Space burst |
| 8 | F8 / retry resubmits the same pending operation ID | `main.tsx`, `SavedCopies.tsx` | Forced mid-post failure → restart → F8 → same UUID, one invoice |
| 9 | Restart / process death recovery creates no duplicate | Native pending tables | `verify-recovery.mjs`, `verify-reliability.cjs`, installed-UI restart/reinstall |
| 10 | Stock deducted once per invoice with revision fencing | `billing.rs`, `local_invoice_stock` | Native concurrency matrix and installed-UI balances |
| 11 | Print snapshot reauthorization; printing never posts | `SavedInvoice.print()` | `check-receipts.cjs`, `check-statement-print.cjs`, print cancel/failure |
| 12 | Native RBAC / session / expiry remains authoritative | `access.rs`, `native.ts` | `check-authorization.cjs`, `check-focus.cjs`; renderer never grants permission |
| 13 | Dirty/busy coordination and focus restoration | `main.tsx` `dirtyOwners`, `busyOwners`, `beforeunload` | Cross-view dirty lock/restore regression; Escape returns focus |
| 14 | Offline-first; no remote JS/font/JS in ledger path | Tauri capabilities + CSP | Offline launch with outbound firewall; network-blocked build check |
| 15 | `productionSyncEnabled=false`; `SCHEMA_VERSION=12` | `app.json`, `schema.sql` | `verify-replication.mjs`, `verify-local-schema.py`; no live deployment |
| 16 | GST non-claim preserved; PR #127 not integrated | Receipt notice | Print/receipt assertions; no statutory GST invoice claim |

Additional preservation rules: review-before-post, Escape cancellation, reduced motion, stable UIA names, `Saved invoice ID`, `Retry same sale`, `Print saved receipt`, and “Sale saved on this PC” copy must not be renamed without a coordinated test update.

---

## 4. WCAG 2.2 AA and localization review

| Area | Contract | Verification status |
|---|---|---|
| Contrast | Normal text ≥4.5:1; large text / UI boundaries / focus ≥3:1 | Ratios computed; see [VALIDATION.md](../phase7-assignment2/VALIDATION.md) |
| Focus | 2–3px visible ring, never removed for mouse users | Prototype uses `#246B65`; UIA/High Contrast still untested |
| Targets | 44×44 CSS px primary/destructive/touch; 36px compact table rows only | Prototype buttons 40–44px; mobile tokens `touch=44` |
| Semantics | One `main`, labelled `nav`, one `h1`, `aria-current`, table `scope`, `label for`, `aria-invalid`, `aria-busy`, `role=alert/status` | Static PNG cannot prove; production DOM gate |
| Errors | Text + programmatic association + focus to first invalid control; financial errors persist | Prototype uses text + shape; production gate |
| Text scaling | 200% browser zoom, 125% / 150% Windows scaling, no clipped totals or UUIDs | 125% PNG checked; 200% / 150% physical untested |
| High contrast | `forced-colors: active`; status survives without colour | Prototype statuses have text/icon/shape; physical untested |
| Reduced motion | Honour `prefers-reduced-motion`; no decorative animation in financial path | `prototype.css` has reduced-motion rule; PNGs static |
| Screen readers | Preserve stable UIA/Playwright names | Future coordinated test update required |
| English default | Retail vocabulary: Billing, Stock, Customers / Udhar, Payments, Day closing | Used in prototypes |
| Punjabi | Receipt-only `pa.json` with 33 verified phrases; do not silently overwrite | Glyph coverage checked; physical Gurmukhi print untested |
| Hindi / full Android localization | **Proposed**, not implemented | No verified Android `pa`/`hi` catalogue found |
| Currency | `₹` + `en-IN` grouping + 2 decimals; tabular numerals | Prototype uses DejaVu Sans Mono; production should use `tabular-nums` |
| Mixed script | `lang`, `dir=ltr`, Gurmukhi-capable font, wrap long names, no clipped matras | Partial static check; hardware print gate |
| Fonts | Windows-compatible, licensed; bundled Noto Sans Gurmukhi OFL 1.1 | [FONT-LICENSES.md](../phase7-assignment2/FONT-LICENSES.md) |

---

## 5. Windows ↔ Android experience contract

| Topic | Windows | Android | Shared rule |
|---|---|---|---|
| Authority | Local financial posting, native revalidation, receipts, backup | Read-only demonstration companion | Android never posts or overrides Windows |
| Data freshness | `On this PC · Offline`, revision, saved-on-this-PC | `DEMO DATA — NOT LIVE`, `figures may be outdated`, `Last sync` | Never present stale cached data as verified real-time balance |
| Navigation | Persistent rail + focused routes | Bottom tabs / tablet rail | Same familiar labels; not a shrunken desktop table |
| Payment | Persistent right panel, total/confirm pinned | No payment/checkout screen | No Android checkout unless separately authorized |
| Status | `● Cash recorded`, `▢ Outstanding`, `△ Pending`, `✓ Saved`, `! Reauth`, `× Failed` | Same vocabulary adapted to cards | Text + shape + colour; never colour alone |
| Recovery | F8 same-ID retry, original operation ID, no duplicate | Read-only activity may show `Refund pending`; no retry posting | Recovery language must not imply a second sale |
| Onboarding | Deterministic V1 retail templates; only implemented modules | No business configuration posting | AI / descriptive profile is concept-only |
| Theme | Light-first operational workspace | Phone-first cards, optional Dawn/Dusk currently separate | One semantic token contract after founder decision |
| Release | Unsigned engineering builds; physical pilot NO-GO | Debug APK only; public release NO-GO | No cross-platform launch claim |

---

## 6. Future replication path analysis — `productionSyncEnabled=false` preserved

Current `packages/replication-cloud` contains 12 `src/*.ts` files and `sql/20261103000000_native_financial_replication.sql`. This is a **future path**, not deployed synchronization:

- `auth.ts` validates business/device IDs, restore generation, revocation, expiry, enrolled business/role/generation, publisher/reader separation, and token length ≤4096. `canSeeCustomers` is owner/manager/auditor only.
- `envelope.ts` validates schema version, stream, positive 1–19-digit sequence string, operation ID, event type, millisecond UTC timestamp, SHA-256 payload digest, native payload-text JSON and identity fields.
- `store.ts` is an **in-memory `CloudStore`** with business/device/event/operation/cursor/head maps, generation rotation, atomic copy/apply and `tenantKey`.
- SQL enables/forces RLS on events, invoices, pending-retail, inventory, customers, projection cursor, customer statements; unique `(business_id, restore_generation, stream, operation_id)` and stream sequence; reader policies scope `business_id` to JWT claim; customers/statements restricted to owner/manager/auditor; publisher-only inserts.
- Open gap: `acks` has RLS `ENABLE` but no `FORCE`/policy; documented as privileged-ingest-only. Revoked-device ingest matrix is partial; dedicated non-superuser ingest owner is required at deploy time.
- `ProductionAuth` / `ProductionSnapshotAdapter` still throw `PRODUCTION_DISABLED`; `parseLiveSnapshot()` rejects demo sessions, wrong business IDs and non-`desktop-outbox` sources.
- `productionSyncEnabled=false` must remain. No live sync, no GST PR #127 integration, no LAN PR #126 integration, no new financial feature, no Android posting terminal.

**Gate before any future live sync:** founder authorization, dedicated auth/session device tests, revoked-device matrix, `acks` RLS hardening, non-superuser ingest owner, TLS termination, real PostgreSQL concurrency, restore-generation reset, physical WAN failure, and a separately reviewed change-control package.

---

## 7. Open founder decisions inherited and extended

1. Approve Direction A, Direction B, or A with selected B refinements.
2. Approve or reject the 64px icon rail at 1366×768 and compact rules at 125%.
3. Decide the minimum supported effective CSS viewport and whether 150% scaling is in V1 scope.
4. Decide whether the web ten-theme palette, mobile Dawn/Dusk, or a new semantic PRECISION WORKSPACE token set becomes the cross-platform source of truth.
5. Decide Punjabi scope: receipt-only with the existing 33 verified phrases, or a separately funded full UI localization project.
6. Decide whether `Fill remaining` is ever allowed and which tender receives the remainder.
7. Decide whether a `cycle-parts` / hardware template ID may be added, or must map to `general`.
8. Decide the device-capability threshold for changing `Untested` to `Tested`.
9. Decide code-signing provider and release identity; no certificate infrastructure exists.
10. Decide whether Android may ever gain live auth/sync or financial posting; current answer must remain **no**.
11. Decide who may change workspace configuration and whether manager changes require owner approval.
12. Decide where adaptive preferences are persisted without changing `SCHEMA_VERSION=12` in this phase.
13. Decide whether the 15-minute idle lock must explain unresolved sales before locking.
14. Decide whether statutory GST fields are a funded requirement; PR #127 remains separate.
15. Decide whether multi-till LAN PR #126 remains isolated from the V1 UI work.
16. Decide whether to open a `NONPRODUCTION DESIGN REVIEW` draft PR.

---

## 8. Contract verdict

The contract is **complete for review** but **not approved for implementation**. It preserves all 16 financial invariants, keeps Android read-only/demo/stale-labelled, keeps live sync disabled, and separates design evidence from installed-app evidence. Founder approval is required before any production UI, CSS, component, shortcut, Rust, SQLCipher, schema, dependency, test assertion, release or Android capability change.
