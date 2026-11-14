# Phase 16: guided hub setup and connection recovery

Implemented source on `feature/phase16-hub-setup`, based on verified/fetched Phase 15C commit `9ebafa22e5eb9e816df915e8c3fce3c68705ba0f` (draft PR #166). No merges or main changes.

## Delivered

- Desktop three-step setup: import matching TLS material, enable the private listener, and prepare public connection details for phones/tablets.
- Native owner-authorized TLS readiness and SHA-256 leaf-certificate fingerprint. No private key crosses renderer IPC. Matching material does not prove certificate dates, hostname coverage, OS trust or network reachability.
- Expiring public connection cards and QR links carrying only HTTPS origin and shop/hub metadata. No credential, staff identity, token, trust override or payment command is included. Cards reject extra fields, unsupported versions, stale timestamps, credential-bearing URLs and malformed data.
- Mobile card preview/paste and Sornio-link handling when the connection chooser is opened. Import fills fields only. HTTPS identity verification, native owner approval and staff sign-in remain separate explicit steps. No built-in camera scanner or automatic discovery was added.
- Up to five securely saved shop shortcuts, remembered after HTTPS identity matching. Selecting a shortcut only fills fields; removing it does not delete pairing credentials, drafts or outbox records. Concurrent and interrupted writes preserve the previous valid manifest.
- A close/reconnect action preserves saved work. Restoring the same shop and employee reloads its existing queue; no pending operation is retired by changing screens.
- Typed failure messages distinguish staff expiry/sign-in refusal, device/business access, rate limits, conflicting operation identity, incompatible protocol and uncertain outcomes. Transport keeps redirect refusal, bounded reads, timeouts and OS TLS checks. Arbitrary server error text is not displayed.

The shared card format lives in `packages/business-domain`; both native app frontends reuse it. Existing financial posting, schema v18, order revisions, permissions and immutable request identities are unchanged.

## Focused verification

Passed:

- Desktop TypeScript/Vite production build.
- Full mobile TypeScript check with installed dependencies.
- 22 shared setup/LAN/restaurant tests, including public-card secret exclusion, stale/malformed links, bounded shortcuts, interrupted/concurrent storage, retained unknown operations and existing idempotent recovery.
- 63 existing mobile contract checks and 38 desktop contracts. Existing renderer network/financial guards remain enabled.
- Strict shared-domain TypeScript and focused hub SQLite/migrated open-order SQL guards.
- Diff whitespace checks.

Native Rust compilation, certificate diagnostics, Windows/macOS installed UI, QR-reader/deep-link routing and real Android/iOS/iPadOS behavior have not been executed here. Cargo is unavailable and Cargo.lock regeneration remains required, including the desktop's direct sha2 dependency. Public certificate trust must still be provisioned through platform facilities. No devices are claimed synchronized from these source checks.

## Remaining limitations and next work

The connection card is an untrusted routing hint until the phone verifies the expected hub over HTTPS. QR links require a reader that can open the registered Sornio scheme; ordinary paste/manual setup remains available. Existing app navigation still determines when the chooser is displayed. Paired origins remain immutable: use a stable certificate hostname and update private DNS when the listener's address changes. Shortcut removal does not revoke a device; revocation remains an owner action on the desktop.

Automatic discovery, CA issuance/installation, certificate lifecycle automation and mobile financial settlement remain outside this increment. Next work is exact-source native compilation/interoperability, followed by guided CA provisioning and discovery that retains explicit hub verification. Mandatory financial and installed-platform release gates remain intact.
