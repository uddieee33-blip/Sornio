# Shared business domain

Pure TypeScript rules consumed directly by the hosted app and bundled Windows UI.
No React, browser storage, hosted services, native commands or user credentials.

- `src/business-types.ts`: the eight stable business IDs used by saved drafts.
- `src/daily-workspace.ts`: daily task, metric and setup definitions. Membership
  tasks belong to gyms; the udhaar focus belongs to kirana.
- `src/invoice-calculation.ts`: the existing invoice validation and integer-paise
  calculation, extracted without changing its behavior.
- `src/native-invoice.ts`: strict native cash/credit request validation and bounded
  integer-paise/thousandths calculations. JSON request and money fixtures are
  consumed by both TypeScript checks and the authoritative Rust posting tests.

The hosted import paths re-export these definitions for compatibility. The desktop
uses the shared business type and description. Native billing validates again at
the password-gated command boundary and sources catalogue prices from encrypted
storage. A renderer calculation cannot authorize or commit a financial transaction.

Run `npm run verify:business-domain` from the repository root. Both the Windows and
browser workflows watch this package so future shared changes receive acceptance.
