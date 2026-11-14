# Phase 20 — iOS and iPadOS product completion

## 0. Exact source identity

| | |
| --- | --- |
| Repository | `uddieee33-blip/Sornio` |
| Working branch | `arena/729c232c-sornio` (this session's branch; never renamed, never merged) |
| Base | `main` at `1cc5c798d1eada9a16463213b0776c01e99d36f9` |
| Phase 19E baseline recovered | `5064a879d9ff966b8dd00a092151047e2007e7b2` (`origin/arena/707e2c68-sornio`, also `refs/pull/183/head`) |
| Recovery method | `git merge --ff-only 5064a87` — fast-forward only, 0 commits rewritten, nothing reset or discarded |
| Phase 20 code commits | `42a823c` (harness, repairs, performance), `d021361` (iPad kitchen panes, Android suite) |
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

1. **No simulator evidence.** Unavoidable here: Linux, no Xcode. Recorded as BLOCKED, never as passed.
2. **The new simulator job is untested.** It is the correct next action and the first thing to run on macOS.
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

Run everything: `cd apps/mobile && npm ci && npm run test:runtime` (59 tests, ~15 s).

---

## 15. Release readiness by platform

| Platform | Ready for | Verdict |
| --- | --- | --- |
| **iPhone** | internal review and demo demonstration | **CONDITIONAL PASS** — headless-verified; simulator and device acceptance outstanding |
| **iPad** | internal review of tablet layouts | **CONDITIONAL PASS** — layout branch verified; rotation, Stage Manager and pointer acceptance outstanding |
| **Android** | internal review | **CONDITIONAL PASS** — shared code verified headlessly; APK compiles |
| **LAN restaurant client** | supervised pilot only after real-hub and device acceptance | **CONDITIONAL PASS** for client protocol · **BLOCKED** for end-to-end |
| **Production / App Store / TestFlight** | nothing | **NOT READY** — live sync is unimplemented and `productionSyncEnabled` is false |

---

## 16. Recommended next phase

1. **Run the `simulator` job on macOS**, fix it until it is green, and attach its
   screenshot and log artifacts to this report. This is the single highest-value action.
2. Extend the simulator job to drive one real interaction (demo entry → every tab →
   sign-out) so it produces behavioural, not merely liveness, evidence.
3. Stand up a desktop hub on a test network and produce the first end-to-end LAN
   evidence for pairing, sign-in, workspace read, one kitchen transition and recovery
   after a forced disconnect.
4. Make a decision on biometric unlock — either wire it to the session unlock with a
   defined failure policy, or delete the dead module. Do not ship an unused
   Face ID usage string and permission.
5. Only after 1–3: consider a supervised physical-device pilot. Do not enable
   `productionSyncEnabled` before that.
