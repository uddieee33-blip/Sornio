# Windows draft recovery — 26 October 2026

The independent Windows app previously rejected stale saves but offered no
in-app reload path or prior saved copies. This change adds explicit reopen,
protected discard of unsaved edits, and restore of the latest 20 encrypted draft
copies. It remains a test-data storage foundation, not offline business billing.

## Behavior and boundaries

- A successful save commits the current draft, a history copy and retention
  cleanup in one SQLite transaction. Failed history writes roll back everything.
- Restore accepts an expected current revision and a source revision. The native
  store loads the source under the same write lock, rejects stale/missing copies,
  and saves it as a new monotonically increasing revision.
- Schema v1 migrates to v2 transactionally, retaining the existing draft as the
  initial history copy. Wrong keys and unsupported schemas still fail closed.
- The UI disables restore while edits are unsaved and explicitly confirms a
  discard before reopen. Failed reopen/save/restore preserves the current fields.
- Only bundled local-window IPC can list/restore copies. Native build manifest,
  command registration and capability permissions cover the two new commands.
- Saved copies share the encrypted database and device key. They do not provide
  database-corruption, profile-loss or device-loss backup/recovery.

## Verification

| Boundary | Evidence |
| --- | --- |
| Renderer build | Desktop TypeScript check and Vite production build passed |
| UI interaction | Browser guard and mocked-IPC UI checks passed: save, restore, dirty-state block, keep-editing, failed reopen, stale save and explicit reload |
| Presentation | Light/dark screenshots reviewed; 760px layout has no horizontal overflow |
| Native storage | `cargo test --locked --manifest-path packages/local-store/Cargo.toml`: 10 passed against SQLCipher, including five new recovery/migration tests |
| Native accessibility script | Python syntax check passed; extended to save twice, restore revision 1, force termination and verify revision 3 after reopen |
| Windows release | New native acceptance and installer build run through the Windows local workspace workflow; local browser mocks do not establish this boundary |

The product decisions and platform sequence are recorded in
`docs/windows-native-roadmap.md`. Identity/import and offline unlock/roles remain
prerequisites for production billing, followed by stock/ledger/outbox atomicity,
LAN pairing, cloud sync, paid entitlements and signed distribution.
