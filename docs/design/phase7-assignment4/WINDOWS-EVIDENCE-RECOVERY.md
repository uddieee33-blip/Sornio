# WINDOWS EVIDENCE RECOVERY

**SORNIO — Phase 7 / Assignment 4** · Authentic Windows evidence recovery attempt and root-cause
determination.
**Date:** 2026-11-04 (UTC). **Billable CI triggered:** none. **TLS validation disabled:** never.
**Credentials exposed:** none. **Artifact bytes retrieved:** **0**.

---

## 1. Objective and honest bottom line

Recover the original installed-Windows capture archives so that W1–W7 can be reviewed as authentic
pixels.

**Result: recovery FAILED, and the failure is now root-caused.** The archives exist, are unexpired
and are correctly authorised by GitHub, but this sandbox cannot complete a TLS handshake with the
storage host that serves them. No capture bytes exist in this environment, so no visual review was
performed and none is claimed. This document records the attempt precisely rather than restating a
generic "network error."

---

## 2. Artifact metadata (live-verified via GitHub API, 2026-11-04)

| Field | Artifact 13269596282 | Artifact 13266470821 |
|---|---|---|
| Name | `Sornio-Local-Native-Captures` | `Sornio-Local-Native-Captures` |
| Source run | `41709217989` | `41702800767` |
| Source commit (head_sha) | `97b6899475cc3dfa3ff1370f59373401646eecfb` | `21a3f7c9e5ac5c9941a5a7aadeea09617665155f` |
| Size (bytes) | 1,420,490 | 1,415,767 |
| Created (UTC) | 2026-11-03T20:38:33Z | 2026-11-03T19:56:41Z |
| Expires (UTC) | **2026-11-10T20:38:31Z** | **2026-11-10T19:56:39Z** |
| `expired` flag | `false` | `false` |
| Life remaining at time of check | ~6 days | ~6 days |
| SHA-256 | GitHub-reported only (`a664bb74…` / `208b77f6…`); **not verifiable here** | same |

Both artifacts are still live. Retention is 7 days from creation; they expire 2026-11-10.

> **Time-critical:** if the founder wants the original captures from these runs rather than a new
> Windows run, they must be downloaded **before 2026-11-10** from a host with unrestricted egress.

---

## 3. Retrieval attempts and exact failure chain

Three read-only methods were tried previously (`gh run download`, `gh api …/zip`, `curl -L`) and all
failed with `SSL_ERROR_SYSCALL`. Assignment 4 changed the diagnostic approach instead of repeating
an identical request: it measured **where** in the connection chain the failure occurs.

| Step | Test | Result |
|---|---|---|
| 1 | DNS resolution of `productionresultssa16.blob.core.windows.net` | **Resolves** → 20.150.88.228, 20.150.82.228, 52.239.172.36 (trafficmanager → `blob.bn9prdstrz04a`) |
| 2 | TCP connect to that host on 443 | **OPEN** (control: `api.github.com:443` also OPEN) |
| 3 | TLS handshake — `openssl s_client`, certificate validation **ON** | `CONNECTED(00000003)`, certificate chain accepted, **`Verify return code: 0 (ok)`**, then `error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading`; cipher negotiated: `New, (NONE)` — **no session established** |
| 4 | GitHub API artifact endpoint with auth header | **HTTP/2 302** redirect to `productionresultssa16.blob.core.windows.net` — GitHub-side authorisation is correct |
| 5 | Follow the redirect with `curl -sSL`, validation **ON** | `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to productionresultssa16.blob.core.windows.net:443`, `http_code=302`, `size=0` — **zero bytes** |
| 6 | Local file after attempt | none written |

### Root cause

The sandbox egress policy allows **TCP** to arbitrary hosts but terminates **TLS** for hosts outside
the allowlist (`github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`,
`pypi.org`, `files.pythonhosted.org`). The Azure storage host is outside that allowlist, so the TLS
record layer is reset mid-handshake — the exact signature of an intercepting proxy, not of a GitHub
outage and not of a transient network fault.

Consequences:

- The failure is **structural**, not intermittent. No client-side change (HTTP/1.1, different user
  agent, retry loop, alternate `gh` code path) can complete a handshake that the proxy resets.
- **Further retries are not justified** and were deliberately not performed, per the assignment's
  instruction not to repeat a failing endpoint without a meaningful change in conditions. The only
  meaningful change available — unrestricted egress — is outside this environment.
- Disabling certificate validation would not have helped (validation already passed; the connection
  dies after it) and is prohibited. It was not attempted.

---

## 4. What was NOT done, and why it matters

| Not done | Reason |
|---|---|
| Capture bytes downloaded | Structurally unreachable (above) |
| SHA-256 independently verified | Cannot hash bytes that do not exist locally; the digests are GitHub-reported metadata only, not local verification |
| Archive integrity/CRC checked | Requires the archive |
| W1–W7 screens reviewed as pixels | Requires the archive |
| New Windows capture run | **Billable CI authorization: NONE** — explicitly prohibited |
| Evidence stored to an access-controlled location | Nothing to store; fabricating an evidence folder would breach Gate A10/G10 |
| Screenshots recreated or synthesised | Prohibited — never promote prototypes/browser renders to installed evidence |

---

## 5. Evidence integrity statement

- No image, ZIP, checksum or log in this package or its siblings was invented, edited, or
  re-rendered to resemble an installed-application capture.
- The only authentic-capture facts asserted anywhere in Assignment 4 are the API metadata in §2 and
  the file-name inventory in `AUTHENTIC-CAPTURE-REVIEW.md` §2, which is derived from the capture
  driver's source (`check-native.py`), not from images.
- Where this package describes appearance or layout, it says so as **computed from source CSS** or
  **browser-render evidence**, never as installed-Windows measurement.

---

## 6. Exact conditions required to close A2/A3

Either path closes Gate A2 (recovery). Only path 1 closes A3 (authentic visual verification of the
*historical* runs).

**Path 1 — recover the existing archives (recommended; no CI cost, before 2026-11-10)**

1. From a machine with normal internet access, open the two runs in the Actions UI (or use
   `gh run download 41709217989 -n Sornio-Local-Native-Captures`).
2. Record the local SHA-256 and compare with the digests above.
3. Store the unmodified ZIP in access-controlled evidence storage outside Actions.
4. Add the 28 PNGs to the evidence index with per-file provenance (run, commit, capture date).

**Path 2 — a new authorised Windows run**

Requires explicit founder authorisation for billable CI plus a Windows runner. Produces captures for
the *current* `main` (`1cc5c798…`), not for the historical commits — they are not interchangeable
with Path 1 and must be labelled with their own commit.

**Path 3 — physical shop hardware capture**

Requires the founder's physical pilot authorisation; this is the only path that can also satisfy
printer/scanner/power-loss and Gurmukhi-print evidence.

None of these paths is available inside this environment.

---

## 7. Gate A2 verdict

**BLOCKED.** Artifacts are live and authorised; delivery is prevented by a documented structural
network control. Zero bytes recovered. No claim of recovery success is made.
