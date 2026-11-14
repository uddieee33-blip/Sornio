# CI release-gate repair — 2026-11-04

## Baseline and scope

`origin/main` was fetched at `1cc5c798d1eada9a16463213b0776c01e99d36f9`; the initial worktree was clean. The fix branch `fix/ci-release-gate-20261104` starts from that commit. The audit branch at `55bb7f21fa53831658648dd2673e1b9dba1a3712` and Phase 7 branch at `51604e5ec3312c45dc2e33f0123743a067d6c9ae` were inspected read-only and are not integrated. No application, financial, database, replication, UI, or dependency changes are included.

## Root cause and inventory

The pipeline `command | tee "$log" || true` executes `true` on pipeline failure. Reading `PIPESTATUS` after that reads the status of `true`, not the previous pipeline; both failed command and failed logging can be reported as success. Six source sites were confirmed by searching every workflow for pipeline/status and failure-suppression patterns:

| Workflow | Affected site |
|---|---|
| `windows-local.yml` | Native Rust tests, release profile |
| `windows-local.yml` | Native Rust tests, debug profile |
| `windows-local.yml` | Installer build |
| `workspace-browser.yml` | Native tests helper, called for debug and release |
| `workspace-browser.yml` | Web browser acceptance |
| `workspace-browser.yml` | Desktop browser checks helper |

Cleanup traps intentionally use `|| true`. The independent `replication-postgres.yml` `set +e` blocks capture `$?` immediately after a single command and are not this defect. The new diagnostic-only `|| true` instances run only after statuses have been saved and an unconditional error annotation emitted; they cannot change the saved return code.

Each fixed pipeline disables `errexit` only around the pipeline, immediately saves both `PIPESTATUS` values, restores `errexit`, and returns the command status when it fails, otherwise the `tee` status. Both statuses are included in error annotations. Existing extracted test/compiler/error tails remain; missing logs and unmatched diagnostic filters do not hide the original failure. A new standalone harness is run by the browser workflow on relevant PR paths, including changes to either workflow or the harness.

## Reproduction and regression

Executed on Linux, Bash 5.2 and Python 3. The harness extracts the **actual run blocks** from the source workflows and runs them in Bash with `-e -o pipefail`, replacing external cargo/npm/node/tee commands with deterministic stubs. It confirms the target executed, checks both reported pipeline statuses and error annotations, checks detailed annotations for command failures, and ensures later debug/release or desktop checks stop on failure. It also checks that success does not emit an error. `/dev/full` exercises a real `tee` write failure on Linux; status 19 exercises a deterministic stubbed logging failure.

| Command status | `tee` status | Original wrapper | Fixed wrapper |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 |
| 1 | 0 | 0 | 1 |
| 23 | 0 | 0 | 23 |
| 0 | 19 (injected) | 0 | 19 |
| 23 | 19 (injected) | 0 | 23 |
| 0 | 1 (`/dev/full`) | 0 | 1 |
| 23 | 1 (`/dev/full`) | 0 | 23 |

Seven targets (six sites, with both browser-native profiles) × seven conditions = **49 original-workflow reproductions and 49 fixed-workflow checks**. Full output is in `ci-release-gate-2026-11-04-results.txt`. On systems without `/dev/full`, the 35 deterministic stub cases still run.

Commands:

```sh
python3 scripts/test-ci-logged-wrappers.py --workflow-ref 1cc5c798d1eada9a16463213b0776c01e99d36f9 --expect-vulnerable
python3 scripts/test-ci-logged-wrappers.py
npm run verify:windows-release
```

All 49 baseline observations and all 49 fixed cases passed the expected assertions. The existing Windows release configuration verifier passed 40 checks. All nine workflow YAML documents parsed using local PyYAML; all explicit Bash run blocks in the two changed workflows passed `bash -n`. This is not GitHub workflow semantic validation or a Windows Bash run. `git diff --check` passed. ESLint completed with zero errors; the explicit Python file argument was ignored by ESLint, as expected, and the repository reported its existing unused-variable warnings. No packages were upgraded.

## Historical evidence

GitHub reports the [Windows job](https://github.com/uddieee33-blip/Sornio/actions/runs/41709217989) and [browser job](https://github.com/uddieee33-blip/Sornio/actions/runs/41709217778) as successful for PR head `97b6899475cc3dfa3ff1370f59373401646eecfb`. The Windows artifact manifest identifies the tested GitHub PR merge commit as `50c239cf5f8b8c69200a21f13798b2d91ab46afa` (GitHub identifies it as merging that head into `005f27a7702b37916ae517b7f37360c0e9ce436f`); do not confuse those SHAs. The relevant wrappers match the baseline.

The browser job's retrieved raw log proves that **both debug and release native runs failed**: each reports **204 passed, 3 failed, 6 ignored**. The failures were `cash_credit_and_zero_tax_ledgers_are_correct_per_invoice`, `missing_product_multi_row_guard_and_new_delivery_after_ack`, and `concurrent_credit_limit_never_exceeds_customer_cap`. GitHub nevertheless marked the browser job successful. The later browser fixture messages in that log reported passing, but their wrapper also had the masking defect; those messages support only the individually observed fixtures, not a complete green job.

The Windows job's step summaries report success for the wrapped Rust and installer commands, and for separate installed-app and artifact-verification steps. Its raw job-log retrieval timed out, so the wrapped Rust outcomes cannot be established from those success labels. We downloaded the native-capture archive and checked its SHA-256 against GitHub's artifact digest; its manifest and lifecycle JSON record an unsigned installer and passed same-version offline install/reinstall checks on the PR merge commit. Those artifact assertions are independent supporting evidence for those specific checks, not proof that the wrapped Rust suites passed, an actual version upgrade, or physical-hardware acceptance. Screenshots were not visually re-reviewed here. The archive's `native-scale.json` says Linux even though the workflow calls that fixture on Windows; the fixture hard-codes that label, so this field does not independently establish the execution OS.

The browser review archive digest also matched; it contains server logs and screenshots, not the native test command's log. A separate later audit on branch `55bb7f21...` reported and then independently reran 208 Rust tests passing on Linux, but it is a different source tree and environment and does not establish Windows success for the historical PR merge or this CI fix. Do not label every historical artifact invalid; rerun the affected command-level checks on the intended exact candidate with the repaired wrappers.

## Gates and remaining work

| Gate | Status | Evidence |
|---|---|---|
| C1 | PASS | Six sites identified across all workflows; browser native helper exercised twice. |
| C2 | PASS | Original seven targets × seven outcomes reproduced false success. |
| C3 | PASS | Injected 1 and 23 returned 1 and 23; dual failure returned command status 23. |
| C4 | PASS | Injected tee failure returned 19; actual `/dev/full` tee failure returned 1. Both statuses annotated. |
| C5 | PASS | Zero/zero returned zero without an error annotation. |
| C6 | PASS | Each failure annotated; command details preserved when available and logging failures explicitly reported. |
| C7 | PARTIAL | YAML parse and Bash syntax pass locally; GitHub Actions semantic validation and Windows runner execution not performed. |
| C8 | PASS | Diff limited to CI workflows, regression harness, and this evidence. |
| C9 | PASS | 49+49 injection cases and verifier executed; simulation and OS limits explicit. |
| C10 | PASS | Isolated from main; reversible commit and no schema or application changes. |

Exact-candidate GitHub Actions and genuine Windows NSIS/install/UIA, printing, scaling, accessibility and recovery acceptance remain unrun. Correcting this gate does not resolve the separately documented cash/customer replication contract mismatch or establish pilot readiness.

To roll back after integration, revert the CI-fix commit on a new branch with `git revert <integrated-commit-sha>`; if it was squash-merged, use the resulting squash SHA. Review the reverse diff before applying. Reverting restores the false-success vulnerability.

The branch is local only: no PR, remote push, workflow run, deployment, merge, or release was performed. Existing repository Git/Vercel integration can automatically start a preview on a branch push, so publication was not attempted under this assignment's prohibition on deployment and publishing.
