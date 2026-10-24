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


## Checkout testing before UPI setup

Open `/subscription` while signed in. Pricing and the activation box are available immediately. Selecting Growth or Scale returns the selected price and period as a checkout preview when no valid platform UPI is set. It does not collect money or grant a paid entitlement. Valid business-bound keys can still be redeemed. The seven-day trial remains a separate, real entitlement and is not a fake payment.

The owner can copy their Business ID from this page and share it with platform support. Owners need no key to receive their owner role.

## Platform key console

`/platform/keys` is for the platform operator, not every shop owner. Configure `DUKAANOS_PLATFORM_ADMIN_IDS` with the comma-separated **Supabase Auth user UUIDs** allowed to issue keys, plus the existing server-only `SUPABASE_SERVICE_ROLE_KEY`. The allowlist has no default. Verify the intended account IDs in Supabase Auth before setting it. Never set a public-prefixed admin variable or decide authority from user-editable metadata. Configure separately for Preview and Production; do not point a test deployment at a live key registry accidentally.

An allowlisted operator sees the console link on Your Plan. Other users receive a 404 from the console and 403 from its API. The API rechecks the verified Auth identity on every request before using the privileged client. Existing proxy CSRF, origin checks and the plan rate-limit bucket protect issuance.

1. Paste the owner's Business ID and load the business and recent key history.
2. Check the business name, paid plan, period and payment in the bank independently.
3. Enter the actual bank transaction reference, confirm verification, and issue the key.
4. Copy the displayed `DKK1-` key and deliver it privately yourself. The application sends no messages. The owner pastes it in Your Plan.

A key expires after 30 days if unused, can only be redeemed by its intended business, and cannot extend a plan twice. Payment references are normalized to uppercase on issuance; duplicate references are rejected. Only the key digest is stored. History shows the latest 25 keys, their payment references and redemption state, never their raw keys or digests. The existing row records key creation and redemption times; it does not yet record which platform operator issued it.

If the browser loses the issuance response, check history before retrying. The raw key cannot be recovered from its hash. Do not issue a second key for the same payment or erase its row to bypass that check; recovery/revocation is an operator maintenance task until a reviewed replacement workflow is added.

Automated checks: `npm run verify:key-console` exercises the actual route handlers with controlled Auth/storage adapters; `npm run verify:owner-plans` tests database redemption and isolation in PGlite. Neither constitutes a real bank payment or a signed-in production browser test.
