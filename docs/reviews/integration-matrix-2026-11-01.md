# Cross-PR integration matrix — 2026-11-01

Scope: open PRs #122–#131, #134 and the consolidated branch
`arena/3519c98b-dukaanos` (draft PR #135). Evidence: `git merge-base
--is-ancestor`, `gh pr list`, `gh run list`, `gh pr checks` on 2026-11-01.

## Stack topology (verified ancestry)

```
main (97bfe2f)
 └── #130 integration/windows-finance-recovery @ 6043f52b
      └── #131 hardening/financial-recovery-audit-2026-10-31 @ c4777a1f
           (includes merged #133 @ arena/858a4c14)
           └── #134 test/windows-evidence-verification-2026-11-01 @ c43d80d
```

`arena/3519c98b-dukaanos` = `c43d80d` + repair commits (see PR #135); the
merge is a fast-forward, no history was rewritten.

## Matrix

| PR | Head SHA (2026-11-01) | Checks at head | Ancestor of stack top? | Relationship | Recommendation |
|----|-----------------------|----------------|------------------------|--------------|----------------|
| #122 native authorization | 6631eb04 | all pass (incl. local-windows) | yes (in #130) | Superseded — included in #130 | Close as merged-by-inclusion once #130 lands |
| #123 customer credit | e41f8894 | n/a (base branch of #122) | yes (in #130) | Superseded — included in #130 | Same |
| #124 financial settlement | 20e36b7a | all pass | yes (in #130) | Superseded — included in #130 | Same |
| #125 encrypted backup | 69ed5db0 | CI pass, browser pass, **local-windows FAIL** (backup recovery UI step) | no | Functionality present in #130 in evolved form (`recovery.rs` diverged, +245/−60 lines vs #125) | Keep draft; its unique UI/acceptance scenarios should be re-based onto the consolidated branch; do not merge as-is |
| #126 LAN hub | 129fce1e | CI pass, browser pass, **local-windows FAIL** (two-client TLS LAN cargo step) | no | LAN authority present in #130 as gated `lan_authority.rs` (397 lines, disabled transport boundary) | Keep draft; operational LAN stays disabled and documented; re-base tests onto consolidated branch |
| #127 GST invoicing | 345cd2b6 | all pass | no | Independent feature, no conflicts with stack | Ready for review on its own |
| #128 keyboard/printing | ba182c09 | **all pass** (TS2307/TS2875 fixed by root `npm ci` + dual-lockfile cache path) | no, but adapted | #130 says "Adapted from #128" (`receipt-print.ts`); the workflow fix was dropped by the integration rewrite and is re-applied in #135 | Ready for review; merge its workflow fix via #135 |
| #129 runtime/inventory audit | 364f42b2 | all pass | no | Independent review/audit branch | Ready for review on its own |
| #130 master integration | 6043f52b | CI pass, browser pass, **local-windows FAIL** (cargo test step, exit 1) | — (stack base) | Superseded by consolidated #135 head where the same step passes on Windows | Convert to review via #135 |
| #131 hardening | c4777a1f | CI pass, browser pass, **local-windows FAIL** (same step) | — | Included in #135 | Convert to review via #135 |
| #134 evidence gate | c43d80d | **no Actions runs at all** (workflow `pull_request.branches` did not include its base) | — | Included in #135; trigger fixed by adding the stacked base branches to `windows-local.yml`, `workspace-browser.yml`, `ci.yml` | Convert to review via #135 |

## Consolidated branch verification (PR #135, head f4384a5 at writing)

- Core CI: **pass** (lint, tsc + tsgo typecheck, verify scripts, build, npm audit, cargo audit).
- Workspace browser review: **pass** — rustfmt clean, `cargo test --all-targets`
  debug **and** release on Linux pass (incl. the new split cash+credit tests),
  scale fixture, production build, browser acceptance.
- Windows local workspace: steps 1–16 **pass** on windows-latest (root+desktop
  install, frontend build, `cargo test --all-targets --release` incl. vault,
  NSIS installer build, evidence-contract unittests, 1k-product scale fixture).
  Step 17 (installed-app lifecycle via `check-installer.ps1`) was failing at
  the `check-native.py` "installed offline fixture" stage; stage/output
  annotations were added to localise it exactly (see run for f4384a5+).

## Notes

- No PR was merged to obtain green checks; #135 is a draft consolidation PR.
- The draft heads' Windows cargo failures (exit 1, no logs retrievable from
  this environment) are not reproduced on the consolidated head; failure
  annotations were wired into the workflow so any recurrence is diagnosable
  from the checks API.
- Windows raw job logs are not downloadable from this environment (blob
  storage blocked); all CI findings above come from the checks/annotations
  API and step-level conclusions.
