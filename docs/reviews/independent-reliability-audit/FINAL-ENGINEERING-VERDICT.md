# Final engineering verdict

Code correctness: **PARTIAL**. Financial reliability: **PARTIAL**. Offline reliability: **PARTIAL**. Windows functional readiness: **BLOCKED** for this patch. Real-shop pilot readiness: **NOT READY**. Public release readiness: **NOT READY**. These are scope/evidence assessments, not claims that all untested functionality fails.

| Gate | Status | Evidence / limitation |
|---|---|---|
| G0 | PARTIAL | Remote main, PRs and new clean clone checked; prior machine and its U1 object unavailable. |
| G1 | PARTIAL | Native and renderer arithmetic tests pass; not all financial cases independently verified. |
| G2 | PARTIAL | Fault injection and process-death tests pass in Linux; not all paths/hardware. |
| G3 | PARTIAL | ₹600/₹400 and other native cases pass; final Windows receipt/restart pending. |
| G4 | PARTIAL | Exact retry, races and failures tested; not an all-path proof. |
| G5 | PARTIAL | Stock, return and concurrency cases pass; no exhaustive reconciliation. |
| G6 | PARTIAL | Credit/repayment/race tested; not all historical paths. |
| G7 | PARTIAL | SQLCipher/restart/restore tested locally; no real power failure. |
| G8 | PARTIAL | Native role tests pass; not exhaustive per command. |
| G9 | PARTIAL | Linux browser/native F8 and focus pass; Windows UIA pending. |
| G10 | PARTIAL | Linux PDF/CSS and Punjabi font pass; physical Windows printing pending. |
| G11 | PASS | Historical PR evidence and current Windows blockers separated. |
| G12 | PASS | Two confirmed defects fixed with regressions; two faulty fixtures corrected. |
| G13 | PARTIAL | Native 208 pass, six ignored; frontend/browser checks pass; exact-head Windows not run. |
| G14 | PASS | No GST/LAN/Android/sync integration or activation in diff. |
| G15 | PARTIAL | Isolated branch and code commits reviewed; remote publication is recorded separately. |
| G16 | PASS | Revert procedure documented in REMAINING-BLOCKERS.md. |
| G17 | PASS | Outstanding blockers explicitly documented. |
