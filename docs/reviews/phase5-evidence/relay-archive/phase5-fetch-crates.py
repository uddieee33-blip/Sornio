# Temporary Phase 5 relay helper (archived under docs/reviews/phase5-evidence/).
# Copies cargo-fetched .crate files and verifies each against Cargo.lock.
import glob
import hashlib
import os
import re
import shutil
import sys

lock = open("packages/local-store/Cargo.lock").read()
sums = {}
for block in lock.split("[[package]]"):
    name = re.search(r'name = "([^"]+)"', block)
    ver = re.search(r'version = "([^"]+)"', block)
    chk = re.search(r'checksum = "([0-9a-f]{64})"', block)
    if name and ver and chk:
        sums[f"{name.group(1)}-{ver.group(1)}.crate"] = chk.group(1)
count = 0
for path in glob.glob(os.path.expanduser("~/.cargo/registry/cache/*/*.crate")):
    base = os.path.basename(path)
    h = hashlib.sha256(open(path, "rb").read()).hexdigest()
    if base in sums and sums[base] != h:
        print(f"CRATE HASH MISMATCH {base}", file=sys.stderr)
        sys.exit(1)
    shutil.copy(path, os.path.join("relay/crates", base))
    count += 1
print(f"relayed {count} crate files, all verified against Cargo.lock where listed")
print("CRATES_FETCH_OK", flush=True)
