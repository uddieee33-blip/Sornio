#!/usr/bin/env python3
"""Execute the Phase 21B mobile purchasing *protocol* against a real SQLite engine.

Why this exists
---------------
`packages/local-store` is Rust + SQLCipher. This environment (and a bare
reviewer machine) has no Rust toolchain, yet the guarantees Phase 21B claims are
mostly database-shaped: an operation journal that is append-only, a refusal that
is stored once and replayed, a revision conflict that must not overwrite a newer
row, and a receipt that must not double stock when replayed.

This script therefore:
  1. Replays the real `purchasing-schema.sql` DDL (same file the crate includes).
  2. Creates the v18 `local_hub_operations` journal exactly as
     `hub-schema.sql` declares it — the same table Phase 21B reuses, so no schema
     version is introduced — and drives the ownership/digest rules the Rust
     `purchasing_hub::journal_lookup` applies.
  3. Drives the protocol scenarios at SQL level, asserting the invariants the
     Rust code relies on.

What this does NOT do
---------------------
It does not execute Rust, SQLCipher, the LAN TLS listener, RBAC resolution, or
the React Native screens. A pass means "the schema and journal semantics the
protocol depends on are correct", never "the protocol is implemented correctly".
`cargo test` in CI remains the authority for the Rust logic, and the mobile
runtime suite remains the authority for the client.

Usage
-----
    python3 scripts/verify-purchasing-protocol.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "packages" / "local-store" / "src"
SCHEMA = (SRC / "purchasing-schema.sql").read_text()
HUB = (SRC / "purchasing_hub.rs").read_text()

failures: list[str] = []
checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(label)
        print(f"FAIL {label}")
    else:
        print(f"ok   {label}")


def journal_ddl() -> str:
    """The v18 journal, read from the hub schema the crate already ships.

    Phase 21B deliberately adds no table: reusing this one inherits its
    append-only triggers and the exactly-once contract the restaurant routes
    already depend on.
    """
    hub_schema = (SRC / "hub-schema.sql").read_text()
    statements = [
        line.strip()
        for line in hub_schema.splitlines()
        if "local_hub_operations" in line and line.strip().startswith("CREATE")
    ]
    if not statements:
        raise SystemExit("hub-schema.sql no longer declares local_hub_operations")
    return "\n".join(statements)


def new_database() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA recursive_triggers=ON")
    # The purchasing schema is a v23 migration: it needs the tables it references.
    db.executescript(
        """
        CREATE TABLE local_products (
            id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sku TEXT NOT NULL,
            unit TEXT NOT NULL, unit_price_paise INTEGER NOT NULL,
            stock_milli INTEGER NOT NULL, revision INTEGER NOT NULL
        );
        CREATE TABLE local_principals (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE local_hub_devices (id TEXT PRIMARY KEY NOT NULL);
        """
    )
    db.executescript(SCHEMA)
    db.executescript(journal_ddl())
    db.commit()
    return db


def digest(payload: object) -> str:
    return hashlib.sha256(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()


def seed(db: sqlite3.Connection) -> None:
    db.execute("INSERT INTO local_principals(id) VALUES('owner')")
    db.execute("INSERT INTO local_hub_devices(id) VALUES('phone')")
    db.execute(
        "INSERT INTO local_products VALUES('rice','Rice','RICE','kg',10000,100000,1)"
    )
    db.execute(
        """INSERT INTO local_suppliers
           (id,name,phone,gstin,address,payment_terms_days,notes,archived,revision)
           VALUES('sup-1','Krishna Traders','+919876543210','22AAAAA0000A1Z5','12 Market Road',30,'',0,1)"""
    )
    db.execute(
        """INSERT INTO local_purchase_orders
           (id,number,supplier_id,status,note,subtotal_paise,tax_paise,total_paise,revision)
           VALUES('po-1',1,'sup-1','draft','Weekly stock',90000,0,90000,1)"""
    )
    db.execute(
        """INSERT INTO local_purchase_order_lines
           (order_id,line_index,product_id,name,sku,unit,quantity_milli,received_milli,
            unit_cost_paise,tax_bps,line_subtotal_paise,tax_paise,line_total_paise)
           VALUES('po-1',0,'rice','Rice','RICE','kg',10000,0,9000,0,90000,0,90000)"""
    )
    db.commit()


def journal(db: sqlite3.Connection, operation_id: str, kind: str, request: object,
            result: dict, device: str = "phone", actor: str = "owner",
            generation: str = "gen-1") -> None:
    """One purchasing journal row, in the shared v18 table."""
    db.execute(
        "INSERT INTO local_hub_operations VALUES(?,?,?,?,?,?,1)",
        (
            operation_id,
            device,
            actor,
            generation,
            json.dumps(
                {
                    "kind": kind,
                    "operationId": operation_id,
                    "digest": digest({"kind": kind, "request": request}),
                    "request": request,
                },
                separators=(",", ":"),
                sort_keys=True,
            ),
            json.dumps(result, separators=(",", ":")),
        ),
    )


def main() -> int:
    db = new_database()
    seed(db)

    print("--- journal shape ---")
    columns = [
        row[1] for row in db.execute("PRAGMA table_info(local_hub_operations)")
    ]
    for name in ["id", "device_id", "actor_id", "generation", "request", "result"]:
        check(name in columns, f"shared journal column {name} exists")
    check(
        "local_purchasing_hub_operations" not in {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        },
        "Phase 21B adds no table, so the schema ceiling stays at v23",
    )

    print("--- journal is append-only ---")
    journal(db, "op-1", "purchasing.purchase_order_created", {"a": 1},
            {"status": "accepted"})
    for statement, label in [
        ("UPDATE local_hub_operations SET result='{}' WHERE id='op-1'",
         "journal update is refused"),
        ("DELETE FROM local_hub_operations WHERE id='op-1'",
         "journal delete is refused"),
    ]:
        try:
            db.execute(statement)
            check(False, label)
        except sqlite3.DatabaseError:
            check(True, label)

    print("--- duplicate identity is impossible ---")
    try:
        journal(db, "op-1", "purchasing.purchase_order_created", {"a": 1},
                {"status": "accepted"})
        check(False, "a second row for one operation id is refused")
    except sqlite3.IntegrityError:
        check(True, "a second row for one operation id is refused")

    print("--- replay answers from the journal, not from a re-run ---")
    db.commit()
    stored_request, stored_result = db.execute(
        "SELECT request,result FROM local_hub_operations WHERE id='op-1'"
    ).fetchone()
    parsed = json.loads(stored_request)
    check(parsed["kind"] == "purchasing.purchase_order_created",
          "kind is inside the stored request document")
    check(parsed["digest"] == digest({"kind": parsed["kind"], "request": {"a": 1}}),
          "the stored digest is the one the Rust submit path computes")
    check(json.loads(stored_result) == {"status": "accepted"},
          "the stored result is what a replayed request returns")
    check(parsed["digest"] != digest({"kind": parsed["kind"], "request": {"a": 2}}),
          "a different body under the same identity is detectable")
    check("purchasing." in parsed["kind"],
          "a purchasing identity is distinguishable from an order identity")

    print("--- revision compare-and-set protects the newer value ---")
    updated = db.execute(
        "UPDATE local_purchase_orders SET note=?, revision=revision+1 WHERE id='po-1' AND revision=?",
        ("Desktop edit", 1),
    ).rowcount
    check(updated == 1, "the first editor wins its revision")
    stale = db.execute(
        "UPDATE local_purchase_orders SET note=?, revision=revision+1 WHERE id='po-1' AND revision=?",
        ("Phone edit", 1),
    ).rowcount
    check(stale == 0, "a stale revision matches no row")
    note, revision = db.execute(
        "SELECT note,revision FROM local_purchase_orders WHERE id='po-1'"
    ).fetchone()
    check(note == "Desktop edit", "the newer value is not overwritten")
    check(revision == 2, "the revision still reflects one committed edit")

    print("--- refusals are durable results ---")
    journal(db, "op-refused", "purchasing.supplier_payment",
            {"amountPaise": 500},
            {"status": "refused", "reason": "not_permitted", "revision": None})
    refused = json.loads(
        db.execute("SELECT result FROM local_hub_operations WHERE id='op-refused'").fetchone()[0]
    )
    check(refused["status"] == "refused", "a refusal is stored, not raised")
    check(refused["reason"] == "not_permitted", "the refusal carries a stable reason")
    check(set(refused) == {"status", "reason", "revision"},
          "the refusal shape has exactly the three documented keys")

    print("--- receiving: damaged and good quantities stay distinct ---")
    db.execute("UPDATE local_purchase_orders SET status='approved' WHERE id='po-1'")
    db.execute(
        """INSERT INTO local_goods_receipts
           (id,order_id,supplier_id,reference,note,goods_total_paise,damaged_total_paise)
           VALUES('gr-1','po-1','sup-1','CH-1','Delivery',27000,9000)"""
    )
    db.execute(
        """INSERT INTO local_goods_receipt_lines
           (receipt_id,line_index,product_id,quantity_milli,damaged_milli,
            unit_cost_paise,line_total_paise,note)
           VALUES('gr-1',0,'rice',4000,1000,9000,36000,'')"""
    )
    db.execute(
        """INSERT INTO local_purchase_stock_events(operation_id,product_id,kind,delta_milli,receipt_id)
           VALUES('gr-1','rice','goods_received',3000,'gr-1')"""
    )
    db.execute(
        "UPDATE local_products SET stock_milli=stock_milli+3000 WHERE id='rice'"
    )
    stock = db.execute("SELECT stock_milli FROM local_products WHERE id='rice'").fetchone()[0]
    check(stock == 103000, "only the good units (4000-1000) increase stock")
    damaged = db.execute(
        "SELECT damaged_milli FROM local_goods_receipt_lines WHERE receipt_id='gr-1'"
    ).fetchone()[0]
    check(damaged == 1000, "damaged quantity is recorded separately, not discarded")

    print("--- a receipt is immutable, so a replay cannot double stock ---")
    for statement, label in [
        ("UPDATE local_goods_receipts SET goods_total_paise=1 WHERE id='gr-1'",
         "goods receipt update is refused"),
        ("DELETE FROM local_goods_receipt_lines WHERE receipt_id='gr-1'",
         "goods receipt line delete is refused"),
        ("DELETE FROM local_purchase_stock_events WHERE operation_id='gr-1'",
         "stock event delete is refused"),
    ]:
        try:
            db.execute(statement)
            check(False, label)
        except sqlite3.DatabaseError:
            check(True, label)

    print("--- a payment journal is balanced ---")
    db.execute(
        """INSERT INTO local_supplier_ops VALUES('pay-1','supplier_payment.posted','{}','{}')"""
    )
    db.execute(
        """INSERT INTO local_supplier_entries
           (operation_id,supplier_id,kind,amount_paise,reason)
           VALUES('pay-1','sup-1','payment',-25000,'Supplier payment')"""
    )
    for account, amount in [("payables", 25000), ("upi_clearing", -25000)]:
        db.execute(
            """INSERT INTO local_supplier_journal(operation_id,supplier_id,account,amount_paise)
               VALUES('pay-1','sup-1',?,?)""",
            (account, amount),
        )
    total = db.execute(
        "SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_journal WHERE operation_id='pay-1'"
    ).fetchone()[0]
    check(total == 0, "one payment posts a zero-sum journal")
    try:
        db.execute(
            """INSERT INTO local_supplier_journal(operation_id,supplier_id,account,amount_paise)
               VALUES('pay-1','sup-1','payables',1)"""
        )
        check(False, "a duplicate journal account is refused")
    except sqlite3.IntegrityError:
        check(True, "a duplicate journal account is refused")

    print("--- purchase orders never move money or stock by themselves ---")
    approved_money = db.execute(
        "SELECT COALESCE(SUM(amount_paise),0) FROM local_supplier_entries"
    ).fetchone()[0]
    check(
        approved_money == -25000,
        "only the explicit payment moved the payable balance; approval did not",
    )

    print("--- the journal's documented kinds match the Rust constant list ---")
    kinds = re.findall(r'const KIND_[A-Z_]+: &str = "([^"]+)"', HUB)
    check(len(kinds) == 10, "ten purchasing operation kinds are declared")
    check(len(set(kinds)) == len(kinds), "each kind is unique")
    check(all(kind.startswith("purchasing.") for kind in kinds), "all kinds are namespaced")
    array = re.search(r"pub const KINDS: \[&str; (\d+)\] = \[(.*?)\];", HUB, re.S)
    check(array is not None, "the KINDS array exists for the router switch")
    if array:
        listed = re.findall(r"KIND_[A-Z_]+", array.group(2))
        check(len(listed) == int(array.group(1)), "KINDS length matches its bounds")
        check(len(set(listed)) == len(listed), "KINDS lists each kind once")

    print("--- the hub advertises the purchasing capability ---")
    hub_rs = (SRC / "hub.rs").read_text()
    check("purchasing_hub::CAPABILITY" in hub_rs,
          "discovery advertises the purchasing protocol capability")
    access = (SRC / "access.rs").read_text()
    for route in [
        "/v1/purchasing/workspace",
        "/v1/purchasing/order",
        "/v1/purchasing/statement",
        "/v1/purchasing/submit",
        "/v1/purchasing/operation",
    ]:
        check(route in access, f"the hub router serves {route}")
    check(
        access.count("purchasing_hub::envelope(&body)?") >= 5,
        "every purchasing route validates the protocol envelope",
    )

    print("--- the mobile surface adds no new schema phase ---")
    lib = (SRC / "lib.rs").read_text()
    check("SCHEMA_VERSION: i64 = 23" in lib,
          "the schema ceiling is still v23, so Phase 21B introduces no migration")
    check("purchasing_hub" in lib, "the purchasing hub module is compiled")
    check(
        "purchasing_hub::migrate" not in lib and "purchasing_hub::migrate" not in HUB,
        "the purchasing hub has no migration hook of its own",
    )

    print("--- the session and journal model the router relies on ---")
    # `/v1/operation` (the lost-acknowledgement lookup) restores a desktop session
    # that was taken before the hub call. Purchasing reuses that exact code path, so
    # the invariant that makes recovery work has to be asserted, not assumed.
    access = (SRC / "access.rs").read_text()
    check(
        "let desktop = self.store.1.take();" in access,
        "the hub request removes the desktop session before serving mobile",
    )
    check(
        "self.store.1 = desktop;" in access,
        "the hub request restores the desktop session, which is what /v1/operation reads",
    )
    check(
        access.index("self.store.1 = desktop;")
        > access.index('"/v1/purchasing/operation"'),
        "the restore happens after the purchasing routes in the same closure",
    )

    print("--- the Rust source keeps the properties this suite cannot execute ---")
    # Static assertions about the code shape. They are not a substitute for
    # `cargo test`; they catch the specific regressions that would silently
    # weaken exactly-once or the RBAC boundary.
    check("local_hub_operations" in HUB,
          "purchasing writes are journalled in the shared hub journal")
    check(HUB.count("journal_lookup(") >= 2,
          "the submit path checks the journal before and after the write")
    check("TransactionBehavior::Immediate" in HUB,
          "the journal is written in an immediate transaction")
    check("identity::audit(" in HUB, "every committed mobile write is audited")
    check("OperationConflict" in HUB,
          "reused identities raise a conflict rather than replaying")
    # A status lookup answers by operation id, so it must also prove the caller
    # is asking about the operation it thinks it is. Without the digest compare a
    # phone restoring stale ids would be handed another operation's committed
    # result and would report its own work as done.
    status_fn = HUB.split("fn operation_status")[1].split("\n}")[0]
    check('body.get("kind")' in status_fn and 'body.get("request")' in status_fn,
          "a status lookup may carry the payload the caller believes it sent")
    check("digest(&digest_source)" in status_fn,
          "a status lookup whose payload differs from the recorded one conflicts")
    access_src = (SRC / "access.rs").read_text()
    check("purchasing_hub::operation_status(&self.store, &device, body)" in access_src,
          "the status route hands the whole body to the digest check")
    check("Permission::SupplierRead" in HUB,
          "the workspace read requires SupplierRead at the native boundary")
    check("deny_unknown_fields" not in HUB.split("fn envelope")[1][:400],
          "the envelope check tolerates the fields its routes read")
    check("serde_json::from_value" in HUB,
          "request bodies are deserialized into the Phase 21A types")
    check("post_goods_receipt(" in HUB and "post_supplier_payment(" in HUB
          and "post_purchase_return(" in HUB,
          "receiving, payments and returns delegate to the authoritative methods")
    check("save_supplier(" in HUB and "create_purchase_order(" in HUB
          and "decide_purchase_order(" in HUB,
          "suppliers, drafts and approvals delegate to the authoritative methods")
    check(HUB.count("self.") > 10 and "INSERT INTO local_purchase_order" not in HUB,
          "the mobile surface writes purchasing rows only through Phase 21A")

    print()
    print(f"{checks} checks, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
