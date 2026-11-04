# D1 — Repository and Evidence Baseline

**SORNIO — Phase 7 / Assignment 3** · Authentic Windows Verification, Design Contract Freeze & Implementation Readiness
**Status:** NONPRODUCTION DESIGN REVIEW — documentation and evidence index only.
**Date:** 2026-11-04 (UTC).
**Production implementation authorization:** NOT GRANTED. **Merge authorization:** NONE.

Every identifier in this document was verified live on 2026-11-04 via `git fetch`, `gh api` and
local source inspection. Historical identifiers supplied by the assignment were treated as
unverified starting points and re-checked; findings that differ from the historical record are
flagged explicitly.

---

## 1. Live repository state (verified 2026-11-04)

| Field | Verified value | How verified |
|---|---|---|
| Remote | `origin` = `https://github.com/uddieee33-blip/Sornio.git` | `git remote -v` |
| `origin/main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | `git rev-parse origin/main` |
| Local `main` | `1cc5c798d1eada9a16463213b0776c01e99d36f9` (identical to origin/main) | `git rev-parse main` |
| Working branch | `arena/bbc68aef-sornio` | `git branch -vv` |
| Working branch HEAD | `1cc5c798d1eada9a16463213b0776c01e99d36f9` | `git log -1 --format=%H` |
| HEAD vs origin/main | 0 ahead / 0 behind | `git rev-list --left-right --count origin/main...HEAD` → `0 0` |
| Working tree | clean — no tracked modifications | `git status --short` (empty) |
| Clone depth | **shallow** (single commit; `git log --oneline` returns 1 commit; HEAD is marked grafted) | `git log` output |
| Untracked files at assignment start | none relevant (design outputs for this assignment are created under `docs/design/phase7-assignment3/`) | `git status` |

**Consequence of the shallow clone:** local history for earlier branches (`arena/2c0afc32-sornio`,
`arena/457ce32c-sornio`, `f0b8e019848c79f9bc97528efd695f709b35581e`, `c264cde7`, etc.) is **not
present in this sandbox**. Those references were re-verified through the GitHub API instead, and
all source claims in this package were re-checked against the **current main tree**, which is the
only complete source available locally.

---

## 2. PR inventory (verified live via `gh pr list --state all`)

| PR | State | Mergeability | Head branch | Purpose / notes |
|---|---|---|---|---|
| #145 | MERGED (into main as `1cc5c79`) | merged | `arena/2a724501-sornio` | Phase 5 integration: PR #143 head + unique PR #144 Phase 4 changes + ₹1,000 installed-UI regression. **This is what current main contains.** |
| #144 | CLOSED (draft) | conflicting | `arena/457ce32c-sornio` | Phase 4 audit: installed-UI mixed cash+credit acceptance + runner-side installer. Audit branch head `c264cde7`; closed unmerged. |
| #143 | MERGED | merged | `arena/5ed2bd28-sornio` | Expo companion for Android/iOS (Phase 1). Draft-flagged at merge time per metadata; its split-credit fix logic (`1d6d0a2`) was carried into main via #145. |
| #142, #141, #140, #139, #138, #137, #136, #135, #133, #132, #130, #124, #122, #121, #120, #119, #118, #117, #116, #115, #114, #113, #112, #111, #110, #109, #108, #107, #106, #105, #104, #103, #101, #100, #99, #98, #97, #96, #95 | MERGED | merged | various | Prior phases (Windows foundation, billing, credit, recovery, theme, redesign history). |
| #134 | CLOSED (draft) | mergeable | `test/windows-evidence-verification-2026-11-01` | Windows evidence verification gate PR — closed unmerged. |
| #131, #129, #128, #125, #123 | CLOSED | various | various | Hardening/audit branch PRs — closed unmerged. |
| **#127** | **OPEN** | **CONFLICTING** | `feature/windows-gst-invoicing` | Add native GST arithmetic foundation and invoicing compliance checklist. **Prohibition applies: must not be integrated in this assignment.** |
| **#126** | **OPEN (draft)** | **CONFLICTING** | `feature/windows-shop-lan` | Add native single-shop LAN hub and durable multi-till checkout. **Prohibition applies: must not be integrated in this assignment.** |

No PRs were merged, closed or commented on during this assignment.

---

## 3. Phase 7 Assignment 1 and Assignment 2 locations (verified)

### 3.1 On `origin/main` (local checkout, complete)

`docs/design/cash-plus-credit-split.md` is the only file under `docs/design/` on main. It is a
reviewed implementation plan marked **"NOT IMPLEMENTED"** at authoring time (no Rust compiler was
reachable then). **Live verification on current main (2026-11-04):** the plan has since been
implemented and merged — `packages/local-store/src/billing.rs:321-344` contains the split-tender
credit path calling `customers::post_split_credit`, and `packages/local-store/src/customers.rs:480+`
contains `post_split_credit` **with the Phase-4 P0 fix** (it rejects completed/cancelled retail ids
via `local_retail_ops`/`local_retail_canceled` instead of calling `unclaimed()`, which would treat
the sale's own in-flight `local_retail_pending` row as an `OperationConflict`). The "NOT
IMPLEMENTED" header in the document is therefore stale relative to current main; the document is
retained as historical design context only.

### 3.2 On design branch `arena/2c0afc32-sornio` (GitHub API, not in local shallow clone)

Confirmed to exist at head **`f0b8e019848c79f9bc97528efd695f709b35581e`** — commit message
"docs(design): add Phase 7 Assignment 2 visual evidence and approval package". Directory listing
verified via `gh api .../contents/docs/design?ref=arena/2c0afc32-sornio`:

- `PHASE-7-ADAPTIVE-WORKSPACE-CONCEPT.md` (Assignment 1)
- `PHASE-7-ANDROID-COMPANION-AUDIT.md` (Assignment 1)
- `PHASE-7-ASSIGNMENT-2-VISUAL-EVIDENCE.md` (Assignment 2)
- `PHASE-7-CASHIER-WORKSPACE-BLUEPRINT.md` (Assignment 1)
- `PHASE-7-IMPLEMENTATION-APPROVAL-PACKAGE.md` (Assignment 2)
- `PHASE-7-IMPLEMENTATION-ROADMAP.md` (Assignment 1)
- `PHASE-7-SORNIO-DESIGN-SYSTEM.md` (Assignment 1)
- `PHASE-7-WINDOWS-ANDROID-EXPERIENCE-CONTRACT.md` (Assignment 1)
- `PHASE-7-WINDOWS-PROTOTYPE-REVIEW.md` (Assignment 2)
- `PHASE-7-WINDOWS-UX-AUDIT.md` (Assignment 1)
- `phase7-assignment2/` — prototype package: `README.md`, `index.html`, `VALIDATION.md`,
  `FONT-LICENSES.md`, `GENERATION.md`, `manifest.json`, `prototype.css`, `prototype.js`, `tools/`,
  and `assets/` with Direction A/B W1–W7 PNGs, responsive captures, comparison sheets, Android
  A1–A5 previews, browser render reconstruction, and bundled fonts.

**Phase 7 documents are absent from `origin/main`** (verified: `docs/design` on main contains only
`cash-plus-credit-split.md`). The approved visuals therefore live on the design branch and were
read by this assignment through the GitHub API (read-only).

---

## 4. Approved design assets (historical identifiers re-verified)

| Identifier from assignment brief | Live verification result |
|---|---|
| `origin/main` = `1cc5c798d1eada9a16463213b0776c01e99d36f9` | **Confirmed** (local + remote). |
| Phase 7 design branch `arena/2c0afc32-sornio` | **Exists** on GitHub (branch API); head `f0b8e019…`. Not present locally due to shallow clone. |
| Previous design commit `f0b8e019848c79f9bc97528efd695f709b35581e` | **Exists** on GitHub; commit subject "docs(design): add Phase 7 Assignment 2 visual evidence and approval package". Not in local clone. |
| Design directory `docs/design/phase7-assignment2/` | **Exists on the design branch**; contains the full prototype package listed in §3.2. Absent from main. |
| Founder-approved visual direction | **Direction A — Precision Retail**, approved with three Direction-B refinements (grouped totals, 12px noncritical radii, subtle payment-panel depth), per Assignment 2 approval package decision record and the current assignment text. |

---

## 5. Workstream A — Authentic Windows evidence

### 5.1 Evidence categories (strict, never mixed)

1. `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` — real screenshots produced by the
   installed Tauri/WebView2 app on a Windows machine (the `windows-local.yml` product workflow
   driving the packaged `*-setup.exe` install via `apps/desktop/check-native.py` with pywinauto UIA).
2. `BROWSER RENDER — NOT INSTALLED WINDOWS APP` — browser/print renders, including
   `docs/reviews/windows-saved-receipt-browser.png`, `windows-punjabi-receipt-browser.png`,
   `windows-customer-statement-browser.png`, `windows-recovery-browser-preview.png`.
3. `DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE` — the Phase 7 prototype PNGs under
   `docs/design/phase7-assignment2/assets/`.

No browser screenshot or prototype in this assignment is promoted to authentic installed-app
evidence, and no authentic capture was found or fabricated.

### 5.2 Artifact provenance (metadata verified live)

| Artifact id | Name | Run | Run head SHA | Run branch | Size (B) | SHA-256 (GitHub-reported) | `expired` |
|---|---|---|---|---|---:|---|---|
| 13269596282 | Sornio-Local-Native-Captures | 41709217989 (SUCCESS, 2026-11-03T20:04:51Z) | `97b6899475cc3dfa3ff1370f59373401646eecfb` | `arena/2a724501-sornio` (PR #145 integration head) | 1,420,490 | `a664bb74b542eea796e3b84f1d951f59109d54d600c845f9dbe392e1f601955c` | false |
| 13266470821 | Sornio-Local-Native-Captures | 41702800767 (SUCCESS, 2026-11-03T19:23:22Z) | `21a3f7c9e5ac5c9941a5a7aadeea09617665155f` | `arena/2a724501-sornio` (earlier integration head) | 1,415,767 | `208b77f6f6ebce906e528515be4405230ff501303b1820dab16f91b191001413` | false |

Both runs executed `.github/workflows/windows-local.yml` on `windows-latest` — the offline product
workflow (cargo release+debug suites, NSIS installer, silent install, offline UIA acceptance via
`check-native.py`, installer manifest, `check-windows-evidence.py`, artifact upload). Both are
plausible authentic capture sources, **but only as metadata**: see §5.3.

### 5.3 Retrieval attempts (read-only, this sandbox) — BLOCKED

Attempted on 2026-11-04, in order:

1. `gh api repos/.../actions/artifacts/{13269596282,13266470821}/zip` and `gh run download` —
   both redirect to `productionresultssa{10,16}.blob.core.windows.net`, which is **not reachable**
   from this sandbox (`SSL_ERROR_SYSCALL`, connection refused at TLS).
2. Direct `curl -sSL` on the signed API URL — same Azure blob redirect, same TLS failure;
   downloaded size 0.
3. Prior documented attempts (2026-11-03, assignment 2 and `docs/mobile/WINDOWS-EVIDENCE-41457796087.md`):
   identical Azure EOF failures for native, browser and Android artifacts; no native ZIP/APK/PNG
   bytes were ever saved to this workspace.

**Outcome:** the artifact bytes were **not** downloaded, **not** visually reviewed, and **not**
hashed locally. The SHA-256 values above are GitHub-reported `digest` fields, not hashes computed
from bytes held in this sandbox. No new billable CI run was triggered; no Windows machine is
reachable from this sandbox; no installer or capture was fabricated.

### 5.4 What the workflow actually captures (source-verified)

`apps/desktop/check-native.py` drives the **unmodified installed packaged exe** on a Windows runner
(`Application(backend="uia").start(EXE)`), performs real keyboard input, and saves screenshots to
`dist/native-review/`. It catalogues **28 capture names** (27 literal strings plus
`windows-installed-preserved.png` built at line 230):

`windows-backup-preview.png`, `windows-backup-restored.png`, `windows-customer-credit-sale.png`,
`windows-customer-ledger.png`, `windows-customer-partial-repayment.png`, `windows-first-setup.png`,
`windows-installed-preserved.png`, `windows-local-cash-receipt.png`, `windows-local-checkout.png`,
`windows-local-failure.png`, `windows-local-locked.png`, `windows-local-next-sale-reopened.png`,
`windows-local-reopened.png`, `windows-local-restored.png`, `windows-local-saved.png`,
`windows-local-stock.png`, `windows-mixed-cash-credit-sale.png`, `windows-mixed-split-reopened.png`,
`windows-owner-staff.png`, `windows-product-creation.png`, `windows-retail-closing.png`,
`windows-retail-pending-payment.png`, `windows-retail-reconciliation.png`,
`windows-retail-return-refund.png`, `windows-staff-disabled.png`, `windows-thousand-split-reopened.png`,
`windows-thousand-split-sale.png`, `windows-unlock.png`.

`apps/desktop/check-windows-evidence.py` (runs in-workflow) requires **4 specific captures**
(`windows-first-setup.png`, `windows-local-cash-receipt.png`, `windows-retail-closing.png`,
`windows-installed-preserved.png`), hash-verifies them, and separately requires
`installer-artifact.json`, `installer-lifecycle-result.json`, `installer-manifest.json`
(installer SHA-256, installed-exe SHA-256, commit SHA). `test_windows_evidence.py` covers fixture
and tamper cases locally (16/16 reported by the Phase 4 review; not re-run here — see §8).

### 5.5 Display matrix — measured vs blocked

| Resolution | Scaling | Purpose | Status |
|---|---|---|---|
| 1280×720 | 100% | Minimum-height operational baseline | **NOT MEASURED** — no authentic capture available in sandbox. Source-level analysis only (D3 §C-W1/W2). |
| 1366×768 | 100% | Common shop workstation | **NOT MEASURED** — same blocker. |
| 1600×900 | 100% | Intermediate display | **NOT MEASURED** — same blocker. |
| 1920×1080 | 100% | Full-HD workstation | **NOT MEASURED** — same blocker. |
| 1280×720 | 125% | Reduced effective viewport stress test | **NOT MEASURED** — the 125% test cannot be substituted by shrinking a static screenshot; no browser/WebView viewport measurement was possible in this sandbox. |

No browser/WebView content-viewport measurement, clipping measurement, internal-scrolling
measurement or actionable-control measurement could be performed here. The sandbox has no
Windows/WebView2 runtime; the only render evidence available is the committed browser previews
(classified `BROWSER RENDER`) and the design-branch prototypes (classified `DESIGN PROTOTYPE`).

### 5.6 Environment identity for any future capture

Required recording fields (per assignment §A2) — none available in this sandbox, so every field is
unavailable rather than assumed:

- Executable/build identity: NSIS `*-setup.exe` product installer built by `windows-local.yml`
  (exact filename and SHA-256 only obtainable from an artifact or a runner run);
- Source commit and artifact origin: run 41709217989/41702800767 heads `97b6899…`/`21a3f7c…`
  (both on the PR #145 integration branch, which is the code parent of current main);
- Capture date and environment: run timestamps above; `windows-latest` hosted runner;
- Display resolution and DPI scaling: **not recorded in available metadata** (screenshots are
  pixel images; DPI facts are not in the artifact record);
- Original unmodified capture: exists only inside the expired-in-sandbox artifacts;
- Classification: would be `INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE` **if** retrieved.

### 5.7 Evidence verdict (Gate A)

**BLOCKED.** Artifact metadata is verified and non-expired, but capture bytes are unreachable from
this sandbox (Azure blob egress block) and no Windows machine is available. Authentic installed-app
visual verification could not be performed here. Per assignment rules, this is a blocker, not a
pass; the remaining planning work continues with the limitation explicitly labelled.

---

## 6. Upstream source changes affecting AppShell, checkout, financial state or theme

Verified on current main (2026-11-04):

- **AppShell:** `apps/desktop/src/main.tsx` (201 lines) — `App` owns session, draft, snapshot,
  `dirtyOwners`/`busyOwners` coordination, lock/reopen prompts, focus restoration and the stacked
  panel composition; `AccessGate.tsx` wraps unlock. The shell is a 238px rail + single long
  `main.page` scroll (`style.css`). No route-level composition exists yet.
- **Checkout / financial state:** `CheckoutPanel.tsx` (553 lines) with `retailRef` +
  `operationId: crypto.randomUUID()`, F2/F3/F4/Enter/F8/Escape handling, exact-paise split equality,
  customer-credit requirement, `UPI (unverified…)`/`Card (unverified…)` labels, review-before-post.
  Native authority: `packages/local-store/src/billing.rs`, `payments.rs`, `customers.rs`,
  `access.rs`; Tauri commands in `apps/desktop/src-tauri/src/main.rs`.
- **Theme configuration:** desktop plain CSS `apps/desktop/src/style.css`; web paints in
  `lib/theme/palettes.json` + `app/themes.css`; mobile tokens `packages/mobile-design/src/tokens.ts`.
  Three unrelated token systems exist (documented in D2 §B1.4).
- **Phase-4 P0 fix present on main:** `post_split_credit` no longer calls `unclaimed()` on the
  in-flight retail pending row (verified at `customers.rs:480-508`). The mixed cash+credit sale path
  is implemented on main, with the `credit_sale_once` unique index intact.
- **No Phase 7 production changes exist on main** — the design package is documentation/prototypes
  on the design branch only.

---

## 7. Stop-condition check (assignment §2)

Branch state is **not ambiguous**: working branch is the authorized Arena branch, HEAD equals
origin/main, working tree is clean, no unexpected modifications. No stop condition triggered.

---

## 8. Local validation performed (this assignment)

- `git fetch origin --prune`, `git status`, `git rev-parse`, `git log` — repository reconciliation.
- `gh pr list --state all` — PR inventory (§2).
- `gh api` commit/branch/artifact/run lookups — design branch, design commit, artifact metadata,
  run metadata (§3, §4, §5.2).
- Source inspection: `main.tsx`, `CheckoutPanel.tsx`, `style.css`, `native.ts`,
  `apps/desktop/src-tauri/src/main.rs`, `packages/local-store/src/{billing,payments,customers,lib}.rs`,
  `check-native.py`, `check-windows-evidence.py`, `test_windows_evidence.py`,
  `apps/mobile/app.json`.
- No billable CI triggered. No production file modified. No tests weakened or skipped.

**Known limitation:** cargo/`npm run verify` were **not** re-executed in this sandbox (no Rust
toolchain is reachable here per the assignment-2 environment; re-running unchanged suites adds no
evidence and consumes no new CI). All test claims in this package trace to the Phase 4/5 review
records and workflow definitions, labelled as such in D4/D6.
