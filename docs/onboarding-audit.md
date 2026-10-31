# Onboarding audit — first run on a single Windows PC

Question this answers: **can a new owner go from a fresh installer to a working cashier
screen without manual database work or developer tools?**

Method: source inspection of the exact shipped path at commit `103cd9d`, plus the
executable checks that cover its lower layers. It is **not** an installed-application
test — no Windows host was available (see the audit report). Anything marked *executed*
below was run on Linux in this session; anything marked *inspection* was read, not run.

## The path, step by step

| # | Step | What the owner does | Native code behind it | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Install | runs the NSIS installer, per-user, no admin | `bundle.windows.nsis.installMode = currentUser`, offline WebView2 | inspection + `verify-windows-release` |
| 2 | Launch | double-clicks Sornio | `device::initialize`: creates `%LOCALAPPDATA%\com.sornio.localreview`, takes an exclusive `provision.lock` so two simultaneous first launches cannot mint two keys, reads or creates a 256-bit key in **Windows Credential Manager**, opens SQLCipher | inspection; **never executed on Windows** |
| 3 | Encrypted schema | nothing | `Store::open` runs 12 migrations inside one immediate transaction, sets WAL, `synchronous=FULL`, `foreign_keys=ON`, `recursive_triggers=ON`, refuses a wrong key or a newer schema | **executed**: `verify-local-schema` replays all 147 DDL statements and asserts version 12 |
| 4 | Create access | business name, business type, owner display name, account name, password (10–128), confirm | `provision_owner` writes the owner, business identity and audit row in one transaction; rejects a second owner | **executed** at SQL level (owner trigger, single-owner index); Rust path by inspection |
| 5 | Session | automatic | `read_local_session` returns scope + principal; the renderer sends the scope with every later command, and the native side re-verifies role, revision, expiry and recovery generation on each call | inspection + `verify-desktop-contract` (scope always sent; 5 sessionless commands only) |
| 6 | Workspace loads | nothing | `load_workspace` → `{revision: 0, draft: null}` on a fresh install | inspection: the panels render on that snapshot, so nothing else must be created first |
| 7 | Add products | name, SKU, unit, price, opening stock | `add_local_product`, operation-id idempotent, pending-op fence | inspection; `verify-local-schema` covers the stock columns/limits |
| 8 | Add staff (optional) | owner opens Staff, creates account + role + password | `create_local_staff`; owner-only; roles owner/manager/assistant_manager/cashier; **native** permission table decides, not the UI | **executed** at SQL level (role check constraint, owner-protected, staff undeletable); Rust enforcement by inspection |
| 9 | Sell | search item, quantity, tax %, tender, confirm | `read_cashier_state` → `prepare_local_checkout` → `post_local_invoice`, all inside one writer transaction | inspection; `verify-native-money` proves the screen's total equals the writer's formula to the paise (executed) |
| 10 | Close the day | counted cash | `retail` close action with `through` fencing and immutable closing row | inspection; SQL guard executed |
| 11 | Recover | export/preview/restore encrypted backup | owner re-authentication, archive verified against trusted schemas + SHA-256, restore rotates the workspace generation | inspection; **never executed** (needs SQLCipher + Rust) |

No step requires SQL, a config file edit, an environment variable, an internet
connection, or a developer tool. That is the core answer, and it holds by inspection of
the shipped path.

## What is genuinely missing for a shop

These are gaps, not bugs:

1. **Statutory business configuration does not exist.** `OwnerSetup` carries only
   `business_name`, `business_type`, `display_name`, `username`. A repository-wide search
   for `gstin`, `ifsc`, `upi_id`, `pincode` and `hsn` across all native and renderer
   sources returns **zero matches**. There is no field, no schema column, no command and
   no screen for GSTIN, address, state code, bank details, UPI handle or HSN/SAC. An
   owner cannot record what a tax invoice needs. See
   [gst-invoice-requirements.md](gst-invoice-requirements.md).
2. **Onboarding is one form, not a guided sequence.** Everything is a single submit on
   the lock screen. It works, but it does not help an owner who does not know what a
   "business type" changes, and it cannot ask for the statutory details in item 1.
3. **A vestigial "FIRST WORKSPACE" draft panel is still shown to owners.** It is a
   leftover from the pre-#121 workspace design ("Keep a local draft"). It does not block
   anything, but it is the first thing an owner sees after creating access and it is not
   part of running a shop.
4. **No import for an existing catalogue.** A shop with 800 SKUs must type them.
   `verify-local-schema` confirms stable `id`/`sku` keys and bounded values, so an
   importer is feasible; none exists.
5. **No password recovery.** The UI states "password recovery is not available in this
   review" for local access; recovery is per-backup, not per-account. That is a
   defensible security posture for a pilot, but it must be told to the shop before they
   rely on the machine.

## Verdict

The *plumbing* for first-run onboarding is complete and, at the SQL layer, executed. What
is missing is the **statutory business configuration a retail shop actually needs**, and
an installer that has ever been run. Onboarding is therefore **not yet verifiable end to
end** and cannot be signed off for a pilot, but it is much closer than a rebuild would
suggest: the missing piece is an additive schema migration plus one guided screen, not a
redesign.
