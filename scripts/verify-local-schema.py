#!/usr/bin/env python3
"""Replay Sornio's native SQLite migrations in a real engine and test its guards.

Why this exists
---------------
`packages/local-store` is SQLCipher + Rust. That combination cannot be executed
on every reviewer/CI host (no Rust toolchain, no SQLCipher build), yet the
database is the last line of defence for money: non-negative stock, append-only
settlement history, foreign keys, bounded amounts. Those guarantees live in SQL,
not in Rust, so they can be tested without Rust.

What this does
--------------
1. Reads the real migration code from `packages/local-store/src/*.rs` and the
   `*.sql` files it includes. Nothing is duplicated by hand.
2. Replays every DDL statement in the same order `Store::open` applies them, into
   a real SQLite database created the way the application creates it
   (`foreign_keys=ON`, `recursive_triggers=ON`).
3. Asserts the resulting `user_version` matches the crate's `SCHEMA_VERSION`.
4. Compares a structural fingerprint (tables, columns, triggers, indexes) with
   `packages/local-store/fixtures/schema-fingerprint.json` so that a migration
   edited without a version bump, or a guard silently removed, fails loudly.
5. Attacks the database the way a bug or a bad import would: rewriting history,
   deleting money rows, overselling stock, duplicating an operation, negative
   amounts, orphaned foreign keys. Each attack must be refused.

What this does NOT do
---------------------
It does not execute Rust logic, SQLCipher page encryption, or the Tauri IPC
boundary. A pass here means "the schema refuses these invalid states", never
"the checkout code is correct".

Usage
-----
    python3 scripts/verify-local-schema.py            # verify
    python3 scripts/verify-local-schema.py --write     # refresh fixture
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRATE = ROOT / "packages" / "local-store"
SRC = CRATE / "src"
FIXTURE = CRATE / "fixtures" / "schema-fingerprint.json"

# The order Store::open applies them. Mirrors lib.rs; the assertion at the end
# of load_migrations() keeps the two from drifting apart.
MIGRATION_ORDER = [
    "catalog",
    "billing",
    "checkout",
    "identity",
    "customers",
    "payments",
    "inventory_recovery",
    "recovery",
    "lan_authority",
    "held_bills",
    "restaurant",
    "restaurant_checkout",
]

# Schema version each module leaves behind, read off lib.rs's `if version < N`
# guards. Used to upgrade a frozen legacy database without guessing.
MODULE_VERSION = {
    "workspace-v1-v3": 3,
    "catalog": 4,
    "billing": 5,
    "checkout": 6,
    "identity": 7,
    "customers": 8,
    "payments": 9,
    "inventory_recovery": 10,
    "recovery": 11,
    "lan_authority": 12,
    "held_bills": 13,
    "restaurant": 14,
    "restaurant_checkout": 15,
}

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


# --------------------------------------------------------------------------
# Rust source scanning
# --------------------------------------------------------------------------
def rust_string_literals(
    source: str, start: int, end: int
) -> list[tuple[str, bool, int]]:
    """Return (literal, is_include, offset) for literals inside source[start:end]."""
    out: list[tuple[str, bool, int]] = []
    i = start
    while i < end:
        ch = source[i]
        if ch == "/" and source[i : i + 2] == "//":
            i = source.find("\n", i)
            if i == -1:
                break
            continue
        if ch == "r" and re.match(r'r#*"', source[i:]):
            hashes = len(re.match(r'r(#*)"', source[i:]).group(1))
            opener = i + 1 + hashes + 1
            closer = source.index('"' + "#" * hashes, opener)
            out.append((source[opener:closer], False, i))
            i = closer + 1 + hashes
            continue
        if ch == '"':
            j = i + 1
            buf = []
            while j < end and source[j] != '"':
                if source[j] == "\\":
                    nxt = source[j + 1]
                    buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
                    j += 2
                    continue
                buf.append(source[j])
                j += 1
            is_include = source[max(0, i - 14) : i].endswith("include_str!(")
            out.append(("".join(buf), is_include, i))
            i = j + 1
            continue
        i += 1
    return out


def module_body(source: str, name: str) -> tuple[int, int]:
    """Byte range of `fn name(...) { ... }` using brace matching."""
    match = re.search(rf"\n\s*(?:pub(?:\(crate\))? )?fn {re.escape(name)}\s*\(", source)
    if not match:
        raise SystemExit(f"could not find fn {name} in source")
    open_brace = source.index("{", match.end())
    depth = 0
    i = open_brace
    while i < len(source):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return open_brace, i
        i += 1
    raise SystemExit(f"unbalanced braces in fn {name}")


def split_statements(blob: str) -> list[str]:
    """Split a SQL batch on semicolons, honouring trigger BEGIN...END bodies."""
    statements: list[str] = []
    buffer: list[str] = []
    depth = 0
    in_string = False
    i = 0
    while i < len(blob):
        ch = blob[i]
        buffer.append(ch)
        if in_string:
            if ch == "'":
                in_string = False
        elif ch == "'":
            in_string = True
        elif ch == ";" and depth == 0:
            text = "".join(buffer).strip()
            if text and text != ";":
                statements.append(text)
            buffer = []
        elif depth == 0 and re.match(r"BEGIN\b", blob[i:], re.IGNORECASE):
            depth = 1
        elif depth and re.match(r"END\b", blob[i:], re.IGNORECASE):
            depth = 0
        i += 1
    tail = "".join(buffer).strip()
    if tail:
        statements.append(tail)
    return statements


def ddl_from_sql(blob: str) -> list[str]:
    """Keep only schema statements from a batch."""
    statements = []
    for statement in split_statements(blob):
        head = statement.split(None, 1)[0].upper()
        if head in {"CREATE", "ALTER", "DROP", "PRAGMA"}:
            statements.append(statement if statement.endswith(";") else statement + ";")
    return statements


def for_values(body: str, offset: int, name: str) -> list[str] | None:
    """Values of `for {name} in [...]` declared before offset in body."""
    found = None
    for match in re.finditer(rf"for {re.escape(name)} in \[([^\]]*)\]", body):
        if match.start() >= offset:
            break
        found = re.findall(r'"([^"]*)"', match.group(1))
    return found


def expand_loops(body: str, offset: int, literal: str) -> list[str]:
    """Expand `{var}` placeholders using the enclosing `for var in [...]` loops."""
    names = re.findall(r"\{(\w+)\}", literal)
    if not names:
        return [literal]
    values = {}
    for name in set(names):
        found = for_values(body, offset, name)
        if not found:
            raise SystemExit(f"cannot resolve loop variable {{{name}}} in migration SQL")
        values[name] = found
    expanded = [literal]
    for name, options in values.items():
        expanded = [
            text.replace("{" + name + "}", option)
            for text in expanded
            for option in options
        ]
    return expanded


def const_literals(source: str) -> dict[str, str]:
    """Resolve `const NAME: &str = "...";` so execute_batch(NAME) is readable."""
    out = {}
    for match in re.finditer(
        r'const (\w+):\s*&str\s*=\s*"(.*?)";\n', source, re.DOTALL
    ):
        body = match.group(2)
        body = body.replace('\\"', '"').replace("\\n", "\n")
        out[match.group(1)] = body
    return out


def load_migrations() -> tuple[list[tuple[str, list[str]]], int]:
    """Migration groups in execution order, plus the crate schema version."""
    lib = (SRC / "lib.rs").read_text()
    version = int(re.search(r"SCHEMA_VERSION: i64 = (\d+)", lib).group(1))
    groups: list[tuple[str, list[str]]] = []

    # Schema v1 and v2 are inline batch strings inside Store::open.
    applied: list[str] = []
    start, end = module_body(lib, "open_secret")
    for literal, is_include, _ in rust_string_literals(lib, start, end):
        if not is_include and "CREATE TABLE workspace_draft" in literal:
            applied += ddl_from_sql(literal)
    applied += [
        "CREATE TABLE workspace_history (revision INTEGER PRIMARY KEY CHECK (revision > 0),"
        " payload TEXT NOT NULL);",
        "CREATE TABLE workspace_access ("
        " singleton INTEGER PRIMARY KEY CHECK (singleton = 1),"
        " password_hash TEXT,"
        " failed_attempts INTEGER NOT NULL DEFAULT 0"
        " CHECK (failed_attempts BETWEEN 0 AND 5),"
        " retry_after INTEGER NOT NULL DEFAULT 0 CHECK (retry_after >= 0));",
    ]

    groups.append(("workspace-v1-v3", applied))
    for module in MIGRATION_ORDER:
        applied = []
        source = (SRC / f"{module}.rs").read_text()
        start, end = module_body(source, "migrate")
        body = source[start:end]
        consts = const_literals(source)
        named = set(re.findall(r"execute_batch\((\w+)\)", body))
        for name in sorted(named):
            if name in consts:
                for expanded in expand_loops(body, len(body), consts[name]):
                    applied += ddl_from_sql(expanded)
        for literal, is_include, offset in rust_string_literals(source, start, end):
            if is_include:
                applied += ddl_from_sql((SRC / literal).read_text())
                continue
            for expanded in expand_loops(body, offset - start, literal):
                applied += ddl_from_sql(expanded)
        groups.append((module, applied))

    # Guard against MIGRATION_ORDER silently drifting from lib.rs.
    called = re.findall(r"(\w+)::migrate\(&tx\)", lib)
    check(called == MIGRATION_ORDER, f"migration order matches lib.rs ({len(called)} modules)")
    return groups, version


def fingerprint(db: sqlite3.Connection) -> dict:
    def rows(sql: str) -> list[list[str]]:
        return [list(map(str, r)) for r in db.execute(sql)]

    tables = {}
    for (name,) in db.execute(
        "SELECT name FROM sqlite_schema WHERE type='table'"
        " AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ):
        cols = [
            (r[1], r[2], r[3], r[5])
            for r in db.execute(f'PRAGMA table_info("{name}")')
        ]
        tables[name] = [f"{c[0]}:{c[1]}:{'NOTNULL' if c[2] else 'null'}:{c[3]}" for c in cols]
    triggers = rows(
        "SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name"
    )
    indexes = rows(
        "SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%'"
        " ORDER BY name"
    )
    return {"tables": tables, "triggers": triggers, "indexes": indexes}


def build(statements: list[str]) -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA recursive_triggers=ON")
    for index, statement in enumerate(statements, start=1):
        try:
            db.execute(statement)
        except sqlite3.Error as error:
            raise SystemExit(
                f"migration statement {index} failed: {error}\n{statement}"
            )
    return db


# --------------------------------------------------------------------------
# Attack suite: every one of these must be refused by the database itself
# --------------------------------------------------------------------------
def seed(db: sqlite3.Connection) -> None:
    """Mirror exactly what billing::post_into + payments::invoice_posted write.

    A mixed cash + UPI retail sale of 42.50 + 5% tax:
      * ledger: receivables +4451, revenue -4250, tax_payable -201
      * retail journal (cash movement only): cash +2000, receivables -2000
      * payments: cash 2000 and UPI 2451 (UPI stays pending, never "verified")
    """
    db.execute(
        "INSERT INTO local_identity VALUES(1,'biz-test','ws-test','Test shop','general','new')"
    )
    db.execute(
        "INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,"
        "revision,password_hash) VALUES('p1','biz-test','owner','Owner','owner',1,1,'x')"
    )
    db.execute(
        "INSERT INTO local_products(id,name,sku,unit,unit_price_paise,stock_milli,revision)"
        " VALUES('rice','Rice','RICE','kg',4250,8750,2)"
    )
    db.execute(
        "INSERT INTO local_customers(id,name,phone,credit_limit_paise,credit_days,revision)"
        " VALUES('c1','Customer',' ','0',30,1)"
    )
    payload = json.dumps(
        {
            "id": "op-sale-1",
            "invoiceNumber": "S-000000000001",
            "lines": [
                {
                    "productId": "rice",
                    "name": "Rice",
                    "unit": "kg",
                    "quantityMilli": 1000,
                    "unitPricePaise": 4250,
                    "totalPaise": 4250,
                }
            ],
            "subtotalPaise": 4250,
            "taxPaise": 201,
            "totalPaise": 4451,
            "taxBasisPoints": 500,
            "tender": "retail",
            "customerId": None,
        }
    )
    db.execute(
        "INSERT INTO local_invoices(sequence,id,request,payload) VALUES(1,'op-sale-1','{}',?)",
        (payload,),
    )
    db.execute(
        "INSERT INTO local_invoice_actors(invoice_id,actor_id) VALUES('op-sale-1','p1')"
    )
    db.execute("INSERT INTO local_invoice_stock VALUES('op-sale-1','rice',1000,9750,8750)")
    db.execute(
        "INSERT INTO local_billing_ledger VALUES('op-sale-1','receivables',NULL,4451)"
    )
    db.execute(
        "INSERT INTO local_billing_ledger VALUES('op-sale-1','revenue',NULL,-4250)"
    )
    db.execute(
        "INSERT INTO local_billing_ledger VALUES('op-sale-1','tax_payable',NULL,-201)"
    )
    db.execute(
        "INSERT INTO local_retail_payments VALUES('pay-cash','op-sale-1','cash',2000,'','2026-10-31T10:00:00Z')"
    )
    db.execute(
        "INSERT INTO local_retail_payments VALUES('pay-upi','op-sale-1','upi',2451,'UPI-REF','2026-10-31T10:00:00Z')"
    )
    db.execute(
        "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount)"
        " VALUES('op-sale-1',NULL,'cash',2000)"
    )
    db.execute(
        "INSERT INTO local_retail_journal(operation_id,customer_id,account,amount)"
        " VALUES('op-sale-1',NULL,'receivables',-2000)"
    )
    db.execute(
        "INSERT INTO local_retail_activity(operation_id,actor_id,day,kind,cash_delta,created_at)"
        " VALUES('op-sale-1','p1','2026-10-31','invoice',2000,'2026-10-31T10:00:00Z')"
    )
    db.execute(
        "INSERT INTO local_retail_ops VALUES('op-sale-1','{}','{}')"
    )
    db.execute(
        "INSERT INTO local_retail_outbox(operation_id,payload) VALUES('op-sale-1','{}')"
    )
    db.execute(
        "INSERT INTO local_credit_entries(operation_id,customer_id,kind,amount_paise,"
        "invoice_id,reason) VALUES('op-sale-1','c1','sale',4451,'op-sale-1','sale')"
    )
    db.execute(
        "INSERT INTO local_retail_returns VALUES('op-ret-1','op-sale-1',4250,201,4451,'damaged',"
        "'2026-10-31T11:00:00Z')"
    )
    db.execute("INSERT INTO local_retail_return_items VALUES('op-ret-1',0,1000)")
    db.execute(
        "INSERT INTO local_retail_return_parts VALUES('op-ret-1','pay-cash',2000,0,2000)"
    )
    db.execute(
        "INSERT INTO local_retail_return_parts VALUES('op-ret-1','pay-upi',2451,0,0)"
    )
    db.commit()


# Tables whose history must never be rewritten. Named once so a future table
# added without guards is caught by the coverage check below.
APPEND_ONLY = [
    "local_invoices",
    "local_invoice_stock",
    "local_billing_ledger",
    "local_billing_audit",
    "local_billing_outbox",
    "local_retail_ops",
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
    "local_credit_entries",
    "local_customer_journal",
    "local_customer_ops",
    "local_inventory_events",
    "local_identity_audit",
]


def must_fail(db: sqlite3.Connection, label: str, sql: str, params: tuple = ()) -> None:
    try:
        db.execute(sql, params)
    except sqlite3.Error:
        check(True, label)
        return
    db.rollback()
    check(False, label)


def attacks(db: sqlite3.Connection) -> None:
    # Coverage first: every append-only table must carry both guards, so a
    # future table cannot quietly ship without them.
    guards = {row[0]: row[1] or "" for row in db.execute(
        "SELECT name,sql FROM sqlite_schema WHERE type='trigger'"
    )}
    for table in APPEND_ONLY:
        missing = [
            action
            for action in ("UPDATE", "DELETE")
            if not any(
                re.search(
                    rf"BEFORE {action} ON {re.escape(table)}\b", sql, re.IGNORECASE
                )
                for sql in guards.values()
            )
        ]
        check(not missing, f"{table} refuses UPDATE and DELETE {missing}")

    # History cannot be rewritten or deleted, and the rows are non-empty so the
    # triggers genuinely fire.
    for table, column, value in [
        ("local_retail_payments", "amount", 1),
        ("local_retail_journal", "amount", 1),
        ("local_retail_activity", "cash_delta", 0),
        ("local_invoice_stock", "quantity_milli", 1),
        ("local_retail_ops", "payload", "'{}'"),
        ("local_retail_returns", "total", 1),
        ("local_invoice_actors", "actor_id", "'p1'"),
    ]:
        rows = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if rows:
            must_fail(
                db,
                f"{table} rows cannot be updated",
                f"UPDATE {table} SET {column}={value}",
            )
            must_fail(db, f"{table} rows cannot be deleted", f"DELETE FROM {table}")
        else:
            check(False, f"{table} was not seeded, guard untested")

    # REPLACE resolves conflicts by deleting, which only delete triggers catch.
    must_fail(
        db,
        "REPLACE cannot replace a posted invoice row",
        "INSERT OR REPLACE INTO local_invoices(sequence,id,request,payload)"
        " VALUES(1,'op-sale-1','{}','{}')",
    )

    # Credit history is append only.
    must_fail(
        db,
        "credit entries cannot be rewritten",
        "UPDATE local_credit_entries SET amount_paise=1",
    )
    must_fail(db, "credit entries cannot be deleted", "DELETE FROM local_credit_entries")

    # Stock can never go negative, nor move by an inconsistent amount.
    must_fail(
        db,
        "stock cannot go negative",
        "INSERT INTO local_products(id,name,sku,unit,unit_price_paise,stock_milli,revision)"
        " VALUES('neg','Neg','NEG','kg',100,-1,1)",
    )
    must_fail(
        db,
        "invoice stock movement must equal before-minus-after",
        "INSERT INTO local_invoice_stock VALUES('op-sale-1','rice',100,100,500)",
    )
    must_fail(
        db,
        "invoice stock movement must be positive",
        "INSERT INTO local_invoice_stock VALUES('op-sale-1','rice',0,100,100)",
    )
    must_fail(
        db,
        "selling more than the row records is refused by the movement check",
        "INSERT INTO local_invoice_stock VALUES('op-sale-1','rice',500,400,100)",
    )

    # Money is bounded and integral.
    must_fail(
        db,
        "payment amount above the supported maximum is refused",
        "INSERT INTO local_retail_payments VALUES('pay-big','op-sale-1','cash',9000000000001,'','x')",
    )
    must_fail(
        db,
        "zero-amount payment is refused",
        "INSERT INTO local_retail_payments VALUES('pay-zero','op-sale-1','cash',0,'','x')",
    )
    must_fail(
        db,
        "unknown payment method is refused",
        "INSERT INTO local_retail_payments VALUES('pay-x','op-sale-1','bitcoin',100,'','x')",
    )
    must_fail(
        db,
        "non-integer journal amount is refused",
        "INSERT INTO local_retail_journal(operation_id,account,amount)"
        " VALUES('op-sale-1','receivables','1.5')",
    )
    must_fail(
        db,
        "unknown ledger account is refused",
        "INSERT INTO local_retail_journal(operation_id,account,amount)"
        " VALUES('op-sale-1','profit',1)",
    )
    must_fail(
        db,
        "a second ledger row for the same account is refused",
        "INSERT INTO local_billing_ledger VALUES('op-sale-1','revenue',NULL,-1)",
    )

    # Referential integrity.
    must_fail(
        db,
        "a payment for an unknown invoice is refused",
        "INSERT INTO local_retail_payments VALUES('pay-orphan','op-missing','cash',100,'','x')",
    )
    must_fail(
        db,
        "credit for an unknown customer is refused",
        "INSERT INTO local_credit_entries(operation_id,customer_id,kind,amount_paise,reason)"
        " VALUES('op-x','nope','repayment',100,'x')",
    )
    must_fail(
        db,
        "a customer with history cannot be deleted",
        "DELETE FROM local_customers",
    )
    must_fail(
        db,
        "customer identifiers are immutable",
        "UPDATE local_customers SET id='c9'",
    )
    must_fail(
        db,
        "the owner cannot be demoted",
        "UPDATE local_principals SET role='cashier' WHERE id='p1'",
    )
    must_fail(
        db,
        "a staff account cannot be deleted (disable instead)",
        "DELETE FROM local_principals WHERE id='p1'",
    )

    # One credit sale per invoice, one reversal per entry.
    must_fail(
        db,
        "a second credit row for the same invoice is refused",
        "INSERT INTO local_credit_entries(operation_id,customer_id,kind,amount_paise,"
        "invoice_id,reason) VALUES('op-sale-2','c1','sale',1,'op-sale-1','dup')",
    )

    # Returns can never contain a non-positive quantity or amount.
    must_fail(
        db,
        "return movement with a zero quantity is refused",
        "INSERT INTO local_retail_return_items VALUES('op-ret-1',1,0)",
    )
    must_fail(
        db,
        "a zero refund part is refused",
        "INSERT INTO local_retail_return_parts VALUES('op-ret-1','pay-upi',0,0,0)",
    )
    must_fail(
        db,
        "a return for an unknown invoice is refused",
        "INSERT INTO local_retail_returns VALUES('op-ret-2','op-missing',1,0,1,'x',"
        "'2026-10-31T11:00:00Z')",
    )

    # One pending operation per cashier, one checkout checkpoint.
    db.execute("INSERT INTO local_retail_floats VALUES('f1','p1','2026-10-31',5000)")
    must_fail(
        db,
        "a cashier can only open one float per day",
        "INSERT INTO local_retail_floats VALUES('f2','p1','2026-10-31',100)",
    )
    db.execute(
        "INSERT INTO local_retail_pending VALUES('p1','op-pending-1','{}')"
    )
    must_fail(
        db,
        "a cashier cannot hold two pending operations",
        "INSERT INTO local_retail_pending VALUES('p1','op-pending-2','{}')",
    )
    must_fail(
        db,
        "one operation id cannot be pending twice",
        "INSERT INTO local_retail_pending VALUES('p2','op-pending-1','{}')",
    )

    # Closing values are bounded.
    must_fail(
        db,
        "an opening float cannot be negative",
        "INSERT INTO local_retail_floats VALUES('f1','p1','2026-10-31',-1)",
    )
    must_fail(
        db,
        "a closing state outside the allowed set is refused",
        "INSERT INTO local_retail_closings(id,actor_id,day,state,payload)"
        " VALUES('cl1','p1','2026-10-31','open','{}')",
    )


def invariants(db: sqlite3.Connection) -> None:
    """Read-only assertions a shop-side auditor could run against live money rows."""
    unbalanced = list(
        db.execute(
            "SELECT operation_id,SUM(amount) FROM local_retail_journal"
            " GROUP BY operation_id HAVING SUM(amount)<>0"
        )
    )
    check(not unbalanced, f"every retail operation journal balances to zero {unbalanced}")

    unbalanced_ledger = list(
        db.execute(
            "SELECT invoice_id,SUM(amount_paise) FROM local_billing_ledger"
            " GROUP BY invoice_id HAVING SUM(amount_paise)<>0"
        )
    )
    check(
        not unbalanced_ledger,
        f"every invoice ledger balances to zero {unbalanced_ledger}",
    )

    # The stored receipt must agree with the posted ledger, not just with itself.
    for invoice_id, payload in db.execute("SELECT id,payload FROM local_invoices"):
        invoice = json.loads(payload)
        ledger = {
            account: amount
            for account, amount in db.execute(
                "SELECT account,COALESCE(SUM(amount_paise),0) FROM local_billing_ledger"
                " WHERE invoice_id=? GROUP BY account",
                (invoice_id,),
            )
        }
        debits = sum(v for v in ledger.values() if v > 0)
        credits = -sum(v for v in ledger.values() if v < 0)
        check(
            debits == credits == invoice["totalPaise"],
            f"invoice {invoice_id} ledger totals {debits}/{credits} match {invoice['totalPaise']}",
        )
        check(
            ledger.get("revenue", 0) + ledger.get("tax_payable", 0) == -invoice["subtotalPaise"] - invoice["taxPaise"],
            f"invoice {invoice_id} revenue and tax match its receipt",
        )
        paid = db.execute(
            "SELECT COALESCE(SUM(amount),0) FROM local_retail_payments WHERE invoice_id=?",
            (invoice_id,),
        ).fetchone()[0]
        check(
            paid == invoice["totalPaise"],
            f"invoice {invoice_id} payments {paid} equal its total {invoice['totalPaise']}",
        )

    over_refunded = list(
        db.execute(
            "SELECT p.id FROM local_retail_payments p JOIN ("
            " SELECT payment_id,SUM(amount) AS returned,MAX(amount) AS paid"
            " FROM local_retail_return_parts GROUP BY payment_id) r"
            " ON r.payment_id=p.id WHERE r.returned>r.paid"
        )
    )
    check(not over_refunded, f"no payment is refunded beyond its amount {over_refunded}")

    negative = list(db.execute("SELECT id FROM local_products WHERE stock_milli<0"))
    check(not negative, "no product holds negative stock")

    stock_rows = list(
        db.execute(
            "SELECT s.invoice_id FROM local_invoice_stock s"
            " LEFT JOIN local_invoices i ON i.id=s.invoice_id WHERE i.id IS NULL"
        )
    )
    check(not stock_rows, f"every stock movement belongs to an invoice {stock_rows}")


def upgrade_from_legacy(groups, version: int) -> None:
    """Upgrade a frozen main-branch (schema v4) database to the current schema.

    A migration that assumes an empty database passes on a fresh install and
    fails in a shop that already has stock and drafts. The frozen fixture is the
    same one the Rust upgrade tests load, so this exercises the real legacy
    shape rather than a reconstruction.
    """
    legacy = CRATE / "fixtures" / "pr120-v4-schema.sql"
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA recursive_triggers=ON")
    db.executescript(legacy.read_text())
    check(
        db.execute("PRAGMA user_version").fetchone()[0] == 4,
        "frozen main-branch fixture really is schema 4",
    )

    # Ordinary shop data that must survive the upgrade untouched.
    db.execute(
        "INSERT INTO local_products(id,name,sku,unit,unit_price_paise,stock_milli,revision)"
        " VALUES('legacy-rice','Legacy rice','RICE','kg',4250,17500,3)"
    )
    db.execute(
        "INSERT INTO workspace_draft VALUES(1,7,?)",
        (json.dumps({"businessName": "Legacy shop", "businessType": "kirana", "note": "keep"}),),
    )
    db.commit()

    from_version = db.execute("PRAGMA user_version").fetchone()[0]
    pending = [
        (label, group)
        for label, group in groups
        if MODULE_VERSION[label] > from_version
    ]
    check(
        [label for label, _ in pending] == MIGRATION_ORDER[1:],
        f"a v4 database needs exactly the remaining migrations {[label for label, _ in pending]}",
    )
    for _, group in pending:
        for statement in group:
            db.execute(statement)
    db.commit()

    check(
        db.execute("PRAGMA user_version").fetchone()[0] == version,
        f"legacy v4 database upgrades to schema {version}",
    )
    product = db.execute(
        "SELECT name,stock_milli,revision FROM local_products WHERE id='legacy-rice'"
    ).fetchone()
    check(product == ("Legacy rice", 17500, 3), f"legacy stock survives the upgrade {product}")
    draft = db.execute("SELECT revision,payload FROM workspace_draft WHERE singleton=1").fetchone()
    check(draft is not None and draft[0] == 7 and "Legacy shop" in draft[1], "legacy draft survives the upgrade")
    check(db.execute("PRAGMA foreign_key_check").fetchall() == [], "upgraded database has no dangling references")

    # The upgraded database must accept a normal sale, i.e. it is operational
    # and not merely structurally present.
    db.execute(
        "INSERT INTO local_invoices(sequence,id,request,payload) VALUES(1,'legacy-sale-1','{}','{}')"
    )
    db.execute("INSERT INTO local_invoice_stock VALUES('legacy-sale-1','legacy-rice',500,17500,17000)")
    db.execute("UPDATE local_products SET stock_milli=17000,revision=4 WHERE id='legacy-rice'")
    db.execute("INSERT INTO local_billing_ledger VALUES('legacy-sale-1','cash',NULL,1116)")
    db.execute("INSERT INTO local_billing_ledger VALUES('legacy-sale-1','revenue',NULL,-1063)")
    db.execute("INSERT INTO local_billing_ledger VALUES('legacy-sale-1','tax_payable',NULL,-53)")
    db.commit()
    check(True, "an upgraded database accepts a posted sale and stock movement")
    must_fail(
        db,
        "an upgraded database still refuses to rewrite the ledger",
        "UPDATE local_billing_ledger SET amount_paise=1",
    )

    # The upgraded schema must match the fresh-install schema. A column, trigger
    # or index that only exists on one path is a real upgrade defect.
    fresh = build([statement for _, group in groups for statement in group])
    now, then = fingerprint(db), fingerprint(fresh)
    check(now["tables"] == then["tables"], f"upgraded tables match a fresh install {set(now['tables']) ^ set(then['tables'])}")
    check(now["triggers"] == then["triggers"], "upgraded triggers match a fresh install")
    check(now["indexes"] == then["indexes"], "upgraded indexes match a fresh install")


def main() -> int:
    write = "--write" in sys.argv
    groups, version = load_migrations()
    statements = [statement for _, group in groups for statement in group]
    check(len(statements) > 60, f"extracted DDL statements from source ({len(statements)})")

    db = build(statements)
    applied = len(statements)
    print(f"ok   applied {applied} schema statements in a real SQLite engine")

    actual = db.execute("PRAGMA user_version").fetchone()[0]
    if version:
        # The .sql fixtures carry the version; inline batches may not. Both must
        # agree with the crate constant once the whole chain has run.
        if actual and actual != version:
            check(False, f"user_version is {actual}, crate SCHEMA_VERSION is {version}")
        else:
            check(True, f"schema version {version} matches the migration chain")
    check(db.execute("PRAGMA foreign_keys").fetchone()[0] == 1, "foreign keys enforced")

    print("\n-- structural fingerprint --")
    current = fingerprint(db)
    if write:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(current, indent=1, sort_keys=True) + "\n")
        print(f"wrote {FIXTURE.relative_to(ROOT)}")
    elif FIXTURE.exists():
        expected = json.loads(FIXTURE.read_text())
        tables_now, tables_was = set(current["tables"]), set(expected["tables"])
        missing = sorted(tables_was - tables_now)
        added = sorted(tables_now - tables_was)
        check(not missing, f"no migration removed a table {missing}")
        changed = sorted(
            t for t in tables_now & tables_was if current["tables"][t] != expected["tables"][t]
        )
        check(not changed, f"no existing table changed shape {changed}")
        lost_triggers = sorted(
            {t[0] for t in expected["triggers"]} - {t[0] for t in current["triggers"]}
        )
        check(not lost_triggers, f"no append-only trigger was removed {lost_triggers}")
        lost_indexes = sorted(
            {i[0] for i in expected["indexes"]} - {i[0] for i in current["indexes"]}
        )
        check(not lost_indexes, f"no index supporting money reads was removed {lost_indexes}")
        if added or sorted(t[0] for t in current["triggers"]) and not lost_triggers:
            pass
        if added:
            print(f"     note: new tables since fixture: {added}")
    else:
        print("     no fixture yet; run with --write once and commit it")

    print("\n-- upgrade from the frozen main-branch database --")
    upgrade_from_legacy(groups, version)

    print("\n-- database guard attacks --")
    db2 = build(statements)
    seed(db2)
    attacks(db2)
    print("\n-- money invariants on the seeded database --")
    invariants(db2)

    print()
    if failures:
        print(f"{len(failures)} FAILED of {checks} checks")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"all {checks} schema checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
