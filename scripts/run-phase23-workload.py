"""Measure the Phase 23 native SQLCipher 10,000-product / 50,000-invoice workload.

Requires psutil. Pass the unit-test executable emitted by `cargo test --no-run`.
Records exact host hardware, dataset counts, latency percentiles, database size
growth, peak RSS, and financial reconciliation without fabricating estimates.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import time

import psutil


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    log_path = output.with_suffix(".log")
    test = "phase23_reliability_tests::phase23_ten_thousand_products_and_fifty_thousand_invoices_benchmark"
    command = [str(Path(args.binary).resolve()), test, "--exact", "--ignored", "--nocapture"]

    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    executable_sha256 = hashlib.sha256(Path(command[0]).read_bytes()).hexdigest()
    vm = psutil.virtual_memory()
    hardware = {
        "os": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "physical_cores": psutil.cpu_count(logical=False),
        "logical_cores": psutil.cpu_count(logical=True),
        "total_ram_bytes": vm.total,
    }

    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    started = time.monotonic()
    peak_rss = 0
    cpu: dict[tuple[int, float], float] = {}
    timed_out = False

    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        root = psutil.Process(process.pid)
        while process.poll() is None:
            if time.monotonic() - started > args.timeout:
                timed_out = True
                process.kill()
                break
            try:
                members = [root] + root.children(recursive=True)
                rss = 0
                for member in members:
                    try:
                        rss += member.memory_info().rss
                        times = member.cpu_times()
                        cpu[(member.pid, member.create_time())] = times.user + times.system
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                peak_rss = max(peak_rss, rss)
            except psutil.NoSuchProcess:
                pass
            time.sleep(0.25)
        code = process.wait()

    elapsed = time.monotonic() - started
    records = [
        json.loads(line.split("PHASE23_METRICS ", 1)[1])
        for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if "PHASE23_METRICS " in line
    ]
    passed = code == 0 and len(records) == 1 and records[0].get("result") == "PASS"
    result = {
        "result": "PASS" if passed else "FAIL",
        "started_at_utc": started_at,
        "hardware": hardware,
        "executable": command[0],
        "executable_sha256": executable_sha256,
        "source_commit": source_commit,
        "exit_code": code,
        "timed_out": timed_out,
        "wall_seconds": round(elapsed, 3),
        "peak_process_tree_rss_bytes": peak_rss,
        "sampled_cpu_seconds": round(sum(cpu.values()), 3),
        "native_metrics": records,
        "log": str(log_path),
    }
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    if os.environ.get("GITHUB_ACTIONS") == "true":
        compact = {
            "result": result["result"],
            "os": hardware["os"],
            "cores": hardware["logical_cores"],
            "ram_gb": round(vm.total / (1024**3), 2),
            "wall_s": result["wall_seconds"],
            "peak_rss_mb": round(peak_rss / (1024**2), 2),
            "metrics": records[0] if records else None,
        }
        print(f"::notice::PHASE23_WORKLOAD_METRICS {json.dumps(compact, separators=(',', ':'))}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
