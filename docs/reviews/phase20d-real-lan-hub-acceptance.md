# Phase 20D — Real LAN hub acceptance

Status vocabulary: **PASS / FAIL / BLOCKED / NOT RUN / NOT APPLICABLE**.
This report does not upgrade evidence levels by implication. A headless reference
hub is Level 1; the genuine Rust/Tauri listener driven by the production mobile
client over TLS on one controlled host is Level 2; a separate-device LAN is
Level 3; a physical iPhone/iPad/Android device is Level 4.

**Overall: Level 2 PASS (26/26); Levels 3–4 BLOCKED.**

- Session branch: `arena/260bdcd2-sornio` at `a1dead6e0c4a8d2d8c8f1f238fbbe00d1088c73a`
- Phase 20 draft PR: #184 (head branch `arena/729c232c-sornio`, baseline `4c8841d`; not modified by this work)
- Historical Phase 20A–C record preserved: `docs/reviews/phase20-ios-ipados-product-completion.md`
- App mode remains `demo`; `productionSyncEnabled` remains `false`. No cloud sync,
  store publish, real-shop deployment, or mobile financial posting authority was added.

## Evidence levels

| Level | Meaning | This phase |
| --- | --- | --- |
| 1 | Reference JS hub + production client protocol logic | Existing `apps/mobile/__runtime__/lan.test.ts` retained; not native evidence |
| 2 | Actual Rust listener + SQLCipher + production mobile transport/outboxes over real TLS, one controlled host | PASS — `packages/lan-hub` + `apps/mobile/__integration__`; run 43635776225, 26/26 |
| 3 | Separate desktop host and mobile device on a private LAN | BLOCKED — no second physical device in this environment |
| 4 | Physical device Keychain/Keystore, URLSession/OkHttp pinning, multicast discovery | BLOCKED — simulator/headless results are not hardware results |

Loopback is not LAN evidence. The Level-2 harness binds a private/link-local IPv4
interface because the production listener refuses loopback and public binds; a
TCP fault proxy forwards TLS records without terminating them. The Node TLS
adapter replaces only the Expo native-module boundary (`modules/sornio-lan`); it
is not Swift `SecTrust` or Kotlin `OkHttp` pinning evidence.

## Acceptance items

| # | Item | Status | Evidence / note |
| --- | --- | --- | --- |
| 1 | Native hub startup (production listener, no GUI) | PASS | Run 43635776225: `start_listener` seam binds a private IPv4 interface; headless fixture init/start/stop/restart exercised |
| 2 | Genuine SQLCipher persistence / DB init | PASS | `Store::open` with 64-hex key; `PRAGMA cipher_version` asserted; authoritative rows read back from `authority.db` |
| 3 | TLS configuration and certificate pinning | PASS | Trusted CA, wrong saved pin, alternate trusted cert, untrusted chain, expired cert, wrong-host SAN, malformed TLS JSON |
| 4 | Secure pairing / enrolment / owner approval | PASS | Discovery hints grant no access; pending device refused; owner approval enables session; enrolment replay stable |
| 5 | Device isolation and revocation | PASS | Recovery G: revoked device blocked for new session and recovery; enrolment replay reports revoked |
| 6 | Session lifecycle and expiry | PASS | Recovery F: expired token keeps unresolved command; reauthentication reuses the same operation ID |
| 7 | Authoritative workspace fetch | PASS | `/v1/workspace` parsed by production `hubWorkspace`; tables/orders/tickets/menu match native fixture |
| 8 | Kitchen Pending → Preparing transition | PASS | Durable event + immutable operation result; revision 2 → 3; identical replay does not advance again |
| 9 | Staff assignment / reassignment | PASS | Owner/manager assign and reassign; preparer refused; assignment history preserved |
| 10 | Invalid-operation rejection | PASS | Stale revision, skipped state, closed order, wrong shop/actor, operation identity conflict |
| 11 | Recovery A — request never delivered | PASS | Proxy drops before delivery; command stays unknown; same identity retried and accepted |
| 12 | Recovery B — response lost after commit | PASS | TLS 1.2 fault proxy cuts the command acknowledgement after commit; status-first `/v1/operation` adopts result; one operation row |
| 13 | Recovery C — repeated transport failures | PASS | Three consecutive drops; exactly one native effect; same operation ID |
| 14 | Recovery D — mobile restart | PASS | Real second SQLCipher client-store process reloads the encrypted outbox record |
| 15 | Recovery E — hub restart | PASS | Committed result and authoritative ticket survive native listener restart; recovery adopts result |
| 16 | Recovery F — session expiry during recovery | PASS | Unresolved command kept; fresh session resumes same ID |
| 17 | Recovery G — revocation during recovery | PASS | No bypass; command retained; ticket unchanged |
| 18 | Recovery H — revision conflict | PASS | Durable refusal; does not overwrite a supervisor advance; generation-changing restore invalidates stale sessions |
| 19 | Exactly-once effects / no financial posting | PASS | Financial table counts asserted zero; stock/price unchanged; settled invoice remains null |
| 20 | `secureStore.ts` fallback defect | PASS | Reproduced and fixed; see matrix below |
| 21 | Evidence levels distinguished | PASS | Level 1 retained; Level 2 executed (26/26); Levels 3–4 BLOCKED |
| 22 | CI jobs added / existing gates preserved | PASS | `native-hub.yml` is the only workflow changed vs PR baseline `4c8841d`; baseline seven workflows SUCCESS; companion typecheck + 72 runtime tests pass in the new job |
| 23 | Historical reports and scope preserved | PASS | Phase 20A–C report and `ios-tests` unchanged; no Phase 21, no UI redesign |

## Secure-storage defect (item 20)

Potential defect investigated: a per-call `.catch` fell back to a fresh
`MemorySecureStore`; a denied Keychain delete cleared only memory, so a later
native read could resurrect the session in the same or a later process.

Fix implemented:

- `requirePersistent` (all restaurant/kitchen/assignment/sign-out outboxes) never
  receives a volatile fallback; any native failure throws.
- Optional demo-session failures latch a handle to memory; it never alternates
  native and memory reads after a partial failure.
- A non-secret durable journal (`sessionVaultJournal.ts`, outside SecureStore)
  names the single vault grant permitted to restore. The native session record is
  an envelope bound to that grant; legacy, tombstoned, mismatched, missing or
  corrupt records are not resumable.
- Sign-out writes a signed-out intent before deletion, verifies removal, and
  tombstones the native record if deletion is denied or leaves a stale value.
- The UI reports unconfirmed secure removal instead of claiming durable sign-out.

Headless fault matrix (`apps/mobile/__runtime__/security-vault.test.tsx`), executed
with the full runtime suite: **72 tests passed** (13 new security cases). This is
JavaScript/runtime evidence against a fault-injected native boundary, **not**
iOS Keychain or Android Keystore hardware evidence.

| Case | Result |
| --- | --- |
| Persistent port get/set/delete success | PASS |
| Persistent port get/set/delete failure throws, no memory fallback | PASS |
| Grant-bound session persists and restores in a new handle | PASS |
| Legacy native session without matching grant ignored | PASS |
| Delete denial latches memory; signed-out journal blocks later process | PASS |
| Delete resolves but stale record remains → tombstone, no restore | PASS |
| Journal read failure never reaches native session | PASS |
| Journal write failure during sign-in → memory only, native invalidated | PASS |
| Corrupt or missing intent is not permission to restore | PASS |
| Non-session optional record fails closed then latches to memory | PASS |
| Sign-out UI reports unconfirmed removal on Keychain delete denial | PASS |
| Existing iPhone sign-out / re-enter demo regressions | PASS |

Physical-device Keychain/Keystore confirmation: **BLOCKED**.

## CI and measurements

- New workflow: `.github/workflows/native-hub.yml` (locked Cargo metadata, build
  of the production listener + fixture control, companion typecheck and runtime
  security matrix, Level-2 TLS/pairing/kitchen/recovery suite, `cargo fmt --check`).
- **Passing Level-2 run:** https://github.com/uddieee33-blip/Sornio/actions/runs/43635776225
  — head `a1dead6e0c4a8d2d8c8f1f238fbbe00d1088c73a`, conclusion `success`.
  Job: https://github.com/uddieee33-blip/Sornio/actions/runs/43635776225/job/132572128982.
  Artifact: `Sornio-native-hub-Level-2` (environment, metadata, build log,
  `native-hub-results.json`, Jest results; no test databases or private keys).
- Suite counts recorded by the runner: **Level 2 passed=26 failed=0 total=26**;
  companion runtime matrix **72 passed / 6 suites**; `tsc --noEmit` PASS;
  `cargo fmt --check` PASS. Local gates re-run after the fixes:
  `verify:mobile-contracts` 63 checks, `verify:cargo-lock` 3 manifests / 32 declared
  dependencies, `verify-lock` 10 groups, `verify:security` 53 invariants.
- Baseline PR #184 head `4c8841d`: all seven existing workflows SUCCESS, including
  Windows local and macOS desktop; 8 mobile jobs / 12 XCUITests preserved. The only
  workflow file changed relative to that baseline is the added `native-hub.yml`.
- Host for the passing run: `linux x64`, kernel `7.0.0-1019-azure`,
  AMD EPYC 9V74 (4 vCPUs), Node `v24.22.2`; generated
  `2026-11-14T20:10:10.800Z`. Methodology: `performance.now` around awaited
  requests; each native-adapter request opens a fresh TLS connection; the TCP fault
  proxy forwards TLS records without terminating them. These are controlled-host
  measurements, **not** simulator, physical-device, or separate-device LAN latency.

| Measurement | Milliseconds | Samples |
| --- | ---: | ---: |
| Identity probe | 107.911 | 1 |
| Initial authenticated workspace | 49.964 | 1 |
| Kitchen acknowledgement | 100.464 | 1 |
| Identical operation replay | 49.880–68.637 | 5 |
| Recovery after lost acknowledgement | 90.842 | 1 |
| Hub restart | 917.608 | 1 |
| Recovery after hub restart | 96.552 | 1 |

## Remaining blocked work

- Level 3 separate-device LAN and Level 4 physical-device pinning/Keychain/Keystore.
- Simulator vs physical-device conclusions are kept separate; no simulator result
  is reported as hardware confirmation.
