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
| `/products`, `/inventory`, `/suppliers` | Full catalog CRUD (add/edit/archive), stock, supply chain |
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
- **`lib/models/`** — universal domain models shared across the product:
  - `business.ts` — business profile, settings, templates (derived from the portal blueprints), audit events, snapshot adapter
  - `billing.ts` — invoices, line items, payment records, collection summaries
  - `membership.ts` — plans, members, subscriptions, reminder templates, expiry derivation
  - `insights.ts` — insights, AI tips, and business health scoring shapes
- **`lib/services/ai-insights.ts`** — `AiInsightsEngine` computes the health score, live insights, and growth tips from snapshots, invoices, and subscriptions.
- **`lib/business-data.ts`** — the financial engine: financial snapshots are calculated **only** from recorded transactions (revenue, COGS, operating expenses, cash flow, inventory value). No values are fabricated.
- **`lib/store.tsx`** — the live store (`DukaanStoreProvider` + `useDukaanStore`). Owners can record sales and expenses, add products/customers/plans/members, enroll and renew subscriptions, raise/collect invoices, check members in and out, and run a booking day book; every action writes transactions into the ledger and the whole console recalculates. State persists locally (reset from Settings) and — when Supabase is configured — syncs to Postgres in the background.
- **`lib/sync/supabase-sync.ts`** — the persistence adapter bridging the live store to the multi-tenant schema. It provisions the owner's `businesses` + `business_members` row, then pushes products, ledger entries, customers, campaigns, audit, and settings, all scoped by `business_id`.
- **`lib/supabase/`** — Supabase client + config guard (`isSupabaseConfigured`). With placeholder credentials the app stays fully local-first; with real credentials the same code paths sync to the database.
- **`supabase/schema.sql`** — multi-tenant Postgres schema. Every tenant table carries `business_id` and is protected by row-level security policies scoped to `business_members`.

## Principles

1. **Start at zero → record reality → calculate reality** — a new business opens with every balance at ₹0 (cash, bank, UPI, receivables, revenue, COGS, profit, inventory, payables). Nothing is fabricated; every figure moves only when real activity is recorded.
2. **Real data only** — metrics come from the transaction ledger, never hardcoded dashboards.
3. **Demo data is separated** — the sample business is opt-in and clearly flagged (`demoMode`); it never mixes with a real business's records.
4. **Universal models** — one business/billing/membership/insight model serves gyms, cafes, salons, and retail alike.
5. **Traceability** — every invoice, payment, stock movement, and setting change lands in the audit trail.
6. **No sensitive credentials** — payment methods are recorded without ever requesting or storing UPI PINs, bank passwords, OTPs, or card numbers.
7. **One engine, every business** — business-type templates (`lib/models/business.ts`) configure modules for gyms, cafés, groceries, salons, electronics, and any other business.
8. **Direct UPI, no middleman** — each owner's own bank UPI ID generates their collection QR; receipts print as physical bills, and membership renewals get personalized SMS/WhatsApp drafts.

## Database foundation (Supabase Postgres)

`supabase/schema.sql` defines a multi-tenant relational schema — 26 tables, every business-owned record carrying `business_id`, with primary keys, foreign keys, indexes, constraints, and `created_at`/`updated_at` timestamps. Highlights: `businesses`, `business_members`, `customers`, `suppliers`, `categories`, `products`, `sales`, `sale_items`, `payment_methods`, `payments`, `expenses`, `inventory_movements`, `transactions`, `audit_logs`, `invoices`, `membership_plans`, `members`, `membership_subscriptions`, `marketing_campaigns`, and more.

**Row Level Security** is enabled on every tenant table with policies scoped to `business_members` — one business can never read or write another business's rows.

## Persistence & sync (local-first)

The store is **local-first by design**, so the console works fully even before a Supabase project is connected:

- **No Supabase credentials** → all data lives in `localStorage`; Settings shows **"Local demo mode"**, and `/auth` runs a clearly-labelled demo sign-in. Nothing touches the network.
- **Real Supabase credentials + a signed-in owner** → the adapter in `lib/sync/supabase-sync.ts` provisions the tenant and **debounced-pushes** products, ledger transactions, customers, marketing campaigns, the audit trail, and settings to Postgres. Settings shows the live sync status and a **Sync now** action, and `/auth` performs real Supabase sign-in / sign-up.

Every failure is reported as a status, never as a crash — the app always keeps working on the local copy.

## Environment variables

Browser-safe:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only (never shipped to the browser):
- `SUPABASE_SERVICE_ROLE_KEY` (if used for admin operations)
- `NEXT_PUBLIC_APP_URL`

Never commit real credentials; `.env*` is gitignored.

## Run it

```bash
npm install
cp .env.example .env.local   # add your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

Apply `supabase/schema.sql` in the Supabase SQL editor, enable Auth, then deploy to Vercel with the same environment variables.

## Assumptions

- The live demo runs the full domain model client-side (`lib/store.tsx`) so every flow is exercisable without a live Supabase project; the schema is ready for server-side wiring.
- Accounting is a general-purpose calculation layer, not jurisdiction-specific tax/legal advice.
- Trial/billing for DukaanOS itself is structured to be added later; no payment is required to run this version.

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
| Transport | `lib/security/headers.ts` | Posture-aware CSP, HSTS, framing, permissions policy |
| Edge | `lib/security/rate-limit.ts` | Sliding-window throttling, pluggable store (dedicated bucket for `/api/portal`) |
| Portal scoping | `lib/portals/routes.ts` + `middleware.ts` | A business type never reaches a module it does not carry |
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
6. **Headers** — CSP, HSTS, framing, `Permissions-Policy`, `no-store` on console routes.
7. **Session refresh** — Supabase only when real credentials exist, lazily imported, never blocking a page load.

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

### Verify it yourself

Open **Trust Centre** (`/security`) in the console. It reports the live posture
— whether storage is encrypted on this device, whether the audit chain
verifies, and which role may do what — computed at render time, with degraded
states shown in amber rather than hidden.

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
