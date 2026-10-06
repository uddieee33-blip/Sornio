# DukaanOS

An operating system for small Indian businesses — kirana stores, cafes, gyms, salons, boutiques, electronics shops and service studios. DukaanOS gives each of them **their own console**: the same engine underneath, shaped by the business type on top, built around a transaction-driven financial engine where every number is derived from recorded activity.

A gym owner never sees a stock shelf. A kirana owner is never asked to chase memberships. A cafe owner never meets a stylist day-book. That is the whole point of a portal.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **Supabase** (Postgres + Auth) for persistence and multi-tenant row-level security

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase credentials
npm run dev                  # http://localhost:3000
```

Apply the database schema to your Supabase project with `supabase/schema.sql`.

## Portals — one engine, one console per business type

A **portal** is not a theme. It is a decision about what a specific kind of business actually needs, made once in `lib/portals/blueprints.ts` and then enforced everywhere:

| Portal | Console carries | Deliberately left out |
| --- | --- | --- |
| **Gym & Fitness** | Plans, members, check-ins, renewals, collections, marketing | Inventory, stock shelves, counter billing, suppliers |
| **Cafe & Restaurant** | Menu, counter, pantry, vendors, covers | Memberships, renewal chasing, appointment book |
| **Kirana & Grocery** | Counter billing, stock, udhaar khata, vendors | Memberships, appointments, service bookings |
| **Salon & Spa** | Services, day book, stylists, prepaid packages, follow-ups | Pantry stock, supplier chain |
| **Electronics & Mobiles** | Catalogue, serial stock, warranty, formal billing | Memberships, day book |
| **Boutique & Fashion** | Collections, sizes, stock turn, festive campaigns | Memberships, appointment book (switchable) |
| **Services & Studio** | Service menu, bookings, invoices, follow-ups | Stock shelves, membership plans |
| **General Business** | Everything, on | Nothing hidden — the honest default |

Each blueprint defines six things, and every screen reads them through `usePortal()`:

1. **Modules** — which of the 27 modules exist at all.
2. **Navigation** — sections and labels in the trade's own words (`Plans & Members`, `Udhaar Khata`, `Day Book`).
3. **Vocabulary** — `Members` / `Guests` / `Clients` / `Khata`, `Stock` / `Pantry`, `Counter` / `Front desk`.
4. **Cockpit** — the headline question, the four figures that answer it, the quick actions, and the one live list that needs attention today (renewals, day book, reorder, udhaar, check-ins).
5. **Accent** — the console's colour, applied through CSS custom properties.
6. **`excluded`** — a plain statement of what was left out and how to get it back. Shown in the UI, next to the modules that were dropped.

**How it is enforced (security).** The portal is stored in an `httpOnly`, `SameSite=Lax` cookie (`dukaan.portal`) that only `POST /api/portal` can write. That endpoint accepts a template id from the shipped list (never a portal id), is CSRF-protected by the middleware's double-submit token, rate-limited on its own tight bucket, and requires an owner/manager role when a real session exists. Edge middleware (`middleware.ts`, step 5) refuses any safe request for a module the portal does not carry and redirects it to `/home?locked=<module>`, where the cockpit explains what happened; a client gate covers the same rule for the moment before a cookie is re-issued. A portal value can therefore only ever *hide* a module — it can never unlock one.

## Product map

Every business gets a subset of these, labelled in its own words — see *Portals* above.

| Route | Purpose |
| --- | --- |
| `/` | Landing — tagline, live charts, direct "start your business" flow |
| `/auth` → `/onboarding` | Sign in → 3-step setup: owner details, business + template, bank/UPI → owner's own collection QR |
| `/home` | **Owner Cockpit** — portal-specific: headline, four live figures, the list that needs action today, quick actions |
| `/check-ins` | Front desk attendance for gyms and studios — one tap per visit, tied to the member record |
| `/appointments` | The day book for salons, clinics and service studios; completing a slot records the revenue once |
| `/dashboard` | Business reality dashboard with alerts |
| `/business` | Business setup with type-specific templates |
| `/scan` | **Scan Station** — counter scan, goods-inward scan, unmatched-code triage, printable labels (only for trades that scan) |
| `/products`, `/inventory`, `/suppliers` | Full catalog CRUD (add/edit/archive), barcode capture, stock, supply chain |
| `/sales`, `/billing`, `/payments`, `/expenses` | Money in and money out (Cash/UPI/Card/Bank Transfer/Other) |
| `/cashflow`, `/profitability` | Cash movements by account · margins & per-product profit |
| `/transactions`, `/reports`, `/comparisons` | Ledger traceability and analysis |
| `/memberships` | Plans, subscriptions, renewal reminders |
| `/reminders` | Personalized SMS & WhatsApp renewal drafts (deep links, no middleware) |
| `/customers` | Profiles, balances, receivables, unique UPI QR per customer |
| `/marketing` | Campaign tracking; spend is booked as a real expense |
| `/team` | Roles & permissions matrix |
| `/audit` | Real, timestamped audit history of every financial change |
| `/insights` | AI business health score, insights, growth tips |
| `/alerts`, `/settings` | Notifications, interactive preferences, audit trail |
| `/subscription` | **Your Plan** — what this console costs, what it has used, what a lapsed plan does, and the UPI path to switch it on |

## Scanning & capture — barcodes at the counter, fingers at the desk

Scanning is not a feature bolted onto billing; it is how a counter is *meant* to
work. So it is declared per trade in the same blueprint that decides everything
else, and it is enforced the same way: the **Scan Station** is a module, so a
trade that does not scan cannot reach it (middleware → `/home?locked=scan`).

| Trade | Capture at the desk | Prints labels for |
| --- | --- | --- |
| **Kirana & Grocery** | Barcode scanner, typed code | Shelf and loose-item labels |
| **Cafe & Restaurant** | Barcode scanner, typed code | Packaged and loose items |
| **Electronics & Mobiles** | Barcode scanner, typed code | Serial / IMEI and shelf labels |
| **Boutique & Fashion** | Barcode scanner, typed code | Size and shelf labels |
| **General Business** | Barcode, fingerprint, typed code | Everything |
| **Gym & Fitness** | **Fingerprint pad**, typed lookup | — a gym's desk reads fingers, not packets |
| **Salon & Spa** | Typed lookup | — services are billed, not scanned |
| **Services & Studio** | QR / job tags, typed lookup | Job tags |

### At the counter

A code gets in one of three ways, and all three end in the same resolver
(`lib/scanning/match.ts`), so a scanned bill and a typed bill are the same bill:

1. **Handheld scanner (keyboard wedge)** — the channel most Indian shops already
   own. A USB or Bluetooth scanner *is* a keyboard that types very fast, so
   there is nothing to pair, no driver, and no browser permission to grant. The
   scanner bar detects the typing burst and commits on `Enter`.
2. **Camera** — decoded **on the device** by the browser's own `BarcodeDetector`.
   No frame is ever uploaded: DukaanOS has no server-side image pipeline.
3. **Typed** — the fallback that always works, and it is validated exactly like a
   scan. A GTIN whose check digit fails is refused with the reason shown, so a
   mistyped code never becomes a wrong bill.

A read resolves to exactly one of four answers, and the counter never guesses:

- **matched** — one item claims the code; it is added, and scanning the same
  packet again stacks the line (`3 ×`) instead of making a second line.
- **ambiguous** — two items claim the same code. Both are named and the bill
  waits for the catalogue to be fixed; the wrong item would move the wrong stock.
- **unmatched** — nobody claims it yet. This is the most useful outcome in the
  feature: the shop is telling the owner which packet still needs a code on
  file, and the Scan Station turns that into one tap ("attach this code").
- **invalid** — a check digit failed, so it is a misread.

### Loose goods, house brands, and labels you can print

Anything that will never carry a manufacturer barcode — loose grain, a house
brand, stitched stock, spare parts — gets a **DukaanOS internal code**
(`DK` + 8 digits + a Luhn check, printed as Code 128), minted on the device.
A weigh-scale item also gets a **scale number**, and the label the shop prints
for it is a real **in-store EAN-13** (`2` + unit + item + weight/price + check
digit), which means an ordinary retail scanner reads it — no proprietary scale
protocol, no cloud, no font, no image. Labels render as pure SVG (`BarcodeSvg`),
so printing works offline.

Weight labels bill weight, price labels bill exactly the amount the scale
printed (`₹ ÷ selling price`), and neither can be edited into the wrong figure at
the counter. Repeat scans of a weighed packet never merge — two weighings are
two weights.

### Fingerprint check-in at the gym

The gym desk uses the sensor the device already has, through **WebAuthn
(platform authenticator)**. The sensor matches the finger in hardware and returns
a **credential id**; that id is the only thing DukaanOS stores. No fingerprint
image, no template, no hash of one, nothing to leak — and a finger can only ever
record a visit, never move money. Enrolment is per member and per device, a
member can be un-enrolled from the same screen, and if the device has no reader
the kiosk says so plainly and the front desk keeps working on phone lookup.

### Camera permission is scoped, not global

Barcode scanning needs the camera and fingerprint check-in needs the WebAuthn
API, but neither is a reason to hand the whole console those capabilities.
`lib/security/policy.json` grants them **per route**: `camera=(self)` only on
`/scan`, `/sales` and `/products`; `publickey-credentials-create/get=(self)` only
on `/check-ins`; everything else in the app keeps `camera=()` and the rest of the
deny-by-default list. Middleware (`buildPermissionsPolicy(pathname)`) and
`next.config.js` both read that one file, so the two layers cannot disagree.

### Verified, not claimed

`npm run verify:scanning` compiles the pure scanning modules with the project's
own TypeScript and checks them against published examples — GTIN check digits for
known EAN-13/EAN-8/UPC-A/ITF-14 codes, an EAN-13 round-trip decode, Code 128
start/switch/stop patterns and the specification's worked check-symbol example,
Luhn internal codes, the in-store label round trip, and the scan → ticket path
(matched, ambiguous, unmatched, invalid; stacking; weighed lines). Nothing in
that script talks to the network, and nothing is mocked: it runs the same code
the counter runs.

## Architecture

- **`lib/portals/`** — the portal system, pure data first so Edge middleware can enforce what the UI renders:
  - `types.ts` — `PortalBlueprint`, `ModuleKey`, `MetricKey`, vocabulary, nav, cockpit shapes
  - `catalogue.ts` — the 27 canonical modules (route, label, icon, keywords, core flag)
  - `blueprints.ts` — the eight business types: modules, words, navigation, cockpit, accent, what was left out
  - `registry.ts` — resolution and validation (`portalById`, `portalForTemplate`, `portalHasModule`, `isKnownTemplateId`, …)
  - `routes.ts` — route policy used by middleware and the client gate (`PORTAL_COOKIE`, `checkPortalAccess`, `routeHrefsFor`)
  - `icons.ts`, `nav.ts` — icon name → component, blueprint → labelled navigation
  - `portal-provider.tsx` — `PortalProvider` / `usePortal()`; server-resolved first paint, cookie reconciliation
  - `metrics.ts` — the cockpit figures, computed only from recorded activity
  - `sync.ts` — publishes the chosen type to `/api/portal` with the CSRF double-submit token
- **`app/api/portal/route.ts`** — the single narrowly-scoped server write: validates the template id, re-derives the portal, re-issues the httpOnly cookie.
- **`lib/plans/`** — the paid product, pure data first so the edge can enforce it:
  - `catalogue.ts` — the four plans, their prices, limits, and exactly which modules each unlocks
  - `lifecycle.ts` — `trialing → active → grace → expired → free`, resolved from dates only
  - `routes.ts` — route policy used by middleware and the console (`checkPlanAccess`, `lockedModulesFor`)
  - `usage.ts` — the free monthly allowance, counted from the ledger (UPI money in; cash never)
  - `cookie.ts` — the signed, httpOnly `dukaan.plan` cookie the server issues and verifies
  - `activation.ts` — `DKS1-…` codes: plan, months, reference and expiry inside one HMAC
  - `active.ts`, `client.ts` — what the console believes, and the one endpoint that changes it
- **`app/api/subscription/route.ts`** — the only place a plan can change: CSRF + origin checked, its own tight rate-limit bucket, owner/manager role required when a real session exists, and *nothing* grantable except the free plan or a signature-verified code.
- **`lib/models/`** — universal domain models shared across the product:
  - `business.ts` — business profile, settings, templates (derived from the portal blueprints), audit events, snapshot adapter
  - `billing.ts` — invoices, line items, payment records, collection summaries
  - `membership.ts` — plans, members, subscriptions, reminder templates, expiry derivation
  - `insights.ts` — insights, AI tips, and business health scoring shapes
- **`lib/services/ai-insights.ts`** — `AiInsightsEngine` computes the health score, live insights, and growth tips from snapshots, invoices, and subscriptions.
- **`lib/scanning/`** — the capture layer, pure data first so the counter logic is testable without a browser:
  - `types.ts` — `CaptureChannel`, `ScanSource`, `ScanContext`, `ScanOutcome`, `ScanEvent`, `BiometricCredential`, `CaptureReadiness`
  - `barcodes.ts` — reading: GTIN check digits, internal codes (Luhn), in-store weigh/price labels, symbology guessing, plain-language profiling
  - `encoder.ts` — printing: EAN-13 / EAN-8 / UPC-A / Code 128 (automatic set C), module geometry, quiet zones, captions
  - `match.ts` — code → catalogue resolution (`matched` / `ambiguous` / `unmatched` / `invalid`) with weigh-label quantities
  - `counter.ts` — the scan ticket: stacking rules, weighed lines, totals
  - `device.ts`, `fingerprint.ts` — what this device can do, and WebAuthn enrol/verify (credential ids only)
  - `components/scanning/` — the wedge/camera/typed scanner, the printable label sheet, the SVG barcode, the fingerprint pad, the readiness card
- **`lib/perf/clock.ts`** — the wall clock as an external store (`useSyncExternalStore`), so plan countdowns never read time during render and hydration stays identical.
- **`lib/business-data.ts`** — the financial engine: financial snapshots are calculated **only** from recorded transactions (revenue, COGS, operating expenses, cash flow, inventory value). No values are fabricated.
- **`lib/store.tsx`** — the live store (`DukaanStoreProvider` + `useDukaanStore`). Owners can record sales and expenses, add products/customers/plans/members, enroll and renew subscriptions, raise/collect invoices, check members in and out, and run a booking day book; every action writes transactions into the ledger and the whole console recalculates. State persists locally (reset from Settings) and — when Supabase is configured — syncs to Postgres in the background.
- **`lib/sync/supabase-sync.ts`** — the persistence adapter bridging the live store to the multi-tenant schema. It provisions the owner's `businesses` + `business_members` row, then pushes products, ledger entries, customers, campaigns, audit, and settings, all scoped by `business_id`.
- **`lib/supabase/`** — Supabase client + config guard (`isSupabaseConfigured`). With placeholder credentials the app stays fully local-first; with real credentials the same code paths sync to the database.
- **`supabase/schema.sql`** — multi-tenant Postgres schema. Every tenant table carries `business_id` and is protected by row-level security policies scoped to `business_members`.

## Principles

**Paid, and honest about it.** The free plan is free forever and cannot lapse; the paid plan is enforced at the edge and cannot be talked around. What a business is never asked to accept: cash metered, records held hostage, an auto-debit mandate, a cut of its collections, or a landing page full of proof we made up. The prices, the limits and the locks are all in one file, and the lock is on the *paid* path only.

1. **Start at zero → record reality → calculate reality** — a new business opens with every balance at ₹0 (cash, bank, UPI, receivables, revenue, COGS, profit, inventory, payables). Nothing is fabricated; every figure moves only when real activity is recorded.
2. **Real data only** — metrics come from the transaction ledger, never hardcoded dashboards.
3. **Demo data is separated** — the sample business is opt-in and clearly flagged (`demoMode`); it never mixes with a real business's records.
4. **Universal models** — one business/billing/membership/insight model serves gyms, cafes, salons, and retail alike.
5. **Traceability** — every invoice, payment, stock movement, and setting change lands in the audit trail.
6. **No sensitive credentials** — payment methods are recorded without ever requesting or storing UPI PINs, bank passwords, OTPs, or card numbers.
7. **One engine, every business** — business-type templates (`lib/models/business.ts`) configure modules for gyms, cafés, groceries, salons, electronics, and any other business.
8. **Direct UPI, no middleman** — each owner's own bank UPI ID generates their collection QR; receipts print as physical bills, and membership renewals get personalized SMS/WhatsApp drafts.

## Pricing & entitlements — what is paid, and how it is enforced

DukaanOS is sold, and the sale is enforced like every other decision in this
product: once, as data, at the edge, before a page renders.

### The plans

| Plan | Price | Opens | Limits |
| --- | --- | --- | --- |
| **Starter** | ₹0 forever | The whole counter: billing, receipts, stock, suppliers, udhaar khata, Scan Station, UPI QR, ledger, reports, audit chain, Trust Centre, your plan | 25 UPI collections/month · 200 items · 2 seats · 1 branch |
| **Full trial** | ₹0, 3 days | Every module, no card, no mandate — it simply ends | — |
| **Growth** | ₹499/month · ₹999/quarter · ₹4,990/year | Everything in Starter, unlimited, **plus** the automations: memberships & renewals, reminders, check-ins, day book, marketing, margins, comparisons | 10 seats · 1 branch |
| **Scale** | ₹1,999/quarter · ₹6,999/year | Everything in Growth, unlimited | Multi-branch · unlimited seats · priority support |

Every price, limit and module list on both surfaces comes from one place —
`lib/plans/catalogue.ts`. The landing page renders it, the console sells from
it, and Edge middleware enforces it, so a promise cannot drift from a product.

### The lifecycle — derived from dates, never stored as a flag

```
record ──┬─ trialing ───── trial ends ─┐
         ├─ active ── period ends ─► grace ── 7 days ──► expired
         └─ free ───────────────────────────────► free  (cannot lapse)
```

`resolveEntitlement(record, now)` (`lib/plans/lifecycle.ts`) is pure: it takes
the record and a timestamp and returns what a business may do. Nothing is
stored as "active", so a stale cookie, a rolled-back device clock, or a
forgotten database row cannot extend a plan. Grace exists because a shop should
never be cut off mid-Saturday over a payment that clears on Monday — a paid plan
whose period ended keeps every module for seven days while the owner renews.

### Where it is enforced

| Layer | Module | What it does |
| --- | --- | --- |
| Edge | `middleware.ts` (step 6) + `lib/plans/routes.ts` | A module this plan does not carry is never served: a 307 to `/subscription?locked=<module>`, with `x-dukaan-plan-blocked` and `x-dukaan-plan-state` headers. Read-only navigation only — a write is never redirected. |
| Recording | `lib/plans/usage.ts` + `lib/store.tsx` | The free plan's one real limit — 25 UPI collections a month — is checked where money is recorded, before a single line is written. |
| Surface | `components/billing/plan-{provider,badge,banner}.tsx` | The owner is told exactly what is paused, in the console's own trade words, and where to fix it. |
| Server | `app/api/subscription/route.ts` | The only place a plan can change. |

### What a lapsed plan does — and refuses to do

Expiry drops a business to the free plan. **Nothing is deleted, nothing is
locked away, and the shop never stops working**: billing, cash entries, the
collection QR, stock, reports, exports and the audit chain all continue, on any
plan. Only the paid automations pause, and they return the moment a plan is
active. Locking a business out of its own ledger would be extortion, not
pricing, so the always-open list (`cockpit`, `business`, `team`, `audit`,
`security`, `settings`, `subscription`) is added on top of whatever a plan
carries — a plan may only ever *remove* a module, never grant one.

**Cash is never metered.** A shop at its free allowance can still bill in cash,
record the sale, print the bill and keep the books. The limit is on the paid
path only, and the count comes from the ledger itself — the same transactions
the owner is looking at, reset by the calendar rather than by a job we run.

### The plan cookie, and what tampering buys

The chosen plan reaches the edge as `dukaan.plan`: `base64url(payload).base64url(hmacSha256(payload))`,
signed with `DUKAANOS_SESSION_SECRET`, `httpOnly`, `SameSite=Lax`. Anything that
does not verify is treated as *no record*, which resolves to the free plan.
Tampering therefore cannot unlock a paid module — the worst it can do is drop a
paying business to the free plan, which is why the server re-issues a verified
record on every successful call.

### Turning a payment into a plan

DukaanOS collects its own price the way it asks every business to collect: a
direct UPI payment, with a reference in the note. There is no gateway, no
mandate and no card on file.

1. The owner taps **Continue with Growth** → the server returns a reference, the
   amount, a `upi://pay` intent and a WhatsApp link. Nothing is granted.
2. They pay. The operator mints a code tied to that payment:
   `npm run mint:activation -- --plan growth --months 3 --reference UPI-482910`.
3. They paste the code into **Your Plan**. The server verifies the HMAC — plan,
   months, reference and expiry are all inside the signature — and only then
   issues the paid cookie. Renewals on the same plan stack; an upgrade starts
   from today; the price locks for 12 months from activation.

Nobody can grant a plan by asking: `choose-plan` accepts only the free plan, a
trial can be started once, and `activate` needs a signature that only a holder
of `DUKAANOS_ACTIVATION_SECRET` (server-only) can produce. With that secret
unset, activation is **off**, not open.

### Verify it, don't believe it

`npm run verify:billing` compiles the pure plan modules with the project's own
TypeScript and asserts the things a business would be furious to discover we got
wrong: that a lapsed plan never locks a shop out of its own records, that no
plan can name a module the catalogue does not contain, that expiry is derived
from dates so a rolled-back clock extends nothing, that tampered cookies and
activation codes are worth nothing, that the allowance counts UPI money and
never cash, and that renewals stack, upgrades start today and the price lock is
really twelve months.

## Database foundation (Supabase Postgres)

`supabase/schema.sql` defines a multi-tenant relational schema — 29 tables, every business-owned record carrying `business_id`, with primary keys, foreign keys, indexes, constraints, and `created_at`/`updated_at` timestamps. Highlights: `businesses`, `business_members`, `customers`, `suppliers`, `categories`, `products`, `sales`, `sale_items`, `payment_methods`, `payments`, `expenses`, `inventory_movements`, `transactions`, `audit_logs`, `invoices`, `membership_plans`, `members`, `membership_subscriptions`, `marketing_campaigns`, and more.

**Capture records** (Increment 8 of the schema) extend the same multi-tenant model: `products` gains `barcode`, `internal_code`, `loose_mode`, and `scale_number` with per-business uniqueness on both codes, and two new tables record how a counter works — `scan_events` (what was read, where, and what came of it) and `biometric_credentials` (a member's WebAuthn credential id and use count — never a fingerprint).

**Platform billing** (Increment 9) is kept out of the tenant's own books, because mixing our revenue into a business's ledger would corrupt both: `platform_subscriptions` (which plan a business is on, when its period ends, how it was granted, and the payment reference it came from) and `platform_payment_requests` (what an owner asked to buy, and its UPI reference). A business may read its own plan and *request* a payment — RLS gives members `select` plus `insert`-as-`requested` and nothing else, so **activation is not reachable from a browser**, only from the operator side.

**Row Level Security** is enabled on every tenant table with policies scoped to `business_members` — one business can never read or write another business's rows.

## Persistence & sync (local-first)

The store is **local-first by design**, so the console works fully even before a Supabase project is connected:

- **No Supabase credentials** → all data lives in `localStorage`; Settings shows **"Local demo mode"**, and `/auth` runs a clearly-labelled demo sign-in. Nothing touches the network.
- **Real Supabase credentials + a signed-in owner** → the adapter in `lib/sync/supabase-sync.ts` provisions the tenant and **debounced-pushes** products (with their barcodes and internal codes), ledger transactions, customers, marketing campaigns, the audit trail, settings, the scan log, and fingerprint enrolments to Postgres. Settings shows the live sync status and a **Sync now** action, and `/auth` performs real Supabase sign-in / sign-up.

Every failure is reported as a status, never as a crash — the app always keeps working on the local copy.

## Environment variables

Browser-safe:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only (never shipped to the browser):
- `SUPABASE_SERVICE_ROLE_KEY` (if used for admin operations)
- `NEXT_PUBLIC_APP_URL`
- `DUKAANOS_SESSION_SECRET` — signs session tokens **and the plan cookie**
- `DUKAANOS_ACTIVATION_SECRET` — signs activation codes; with it unset, activation is disabled rather than guessable

Selling DukaanOS to owners:
- `NEXT_PUBLIC_PLANS_UPI_ID` — the platform's own UPI id, shown on Your Plan
- `NEXT_PUBLIC_PLANS_PAYEE_NAME`
- `NEXT_PUBLIC_SUPPORT_WHATSAPP` — the number that answers "I have paid"

Never commit real credentials; `.env*` is gitignored.

## Run it

```bash
npm install
cp .env.example .env.local   # add your Supabase URL + anon key
npm run dev                  # http://localhost:3000

npm run typecheck            # no type errors
npm run lint                 # no lint problems
npm run verify               # both verification suites, below
npm run verify:scanning      # the barcode engine, checked against published examples
npm run verify:billing       # the plan lifecycle, the locks, and the money

# sell a plan by hand — the exact command that turns a UPI payment into access
DUKAANOS_ACTIVATION_SECRET=… npm run mint:activation -- --plan growth --months 3 --reference UPI-482910
```

Apply `supabase/schema.sql` in the Supabase SQL editor, enable Auth, then deploy to Vercel with the same environment variables.

**Scanning needs nothing installed.** A handheld USB/Bluetooth scanner works on any device because it types like a keyboard; camera scanning uses the browser's own decoder where it exists (Chrome/Android); the fingerprint pad uses the device's sensor through WebAuthn. On an older browser the counter still works on the wedge and typed entry — the app says which channels this device has in **Settings → How this counter captures**.

## Assumptions

- The live demo runs the full domain model client-side (`lib/store.tsx`) so every flow is exercisable without a live Supabase project; the schema is ready for server-side wiring.
- Accounting is a general-purpose calculation layer, not jurisdiction-specific tax/legal advice.
- DukaanOS's own billing is **shipped**, not deferred: a free plan that cannot lapse, a 3-day full trial, three paid plans, a signed plan cookie enforced at the edge, and activation codes minted from a verified payment. What is deliberately *not* built is an auto-debit mandate — there is no card on file anywhere in this product, by design.
- On a local-first install (no Supabase), the console runs on the owner's own device, so the entitlement gate there is a commitment encoded in software, not DRM. That is said plainly rather than dressed up; the hosted path enforces it server-side, where it can be.

## Security architecture

DukaanOS is local-first, which means the shop's ledger lives on the shop's
device. That promise is only worth making if the data is actually protected, so
security is a first-class layer rather than a header or two.

### Layers

| Layer | Module | What it does |
| --- | --- | --- |
| Identity | `lib/security/session.ts` | HMAC-signed, expiring, rotating session claims |
| Tenancy | `lib/security/tenant.ts` | One business per scope; every record carries a tenant id |
| Authorisation | `lib/security/rbac.ts` | Owner / manager / cashier / auditor, 18 permissions |
| Transport | `lib/security/headers.ts` | Posture-aware CSP, HSTS, framing, and a `Permissions-Policy` granted per route (camera only where scanning happens, WebAuthn only at the gym desk) |
| Edge | `lib/security/rate-limit.ts` | Sliding-window throttling, pluggable store (dedicated bucket for `/api/portal`) |
| Portal scoping | `lib/portals/routes.ts` + `middleware.ts` | A business type never reaches a module it does not carry |
| Entitlement | `lib/plans/` + `middleware.ts` | A plan that is not being paid for never reaches the paid automations — and expiry still never locks a business out of its own books |
| Request | `lib/security/csrf.ts` | Fetch-metadata + origin allow-list + double-submit token |
| Input | `lib/security/validation.ts` | Structural validation, clamps, password strength |
| Output | `lib/security/sanitize.ts` | HTML/CSV/URL escaping for receipts and exports |
| Storage | `lib/security/vault.ts` | AES-GCM-256 at rest, integrity envelope, rollback snapshot |
| Evidence | `lib/security/audit.ts` | SHA-256 hash-chained, tamper-evident history |
| Privacy | `lib/security/redact.ts` | PII/secret scrubbing before anything is logged |
| Observability | `lib/security/monitor.ts` | Bounded, redacted error + Web Vitals telemetry |
| Server | `lib/security/guard.ts` | Session helpers that never make a dead network call |

### Edge pipeline (every request)

1. **Request id** — every response carries `x-request-id` so a report maps to one log line.
2. **Probe rejection** — `/.env`, `/.git`, `/wp-admin`, … return a blank 404, no detail.
3. **Rate limiting** — a per-client sliding window per scope (auth, api, reports, page) plus a short burst guard. API and mutating requests get the tight budget; page traffic gets a generous one so the app never throttles its own navigation.
4. **CSRF** — `Sec-Fetch-Site`, an `Origin`/`Referer` allow-list, and a double-submit token for `/api/*`.
5. **Portal policy** — the portal cookie decides which modules this business runs. A request for a module outside it (inventory in a gym, memberships in a kirana) is answered with a 307 to `/home?locked=<module>` and an `x-dukaan-portal-blocked` header. Only read-only navigation is redirected, so the check can never mask a failed action or loop.
6. **Plan policy** — the signed plan cookie decides whether this route is served. A module the plan does not carry (memberships on the free plan, anything after a lapsed period) is answered with a 307 to `/subscription?locked=<module>` and an `x-dukaan-plan-blocked` header. Read-only navigation only, exactly like the portal check, so it can never mask a failed action.
7. **Headers** — CSP, HSTS, framing, `Permissions-Policy`, `no-store` on console routes.
8. **Session refresh** — Supabase only when real credentials exist, lazily imported, never blocking a page load.

### Two postures

`strict` and `embed` are resolved from the environment, not hard-coded:

- **strict** — a real domain is configured (`NEXT_PUBLIC_APP_URL`): `frame-ancestors 'self'`, `X-Frame-Options: DENY`, HSTS with a two-year max-age and preload.
- **embed** — local development and preview hosts: framing is allowed for the preview origins, HSTS is off, and `X-Frame-Options` is omitted entirely so it cannot override CSP and blank the preview.

### What is never collected

No PINs, OTPs, card numbers, or bank passwords — the app has no field for them
and no code path that could store them. A customer's UPI ID is used solely to
draw their collection QR; DukaanOS is not a payment gateway and never touches
the money. Diagnostics are scrubbed through `redact()` first, so phone numbers,
emails, UPI ids, tokens, and 13–19 digit sequences are masked before anything
leaves a module.

### Fingerprints and camera frames

The fingerprint pad is the one place where it is worth being unusually precise:

- The finger is matched **inside the device's sensor**. DukaanOS calls the
  browser's WebAuthn API and receives a credential id; it never receives an
  image, a template, or a hash of one, and there is no code path that could
  store any of them.
- An enrolment is a single row keyed to one member and one credential id.
  Deleting it forgets the finger completely.
- A fingerprint can only ever **record a visit**. It cannot bill, cannot move
  money, and cannot be used as a password anywhere else in the app.
- Camera scanning is decoded by the browser on the device. Frames are not
  uploaded, and there is no server endpoint that accepts an image.

Settings shows the same facts against the real device: **How this counter
captures** asks the browser what it can do (wedge, camera, on-device decoder,
fingerprint sensor) and says which channels are ready here, which are not, and
what the fallback is.

### Verify it yourself

Open **Trust Centre** (`/security`) in the console. It reports the live posture
— whether storage is encrypted on this device, whether the audit chain
verifies, and which role may do what — computed at render time, with degraded
states shown in amber rather than hidden.

For the scanning engine specifically, run `npm run verify:scanning`: it compiles
the pure modules and checks them against published barcode examples, the
scan → ticket path, and the shipped demo catalogue. It prints one line per group
and exits non-zero on the first disagreement.

### Performance notes

The same layer is built to stay out of the way: the Supabase SDK is lazily
imported so Edge middleware stays at ~89 kB instead of ~789 kB, and
hydration/telemetry work is scheduled through `lib/perf/idle.ts` so nothing runs
mid-interaction.

The portal system is designed to feel instant rather than merely be fast:

- **No flash of the wrong console.** `app/(console)/layout.tsx` resolves the
  portal on the server from the cookie, so the first paint already carries the
  right navigation — the client never repaints a full menu down to a smaller one.
- **Warm only what this business can open.** Route warm-up consumes
  `routeHrefsFor(portalId)` and warms the sidebar's own order — a dozen routes
  for a gym instead of thirty, at one route per idle slice, and none at all on a
  metered or 2G connection.
- **Recolouring is a variable, not a re-render.** Accents ship as CSS custom
  properties (`--portal-accent`, `--portal-accent-deep`), so switching business
  type repaints the frame with no layout shift and no stylesheet swap.
