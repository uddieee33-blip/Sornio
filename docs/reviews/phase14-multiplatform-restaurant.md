# Phase 14 restaurant implementation

Date: 2026-11-12. Development source, not release acceptance.

## Published dependencies

| Branch | Published commit | Draft PR | Base |
| --- | --- | --- | --- |
| feature/phase14a-restaurant-kitchen | 5079e680fbf7929e5a30668da39cc90a5e1a5fe9 | https://github.com/uddieee33-blip/Sornio/pull/161 | feature/phase13c-restaurant-recovery |
| feature/phase14b-mobile-restaurant | a13b05eacdf8a78fe3e51f8be051c5f0d9469581 | https://github.com/uddieee33-blip/Sornio/pull/162 | feature/phase14a-restaurant-kitchen |

The macOS compatibility increment targets Phase 14B. Its published commit is recorded in its PR, avoiding a self-referential commit hash here. Authorized GitHub Git-data publication preserves identical source trees; commit metadata differs from local commits. Local logical history remains intact. No PR was merged.

## Functional source

Desktop adds owner staff selection and unbound assignment, preserves controlled checkout takeover, and checks native ownership before order/KOT changes and checkout preparation. Assignments use order revision guards. Schema 17 adds assignment records, immutable kitchen correction history, logical printer destinations and immutable print-job identities. Existing schema 16 backup expectations are frozen in a fixture.

Kitchen corrections record added/removed items, quantity changes and instructions with immutable retry payloads. They are operational instructions: they do not edit accepted financial line items or post invoices, inventory, debt or payments. Staff must separately amend eligible unpaid bills through the existing financial editor. Print jobs store ticket snapshots and support resume, explicit reprint, and operator confirmation/cancellation. Destinations configure names and paper sizes; the actual printer is selected in the system dialog. Neither afterprint nor operator confirmation proves physical delivery. Definitive native rejections clear the pending editor command; uncertain errors retain the identical command for retry.

Shared contracts cover tables, orders, menu snapshots, KOT states, assignments, local drafts and future revision-scoped operational commands. The native snapshot export reads one consistent transaction. There is no implemented synchronization transport.

The existing React Native app gains a café home and optional restaurant workspace in Settings. Phones use a vertical touch layout; wide tablets place table/order details beside draft/menu controls. Imported data supplies table status, dine-in/takeaway details, KOT progress, staff assignments and menu browsing. Local drafts support measured quantities and preparation notes. SecureStore persistence is scoped to business, user and demo/live mode; bounded immutable chunks are written before the manifest pointer. Failed writes retain the prior saved record. Writes serialize across screen instances.

Mobile settlement, shop KOT dispatch and financial posting remain unavailable. Snapshot import validates shape and business identity but does not authenticate origin or freshness. Existing companion onboarding uses demonstration identity. Drafts persist after explicit Save; unsaved edits are not autosaved. Saving replaces the account's previous local draft. Historical encrypted chunks are retained; comprehensive garbage collection is pending.

macOS frontend changes add Command+F search and Command+B customer navigation while retaining existing function keys. Focused confirmation accepts deliberate Command+Enter or Alt+Enter, never plain scanner Enter, repeats or composition events. Navigation aliases apply only inside checkout. Receipt fonts include Apple system fallbacks. Native dialogs and Keychain support are inherited from the existing foundation, not newly device-verified.

## Focused verification

- Desktop TypeScript/Vite production build passed on the final source changes.
- Eight focused tests passed: six shared restaurant snapshot/draft/storage/correction cases and two cashier shortcut cases.
- Three existing scanner tests passed after shortcut integration.
- Strict shared restaurant TypeScript check passed.
- Three changed mobile TSX files passed syntax transpilation; this is not a semantic mobile build.
- 63 existing mobile contract checks passed.
- 38 desktop capability/command contracts passed.
- 92 schema checks and focused SQLite kitchen history/print-identity guards passed.
- Diff whitespace checks passed.

## Release blockers and next work

Cargo is unavailable. Rust compilation, native RBAC/idempotency/concurrency execution and native financial correctness on this stack remain unverified. No installed Windows/macOS acceptance, hardware printer, Keychain/dialog lifecycle or Android/iOS/iPadOS device run was performed. Full mobile semantic checking is blocked by missing Expo/React Native dependencies. The inherited macOS Cargo.lock regeneration requirement also remains pending on an equipped host. No CI workflows were manually dispatched and no security or financial release gates were disabled.

Next functional increment: authenticated LAN operational coordination with business/device enrollment, revision-guarded draft acceptance and durable command reconciliation. Mobile must remain draft-only until this authority boundary is implemented and verified. Complete native and installed-platform acceptance before distribution.
