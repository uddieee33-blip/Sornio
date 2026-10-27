# Shared business domain

Pure TypeScript rules consumed directly by the hosted app and bundled Windows UI.
No React, browser storage, hosted services, native commands or user credentials.

- `src/business-types.ts`: the eight stable business IDs used by saved drafts.
- `src/daily-workspace.ts`: daily task, metric and setup definitions. Membership
  tasks belong to gyms; the udhaar focus belongs to kirana.
- `src/invoice-calculation.ts`: the existing invoice validation and integer-paise
  calculation, extracted without changing its behavior.

The hosted import paths re-export these definitions for compatibility. The desktop
uses the shared business type and description. Native billing persistence is still
pending: a calculated preview cannot authorize or commit a financial transaction.
Native billing must validate and commit through its own authorized command boundary.

Run `npm run verify:business-domain` from the repository root. Both the Windows and
browser workflows watch this package so future shared changes receive acceptance.
