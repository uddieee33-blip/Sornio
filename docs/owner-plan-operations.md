# Owner seats and plan keys

A business creator receives an owner membership through a database trigger. No activation key is needed to become an owner. Existing unassigned Auth accounts were given separate businesses by the additive foundation migration. A fresh teammate is left unassigned until they redeem an invitation or explicitly start their own business, so signup does not take away the join-team path.

Hosted plans live in `business_plan_records`; browser cookies are signed caches bound to a business. Trials last seven days and are recorded in the database. Clearing browser storage, downgrading, or using another device cannot restart one. Owners and managers can manage plans; other members can read their business plan.

Paid keys use the `DKK1-` format. The database holds only a SHA-256 digest, the intended business, plan, paid months, unique verified payment reference, expiry and redemption details. A retry returns the prior result without extending the plan twice. Keys cannot be read or minted by ordinary application users. Supabase's no-RLS-policy notice on the key table is intentional: it is denied to all browser roles. The authenticated SECURITY DEFINER RPC notices are expected; those functions check auth.uid(), membership and role and must be callable by the application.

After independently verifying payment, the platform operator can run this in a trusted server environment with `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`:

```sh
npm run mint:plan-key -- --business <business-uuid> --plan growth --months 3 --reference <verified-UPI-reference>
```

The printed key is shown once and is delivered privately to that business's owner. Never commit it or the service credential. The hosted flow uses database keys; the earlier signed DKS1 utility remains for local installations.

Before collecting money, configure the platform's own `NEXT_PUBLIC_PLANS_UPI_ID`, `NEXT_PUBLIC_PLANS_PAYEE_NAME`, and optionally `NEXT_PUBLIC_SUPPORT_WHATSAPP`. The business's collection UPI is separate and must not be reused as the platform payee by assumption. Clicking "I paid" is not bank verification.

The existing cycle-store product/invoice tables are retained as-is. They use an older schema, so complete operating-record cloud sync still needs a separate compatibility migration before the broader reliability PR can be released. Do not apply the complete schema.sql directly over those tables.
