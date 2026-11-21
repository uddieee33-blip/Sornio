"""Exercise the installed audit's assertions on a disposable, real SQLCipher fixture."""
import argparse
import json
import os
import runpy
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bridge", type=Path, required=True)
    bridge = parser.parse_args().bridge.resolve()
    audit = runpy.run_path(str(Path(__file__).with_name("check-purchasing-store.py")))["audit_open_workspace"]
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / "purchase.sorniobackup"
        database = Path(directory) / "fixture.db"
        env = {**os.environ, "SORNIO_REVIEW_BACKUP": str(archive)}
        env.pop("SORNIO_REVIEW_DEVICE_DIR", None)

        def start():
            return subprocess.Popen([str(bridge), str(database)], stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE, encoding="utf-8", env=env)

        password = "Disposable purchasing review password"
        scope = None
        with start() as writer:
            def call(command, **args):
                if scope:
                    args["scope"] = scope
                writer.stdin.write(json.dumps({"command": command, "args": args}) + "\n")
                writer.stdin.flush()
                response = json.loads(writer.stdout.readline())
                assert response["ok"], (command, response)
                return response["value"]

            call("setup_local_access", setup=dict(businessName="Fixture", businessType="general",
                 displayName="Owner", username="owner"), password=password)
            scope = call("read_local_session")["scope"]
            call("add_local_product", request=dict(operationId="rice", name="Sample native rice",
                 sku="NATIVE-RICE", unit="pcs", unitPricePaise=4250, openingStockMilli=1500))
            call("acknowledge_local_inventory", operationId="rice")
            supplier = "native-supplier-1"
            call("save_local_supplier", r=dict(operationId="supplier", id=supplier, name="Native supplier",
                 paymentTermsDays=30, notes="", archived=False))
            order = call("create_purchase_order", r=dict(operationId="order", supplierId=supplier, note="",
                         lines=[dict(productId="rice", quantityMilli=2000, unitCostPaise=10000, taxBps=0)]))
            order = call("submit_purchase_order", r=dict(operationId="submit", id=order["id"],
                         expectedRevision=order["revision"]))
            call("decide_purchase_order", r=dict(operationId="approve", id=order["id"],
                 decision="approve", expectedRevision=order["revision"]))

            def receive(challan, damage):
                return call("post_goods_receipt", r=dict(operationId=challan, orderId=order["id"],
                            reference=challan, note="", lines=[dict(lineIndex=0, productId="rice",
                            quantityMilli=1000, damagedMilli=damage)]))

            first = receive("NATIVE-PARTIAL", 250)
            call("post_supplier_invoice", r=dict(operationId="invoice", supplierId=supplier,
                 receiptId=first["id"], reference="NATIVE-INVOICE-1", totalPaise=8000))
            call("post_supplier_payment", r=dict(operationId="payment", supplierId=supplier,
                 method="bank", amountPaise=3000, reference="NATIVE-BANK-PARTIAL"))
            call("post_purchase_return", r=dict(operationId="return", receiptId=first["id"],
                 disposition="supplier_credit", reason="Native accepted-stock return",
                 lines=[dict(receiptLine=0, productId="rice", quantityMilli=250)]))
            receive("NATIVE-REMAINDER", 0)
            order = call("get_purchase_order", id=order["id"])
            call("close_purchase_order", r=dict(operationId="close", id=order["id"],
                 expectedRevision=order["revision"]))

            credentials = dict(currentPassword=password, recoveryPassword="Disposable recovery phrase")
            saved = call("export_local_backup", **credentials)
            call("post_supplier_payment", r=dict(operationId="settle", supplierId=supplier,
                 method="bank", amountPaise=12500, reference="FINAL"))
            assert call("read_supplier_statement", supplierId=supplier, after=0)["closingBalancePaise"] == "0"
            credentials["originalPassword"] = password
            preview = call("preview_local_backup", **credentials)
            call("restore_local_backup", **credentials, confirmation=preview["confirmation"])
            writer.stdin.close()

        receipt = Path(directory) / "receipt.json"
        options = SimpleNamespace(owner_password=password, backup_receipt=receipt, backup="")
        def verify(expected_status, expected_reason=""):
            result = {"observations": {}}
            with start() as reader:
                status, reason = audit(reader, options, result, lambda status, reason="": (status, reason))
            assert status == expected_status and expected_reason in reason, (status, reason)
            observations = result["observations"]
            assert observations["purchasingReconciled"]
            assert observations["closingBalancePaise"] == "12500" and observations["riceStockMilli"] == 3000

        verify("BLOCKED", "did not record")
        evidence = {"path": str(archive), "backupId": saved["backupId"], "sha256": saved["fileSha256"]}
        receipt.write_text(json.dumps(evidence))
        verify("PASS")
        receipt.write_text(json.dumps({**evidence, "sha256": "0" * 64}))
        verify("FAIL", "archive hash")
        receipt.write_text(json.dumps({**evidence, "backupId": "0" * 64}))
        verify("FAIL", "restored the exported")
    print("PASS: reopened SQLCipher fixture, five postings, 12500 paise, 3000 milli-units, "
          "matching export and restore; missing receipt, wrong digest and wrong ID rejected.")


if __name__ == "__main__":
    main()
