# Pilot correctness follow-up — 29 October 2026

Baseline: PR #124 head `22e8222b4480f10110e4dc07e9080ef36908fc6e`;
merged main remains `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`.

## Verified recovery defect (medium)

`apps/desktop/src/InventoryPanel.tsx`, `acknowledge()` previously cleared the
pending receipt but retained inputs after recovery through a refresh. Reproduction:

1. Enter +2 kg and a delivery reason; let the native save commit and lose its reply.
2. Trigger the inventory refresh that follows another panel's completed sale/return.
3. The saved receipt is recovered; acknowledge it.
4. The +2 kg and reason remain populated. A subsequent explicit submit can create
   a second, independently identified delivery. This is a stale-form risk; no
   automatic duplicate stock commit was observed in this follow-up.

Acknowledging a stock adjustment now clears its quantity/reason. Acknowledging
item creation clears that item's input form. Clearing happens only after a
successful acknowledgement reply; uncertain acknowledgements retain the recovery
controls and ID. Unrelated form inputs are preserved.

## Verification

`apps/desktop/check-inventory-refresh.cjs` mounts the actual InventoryPanel with
mocked IPC, simulates committed reply loss and a cross-panel refresh, and checks
both stock adjustment and item creation. The test refuses a second blank submit
and confirms one simulated write. It is added after check-ui in the existing
browser workflow. This test does not exercise SQLCipher, Tauri or Windows.

Before fix, the regression failed with:

```text
AssertionError [ERR_ASSERTION]: Recovered delivery must not remain ready to submit again
'2' !== ''
```

After fix:

```text
Inventory refresh regression passed: committed reply loss, cross-panel receipt recovery, acknowledgement clears old delivery fields, one stock effect. Mocked IPC; no Windows/native claim.
```

The existing mocked access/inventory UI suite also passed. Desktop TypeScript
`tsc --project apps/desktop/tsconfig.json --noEmit` and new runner's `node --check`
passed. Node 24.22.1, Chromium 156.0.8078.73, desktop lockfile installed with
`npm ci`. Only the component regression and mocked UI suite were rerun here.
The isolated UI fixture used a placeholder brand image; no image change is in
the PR and no packaged-build result is inferred. The previous 126 debug/release
native results belong to the baseline; Rust production code is unchanged.

## Acceptance blocker

Reinspection of the prior final-head Windows job `123311956760` confirms
`runner_id: 0`, empty runner name and no steps. Run `40832993631` attempt 2
failed in approximately two seconds. This establishes that it did not execute
Windows acceptance, but does not establish why scheduling/startup failed.
No account spending, runner or repository security settings were changed.

Backup/key restoration, GST/accountant validation, actual payment confirmation
and physical/packaged Windows acceptance remain the gates in
[the pilot report](windows-pilot-correctness.md). No merge was performed.
