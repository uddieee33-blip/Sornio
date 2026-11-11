# Phase 10B — Windows acceptance handoff

Status: **NOT ACCEPTED**. Use an isolated disposable Windows 10/11 x64 PC or VM, an empty standard Windows user profile and synthetic data only. The locally committed candidate SHA is supplied with the handoff; verify it with `git rev-parse HEAD` and `git status --short` before building. Its parent is `cf58c3ba3fa4638ad95fe838129181c1b83a0fb0`. Never substitute the hosted preview for the offline Tauri product. Do not run acceptance against a shop profile or real customer records.

## Prerequisites and identity

Install Node 24, the Rust toolchain and Windows MSVC build tools/Windows SDK, required Tauri dependencies and a supported Perl for the locked vendored OpenSSL build. Record `node --version`, `cargo --version`, `rustc --version`, `winver`, OS architecture, WebView2 runtime state and the machine/user context. Locked dependency acquisition and initial toolchain setup need network; use a trusted isolated environment. Before test runs verify the exact commit, working tree and lockfiles. Record build log, source SHA/tree and host.

On a clean PowerShell session in the exact source tree:

```powershell
git rev-parse HEAD
git rev-parse HEAD^{tree}
git status --short
node --version
cargo --version
rustc --version
npm ci --prefix apps/desktop
node --test apps/desktop/test-scan.mjs
npm run build --prefix apps/desktop
$env:RUST_TEST_THREADS = '4'
cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw 'Native debug tests failed' }
cargo test --all-targets --release --locked --manifest-path packages/local-store/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw 'Native release tests failed' }
npm run desktop:build --prefix apps/desktop
if ($LASTEXITCODE -ne 0) { throw 'Tauri NSIS build failed' }
```

PowerShell requires quoting Git's `HEAD^{tree}` in some versions; if necessary use `git rev-parse 'HEAD^{tree}'`. Record every command's exit code and full output, including ignored tests. Both Cargo profiles and a fresh native bridge are required; historical results do not transfer to a modified candidate. The workflow uses Strawberry Perl `C:\Strawberry\perl\bin\perl.exe`, checks `IPC::Cmd` and `Locale::Maketext::Simple`, and sets `OPENSSL_SRC_PERL`; use a trusted supported equivalent on a development machine and record exact selection. Never weaken a test to bypass a toolchain failure.

## Browser and native bridge

With compatible Playwright 1.62.1, Chromium, permitted loopback and local sockets, compile a bridge from this same source (`cargo build --locked --manifest-path packages/local-store/Cargo.toml --example cashier_review_bridge`). Start `npm run dev --prefix apps/desktop`; follow `.github/workflows/workspace-browser.yml` for the checkout, focus, authorization, receipts, recovery and other browser scripts. Supply correct absolute Chromium/Playwright paths and capture output and exit status. `check-checkout.cjs` drives a native SQLCipher bridge through a test transport; UI/mock checks do not establish Windows/Tauri acceptance.

## Package provenance and installed application

For the produced `apps/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe`, record SHA-256 and Authenticode status with `Get-FileHash` and `Get-AuthenticodeSignature`; record filename, build log, commit and tree. After installing to the disposable profile, separately hash the installed `sornio-desktop.exe`. These are different byte streams; an archive hash is not an installer hash. Repeat hash on transfer. The repo's `check-installer.ps1` is restricted to an ephemeral GitHub-hosted Windows runner and adjusts firewall rules and test application data. Do not spoof its guard or run it on a real shop computer. Its bundled `check-native.py` drives Windows UIA against synthetic data; use only in the safe environment it expects. A separately reviewed installed-app procedure is needed for an isolated non-hosted Windows machine.

## Physical evidence

Use `docs/reviews/windows-physical-pilot-acceptance-plan-2026-11-02.md`, updated for focused Alt+Enter/click and safe scanner handling. Record candidate SHA, installer and installed-exe hashes, OS/WebView2 state, scanner/printer models, date/operator, before/after stock, invoice IDs, cash/credit balances, screenshots and paper samples without exposing passwords. Exercise all 15 steps with the actual printer and scanner, disconnected Ethernet/Wi-Fi, backup export and restore on dedicated test media, wrong-password refusal, restart and safe OS process termination. Test absent-WebView2 offline installation if that is a claimed requirement. Review needs plain scanner Enter to leave the invoice unposted, then a deliberate click or focused Alt+Enter to post once. Verify unknown and ambiguous barcode behavior, leading zeroes, piece and weighted items, repeated scans, cancellation and retry. A single failed mandatory check blocks pilot. Same-version reinstall does not prove upgrade safety.

For each failure record source SHA/tree, tool versions, exact command or step, exit status, expected versus observed result, sanitized logs and state before/after, plus whether an invoice or stock/ledger mutation occurred. Preserve evidence and avoid automatic retries until the outcome is understood. No hosted workflow is authorized by this handoff; establish execution/storage eligibility separately before any dispatch.
