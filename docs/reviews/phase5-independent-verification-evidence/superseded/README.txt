SUPERSEDED RUNS — NOT USED AS EVIDENCE OF PRODUCT FAILURE.

These runs were executed in /home/user/phase5-verify/workspace, which contains
the verifier's OWN added independent test modules. Midway through this batch the
verifier wired an additional probe module into recovery.rs, so the later cargo
invocations recompiled and failed on the VERIFIER's probe code (E0308), and
`cargo fmt --check` flagged the VERIFIER's unformatted test files.

They are retained for transparency only. The authoritative gates were re-run
against /home/user/phase5-verify/pristine — a byte-exact export of d79a6e8 with
NO verifier additions — and are recorded as 07p-*.txt.

Verified: production code in workspace vs pristine differs ONLY by added
#[cfg(test)] mod declarations (see report §2).
