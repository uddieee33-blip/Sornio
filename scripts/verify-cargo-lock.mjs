#!/usr/bin/env node

/**
 * Does each Cargo.lock actually contain what its Cargo.toml declares?
 *
 * `--locked` is used everywhere in this repository, and it is the right flag: a
 * shop's installer must not be built from dependency versions that resolved
 * differently from the ones that were reviewed. The failure it produces,
 * though, arrives after a Rust toolchain install and a crates.io index update,
 * and it reports every unresolvable edge at once without naming the manifest
 * that forgot to re-lock:
 *
 *   error: cannot update the lock file .../Cargo.lock because --locked was
 *   passed to prevent this
 *
 * That is how a stale lock reached `main`: `apps/desktop/src-tauri/Cargo.toml`
 * gained `rustls`, `rustls-pemfile`, `mdns-sd`, `url`, `httparse`, `sha2` and
 * `serde_json` across the LAN-hub phases while `Cargo.lock` was never
 * regenerated. The lock's own diff stayed empty, so review had nothing to look
 * at, and every `--locked` job failed later for a reason that looked like
 * infrastructure.
 *
 * This check answers the narrow, statically provable question: is every registry
 * dependency the manifest declares present in the lock as a `[[package]]`? It
 * needs no network and no toolchain, so it can run first and fail with the
 * manifest and the crate names in the annotation.
 *
 * What it does NOT do — on purpose:
 *   * it does not walk the transitive graph; `cargo build --locked` owns that;
 *   * it does not verify checksums or resolve versions;
 *   * it does not fail on a crate that is present in the file but is not a
 *     direct `dependencies` edge of the package, because that is the normal
 *     shape of an optional dependency no feature enables. It says so instead.
 *
 * Exit 1 with a precise list; never a silent pass.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTS = ['packages/local-store/Cargo.toml', 'apps/desktop/src-tauri/Cargo.toml'];

const DEPENDENCY_SECTIONS = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/** True for `[dependencies]` and `[target.'cfg(..)'.dependencies]` alike. */
const isDependencySection = (header) =>
  DEPENDENCY_SECTIONS.some((name) => header === name || header.endsWith(`.${name}`));

/**
 * Registry crate names declared by one manifest.
 *
 * Covers both TOML forms — `name = "1"` and `name = { version = "1", … }` — and
 * resolves `package = "real-name"`, because a renamed crate still has to exist
 * in the lock under its real name. Path dependencies are this repository's own
 * code and have no registry entry to look for.
 */
function declaredCrates(manifestPath) {
  const crates = new Map();
  let section = '';

  for (const rawLine of readFileSync(join(ROOT, manifestPath), 'utf8').split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (!isDependencySection(section)) continue;

    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;

    const [, alias, value] = assignment;
    if (/\bpath\s*=\s*"/.test(value)) continue;
    const crate = /package\s*=\s*"([^"]+)"/.exec(value)?.[1] ?? alias;
    crates.set(crate, section);
  }

  return crates;
}

/** Parse a lockfile into package names, their versions, and each package's edges. */
function readLock(lockPath) {
  const text = readFileSync(join(ROOT, lockPath), 'utf8');
  const names = new Set();
  const edges = new Map();

  for (const block of text.split('[[package]]').slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    if (!name) continue;
    names.add(name);
    const array = /dependencies = \[([\s\S]*?)\]/.exec(block);
    const listed = array
      ? array[1]
          .split('\n')
          .map((line) => line.trim().replace(/^"|",?$/g, '').trim())
          .filter(Boolean)
          // The format writes `name version` when two majors coexist.
          .map((entry) => entry.split(/\s+/)[0])
      : [];
    edges.set(name, new Set(listed));
  }

  return { names, edges, text };
}

/** `[package] name`/`version` from a manifest. */
function manifestIdentity(manifestPath) {
  const text = readFileSync(join(ROOT, manifestPath), 'utf8');
  const block = /\[package\]([\s\S]*?)(?:\n\[|$)/.exec(text)?.[1] ?? '';
  return {
    name: /^name = "([^"]+)"$/m.exec(block)?.[1],
    version: /^version = "([^"]+)"$/m.exec(block)?.[1],
    features: /^features = \[([\s\S]*?)\]/m.exec(block)?.[1] ?? '',
  };
}

let failures = 0;
let inspected = 0;

for (const manifestPath of MANIFESTS) {
  const lockPath = join(dirname(manifestPath), 'Cargo.lock');

  if (!existsSync(join(ROOT, lockPath))) {
    console.error(
      `::error file=${manifestPath},line=1::${dirname(manifestPath)} has no Cargo.lock at all; every --locked command there fails immediately.`,
    );
    failures += 1;
    continue;
  }

  const declared = declaredCrates(manifestPath);
  const identity = manifestIdentity(manifestPath);
  const { names, edges, text: lockText } = readLock(lockPath);
  inspected += declared.size;

  if (lockText.includes('source = "git+')) {
    // A git dependency pins a commit, not a registry version, and cannot be
    // validated by name presence. Better to say so than to imply coverage.
    console.log(`  note  ${lockPath} contains git dependencies; this check does not validate them.`);
  }

  if (!names.has(identity.name)) {
    console.error(
      `::error file=${lockPath},line=1::${lockPath} has no package entry for ${identity.name}; it was not generated from this manifest.`,
    );
    failures += 1;
    continue;
  }

  const missing = [...declared.entries()].filter(([crate]) => !names.has(crate));
  const unreachable = [...declared.entries()].filter(
    ([crate]) => names.has(crate) && !edges.get(identity.name)?.has(crate),
  );

  if (missing.length) {
    const listed = missing.map(([crate, section]) => `${crate} (${section})`).join(', ');
    console.error(
      `::error file=${manifestPath},line=1::${lockPath} does not contain ${listed}. ` +
        'Every `cargo build --locked` and `cargo test --locked` here will fail until the lock is regenerated. ' +
        `Fix, with network access: \`cargo generate-lockfile --manifest-path ${manifestPath}\` ` +
        `(or \`cargo update --workspace\` in ${dirname(manifestPath)}), then commit ${lockPath}.`,
    );
    for (const [crate, section] of missing) {
      console.error(`  absent from ${lockPath}: ${crate}  [${section}]`);
    }
    failures += 1;
    continue;
  }

  if (unreachable.length) {
    console.log(
      `  note  ${lockPath} contains ${unreachable.map(([crate]) => crate).join(', ')} but lists no direct edge ` +
        `from ${identity.name} — normal for an optional dependency no feature enables. \`cargo build --locked\` is the authority.`,
    );
  }

  console.log(
    `  ok    ${lockPath} contains all ${declared.size} declared dependencies of ${identity.name} ${identity.version ?? ''}`.trimEnd(),
  );
}

if (failures) {
  console.error(`verify-cargo-lock: ${failures} stale or unusable lockfile(s); ${inspected} declared dependencies inspected.`);
  process.exit(1);
}
console.log(`verify-cargo-lock: ${inspected} declared dependencies are all present in their lockfiles.`);
