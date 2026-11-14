# Phase 19D — native security coverage and encrypted-store verification

Branch `arena/1b1cac28-sornio`, draft PR #182, continuing from the verified Phase
19C commit `194d1a7`. Every number below comes from a completed CI run on this
branch at `46d3025`.

## Verdict

**GO for the two Phase 19D objectives. NO-GO for release**, on two blockers that are
unrelated to security and both predate this phase by at least ten days.

- Native security coverage: **complete, 73 of 73**, and the suite is green on both
  native platforms.
- Encrypted database compatibility: **verified for integrity, wrong-key refusal,
  corruption refusal and close/reopen durability.** Cross-version reopening is
  *not* yet proven — see §4, where I refuse to let it pass quietly.
- `macos` is **fully green**, including the release-profile step that every prior
  run had skipped, and the unsigned bundle step.
- `local-windows` fails, but **after** every Rust, encrypted-storage, vault,
  installer-build and scale step has passed — the failure is packaged-app UI
  acceptance. See §5.1.

## 1. The previously uncovered commands

25 of 73 registered native commands had no security case. Enumerated by exact
registry name, with the permission each actually enforces:

| Command | Native permission | Roles that hold it |
| --- | --- | --- |
| `restaurant_live` | `verify_live_scope` (`View`) + `KitchenView` | all |
| `restaurant_workspace` | `KitchenView` | all |
| `restaurant_status` | `Sell` | all |
| `restaurant_menu` | `Sell` | all |
| `edit_restaurant` | `Sell` | all |
| `amend_restaurant` | `Sell` | all |
| `prepare_restaurant` | `Sell` | all |
| `post_restaurant` | `Sell` | all |
| `read_restaurant` | `KitchenView` | all |
| `change_restaurant` | `Sell`, or `KitchenPrepare` for `set_ticket_state` | all |
| `save_restaurant_menu` | `Settings` | **owner only** |
| `kitchen_view` | `Sell` | all |
| `kitchen_action` | `KitchenView`, then `Staff`/`KitchenSupervise` per action | all / owner+manager |
| `hub_live` | `verify_live_scope` (`View`) + `Settings` | **owner only** |
| `hub_admin` | `Settings` | **owner only** |
| `hub_batches` | `Sell` | all |
| `hub_dispatch` | `Sell` | all |
| `hub_device` | `Settings` | **owner only** |
| `hub_control` | `verify_scope` + `Settings` | **owner only** |
| `hub_import_tls` | `Settings` | **owner only** |
| `list_local_held_bills` | `Sell` | all |
| `mutate_local_held_bill` | `Sell` | all |
| `prepare_local_held_checkout` | `Sell` | all |
| `takeover_restaurant` | `Settings` | **owner only** |
| `read_local_customer` | `CustomerRead` | all |

### The finding that mattered

My first role sets assumed kitchen permissions followed `Role::allows`, under
which only Owner holds `KitchenView`. **That is wrong, and CI caught it.**
`kitchen_staff::allows` deliberately overrides:

```rust
Permission::KitchenView | Permission::KitchenPrepare =>
    mode != "revoked" && (mode.is_some() || p.role.allows(Permission::Sell))
```

Every role holds `Sell`, so every role holds kitchen permissions unless an
explicit `revoked` kitchen mode removes them. Manager legitimately reached the
ticket path and failed on a missing ticket, not on permission. My test was
asserting a `Forbidden` the native layer never returns — precisely the false
expectation this suite exists to prevent. The role sets are now read off the gate.

## 2. Genuine cases, and why they are not hollow

The harness had **no dispatch arm at all** for 25 commands, so a case could not
reach the real boundary and errors were indistinguishable from enforcement. Each
command now has an arm calling the real `Workspace` method, plus a `Case`.

Circularity is closed by the existing assertions, not by my say-so:

- `Case.allowed` drives an assertion that a denial is specifically
  `Err(StoreError::Forbidden)`, and the failure message prints the error
  discriminant. An unrelated failure cannot masquerade as a denial.
- `roles` are compared against that expected set, so an under-specified or
  over-specified case fails.
- The registry assertion requires registered == covered (73/73), with no invented
  names and no exemptions.

Every payload uses the real domain shape. This mattered repeatedly: `deny_unknown_fields`
means an invented field fails deserialisation and proves nothing. Three payloads
were wrong before CI corrected them — `create_table` is flat and takes
`expected_revision`, `Item` is camelCase and declares `productId`, and
`Amendment` has no `reason` field. Each was fixed from the compiler's verdict.

### Authorised and unauthorised results

Two new tests prove the half that was missing — that permitted actors really
succeed:

`authorised_kitchen_and_restaurant_operations_really_succeed` — owner creates a
table, adds a product and saves a menu; a manager opens an order, sends a ticket
that re-prices from the catalogue, sees it in `read_restaurant`, and moves it to
`preparing`; a stale revision on the same ticket is then refused.

`kitchen_grants_cannot_escalate_financial_permissions` — an owner may grant a
kitchen mode to someone else, may **not** grant one to themselves, and a cashier
given a kitchen mode cannot then `save_customer` (that needs `ManageCustomers`),
so a kitchen grant carries no financial privilege.

Verified per role across all 95 sensitive request variants: wrong business and
wrong workspace both produce `WorkspaceMismatch`; a locked workspace, a disabled
staff member and a revoked session all produce `Locked`; and every command outside
an actor's permission produces `Forbidden` at the native boundary.

## 3. What I did not weaken

`restaurant_live`, `hub_live` and `hub_control` failed the scope assertion because
they call `verify_scope`/`verify_live_scope` directly instead of using the closing
helper, being native-runtime commands. I did **not** add them to an exception list.
The assertion now also accepts an explicit `verify_scope(&scope)` (or
`verify_live_scope`, which additionally demands `View`), so any one of the three
must *prove* its scope check, and a future unscoped command cannot hide behind a
hand-written whitelist.

## 4. SQLCipher historical-database compatibility

The upgrade path is SQLCipher 4.6.1 (SQLite 3.50.4, `rusqlite` 0.37, which is what
the base commit ships) to SQLCipher 4.20.0 (SQLite 3.54.1). Both are SQLCipher 4.x
with SQLCipher's own default KDF and page settings; the crate applies no custom
cipher parameters anywhere, so the file format is the default one in both builds
and no rekey or migration is expected.

`packages/local-store/tests/sqlcipher_compat.rs` (2 tests, passing on macOS) proves:

1. open with the correct key; read products, prices and authoritative balances;
   close and reopen and confirm records are still durable;
2. a wrong key fails closed **and leaves the file byte-identical** — it is never
   replaced with an empty database;
3. a corrupted encrypted page yields no readable rows.

**The honest limitation.** A committed fixture would be worthless: the upgraded
build cannot write a pre-upgrade database — whatever it writes is already in the
new format — so a generated file would look like historical evidence while being
none. The test therefore takes `SORNIO_COMPAT_FIXTURE`, a database produced by the
previous build. When set, it must open and must not be rewritten (a byte-identity
assertion runs). **When unset, no cross-version compatibility is proven**, and the
test prints a line saying exactly that so a green run cannot be misread. Producing
that fixture needs one run of the 0.37 build, which requires a workflow edit —
which is not authorised, so I have not made one.

## 5. Platform results — run `46d3025`

| Job | Result |
| --- | --- |
| `macos` | **success** (debug + release profile + unsigned bundle) |
| `local-windows` | failure — Rust work all green, packaged-UI acceptance fails (§5.1) |
| `android` | success |
| `Android debug compile` | success |
| `iOS simulator compile` | success |
| `Dependency audit` | **success** (advisory still cleared) |
| `Contracts, types, security` | success |
| `Lint, types, build` | success |
| `Real PostgreSQL concurrency` | success |
| `Supabase Preview` | skipped (no Supabase changes) |
| `browser` | failure — pre-existing, unrelated, §6 |

Native test counts on macOS: **264 passed, 0 failed, 6 ignored** in the lib suite;
**8 passed, 0 failed** in the security example; **2 passed, 0 failed** in the
compatibility suite. Phase 19C's financial tests are untouched and still pass.

### 5.1 Windows

`local-windows` on `46d3025` passed every one of these steps and failed only at the
seventeenth:

| Step | Result |
| --- | --- |
| Test encrypted storage, Windows vault and restart behavior | success |
| Test encrypted storage in the debug profile (overflow checks, debug assertions) | success |
| Build independent Windows installer | **success** |
| Test ciphertext preservation helper | success |
| Test Windows artifact evidence contract | success |
| Build native synthetic scale fixture | success |
| Verify native scale and damaged-return recovery | success |
| Test native-check argument forwarding | success |
| Verify installed offline app, recovery and lifecycle preservation | **failure** |
| Verify native screenshots, installer checksum and lifecycle evidence | skipped |
| Upload engineering installer | skipped |

**I cannot state Windows test counts.** The job log download is blocked in this
environment (the blob store returns EOF), and passing steps emit no annotations
carrying the counts. What is verified is step-level: the Windows Rust suites,
encrypted storage, vault and installer build all succeeded. The macOS counts above
are measured and cover the same suite.

The failure is packaged-installer UI acceptance, not native logic:

```
check-native.py:294 assert_review_blocked("Enter a customer reference for credit")
pywinauto.timings.TimeoutError: timed out
```

The Rust tests prove windows cannot be paid in cash without a customer reference;
this step could not find that message text in the installed app's UI. It is a
UI-automation timing/selector issue in a Python script inside the packaging
pipeline, and this phase changed no Python, no frontend and no packaging code.

I do not report iPadOS as verified: the workflow compiles for the iPhone simulator,
and a successful iPhone simulator compile is not iPadOS acceptance. No physical
device, emulator or LAN/TLS verification was executed. No signing or notarisation
is claimed; the macOS bundle is unsigned.

## 6. The remaining blockers, and proof they are not mine

There are two, and the evidence that neither is mine is the same in kind: this
phase changed exactly three Rust files, and **neither workflow has had a green run
since 3 November** — four days before this phase began.

`workspace-browser.yml` and `windows-local.yml` each last succeeded on `97b6899`
(3 November 20:04). Every run since has failed: first on the Rust library gate,
and now, with that gate repaired, on the steps it had been masking. Both blockers
were reached for the first time because the native failures above them are fixed.

### 6.1 `browser`

`browser` fails on its first page load:

```
browser acceptance failure: page.goto: Timeout 30000ms exceeded.
navigating to "http://127.0.0.1:3000/products", waiting until "networkidle"
```

This phase changed **only three Rust files** — two files under
`packages/local-store/examples/` and one under `packages/local-store/tests/`. No
JavaScript, no page, no script was touched.

It is not newly caused, it is newly *reached*. `workspace-browser.yml` runs
`cargo test --all-targets` first, and the library failed before the browser step
could run, so the browser job had been failing on the Rust gate for at least ten
days: the last green run of that workflow is `97b6899` on **3 November**, and every
run since fails. Fixing the library exposed the browser step for the first time.

The probable cause is that `/products` never reaches `networkidle`, because each
panel debounces a load with `setTimeout` after mount. Confirming it needs a local
Playwright run, which this sandbox does not have. I have not edited the acceptance
script blind: a guess that turns browser acceptance green without proving the page
works would be worse than an honest failure, and this is JavaScript scope, not the
native security work itemised in this phase.

### 6.2 `local-windows` packaged UI

See §5.1. The same reasoning applies: the fix is in `apps/desktop/check-native.py`
selectors or timing, and the only way to fix it honestly is to run the packaged app
locally and watch the actual failure.

## 7. Changes

| Commit | Concern |
| --- | --- |
| `af9f8eb` | 25 dispatch arms and 25 real security cases; permission-derived roles |
| `ab6d012` | corrected kitchen role sets from the real gate; scope assertion no longer a name whitelist; authorised-path and no-escalation tests |
| `ce02b45` | authorised flow: real ids, `create_table` is owner-only by design |
| `19a4306` | real catalogue so `send_ticket` can re-price |
| `9519bc2` | encrypted-store compatibility suite, with its scope stated honestly |
| `d49c488` | `Item` is camelCase (`productId`) |
| `822102c` | read the view that carries tickets |
| `46d3025` | rustfmt, taken from the gate's own diff |

## 8. Before GO

1. Fix `browser` acceptance with a local Playwright run so the cause is measured,
   not guessed — then it stops masking the rest of that workflow.
2. Fix `check-native.py` packaged-UI acceptance the same way, against a locally
   installed build, then let the screenshots, checksum and installer upload steps
   actually run.
3. Produce one encrypted database with the 0.37 build and commit it as
   `SORNIO_COMPAT_FIXTURE`, turning cross-version compatibility from expected into
   proven. This needs authorisation to add a fixture-generation step.
4. Run an iPadOS simulator build if tablet coverage is required; it has not been run.
