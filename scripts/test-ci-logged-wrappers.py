#!/usr/bin/env python3
"""Exercise the actual workflow Bash blocks with command/tee failure injection.

Requires Python 3 and Bash, no additional Python packages. Stubs stand in for
external build tools; the wrapper, diagnostics, and exit logic come from YAML.
"""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
CASES = {
    "windows-release": ("windows-local.yml", "Test encrypted storage, Windows vault and restart behavior"),
    "windows-debug": ("windows-local.yml", "Test encrypted storage in the debug profile (overflow checks and debug assertions active)"),
    "windows-installer": ("windows-local.yml", "Build independent Windows installer"),
    "browser-native-debug": ("workspace-browser.yml", "Test native billing and inventory in debug and release"),
    "browser-native-release": ("workspace-browser.yml", "Test native billing and inventory in debug and release"),
    "browser-acceptance": ("workspace-browser.yml", "Run browser acceptance"),
    "desktop-browser": ("workspace-browser.yml", "Build and review local desktop access UI"),
}
INJECTIONS = [(0, 0), (1, 0), (23, 0), (0, 19), (23, 19)]
if Path('/dev/full').exists():
    # Exercise a real tee write error as well as a deterministic stub failure.
    INJECTIONS += [(0, 1), (23, 1)]


def workflow_block(filename, name, ref):
    path = ".github/workflows/" + filename
    if ref:
        content = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT,
                                 text=True, capture_output=True, check=True).stdout
    else:
        content = (ROOT / path).read_text()
    lines = content.splitlines()
    marker = f"      - name: {name}"
    assert lines.count(marker) == 1, f"workflow step missing or ambiguous: {marker}"
    start = lines.index(marker) + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("      - ")), len(lines))
    block = lines[start:end]
    assert block.count("        run: |") == 1, f"no unique Bash block: {name}"
    body = block[block.index("        run: |") + 1 :]
    assert all(not line or line.startswith("          ") for line in body), name
    return "\n".join(line[10:] if line else "" for line in body) + "\n"


STUB = r'''#!/usr/bin/env bash
set -u
name=${0##*/}
case "$name:$*" in
  "curl:"*) exit 0 ;;
  "npm:run start"*|"npm:run dev"*) exec sleep 30 ;;
esac
selected=0
case "$PROBE_CASE:$name:$*" in
  windows-release:cargo:*--release*|windows-debug:cargo:*|windows-installer:npm:run\ desktop:build*) selected=1 ;;
  browser-native-debug:cargo:*) [[ " $* " == *" --release "* ]] || selected=1 ;;
  browser-native-release:cargo:*--release*) selected=1 ;;
  browser-acceptance:node:*verify-workspace-browser.cjs*) selected=1 ;;
  desktop-browser:node:*check-focus.cjs*) selected=1 ;;
esac
if (( selected )); then
  printf 'PROBE_TARGET\ntest injected FAILED\nerror: injected failure\n'
  exit "$PROBE_COMMAND_EXIT"
fi
printf 'PROBE_OTHER %s %s\n' "$name" "$*"
exit 0
'''
TEE = r'''#!/usr/bin/env bash
set -u
spool=$(mktemp)
trap 'rm -f "$spool"' EXIT
cat > "$spool"
if grep -q PROBE_TARGET "$spool" && (( PROBE_TEE_EXIT != 0 )); then
  if (( PROBE_TEE_EXIT == 1 )); then
    /usr/bin/tee /dev/full < "$spool"
    exit "$?"
  fi
  cat "$spool"
  printf 'injected tee write failure\n' >&2
  exit "$PROBE_TEE_EXIT"
fi
/usr/bin/tee "$@" < "$spool"
'''


def run_case(directory, case, command_exit, tee_exit, ref):
    filename, name = CASES[case]
    body = workflow_block(filename, name, ref)
    syntax = subprocess.run(["bash", "-n"], input=body, text=True, capture_output=True)
    if syntax.returncode:
        raise AssertionError(f"invalid Bash {case}: {syntax.stderr}")
    env = os.environ.copy()
    env.update({"PATH": str(directory) + os.pathsep + env["PATH"], "RUNNER_TEMP": str(directory),
                "PROBE_CASE": case, "PROBE_COMMAND_EXIT": str(command_exit),
                "PROBE_TEE_EXIT": str(tee_exit)})
    return subprocess.run(["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", body],
                          cwd=ROOT, env=env, text=True, capture_output=True, timeout=20)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expect-vulnerable", action="store_true", help="Verify baseline false successes")
    parser.add_argument("--workflow-ref", help="Read actual workflow blocks from a Git ref")
    args = parser.parse_args()
    failures = []
    with tempfile.TemporaryDirectory(prefix="sornio-ci-wrapper-") as tmp:
        directory = Path(tmp)
        for name in ("cargo", "npm", "node", "curl"):
            f = directory / name
            f.write_text(STUB)
            f.chmod(0o755)
        f = directory / "tee"
        f.write_text(TEE)
        f.chmod(0o755)
        for case in CASES:
            for command_exit, tee_exit in INJECTIONS:
                result = run_case(directory, case, command_exit, tee_exit, args.workflow_ref)
                expected = 0 if args.expect_vulnerable else (command_exit or tee_exit)
                if "PROBE_TARGET" not in result.stdout:
                    failures.append(f"{case} command={command_exit} tee={tee_exit}: targeted command did not run")
                if result.returncode != expected:
                    failures.append(f"{case} command={command_exit} tee={tee_exit}: exit {result.returncode}, expected {expected}\n{result.stdout[-1800:]}\n{result.stderr[-500:]}")
                if not args.expect_vulnerable and expected and "::error::" not in result.stdout:
                    failures.append(f"{case} command={command_exit} tee={tee_exit}: no GitHub error annotation")
                if not args.expect_vulnerable and expected:
                    status_text = f"command exit {command_exit}, tee exit {tee_exit}"
                    if status_text not in result.stdout:
                        failures.append(f"{case}: annotation omitted actual pipeline statuses: {status_text}")
                    if tee_exit and "log write failed" not in result.stdout:
                        failures.append(f"{case}: logging failure was not explicitly annotated")
                    if command_exit and not tee_exit:
                        detail = "error: injected failure" if case == "windows-installer" else "test injected FAILED"
                        if not any("::error::" in line and detail in line for line in result.stdout.splitlines()):
                            failures.append(f"{case}: command failure detail not included in an annotation")
                if not args.expect_vulnerable and not expected and "::error::" in result.stdout:
                    failures.append(f"{case}: successful command emitted an error annotation")
                later = {
                    "browser-native-debug": "PROBE_OTHER cargo test --all-targets --locked --manifest-path packages/local-store/Cargo.toml --release",
                    "desktop-browser": "PROBE_OTHER node apps/desktop/check-inventory-refresh.cjs",
                }.get(case)
                if not args.expect_vulnerable and later and ((later in result.stdout) != (expected == 0)):
                    failures.append(f"{case}: subsequent check ran after a failure or failed to run after success")
                print(f"{case}: command={command_exit} tee={tee_exit} wrapper={result.returncode}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"{len(CASES) * len(INJECTIONS)} actual-workflow injection cases passed")


if __name__ == "__main__":
    main()
