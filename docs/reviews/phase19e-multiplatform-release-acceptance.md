# Phase 19E — multiplatform release acceptance

## 0. Exact source identity

| | |
| --- | --- |
| Repository | `uddieee33-blip/Sornio` |
| Working branch | `arena/707e2c68-sornio` (this session's branch; never renamed, never merged) |
| Final **code** commit | `eb181ce` — *Wait for the printer to be called, not for a notice that never clears* — the commit the final matrix ran against |
| Full SHA | `eb181ce7ae1b98f0abc7ca3e9680ffbf440b7e97` |
| Report commits | the commits after `eb181ce` touch **this document only** |
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
17 files changed, 2455 insertions(+), 87 deletions(-)
```

**No product source changed.** `git diff --stat 33d56e4 eb181ce` over
`packages/local-store/src/`, `packages/business-domain/src/`,
`apps/desktop/src-tauri/permissions/` and `packages/local-store/examples/security/`
is **empty**: no native command was added, removed, or re-permissioned, and no
business, financial, encryption or authorisation logic was touched. Every change is in
the acceptance harness, the CI configuration, and one new gate.

| File | What it is |
| --- | --- |
| `apps/desktop/check-ui.cjs` | Desktop mocked-IPC UI acceptance |
| `apps/desktop/check-native.py` | Installed-Windows native acceptance |
| `apps/desktop/check-checkout.cjs`, `check-receipts.cjs`, `check-customers.cjs`, `check-statement-print.cjs` | Desktop native-bridge acceptance |
| `apps/desktop/mock-review-bridge.cjs` | **New** review aid: a mock bridge so a check can be run without a Rust toolchain |
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
(`apps/desktop/src/CheckoutPanel.tsx:434`).

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

### 1.7 And then a fourth defect, of a kind none of the above covered

With those two jobs repaired the browser acceptance still failed — at a different
line, for a different reason, and again **not** because of a product defect.

`scripts/verify-workspace-browser.cjs` filled the customer name with a **global**
placeholder lookup:

```js
await page.getByPlaceholder('e.g. Kiran Malhotra').fill('Theme Review Customer');
```

The product renders exactly **one** customer-name input, at
`app/(console)/customers/page.tsx:100`. Next.js does not render the route once. It
streams the route markup into a hidden container at the end of the document body —
`div#S:0[hidden]` in the server HTML — and drains it once the client has hydrated
and moved that content into the console's own `main` region.

For a short window the document therefore holds **two** copies of the same form:
the live one inside `main#main`, and the parked one in the body-level hidden
container. A global lookup matches both, and Playwright refuses to act on an
ambiguous locator:

```
strict mode violation: getByPlaceholder('e.g. Kiran Malhotra') resolved to 2 elements
```

Measured on the review machine the window is about **115 ms** wide: the parked copy
is present from the first paint, both copies coexist at ~75 ms, and the parked
container is drained at ~190 ms. Whether the acceptance lost that race depends on
how fast the runner hydrates — which is why the *same commit* passed in one run and
failed in the next, and why the failure could not be reproduced by reading the
source.

**This was a test-locator race, not a duplicate in the product.** The source has
one input; the parked copy is the framework's own handover artefact, and the
framework removes it.

Two further routes carry the same hazard. `/subscription` streams a copy that
contains the very plan headings the acceptance looks for — including
*"You are on Starter"* — and the public pages stream a copy as well. A second copy
of a heading is the same failure waiting for the next run.

### 1.8 Two desktop checks that had never actually run

Repairing the browser acceptance (§1.7) let the workflow reach the step it had
always stopped before: **the desktop check matrix**. That matrix had never run
green in CI, because the browser step failed first every single time. When it
finally ran, two of the twelve checks failed — and both failures were in the
automation, not in the product.

**`check-receipts` confirmed a sale with a plain Enter.** It focused the
*"Confirm sale"* button and pressed `Enter`, expecting the sale to be posted. The
product refuses that on purpose. The button cancels the `Enter` keydown and only
confirms for `Alt+Enter` or `Cmd+Enter`, because **a barcode scanner sends
`Enter`**, and a scanner must never post money. The check was asserting the
opposite of a deliberate, safety-relevant product rule.

**`check-checkout` asked for a count the panel was forbidden to show.** The repair
in §1.3 made the injected product read last until the check cleared it, precisely
so that the stock review panel cannot show a count it has never read. Two lines
later the same check asked that panel to display the *refreshed* count — while the
read was still interrupted. The repair and the assertion contradicted each other.

**A third, in the same file, one step further on.** The retail split sale scanned
`RICE` and went straight to the split amounts. Since §1.3 made the scan of a
weighed item *ask* for its quantity instead of inventing one, the cart line had
no quantity, the sale had no preview, and *"Review sale"* stayed disabled — the
check waited on a button that could never be pressed.

None of these three had ever reached that line before: `check-receipts` failed
earlier on a quantity assertion, and `check-checkout` failed earlier on the save
guard. The aggregate matrix is what made them visible at all, one after the
other, each one only reachable once the previous was repaired.

### 1.9 A throttle guard that could not tell a prefetch from a page

The browser acceptance has its own guard: the console throttles its own clients,
and a throttled run sees missing data and stale screens, so it cannot prove
anything about the screens it was meant to review. The guard records every `429`
and refuses to let the run pass.

It fired on a run in which **all three** throttled responses were *speculative
prefetches* of routes the acceptance never opens — `/audit`, `/reports` and the
bare `/subscription`. The console budgets its own prefetches apart from
navigation on purpose: a single visit to `/home` is 45 prefetch requests against
12 real ones, and charging those to the budget a human's click draws on is what
made an owner get *"Too many requests"* on a screen they had asked for. So
refusing a prefetch is the console **behaving as built** — and an acceptance
that opens thirty routes reaches that ceiling by design.

But the guard could not say so, and it failed the run.

### 1.10 A check that named the customer before there was a credit

The split-tender sale in `check-receipts` filled the **customer reference**
first and the **split amounts** second. The product does not offer that field
until the split carries a credit amount — until then there is no credit to
attribute to anybody:

```
const needsCreditCustomer = tender === 'credit' || (tender === 'retail' && allocation.creditPaise > 0);
```

So the field was never on the screen, and the check waited twenty seconds for
a label that was never going to arrive. It is the same class of defect as the
two before it: a check written against the product as it was imagined rather
than as it is built. The order is now the product's — allocate the credit,
then say whose credit it is, then wait for the store's answer about that
customer before opening the review.

### 1.11 A check that could only be discovered one CI round trip at a time

Every one of the defects above was found by the CI matrix, one failure per
round trip, each about twenty minutes. The checks speak to the native store
through a JSON-lines bridge built from Rust, and the review machine has no
Rust toolchain, so a check could not be run locally at all.

That is now avoidable: `apps/desktop/mock-review-bridge.cjs` speaks the same
protocol with a simple, explicit model of the bookkeeping. It is a **review
aid and nothing more** — it proves nothing about SQLCipher, about the
encrypted database, about the real store's permissions, or about any native
behaviour. The real bridge remains the authority and CI always uses it.

What it does is let a check be exercised end to end locally, which is what
found §1.10 immediately, and which now runs the whole receipt check — setup,
keyboard sale, three paper layouts, Punjabi receipt, print cancellation and
retry, browsed and reopened receipts, the split tender, cashier ownership,
revocation during font loading — in about eight seconds.

### 1.12 The one failure that was not a stale assertion, but a stale **wait**

The customer-statement check waited for the notice *"Check the printer or PDF
output."* after a print. That notice is **never cleared**: it stays on the
panel until the next message replaces it. So after the *first* print it is
already on screen, and the wait returns **at once** — before the second print
has called the printer.

The check then compared the printer-call count against a count captured
earlier, and the late print call made the numbers differ: **2 against 1**.

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
2 !== 1
    at apps/desktop/check-statement-print.cjs:102:54
```

This is the only failure in the whole run that was **not** a stale assertion.
It is an *intermittent* one: the very same commit passed the very next matrix
run, which is exactly what makes this class so easy to miss — and so easy to
blame on the platform.

The repair is to wait for the thing that actually happened: **the printer
being called**, counted from the moment before the click. The receipt check had
the same pattern across its three paper layouts, and is repaired the same way.

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

### 2.6 The lookup that cannot match two elements

The repair is **structural**, not a longer timeout.

* The customer form is now looked up **inside the console's live region** — the
  *"Add customer"* card within `.console-workspace main#main`. The parked copy is
  parked *outside* that region, so the scoped lookup **cannot** match it whatever the
  handover timing turns out to be. Measured across cold loads it resolved to exactly
  one element every time, including the loads where the global lookup resolved to two.
* `/subscription` and the public pages now **wait for the handover** before they
  query the document: the acceptance waits until no body-level hidden container still
  holds route markup. The parked copy is present in the server HTML from the first
  byte, so the wait is never a no-op on the routes that stream one.

**Verified by forcing the parked copy to persist.** A body-level hidden container
holding a second copy of the customer form — the same shape, in the same place, as
the real `div#S:0` — was injected into the live document:

| Lookup | Result over 6 forced-duplicate loads |
| --- | --- |
| The previous global `getByPlaceholder('e.g. Kiran Malhotra')` | **6/6 failed** with `strict mode violation: getByPlaceholder('e.g. Kiran Malhotra') resolved to 2 elements` — the exact error the CI run reported |
| The new scoped lookup | **6/6 passed** — filled the field, saved the customer, opened the customer dialog |

The unchanged product build then passed the **unchanged** acceptance script three
consecutive times locally, in 37 s, 34 s and 33 s.

### 2.7 Desktop checks repaired to the product

* **`check-receipts`** now confirms with **`Alt+Enter`**, the deliberate key, and
  additionally asserts the property the product cares about: a plain `Enter` must
  **neither** confirm the sale **nor** reach the store — no prepare, no post.
* **`check-checkout`** now asserts the refreshed count where it can be true. While
  the product read is interrupted, the stock review panel keeps the count it last
  read and the new count is **nowhere on screen**; after the transport recovers
  and the panel re-reads, the new count appears.
* **`check-receipts`' retail sale** now states the quantity the sale is for — one
  kilogram of rice at ₹42.50 a kilogram, which is exactly the ₹42.50 the split
  pays — and asserts first that the scan left the quantity empty, so the reason
  for the fill is stated rather than implied.
* **`check-receipts`' split sale** now allocates the credit **before** it names
  the customer, and then waits for the store's answer about that customer before
  it opens the review. Both halves matter: the field does not exist until there
  is a credit to attribute (§1.10), and the store's lookup waits 150 ms before
  it even asks, so the review refuses to open until the credit details have
  arrived. See §1.10 and §2.9.

All of these were validated against the **real product components** with a mocked
transport, because the native bridge cannot be built on the review machine:

| Property | Measured |
| --- | --- |
| A plain `Enter` on the focused *"Confirm sale"* button | **no** prepare call, **no** post call, no saved sale |
| `Alt+Enter` on the same button | prepare **and** post both issued |
| Stock panel, product read interrupted | shows the count it last read; the unread count is absent |
| Stock panel, after the transport recovers | shows the count it re-read |
| Weighed scan | quantity empty; *"Review sale"* disabled |
| After stating one kilogram | total ₹42.50; *"Review sale"* enabled |

### 2.8 A guard that tells a prefetch from a page

The throttle guard now tells the two apart instead of failing on both:

* A refused **speculative prefetch** is counted and reported. It cannot hide a
  screen — the navigation that follows fetches its own document and its own data,
  and every route the acceptance inspects is waited on until its own heading and
  workspace are on screen, so a screen a refused prefetch had hidden would fail
  the run anyway.
* A throttle on **anything the screens depend on** — the document, a client-side
  navigation, an API read — still fails the run.

The distinction is measured, not assumed: a speculative prefetch carries
`next-router-prefetch: 1`, and a client-side navigation carries no such marker.
Both were observed against the running console.

### 2.9 The credit, then the customer

The split-tender sale in `check-receipts` now allocates the credit before it
names the customer, because that is the order the product offers the field in
— the customer reference exists only once the split carries a credit amount.

Measured against the **real product component** with a mocked transport:

| Step | Measured |
| --- | --- |
| Before any credit is allocated | the customer reference field does not exist (count `0`) |
| After the credit is allocated | the field exists |
| Immediately after the reference is typed | the panel says *"Checking customer credit…"* |
| After the store answers | the panel shows the available credit |
| The review | opens, and shows the ₹400.00 customer credit |
| A plain `Enter` on the review | prepares nothing, posts nothing, saves nothing |
| `Alt+Enter` on the review | prepares **and** posts |

### 2.10 A bridge a check can be run against

`apps/desktop/mock-review-bridge.cjs` is committed so the receipt check can be
run on a machine with no Rust toolchain. It is a **review aid**: an explicit,
simple model of the bookkeeping, speaking the same JSON-lines protocol as
`packages/local-store/examples/cashier_review_bridge.rs`.

It proves nothing about SQLCipher, the encrypted database, the real store's
permissions, or any native behaviour, and the file says so at the top. The
real bridge remains the authority; CI always uses it.

With it, the receipt check ran **end to end, three consecutive times**, in
about eight seconds each — the whole path from setup to the final revocation
during font loading, with no failure.

### 2.11 A wait that waits for the printer, not for a notice

The print waits now count the printer calls from the moment before the click:

```js
const printsBefore = await page.evaluate(() => window.__printCalls);
await button('Print customer statement').click();
await page.waitForFunction(count => window.__printCalls > count, printsBefore);
```

Proved **deterministically** against the real product component, with the font
load held so the printer is not called yet — the same technique the check
itself uses to test a print in flight:

| Step | Measured |
| --- | --- |
| Before the second print | the notice from the first print is **already visible** |
| The notice-only wait returns | the printer is still at **one** call |
| The count-based wait returns | the printer has been called — **two** calls |

So the old wait genuinely accepted the *previous* print, and the new wait
genuinely waits for this one. With the repair, the customer-statement check
passed **five consecutive local runs**, and the receipt check **three**.

---

## 3. Platform matrix

Classification key: **PASS** — executed, green. **FAIL** — executed, red.
**BLOCKED** — could not execute for a stated environmental reason, not a product
failure. **NOT RUN** — not reached. **NOT APPLICABLE** — does not apply to this target.

Every row names the commit it ran against. Runs for the final commit `eb181ce` are
marked with the run id in brackets.

### 3.0 The final matrix, in one place

Commit `eb181ce` — the whole matrix, every workflow, all green:

| Workflow | Run | Result |
| --- | --- | --- |
| CI (lint, typecheck, build, native suites, copy-drift gate, SQLCipher compatibility) | `43491838565` | **PASS** |
| Windows local workspace (native suites, installer, installed-app lifecycle, evidence) | `43491838545` | **PASS** |
| macOS desktop workspace (native suites, unsigned bundle, identity and signing state) | `43491838832` | **PASS** |
| Android review package (APK, contract tests, typecheck, secret scan) | `43491838615` | **PASS** |
| Mobile companion (iOS prebuild, CocoaPods, simulator compile) | `43491838556` | **PASS** |
| Replication PostgreSQL (native SQLCipher envelopes over TLS) | `43491838557` | **PASS** |
| Workspace browser review (browser acceptance **and** all twelve desktop checks) | `43491838574` | **PASS** |

The browser review is the one that carries the desktop matrix: its *Run browser
acceptance* step and its *Build and review local desktop access UI* step both
report `success` on this commit, so the twelve desktop checks — including the
receipt and customer-statement checks repaired here — are green against the
**real** native bridge.

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
| Browser acceptance (8 portals, responsive, modal focus, subscription API) | `ubuntu-latest` | `workspace-browser.yml` → *Run browser acceptance* | green — run `43491838574`, commit `eb181ce` | **PASS** |
| Local browser acceptance (review machine) | Debian 12, Node v22.22.3, Chromium 153.0.8010.0 | `node scripts/verify-workspace-browser.cjs` | green in **37 s, 34 s and 33 s** — three consecutive runs | **PASS** |

### 3.6 The two jobs that were failing, after the repairs

| Job | Before | After | Class |
| --- | --- | --- | --- |
| `Workspace browser review` / `browser` | **FAIL** — desktop UI step, stale heading | **PASS** — all 12 desktop checks green | **PASS** |
| `Windows local workspace` / `local-windows` | **FAIL** — installed-app lifecycle, stale credit copy | see §3.7 | **PASS** |
| `Workspace browser review` / `browser` (again, after the two above were green) | **FAIL** — browser acceptance, strict-mode violation: a global lookup matched the live customer form and the framework's parked copy of it | **PASS** — the lookup is scoped to the live console, so it cannot match the parked copy; see §1.7 and §2.6 | **PASS** |
| `Workspace browser review` / `browser` (again, after the browser acceptance went green) | **FAIL** — the desktop matrix, which had never run past the browser step: two of twelve checks failed | **PASS** — all twelve desktop checks green; see §1.8 and §2.7 | **PASS** |
| `Workspace browser review` / `browser` (again, after the desktop matrix went green) | **FAIL** — the desktop matrix, receipt check: the retail sale scanned a weighed item and never stated a quantity, so *"Review sale"* stayed disabled and the check waited on a button that could never be pressed | **PASS** — the sale states one kilogram, which is exactly the ₹42.50 the split pays; see §1.8 and §2.7 | **PASS** |
| `Workspace browser review` / `browser` (again) | **FAIL** — the desktop matrix, receipt check: the split sale named the customer before there was a credit to attribute, so the field was never on the screen | **PASS** — the credit is allocated first, then the customer, then the store's answer is awaited; see §1.10 and §2.9 | **PASS** |
| `Workspace browser review` / `browser` (again) | **FAIL** — the browser acceptance, its own throttle guard: three **speculative prefetches** of routes the acceptance never opens came back `429`, and the guard could not tell them from a page | **PASS** — a refused prefetch is counted and reported; a throttle on anything the screens depend on still fails the run; see §1.9 and §2.8 | **PASS** |
| `Workspace browser review` / `browser` (again, **intermittently**) | **FAIL** — the desktop matrix, customer-statement check: a print wait that watched for a notice which is never cleared, so it accepted the *previous* print and the printer-call count came out as 2 against 1 | **PASS** — the wait is the printer being called, counted from before the click; the same commit passed the next run, which is what makes the class easy to miss; see §1.12 and §2.11 | **PASS** |

The third and fourth rows are the same failure *class* as the first two — a test
artefact reported as a product failure — but different *kinds* of artefact: not
stale copy, and not a stale selector, but a **global lookup in a document that
legitimately holds two copies of a route for a moment**, and then a **check that
asserted the opposite of a deliberate product rule**. They are recorded here
rather than folded away, because in both cases the same commit had already passed
the same job once.

The last three rows are the same story continued. Each repair made the matrix
get one step further, and each step exposed the next stale assertion — a sale
without a quantity, a customer named before there was a credit, a throttle on a
request the console makes on its own behalf. **Every one of them was in the
automation.** The product's own rules — a scanner must never post money, a
weighed item must be weighed, a credit belongs to a customer, and the console
budgets its own prefetches apart from the ones a person asked for — were
correct in all three cases, and the checks were written against something else.

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
| No `cashier_review_bridge` binary | 10 of the 12 desktop checks cannot start the native bridge locally (`ENOENT`); the mock review bridge (§1.11) can run the receipt and customer-statement checks locally | **BLOCKED** locally — **PASS** in CI |
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
| 2 | No native bridge binary locally | `packages/local-store/target/debug/examples/cashier_review_bridge` cannot be built without a Rust toolchain | 10 of the 12 desktop checks | **resolved in CI**, and **partly resolved locally** by the mock review bridge (§1.11), which can run the receipt and customer-statement checks end to end | **BLOCKED** locally / **PASS** in CI |
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

All twelve desktop checks and the browser acceptance are green in CI. The
assertions that had never run are repaired and now assert stricter properties
than before — a scanner keypress proves it cannot post money, an interrupted
read proves the panel cannot show a count it has never read, a weighed scan
proves it needs a quantity, and a credit split proves it needs a customer
before the review opens. The failure class that produced this whole phase — a
stale assertion reported as a product failure — has a gate that catches it in a
fast job, and the one *stale wait* among them has a mock bridge that makes it
reproducible locally in eight seconds instead of one CI round trip.

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
git checkout eb181ce
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

# The desktop receipt check, against the MOCK review bridge - no Rust toolchain
# needed. This is a review aid: it proves the UI path, and nothing at all
# about SQLCipher, the encrypted database, the real store's permissions, or
# any native behaviour. CI runs the same check against the real bridge.
SORNIO_REVIEW_BRIDGE=apps/desktop/mock-review-bridge.cjs \
  node apps/desktop/check-receipts.cjs http://127.0.0.1:1420 <chromium> /tmp/sornio-receipts
```

CI: `https://github.com/uddieee33-blip/Sornio/actions?query=branch:arena/707e2c68-sornio`
Draft PR: `https://github.com/uddieee33-blip/Sornio/pull/183`
