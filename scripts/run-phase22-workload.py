"""Measure the explicitly selected native SQLCipher workload, never a GUI proxy.

Requires psutil. Pass the unit-test executable emitted by cargo test --no-run.
The result is written even on failure; a missing metrics record cannot pass.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time

import psutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    log_path = output.with_suffix(".log")
    test = "phase22_reliability_tests::requested_synthetic_dataset_reconciles_after_restart_and_backup_restore"
    command = [str(Path(args.binary).resolve()), test, "--exact", "--ignored", "--nocapture"]
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "status", "--porcelain"], text=True)
    executable_sha256 = hashlib.sha256(Path(command[0]).read_bytes()).hexdigest()
    source_hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in sorted(Path("packages/local-store/src").rglob("*")) if path.is_file()}
    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    started = time.monotonic()
    peak_rss = 0
    cpu = {}
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
    records = [json.loads(line.split("PHASE22_METRICS ", 1)[1])
               for line in log_path.read_text().splitlines() if "PHASE22_METRICS " in line]
    result = {"result": "PASS" if code == 0 and len(records) == 1 and records[0]["result"] == "PASS" else "FAIL",
              "started_at_utc": started_at, "host": platform.platform(), "executable": command[0],
              "source_commit": source_commit, "working_tree_at_start": dirty,
              "executable_sha256": executable_sha256, "source_sha256_at_start": source_hashes,
              "exit_code": code, "timed_out": timed_out, "wall_seconds": elapsed,
              "peak_process_tree_rss_bytes": peak_rss, "sampled_cpu_seconds": sum(cpu.values()),
              "average_cpu_percent_of_one_core": 100 * sum(cpu.values()) / elapsed,
              "sampling_interval_seconds": 0.25, "native_metrics": records, "log": str(log_path)}
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
