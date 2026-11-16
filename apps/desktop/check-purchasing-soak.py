"""Controlled elapsed-time native payment/restart session on synthetic SQLCipher.

Uses the real Workspace bridge. Every uncertain write reuses its operation ID.
No installed-app or physical power-loss evidence is claimed.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bridge", required=True)
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.seconds < 60:
        parser.error("controlled session must last at least 60 seconds")
    started = time.monotonic()
    secret = "Phase22 synthetic purchasing password"
    process = None
    scope = None
    completed = 0
    crashes = 0
    result = {"result": "FAIL", "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
              "environment": platform.platform(), "executable": str(Path(args.bridge).resolve()),
              "requested_seconds": args.seconds}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sornio-phase22-soak-") as directory:
        def start():
            return subprocess.Popen([str(Path(args.bridge).resolve()), str(Path(directory)/"soak.db")],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)

        def send(command, **values):
            process.stdin.write(json.dumps({"command": command, "args": {**values, **({"scope": scope} if scope else {})}})+"\n")
            process.stdin.flush()

        def call(command, **values):
            send(command, **values)
            response = json.loads(process.stdout.readline())
            assert response.get("ok"), (command, response)
            return response.get("value")

        try:
            process = start()
            call("setup_local_access", setup={"businessName":"Synthetic soak shop", "businessType":"general",
                 "displayName":"Owner", "username":"owner"}, password=secret)
            scope = call("read_local_session")["scope"]
            call("save_local_supplier", r={"operationId":"soak-supplier", "id":"soak-supplier", "name":"Synthetic supplier",
                 "phone":None,"gstin":None,"address":None,"paymentTermsDays":30,"notes":"","archived":False,"expectedRevision":None})
            session_started = time.monotonic()
            while time.monotonic() - session_started < args.seconds:
                request = {"operationId":f"soak-payment-{completed}","supplierId":"soak-supplier","invoiceId":None,
                           "method":"bank","amountPaise":100,"reference":f"synthetic-{completed}","paidOn":None}
                if completed % 5 == 0:
                    # Intentionally never consume the response; kill the actual process.
                    send("post_supplier_payment", r=request)
                    time.sleep(0.05)
                    process.kill()
                    process.wait(timeout=10)
                    crashes += 1
                    scope = None
                    process = start()
                    call("unlock_workspace", username="owner", password=secret)
                    scope = call("read_local_session")["scope"]
                first = call("post_supplier_payment", r=request)
                second = call("post_supplier_payment", r=request)
                assert first == second
                completed += 1
                statement = call("read_supplier_statement", supplierId="soak-supplier",after=0,through=None)
                assert int(statement["supplier"]["balancePaise"]) == -100*completed
            elapsed = time.monotonic() - session_started
            result.update(result="PASS", session_elapsed_seconds=elapsed, payments=completed, forced_process_kills=crashes,
                          final_payable_paise=-100*completed, financial_reconciliation="PASS after every write and replay",
                          limitations="native bridge, synthetic bank advances, no installed GUI or physical power loss")
        except Exception as error:
            result["error"] = str(error)
            raise
        finally:
            if process and process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            result["total_elapsed_seconds"] = time.monotonic()-started
            output.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
