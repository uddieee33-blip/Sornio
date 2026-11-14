//! Write a historical-format compatibility fixture, and report which SQLCipher wrote it.
//!
//! This example is run twice, from two different trees, with the same source:
//!
//!   * from the tree that shipped SQLCipher 4.6.1, to write the fixture;
//!   * from the current tree, to report the SQLCipher version it would use.
//!
//! Because the same source is compiled into both builds, the version each run reports is the
//! version of the build that actually compiled it - not a number copied out of a manifest. The CI
//! job compares the two reports and fails if the historical build is not the version the release
//! record claims it is.
//!
//! Everything written here is synthetic: a throwaway business, one product with opening stock and
//! one owner account. No customer data, no real key. The key is the test-only constant the
//! compatibility test also uses, and it is the same constant in both trees, so a fixture written
//! by the old build can be reopened by the new one.
//!
//! Usage: `seed_compat_fixture <output-path>`

use sornio_local_store::access::Workspace;
use sornio_local_store::catalog::AddProduct;
use sornio_local_store::identity::OwnerSetup;
use sornio_local_store::Store;
use std::path::PathBuf;

/// The test-only key the compatibility test opens the fixture with.
///
/// It must stay identical to `KEY` in `packages/local-store/tests/sqlcipher_compat.rs`. The CI job
/// extracts both constants and fails if they differ, so a fixture can never be written with a key
/// the test does not use. It is a published test constant, not a credential.
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// The password the fixture's owner account is set up with.
const PASSWORD: &str = "Compatibility fixture password";

fn main() {
    let path = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: seed_compat_fixture <output-path>"),
    );

    // A stale file (or a leftover write-ahead log from an earlier run) would make the fixture look
    // like something this build wrote. Start from nothing.
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
    }

    let mut workspace = Workspace::new(
        Store::open(&path, KEY).expect("the fixture store must open with the test key"),
    );
    workspace
        .provision_owner(
            OwnerSetup {
                business_name: "Synthetic Compatibility".into(),
                business_type: "general".into(),
                display_name: "Owner".into(),
                username: "owner".into(),
            },
            PASSWORD,
        )
        .expect("the fixture needs an owner account");
    workspace
        .add_product(AddProduct {
            operation_id: "rice".into(),
            name: "Rice".into(),
            sku: "RICE".into(),
            unit: "kg".into(),
            unit_price_paise: 10000,
            opening_stock_milli: 10000,
        })
        .expect("the fixture needs a product and stock");
    // Closing the connection checkpoints the write-ahead log, so the single file on disk holds
    // every page and the compatibility test can compare its bytes before and after.
    drop(workspace);

    // Ask the compiled SQLCipher which version this build is, rather than asserting it from a
    // version number in a manifest. The probe runs against an in-memory database so it cannot
    // touch the fixture on disk.
    let probe = rusqlite::Connection::open_in_memory().expect("the version probe must open");
    let reported: String = probe
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .expect("the build must report its SQLCipher version");
    let sqlite: String = probe
        .query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .expect("the build must report its SQLite version");
    // SQLCipher reports its version with a flavour suffix ("4.6.1 community"). Only the version
    // number is printed, so the CI job can read it as one field.
    let sqlcipher = reported
        .split_whitespace()
        .next()
        .expect("the reported SQLCipher version must not be empty")
        .to_string();

    // The schema version is read back from the file itself, so the fixture states which schema it
    // carries instead of the reader assuming it.
    let file = rusqlite::Connection::open(&path).expect("the fixture must reopen");
    file.pragma_update(None, "key", KEY)
        .expect("the test key must apply to the fixture");
    let user_version: i64 = file
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("the fixture must report its schema version");
    drop(file);

    // One machine-readable line, so the CI job can assert on it without parsing prose.
    println!(
        "compat-fixture path={} sqlcipher={} sqlite={} user_version={} bytes={}",
        path.display(),
        sqlcipher,
        sqlite,
        user_version,
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
    );
}
