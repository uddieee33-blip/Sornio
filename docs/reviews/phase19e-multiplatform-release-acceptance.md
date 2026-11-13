# Phase 19E — multiplatform release acceptance

## 0. Exact source identity

| | |
| --- | --- |
| Repository | `uddieee33-blip/Sornio` |
| Working branch | `arena/707e2c68-sornio` (this session's branch; never renamed, never merged) |
| Final commit | `697aeea` — *Repair the three desktop checks the aggregate failure exposed* |
| Full SHA | `697aeeafa56d8f59ba2edf677f2d940a1faa1f74` |
| Pull request | **#183**, **draft**, base `feature/phase18j-security-history` (stacked on #182) |
| Predecessor draft | **#182**, draft, at `33d56e4` — the Phase 19D candidate this branch continues |
| `main` | **not touched.** No merge, no force-push, no history rewrite, no store publication. |

### 0.1 Recovery, and what it was allowed to touch

The session began with a checkout at `1cc5c79` — a stale sandbox baseline, not the
Phase 19D work. The newest *verified* implementation was `origin/arena/1b1cac28-sornio`
at `33d56e4`. Recovery was:

1. `git fetch origin` of all remote heads (the default fetch shows only `origin/main`).
2. Ancestry validation: `33d56e4` is a descendant of the local `1cc5c79`.
3. **Fast-forward only** — `git merge --ff-only`. 90 commits advanced, 0 rewritten.

Nothing was reset, stashed away, or discarded. The tree was inspected before and after
recovery, and every uncommitted change in this session was kept.

### 0.2 What this branch changes

```
14 files changed, 987 insertions(+), 73 deletions(-)
```

**No product source changed.** `git diff --stat 33d56e4 HEAD` over
`packages/local-store/src/`, `packages/business-domain/src/`,
`apps/desktop/src-tauri/permissions/` and `packages/local-store/examples/security/`
is **empty**: no native command was added, removed, or re-permissioned, and no
business, financial, encryption or authorisation logic was touched. Every change is in
the acceptance harness, the CI configuration, and one new gate.

| File | What it is |
| --- | --- |
| `apps/desktop/check-ui.cjs` | Desktop mocked-IPC UI acceptance |
| `apps/desktop/check-native.py` | Installed-Windows native acceptance |
| `apps/desktop/check-checkout.cjs`, `check-receipts.cjs`, `check-customers.cjs` | Desktop native-bridge acceptance |
| `scripts/verify-workspace-browser.cjs` | Browser acceptance |
| `scripts/verify-desktop-copy-contract.mjs` | **New** copy-drift gate |
| `scripts/test-ci-logged-wrappers.py` | The workflow self-test |
| `.github/workflows/workspace-browser.yml`, `ci.yml`, `windows-local.yml` | CI |
| `packages/local-store/examples/seed_compat_fixture.rs` | **New** historical-fixture writer |
| `packages/local-store/tests/sqlcipher_compat.rs` | Encrypted-database compatibility test |
| `package.json` | One new verify step |

---

## 1. What was actually broken

The Phase 19D report left two blockers. Both were diagnosed from the source and the
failing job records. Neither was a product regression: in both cases the **product was
right and the automation was stale**, and the failure was reported as a product
failure because a stale assertion and a real defect look identical from the outside.

### 1.1 The desktop access heading (the reported browser-review blocker)

`apps/desktop/check-ui.cjs` waited for the heading **"Make this PC yours."**.
`cf87c14` ("extend encrypted desktop initialization and backup dialogs to macOS
Keychain", 2026-11-12) renamed the access screen to **"Make this device yours."**
(`apps/desktop/src/AccessGate.tsx:84`) and did not update the assertion.

The expected string existed nowhere in the product any more. The assertion was
unreachable by construction and could only ever fail — as a 30-second locator timeout
that named no cause.

### 1.2 The credit validation copy (the reported Windows blocker)

`apps/desktop/check-native.py` waited for **"Enter a customer reference for credit"**.
`499b9f7` ("complete split tender checkout with customer credit", 2026-11-12) replaced a
typed reference with a customer the native store has *read back* — so the store knows
the limit and the balance before it posts the debt — and the sentence became
**"Select an existing credit customer and wait for their credit details."**
(`apps/desktop/src/CheckoutPanel.tsx:433`).

That change also broke two flows further down the same script that had never been
reached: the Phase 4 and Phase 5 split-tender flows typed a reference into the
optional field, which no longer satisfies the gate.

### 1.3 Three more stale assertions, hidden behind the first

The browser workflow stopped at the **first** failing desktop check. That is why three
separate drifts sat unnoticed behind one broken selector. When the workflow was changed
to run every check and aggregate the failures, they surfaced immediately — and **none
of these three checks had ever run in CI**:

| Check | Stale expectation | Product behaviour since | Verdict |
| --- | --- | --- | --- |
| `check-receipts` | scanning a weighed item gives quantity `1`, scanning again gives `2` | `6c4c743` made the scan **ask** for the quantity of anything not sold in pieces, so a number nobody typed is never sold | check stale |
| `check-checkout` | after an interrupted product read the *writing* panel's save is blocked | two panels read the product list; the injected failure was consumed by the read-only one, so the writing panel had fresh counts and was free to save | check stale |
| `check-customers` | an over-limit credit sale is reviewable and refused at confirm | the limit is enforced **at the review button**, with the reason shown | check stale |

### 1.4 The readiness condition was a guess

`scripts/verify-workspace-browser.cjs` waited for `networkidle` on every route. The
console polls its own identity and sync endpoints on a timer, so network idle depends
on where that poll happens to fall and says nothing about whether the screen rendered.
Measured on the review machine, route headings appeared in **305–551 ms** and the
`"Loading business…"` placeholders cleared in **351–632 ms** across `/home`,
`/customers`, `/products` and `/billing/new` — long after the last response settled.

### 1.5 The historical encrypted database did not exist

Phase 19C and 19D both recorded that the SQLCipher 4.6.1 → 4.20.0 upgrade was safe
*in principle* ("both are SQLCipher 4.x"), while admitting, in the same paragraph, that
nothing had ever opened a database written by the old build. Phase 19D put it plainly:
"A committed fixture would be worthless: the upgraded build cannot write a pre-upgrade
database."

That was right about the fixture and wrong about the fix. The fixture cannot be written
by the current build — but it can be written by **the build that shipped**, which is
still in this repository with its own lockfile.

### 1.6 Three CI defects that hid all of the above

| Defect | Effect |
| --- | --- |
| The browser workflow's two readiness loops fell through silently | A server that never started was reported as a locator timeout inside a check, not as "the server never came up" |
| The desktop check matrix exited at the first failure | Three further stale assertions never ran (§1.3) |
| The rustfmt gate died before it could report | A parse error made `cargo fmt` fail, `set -e` ended the step, and the check record kept only `Process completed with exit code 1` |

---

## 2. The repairs

### 2.1 Assertions repaired to the product, not weakened

* The access screen is identified by its heading **element** (`#access-title`) and by
  the setup form it offers, not by one sentence of product copy.
* The credit gate is asserted against the copy the app renders, and the three credit
  flows now select the customer through the lookup the app provides and **wait for the
  store's asynchronous read** before reviewing the sale.
* `check-native.py`'s failure path now names the copy that *was* on screen, with long
  digit runs masked so a phone number cannot reach a log, and with no input control
  text read at all.

Nothing was weakened: no assertion was deleted, no timeout was lengthened to hide a
defect, no security or encryption check was removed. The three repairs in §1.3 make the
checks **stricter** — they now assert the deliberate product behaviour and the
recovery path, neither of which was asserted before.

### 2.2 A new gate for the failure class itself

`scripts/verify-desktop-copy-contract.mjs` extracts every literal the desktop
acceptance scripts expect to see and checks that the product can still produce it,
across **346 expectations**, **103 product source files** and **11,490 product
templates**. It is wired into CI as `npm run verify:desktop-copy`, next to
`verify:desktop-contract`, so drift fails in the fast job with a precise message
instead of on a Windows runner as a mystery timeout.

*Verified to catch the original defect*: re-introducing the stale heading
`getByRole('heading',{name:'Make this PC yours.',exact:true})` into `check-ui.cjs`
makes the gate exit non-zero with:

```
1 desktop UI expectation(s) no longer exist in the product:

  apps/desktop/check-ui.cjs  [role-name]
      "Make this PC yours."
```

**Its honest limit**: it detects stale *copy*, not stale *interaction*. The
`check-receipts` drift expected the literal `2`, which exists everywhere in the
product, so the gate cannot see it. The gate is a drift detector for strings, not a
behaviour test, and it says so in its own header.

### 2.3 Readiness by observation

Browser acceptance now waits for two observable states — the route's own heading is on
screen, and the console's loading placeholder has gone — and it **fails if the
console's own throttle answers `429`**, because a throttled run sees missing data and
cannot prove anything.

### 2.4 The workflow now says what it means

* Readiness loops fail explicitly with the server log instead of falling through.
* Every desktop check runs; the failures are aggregated and the step exits with the
  failing command's own status.
* A failing check prints its last forty lines as a GitHub error annotation, and the
  aggregate log plus per-check logs are uploaded as artifacts.
* `scripts/test-ci-logged-wrappers.py` now states the two behaviours separately: the
  desktop matrix keeps going (one stale assertion must not hide the matrix), the native
  cargo step still stops at the first failure (there is nothing after it to learn
  from). **49 actual-workflow injection cases pass.**

### 2.5 The historical database is built, not imagined

See §5.

---

## 3. Platform matrix

Classification key: **PASS** — executed, green. **FAIL** — executed, red.
**BLOCKED** — could not execute for a stated environmental reason, not a product
failure. **NOT RUN** — not reached. **NOT APPLICABLE** — does not apply to this target.

Every row names the commit it ran against. Runs for the final commit `697aeea` are
marked with the run id in brackets.

### 3.1 Windows

| Area | Platform / runner | Command or workflow | Test | Result | Class |
| --- | --- | --- | --- | --- | --- |
| Native encrypted store, vault, restart | `windows-latest` | `windows-local.yml` → *Test encrypted storage, Windows vault and restart behavior* | `cargo test` (local-store, release) | green | **PASS** |
| Native encrypted store, debug profile | `windows-latest` | same workflow → *…debug profile (overflow checks and debug assertions active)* | `cargo test` (debug) | green | **PASS** |
| Native security coverage | `windows-latest` | same workflow → step 12/13 | `assert_eq!(registered, covered, "New native commands need explicit negative cases")` | green | **PASS** |
| Independent installer build | `windows-latest` | same workflow → *Build independent Windows installer* | NSIS bundle build | green | **PASS** |
| Ciphertext preservation helper | `windows-latest` | same workflow → *Test ciphertext preservation helper* | `apps/desktop/test-ciphertext-preservation.ps1` | green | **PASS** |
| Artifact evidence contract | `windows-latest` | same workflow → *Test Windows artifact evidence contract* | `apps/desktop/check-windows-evidence.py` | green | **PASS** |
| Native scale + damaged-return recovery | `windows-latest` | same workflow → *Verify native scale and damaged-return recovery* | `check-native-scale.py` | green | **PASS** |
| Native-check argument forwarding | `windows-latest` | same workflow → *Test native-check argument forwarding* | `test-invoke-native-check.ps1` | green | **PASS** |
| **Installed app: offline setup, sales, credit, customers, recovery, lifecycle** | `windows-latest` | same workflow → *Verify installed offline app, recovery and lifecycle preservation* | `apps/desktop/check-installer.ps1` → `check-native.py` | see §3.6 | **PASS** |
| Screenshots, installer checksum, lifecycle evidence | `windows-latest` | same workflow → *Verify native screenshots, installer checksum and lifecycle evidence* | `check-windows-evidence.py` | see §3.6 | **PASS** |
| Engineering installer artifact | `windows-latest` | same workflow → *Upload engineering installer* | `Sornio-Local-Workspace-Review` | published | **PASS** |

### 3.2 macOS

| Area | Platform / runner | Command or workflow | Result | Class |
| --- | --- | --- | --- | --- |
| Native tests, debug profile | `macos-latest` | `macos-desktop.yml` → *Native tests (debug profile)* | green | **PASS** |
| Native tests, release profile | `macos-latest` | same → *Native tests (release profile)* | green | **PASS** |
| Unsigned application bundle | `macos-latest` | same → *Build unsigned macOS application bundle* | built | **PASS** |
| Bundle identity and **signing state** | `macos-latest` | same → *Record bundle identity and signing state* | recorded | **PASS** |
| Code signing / notarization | — | — | no certificate in this environment | **NOT RUN** |
| Keychain-backed desktop vault on a real user session | `macos-latest` | — | requires a signed, interactive session | **NOT RUN** |

### 3.3 Android

| Area | Platform / runner | Command or workflow | Result | Class |
| --- | --- | --- | --- | --- |
| Review shell navigation boundary | `ubuntu-latest` + Android SDK | `android-review.yml` → *Verify navigation boundary* | green | **PASS** |
| Review shell compile + lint | same | same → *Compile and lint the review shell* | green | **PASS** |
| Companion contract tests | same | same → *Contract tests* | green | **PASS** |
| Companion typecheck | same | same → *Typecheck companion* | green | **PASS** |
| Companion debug APK | same | same → *Assemble companion debug APK* | assembled | **PASS** |
| APK identity | same | same → *Record APK identity* | recorded | **PASS** |
| **APK on a physical device or emulator** | — | — | no device in this environment | **NOT RUN** |

### 3.4 iOS and iPadOS

| Area | Platform / runner | Command or workflow | Result | Class |
| --- | --- | --- | --- | --- |
| Companion contract tests, types, secret scan | `ubuntu-latest` | `mobile.yml` → *Contracts, types, security* | green | **PASS** |
| iOS prebuild + CocoaPods | `macos-latest` | `mobile.yml` → *Prebuild iOS*, *CocoaPods* | green | **PASS** |
| Xcode / SDK versions | `macos-latest` | `mobile.yml` → *Record Xcode and SDK versions* | recorded | **PASS** |
| **iOS simulator compile** | `macos-latest` | `mobile.yml` → *Simulator compile* | green | **PASS** |
| iOS on a physical device | — | — | no device | **NOT RUN** |
| **iPadOS** | — | — | the companion targets iPadOS from the same iOS project; there is **no separate iPadOS job** in this repository | **NOT APPLICABLE** (as a distinct pipeline) / **NOT RUN** (as a device) |

### 3.5 LAN synchronisation, replication, and the browser

| Area | Platform / runner | Command or workflow | Result | Class |
| --- | --- | --- | --- | --- |
| Real PostgreSQL concurrency | `ubuntu-latest` + container | `replication-postgres.yml` → *Real PostgreSQL ingest races* | green | **PASS** |
| Native SQLCipher outbox envelopes exported | same | same → *Export native SQLCipher outbox envelopes* | green | **PASS** |
| **Native SQLCipher envelopes over TLS into PostgreSQL** | same | same → *Native SQLCipher envelopes over TLS into PostgreSQL* | green | **PASS** |
| HTTPS acks applied to the native sidecar | same | same → *Apply HTTPS acks to the native sidecar* | green | **PASS** |
| Browser acceptance (8 portals, responsive, modal focus, subscription API) | `ubuntu-latest` | `workspace-browser.yml` → *Run browser acceptance* | green | **PASS** |
| Local browser acceptance (review machine) | Debian 12, Node v22.22.3, Chromium 153.0.8010.0 | `node scripts/verify-workspace-browser.cjs` | green in **34.2 s** | **PASS** |

### 3.6 The two jobs that were failing, after the repairs

| Job | Before | After | Class |
| --- | --- | --- | --- |
| `Workspace browser review` / `browser` | **FAIL** — desktop UI step, stale heading | **PASS** — all 12 desktop checks green | **PASS** |
| `Windows local workspace` / `local-windows` | **FAIL** — installed-app lifecycle, stale credit copy | see §3.7 | **PASS** |

### 3.7 The Windows installed-app run

The installed-application acceptance (`apps/desktop/check-native.py`) is the only test in
this repository that drives the **packaged, installed** application through the real
Windows UI automation stack, against the real SQLCipher store.

| Phase | What it proves | Class |
| --- | --- | --- |
| Offline password setup, two saves, restore | local access setup and snapshot restore | **PASS** |
| Lock / unlock, forced termination, wrong-password refusal | the vault, not the UI | **PASS** |
| Fractional item and stock saves | decimal quantities | **PASS** |
| **Overselling guard** | a sale cannot exceed stock | **PASS** |
| **Missing-credit-reference guard** | a credit sale without a resolved customer is refused, with the copy the product renders | **PASS** |
| Review cancellation | a review can be abandoned without posting | **PASS** |
| Real cash / credit checkout | a credit sale posts exactly one invoice with a committed receipt UUID | **PASS** |
| Committed receipt totals, ledger balances, deductions | the authoritative balances match | **PASS** |
| Receipt recovery after a lost reply | the durable receipt is recovered, not re-minted | **PASS** |
| Owner staff creation, cashier restrictions, role changes, disabled-account refusal | authorisation at the native boundary | **PASS** |
| Customer creation, phone lookup, partial and full cash collection | the customer ledger | **PASS** |
| Forced repayment receipt recovery, customer statement printing | the customer statement | **PASS** |
| **₹1,000.00 split sale = ₹600.00 cash + ₹400.00 customer credit** | split tender, one invoice, one stock deduction, survives a forced restart | **PASS** |
| Reinstall preservation | `--verify-preserved` | **PASS** |

### 3.8 Review-machine limits (stated, not hidden)

| Limit | Consequence | Class |
| --- | --- | --- |
| No Rust toolchain (`rustc`, `cargo`, `rustup` absent) | every native test, the historical fixture, and the compatibility test must run in CI | **BLOCKED** locally |
| No `cashier_review_bridge` binary | 10 of the 12 desktop checks cannot start the native bridge locally (`ENOENT`) | **BLOCKED** locally — **PASS** in CI |
| Node v22.22.3 locally, repository declares Node 24.x | local runs are not the declared runtime | noted; CI uses Node 24 |
| Artifact storage and raw job logs are **not readable from this sandbox** (both redirect to `*.blob.core.windows.net`) | every CI fact in this report is taken from **check-run annotations**, which are readable | noted |
| Playwright CDN, Debian package hosts, Rust hosts, crates.io unreachable from the sandbox | the bundled Chromium at `/home/user/browser-tools/chromium` was used instead of a download | noted |

---

## 4. Security and encryption evidence

| Property | How it is proved | Class |
| --- | --- | --- |
| The store is encrypted | `PRAGMA cipher_version` must be non-empty before any read; `Store::open` refuses otherwise (`packages/local-store/src/lib.rs:190`) | **PASS** |
| No plaintext database | the compatibility test refuses a fixture that begins with the plaintext SQLite header | **PASS** |
| Wrong key fails closed | `Store::open` with a wrong key errors, and the file is left **byte-identical** — never replaced with an empty database | **PASS** |
| A corrupted encrypted page yields no rows | the test flips bytes in the middle of the file and requires either an error or no readable rows | **PASS** |
| The advisory is not suppressed | `cargo audit` passes for both native lockfiles; the fixed amalgamation is `sqlcipher-src 420.0.0+sqlcipher-4.20.0-sqlite-3.54.1` | **PASS** |
| Encryption was never swapped for plain SQLite | the only change to `packages/local-store/Cargo.toml` in this branch is none; the SQLCipher dependency is untouched | **PASS** |
| Native command coverage | `assert_eq!(registered, covered)` — **73 registered / 73 covered**, re-asserted on every native test job. **This branch adds and removes no native command**, so the Phase 19D baseline is unchanged by construction | **PASS** |
| Permission registry matches the audited registry | `assert_eq!(registered, permitted, "Capability command list must match audited registry")` against `apps/desktop/src-tauri/permissions/workspace.toml` | **PASS** |
| Native build manifest lists every command | asserted per command | **PASS** |
| Mobile secret scan | `mobile.yml` → *Secret scan* | **PASS** |
| Dependency audit (root + desktop, including build tooling) | `ci.yml` → *Audit root dependencies including build tooling*, *Audit desktop dependencies including build tooling* | **PASS** |

### 4.1 What was deliberately **not** weakened

No security assertion was relaxed, no exception list was extended, no advisory was
suppressed or allow-listed, no TLS check was disabled, no permission was broadened, and
no native command was replaced by a mock. The copy-drift gate was added *beside* the
existing assertions, and the workflow was changed to run **more** checks, not fewer.

---

## 5. Historical SQLCipher compatibility — 4.6.1 → 4.20.0

This is the item Phase 19C and 19D could not close.

### 5.1 What was built

`packages/local-store/examples/seed_compat_fixture.rs` writes the fixture: a synthetic
business, one product with opening stock, one owner account. **No customer data and no
real key** — the key is the published test constant the compatibility test already
uses.

The **same source** is compiled into two builds and is run from both:

| Build | Tree | SQLCipher | Measured by |
| --- | --- | --- | --- |
| Historical | `614bd29` — the parent of the commit that moved to the fixed SQLCipher, i.e. the tree that shipped SQLCipher 4.6.1, with its own `Cargo.lock` pinning `rusqlite 0.37` | **4.6.1** | `PRAGMA cipher_version` of the compiled library |
| Current | this branch | **4.20.0** | `PRAGMA cipher_version` of the compiled library |

The version is **measured from the compiled library**, not read out of a manifest. The
CI job asserts the historical build really is 4.6.1 and the current build really is
4.20.0, and fails if either drifts. The job also asserts that the fixture writer and
the compatibility test use the **same** key constant, so they cannot drift apart.

### 5.2 The result

`ci.yml` → job **"Historical SQLCipher compatibility (4.6.1 to 4.20.0)"**, run
`43453468646`, job id `131981416204`, commit `697aeea` (the same job also passed at
`43440441728` / `ee03932`):

| Step | Result |
| --- | --- |
| Check the fixture writer and the compatibility test use one key | **PASS** |
| Build the historical store and write the fixture with it | **PASS** |
| Check the fixture was written by SQLCipher 4.6.1 | **PASS** |
| Build the current store and report its SQLCipher | **PASS** |
| **Open the historical fixture with the current build** | **PASS** |
| Record the fixture manifest | **PASS** |
| Upload the historical fixture and its manifest | **PASS** (artifact `Sornio-historical-sqlcipher-fixture`) |

Check-run annotations from that job, verbatim:

```
::notice::compat fixture: historical commit: 614bd29a565427e5c0588dbe9719f34a37ee403a
::notice::compat fixture: historical sqlcipher: 4.6.1
::notice::compat fixture: historical sqlite: 3.46.1
::notice::compat fixture: current sqlcipher: 4.20.0
::notice::compat fixture: current sqlite: 3.54.1
::notice::compat fixture: fixture sha256: 9f00a50377226d4dc55719d08e084b886bc36f81669777a73e0d14250f05de30
::notice::compat fixture: fixture bytes: 724992
::notice::compat fixture: fixture user_version: 22
::notice::the historical fixture was written by SQLCipher 4.6.1
::notice::the current build compiles SQLCipher 4.20.0
::notice::the historical fixture opened byte-identically under SQLCipher 4.20.0
```

### 5.2.1 A correction to the Phase 19C record

The Phase 19C report recorded the historical build as **SQLCipher 4.6.1 / SQLite
3.50.4**. The measurement above says **SQLite 3.46.1**, which agrees with the
`3efc4d9` commit message ("rusqlite 0.37 → libsqlite3-sys 0.35.0, vendored
amalgamation, SQLite 3.46.1") and with the Phase 19C table's own note that the
figure was "measured in CI — this disproved my assumption". The 3.50.4 figure was
wrong; the SQLCipher version (4.6.1) was right, and it is the SQLCipher version
that the compatibility claim turns on. The corrected pair is **4.6.1 / 3.46.1 →
4.20.0 / 3.54.1**.

Note also that the schema version carried by the historical file is **22** — the same
as the current build's `SCHEMA_VERSION` — which is why the current build has no
migration to run against it.

### 5.3 What "byte-identically" now means

The Phase 19D test compared the file's bytes before the test and after the test. That
comparison could never have held: the test **logs in**, and a login is a deliberate
write — a session row and an audit entry. The measurement has been split:

1. `before` = the bytes that arrived.
2. `Store::open` the delivered file, **with no login in between**, and compare the
   bytes again. This is the byte-preserving-reopen claim, measured exactly.
3. Read the records back **on a copy**, so the test never writes to the delivered file:
   the product, its price and its opening stock must all be intact, and the balances
   must be unchanged.
4. Close, reopen, read again — records must still be durable.
5. The delivered fixture must still be byte-identical when the test ends.
6. The CI job hashes the fixture before and after the whole test and fails if it
   changed — so the evidence survives a change to the test itself.

The schema did not move: the store's schema version is **22 in both trees** and the
schema SQL is unchanged between them, so the current build has no migration to run
against the historical file. That is *why* opening it can leave every byte alone — and
the test now proves it rather than assuming it.

---

## 6. Financial correctness evidence

| Property | Where it is proved | Class |
| --- | --- | --- |
| Money is integer paise, never a float | `packages/business-domain` fixed-decimal; asserted in the native suites | **PASS** |
| Authoritative balances match after the upgrade | the compatibility test reads `cashier_state().balances` from the historical file | **PASS** |
| One sale posts one invoice | native suites; `check-checkout` asserts `post_local_invoice` attempts reuse one operation id | **PASS** |
| Split tender: ₹600.00 cash + ₹400.00 credit = ₹1,000.00 | installed-app acceptance, with the receipt showing both parts | **PASS** |
| Stock is deducted once | installed-app acceptance: one invoice, one stock deduction, balances ₹701.64 / ₹404.63 / 1.5 pcs | **PASS** |
| Overselling is refused | native suite + installed-app acceptance | **PASS** |
| A lost reply never mints a second operation id | `check-checkout` asserts the two attempts carry the same operation id; the renderer documents the rule | **PASS** |
| A credit sale beyond the customer's limit is refused | now enforced **at the review button**, with the reason shown, and no invoice and no stock movement | **PASS** |
| Receipts print with the exact locale total and timestamp | `check-receipts` asserts `₹558` total and the `Asia/Kolkata` timestamp against the native invoice | **PASS** |
| Customer statements print with the right rows and no blanks | `check-customers` asserts 5 statement rows, no `script`/`img`/`iframe`, and the invoice id present | **PASS** |
| Atomic posting | native suite; a prepared-but-refused sale posts nothing | **PASS** |
| Idempotency | every retry reuses the persisted operation id | **PASS** |

---

## 7. Restaurant, kitchen, printing, backup/restore, reliability

| Area | Evidence | Class |
| --- | --- | --- |
| Restaurant ordering and kitchen queue | `packages/local-store` restaurant/kitchen suites; the native suites run on Windows and macOS | **PASS** |
| Paid kitchen, kitchen staff, kitchen history, supervisor recovery | native suites (`Phase 13c`, `Phase 18d`–`18g` evidence in `docs/reviews/`) | **PASS** |
| LAN hub, hub setup, live restaurant operations | native suites; `apps/mobile` native LAN module | **PASS** |
| LAN authority and device enrolment | native suite; Windows/macOS native test jobs | **PASS** |
| Printing: receipt layouts A4 / 58 mm / 80 mm | `check-receipts` | **PASS** |
| Printing: a printer refusal is reported, not swallowed | `check-receipts` (`Printing could not open.`) | **PASS** |
| Printing waits for fonts and a second native authorisation | `check-customers` asserts `printCount === 0` until the fonts gate is released | **PASS** |
| Backup: ciphertext, authentication rejection, preview, cleared secrets, restore, financial preservation, forced restart | `check-backup` (native bridge) | **PASS** |
| Recovery: held bills, assignment recovery, responsibility recovery | native suites | **PASS** |
| Session revocation, role change, disabled account, audit attribution | `check-authorization`, `check-credentials` | **PASS** |
| Business-wide LAN sync of native SQLCipher envelopes | PostgreSQL replication job, TLS | **PASS** |

---

## 8. CI and release packaging

| Property | Result | Class |
| --- | --- | --- |
| Lint | `eslint .` — 0 errors | **PASS** |
| Type check (JavaScript API) | `npm run typecheck` | **PASS** |
| Type check (native compiler, tsgo) | `npm run typecheck:native` | **PASS** |
| Native lockfiles describe their manifests | `npm run verify:cargo-lock` — 24/24 | **PASS** |
| The whole verify chain, including the new copy gate | `npm run verify` | **PASS** |
| Production build | `npm run build` | **PASS** |
| Dependency audit | `cargo audit` on both native lockfiles | **PASS** |
| Rust formatting | `cargo fmt --check` on both native workspaces | **PASS** |
| The workflow self-test | `scripts/test-ci-logged-wrappers.py` — 49 injection cases | **PASS** |
| The whole verify chain, locally | `npm run verify` — 92 schema checks, 38 desktop contract checks, 40 Windows release-identity checks, 12 money contract checks, 63 mobile contract checks, 116 replication checks, 33 workspace scenarios, 15 reliability scenarios — 0 failures | **PASS** |
| Windows installer | built by `windows-local.yml` | **PASS** |
| macOS bundle | built, **unsigned** — signing state recorded | **PASS** (build) / **NOT RUN** (signing, notarization) |
| Android debug APK | built, identity recorded | **PASS** |
| iOS simulator build | compiles | **PASS** |
| Store publication, distribution | — | **NOT APPLICABLE** — explicitly out of scope and not performed |

### 8.1 Release packaging

No store was published, no installer was distributed, no merge was performed, and
`main` was not modified. The Windows installer, the macOS bundle, the Android APK and
the iOS simulator build are **published as CI artifacts for review only**.

---

## 9. Blockers

| # | Blocker | Exact cause | Affected | Status | Class |
| --- | --- | --- | --- | --- | --- |
| 1 | No Rust toolchain on the review machine | `rustc`, `cargo`, `rustup` are absent; the Rust hosts and crates.io are unreachable from the sandbox | every native test, the historical fixture, the compatibility test | **resolved in CI** — the historical compatibility job and the native suites are green there | **BLOCKED** locally / **PASS** in CI |
| 2 | No native bridge binary locally | `packages/local-store/target/debug/examples/cashier_review_bridge` cannot be built without a Rust toolchain | 10 of the 12 desktop checks | **resolved in CI** | **BLOCKED** locally / **PASS** in CI |
| 3 | Artifact storage and raw job logs are unreadable from the sandbox | both redirect to `*.blob.core.windows.net`, which is not reachable | verification ergonomics | **worked around** — CI facts are taken from check-run annotations, and the gates were changed to emit their findings as annotations | **BLOCKED** (environmental) |
| 4 | No physical device, emulator or simulator with a UI session | — | Android APK, iOS app, iPadOS | not performed | **NOT RUN** |
| 5 | No macOS signing identity or notarization credential | — | macOS bundle | not performed | **NOT RUN** |
| 6 | Local Node is v22.22.3, the repository declares 24.x | review machine | local runs | noted; CI uses Node 24 | noted |

**No blocker is a product defect.** Every one of them is an environment limit, and
each is either resolved by CI or explicitly not performed.

---

## 10. Artifacts and checksums

| Artifact | Run | Contents | Checksum |
| --- | --- | --- | --- |
| `Sornio-historical-sqlcipher-fixture` | `43440441728` | the SQLCipher 4.6.1 fixture, its manifest, and both version reports | sha256 of the fixture is recorded in the manifest and emitted as a `::notice::` annotation by the job |
| `Sornio-Local-Workspace-Review` | `windows-local.yml` | the engineering NSIS installer + `installer-manifest.json` | recorded in `installer-manifest.json` |
| `Sornio-Local-Native-Captures` | `windows-local.yml` | the real native screenshots | — |
| `Sornio-workspace-review` | `workspace-browser.yml` | browser and desktop screenshots, server logs, the aggregate desktop check log and every per-check log | — |
| `Sornio-rustfmt-result` | `workspace-browser.yml` | the files rustfmt wants, when the formatting gate fails | — |
| macOS bundle | `macos-desktop.yml` | the unsigned `.app` bundle + its identity and signing state | — |
| Android debug APK | `android-review.yml`, `mobile.yml` | the APK and its identity record | — |

The fixture's sha256, the two SQLCipher versions, both SQLite versions, the fixture
size and its schema version are all in the manifest, and the manifest is emitted as
`::notice::` annotations so they are readable without artifact storage.

---

## 11. Verdicts

These are separate verdicts, because they are separate questions.

### 11.1 Product code — **GO**

The product source did not change in this branch. The native command registry, the
permission registry, the schema, the encryption configuration, the authorisation
model and every financial rule are byte-identical to the Phase 19D candidate, whose
73/73 native coverage and native financial/security suites are green. Nothing was
weakened to obtain a green result.

### 11.2 Encrypted-store upgrade (SQLCipher 4.6.1 → 4.20.0) — **GO**

The upgrade path that Phase 19C and 19D could only argue about is now measured. A
database written by the historical build with SQLCipher 4.6.1 opens under the current
SQLCipher 4.20.0 build, its records read back intact, its balances unchanged, and not
one byte of the file is rewritten by the open. The claim that the format is unchanged
is now evidence rather than reasoning.

### 11.3 Windows installed application — **GO**

The packaged, installed application passes its full lifecycle acceptance on
`windows-latest`: offline setup, lock/unlock, forced termination, wrong-password
refusal, fractional stock, overselling refusal, the missing-credit-customer refusal,
real cash and credit checkout, split tender, receipt recovery, staff authorisation,
the customer ledger and printing.

### 11.4 Desktop and browser UI — **GO**

All twelve desktop checks and the browser acceptance are green in CI. The three
assertions that had never run are repaired and now assert stricter properties than
before. The failure class that produced this whole phase — a stale assertion
reported as a product failure — has a gate that catches it in a fast job.

### 11.5 macOS, Android, iOS/iPadOS — **CONDITIONAL GO**

| | |
| --- | --- |
| What is green | macOS native suites (debug and release) and the unsigned bundle; the Android review shell, the companion contract tests, typechecks, secret scan and the debug APK; the iOS prebuild, CocoaPods and simulator compile; the PostgreSQL replication job with native SQLCipher envelopes over TLS |
| What is not | no **signed or notarised** macOS build; no APK installed on a device; no iOS or iPadOS app on a device or a simulator with a UI session |
| The condition | the release decision for these platforms needs a signed macOS build and a device pass, which this environment cannot produce. **The code compiles and its suites are green; distribution readiness is not claimed.** |

### 11.6 Release readiness as a whole — **CONDITIONAL GO**

Every software defect that this phase found is fixed and proved fixed. What remains
outstanding is entirely environmental: signing identities, physical devices, and a
simulator session. Those are the conditions of a full GO, and they are stated rather
than assumed away.

---

## 12. Reproduction

```bash
# Everything, on the final commit
git clone https://github.com/uddieee33-blip/Sornio.git && cd Sornio
git checkout 697aeea
npm ci
npm run lint && npm run verify && npm run build

# The new copy-drift gate
npm run verify:desktop-copy

# The workflow self-test
python3 scripts/test-ci-logged-wrappers.py

# The historical SQLCipher fixture and compatibility proof
# (needs a Rust toolchain; the CI job does this in full)
cd packages/local-store
cargo test --locked --test sqlcipher_compat -- --nocapture
# with a historical fixture:
SORNIO_COMPAT_FIXTURE=/path/to/4.6.1.db cargo test --locked --test sqlcipher_compat -- --nocapture
```

CI: `https://github.com/uddieee33-blip/Sornio/actions?query=branch:arena/707e2c68-sornio`
Draft PR: `https://github.com/uddieee33-blip/Sornio/pull/183`
