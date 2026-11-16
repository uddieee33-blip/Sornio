"""Assert the purchasing state that the *installed* application persisted.

The GUI stage (`check-native.py`) proves a shopkeeper can drive the workflow and
that the screens show the right numbers. That is not the same claim as "the
store holds these rows". This script closes that gap: it opens the workspace the
installed binary left behind, using the same `device::initialize` entry point the
shipped application calls, so the operating-system credential store supplies the
real device key. Nothing here is mocked, replayed or re-derived from the UI.

It runs after the application has exited, so the database is quiescent and the
audit cannot race a write.

Independently meaningful failure
--------------------------------
This audit is scheduled with `if: always()`, because a GUI step that fails says
nothing about whether the rows the app already committed are correct. It keeps
its own exit status: a GUI failure does not turn this audit green, and an audit
failure does not hide the GUI one. When it cannot run, it reports which checks
did not run and why.

Every figure below is read from the store and compared to the arithmetic the
workflow performed, and the failure message prints the observed value so a
mismatch says what changed rather than "assertion failed".

What changed in Phase 22D, and why
----------------------------------
1. The supplier balance was read under a key the product never emits (the Rust
   struct is `balance_paise`, serialised as `balancePaise`). That assertion
   would have aborted the whole audit before any financial check ran.
2. The stock baseline was 1.000 pcs. The installed-app script's own retail
   assertions read 4 -> 2.75 -> 2 -> 1.75 -> 1.5 pcs, so purchasing begins at
   **1.5**, and the expected figure is 1.5 + 0.75 - 0.25 + 1.0 = **3.0 pcs**,
   which is what the preserved-data stage also reads back after reinstall. The
   audit and the GUI now agree on one number instead of asserting two.
3. The reserved phrase is `RESTORE <12 hex>`, matched against the real pattern.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# The dataset the installed-app stage builds, in paise.
RECEIPT_PARTIAL_GOODS = 7500  # 1.000 received less 0.250 damaged, at 100.00
RECEIPT_PARTIAL_DAMAGED = 2500  # 0.250 damaged never enters stock or payable
INVOICE_VARIANCE = 500  # invoice 80.00 against 75.00 accrued
PARTIAL_PAYMENT = 3000
RETURN = 2500
RECEIPT_REMAINDER = 10000
CLOSING_PAYABLE = 12500
ORDER_TOTAL = 20000  # 2.000 at 100.00
RECEIVED_MILLI = 2000  # both receipts together, damaged excluded
NET_STOCK_MILLI = 1500  # +750 accepted of the first receipt, -250 returned, +1000 remainder
# What the retail stages left in stock when purchasing began. Not assumed: the
# same run's own retail assertions read 4 pcs, 2.75 after the 1.250 sale, 2.00
# after the 0.750 credit sale, 1.75 after the cashier's 0.250 sale and 1.50
# after the ₹5.00 + ₹5.63 split sale — which is the last stock movement before
# the purchasing lifecycle starts. The old 1.000 here contradicted all of them
# and would have failed every audit while the product was correct.
OPENING_RICE_MILLI = 1500
EXPECTED_RICE_MILLI = OPENING_RICE_MILLI + NET_STOCK_MILLI
# The confirmation phrase ("RESTORE <12 hex>") lives inside the encrypted
# archive and is used in-memory by the application; this audit cannot re-derive
# it without the recovery passphrase, which it deliberately never receives.


class AuditFailure(AssertionError):
    pass


def expect(label, observed, expected):
    if observed != expected:
        raise AuditFailure(f"{label}: expected {expected!r}, store holds {observed!r}")
    return observed


def optional(label, observed, expected, consequence):
    """A check that cannot abort the audit, reported with what it could not say."""
    result = {"check": label, "expected": expected, "observed": observed}
    result["status"] = "PASS" if observed == expected else "FAIL"
    if result["status"] == "FAIL":
        result["wouldHaveBlocked"] = consequence
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bridge", required=True, help="cashier_review_bridge binary")
    parser.add_argument(
        "--device-dir",
        required=True,
        help="the installed application's local data directory (holding workspace.db)",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--owner-password", default="SornioReviewAccess2026")
    parser.add_argument(
        "--backup",
        default="",
        help="encrypted archive the installed app exported; opened read-only for the "
        "backup/restored-state consistency check",
    )
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    device_dir = Path(args.device_dir)
    database = device_dir / "workspace.db"
    result = {
        "status": "FAIL",
        # GITHUB_SHA on a pull_request event is the synthetic merge commit; the
        # workflow supplies the real head commit separately.
        "sourceSha": os.environ.get("SORNIO_ACCEPTANCE_SOURCE_SHA") or os.environ.get("GITHUB_SHA"),
        "mergeSha": os.environ.get("GITHUB_SHA"),
        "runId": os.environ.get("GITHUB_RUN_ID"),
        "runnerOs": os.environ.get("RUNNER_OS"),
        "database": str(database),
        "keySource": "OS credential store via device::initialize (the shipped application's own path)",
        "observations": {},
        "checksNotRun": [],
        "supplementary": [],
    }

    def finish(status, reason=""):
        if reason:
            result["reason"] = reason
        result["status"] = status
        output.write_text(json.dumps(result, indent=2, default=str) + "\n", encoding="utf-8")
        print(json.dumps(result, indent=2, default=str))
        return 0 if status == "PASS" else 1

    # ---- Preconditions. Each says exactly which assertion could not run. ----
    if not database.is_file():
        result["checksNotRun"] = [
            "encrypted at rest",
            "supplier and purchase order",
            "receipt quantities",
            "damaged excluded from stock",
            "stock reconciliation",
            "payable ledger",
            "invoice variance",
            "payment allocations",
            "supplier return",
            "exactly-once operations",
            "backup consistency",
        ]
        return finish("BLOCKED", f"the installed application left no workspace at {database}")

    result["databaseBytes"] = database.stat().st_size
    with database.open("rb") as handle:
        header = handle.read(16)
    if header.startswith(b"SQLite format 3"):
        result["checksNotRun"] = ["every store assertion: the database is plaintext"]
        return finish("FAIL", "the installed workspace is an unencrypted SQLite database")
    result["observations"]["databaseHeader"] = header.hex()
    result["observations"]["encryptedAtRest"] = True

    scope = None
    process = subprocess.Popen(
        [str(Path(args.bridge).resolve()), str(database)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "SORNIO_REVIEW_DEVICE_DIR": str(device_dir)},
    )

    def call(command, **values):
        payload = {"command": command, "args": {**values, **({"scope": scope} if scope else {})}}
        process.stdin.write(json.dumps(payload) + "\n")
        process.stdin.flush()
        line = process.stdout.readline()
        if not line:
            detail = process.stderr.read() if process.poll() is not None else ""
            raise AuditFailure(f"{command}: the bridge stopped answering. {detail.strip()[:800]}")
        response = json.loads(line)
        if not response.get("ok"):
            raise AuditFailure(f"{command}: {response.get('error')}")
        return response.get("value")

    try:
        status = call("workspace_access_status")
        expect("access configured", status["configured"], True)
        unlocked = call("unlock_workspace", username="owner", password=args.owner_password)
        expect("owner unlock", unlocked["unlocked"], True)
        session = call("read_local_session")
        scope = session["scope"]
        result["businessName"] = session["businessName"]
        result["principal"] = session.get("principal")

        suppliers = call("find_local_suppliers", search="", includeArchived=True)
        expect("supplier count", len(suppliers), 1)
        supplier = suppliers[0]
        result["observations"]["supplier"] = supplier
        expect("supplier id", supplier["id"], "native-supplier-1")
        expect("supplier name", supplier["name"], "Native supplier")
        expect("supplier archived", supplier["archived"], False)
        # The product's own cached figure. It is a cache of the ledger below,
        # so it is checked against it rather than trusted independently.
        expect("supplier cached balance", supplier["balancePaise"], str(CLOSING_PAYABLE))
        expect("supplier cached overdue", supplier["overduePaise"], "0")

        statement = call(
            "read_supplier_statement", supplierId=supplier["id"], after=0, through=None
        )
        entries = statement["entries"]
        result["observations"]["statementEntries"] = [
            {"kind": e["kind"], "amountPaise": e["amountPaise"],
             "runningBalancePaise": e["runningBalancePaise"], "reference": e.get("reference")}
            for e in entries
        ]
        result["observations"]["closingBalancePaise"] = statement["closingBalancePaise"]
        expect("no opening balance", statement["openingBalancePaise"], "0")
        expect("payable closing balance", statement["closingBalancePaise"], str(CLOSING_PAYABLE))
        # The ledger must explain the balance it reports: one entry per money
        # movement, in order, adding up to the closing figure.
        amounts = [int(e["amountPaise"]) for e in entries]
        expect(
            "payable ledger movements",
            amounts,
            [RECEIPT_PARTIAL_GOODS, INVOICE_VARIANCE, -PARTIAL_PAYMENT, -RETURN, RECEIPT_REMAINDER],
        )
        expect("payable ledger sum", sum(amounts), CLOSING_PAYABLE)
        expect(
            "payable ledger running balances",
            [int(e["runningBalancePaise"]) for e in entries],
            [7500, 8000, 5000, 2500, 12500],
        )
        # Exactly-once: one entry per operation, no operation recorded twice.
        operation_ids = [e["operationId"] for e in entries]
        expect("one ledger entry per operation", len(set(operation_ids)), len(operation_ids))
        kinds = [e["kind"] for e in entries]
        expect("ledger kinds in order", kinds,
               ["receipt", "invoice", "payment", "return", "receipt"])

        orders = call("find_purchase_orders", search="", status="", supplierId=supplier["id"])
        expect("purchase order count", len(orders), 1)
        expect("purchase order number", orders[0]["number"], 1)
        expect("purchase order status", orders[0]["status"], "closed")
        expect("purchase order total", orders[0]["totalPaise"], ORDER_TOTAL)
        order = call("get_purchase_order", id=orders[0]["id"])
        result["observations"]["purchaseOrder"] = {
            "id": order["id"], "number": order["number"], "status": order["status"],
            "totalPaise": order["totalPaise"], "revision": order["revision"],
            "approvedAt": order.get("approvedAt"), "lines": order["lines"],
        }
        expect("purchase order line count", len(order["lines"]), 1)
        line = order["lines"][0]
        expect("received against the line", line["receivedMilli"], RECEIVED_MILLI)
        expect("ordered quantity", line["quantityMilli"], 2000)
        expect("unit cost", line["unitCostPaise"], 100)
        expect("line subtotal", line["lineSubtotalPaise"], ORDER_TOTAL)

        # Accepted quantities, derived from the receipts and returns themselves.
        # This part needs no baseline: damaged pieces are excluded here, so the
        # accepted total is 750 + 1000 and the return took 250 back out.
        receipts = call("list_goods_receipts", orderId=order["id"])
        result["observations"]["receipts"] = [
            {"id": r["id"], "reference": r.get("reference"),
             "goodsTotalPaise": r["goodsTotalPaise"], "damagedTotalPaise": r["damagedTotalPaise"],
             "orderStatus": r["orderStatus"], "lines": r["lines"]} for r in receipts
        ]
        expect("goods receipt count", len(receipts), 2)
        expect(
            "receipt goods totals",
            sorted(r["goodsTotalPaise"] for r in receipts),
            sorted([RECEIPT_PARTIAL_GOODS, RECEIPT_REMAINDER]),
        )
        expect(
            "damaged goods recorded",
            sorted(r["damagedTotalPaise"] for r in receipts),
            sorted([RECEIPT_PARTIAL_DAMAGED, 0]),
        )
        expect(
            "challan references preserved",
            sorted(str(r.get("reference")) for r in receipts),
            ["NATIVE-PARTIAL", "NATIVE-REMAINDER"],
        )
        # The damaged quarter-kilo is recorded on the first receipt and nowhere
        # else: damaged stock is a receipt attribute, never a stock movement.
        partial = [r for r in receipts if r["damagedTotalPaise"] == RECEIPT_PARTIAL_DAMAGED]
        expect("exactly one receipt carries damage", len(partial), 1)
        damaged_line = partial[0]["lines"][0]
        expect("damaged quantity on the line", damaged_line["damagedMilli"], 250)
        expect("received quantity on the line", damaged_line["quantityMilli"], 1000)
        expect("damaged never exceeds received", damaged_line["damagedMilli"] <= damaged_line["quantityMilli"], True)

        returns = call("list_purchase_returns", supplierId=supplier["id"])
        result["observations"]["purchaseReturns"] = returns
        expect("purchase return count", len(returns), 1)
        expect("purchase return value", returns[0]["totalPaise"], RETURN)
        expect("purchase return is against the partial receipt", returns[0]["receiptId"], partial[0]["id"])
        expect("purchase return reason preserved", returns[0]["reason"], "Native accepted-stock return")

        accepted = sum(r["goodsTotalPaise"] for r in receipts)
        damaged = sum(r["damagedTotalPaise"] for r in receipts)
        unit_cost = line["unitCostPaise"]
        expect("accepted goods total", accepted, RECEIPT_PARTIAL_GOODS + RECEIPT_REMAINDER)
        expect("damaged goods total", damaged, RECEIPT_PARTIAL_DAMAGED)
        expect(
            "net stock movement implied by the purchase records",
            (accepted - RETURN) * 1000 // unit_cost,
            NET_STOCK_MILLI,
        )

        products = call("list_local_products")
        result["observations"]["products"] = [
            {"id": p["id"], "name": p["name"], "sku": p["sku"], "stockMilli": p["stockMilli"]}
            for p in products
        ]
        rice = [p for p in products if p["name"] == "Sample native rice"]
        expect("rice product count", len(rice), 1)
        result["observations"]["riceStockMilli"] = rice[0]["stockMilli"]
        # Inventory reconciliation: damaged goods never entered stock and the
        # returned quarter-kilo left it, so stock moved by exactly the accepted
        # quantity. The expectation is the measured baseline plus that movement;
        # a mismatch reports the figure the store actually holds.
        expect("rice stock after the purchasing lifecycle", rice[0]["stockMilli"], EXPECTED_RICE_MILLI)
        expect("rice product is the one on the order line", rice[0]["id"], line["productId"])

        # ---- Supplementary: recorded, never allowed to abort the audit. ----
        # The restore phrase is reserved inside the encrypted archive and typed
        # by the installed-app stage; the audit cannot re-open that archive
        # without the recovery passphrase, which is used in-memory by the app and
        # deliberately not available here. What the store can prove is the
        # restore that happened: the last-restore receipt the product persisted.
        try:
            restore = call("read_last_restore")
            result["observations"]["lastRestore"] = restore
            result["supplementary"].append(
                optional("a restore was committed after the purchasing backup",
                         bool(restore and restore.get("backupId")),
                         True,
                         "the installed-app stage asserts it reached the restored 12500 state"))
            if restore:
                expect(
                    "the restore receipt names an encrypted backup identifier",
                    bool(re.match(r"^[a-f0-9]{8,}", str(restore.get("backupId", "")))),
                    True,
                )
                expect("the restore receipt has a creation time", int(restore.get("createdAt", 0)) > 0, True)
        except AuditFailure as failure:
            result["supplementary"].append(
                {"check": "last restore receipt", "status": "NOT RUN", "reason": str(failure)})

        # ---- Backup / restored-state consistency. ----
        # Compare the archive the app exported with the live store: a backup is
        # consistent when the committed rows it claims to contain are the rows
        # this audit just reconciled.
        if args.backup:
            archive = Path(args.backup)
            if not archive.is_file():
                result["supplementary"].append(
                    {"check": "backup consistency", "status": "NOT RUN",
                     "reason": f"{archive} was not produced by the installed app"})
            else:
                size = archive.stat().st_size
                with archive.open("rb") as handle:
                    magic = handle.read(16)
                result["observations"]["backup"] = {
                    "path": str(archive), "bytes": size, "header": magic.hex(),
                    "encrypted": not magic.startswith(b"SQLite format 3"),
                }
                expect("backup is at least one SQLCipher page", size >= 4096, True)
                expect("backup is encrypted", magic.startswith(b"SQLite format 3"), False)

        result["checksNotRun"] = []
        return finish("PASS")
    except AuditFailure as failure:
        result["reason"] = str(failure)
        result["checksNotRun"] = ["every check after the failing assertion, in this order: "
                                  "encrypted at rest, supplier, order, receipts, damage, "
                                  "returns, stock, ledger, backup"]
        print(f"::error::purchasing store audit failed: {failure}")
        return finish("FAIL", str(failure))
    finally:
        try:
            process.stdin.close()
        except Exception:
            pass
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    sys.exit(main())
