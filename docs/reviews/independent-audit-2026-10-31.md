# Sornio independent audit — 31 October 2026

**Pilot decision: NOT READY for a real-shop pilot. Ready for continued supervised internal testing on synthetic data only.**

This is an independent increment on top of [windows-master-execution-2026-10-31.md](windows-master-execution-2026-10-31.md). It does not repeat that report. It re-verified its baseline against GitHub, added three new executable test layers for code the earlier review could not run, and closed one verification gap it left open (why the Actions jobs fail).

Nothing here is a claim that the master assignment is complete. Where a check could not run, the table says **BLOCKED** and says what would be needed. No installer, screenshot, native test or Windows result in this document was fabricated; none exists.

---

## 1. Verified repository baseline

Read live from GitHub at the start of this session, not assumed.

| Ref | Exact commit / state at inspection | Outcome |
| --- | --- | --- |
| `main` | `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6` — unchanged since PR #121 merged | Not touched. 27 commits behind the integration branch. |
| #120 encrypted local stock | merged, `7e29224…` | Historical baseline only |
| #121 native offline checkout | merged, `5e5111e…` | The last code that reached `main` |
| #122 authorization | open, `6631eb0…` | Superseded by #130's integration, not independently merged |
| #123 customer credit | open, `e41f889…` | Same |
| #124 credentials/settlement | open, `20e36b7…` | Same |
| #125 encrypted backup | open, `69ed5db…` | Adapted into #130 |
| #126 LAN hub | open/draft, `129fce1…` | Older transport; **not** integrated |
| #127 GST foundation | open, `345cd2b…` | Arithmetic only, not statutory invoicing |
| #128 keyboard/printing | open, `08575a2…` | Adapted into #130 |
| #129 Windows runtime audit | open, `364f42b…` | Adapted into #130 |
| #130 integration | **open draft**, base `main`, head `6043f52…`, 27 commits, `mergeable: MERGEABLE`, `mergeStateStatus: UNSTABLE` | The correct engineering parent |
| #131 hardening (adds damaged-return fix) | **open draft**, base `integration/windows-finance-recovery`, head `3c192b1…`, 1 commit | Verified correct parent |

Branch protection could not be read (`403 Resource not accessible by integration`). No claim is made about required reviews or status-check enforcement.

**Development continues from `arena/1509737c-dukaanos`**, fast-forwarded to `3c192b1` (the #131 head, which contains #130) with three new commits on top. `main` is untouched, nothing was merged, no branch was deleted or force-pushed.

---

## 2. Why every GitHub check is red — actual cause, now read

Earlier reviews could only establish that the jobs "never executed". This session read the startup annotations directly:

```
gh api repos/uddieee33-blip/DukaanOS/check-runs/<job>/annotations
→ "The job was not started because recent account payments have failed or
   your spending limit needs to be increased. Please check the 'Billing &
   plans' section in your settings"
```

Every failing job on #130 and #131 has `steps: null`, `runner: ""`, zero artifacts and a 3–6 second duration. That is an account/billing condition, not a compilation or test failure:

| Run | Workflow job | Duration | Steps executed |
| --- | --- | --- | --- |
| 41118325548 | CI · Lint, types, build | 3 s | none |
| 41118325548 | CI · Dependency audit | 1 s | none |
| 41103335761 | Windows local workspace · local-windows | 6 m 40 s (queued) | none |
| 41118325533 | Workspace browser review | 3 s | none |

Distinguishing runner/account limits from code failures matters, so the same CI steps were executed here instead (§3). **No workflow was weakened, no check was skipped, no security setting was changed to make anything green.**

Consequence: **no Rust test, no Tauri build, no NSIS installer and no Windows acceptance run has executed for this candidate on GitHub.** That is the single largest verification hole in the project, and it is administrative before it is technical.

---

## 3. What was independently executed here

Environment (full details in [environment.txt](independent-audit-2026-10-31/environment.txt)): Debian 12, x86_64, 2 vCPU, Node 22.22.3, npm 10.9.8, Python 3.11.2, SQLite 3.40.1.

Absent and verified absent, not assumed: `rustc`/`cargo` (no toolchain; `crates.io` and `static.rust-lang.org` are unreachable from this sandbox — `curl` TLS failure), SQLCipher (no encrypting SQLite), any Windows runtime, any browser.

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Dependency install (reproducible) | `npm ci`, `npm ci --prefix apps/desktop` | PASS, lockfiles honoured | — |
| Lint | `npm run lint` | PASS, 0 errors, 0 warnings | [lint.log](independent-audit-2026-10-31/lint.log) |
| Type check (JS-API compiler) | `npm run typecheck` | PASS | [typecheck.log](independent-audit-2026-10-31/typecheck.log) |
| Type check (TS 7 native) | `npm run typecheck:native` | PASS | same |
| Repository verification suite | `npm run verify` | **PASS**, 30 gated suites (27 pre-existing + 3 new) | [verify.log](independent-audit-2026-10-31/verify.log) |
| Production web build | `npm run build` (Next, webpack) | PASS, all routes emitted | [build.log](independent-audit-2026-10-31/build.log) |
| Desktop renderer build | `npm run build --prefix apps/desktop` (`tsc --noEmit` + Vite) | PASS, 38 modules, 329.9 kB bundle | [desktop-build.log](independent-audit-2026-10-31/desktop-build.log) |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities | [audit-root.json](independent-audit-2026-10-31/audit-root.json) |
| Desktop dependency audit | `npm audit --prefix apps/desktop` | 0 vulnerabilities | [audit-desktop.json](independent-audit-2026-10-31/audit-desktop.json) |
| Installer-preservation helper | `python3 -m unittest … test_install_data.py` | 4 tests PASS | [installer-helper.log](independent-audit-2026-10-31/installer-helper.log) |
| SQL/schema replay + attacks + upgrade | `npm run verify:local-schema` (new) | **92 checks PASS** | [schema.log](independent-audit-2026-10-31/schema.log) |
| Native ↔ renderer contract | `npm run verify:desktop-contract` (new) | **25 checks PASS** | [desktop-contract.log](independent-audit-2026-10-31/desktop-contract.log) |
| Invoice money parity | `npm run verify:money` (new) | **11 checks PASS**, 4,820 randomised invoices | [money.log](independent-audit-2026-10-31/money.log) |
| Rust unit/integration tests | `cargo test` | **BLOCKED** — no toolchain, registries unreachable | — |
| SQLCipher open/encrypt/restart | — | **BLOCKED** — no SQLCipher library here | — |
| Tauri/IPC/browser end-to-end | — | **BLOCKED** — no WebView2, no browser socket | — |
| Windows build/install/offline/recovery | — | **BLOCKED** — no Windows host | — |
| Physical hardware (printer, scanner, router, power) | — | **BLOCKED**, none attached | — |

A note on Node: the repo pins `node 24.x`; this host has 22.22.3, and every gate above still passes. That is evidence the tree is not relying on a Node-24-only API in the tested paths, not evidence that the pinned runtime was tested.

---

## 4. New verification added in this increment

Three scripts, all wired into `npm run verify` so the (currently blocked) CI job will run them unattended once billing is restored. They add coverage where the repository had none, without changing one line of application code.

### 4.1 `scripts/verify-local-schema.py` — the database as a last line of defence

The previous reviews could not execute anything touching the native store. The store's guarantees for money are largely **SQL**, not Rust: non-negative stock, append-only settlement history, foreign keys, bounded amounts, one credit sale per invoice. Those are testable without a Rust toolchain.

The script reads the real migration source — `include_str!` schema files, inline `execute_batch` batches, `const`-declared tables and `format!` trigger loops — and replays all **147 DDL statements in `Store::open` order** into a real SQLite engine opened the way the app opens it (`foreign_keys=ON`, `recursive_triggers=ON`). Then:

* asserts `user_version = 12` and that the replay applies cleanly;
* attacks the schema and requires refusal: updating/deleting payment, journal, activity, ops, return and invoice-stock rows; `INSERT OR REPLACE` over a posted invoice; negative or internally inconsistent stock movement; overselling beyond a recorded "before" quantity; payments above ₹90,00,00,00,000 or of zero; unknown payment methods, ledger accounts and non-integer amounts; duplicate ledger rows; orphan payments and credit rows; deleting a customer with history or staff instead of disabling; demoting the owner; a second credit sale on one invoice; zero-quantity returns and zero refund parts; two pending operations per cashier; two opening floats per cashier-day; an invalid closing state;
* verifies **coverage**, not just individual cases: every append-only table must carry both an UPDATE and a DELETE guard (by parsing trigger SQL, so it survives renames), so a table added next month without guards fails this check;
* checks money invariants on a seeded, code-accurate sale: each operation's journal sums to zero, each invoice's ledger debits equal credits equal its receipt total, revenue + tax equal the receipt, payments equal the total, and no payment is refunded past its amount;
* compares a structural fingerprint (columns, triggers, indexes) with `packages/local-store/fixtures/schema-fingerprint.json`, so a migration that silently drops a table, reshapes a column, or loses an append-only trigger fails the build;
* **upgrades a frozen legacy database**: loads `fixtures/pr120-v4-schema.sql` (the main-branch schema the Rust upgrade tests also load), seeds stock and a draft, applies exactly the migrations a v4 install needs, and asserts the data survives, the upgraded database accepts a sale and still refuses ledger rewrites, and the resulting schema is **identical to a fresh install**.

Scope limit, stated plainly: this executes the *SQL layer*, not the Rust functions, not SQLCipher page encryption, and not the data back-fill that `identity::migrate` and `payments::migrate` perform in Rust. A pass means "the database refuses these invalid states", never "the checkout code is correct".

### 4.2 `scripts/verify-desktop-contract.mjs` — the wiring nothing else checks

Four lists have to agree or a button silently fails, and none of them is compiler-checked: Rust `#[tauri::command]` definitions, `generate_handler!`, the capability permission allow-lists, and renderer `invoke()` names. A command missing from the ACL compiles perfectly and is denied at runtime.

**Observed: 48 commands defined, 48 registered, 48 allowed, 41 named by the renderer, zero mismatches.** The script pins that state and additionally asserts: the sessionless command allow-list is exactly five access/status commands; every other command carries the native scope; the capability is `local: true` for the `main` window only; devtools are off; the installer is per-user with offline WebView2; the renderer contains no `fetch`/`XMLHttpRequest`/`WebSocket`/`http(s)://`/`localhost` reference; raw HTML appears in exactly one place and comes from the native, escaped statement renderer; `money()` uses `BigInt`; and `window.print()` is preceded by a fresh `authorize()`.

### 4.3 `scripts/verify-native-money.mjs` — the counter's arithmetic vs the writer's

The cashier sees a total before the sale is posted, computed in JavaScript, then the native writer recomputes it in Rust. Divergence means the customer is quoted one amount and charged another.

4,820 deterministic random invoices (1–5 lines, magnitudes spanning a single packet to the full ₹90,00,00,00,000 ceiling, tax 0–100%) were generated and compared against a BigInt transcription of `billing::line_total` / `tax_total`, including refusal parity: the renderer may only refuse where the native writer refuses (zero subtotal, overflow). Plus half-paise rounding edges, per-invoice (not per-line) tax rounding, 8 accepted and 21 refused `parseFixedDecimal` forms, `money()` exactness beyond 2^53 (e.g. `'9007199254740993'` → `₹9,00,71,99,25,47,409.93`), and Indian digit grouping.

Finally, because `CheckoutPanel` rebuilds a recovered pending sale's split by dividing stored paise by 100 and putting the result back into the amount fields, the recovered figure must re-parse to the same paise: 200,006 values were round-tripped through `parseFixedDecimal`, all exact, none in exponent form.

The script re-reads the Rust rounding constants from `billing.rs` and fails if native rounding changes without this test being revisited. **Result: zero divergence, no unsafe integers, no overflow accepted.**

---

## 5. Findings, by severity

Severity is about money, data, or trust — not effort.

### Critical — blocks a real shop

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| C1 | **No Windows artefact has ever been built or installed for this candidate.** No NSIS installer exists for `6043f52`/`3c192b1`; no installed-app test, offline test, vault test, restart test or recovery-dialog test has run. | All Windows jobs never started (§2); this host is Linux | The target platform is unverified. Installation, Credential Manager, WebView2 offline behaviour, printer access and uninstall/reinstall are all assumptions. |
| C2 | **Multi-PC LAN does not exist as software.** No socket, no listener, no HTTP/TLS, no pairing UI, no Tauri command. `packages/local-store/Cargo.toml` and `src-tauri/Cargo.toml` carry no networking dependency; a grep for `TcpListener`/`TcpStream`/`axum`/`hyper`/`reqwest`/`UdpSocket` across all native source returns nothing. `lan_authority.rs` is an in-process authority model (device enrolment, generation fencing, permission intersection) reachable only from Rust tests. | Source inspection | "One hub, several tills" is not deliverable today. The *architecture* is right — the hub is authoritative and SQLite is never shared — but the transport is absent. The earlier review's "PARTIAL" is generous; for a shop it is missing. |
| C3 | **No CI execution path.** Until GitHub billing is restored, every PR is unverifiable by automation and no release can be evidenced. | Annotation in §2 | Release engineering cannot proceed. Fixing this is the highest-value action available and costs no code. |

### High

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| H1 | **Cash-plus-credit split is unsupported.** Retail tender validates `payments.len() <= 8` and forbids `credit` on a retail tender; credit is a separate tender. A customer paying ₹300 cash and ₹200 on khata cannot be recorded in one checkout. | `payments::validate`, `invoice_posted`; `CheckoutPanel` refuses non-cash tenders in retail splits | Very common Indian shop transaction. Today a cashier must choose one tender and misstate the other. |
| H2 | **Statutory GST invoicing is not implemented.** Arithmetic exists (5% basis-point rate, per-invoice rounding), and the receipt explicitly says "GST tax-invoice compliance is not claimed". There is no GSTIN capture on the invoice, no HSN/SAC per line, no CGST/SGST/IGST split, no invoice series per financial year, no place-of-supply. | `billing.rs`, `Receipt`/`Invoice` structs, `pa.json` receipt text | A shop cannot issue a compliant tax invoice from this build. This is a product decision and a legal exposure, not just a feature gap. |
| H3 | **The outbox has no consumer.** `local_billing_outbox` and `local_retail_outbox` accumulate every committed operation durably, and `read_billing_outbox` is exposed — but nothing in the renderer calls it and there is no sync process, retry policy, or acknowledgement protocol. | `verify-desktop-contract` cross-check; command never invoked | Fine while everything is one PC. It means "sync" is unstarted, so any future cloud/Android story needs a full delivery pipeline, not a small adapter. |

### Medium

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| M1 | **Two different Windows applications live in the tree.** `desktop/windows` is a C#/WebView2 shell whose `NavigationPolicy` allow-lists the *hosted* `dukaan-os-six.vercel.app` origin and is built by `windows-desktop.yml` (`dotnet publish`); `apps/desktop` is the real offline Tauri product built by `windows-local.yml`. | source + both workflows | Someone can ship, test or screenshot the wrong binary. Recommend one product path and either archive or clearly mark the other. Not done here: it is a product decision, not a repair. |
| M2 | **The business day is hard-coded to IST** (`date('now','+330 minutes')`) for invoice attribution, payment-day matching, closing cut-offs and dashboards. | `payments::today`, `day_at`, `summary` | Correct for the target market, wrong for any shop outside UTC+5:30, and it silently attributes late-evening sales to the next day at the boundary. Should be a documented, tested business setting before any non-Indian deployment. |
| M3 | **No automated test executes the Tauri command layer.** All 48 commands are thin wrappers, but nothing verifies IPC serialisation, argument names or error-code mapping end-to-end; the browser harnesses that would are blocked here. | `apps/desktop/check-*.cjs`, `check-native.py` | Verified *statically* only (§4.2). A wrong argument name would fail at runtime. |
| M4 | **The `local_retail_journal` has no uniqueness constraint on `(operation_id, account)`.** Multiple journal rows per operation are intentional (a return writes `refund_payable` more than once), and duplicate-safety relies on `journal()` being called once per clearing account. | `payments-schema.sql`, `journal()` | Not a live defect: readers (`manual_net`) only query clearing accounts, which are written once per operation. Recorded as defence-in-depth only. Deliberately not "fixed" with a schema change, because a migration for an unreachable bug is a downgrade in risk. |

### Low / informational

* The renderer derives button visibility from its own role copy (`manage`, `policy`, `correct`). Correct as presentation, and correctly documented in `native.ts` — but it means UI and native permission tables can drift. Native remains authoritative; a mismatch would show a button that then refuses.
* `CommandError::from` folds several distinct errors into `invalid_product` and a catch-all `workspace_error`. The UI treats refusals correctly, but messages lose specificity.
* The desktop `apps/desktop/package.json` pins `typescript 6.0.3` while the root uses the JavaScript-API compiler plus `tsgo`; both pass.
* Two workflow files still use `actions/checkout@v4` where `ci.yml` uses `@v7`. Cosmetic inconsistency, not a failure cause.

### Verified as working (not assumed)

Balance-section findings, because a report that only lists problems is not an audit:

* Every command is registered **and** ACL-permitted **and** named correctly by the renderer: 48/48/48, zero drift.
* The renderer is genuinely offline: no network API, no localhost, no remote URL, no console logging of business data, in any of the 16 renderer files.
* Existing settlement history cannot be rewritten or deleted at the database level, including via `INSERT OR REPLACE` with recursive triggers on — proven by execution, not inspection.
* The schema-4 → schema-12 upgrade on the frozen main-branch database preserves stock and drafts, keeps foreign keys clean, and yields exactly the fresh-install schema.
* Invoice money: renderer and native formula agree to the paise across 4,820 randomised invoices and every rounding edge tested.
* A posted invoice's ledger balances, its payments equal its total, and revenue + tax reconcile — checked as executable assertions rather than by reading code.
* Unverified UPI can never be recorded as verified: `externallyVerified:false` is written into every receipt, `state()` only reports `pending`/`manually_reconciled`, and `summary()` hard-codes `externally_verified_paise: "0"`.
* Owner cannot be demoted or disabled, staff cannot be deleted (disable instead), customers with history cannot be deleted — enforced by triggers, verified by attack.
* No placeholder data, no demo data, no `TODO`, no dead `<button>` without a handler anywhere in the desktop renderer.
* Production dependency tree: 0 advisories, both packages.

---

## 6. Financial correctness — what is evidenced and by what method

The distinction matters, so each row states the method. "Inspection" is a human reading the code; it is not a test.

| # | Property | Method | Result |
| --- | --- | --- | --- |
| 1 | Sale, invoice, stock, ledger, audit and outbox commit in one writer transaction | Inspection of `billing::post_into` (single `TransactionBehavior::Immediate`, every write inside, `insert_one` asserting one changed row) + prior native suite | PASS by inspection; prior native evidence exists for `3c192b1` but **not re-executed here** |
| 2 | Failed posting leaves no partial effects | Inspection; DB-level attack of the ledger/stock tables | Schema refuses partial state; code path unexecuted here |
| 3 | Retries cannot duplicate a sale | Inspection of `replay()` (request-bytes comparison → `OperationConflict`), `available()` id-space check, pending-op fencing, `prepare` → `post` identity retention in `CheckoutPanel.confirm` | PASS by inspection |
| 4 | Concurrent checkouts cannot oversell | Inspection: `revision`-conditioned `UPDATE … WHERE revision=?` with `changed != 1 → StockConflict`, inside an immediate transaction | PASS by inspection |
| 5 | Cash, UPI, card and split payments recombine to the invoice total | Inspection (`invoice_posted` sum check, ≤8 parts, distinct ids) + executed ledger/payment invariants | PASS |
| 6 | Split payments cannot be silently accepted when unverified | Inspection: `Match` requires exact `statement_amount_paise == refundable`, owner/manager `Reconcile` permission, and labels the result "manual statement match only" | PASS by inspection |
| 7 | Unverified UPI is never confirmed | Inspection + executed `externally_verified_paise: "0"`/`externallyVerified:false` assertions | PASS |
| 8 | Credit sales, partial repayments, overpayment refusal | Inspection (`customers.rs` ledger with unique indexes, `Overpayment`/`CreditLimit` errors) | PASS by inspection; unexecuted here |
| 9 | Returns and refunds conserve money and stock; damaged goods are not restocked | Inspection of `return_invoice` + `ReturnDisposition`; DB-level refusal of over-refund | PASS by inspection; the correction itself is a #131 defect fix, not re-tested here |
| 10 | Daily cash closing with variance and stale-summary refusal | Inspection (`Close` compares `through`, refuses while any checkout is pending, appends an immutable closing row) | PASS by inspection |
| 11 | Role-based authorization enforced natively | Inspection of `run_scoped`/`verify_scope`/`require` + per-command permission mapping; static proof that scope is always sent | PASS by inspection; IPC boundary unexecuted |
| 12 | Migrations are additive and preserve history | **Executed** (92-check harness, including the v4→v12 upgrade) | PASS, SQL layer |
| 13 | Money is exact integer paise end-to-end | **Executed** money parity + inspection of `i128` arithmetic | PASS |
| 14 | No `f64`, no `unwrap`/`panic` in production money paths | Grep of all non-test native source: zero float usage; all `unwrap` hits are inside `#[cfg(test)]` blocks | PASS |
| 15 | Encrypted backup/restore, wrong credentials, interrupted recovery | Inspection of `recovery.rs` (SQLCipher archive, manifest with SHA-256, preview bound to file hash, generation rotation, crash hooks) | **Unexecuted here** — needs SQLCipher + Rust |

---

## 7. Windows build status

**BLOCKED. There is no Windows build to report.** No installer was produced, no installation was performed, no screenshot exists, and no offline test ran. The three things that would change this, in order:

1. Restore GitHub Actions billing (account action, not code) → the existing `windows-local.yml` builds the Tauri app on `windows-latest`, runs `cargo test --release --locked` on the store, produces the NSIS installer, blocks outbound network for the app and WebView2 to enforce offline behaviour, runs the pywinauto review, and uploads the installer plus native captures. **No workflow change is needed to get the first real evidence.**
2. Once that is green, execute `check-install-data.py` and `check-installer.ps1` against a *real version upgrade*, not a same-version reinstall.
3. Only then attempt printer, drawer, scanner, router and power-interruption acceptance on physical hardware.

---

## 8. Performance

**Nothing was measured natively by this session** — a Rust benchmark cannot run here, so none is reported. The only native timings in the repository are the earlier 1,000-product / 1,000-invoice / 1,000-customer run recorded in the previous report (e.g. 4.38 s to post 1,000 invoices, 21 ms median cashier-state read, 2.2 s encrypted backup of 7.4 MB). Those measurements are **not re-verified here** and should be treated as one observation on a Linux host, not a Windows budget.

What this session did measure: the full repository verification suite runs in ~48 s, the production web build in ~47 s, and the desktop renderer build in ~0.3 s on 2 vCPU.

Two known envelope limits, from inspection: the catalogue caps at **5,000 products** (`CatalogFull`), so a 10,000-SKU promise is unsupported; and there is no indexed native catalogue search, so search at that cap is linear.

---

## 9. Changes made in this increment

Three commits on `arena/1509737c-dukaanos` (fast-forwarded to the #131 head, not merged anywhere):

| Commit | Content |
| --- | --- |
| `ba0b9d5` | `scripts/verify-local-schema.py`, `scripts/verify-desktop-contract.mjs`, `scripts/verify-native-money.mjs`, `packages/local-store/fixtures/schema-fingerprint.json`, `package.json` wiring, `__pycache__` ignore |
| `8fd6c14` | Upgrade-path verification from the frozen schema-4 fixture (92 checks) |
| (this report) | `docs/reviews/independent-audit-2026-10-31.md` + evidence directory |

No application source changed. No schema changed. No migration was edited or renumbered. No test was weakened, skipped or ignored. No dependency was added (the three scripts use only Node, Python's standard library and TypeScript's existing compiler). `package.json` gains three `verify:*` scripts and three entries in the `verify` chain — additions only.

---

## 10. What is still unknown, stated plainly

* Whether the Rust test suite passes **on this commit**. It cannot be executed here; the last native execution on record is from another host, for the parent commit.
* Whether SQLCipher encryption, wrong-key refusal and restart behaviour hold on any machine — no SQLCipher here.
* Whether the 48 Tauri commands behave correctly across the IPC boundary — statically proven wired, never executed.
* Whether the installer installs, upgrades, preserves data, or uninstalls cleanly — no Windows, no installer.
* Whether a shop PC of realistic spec performs acceptably — no hardware, no native execution.
* Whether main's branch protection prevents an unsafe merge — API returns 403, unverified.
* Whether any of the 40 adversarial cases in the parent report still hold on the #131 head — most of them are Rust tests that cannot be re-run here.

Every one of those is a verification gap, not a defect claim, and none is a pass.

---

## 11. Recommendation

| Level | Decision |
| --- | --- |
| Continue development on this core | **YES.** The financial core, authorization model and append-only settlement design are sound and worth preserving. |
| Controlled internal testing, synthetic data | **YES**, with the limits in this report stated to testers. |
| Supervised real-shop pilot | **NO-GO.** C1 and C2 are open; H1 (cash + credit split) and H2 (GST invoice) are unresolved; no installer exists. |
| Commercial rollout | **NO-GO.** A pilot is not yet approved. |

Order of work, by what unblocks the most:

1. **Restore Actions billing and get one green Windows run** on this head. Nothing else can be trusted as "released" until the native suite and the installer build have actually executed. No code change is required.
2. **Run the native suite on a host with Rust + SQLCipher** and attach the log, to close the "unexecuted here" rows in §6.
3. **Close H1 (cash + credit split)** as a single transactional change inside `post_into`, with regression tests for allocation and rounding, since it is the most common real counter scenario that currently cannot be recorded truthfully.
4. **Then decide H2 (statutory GST)** — it is a product/legal decision before it is engineering.
5. **Then, and only then, the LAN transport** (C2), reusing the existing hub authority rather than the older #126 transport, and never sharing a live SQLite file over the network.
6. Housekeeping with no pilot value but real confusion cost: mark or archive `desktop/windows` (M1), and make the business time zone a tested setting (M2).

**Decision: not ready for a controlled real-shop pilot. The engineering to get there is mostly present; the evidence to certify it is not, and the missing evidence is at the target platform, not in the source.**
