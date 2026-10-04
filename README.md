# DukaanOS

An operating system for small Indian businesses — retail shops, cafes, gyms, salons, and electronics stores. DukaanOS gives owners a single console for billing, inventory, memberships, payments, and AI-driven business intelligence, built around a transaction-driven financial engine where every number is derived from recorded activity.

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

## Product map

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page |
| `/home` | **Owner Cockpit** — greeting, KPIs, what-changed-today, renewals, low stock |
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

- **`lib/models/`** — universal domain models shared across the product:
  - `business.ts` — business profile, settings, templates, audit events, snapshot adapter
  - `billing.ts` — invoices, line items, payment records, collection summaries
  - `membership.ts` — plans, members, subscriptions, reminder templates, expiry derivation
  - `insights.ts` — insights, AI tips, and business health scoring shapes
- **`lib/services/ai-insights.ts`** — `AiInsightsEngine` computes the health score, live insights, and growth tips from snapshots, invoices, and subscriptions.
- **`lib/business-data.ts`** — the financial engine: financial snapshots are calculated **only** from recorded transactions (revenue, COGS, operating expenses, cash flow, inventory value). No values are fabricated.
- **`lib/store.tsx`** — the live store (`DukaanStoreProvider` + `useDukaanStore`). Owners can record sales and expenses, add products/customers/plans/members, enroll and renew subscriptions, and raise/collect invoices; every action writes transactions into the ledger and the whole console recalculates. State persists locally (reset from Settings) and — when Supabase is configured — syncs to Postgres in the background.
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
