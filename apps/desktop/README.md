# Sornio Windows app — first local slice

This is the first implementation of the Windows plan discussed on 26 October:
an independent React/Tauri app with bundled screens, native encrypted SQLite,
then offline business commands, LAN, cloud and Android. The older
`desktop/windows` package is a connected WebView review host; it is not this app.

## Run on Windows

Install Node 24, Rust stable and Microsoft's C++ build tools. From this folder:

```sh
npm ci
npm run desktop:dev
npm run desktop:build
```

The NSIS setup is under `src-tauri/target/release/bundle/nsis`. It is an unsigned
engineering review, with its own application identity and data directory.
The WebView2 offline installer is included, so setup does not need to fetch
the browser runtime. No public download is configured by this change.

The Vite development server is a local development tool. Opening it in a normal
browser refuses local storage access; there is no browser database fallback.
Production assets are embedded in the Windows binary, not loaded from Vercel.

## What works

- Open the bundled workspace without the public website or a Next.js server.
- Save and reopen a sample business draft using SQLCipher-encrypted SQLite.
- Keep the random database secret in Windows Credential Manager, never JavaScript,
  environment variables, the package, or a plaintext sidecar file.
- Serialize first-use key provisioning; refuse missing keys, unreadable stores,
  newer schemas and failed writes without deleting/resetting records.
- Use committed revisions to reject stale writes from a second window/process.

Commands accept a bounded draft and expected revision, never SQL, filenames,
keys, URLs or an arbitrary tenant. Native permissions belong only to the bundled
main window. No filesystem, shell, HTTP or SQL plugin is exposed to the UI.

## Limits

Test data only. This does not import or replace the existing account database.
It has no business identity verification, PIN/device unlock, roles, production
onboarding, billing, signed entitlements, sync, backup/recovery or printing.
Encryption currently protects one review workspace per Windows user; it does
not yet implement per-business/staff separation. Software executing as that
Windows user may access its Credential Manager. Losing that Windows profile
can make the draft unrecoverable; backup/key recovery is a later release gate.

The review UI is English only. Existing web language catalogs remain unchanged;
desktop language parity is required before customer release. It is a storage
foundation, not a completed port of the eight business consoles.

## Checks

```sh
cargo test --locked --manifest-path ../../packages/local-store/Cargo.toml
npm run build
```

The first command tests real SQLCipher storage and survives process close/reopen,
wrong keys, stale writers, validation, failed writes and newer-schema refusal.
On Windows this also includes a Credential Manager test using a temporary,
separate vault entry; missing credentials must never cause key replacement.
The Windows workflow also produces a review setup and native-screen captures.
