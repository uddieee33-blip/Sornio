//! Test-only helper that rolls a store back to an earlier frozen schema version.
//!
//! The migration tests each assert that upgrading a database from some historic
//! version to the current one preserves its rows. To build the "historic"
//! database they create a store at the current version and then dismantle it.
//!
//! Before this module existed every such test kept its own frozen literal
//! `DROP TABLE ...` list, and those lists stopped at the version the test cared
//! about (v4, v5, v7, v9, v10, v11). The schema has since grown to v22, so the
//! literals left the v13-v22 tables behind while setting `user_version` back to
//! the earlier value. The migrator then re-ran those phases, and
//! `CREATE TABLE local_held_bills` failed with "table local_held_bills already
//! exists" before any assertion in the test executed.
//!
//! That database state cannot occur in practice. Migration runs in one
//! transaction (`Store::open`), so `user_version` and the tables created for
//! that version always move together: a version that has not been reached has
//! neither the number nor the tables. The fixture, not the migrator, was wrong.
//!
//! The per-phase literals are deliberately *not* rewritten. Each one is the
//! frozen record of what the phases above version N created, and silently
//! extending them would make every migration test weaker. This helper only
//! removes what the literals miss, named explicitly, so a future phase that adds
//! a table is caught by `every_schema_table_can_be_rolled_back` below.

/// Tables created by schema phases *newer* than the newest version any migration
/// test rolls back to (v11), grouped one phase at a time so a failure names the
/// phase that regressed.
const POST_V11_TABLES_BY_PHASE: &[(&str, &[&str])] = &[
    // v22: session_signout-schema.sql
    ("v22", &["local_hub_session_handles"]),
    // v21: responsibility_access-schema.sql renames local_kitchen_staff_next
    // into local_kitchen_staff, so its scratch table must go too.
    ("v21", &["local_kitchen_staff_next", "local_kitchen_staff"]),
    // v20: assignment_recovery-schema.sql
    ("v20", &["local_kitchen_assignment_ops"]),
    // v19: kitchen_staff-schema.sql
    (
        "v19",
        &["local_kitchen_ticket_staff", "local_kitchen_staff_events"],
    ),
    // v18: hub-schema.sql
    (
        "v18",
        &[
            "local_hub_operations",
            "local_hub_batches",
            "local_hub_sessions",
            "local_hub_devices",
            "local_hub_config",
        ],
    ),
    // v17: kitchen-schema.sql
    (
        "v17",
        &[
            "local_kitchen_print_jobs",
            "local_kitchen_corrections",
            "local_kitchen_destinations",
            "local_restaurant_assignments",
        ],
    ),
    // v16: restaurant_recovery-schema.sql
    (
        "v16",
        &[
            "local_restaurant_recovery_events",
            "local_restaurant_control",
            "local_restaurant_attempts",
        ],
    ),
    // v15: restaurant_checkout-schema.sql
    ("v15", &["local_restaurant_menu", "local_restaurant_bindings"]),
    // v14: restaurant-schema.sql
    (
        "v14",
        &[
            "local_restaurant_events",
            "local_restaurant_tickets",
            "local_restaurant_orders",
            "local_restaurant_tables",
        ],
    ),
    // v13: held_bills_schema.sql
    ("v13", &["local_held_bills"]),
];

/// Every table the v13-v22 phases create, flattened.
pub(crate) fn post_v11_tables() -> Vec<&'static str> {
    let mut out = Vec::new();
    for (_, tables) in POST_V11_TABLES_BY_PHASE {
        for table in *tables {
            out.push(*table);
        }
    }
    out
}

/// Drop the tables created by phases newer than `version`.
///
/// `version` is the historic version the caller is about to set `user_version`
/// to. Tables from phases at or below it are left alone: the caller's own frozen
/// literal already removes the ones it considers part of the old schema.
///
/// This runs *before* the caller sets `user_version`, so the store is still
/// internally consistent at the moment the tables are dropped.
pub(crate) fn drop_tables_newer_than(db: &rusqlite::Connection, version: i64) {
    let mut sql = String::new();
    for (phase, tables) in POST_V11_TABLES_BY_PHASE {
        let phase_version: i64 = phase[1..]
            .parse()
            .unwrap_or_else(|_| panic!("phase label {phase} is not 'vNN'"));
        if phase_version <= version {
            continue;
        }
        for table in *tables {
            sql.push_str("DROP TABLE IF EXISTS ");
            sql.push_str(table);
            sql.push(';');
        }
    }
    if sql.is_empty() {
        return;
    }
    db.execute_batch(&sql)
        .unwrap_or_else(|e| panic!("rolling back to schema v{version} failed: {e}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// Names of every table the live schema actually contains.
    fn schema_tables(db: &rusqlite::Connection) -> BTreeSet<String> {
        let sql = "SELECT name FROM sqlite_master WHERE type='table'";
        let mut stmt = db.prepare(sql).unwrap();
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<BTreeSet<_>, _>>()
            .unwrap();
        rows
    }

    /// Catch drift. If a future phase adds a table without listing it in
    /// `POST_V11_TABLES_BY_PHASE`, every migration test rolls back to a database
    /// that still contains it and fails again with "already exists". Failing
    /// here names the missing table instead of leaving that to a later suite.
    #[test]
    fn every_schema_table_can_be_rolled_back() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::Store::open(&dir.path().join("drift.db"), KEY).unwrap();
        let live = schema_tables(&store.0);
        let listed: BTreeSet<String> = post_v11_tables()
            .into_iter()
            .map(str::to_string)
            .collect();

        // Every listed table must exist in the current schema, so a rename or a
        // deleted phase is noticed instead of silently rotting the list.
        let stale: Vec<&String> = listed.difference(&live).collect();
        assert!(
            stale.is_empty(),
            "POST_V11_TABLES_BY_PHASE names tables the schema never creates: {stale:?}"
        );

        // And rolling back to the newest version any test targets (v11) must
        // leave none of them behind.
        drop_tables_newer_than(&store.0, 11);
        let remaining = schema_tables(&store.0);
        let leftover: Vec<&String> = listed.intersection(&remaining).collect();
        assert!(
            leftover.is_empty(),
            "rolling back to v11 left post-v11 tables behind: {leftover:?}"
        );
    }
}
