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
| `/` | Owner overview with live financial summary |
| `/dashboard` | Business reality dashboard with alerts |
| `/business` | Business setup with type-specific templates |
| `/products`, `/inventory`, `/suppliers` | Catalog, stock, and supply chain |
| `/sales`, `/billing`, `/payments`, `/expenses` | Money in and money out |
| `/transactions`, `/reports`, `/comparisons` | Ledger traceability and analysis |
| `/memberships` | Plans, subscriptions, renewal reminders |
| `/customers` | Profiles, balances, and receivables |
| `/insights` | AI business health score, insights, growth tips |
| `/alerts`, `/settings` | Notifications, preferences, audit trail |

## Architecture

- **`lib/models/`** — universal domain models shared across the product:
  - `business.ts` — business profile, settings, templates, audit events, snapshot adapter
  - `billing.ts` — invoices, line items, payment records, collection summaries
  - `membership.ts` — plans, members, subscriptions, reminder templates, expiry derivation
  - `insights.ts` — insights, AI tips, and business health scoring shapes
- **`lib/services/ai-insights.ts`** — `AiInsightsEngine` computes the health score, live insights, and growth tips from snapshots, invoices, and subscriptions.
- **`lib/business-data.ts`** — the financial engine: financial snapshots are calculated **only** from recorded transactions (revenue, COGS, operating expenses, cash flow, inventory value). No values are fabricated.
- **`lib/store.tsx`** — an interactive demo store (`DukaanStoreProvider` + `useDukaanStore`). Owners can record sales and expenses, add products/customers/plans/members, enroll and renew subscriptions, and raise/collect invoices; every action writes transactions into the ledger and the whole console recalculates. State persists to `localStorage` (reset from Settings).
- **`supabase/schema.sql`** — multi-tenant Postgres schema. Every tenant table carries `business_id` and is protected by row-level security policies scoped to `business_members`.

## Principles

1. **Real data only** — metrics come from the transaction ledger, never hardcoded dashboards.
2. **Universal models** — one business/billing/membership/insight model serves gyms, cafes, salons, and retail alike.
3. **Traceability** — every invoice, payment, stock movement, and setting change lands in the audit trail.
4. **No sensitive credentials** — payment methods are recorded without storing card numbers or banking secrets.
