# @sornio/mobile-contracts

Pure TypeScript contracts for the Sornio Android / iPhone / iPad companion.

No React, no React Native, no secrets, no financial writes.

- Integer paise and QuantityMilli as decimal strings, BigInt arithmetic only
- Hybrid Sync V1 envelope: schema version, restore generation, monotonic cursor
- Demo adapter labelled `DEMO`; production adapter disabled and isolated
- Feature matrix generated from `lib/portals/catalogue.ts` plus desktop hardware exclusions

Run `node scripts/verify-mobile-contracts.mjs` from the repository root (requires the `typescript` package).
