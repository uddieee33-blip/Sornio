# Sornio's Windows entry point — which executable is the product

This file ends an ambiguity that could put the wrong binary in a shop.

## The two Windows applications

| | **Product** | **Not the product** |
| --- | --- | --- |
| Path | `apps/desktop` | `desktop/windows` |
| Runtime | Tauri 2 (Rust + React), bundled assets | C# WinForms + WebView2 |
| Network | none required; all app code is local | loads `https://dukaan-os-six.vercel.app` |
| Works offline | **yes** | **no** — shows "Cannot reach your business" without internet |
| Data | local SQLCipher database, Windows Credential Manager key | server-side; no local records |
| Product name | `Sornio Local Review` (`com.sornio.localreview`) | `Sornio Hosted Preview` |
| Executable | `sornio-desktop.exe` | `SornioHostedPreview.exe` |
| Installer | NSIS `Sornio Local Review_<version>_x64-setup.exe` | Inno `Sornio-Hosted-Preview-Setup-x64.exe` |
| Pipeline | `.github/workflows/windows-local.yml` | `.github/workflows/windows-desktop.yml` |
| Trigger | pull request on the integration branches + manual | **manual dispatch only** |
| Purpose | the shopkeeper's offline business record | browser-side review of the hosted web app |

**The product is `apps/desktop`.** It is the only implementation that satisfies the
requirement this milestone is about: a shop must be able to install Sornio, configure
it, sell, and recover data with no internet connection. `desktop/windows` is an
online-only shell around the hosted web app; it is kept only so the web app can be
reviewed in a Windows window.

## How distribution of the wrong executable is prevented

1. **Only one pipeline can publish a product installer.** `windows-local.yml` is the
   only workflow that uploads `bundle/nsis/*-setup.exe`, which is what Tauri's NSIS
   bundler produces. `scripts/verify-windows-release.mjs` asserts this list has exactly
   one member and that it builds `apps/desktop`.
2. **The preview can no longer run by accident.** `windows-desktop.yml` has no
   `pull_request` or `push` trigger — only `workflow_dispatch`. A review build can no
   longer appear as a side effect of normal work.
3. **The two artefacts cannot share a name.** The preview's assembly is
   `SornioHostedPreview` (was `Sornio`), its installer is
   `Sornio-Hosted-Preview-Setup-x64.exe` (was `Sornio-Setup-x64.exe`), its install
   directory and Start-menu entry say *Hosted Preview*, and it installs nothing named
   `Sornio.exe`. Its Inno script and `.csproj` both state in-file that they are not the
   product.
4. **Every preview artefact is prefixed** `Sornio-Hosted-Preview`, asserted by name in
   the verifier, so a download page or an artifact list cannot be misread.
5. **Identity and version cannot drift.** `package.json`, `Cargo.toml` and
   `tauri.conf.json` must agree on `0.3.0`, and the NSIS update identity must share the
   major.minor. A version drift is not cosmetic: Tauri's NSIS installer keys upgrades on
   the product identifier, so a drifting version is how an "upgrade" becomes a second
   installation that cannot see the shop's existing data.
6. **The offline renderer may not reference the hosted origin.** No file in
   `apps/desktop/src` may contain `dukaan-os-six.vercel.app` or any `http(s)://` URL, so
   the product cannot silently become a wrapper.

All six are enforced by `npm run verify:windows-release` (33 assertions), which runs in
`npm run verify` and therefore in the CI job once runners are available again, and can be
run by hand at any time.

## Operating rule for a shop

> Install only `Sornio Local Review_<version>_x64-setup.exe` (NSIS, from the
> **Windows local workspace** pipeline). If the file name contains `Hosted-Preview`, or
> the installer was produced by the **Windows hosted preview** pipeline, it is not the
> offline product and must not be used at a counter.

## Status honesty

This document describes packaging intent, verified by static assertions over workflow,
manifest and renderer sources. **No Sornio installer of either kind has been built or
installed for this commit**, because every GitHub Actions job is still refused before
step 1 by the account billing restriction (see the audit report). Nothing here is
evidence that an installer works.
