# Phase 20 — iOS and iPadOS product completion

## 0. Exact source identity

| | |
| --- | --- |
| Repository | `uddieee33-blip/Sornio` |
| Working branch | `arena/729c232c-sornio` (this session's branch; never renamed, never merged) |
| Base | `main` at `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| Phase 19E baseline recovered | `5064a879d9ff966b8dd00a092151047e2007e7b2` (`origin/arena/707e2c68-sornio`, also `refs/pull/183/head`) |
| Recovery method | `git merge --ff-only 5064a87` — fast-forward only, 0 commits rewritten, nothing reset or discarded |
| Phase 20 code commits | `42a823c` (harness, repairs, performance), `d021361` (iPad kitchen panes, Android suite), `db4ee5a` (LAN reference-hub suite), `e9f0a5f` (report §8A) |
| Phase 20B commits | `a8b7262` (simulator provisioning repair + §8B) — head of this report |
| Pull request | opened as a **draft** from `arena/729c232c-sornio` |
| `main` | **not touched.** No merge, no force-push, no history rewrite, no store or TestFlight publication |

### 0.1 Why the baseline moved

The sandbox checked out `main` at `1cc5c79`. The assignment named
`5064a879` as the latest independently verified Phase 19E head. That commit exists on
the remote, is a descendant of `1cc5c79`, and is open as draft PR #183. Phase 20
therefore continues from `5064a87` instead of from `main`. Nothing was rebased and no
other agent's work was altered.

### 0.2 What this phase changes

```
apps/mobile/__runtime__/**        new headless runtime acceptance harness (5 suites, 59 tests)
apps/mobile/jest.config.js        new
apps/mobile/package.json          dev-time test tooling + test:runtime / test:bench scripts
apps/mobile/src/app/CompanionApp.tsx        startup shell, explicit mode chooser
apps/mobile/src/app/CompanionContext.tsx    session lifecycle repair
apps/mobile/src/components/primitives.tsx   accessible button name
apps/mobile/src/navigation/AppNavigation.tsx  rail/tab frame, signed-out state
apps/mobile/src/screens/HomeScreen.tsx        restaurant workspace no longer replaces Home
apps/mobile/src/screens/ActivityScreen.tsx    virtualised + memoised
apps/mobile/src/screens/InventoryScreen.tsx   virtualised + memoised
apps/mobile/src/screens/CustomersScreen.tsx   virtualised + memoised
apps/mobile/src/screens/LanRestaurantScreen.tsx  iPad two-pane kitchen, shared breakpoint
apps/mobile/src/screens/RestaurantScreen.tsx     shared breakpoint
apps/mobile/src/i18n/en.ts                    tab copy
packages/mobile-design/src/tokens.ts           `layout.railMin`
.github/workflows/mobile.yml                  two new jobs, all existing jobs preserved
docs/reviews/phase20-ios-ipados-product-completion.md  this report
```

**No security or financial behaviour changed.** `apps/mobile/app.json` is byte-identical:
`appMode` is still `"demo"` and `productionSyncEnabled` is still `false`. No TLS,
certificate-pinning, permission, idempotency or money code was touched. The diff over
`packages/business-domain/src/`, `packages/mobile-contracts/src/`,
`apps/mobile/modules/sornio-lan/` and `apps/mobile/ios/` is **empty**.

---

## 1. Evidence vocabulary

Phase 19 counts are not carried forward as proof of anything. Every verdict in this
report uses one of these levels, and they are not interchangeable:

| Level | Meaning |
| --- | --- |
| **Implementation** | Source exists and typechecks |
| **Compiled** | A compiler or bundler accepted it |
| **Headless execution** | The real React component tree ran in Node and its behaviour was asserted |
| **Protocol execution** | Real client domain code ran against a contract-faithful reference hub (no TLS, no desktop hub) |
| **Simulator** | An `.app` was installed and launched in a booted iOS Simulator |
| **Physical device** | Installed and driven on real hardware |
| **Production-ready** | Simulator **and** device evidence **and** founder approval |

Headless execution is new in Phase 20 and is genuinely stronger than Phase 19E's
compile-only result: it proves startup, navigation, state transitions and list
behaviour actually run. It is still **not** simulator evidence, and it is never
described as such below.

---

## 2. Capability matrix

Legend: **HE** headless-executed and asserted · **IMPL** implemented, only typechecked ·
**PART** partially implemented · **DEMO** demo data only · **BLOCKED** implemented but no
runtime evidence obtainable here · **MISSING**.

| Capability | iPhone | iPad | Android | Backend / hub | Verification |
| --- | --- | --- | --- | --- | --- |
| Application startup | yes | yes | yes | n/a | **HE** |
| Mode chooser (shop vs demo) | yes | yes | yes | n/a | **HE** |
| Shop selection (manual IDs) | yes | yes | yes | LAN hub | **IMPL** — needs a live hub |
| Shop selection (DNS-SD discovery) | yes | yes | yes | native `SornioLan` | **BLOCKED** — needs a real hub on a LAN |
| Secure pairing / enrolment code | yes | yes | yes | `/v1/enrol` | **PROTOCOL** (client side) — real TLS still **BLOCKED** |
| Certificate pin verification | yes | yes | yes | native TLS | **BLOCKED** — needs a real certificate |
| Employee sign-in | yes | yes | yes | `/v1/session` | **PROTOCOL** — refusal/expiry/revocation paths executed |
| Session restoration (demo) | yes | yes | yes | n/a | **HE** |
| Session restoration (live/LAN) | n/a | n/a | n/a | LAN hub | **PROTOCOL** — resume after re-auth executed |
| Sign-out and session wipe | yes | yes | yes | n/a | **HE** — was **broken**, see §4.1 |
| Face ID unlock | **MISSING** | **MISSING** | n/a | n/a | see §4.3 |
| Business dashboard | yes | yes | yes | snapshot | **HE** |
| Inventory visibility | yes | yes | yes | snapshot | **HE** + measured |
| Customer information & statements | yes | yes (list-detail) | yes | snapshot | **HE** |
| Transactions / activity | yes | yes | yes | snapshot | **HE** + measured |
| Reports | **PART** (summary only) | same | same | snapshot | **IMPL** |
| Offline stock-count drafts | yes | yes | yes | device secure store | **IMPL** |
| Restaurant tables & tickets | yes | yes | yes | `/v1/workspace` | **PROTOCOL** — snapshot validated against schema |
| Kitchen preparation queue | yes | yes (two panes) | yes | hub | **PROTOCOL** — queue projection asserted |
| Kitchen transitions + durable recovery | yes | yes | yes | `/v1/operation` | **PROTOCOL** — CAS, refusals, lost-response recovery |
| Staff assignment / responsibilities | yes | yes | yes | hub | **IMPL** — outside this suite |
| Supervisor reassignment | yes | yes | yes | hub | **BLOCKED** |
| Security & session history | yes | yes | yes | `/v1/staff-access` | **IMPL** — outside this suite |
| Durable operation recovery | yes | yes | yes | outbox + hub | **PROTOCOL** — advanced exactly once under every fault |
| LAN connectivity indicators | yes | yes | yes | hub | **PART** — HE for the disconnected copy |
| Synchronisation (live snapshot) | **MISSING** | **MISSING** | **MISSING** | none | `ProductionSnapshotAdapter` still throws |
| Notifications / push | **MISSING** | **MISSING** | **MISSING** | none | — |
| Settings, appearance, cache wipe | yes | yes | yes | n/a | **HE** |
| Device revocation | **PART** | **PART** | **PART** | desktop-owned | see §5 |

The 2026 `docs/mobile/FEATURE-MATRIX.md` describes the companion as mostly read-only.
The source has since grown a real operational restaurant stack (Phases 13–18). The
documentation is stale in the *optimistic* direction: it understates what exists. Both
statements are true — the restaurant stack exists and is substantial, but **none of it
has been executed against a live hub in this phase**, so its honest verdict is
`BLOCKED`, not `PASS`.

**Update — protocol execution added after the first draft of this report.** The
client-side recovery protocol *has* now been executed (§8A). What remains BLOCKED is
the part that genuinely needs hardware and a network: real TLS with certificate
pinning, the Rust/Tauri desktop hub, and an end-to-end run between two devices. Those
are not downgraded by §8A and must not be cited as if they were.

---

## 3. Confirmed defects

Each defect below was found by *running* the code, not by reading it.

### 3.1 Sign-out was impossible — **critical**

`CompanionContext.signOut()` cleared the session and then called `bootstrap()`, which
found no stored session and immediately created a fresh demonstration session. The
owner could press "Sign out" forever and never leave. Account switching and any
"this device is no longer authorised" flow were both unreachable.

*Repair:* sign-out and cache-wipe now invalidate any in-flight bootstrap with a token,
clear the stored session, and transition to an explicit signed-out state. The
demonstration is re-entered only by pressing "Reopen the demonstration".

*Evidence:* `iphone.test.tsx › clears the session on sign-out and does not silently
reopen a demo identity`, and the Android equivalent.

### 3.2 Concurrent bootstrap could resurrect a cleared session

The first render starts `bootstrap()`; a sign-out can complete before it resolves. The
`await` on secure storage then re-applied the old session. Repaired with a monotonic
`bootToken`; a stale bootstrap now drops its result.

### 3.3 Buttons had no accessible name

`ActionButton` set no `accessibilityLabel`, so VoiceOver derived a name from whatever
child `Text` nodes happened to exist. Compound labels such as
`"Draft additions · revision 7"` were announced in fragments, and the control could not
be found by name at all. *Repair:* explicit `accessibilityLabel={label}`.

### 3.4 Spoken tab label contradicted the visible label

The Stock tab displayed the portal vocabulary ("Stock") but announced "Inventory".
*Repair:* the label comes from one source and the test now asserts the exact spoken
array `['Home', 'Activity', 'Inventory', 'Khata', 'More']`.

### 3.5 A cafe account lost all navigation from Home — **high**

`HomeScreen` returned `RestaurantScreen` directly for `portalId === 'cafe'`. That
removed the dashboard, the tab bar and every other screen: a restaurant-owner account
opened the app straight into a drafts form with `Settings` as the only escape.
*Repair:* restaurant entry points are now offered from Home and push over it with an
explicit "Back to Home" route.

### 3.6 Tablet frame dead zone

`AppNavigation` used the rail at `width >= 720` while every workspace inside it
required `>= 820`. At 744pt (iPad mini portrait) a 232pt rail was drawn beside a
single 492pt column. *Repair:* one shared `layout.railMin` token; below it the tablet
stacks into one column.

### 3.7 Tab labels ignored Dynamic Type

Tab and rail labels did not set `allowFontScaling`. *Repair:* every text node scales,
and above `fontScale > 1.3` the rail yields to the tab bar so figures are never clipped.

### 3.8 iPad kitchen could only show one pane

`LanRestaurantScreen` used the same show/hide toggle on iPad as on a phone, so the
requirement to view the queue *and* a selected ticket together was unmet.
*Repair:* both panes stay mounted side by side at tablet width.

---

## 4. Features completed

1. **Runtime acceptance harness** (`apps/mobile/__runtime__`) — executes the real
   `App.tsx` tree in Node.
2. **Session lifecycle** — sign-out, wipe, re-entry and stale-bootstrap protection.
3. **Navigation frame** — signed-out state, tablet rail, phone tab bar, Dynamic Type
   fallback, explicit return from the demonstration.
4. **Accessible names** — buttons, tabs and portrait chips.
5. **Restaurant entry points** — available from Home without destroying navigation.
6. **iPad kitchen** — two live panes.
7. **Virtualised, memoised lists** — Activity, Stock, People.

---

## 5. iPhone UX changes

- Signed-out state with recovery actions instead of a silent re-login.
- A visible way back from the shop connection screen (`Other Sornio modes`) and from
  the demonstration (`Connect to a shop` in Settings' rail / Settings screen).
- Button and tab names are single, stable, spoken strings.
- Tab copy scales with Dynamic Type.
- Restaurant workspaces no longer hijack the Home tab.

Not done, deliberately: no visual redesign, no new animation, no change to the
established dawn/dusk palette or type scale.

---

## 6. iPadOS-specific changes

| Requirement | Status |
| --- | --- |
| Sidebar / navigation rail | **Implemented and headless-verified** at 820, 1194 and 1366pt |
| List-detail (People) | **Implemented and headless-verified** — list and statement coexist |
| Kitchen queue + selected ticket simultaneously | **Implemented** (two panes), headless layout not yet asserted against a live hub |
| Portrait and landscape | **Headless-verified** by width branch; real rotation NOT RUN |
| Window resizing / Stage Manager | **Headless-verified** across the 820pt breakpoint in both directions; real Stage Manager resize NOT RUN |
| Keyboard and pointer | **NOT RUN** — no simulator |
| Safe areas | Uses `react-native-safe-area-context` on all frames; not visually verified |
| No duplicated business logic | Preserved — one component tree, branch on measured width |

---

## 7. Performance measurements

**Environment.** Linux x86_64 container, Node v22.22.3, Jest 30.5.2 with `jest-expo`
under `@testing-library/react-native`. This is a **JavaScript render benchmark**, not a
device profile. It measures React tree construction and commit for the real screens,
and the native node count that work produces. It says nothing about GPU frames, memory
or native view creation. No FPS figure is claimed anywhere in this report.

Reproduce: `cd apps/mobile && npm run test:bench`

“Before” is the same benchmark against the unmodified `map`-based screens; “after” is
the virtualised implementation, same machine, same fixtures.

| Screen | Rows | Before: build | Before: native nodes | After: build | After: native nodes |
| --- | --- | --- | --- | --- | --- |
| Activity | 200 | 406 ms | 2,023 | 232 ms | 157 |
| Activity | 1,000 | 661 ms | 10,023 | 30 ms | 157 |
| Activity | 3,000 | **1,200 ms** | **30,023** | **33 ms** | **157** |
| Stock | 2,000 | **1,926 ms** | **32,010** | **32 ms** | **182** |
| People | 1,500 | 997 ms | 16,524 | 32 ms | 170 |
| Activity keystroke while filtering 1,000 rows | — | 94 ms average | — | **4.7 ms average** | — |

Node counts become flat because a virtualised list commits a bounded window. Cost no
longer tracks snapshot size, which is the property that matters for a shop with a large
khata.

**Remaining bottlenecks, measured not guessed.**
- First mount of `ActivityScreen` still costs ~230 ms at any size. It includes provider
  bootstrap and secure-storage probe, not row rendering.
- `InventoryScreen` rows each mount a `StockCount` editor that reads device secure
  storage on open. Rows are memoised, but opening many counts on one screen is the
  remaining cost centre on low-end Android.
- No image, font or animation profiling was performed — the companion ships none.

---

## 8. iOS build and runtime results

| Check | Verdict | Evidence |
| --- | --- | --- |
| Mobile contract tests | **PASS** | `Mobile contracts: 63 checks passed` |
| TypeScript typecheck (app) | **PASS** | `tsc --noEmit` clean |
| TypeScript typecheck (contracts) | **PASS** | clean |
| Secret scan | **PASS** | CI job unchanged, no new secrets |
| iOS simulator **compile** | **PASS (prior evidence)** | Phase 19E `ios` job; Phase 20 changed no Xcode, Podfile, plist or native module |
| iOS simulator **boot + install + launch** | **BLOCKED** | This agent runs on Linux. No `xcodebuild`, `simctl` or Xcode exists in the environment. |
| Interactive simulator workflow | **BLOCKED** | as above |
| Physical iPhone | **NOT RUN** | no hardware |
| Headless iPhone execution | **PASS** | 10 tests, `__runtime__/iphone.test.tsx` |

The new `simulator` CI job is the executable path to close the BLOCKED rows: it boots
iPhone 16 and iPad Pro 11 (M4), builds, installs, launches `com.sornio.companion`,
asserts via `launchctl list` that the process survives 12 seconds, and uploads a
screenshot plus an `os_log` capture. **It has not been run yet** — it was written on
Linux and cannot be validated here. It is a release gate, not a result.

> **Superseded by §8B.** This job has since been repaired, executed and passed for both
> an iPhone and an iPad simulator (run 43570715290). The rows above are kept as the
> record of what was known before that run. Interactive acceptance remains outstanding.

---

## 8A. LAN protocol execution (added after the initial verdicts)

The LAN stack was BLOCKED for want of a hub. That blocked *verification*, not the
protocol: every client call is injected through a `HubWire` function, so the real
client code can be driven against a hub that obeys the documented wire contract.

`apps/mobile/__runtime__/lan/reference-hub.ts` implements `/v1/enrol`, `/v1/session`,
`/v1/workspace`, `/v1/operation`, `/v1/kitchen-state` and `/v1/submit` in memory, with
hooks for a dropped request, a response lost *after* commit, a closed order, session
expiry and device revocation. `apps/mobile/__runtime__/lan.test.ts` then drives the
**real** `hubOutbox`, `kitchenOutbox`, `hubCommandStore`, `hubWorkspace` and
`kitchenQueue` code — 27 tests.

| Property under fault | Verdict |
| --- | --- |
| Status lookup precedes any resend | **PASS** — `/v1/operation` is the first call on recovery |
| Committed result adopted after a lost response | **PASS** |
| Same payload replanted; no new operation id minted | **PASS** |
| Order advances exactly once under lost response | **PASS** |
| Order advances exactly once across 3 dropped connections | **PASS** |
| Durable refusal does not advance revision | **PASS** |
| One unresolved command per employee; second is refused | **PASS** |
| No cross-employee or cross-shop command leakage | **PASS** |
| Survives simulated process restart from device storage | **PASS** |
| Kitchen revision CAS, illegal jump, closed order | **PASS** |
| Session expiry keeps the command and blocks the write | **PASS** |
| Re-authentication resumes the *same* operation | **PASS** |
| Revoked device cannot obtain a session | **PASS** |
| Queue projection: counts, filters, ready-first ordering | **PASS** |

**What this is not.** No TLS. No certificate pinning. No Rust/Tauri hub. No SQLCipher.
No second device. It proves the client honours the contract and it pins that contract
for both sides; it does not prove the desktop implementation agrees. Real LAN
acceptance remains **BLOCKED**, and the fixture is labelled as a reference hub
everywhere it appears so it can never be mistaken for production evidence.

---

## 8B. Phase 20B — simulator infrastructure repair and first real runtime execution

**Historical record preserved.** §8 and §9 above are retained verbatim as the state of
knowledge *before* this work. Several of their rows were BLOCKED and are now closed by
execution, not by editing.

### 8B.1 Exact identity

| | |
| --- | --- |
| Branch | `arena/729c232c-sornio` |
| HEAD at start of 20B | `e9f0a5f954bb9eb13410257f0bbd1ca09884cc3c` |
| Pull request | #184, **still a draft**, not merged |
| Original failing run | [`43544918392`](https://github.com/uddieee33-blip/Sornio/actions/runs/43544918392) on `e9f0a5f` |
| Repair commit + run | HEAD `a8b7262` → run [`43570715290`](https://github.com/uddieee33-blip/Sornio/actions/runs/43570715290) |
| `main` | untouched at `1cc5c79`; no merge, no force-push, no store submission |

### 8B.2 The defect was in provisioning, not in the app

Run 43544918392: 4 jobs succeeded (contracts, Android compile, headless runtime, iOS
simulator compile); both `iPhone and iPad simulator launch (...)` jobs **failed in the
first step, `Boot simulator`, with exit code 2**, and `Build for the booted simulator`,
`Install and launch` and even `Post Run actions/setup-node@v4` were **skipped**.

The step ran an inline `node -e` snippet that looked for an exact marketing model name
(`iPhone 16`, `iPad Pro 11-inch (M4)`) in `xcrun simctl list devices available --json`
and called `process.exit(2)` when it was absent — with no message. The runner's inventory
did not contain those names.

**This established nothing about app health.** No product code was touched to fix it, per
the assignment's rule. The real weakness was that the decision "can we verify at all, and
with which device" lived inside YAML, so the only way to test it was a paid macOS run —
precisely the thing that was broken.

### 8B.3 Repair

- `scripts/simulator-choice.mjs` — pure selection rules: newest installed iOS runtime by
  **numeric** comparison (a string compare ranks iOS 9 above iOS 18); an iPhone request
  is satisfiable only by an iPhone and an iPad request only by an iPad, never substituted;
  a preferred model is a hint that falls back to the newest model of the right family;
  empty inventory fails as `no_runtime` / `no_device_type` and names what *was* available;
  an existing device of the right type is reused so runs do not accumulate simulators.
- `scripts/select-ios-simulator.mjs` — prints runner, Xcode version and path, runtimes,
  device types and devices **before** the first fallible action; provisions from an
  installed device type when none exists; boots and then confirms `Booted` **from the
  device registry**, not from the tool's own exit code; exports `udid`/`name`/`runtime`
  and writes a step summary. On this Linux sandbox it now says
  `xcodebuild is not available on this runner` instead of exiting 2 silently.
- `scripts/verify-simulator-choice.mjs` — **32 checks, runnable without macOS**, wired
  into the `shared` CI job. It caught a genuine bug in the first draft: the reuse
  predicate matched on simulator *name* prefix, which rejected the devices the script
  creates itself, so every run would have provisioned a new one.
- `.github/workflows/mobile.yml` — family-based matrix; inventory printed first;
  bundle identity verified from the built `Info.plist`; launch asserts the process
  survives **and** fails on fatal JS signatures (`RCTFatal`,
  `Unhandled JS Exception`, `No bundle URL present`) so "live process" is not mistaken
  for "working app"; screenshots under 10 KB are treated as *not captured* rather than
  uploaded as proof; diagnostics and artifacts collected under `if: always()`.

Code signing stays disabled for simulator builds (`CODE_SIGNING_ALLOWED=NO`). **This is
not a signed physical-device build and is not reported as one.**

### 8B.4 Execution — run 43570715290 on `a8b7262`

| Job | Result | Started → finished |
| --- | --- | --- |
| Contracts, types, security | **success** | 07:21:27 → 07:46:31 |
| Android debug compile | **success** | 07:21:56 → 07:46:31 |
| Headless runtime acceptance | **success** | 07:21:56 → 07:46:31 |
| iOS simulator compile | **success** | 07:21:56 → 07:46:31 |
| iPhone simulator acceptance | **success** | 07:30:01 → 07:46:31 |
| iPad simulator acceptance | **success** | 07:30:02 → 07:46:31 |

Both Apple jobs executed **all 14 steps with nothing skipped**: environment inventory,
select and boot, install dependencies, prebuild, CocoaPods, build for the booted
simulator, install + bundle-identity verification, launch + process-survival assertion,
screenshot, diagnostics, artifact upload. Compare with the prior run where steps 6–13
were skipped.

Artifacts published and confirmed present via the API:

| Artifact | Size |
| --- | --- |
| `simulator-iPhone` | 177,284 bytes |
| `simulator-iPad` | 279,984 bytes |
| `Sornio-companion-android-debug` | 50,107,878 bytes |

### 8B.5 What this does and does not prove

**Proved:** a compatible iOS runtime and device type existed on the runner; a simulator
was selected by family (an iPhone for the iPhone job, an iPad for the iPad job),
provisioned where necessary, booted to a confirmed `Booted` state; the app compiled
against that exact destination; `com.sornio.companion` was installed and its bundle
identity verified; the app was launched and its process survived; no fatal-JS signature
appeared; a non-empty screenshot was captured.

**Not proved, and explicitly not claimed:** which model/runtime was chosen (see 8B.6),
that any screen was *interacted with*, that the sign-out flow was exercised on a
simulator, or any real-device behaviour.

### 8B.6 Evidence retrieval limitation

This sandbox cannot read CI logs or download artifacts: both
`gh run view --log*` and artifact download fail with `EOF` against
`productionresultssa*.blob.core.windows.net` and
`results-receiver.actions.githubusercontent.com`. Job status, step graphs, timings and
artifact names/sizes are available through the REST API and are what the table above
rests on. The **selected device model, runtime version and UDID are printed by the
inventory step and its step summary, and are not readable from here** — they must be read
from the run page or from the artifact ZIP on a machine with normal egress. No claim in
this report depends on a value that could not be retrieved.

### 8B.7 Interactive acceptance (§7) — **NOT RUN**, still an outstanding gate

The assignment distinguishes a launch smoke test from interactive acceptance. Only the
former was achieved.

- `apps/mobile` contains **no accessibility identifiers and no `testID`s** (0 occurrences
  across `src/` and `app/`); interaction targets are exposed only as accessibility labels
  on the shared primitives.
- `apps/mobile/ios/Sornio.xcodeproj` contains a **single application target** — no UI test
  target, no `PBXContainerItemProxy`, no test scheme.
- This sandbox has no Xcode, so a hand-authored `project.pbxproj` test target **cannot be
  validated here**.

Adding a UI-test target that has never been opened in Xcode risks breaking the
`iOS simulator compile` and both simulator jobs that were just proven green — a real
regression traded for unverifiable code. It was therefore **not** added blind. The
navigation, sign-out, iPad-rail, list/detail and re-entry assertions that a UI test would
make are covered headlessly by `__runtime__/iphone.test.tsx` (10),
`__runtime__/ipad.test.tsx` (10) and `__runtime__/android.test.tsx` (6) — that is
**headless JS evidence, not simulator interaction**, and is not offered as a substitute.

**Note for the next attempt:** the workflow's `Prebuild iOS` step runs `expo prebuild`,
which regenerates `apps/mobile/ios/`. A test target added to the committed project would
be **erased on every run** unless it is supplied by a config plugin or `--no-clean`
prebuild is used. This ordering hazard must be solved together with the test target.

### 8B.8 Session and recovery regression (§8) — PASS (headless)

Re-verified on `a8b7262`: 5 suites / 59 tests green, including explicit sign-out,
`signOut` invalidating an in-flight bootstrap before keys are cleared, re-entry only
through the deliberate `startDemo`, restart after sign-out, repeated tab navigation and
return to Home, and "never presents the kirana dashboard as a restaurant workspace".
A cleared session does not reappear. Encrypted operation-recovery state was not cleared
to make anything pass. These are React Native Testing Library assertions — **not**
simulator interactions.

### 8B.9 Regression matrix (§10)

| Check | Verdict | Evidence |
| --- | --- | --- |
| Mobile contracts (63) | **PASS** | executed locally on `a8b7262` |
| Simulator selection rules (32) | **PASS** | new, executed locally |
| Mobile runtime suites (59) | **PASS** | executed locally |
| LAN reference-hub protocol (27) | **PASS** | executed locally |
| `verify:business-domain`, `verify:security`, `verify:lock` | **PASS** | executed locally |
| Headless runtime acceptance job | **PASS** | run 43570715290 |
| Android debug compile | **PASS** | run 43570715290 |
| iOS simulator compile | **PASS** | run 43570715290 |
| iPhone simulator runtime job | **PASS** (launch smoke) | run 43570715290 |
| iPad simulator runtime job | **PASS** (launch smoke) | run 43570715290 |
| Interactive XCUITest acceptance | **NOT RUN** | 8B.7 |
| Physical iPhone / iPad | **NOT RUN** | no hardware |
| Real LAN hub, TLS, pairing, SQLCipher on device | **BLOCKED** | 8A / §11 |

No job was removed, no expectation weakened, and no skipped job is presented as a pass.

### 8B.10 Security and financial boundaries (§11)

Unchanged. `appMode: "demo"`, `productionSyncEnabled: false`. No TLS or pinning code,
no permission boundary, no idempotency, no integer-paise accounting, no atomic checkout
and no native posting path was modified. No production credentials or signing secrets
were added; simulator signing is disabled, not bypassed. Desktop SQLCipher remains the
authoritative financial store.

### 8B.11 Verdict

| Platform | After Phase 20B |
| --- | --- |
| **iPhone** | **PASS** for build → install → launch on a booted iPhone simulator; **NOT RUN** for interaction (8B.7) |
| **iPad** | **PASS** for build → install → launch on a booted **iPad** simulator (not substituted); **NOT RUN** for interaction, rail, list/detail and rotation (8B.7) |
| **Android** | **PASS** — debug APK compiles |
| **LAN restaurant** | **PASS** for client protocol against the reference hub; **BLOCKED** end-to-end |
| **Production / store** | **NOT READY** — unchanged |

### 8B.12 Smallest next executable action

1. Open the run page for 43570715290 (or the `simulator-*` ZIPs) and transcribe the
   confirmed model / runtime / UDID into 8B.4. Nothing else is blocked on it.
2. Add the XCUITest target **through an Expo config plugin** (so prebuild regenerates it)
   with the §7 assertions, plus a small set of `testID`s on the shared primitives; open
   the project once in Xcode to validate before committing.
3. Only then consider a supervised physical-device pilot.

## 9. iPadOS runtime results

| Check | Verdict |
| --- | --- |
| Dedicated tablet layout reviewed | **PASS** — rail at ≥820pt, stacked frame below |
| Rail chosen at 820 / 1194 / 1366pt | **PASS** (headless) |
| Stacked frame at 744pt (iPad mini portrait) | **PASS** (headless) — the former dead zone |
| Rail dropped at accessibility text size | **PASS** (headless) |
| List-detail coexistence | **PASS** (headless) |
| Breakpoint crossing in both directions | **PASS** (headless) |
| iPad simulator boot / install / launch | **BLOCKED** — no macOS |
| Real rotation, Stage Manager resize, pointer, keyboard | **NOT RUN** |

iPad runtime acceptance is explicitly **not** claimed. A green iPhone result was never
treated as iPad acceptance, and neither is claimed here.

> **Superseded in part by §8B.** iPad **boot, build, install and launch** on a real iPad
> simulator have since been executed and passed (run 43570715290). Rotation, Stage
> Manager, pointer, keyboard and list/detail **interaction** remain NOT RUN. The mobile
> layout rows above are headless evidence and are unaffected.

---

## 10. Android regression results

| Check | Verdict |
| --- | --- |
| Debug APK compile | **PASS (prior evidence)**; unchanged by this phase |
| Headless Android acceptance | **PASS** — 6 tests on a 412×915 profile |
| Shared-code assertions (startup, tabs, sign-out, list) | **PASS** |
| Android emulator install / launch | **NOT RUN** |

No iPad fix required an Android-only compromise: the frame branches on measured width
for every platform.

---

## 11. LAN and sync verification

| Property | Status |
| --- | --- |
| TLS verification / certificate pinning | **Unchanged.** `hubWire` still refuses to send without a saved 64-hex pin and still compares the returned leaf fingerprint. |
| Discovery grants no access by itself | **Unchanged.** DNS-SD results are labelled unverified. |
| Cross-business isolation | **Unchanged.** `hubPair` and enrolment reject a saved enrolment for another business. |
| Restore-generation handling | **Unchanged** in `mobile-contracts`. |
| Stable operation identity across retries | **Unchanged.** `hubCommandStore.recover()` consults `/v1/operation` before replanting. |
| End-to-end LAN run | **BLOCKED** — no desktop hub and no second network device in this environment. |
| Live cloud sync | **MISSING by design.** `ProductionSnapshotAdapter` throws `PRODUCTION_DISABLED`. |

**Demo vs production.** `appMode` remains `"demo"` and `productionSyncEnabled` remains
`false`. Neither was changed to make the app look finished. The read-only cloud
companion and the LAN operational client have different readiness: the cloud path is
not implemented at all; the LAN path is implemented but unverified end to end.

---

## 12. Security and financial invariant checks

| Invariant | Verdict |
| --- | --- |
| Windows/macOS native SQLCipher remains authoritative | **PASS** — untouched |
| Integer paise / milli-unit quantities | **PASS** — `verify:business-domain` and 63 contract checks |
| Atomic posting, idempotency, stock and credit integrity | **PASS** — pure JS/domain tests unchanged and green |
| No new financial endpoint from mobile | **PASS** — no route added |
| TLS never bypassed | **PASS** — no network code changed |
| No production secrets | **PASS** — `verify:security`: 53 invariants |
| Uncertain outcome never becomes a second write | **PASS** — outbox logic untouched |
| Cross-account data leakage | **PASS** — sign-out now genuinely clears device session keys |

Verification commands run in this phase, all green:
`verify:mobile-contracts` (63), `verify:business-domain`, `verify:lock` (10 groups),
`verify:security` (53 invariants), `verify:theme` (10 paints), `verify:motion` (7),
`verify:pwa` (17), `verify:desktop-contract` (38), root `typecheck` (no errors).

---

## 13. Outstanding limitations

1. ~~**No simulator evidence.**~~ **CLOSED in §8B** — both jobs executed and passed in run 43570715290. **Interactive** simulator acceptance remains NOT RUN (§8B.7).
2. ~~**The new simulator job is untested.**~~ **CLOSED in §8B** — the provisioning defect was diagnosed and repaired; the job is green. Still missing: a UI-test target that survives `expo prebuild`.
3. **The LAN restaurant stack is client-verified but not end-to-end verified.** §8A executes the full client recovery protocol against a reference hub. Real TLS, certificate pinning, the desktop hub and a two-device run remain BLOCKED.
4. **Face ID is implemented but unused.** `readBiometricUnlock`/`promptSessionUnlock` exist and nothing calls them, so the app never asks for biometric unlock. Wiring it needs a session-unlock design decision (what a failed unlock does to the encrypted outbox), so it was not improvised here.
5. **`jest-expo` needed two config bridges.** Its stock `transformIgnorePatterns` exempts `expo/` exactly, which leaves `expo-modules-core` and friends untransformed; and building JUnit for a `packages/` file located outside `rootDir` needed `modulePaths`. Both are documented in `jest.config.js`.
6. **Fixture snapshots** are synthetic and shaped to match `CompanionSnapshot`; they are benchmark input only and never reach product code.

---

## 14. Artifacts

- `apps/mobile/__runtime__/harness.ts` — device profiles, labelled interaction helpers
- `apps/mobile/__runtime__/iphone.test.tsx` — 10 iPhone acceptance tests
- `apps/mobile/__runtime__/ipad.test.tsx` — 10 iPad frame, list-detail and resize tests
- `apps/mobile/__runtime__/android.test.tsx` — 6 shared-code regression tests
- `apps/mobile/__runtime__/bench.test.tsx` — the measured benchmark behind §7
- `apps/mobile/__runtime__/fixtures.ts` — deterministic snapshot sizes
- `apps/mobile/__runtime__/lan/reference-hub.ts` — contract-faithful in-memory hub
- `apps/mobile/__runtime__/lan.test.ts` — 27 LAN protocol and recovery tests
- `.github/workflows/mobile.yml` — `runtime` and `simulator` jobs
- `scripts/simulator-choice.mjs` — pure simulator selection rules (Phase 20B)
- `scripts/select-ios-simulator.mjs` — inventory → select/create → boot → confirm → export (Phase 20B)
- `scripts/verify-simulator-choice.mjs` — 32 Linux-runnable selection checks (Phase 20B)
- CI artifacts from run 43570715290: `simulator-iPhone` (177,284 B), `simulator-iPad` (279,984 B), `Sornio-companion-android-debug` (50.1 MB). **Not downloaded here** — egress to the artifact host is blocked (§8B.6). They expire 2026-11-28.

Run everything: `cd apps/mobile && npm ci && npm run test:runtime` (59 tests, ~15 s).

---

## 15. Release readiness by platform

| Platform | Ready for | Verdict |
| --- | --- | --- |
| **iPhone** | internal review and demo demonstration | **PASS** build/install/launch on a booted iPhone simulator (§8B); **CONDITIONAL** — interactive and device acceptance outstanding |
| **iPad** | internal review of tablet layouts | **PASS** build/install/launch on a booted **iPad** simulator, not substituted (§8B); **CONDITIONAL** — interaction, rotation, Stage Manager and pointer acceptance outstanding |
| **Android** | internal review | **CONDITIONAL PASS** — shared code verified headlessly; APK compiles |
| **LAN restaurant client** | supervised pilot only after real-hub and device acceptance | **CONDITIONAL PASS** for client protocol · **BLOCKED** for end-to-end |
| **Production / App Store / TestFlight** | nothing | **NOT READY** — live sync is unimplemented and `productionSyncEnabled` is false |

---

## 16. Recommended next phase

1. ~~**Run the `simulator` job on macOS**, fix it until it is green.~~ **DONE in §8B**
   (run 43570715290). Residue: transcribe the confirmed model/runtime/UDID and attach the
   artifacts from a machine with unrestricted egress (§8B.6).
2. ~~Extend the simulator job to drive one real interaction.~~ **PARTIAL.** The job now
   distinguishes a live process from a working app (fatal-JS assertion, bundle identity,
   screenshot size guard), but no interaction is driven. Next: add a UI-test target via an
   Expo config plugin so `expo prebuild` regenerates it — see §8B.7 and §8B.12.
3. Stand up a desktop hub on a test network and produce the first end-to-end LAN
   evidence for pairing, sign-in, workspace read, one kitchen transition and recovery
   after a forced disconnect.
4. Make a decision on biometric unlock — either wire it to the session unlock with a
   defined failure policy, or delete the dead module. Do not ship an unused
   Face ID usage string and permission.
5. Only after 1–3: consider a supervised physical-device pilot. Do not enable
   `productionSyncEnabled` before that.
