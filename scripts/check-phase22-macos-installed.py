"""Install and launch the actual unsigned macOS bundle and record what it proves.

This replaces an attempt that could only report its verdict in two places a
reviewer cannot read: the raw job log and an artifact archive. Both live in
storage that is not retrievable for this repository, so a run that correctly
detected a blocked environment was indistinguishable, from the outside, from a
run that crashed. Every verdict here is therefore also emitted as a workflow
annotation, which is readable through the checks API.

The distinction the verdict has to keep:

  PASS      the installed bundle ran the purchasing lifecycle. Never claimed
            here: no macOS UI driver exists in this repository.
  BLOCKED   the bundle installed and launched, and the automated purchasing
            interaction could not be run. Measured on this runner, the cause is
            the missing driver, not a denied permission: `UI elements enabled`
            comes back true, so macOS hosted runners do grant Accessibility.
            That distinction decides whether the remaining work is authoring or
            hardware, so the probe records both independently.
  FAIL      the product itself did not install or did not launch.

BLOCKED must not be reported as a pass. It also must not be reported as a
product failure, which is what an undifferentiated nonzero exit did: exit 78 is
the deliberate "blocked" code, and it is kept.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import time

# Exit codes are part of the contract: the workflow distinguishes them.
PASS, FAIL, BLOCKED = 0, 1, 78

SERVICE_DIRECTORY = "com.sornio.localreview"


def annotate(level, title, message):
    """Emit a GitHub workflow command so the verdict survives log expiry."""
    message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{level} title={title}::{message}")


def probe_process_trusted():
    """Whether *this* process may drive another application's UI.

    `get UI elements enabled` is an application-level setting; it can be true
    while the calling process is untrusted. AXIsProcessTrusted() answers the
    narrower question a driver depends on. It is loaded through ctypes so a
    failure to load is an answer ("not trusted here"), not a crash.
    """
    try:
        import ctypes

        framework = ctypes.CDLL(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )
        framework.AXIsProcessTrusted.restype = ctypes.c_bool
        return bool(framework.AXIsProcessTrusted())
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--data-dir",
        default=str(Path.home() / "Library" / "Application Support" / SERVICE_DIRECTORY),
        help="the installed application's app_local_data_dir()",
    )
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    result = {
        "status": "NOT RUN",
        # On a pull_request event GITHUB_SHA is the synthetic merge commit, which
        # names no tree anyone can check out. The workflow passes the real head
        # commit alongside it, and that is what this record must carry.
        "sourceSha": os.environ.get("SORNIO_ACCEPTANCE_SOURCE_SHA") or os.environ.get("GITHUB_SHA"),
        "mergeSha": os.environ.get("GITHUB_SHA"),
        "runId": os.environ.get("GITHUB_RUN_ID"),
        "runnerName": os.environ.get("RUNNER_NAME"),
        "environment": platform.platform(),
        "installation": "NOT RUN",
        "launch": "NOT RUN",
        "deviceKeyProvisioning": "NOT RUN",
        "workspaceEncryptedAtRest": "NOT RUN",
        "purchasingLifecycle": "NOT RUN",
        "signedDistribution": "NOT RUN",
    }
    app_process = None
    try:
        assert platform.system() == "Darwin", "Requires macOS"
        source = Path(args.app).resolve()
        executables = list((source / "Contents/MacOS").iterdir())
        assert len(executables) == 1, "Expected one application executable"
        result["executableSha256"] = hashlib.sha256(executables[0].read_bytes()).hexdigest()

        with tempfile.TemporaryDirectory(prefix="sornio-phase22-installed-") as folder:
            installed = Path(folder) / source.name
            shutil.copytree(source, installed)
            result["installedPath"] = str(installed)
            assert hashlib.sha256(
                (installed / "Contents/MacOS" / executables[0].name).read_bytes()
            ).hexdigest() == result["executableSha256"], "Installed copy differs from the built bundle"
            result["installation"] = "PASS"

            data_dir = Path(args.data_dir)
            before = set(data_dir.iterdir()) if data_dir.is_dir() else set()
            app_process = subprocess.Popen(
                [str(installed / "Contents/MacOS" / executables[0].name)],
                stdout=(output.parent / "macos-stdout.log").open("w"),
                stderr=(output.parent / "macos-stderr.log").open("w"),
            )
            try:
                time.sleep(10)
                assert app_process.poll() is None, f"Installed application exited {app_process.returncode}"
                result["launch"] = "PASS"

                # An assertion that does not need Accessibility: the shipped
                # binary provisions its device key through the login Keychain and
                # creates an encrypted workspace on first start. Reading that
                # file back proves the Keychain path works on a real macOS
                # account; "the process is still alive" proves none of it.
                database = data_dir / "workspace.db"
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline and not database.is_file():
                    time.sleep(0.5)
                if database.is_file():
                    header = database.open("rb").read(16)
                    result["workspaceBytes"] = database.stat().st_size
                    result["workspaceCreatedAtPath"] = str(database)
                    result["deviceKeyProvisioning"] = "PASS"
                    if header.startswith(b"SQLite format 3"):
                        result["workspaceEncryptedAtRest"] = "FAIL"
                        raise AssertionError("the installed macOS application wrote a plaintext database")
                    result["workspaceEncryptedAtRest"] = "PASS"
                    result["createdPaths"] = sorted(
                        str(p.relative_to(data_dir)) for p in set(data_dir.iterdir()) - before
                    )
                else:
                    result["deviceKeyProvisioning"] = "BLOCKED"
                    result["workspaceCreatedAtPath"] = None
                    annotate(
                        "warning",
                        "macOS device key",
                        f"the bundle launched but wrote no workspace under {data_dir} within 30s; "
                        "the Keychain-backed first start is unverified",
                    )

                subprocess.run(["screencapture", "-x", str(output.parent / "macos-installed.png")], check=False)
                probe = subprocess.run(
                    ["osascript", "-e", 'tell application "System Events" to get UI elements enabled'],
                    text=True,
                    capture_output=True,
                    timeout=20,
                )
                result["accessibilityProbe"] = {
                    "exitCode": probe.returncode,
                    "stdout": probe.stdout.strip(),
                    "stderr": probe.stderr.strip()[:800],
                }
                granted = probe.returncode == 0 and probe.stdout.strip() == "true"
                result["accessibilityGranted"] = granted
                # The claim under test is narrower than "Accessibility is on".
                # System Events can report automation as enabled while *this*
                # process is still not trusted to drive another application's
                # UI, which is the permission a driver actually needs. Both are
                # probed, and the AXIsProcessTrusted answer is the one that
                # decides whether an authored driver could work at all.
                trusted = probe_process_trusted()
                result["accessibilityGrantedToProcess"] = trusted
                result["driverFeasibility"] = (
                    "AUTHORABLE"
                    if granted and trusted
                    else "BLOCKED_PERMISSION"
                    if not granted
                    else "BLOCKED_PROCESS_TRUST"
                )
                # There is no macOS UI driver in this repository, and no way to
                # grant Accessibility to a process non-interactively on a hosted
                # runner: the grant lives in a SIP-protected TCC database that
                # needs a user at the machine. Both conditions are constraints of
                # the environment, so the lifecycle is BLOCKED, not FAIL.
                result["purchasingLifecycle"] = "BLOCKED"
                result["status"] = "BLOCKED"
                result["reason"] = (
                    "Installed and launched; macOS purchasing interaction is BLOCKED because "
                    + {
                        "AUTHORABLE": "the runner reports Accessibility for System Events and "
                        "process trust for this probe, so a driver is authorable, but none is "
                        "implemented in this repository yet, and ",
                        "BLOCKED_PERMISSION": "this runner reports Accessibility automation as "
                        "unavailable (measured, not assumed), and ",
                        "BLOCKED_PROCESS_TRUST": "System Events reports automation enabled but "
                        "this process is not trusted to drive another application's UI on a "
                        "hosted runner, and ",
                    }[result["driverFeasibility"]]
                    + "the Windows UIA driver cannot run on macOS."
                )
            finally:
                if app_process.poll() is None:
                    app_process.kill()
                app_process.wait(timeout=15)
    except Exception as error:
        result["status"] = "FAIL"
        result["reason"] = f"{type(error).__name__}: {error}"
    finally:
        result.setdefault("purchasingLifecycle", "NOT RUN")
        result["elapsedSeconds"] = round(time.monotonic() - started, 1)
        # Signed distribution needs an Apple Developer identity that CI does not
        # have; the bundle is explicitly unsigned. Never reported as a pass.
        result["signedDistribution"] = "BLOCKED"
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, indent=2))
        summary = (
            f"status={result['status']} installation={result['installation']} "
            f"launch={result['launch']} deviceKey={result['deviceKeyProvisioning']} "
            f"encryptedAtRest={result['workspaceEncryptedAtRest']} "
            f"purchasing={result['purchasingLifecycle']} "
            f"sha={result.get('sourceSha')} runner={result.get('runnerName')}"
        )
        annotate("warning" if result["status"] == "BLOCKED" else "error", "macOS installed acceptance", summary)
        if result.get("reason"):
            annotate("warning" if result["status"] == "BLOCKED" else "error", "macOS installed acceptance reason", result["reason"])
    return {"PASS": PASS, "BLOCKED": BLOCKED}.get(result["status"], FAIL)


if __name__ == "__main__":
    raise SystemExit(main())
