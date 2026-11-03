# SORNIO — Phase 7 Adaptive Workspace Concept

**Status:** concept only. No onboarding implementation, AI feature, device integration, schema migration, production sync, dependency or production UI change is authorized or included.

**Audit source:** `97b6899475cc3dfa3ff1370f59373401646eecfb` (PR #145 integration head; code parent of current `main`).
**Purpose:** define how a deterministic, business-aware workspace *could* work in a future phase without weakening the current offline financial authority.

---

## 1. Existing foundation — honest status

| Existing piece | Source | What it does today | What it does **not** do |
|---|---|---|---|
| Business type in setup | `apps/desktop/src/AccessGate.tsx` | `businessType` is one of `general`, `kirana`, `general`, `cafe`, `gym`, `salon`, `electronics`, `boutique`, `service` (allowed `PortalId` values) and is passed to `setup_local_access`. | It does not change desktop navigation, modules, labels or permissions. |
| Draft business fields | `apps/desktop/src/main.tsx` | Owner draft stores a business name, type and note; `dailyWorkspace(type)` supplies a short description under the draft form. | It is not an operational workspace configuration. |
| Deterministic templates | `packages/business-domain/src/daily-workspace.ts` | Pure `dailyWorkspace(type)` returns a label, headline, primary/secondary card names and links. | Its links are hosted-web paths (`/appointments`, `/memberships`, `/check-ins`, `/tables`, `/billing`, etc.) that do not exist in the offline desktop app. It must not be reused blindly. |
| Native session | `packages/local-store/src/access.rs`, `identity.rs` | Every command revalidates session, role, revision and expiry; LAN enrollment/restores are separately gated. | No renderer profile or template can grant permission. |
| Replication flag | `apps/mobile/app.json` + release docs | `productionSyncEnabled=false`. | No cloud sync or multi-till coordination is enabled. |
| Schema | `packages/local-store/src/schema.rs`, `sql/schema.sql` | `SCHEMA_VERSION=12`, append-only financial tables, restore-generation identity. | No adaptive-workspace table or migration exists in this assignment. |

**Conclusion:** the current app has a small deterministic *foundation*, not an adaptive workspace. A future implementation must start from a desktop module registry that contains only modules whose native commands and tests already exist.

---

## 2. Business-profile fields (proposed data shape)

Illustrative TypeScript only; **no file is created in `apps/desktop/src`**.

```ts
// Conceptual shape — NOT IMPLEMENTED
type BusinessProfile = {
  version: 1;
  profileId: string;               // stable local identifier
  templateId: 'general-retail' | 'grocery' | 'cycle-parts' | 'salon' | 'restaurant' | 'gym';
  legacyPortalId: PortalId;        // maps to an existing deterministic domain value
  label: string;                   // owner-visible name
  descriptionSource: 'template' | 'owner-text'; // optional future AI input, never authority
  locale: 'en-IN' | 'pa-IN';       // receipt scope today; full UI is future
  currency: 'INR';                 // en-IN grouping, integer paise
  timezone: 'Asia/Kolkata';        // display only until natively tested
  modules: ModulePreference[];
  density: 'comfortable' | 'compact';
  configuredAt: string;            // local timestamp
  configuredBy: string;            // native principal username
};
```

Rules:

- `profileId`, `templateId` and `modules` are local preferences only. They never alter invoice arithmetic, stock posting, credit limits, role checks, `business_id`, `generation`, receipts or restore identity.
- Description text is never used to infer a legal entity, tax regime, credit policy or permission. GSTIN/legal name/FSSAI/licence fields are **future product requirements**, not current desktop fields.
- Currency stays `INR`; dates display `en-IN` and a tested business timezone. Current source uses `en-IN` and `Asia/Kolkata` in receipts; a configurable timezone must be a separately tested native setting.
- `version` allows a future migration without changing historical invoices. No migration is performed in this assignment.

---

## 3. Module registry

A future registry is a **description of existing capabilities**, not a feature flag that can bypass native authority.

| Module ID | Label | Required native commands / state | Currently implemented | Default visibility | Permission boundary |
|---|---|---|---|---|---|
| `counter.checkout` | Counter | `read_cashier_state`, `prepare_local_checkout`, `post_local_invoice`, `prepare_local_retail`, `post_local_retail` | Yes | Always visible to any unlocked session with `Sell` | Native session/role revalidation |
| `counter.receipts` | Saved receipts | `list_local_invoices`, `read_local_invoice`, `read_local_retail` | Yes, `reportsAllowed` gates balances/receipts | Visible in Counter | Native report permission |
| `stock.items` | Items & stock | `list_local_products`, `add_local_product`, `adjust_local_stock`, `acknowledge_local_inventory` | Yes | Default on for inventory businesses | `canAdd` UI + native `Product`/stock permission |
| `khata.customers` | Customers & credit | `find_local_customers`, `save_local_customer`, `read_customer_statement` | Yes | Default on where credit is used | `manage` UI + native `Customer` permission |
| `khata.repayments` | Repayments & ledger | `prepare_local_credit`, `post_local_credit`, `read_customer_statement` | Yes | Default on with `khata.customers` | `CollectCredit` + correction permissions |
| `day.closing` | Day close | `read_local_retail`, `prepare_local_retail`, `post_local_retail` | Yes | Default on | Manager/owner corrections; cashier review |
| `day.returns` | Returns / refunds | `quote_local_return`, `prepare_local_retail`, `post_local_retail` | Yes | Default on | Manager/owner; native `ComplexCreditReturn` refusal |
| `day.exports` | CA CSV | `export_local_settlements` | Yes | Manager-only | Native report/manager boundary |
| `admin.staff` | Staff & permissions | `list_local_staff`, `create_local_staff`, `change_local_staff` | Yes | Owner only | Native `Staff` permission |
| `admin.credentials` | Passwords | `change_local_password`, `reset_local_staff_password` | Yes | Every user; owner additional controls | Native `Settings`/owner password |
| `admin.backup` | Backup & recovery | `choose_local_backup`, `export_local_backup`, `preview_local_backup`, `restore_local_backup` | Yes | Owner only | Native `Settings`, passphrases, confirmation |
| `admin.savedCopies` | Saved local copies | `list_saved_copies`, `restore_workspace`, `delete_workspace_copy` | Yes | Owner only | Native draft authority |
| `admin.business` | Business identity | setup-time values; no mutable historical receipt fields | Partial | Owner only | Native identity boundary |
| `admin.devices` | Device settings | none | **Proposed placeholder** | Hidden by default; explicitly labelled future | No permission exists |
| `reports.dashboard` | Operational dashboard | none | **Not implemented** | Hidden | Do not show fake metrics |
| `catalog.variants` | Variants | none | **Not implemented** | Hidden | Do not show |
| `catalog.suppliers` | Suppliers / reorder | none | **Not implemented** | Hidden | Do not show |
| `tax.gst` | GST tax invoice | none | **Not implemented** | Hidden; receipt explicitly disclaims compliance | Requires legal/financial design first |
| `sync.cloud` | Cloud sync | `productionSyncEnabled=false` | **Disabled** | Hidden | Never imply availability |

Registry entry fields (conceptual): `moduleId`, `labelKey`, `descriptionSource`, `nativeCommands[]`, `requiredPermission`, `implementedStatus`, `testIds[]`, `defaultVisible`, `hideable`, `order`, `fallbackModuleId`, `riskClass`. `implementedStatus` must be one of `implemented`, `partial`, `placeholder`, `untested`, `proposed`. A module may be visible only if `implementedStatus === 'implemented'`, its commands are available, and the native session permits it.

---

## 4. Deterministic templates

Templates are static, reviewed maps from a business type to module visibility/order. They never change financial behavior.

| Template | Existing domain mapping | Default modules | Explicitly excluded | Notes |
|---|---|---|---|---|
| General retail | `general` | Counter, receipts, items & stock, khata, day close, returns, admin | devices, dashboard, GST, variants | Safe default for existing workspaces. |
| Grocery / kirana | `kirana` | Counter, receipts, items & stock, khata, day close, returns, admin | appointments, memberships | Khata vocabulary is important; `daily-workspace.ts` already emphasizes daily collection. |
| Cycle & spare parts | **No current `PortalId`**; map to `general`/`electronics` with a new deterministic label only after product decision | Counter, receipts, items & stock, day close, returns, admin | service appointments | A new template ID is allowed; do not pretend an unimplemented appointment/work-order module exists. |
| Salon / service | `salon` or `service` | Counter, receipts, khata, day close, admin; items only if owner enables | appointments, memberships | Web `dailyWorkspace()` links `/appointments`, `/memberships`; desktop has neither. Hide them. |
| Restaurant / cafe | `cafe` | Counter, receipts, items & stock, day close, admin | table management, kitchen display | `/tables` is a web route, not a desktop module. |
| Gym | `gym` | Counter, receipts, khata, day close, admin | check-ins, memberships | `/check-ins`, `/memberships` are web routes, not desktop modules. |

Template application algorithm (deterministic):

1. Read the owner-selected `templateId` / legacy `businessType` from local configuration.
2. Load the static reviewed template map shipped with the app.
3. Intersect template module IDs with the registry's `implemented` modules and the native session's permitted capabilities.
4. Apply owner overrides from persisted workspace preferences.
5. Render navigation in deterministic order; record `templateId`, `version` and override list in an audit-safe local preference record.
6. If configuration is missing or invalid, fall back to `general-retail` with all implemented modules visible and never hide a financial posting path.

No network call, no inference from an existing customer database, and no change to `business_id` / `generation` is involved.

---

## 5. Manual customization

- Owner can show/hide **optional** modules, reorder views and choose density from an Admin `Workspace` section.
- **Core financial modules cannot be hidden**: `counter.checkout`, `counter.receipts`, `day.closing`, `admin.backup` and the permission-restricted credit/returns paths remain discoverable. Hiding them would create dead ends and could break operator recovery.
- Every hidden module remains available through an explicit `Show all implemented modules` control, not a hidden hotkey. No module visibility change grants a native permission.
- Changes are local, versioned, reversible and auditable. A `Reset to template` action keeps existing invoices, customers, staff and stock untouched.
- Manual customization works with the mouse and keyboard, has `aria-current`, and persists offline. It must not require an account, cloud profile or AI service.
- A cashier cannot alter workspace configuration; native role checks still apply even if a crafted renderer state requests it.

---

## 6. Optional AI assistance — later only, advisory only

AI must be the **last** optional layer, never the foundation.

| AI may assist with | AI must never decide |
|---|---|
| Turning a free-text business description into a *suggested* `templateId`. | Invoice arithmetic, stock posting, credit calculation, credit limit, refund eligibility, payment verification. |
| Explaining why a module was suggested in plain language. | Role, permission, session expiry, restore generation, `business_id`, password or encryption. |
| Rewording help text, with a reviewed deterministic fallback. | Whether a sale is saved, refused, uncertain, recovered or printed. |
| Summarizing owner preferences for confirmation. | Device authentication, Windows Hello/biometric policy, backup passphrases, code signing. |
| Producing a template diff for founder/operator review. | Any SQLCipher write, schema migration, production sync enablement or network dependency. |

Constraints:

- The configured workspace must work **fully offline**; AI output is optional and cached only as a reviewed preference.
- Every suggestion requires explicit human confirmation and shows the deterministic template it maps to.
- If the service is unavailable, the deterministic template still applies. No loading state may block checkout.
- Text sent to any future service must be minimized and must never include customer names, phone numbers, invoice IDs, balances, passwords, backup hashes or raw ledger rows. Redaction must follow `packages/mobile-contracts/src/security.ts` patterns.
- No AI SDK, runtime dependency, API key, remote endpoint or telemetry is added in this assignment.

---

## 7. Peripheral capability model

Hardware presence is not product support. A future `admin.devices` screen should distinguish four states explicitly:

| Capability | Current classification | Evidence | Future UI behavior |
|---|---|---|---|
| Keyboard-wedge barcode scanning | **Implemented as input behavior; physical scanner untested** | `CheckoutPanel` accepts exact SKU/product ID via `#checkout-search`; `check-native.py` types `{ENTER}`; physical pilot Step 5 requires a real USB HID scanner. | Show `Supported input: keyboard wedge`, `Physical device: not tested`, `Test scan` action. Do not claim scanner API integration. |
| `window.print()` receipt preparation | **Implemented in software; physical output untested** | `receipt-print.ts`, `SavedInvoice.tsx`, `CustomerPanel.tsx`; `windows-pos-printing.md` says CSS/PDF checks do not prove paper output. | Show `Print preparation ready`, `Paper layout: 58mm/80mm/A4`, `Physical printer: not verified`, `Print test receipt`. |
| 58mm / 80mm thermal printer | **Untested / proposed physical support** | Physical pilot Steps 9–10; no committed physical print evidence. | `detected / supported / configured / tested` states; driver margins and Gurmukhi contrast must be recorded. |
| A4 laser/inkjet statement printing | **Untested / proposed physical support** | `windows-customer-statement-browser.png` is a browser preview, not paper output. | Same status model; print cancellation must not alter ledger. |
| USB backup media | **Manual file picker implemented; physical media untested** | Native `choose_local_backup` / `choose_local_backup_destination`; physical pilot pre-flight asks for a dedicated USB drive. | Show selected path only from native picker; never accept a renderer-provided path. |
| Windows Hello / biometrics | **Not implemented in desktop** | `windows-credential-controls.md`: local password only; `mobile/FEATURE-MATRIX.md` says phone biometrics unlock companion session only. | Hidden or explicitly `Not available`; never advertise as password replacement. |
| Fingerprint-pad attendance | **Mobile roadmap placeholder only** | `mobile/FEATURE-MATRIX.md` hardware exclusions. | Do not show in desktop admin. |
| Cash drawer kick | **Proposed / not implemented** | `windows-pos-printing.md` says `window.print()` does not prove cash-drawer pulses. | Explicitly `Not available`. |
| LAN / multi-till | **Native foundation only; NO-GO** | `lan_authority.rs` has no listener/socket/wire token; Phase 6 verdict `Multi-till LAN readiness: NO-GO`. | Show `Single-PC workspace`; do not show pairing as available. |
| Cloud sync | **Disabled** | `productionSyncEnabled=false`. | Show `On this PC only`; never show a sync toggle. |

Proposed capability record: `capabilityId`, `detected` (OS enumeration or user-observed), `supported` (reviewed app support), `configured` (settings present), `tested` (evidence reference + timestamp), `lastError`, `recoveryAction`, `nativeBoundary`. `detected=true` must never automatically set `supported=true` or `tested=true`.

---

## 8. Native permission and offline boundaries

- `apps/desktop/src/native.ts` adds `scope` to scoped commands; Rust `with_scoped_workspace` revalidates `LocalSession`, role, revision and expiry for every command. A workspace template is neither a principal nor a capability grant.
- UI visibility may reduce clutter; it must never be the sole enforcement. Direct native command tests (`check-authorization.cjs`, `check-focus.cjs`, Rust tests) remain the authority.
- Backup/restore, staff changes, password resets and LAN device operations require owner/settings permissions and fresh passwords. Adaptive preferences must not bypass these gates.
- `productionSyncEnabled=false` remains; replication is export-only in contract tests and never LAN coordination.
- `SCHEMA_VERSION=12` remains. If a future phase persists workspace preferences, it needs a separately reviewed migration, restore-generation handling, backup compatibility and a clear downgrade path.
- Offline behavior: templates, labels, fonts and defaults are bundled; configuration is local; no remote auth, font, image, JS or AI call is needed to open checkout, post a sale, print, close the day or restore.
- Restore behavior: preferences must not alter historical receipts or point-in-time financial data. A restored workspace should show `Restored from backup` and re-review device/template state rather than assume prior hardware tests still hold.

---

## 9. Windows performance targets (not measured results)

Adaptive work must not make the cashier slower on ordinary shop hardware. Proposed validation targets, not invented benchmarks:

| Target | Validation |
|---|---|
| Template/preference resolution is deterministic and instant at app start | Unit test a pure resolver with all templates and invalid configurations; no network. |
| No additional rerender on every keystroke | Profile a 1,000-SKU catalog on a low-end Windows PC; module registry is static after session load. |
| No heavy chart/canvas/animation in Counter | Code review and packaged-app profiling; the design system forbids WebGL/blur/continuous animation. |
| Device capability checks are on demand | No OS enumeration during checkout or posting. |
| AI service absence has zero effect on posting | Run the offline launch/sell/close/backup pilot with network disabled and AI unconfigured. |
| Text scaling and 125/150% DPI do not hide core modules | Physical Windows check at 1280×720, 1366×768, 1600×900, 1920×1080. |

The prior Linux/JSDOM timing table in `docs/reviews/windows-pos-printing.md` is historical evidence only; it is not a Windows shop-PC measurement and no new timing number is claimed here.

---

## 10. Critical evaluation and open decisions

**Why deterministic templates first:** the app already has correct but narrow financial modules, and the existing `dailyWorkspace()` web links would create dead ends on desktop. A reviewed registry prevents the adaptive concept from inventing features that do not exist.

**Why manual customization before AI:** owners need control and reversibility; AI adds ambiguity, privacy and offline risk without improving exact paise posting.

**Why AI is optional and last:** a free-text description cannot safely determine credit policy, tax compliance, hardware support or permissions. It can only propose a reviewed layout.

**Open decisions for the founder:**

1. Is a new `cycle-parts` template ID acceptable, or should it remain a labelled variant of `general`?
2. Should `salon`/`gym`/`cafe` templates hide `items & stock` by default, given the desktop app currently supports physical stock?
3. Does the owner need a full Punjabi UI, or is receipt-only localization sufficient for the next release?
4. Should a future dark theme and compact density be globally configurable, or per-workspace?
5. What evidence is required before a physical printer/scanner capability can move from `untested` to `tested`?
6. Who may change workspace configuration: owner only, or owner + manager with native approval?
7. Should statutory business fields be designed at all before GST/tax-invoice compliance is a funded engineering requirement?
8. Where should preferences be persisted if `SCHEMA_VERSION=12` must remain unchanged in the current phase?

**Decision:** no adaptive workspace, AI onboarding, device settings, schema migration or production sync change is implemented in this assignment. The current offline single-PC behavior and PR #145 are preserved for founder review.
