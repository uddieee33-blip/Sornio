# DukaanOS

DukaanOS is a modern operating and financial intelligence platform for small businesses.

## Overview

The application is built with:
- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Vercel deployment

This repository currently contains the initial foundation for the application, including:
- application layout and navigation
- authentication foundation
- business setup page
- Supabase client wiring
- database schema for tenant-scoped records
- RLS policies for multi-tenant access
- transaction architecture
- owner cockpit landing page
- products foundation
- sales/expenses/inventory starter pages
- responsive UI foundation

## Architecture principles

- Start at zero; no financial state is fabricated.
- Every business-owned record belongs to a business/tenant.
- Financial values are derived from recorded transactions rather than hardcoded dashboard numbers.
- Demo data is clearly separated from real business data.
- No banking credentials, OTPs, PINs, passwords, or sensitive data are collected.

## Environment variables

Create a `.env.local` file based on `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Database setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run the SQL in `supabase/schema.sql`.
4. Confirm the schema and RLS policies are active.

## Security notes

- Never expose the service role key in browser code.
- Keep all secrets in environment variables.
- Never commit real credentials to GitHub.
- Use secure server-side handling for sensitive operations.

## Current foundation

This initial implementation includes the architecture for:
- onboarding and business setup
- owner cockpit dashboard
- products module
- sales foundation
- expenses foundation
- inventory foundation
- customers foundation
- suppliers foundation
- financial calculation layer
- audit history foundation
- responsive UI shell

## Remaining work

The following modules should be implemented next with database-backed create/read/update flows:
- connect real authentication with Supabase Auth
- complete onboarding wizard with database insertion
- product add/edit/archive workflows
- sales entry with line items and payment methods
- expenses and cash flow tracking
- inventory movements and stock adjustments
- customer/supplier management and balances
- business insights and alerts
- reports and comparison engine
- audit trail UI and exports
