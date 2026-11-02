"""Synthetic stdio/Workspace/SQLCipher checks; no browser or Windows claim.

Build cashier_review_bridge first. Timings describe this host, not shop hardware.
Every database and recovery file is isolated in a temporary directory.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import statistics
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bridge", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    results = {"environment": "Linux native stdio fixture; synthetic data", "products": 1000,
               "customers": 1000, "invoices": 1000, "timings_ms": {}}
    secret = "Synthetic scale owner password"
    recovery = "Separate synthetic scale recovery phrase"
    with tempfile.TemporaryDirectory(prefix="sornio-scale-") as folder:
        archive = Path(folder) / "scale.sorniobackup"
        env = {**os.environ, "SORNIO_REVIEW_BACKUP": str(archive)}
        scope = None
        process = None

        def start():
            return subprocess.Popen([str(Path(args.bridge).resolve()), str(Path(folder) / "scale.db")],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True, env=env)

        def call(command, **values):
            payload = {"command": command, "args": {**values, **({"scope": scope} if scope else {})}}
            process.stdin.write(json.dumps(payload) + "\n")
            process.stdin.flush()
            response = json.loads(process.stdout.readline())
            if not response.get("ok"):
                raise AssertionError(f"{command}: {response.get('error')}")
            return response.get("value")

        def measure(name, task, repetitions=1):
            samples = []
            for _ in range(repetitions):
                before = time.perf_counter()
                task()
                samples.append((time.perf_counter() - before) * 1000)
            results["timings_ms"][name] = {"samples": repetitions, "median": round(statistics.median(samples), 3),
                                           "maximum": round(max(samples), 3)}

        try:
            process = start()
            call("setup_local_access", setup={"businessName": "Synthetic scale shop", "businessType": "general",
                 "displayName": "Synthetic Owner", "username": "owner"}, password=secret)
            scope = call("read_local_session")["scope"]

            def products():
                for i in range(1000):
                    operation = f"scale-product-{i}"
                    call("add_local_product", request={"operationId": operation, "name": f"Synthetic product {i:04d}",
                         "sku": f"SCALE-{i}", "unit": "pcs", "unitPricePaise": 10000, "openingStockMilli": 2000000})
                    call("acknowledge_local_inventory", operationId=operation)
            measure("seed_1000_products", products)

            def customers():
                for i in range(1000):
                    call("save_local_customer", r={"operationId": f"scale-profile-{i}", "id": f"scale-customer-{i}",
                         "name": f"Synthetic customer {i:04d}", "phone": None, "creditLimitPaise": None,
                         "creditDays": 0, "expectedRevision": None})
            measure("seed_1000_customers", customers)

            def invoices():
                for i in range(1000):
                    operation = f"scale-sale-{i}"
                    request = {"operationId": operation, "lines": [{"productId": "scale-product-0",
                               "expectedRevision": i+1, "quantityMilli": 1000}], "taxBasisPoints": 0,
                               "tender": "cash", "customerId": None}
                    call("prepare_local_checkout", request=request)
                    saved = call("post_local_invoice", request=request)
                    assert saved["totalPaise"] == 10000
                    call("clear_local_checkout", operationId=operation, saved=True)
            measure("post_1000_invoices_with_checkpoints", invoices)
            assert len(call("list_local_products")) == 1000
            measure("list_1000_products", lambda: call("list_local_products"), 30)
            measure("customer_search_in_1000", lambda: call("find_local_customers", search="customer 0999", overdueOnly=False), 30)
            measure("cashier_state_with_1000_invoices", lambda: call("read_cashier_state"), 30)
            cursor, count = 0, 0
            while rows := call("list_local_invoices", after=cursor):
                count += len(rows)
                cursor = rows[-1]["sequence"]
            assert count == 1000
            # The durable command contract must retain disposition through a lost reply/restart.
            lines = [{"lineIndex": 0, "quantityMilli": 1000, "disposition": "damaged"}]
            quote = call("quote_local_return", invoiceId="scale-sale-999", lines=lines)
            returned = {"operationId": "scale-damaged-return", "action": {"kind": "return", "invoiceId": "scale-sale-999",
                        "expectedRevision": quote["revision"], "lines": lines, "refunds": quote["suggestedRefunds"],
                        "reason": "Damaged goods excluded from available stock"}}
            call("prepare_local_retail", r=returned)
            receipt = call("post_local_retail", r=returned)
            assert receipt["data"]["stockRestored"] is False
            process.terminate()
            process.wait(timeout=10)
            process = start()
            call("unlock_workspace", username="owner", password=secret)
            scope = call("read_local_session")["scope"]
            assert call("post_local_retail", r=returned) == receipt
            products_after = call("list_local_products")
            assert next(p for p in products_after if p["id"] == "scale-product-0")["stockMilli"] == 1000000
            assert call("read_cashier_state")["balances"]["cashPaise"] == "9990000"
            measure("encrypted_backup", lambda: call("export_local_backup", currentPassword=secret, recoveryPassword=recovery))
            day = datetime.datetime.now(datetime.timezone(datetime.timedelta(minutes=330))).date().isoformat()
            measure("settlement_export", lambda: call("export_local_settlements", day=day), 5)
            results["backup_bytes"] = archive.stat().st_size
            results["result"] = "PASS"
        finally:
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
