# Execution provenance and retained non-passing attempts

Client date: 31 October 2026 (Asia/Kolkata). Repository parent: 6043f52b0d166044766eedf2d5a1e76c8fce7595.

Archived text logs have trailing whitespace normalized; no result lines were omitted.

Final code and workflow hashes: source-manifest.json. No product source changed after these final native debug/release runs.

Final Rust environment:
- rustc 1.99.1 (58cf8f9c3 2026-10-13), x86_64-unknown-linux-gnu
- CARGO_BUILD_JOBS=2; RUST_TEST_THREADS=4; PROPTEST_RNG_SEED=20261031
- OPENSSL_NO_VENDOR=1; OPENSSL_LIB_DIR=/usr/lib/x86_64-linux-gnu; OPENSSL_INCLUDE_DIR=/usr/include
- Bundled SQLCipher remains enabled. No repository Cargo features or lockfiles changed.
- Debug: 177 library + 6 command-security passes, zero failures; 3 ignored subprocess workers exercised by passing parents.
- Release: same 183 passes and worker accounting.

The focused returns-before.log contains two genuine baseline failures: ReturnLine rejected the unsupported disposition field. returns-after.log records 13 passing focused native cases before four later race/number/corruption checks were added. Final logs include every added test.

Additional intermediate attempts were not all successful:
- The initial local target directory lacked retained openssl_sys/libc rlibs. initial-build-failure.log preserves the error. The affected local dependency build products were cleaned and rebuilt.
- An initial new restart regression included legitimate reauthentication audit rows in its before/after comparison. It failed with an audit snapshot mismatch, not a duplicated financial effect. It was repaired to compare complete state immediately around replay, independently checking persistent stock and cash after reopen. No financial assertion or required product audit was removed.
- A new recovery test initially referenced a nonexistent Workspace.pending_retail helper. It was corrected to use the actual authorized retail_view result before final compilation.
- intermediate-release-link-failure.log preserves a local release link failure with missing test symbols. A cargo clean --release -p sornio-local-store and fresh build passed without changing product code, test selection or compiler optimization settings.
- The scale fixture initially supplied unsupported businessType=retail; it was corrected to the established general identifier. It then assumed unlock_workspace returned a LocalSession; it now reads read_local_session after successful unlock. Both fixture errors are retained in the initial-scale-* logs. The final native-scale.json is a passing independent run.

Frontend/other final checks:
- npm run build --prefix apps/desktop: TypeScript and production Vite bundle PASS.
- Targeted ESLint: PASS, existing Next pages-directory configuration notice retained in eslint.log.
- node --check apps/desktop/check-retail.cjs and Python compile: PASS.
- Three changed workflow files parsed as YAML; integration target and scale commands retained.
- Shared domain/native invoice/checkout checks: PASS, shared-domain.log.
- Installer ciphertext preservation helper: 4 PASS, install-helper.log. This is not installed-application evidence.
- git diff --check: PASS.
- Fresh npm desktop lockfile audit: zero reported vulnerabilities, desktop-npm-audit.json.
- Fresh cargo-audit 0.22.2: local-store and Tauri lockfile outputs retained. Tauri's two informational warnings are not suppressed.

Browser attempt:
- Default Playwright browser download returned invalid/truncated archive content.
- Chrome 156.0.8078.79 was obtained separately and its --version command succeeded.
- Actual Playwright launch then failed before page execution: process_singleton_posix socket() failed: Operation not permitted; no browser acceptance or screenshot was produced.
- The environment approval policy rejected an unsandboxed launch: sandbox_approval=false, request_permissions=false. No bypass followed. Native stdio acceptance is separately identified.

Windows and LAN:
- No Windows runtime exists on this host. Baseline Actions failures had no executed steps; baseline-and-ci.json retains available diagnostics.
- No current installer, Windows screenshot, TLS transport or physical two-PC result was produced.
- No code was merged, deployed or used with real business records. No billing, visibility, branch-protection or account permission settings changed.
