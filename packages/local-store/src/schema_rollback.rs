//! Test-only helper that removes the schema tables a migration fixture leaves
//! behind.
//!
//! The migration tests each assert that upgrading a database from some historic
//! version to the current one preserves its rows. To build the "historic"
//! database they create a store at the current version and then dismantle it.
//!
//! Before this module existed every such test kept its own frozen literal
//! `DROP TABLE ...` list, and those lists stopped at the version the test cared
//! about (v3, v4, v5, v7, v9, v10, v11). The schema has since grown to v22, so
//! the literals left the v13-v22 tables behind while setting `user_version` back
//! to the earlier value. The migrator then re-ran those phases and failed on
//! `table local_held_bills already exists` before any assertion in the test ran.
//!
//! A database like that cannot exist. `Store::open` migrates in a single
//! transaction, so `user_version` and the tables created for that version always
//! move together: a version that has not been reached has neither the number nor
//! the tables. The fixture, not the migrator, was wrong.
//!
//! The per-test literals are deliberately *not* rewritten. Each one is the frozen
//! record of what the phases above version N created, and silently extending them
//! would make every migration test weaker. This helper only removes what they
//! miss, and `every_schema_table_can_be_rolled_back` below fails if a future
//! phase adds a table without adding it here.

/// Every table created by a schema phase newer than v11, which is the newest
/// version any migration test rolls a database back to. Grouped by the phase
/// that creates it so the comment survives a rename of the SQL file.
const POST_V11_TABLES: &[&str] = &[
    // v13: held_bills_schema.sql
    "local_held_bills",
    // v14: restaurant-schema.sql
    "local_restaurant_tables",
    "local_restaurant_orders",
    "local_restaurant_tickets",
    "local_restaurant_events",
    // v15: restaurant_checkout-schema.sql
    "local_restaurant_bindings",
    "local_restaurant_menu",
    // v16: restaurant_recovery-schema.sql
    "local_restaurant_attempts",
    "local_restaurant_control",
    "local_restaurant_recovery_events",
    // v17: kitchen-schema.sql
    "local_kitchen_corrections",
    "local_kitchen_destinations",
    "local_kitchen_print_jobs",
    "local_restaurant_assignments",
    // v18: hub-schema.sql
    "local_hub_config",
    "local_hub_devices",
    "local_hub_sessions",
    "local_hub_operations",
    "local_hub_batches",
    // v19: kitchen_staff-schema.sql
    "local_kitchen_staff",
    "local_kitchen_ticket_staff",
    "local_kitchen_staff_events",
    // v20: assignment_recovery-schema.sql
    "local_kitchen_assignment_ops",
    // v21: responsibility_access-schema.sql creates local_kitchen_staff_next and
    // renames it over local_kitchen_staff, so the scratch table can be present.
    "local_kitchen_staff_next",
    // v22: session_signout-schema.sql
    "local_hub_session_handles",
];

/// Tables that exist at v11 or earlier, plus tables that are not created by a
/// schema phase at all. The per-test frozen literals remove the former, and the
/// drift test below uses this to tell "pre-existing" from "unlisted".
const PRE_V13_TABLES: &[&str] = &[
    "workspace_draft",
    "workspace_history",
    "workspace_access",
    "local_products",
    "local_inventory_events",
    "local_inventory_actors",
    "local_inventory_pending",
    "local_inventory_outbox",
    "local_invoices",
    "local_invoice_stock",
    "local_billing_ledger",
    "local_billing_audit",
    "local_billing_outbox",
    "local_checkout",
    "local_checkout_canceled",
    "local_identity",
    "local_principals",
    "local_identity_audit",
    "local_invoice_actors",
    "local_customers",
    "local_customer_ops",
    "local_credit_entries",
    "local_customer_journal",
    "local_customer_outbox",
    "local_customer_pending",
    "local_customer_canceled",
    "local_retail_ops",
    "local_retail_pending",
    "local_retail_canceled",
    "local_retail_payments",
    "local_retail_events",
    "local_retail_journal",
    "local_retail_activity",
    "local_retail_returns",
    "local_retail_return_items",
    "local_retail_return_parts",
    "local_retail_refunds",
    "local_retail_floats",
    "local_retail_float_corrections",
    "local_retail_closings",
    "local_retail_outbox",
    "local_recovery_identity",
    "local_recovery_audit",
    "sornio_backup_manifest",
    "local_lan_devices",
    "local_lan_operations",
];

/// Drop every table created after v11.
///
/// Call this next to an existing `remove_fixture_tables` call, before the test
/// sets `user_version` back to its historic value. Nothing here touches row data
/// that a migration test asserts on: these are empty tables belonging to phases
/// the fixture never reached.
pub(crate) fn drop_post_v11_tables(db: &rusqlite::Connection) {
    let mut sql = String::new();
    for table in POST_V11_TABLES {
        sql.push_str("DROP TABLE IF EXISTS ");
        sql.push_str(table);
        sql.push(';');
    }
    db.execute_batch(&sql)
        .unwrap_or_else(|e| panic!("removing post-v11 fixture tables failed: {e}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// Names of every table the live schema creates.
    ///
    /// `sqlite_%` is SQLite's own bookkeeping - `sqlite_sequence` appears as soon
    /// as any AUTOINCREMENT table exists - and is not part of the schema this
    /// helper rolls back, so it is excluded rather than listed.
    fn schema_tables(db: &rusqlite::Connection) -> BTreeSet<String> {
        let sql = "SELECT name FROM sqlite_master \
                   WHERE type='table' AND name NOT LIKE 'sqlite_%'";
        let mut stmt = db.prepare(sql).unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<BTreeSet<_>, _>>()
            .unwrap()
    }

    /// Catch drift. If a future phase adds a table without listing it in
    /// `POST_V11_TABLES`, the migration tests roll back to a database that still
    /// contains it and fail again with "already exists". Failing here names the
    /// missing table instead of leaving it to a later suite.
    #[test]
    fn every_schema_table_can_be_rolled_back() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::Store::open(&dir.path().join("drift.db"), KEY).unwrap();
        let live = schema_tables(&store.0);
        let post: BTreeSet<String> = POST_V11_TABLES.iter().map(|t| t.to_string()).collect();
        let pre: BTreeSet<String> = PRE_V13_TABLES.iter().map(|t| t.to_string()).collect();

        // Every table in the live schema must be accounted for by one list or the
        // other, or a migration test rolling back past it will collide.
        let unlisted: Vec<&String> = live
            .iter()
            .filter(|t| !post.contains(*t) && !pre.contains(*t))
            .collect();
        assert!(
            unlisted.is_empty(),
            "these tables exist but neither POST_V11_TABLES nor PRE_V13_TABLES lists \
             them, so a migration test rolling back below their phase fails with \
             'already exists': {unlisted:?}"
        );

        // A listed table may legitimately be absent from the live schema only if
        // a later phase replaced it. That happens once, at v21, where
        // local_kitchen_staff_next is renamed over local_kitchen_staff.
        let absent: Vec<&String> = post.difference(&live).collect();
        for table in &absent {
            assert!(
                table.as_str() == "local_kitchen_staff_next",
                "{table} is dropped as post-v11 but no schema phase creates it; \
                 update POST_V11_TABLES"
            );
        }

        // And the rollback must actually remove them.
        drop_post_v11_tables(&store.0);
        let remaining = schema_tables(&store.0);
        let leftover: Vec<&String> = post.intersection(&remaining).collect();
        assert!(
            leftover.is_empty(),
            "drop_post_v11_tables left these tables behind: {leftover:?}"
        );
    }
}
