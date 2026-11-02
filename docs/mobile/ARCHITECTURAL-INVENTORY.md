# Phase 1 architectural inventory

Baseline: `baabf5fe35462de22d8a4d6132e29b3873fc919d` (`origin/main`).

## Verified observations

| Area | Finding |
| --- | --- |
| Windows desktop | Tauri + React 19 + Rust `packages/local-store`. Encrypted SQLCipher. Native posting, credit, inventory, recovery. |
| Native money | Integer paise, QuantityMilli, half-up line totals. Renderer cannot commit. |
| Outbox | `local_billing_outbox`, `local_customer_outbox`, `local_retail_outbox`, `local_inventory_outbox` — sequence + operation_id + payload. No cloud publisher. |
| Restore generation | `local_recovery_identity.generation`. LAN devices are generation-bound. |
| LAN authority | Certificate hash enrollment, `read_only` / `cashier`. No internet transport. Constructor for `VerifiedPeer` is intentionally absent. |
| Hosted sync | `app/api/sync/route.ts` + `lib/sync/records.ts`. Operating records with JS numbers, stock via float movements, bidirectional merge. **Not** a translation of the native ledger. |
| Web RBAC | owner / manager / cashier / auditor in `lib/security/rbac.ts`. |
| Desktop RBAC | owner / manager / assistant_manager / cashier. |
| Android WebView | `mobile/android`, `com.sornio.app`, HTTPS-only, no JS bridge, no cleartext, backups disabled. Review APK only. |
| iOS app | None before this phase. |
| Portals | Eight business types in `packages/business-domain` and `lib/portals/blueprints.ts`. |

## Reuse

- Portal ids, vocabulary and module catalogue — adapted into `packages/mobile-contracts`.
- Dawn (`#F8F6EF`, cobalt `#3343C2`) and Dusk (`#0E152B`) fills.
- Native max 9_000_000_000_000.
- Existing Android WebView security decisions, preserved in place.

## Do not reuse as-is

- Hosted `/api/sync` as the desktop→mobile transport.
- LAN pairing as internet enrollment.
- `lib/sync/records.ts` money fields (JavaScript numbers).
- WebView wrapping of the Next.js workspace as the long-term companion.

## New packages

- `packages/mobile-contracts` — shared domain, sync, adapters, tests.
- `packages/mobile-design` — companion tokens.
- `apps/mobile` — Expo React Native UI for Android, iPhone and iPad.
