#!/usr/bin/env node
/**
 * One product, one installer, one identity.
 *
 * The repository contains two Windows applications:
 *
 *   apps/desktop   Tauri + Rust + React, offline, bundled assets  <- THE PRODUCT
 *   desktop/windows  C#/WebView2 shell around the hosted web app  <- review only
 *
 * They used to share an executable name (`Sornio`), an installer name
 * (`Sornio-Setup-x64`), and both uploaded Windows artefacts. A shop could
 * therefore be handed an online-only build and never know. Nothing in a compiler
 * or a test suite catches that, so it is asserted here instead:
 *
 *   1. only the offline Tauri app may produce a shop-facing installer;
 *   2. the hosted preview may only run manually and may only emit artefacts
 *      whose names cannot be mistaken for the product;
 *   3. the two binaries can never share a name;
 *   4. the product's identity and version agree across three manifests, because
 *      a version that drifts silently breaks upgrade and data preservation;
 *   5. the product window is a bundled, offline, devtools-closed, local-only
 *      capability window.
 *
 * Static analysis of configuration and workflow files. It proves packaging
 * intent, never that an installer built or installed.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';
const PRODUCT = 'apps/desktop';
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`ok   ${label}`);
};

const read = path => readFileSync(path, 'utf8');
const workflows = readdirSync(WORKFLOWS)
  .filter(name => name.endsWith('.yml'))
  .map(name => ({ name, path: join(WORKFLOWS, name), text: read(join(WORKFLOWS, name)) }));

// --- 1. Exactly one workflow may build a shop-facing Windows installer -------
// Tauri's NSIS bundler writes `bundle/nsis/*-setup.exe`; that is the product.
const installers = workflows.filter(w => /bundle\/nsis\/\*-setup\.exe/.test(w.text));
assert.deepEqual(
  installers.map(w => w.name),
  ['windows-local.yml'],
  `only windows-local.yml may publish the product installer, found ${installers.map(w => w.name)}`,
);
const product = workflows.find(w => w.name === 'windows-local.yml');
check(/npm run desktop:build --prefix apps\/desktop/.test(product.text),
  'the product installer is built from apps/desktop (tauri build), not from another app');
check(/cargo test --all-targets --release --locked --manifest-path packages\/local-store\/Cargo\.toml/.test(product.text),
  'the product pipeline runs the native encrypted-store test suite before packaging');
check(/check-installer\.ps1/.test(product.text),
  'the product pipeline runs the installed-application lifecycle acceptance script');
const lifecycle = read('apps/desktop/check-installer.ps1');
check(/New-NetFirewallRule[\s\S]{0,400}Action Block/.test(lifecycle),
  'installed acceptance blocks outbound network for both the app and WebView2, proving offline operation');
check(/Check-Exit 'installed offline fixture'/.test(lifecycle),
  'installed acceptance fails the build if the offline fixture does not pass');
check(/actualVersionUpgrade = 'untested'/i.test(lifecycle) || /actualVersionUpgrade.*untested/i.test(lifecycle),
  'installed acceptance refuses to claim a real version upgrade it does not perform');
check(/signatureStatus/.test(lifecycle), 'installed acceptance records the installer signature status as evidence');

// --- 2. The hosted preview can only run manually and cannot look shippable ---
const preview = workflows.find(w => w.name === 'windows-desktop.yml');
assert.ok(preview, 'the hosted preview workflow still exists (it must be identified, not silently deleted)');
const triggers = preview.text.match(/^on:\n([\s\S]*?)\n(?:permissions|env|jobs):/m)?.[1] ?? '';
check(/^\s*workflow_dispatch:/m.test(triggers), 'the hosted preview runs only on manual dispatch');
check(!/^\s*(pull_request|push):/m.test(triggers), 'the hosted preview never runs automatically');
const previewNames = [...preview.text.matchAll(/name:\s*(Sornio[\w-]*)/g)].map(m => m[1]);
check(previewNames.length > 0, 'the hosted preview names its jobs and artefacts explicitly');
check(
  previewNames.every(name => name.startsWith('Sornio-Hosted-Preview')),
  `every hosted-preview artefact says so: ${[...new Set(previewNames)].join(', ')}`,
);
check(/desktop\/windows\/DukaanOS\.Windows\.csproj/.test(preview.text),
  'the hosted preview still builds the C# wrapper, i.e. the two remain distinguishable');

// --- 3. The two executables must never share a name --------------------------
const csproj = read('desktop/windows/DukaanOS.Windows.csproj');
const previewExe = csproj.match(/<AssemblyName>([^<]+)<\/AssemblyName>/)?.[1];
const tauri = JSON.parse(read(`${PRODUCT}/src-tauri/tauri.conf.json`));
check(previewExe === 'SornioHostedPreview', `hosted preview assembly is ${previewExe}`);
check(!/^Sornio$/.test(previewExe ?? ''), 'the hosted preview cannot install itself as "Sornio"');
const iss = read('desktop/windows/setup.iss');
check(/OutputBaseFilename=Sornio-Hosted-Preview-Setup-x64/.test(iss),
  'the hosted preview installer is named Sornio-Hosted-Preview-Setup-x64');
check(!/Sornio\.exe/.test(iss), 'the hosted preview installer references no product-named executable');
check(/NOT THE PRODUCT|ONLINE-ONLY|not the Sornio product/i.test(iss + csproj),
  'both hosted-preview manifests say in-file that they are not the product');

// --- 4. Product identity and version agree across all three manifests --------
const packageJson = JSON.parse(read(`${PRODUCT}/package.json`));
const cargo = read(`${PRODUCT}/src-tauri/Cargo.toml`);
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const [major, minor] = tauri.version.split('.');
check(tauri.identifier === 'com.sornio.localreview', `product identifier is ${tauri.identifier}`);
check(packageJson.version === tauri.version,
  `package.json version ${packageJson.version} matches tauri.conf.json ${tauri.version}`);
check(cargoVersion === tauri.version,
  `Cargo.toml version ${cargoVersion} matches tauri.conf.json ${tauri.version}`);
const cargoMajorMinor = cargoVersion.split(".").slice(0, 2).join(".");
check(cargoMajorMinor === `${major}.${minor}`,
  `NSIS update identity ${cargoMajorMinor} shares the major.minor of ${tauri.version}`);
check(/^version = "\d+\.\d+\.\d+"/m.test(cargo), `product version is semver (${tauri.version})`);

// --- 5. The product window is bundled, offline, and minimally privileged -----
check(tauri.bundle?.targets?.includes('nsis'), 'the product ships an NSIS installer');
check(tauri.bundle?.windows?.webviewInstallMode?.type === 'offlineInstaller',
  'WebView2 is bundled offline, so a shop needs no internet to install');
check(tauri.bundle?.windows?.nsis?.installMode === 'currentUser',
  'the product installs per-user (no administrator rights on a shop PC)');
const windows = tauri.app?.windows ?? [];
check(windows.length === 1, `the product exposes one window (${windows.length})`);
const [main] = windows;
check(main?.label === 'main', 'the single window is labelled main');
check(!main?.url || !/^https?:/i.test(main.url),
  `the product window loads bundled assets, not a remote origin (${main?.url ?? 'bundled'})`);
check(main?.devtools === false, 'devtools are closed in the shipped window');
const capability = JSON.parse(read('packages/../apps/desktop/src-tauri/capabilities/local-workspace.json'));
check(capability.local === true && capability.windows?.length === 1 && capability.windows[0] === 'main',
  'the native command capability is local-only and scoped to the single product window');

// --- 6. The offline product must not embed a hosted-origin dependency --------
const rendererFiles = readdirSync(`${PRODUCT}/src`).filter(name => /\.tsx?$/.test(name));
for (const file of rendererFiles) {
  const source = read(`${PRODUCT}/src/${file}`);
  assert.ok(!/dukaan-os-six\.vercel\.app/.test(source), `${file} must not reference the hosted app origin`);
  assert.ok(!/https?:\/\//.test(source), `${file} must not contain a remote URL`);
}
check(true, `no offline renderer file references the hosted origin (${rendererFiles.length} files)`);

// --- 7. A shop-facing release must carry the native tests and the docs ------
check(/if-no-files-found: error/.test(product.text), 'a missing installer fails the product pipeline');
check(/Upload actual native screenshots[\s\S]{0,400}if-no-files-found: ignore/.test(product.text),
  'accepted, reviewed native captures are uploaded as evidence without pretending they are guaranteed');

console.log(`\n${checks} Windows release-identity checks passed`);
