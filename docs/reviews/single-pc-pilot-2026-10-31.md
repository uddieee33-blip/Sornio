# Single-PC Windows pilot — engineering report, 31 October 2026

**Decision: NOT READY for a controlled single-shop Windows pilot. Ready for supervised internal testing on synthetic data.**

The shopkeeper outcome this milestone targets — *install, configure, sell accurately,
recover data, work with no internet* — is **not verified**. The reason is not that the
code is wrong; it is that no Sornio installer has ever been built or run, and three of the
seven requested items cannot be completed without a Rust compiler or a Windows host, both
of which are unavailable here. This report separates what was executed from what was read,
and says which is which throughout.

---

## 1. References reverified before any work

| Ref | State at inspection | Commit |
| --- | --- | --- |
| `main` | unchanged | `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6` |
| #130 → `main` | OPEN, draft, mergeable, `UNSTABLE` | `6043f52b0d166044766eedf2d5a1e76c8fce7595` |
| #131 → `integration/windows-finance-recovery` | OPEN, draft, mergeable, `UNSTABLE` | `103cd9d02f2e420228be293cd974b7fce0aa87d7` |
| #132 → `hardening/financial-recovery-audit-2026-10-31` | MERGED (contains `4c5a0fb`) | merge `103cd9d` |

`103cd9d` is confirmed to *be* the #131 head, i.e. the #132 merge landed on #131's branch
as previously reported. Work for this milestone is on `arena/858a4c14-dukaanos`,
fast-forwarded to `103cd9d` first, so every statement below refers to the integrated code.
Nothing was merged into `main`; `main` is untouched.

## 2. GitHub Actions — current condition, re-investigated

The #132 merge triggered three fresh runs at 13:33Z on 31 Oct. All failed in 3–8 seconds
with **zero executed steps**. The startup annotation on the newest one
(run `41206080103`, job `124551310998`) reads again:

> "The job was not started because recent account payments have failed or your spending
> limit needs to be increased. Please check the 'Billing & plans' section in your settings"

So the condition is **unchanged and still pre-execution**: it is an account billing
restriction, not a code, config or runner-image failure. No workflow was weakened, no
check removed, no security setting touched. Everything runnable on Linux was therefore run
locally (§5).

Consequence, stated once and applying to this whole report: **`cargo test`, the Tauri
build, the NSIS installer, the installed-app offline fixture, the Windows vault test and
all native screenshots have not executed for this commit — or for any commit.**

## 3. Item 1 — the Windows entry point (COMPLETED, and enforced)

Two applications existed and both could install a binary called *Sornio*. The offline
Tauri app is the product; `desktop/windows` is an online-only C#/WebView2 shell around the
hosted web app. Repairs made, all backward compatible:

| Change | File |
| --- | --- |
| Assembly renamed `Sornio` → `SornioHostedPreview`, title says "Hosted Preview (online only)", in-file note that it is not the product | `desktop/windows/DukaanOS.Windows.csproj` |
| Installer renamed `Sornio-Setup-x64.exe` → `Sornio-Hosted-Preview-Setup-x64.exe`; install dir, Start-menu entry and exe references renamed; header states it is not the product | `desktop/windows/setup.iss` |
| Workflow becomes **manual dispatch only** (no `pull_request`/`push`); all artefacts/jobs renamed `Sornio-Hosted-Preview-*`; job names say "(not the product)" | `.github/workflows/windows-desktop.yml` |
| README leads with "This is not the Sornio product" | `desktop/windows/README.md` |
| Operating rule and rationale documented | `docs/windows-product-entry-point.md` |
| **New executable guard** | `scripts/verify-windows-release.mjs` |

The guard (33 assertions, wired into `npm run verify`) fails the build if: any other
workflow publishes `bundle/nsis/*-setup.exe`; the product pipeline stops building
`apps/desktop`, stops running `cargo test`, or stops running the installed lifecycle
script; the preview gains an automatic trigger; any preview artefact stops being prefixed;
the two executables could share a name; `package.json` / `Cargo.toml` / `tauri.conf.json`
versions diverge; the product window gains a remote URL or devtools; or any offline
renderer file references the hosted origin. The product workflow itself was **not modified**.

## 4. Items 2–4 — audited, not implementable here

### Item 2, onboarding — plumbing complete, statutory configuration absent

Full audit in [onboarding-audit.md](../onboarding-audit.md). Verified by inspection: the
first-run path is installer → `device::initialize` (provision lock, Credential Manager key,
SQLCipher) → `provision_owner` → `read_local_session` → `load_workspace` → inventory, staff,
checkout, closing, backup. **No step needs SQL, a config file, an environment variable, a
developer tool or an internet connection.**

Missing and blocking a shop: no GSTIN, address, state code, bank details, UPI handle or
HSN/SAC anywhere — a search for `gstin|ifsc|upi_id|pincode|hsn` across every native and
renderer source returns **zero matches**. Onboarding is a single form, not a guided
sequence, and a vestigial "FIRST WORKSPACE" draft panel is still the first screen an owner
sees.

### Item 3, cash + customer-credit split — NOT IMPLEMENTED

Three specific refusals prevent it: a sale has exactly one `Tender`; `billing.rs:319` skips
`customers::post_sale` for retail sales; `payments.rs:606/629/1025` forbid a `credit` part
on a retail tender and journal only the cash portion. A shop cannot record ₹300 cash +
₹200 on khata.

I did **not** write the fix as code. It changes the posting transaction — the one code path
that must never commit a wrong ledger — and there is no compiler here to prove it even
compiles, let alone passes. Shipping it unverified would put an uncompiled financial change
into the branch while CI is dead. Instead the complete, reviewable plan is written up with
the exact call sites, the `post_sale(amount)` signature change that keeps existing behaviour
byte-identical, no schema change, and ten named acceptance tests:
[design/cash-plus-credit-split.md](../design/cash-plus-credit-split.md). It is a two-file
change and should be executed and verified in one pass on a machine with Rust, before any
pilot.

### Item 4, GST — arithmetic is correct and verified; invoicing is not compliant

Full analysis in [gst-invoice-requirements.md](../gst-invoice-requirements.md). The engine
computes integer-paise, half-up, `i128`-intermediate totals and the renderer matches it
exactly. But one invoice-wide rate is applied once to the subtotal, and there is no GSTIN,
state code, place of supply, HSN/SAC, CGST/SGST/IGST split, financial-year series, reverse
charge or credit note. Thirteen Rule 46 requirements are missing; eight are blocking.

The receipt's current wording — *"Local sales receipt. GST tax-invoice compliance is not
claimed"* — is correct and must stay. **A GST-registered shop cannot use Sornio as its
invoicing system today.** That is a business decision for the owner's accountant, not
something a pilot review can paper over.

## 5. Item 5 — financial regression suite, executed locally

All commands run on this host; logs in `docs/reviews/single-pc-pilot-2026-10-31/`.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run verify` — 31 suites | **PASS** (exit 0) | `verify.log` |
| ├ schema replay, 147 DDL statements + guard attacks + v4→v12 upgrade | 92 checks | |
| ├ native↔renderer↔ACL contract | 25 checks | |
| ├ invoice money parity, 4,820 randomised invoices | 11 checks | |
| └ Windows release identity (new) | 33 checks | |
| `npm run lint` + `typecheck` + `typecheck:native` | **PASS**, 0 errors, 0 warnings | `static.log` |
| `npm run build` (Next) + desktop `tsc`/Vite | **PASS** | `build.log` |

What these do and do not cover, precisely:

* **Covered, executed:** SQL-level financial guards (append-only settlement history,
  non-negative and consistent stock movement, bounded integral money, orphan refusal,
  owner-protected, over-refund refusal, duplicate pending operations); the schema-4 →
  schema-12 upgrade preserving data; renderer/native money agreement; command wiring and
  ACL completeness; offline packaging identity.
* **Not covered, NOT executed:** checkout atomicity under real concurrency, damaged-return
  restocking, refund and repayment races, crash-before/after-commit, SQLCipher encryption
  and migration, encrypted backup/restore, and LAN authority. All of these live in
  `cargo test`, which cannot run here. The repository contains tests for every one of them
  (179+ test functions across 11 files); **their presence is not evidence that they pass.**

## 6. Item 7 — Windows acceptance: none, and none claimed

No Windows host exists in this environment (`dotnet` absent, no Windows, no WebView2), so
there is **no installer, no installation record, no upgrade result, no offline-billing
run, no restart test, no backup restoration and no screenshot** for this commit. The
`windows-local.yml` pipeline is already capable of producing all of it the moment runners
work — it builds on `windows-latest`, runs the native suite, packages NSIS, then
`check-installer.ps1` installs, blocks outbound network for both the app and WebView2,
runs the offline fixture, snapshots ciphertext, uninstalls, reinstalls and re-verifies
preservation — and it explicitly records `actualVersionUpgrade = 'untested'` rather than
claiming an upgrade it does not perform.

## 7. Readiness

| Level | Decision |
| --- | --- |
| Continue building on this core | YES — the transactional design holds up under adversarial SQL testing |
| Supervised internal testing, synthetic data | YES |
| Controlled single-shop Windows pilot | **NO-GO** |
| Commercial rollout | NO-GO |

Four gates, in the order that unblocks the most:

1. **Restore Actions billing.** No code change. It converts `cargo test`, the installer and
   the installed offline acceptance from assumption into evidence — the single highest-value
   action available, and the only one that can produce real Windows proof.
2. **Then run the native suite green on this commit** and attach the log; close the §5 gaps.
3. **Implement cash + credit** per the design, with its ten tests, and verify.
4. **Then statutory onboarding + GST invoicing**, which need schema 13 and an accountant's
   sign-off on the document format.

An honest summary: this milestone fixed a genuine route to shipping the wrong Windows
executable and made that mistake impossible to repeat silently, and it re-proved the SQL and
money layers end to end. It did **not** produce the thing the milestone was actually about —
a verified shopkeeper experience on Windows — because the evidence that would prove it is
blocked by an account billing problem, not by the software.
