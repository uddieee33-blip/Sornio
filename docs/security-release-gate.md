# DukaanOS security release gate

This is a release checklist, not a security certification. No feature is secure merely because it uses Python, REST, or a complex architecture.

## P0 — block production deployment
- Upgrade the vulnerable pinned Next.js version and regenerate the committed npm lockfile; verify `npm ci`, `npm audit --omit=dev --audit-level=high`, TypeScript, lint, tests and build. Do not use `npm audit fix --force` blindly.
- Require passing GitHub checks before merge, and protect `main` against direct unreviewed changes. Enforce via repository settings.
- Validate the intended production Supabase project and apply only reviewed migrations. Never run guessed migrations on customer data.
- Verify fresh signup cannot enter the console before required business data is saved; UPI and bank data are optional. Reject unauthenticated and cross-tenant API calls on the server and through RLS.
- Verify real payment settlement is **never** inferred from a QR scan or a submitted client status. Manually recorded payment state must be unmistakably labelled.
- Prevent sensitive data or secrets in logs and error pages; rotate any exposed credentials.

## Authorization and privacy
- Deny-by-default checks for owner, manager and desk roles on **every** business mutation; a hidden button is not authorization.
- Derive business ID from authenticated membership, not request JSON, query parameters or local storage.
- Verify Supabase RLS for invoices, payments, customers, inventory, and owner profiles with two genuine tenants and one anonymous session.
- Require fresh owner confirmation for changes to bank/UPI destinations, tax identity, user invitations, plan activation or destructive data operations.
- Keep secure, HttpOnly, SameSite session cookies, bounded expiry, CSRF protections and rate limiting. Test both real provider sessions and logout/revocation.
- Retain CSP and restrictive Permissions-Policy; do not relax either to enable visual effects.

## Financial integrity
- Use atomic server-side mutations for sales, stock changes, invoices and collections; idempotency keys for retries.
- Require explicit independent evidence before recording bank settlement; store references and original timestamps.
- Ensure partial payments, refunds, voids, tax and audit histories balance without duplicate revenue recognition.
- Provide CA exports with labeled reporting periods and reconciliation warnings; do not represent a management summary as a GST return.

## Reliability and response
- Test encrypted backup and restore, device loss and account switching. Validate that one business cannot restore another's data.
- Alert on repeated failed authentication, owner privilege changes and unusual financial mutations without capturing confidential content.
- Maintain incident procedures for disabling compromised sessions, rotating secrets, stopping writes and restoring a verified backup.
- Run dependency audits and permission-regression tests on every PR. Conduct external security testing before collecting sensitive records at scale.

## Review before merge
Document evidence for each item. If a check cannot be tested, mark it **unverified** and keep the relevant release blocked.
