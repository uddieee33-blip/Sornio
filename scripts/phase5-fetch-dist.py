# Temporary Phase 5 relay helper (archived under docs/reviews/phase5-evidence/).
# Downloads official Rust stable dist components for x86_64-unknown-linux-gnu
# and verifies each against the official channel manifest SHA-256.
import hashlib
import json
import os
import sys
import tomllib
import urllib.request

with open("relay/channel-rust-stable.toml", "rb") as f:
    channel = tomllib.load(f)
version = channel["pkg"]["rustc"]["version"]
target = "x86_64-unknown-linux-gnu"
wanted = ["rustc", "rust-std", "cargo", "rustfmt", "clippy"]
manifest = {
    "channel": "stable",
    "version": version,
    "target": target,
    "source": "https://static.rust-lang.org/dist/channel-rust-stable.toml",
    "files": [],
}
print("RUST_VERSION=" + version, flush=True)
for comp in wanted:
    pkg = channel["pkg"][comp]["target"].get(target)
    if pkg is None or not pkg.get("available"):
        print(f"component {comp} unavailable for {target}", file=sys.stderr)
        sys.exit(1)
    url, sha = pkg["xz_url"], pkg["xz_hash"]
    name = url.rsplit("/", 1)[1]
    dest = os.path.join("relay/payload", name)
    print(f"downloading {name} from {url}", flush=True)
    urllib.request.urlretrieve(url, dest)
    h = hashlib.sha256()
    with open(dest, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest() != sha:
        print(f"HASH MISMATCH {name}", file=sys.stderr)
        sys.exit(1)
    manifest["files"].append(
        {"name": name, "component": comp, "url": url, "sha256": sha,
         "size": os.path.getsize(dest)}
    )
    print(f"verified {name} sha256={sha}", flush=True)
with open("relay/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("DIST_FETCH_OK", flush=True)
