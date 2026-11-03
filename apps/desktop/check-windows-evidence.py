"""Verify native Windows review artifacts without calling them a consumer release.

This is an evidence-consistency gate, not a substitute for observing a real
Windows runner, checking physical peripherals, or conducting a usability study.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image

REQUIRED_PASSES = (
    'installedOfflineFixture',
    'stoppedDataPreservedAcrossUninstall',
    'sameVersionReinstallAndVaultReopen',
    'finalUninstallPreservesData',
)
REQUIRED_UNTESTED = (
    'actualVersionUpgrade',
    'runtimeAbsentOfflineInstall',
    'physicalPrinterScannerPowerLoss',
)
REQUIRED_SCREENSHOTS = (
    'windows-first-setup.png',
    'windows-local-cash-receipt.png',
    'windows-retail-closing.png',
    'windows-installed-preserved.png',
)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_record(path):
    try:
        record = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'Missing or invalid Windows evidence record: {Path(path).name}') from error
    if not isinstance(record, dict):
        raise ValueError(f'Expected a JSON object: {Path(path).name}')
    return record


def verify(installer_directory, evidence_directory):
    installer_directory, evidence_directory = Path(installer_directory), Path(evidence_directory)
    installers = list(installer_directory.glob('*-setup.exe'))
    if len(installers) != 1 or not installers[0].is_file():
        raise ValueError('Expected exactly one Windows NSIS review installer')
    installer = installers[0]
    artifact = read_record(evidence_directory / 'installer-artifact.json')
    lifecycle = read_record(evidence_directory / 'installer-lifecycle-result.json')
    manifest = read_record(evidence_directory / 'installer-manifest.json')
    actual_hash = sha256(installer)
    if artifact.get('artifactSha256', '').lower() != actual_hash:
        raise ValueError('Installed artifact SHA-256 does not match the captured installer')
    # The manifest is written on the runner that built and installed the bytes,
    # so its installer hash must equal the hash of the installer file we just
    # hashed here, and it must separately identify the installed executable.
    if manifest.get('installerSha256', '').lower() != actual_hash:
        raise ValueError('installer-manifest.json installerSha256 does not match the installer file hashed here')
    if manifest.get('installerBytes') != installer.stat().st_size:
        raise ValueError('installer-manifest.json installerBytes does not match the installer file size')
    if not re.fullmatch(r'[0-9a-f]{64}', str(manifest.get('installedExeSha256', ''))):
        raise ValueError('installer-manifest.json is missing a hex SHA-256 of the installed application executable')
    if not re.fullmatch(r'[0-9a-f]{40}(?:[0-9a-f]{24})?', str(manifest.get('commitSha', ''))):
        raise ValueError('installer-manifest.json is missing the source commit SHA')
    if artifact.get('execution') != 'passed':
        raise ValueError('Installer acceptance did not record completed execution')
    if artifact.get('lifecycle') != 'same-version-reinstall-not-upgrade':
        raise ValueError('Installer lifecycle evidence is missing its limited scope')
    if not isinstance(artifact.get('signatureStatus'), str) or not artifact['signatureStatus']:
        raise ValueError('Installer signature observation is missing')
    for field in REQUIRED_PASSES:
        if lifecycle.get(field) != 'passed':
            raise ValueError(f'Required Windows lifecycle acceptance not passed: {field}')
    for field in REQUIRED_UNTESTED:
        if lifecycle.get(field) != 'untested':
            raise ValueError(f'Release scope must explicitly disclose the untested gate: {field}')
    screenshots = []
    for name in REQUIRED_SCREENSHOTS:
        path = evidence_directory / name
        try:
            with Image.open(path) as picture:
                if picture.format != 'PNG' or picture.width < 640 or picture.height < 400:
                    raise ValueError('Unexpected screenshot format or dimensions')
                picture.load()  # Decode pixels; do not accept a fake header as visual evidence.
                width, height = picture.size
        except (OSError, ValueError) as error:
            raise ValueError(f'Missing or invalid native screenshot: {name}') from error
        screenshots.append({'file': name, 'sha256': sha256(path), 'width': width, 'height': height})
    return {
        'windowsEngineeringEvidence': 'passed',
        'consumerPilotDecision': 'blocked',
        'reason': 'A same-version engineering review cannot prove upgrades, offline installation without the runtime, or real shop hardware and usability.',
        'installerSha256': actual_hash,
        'installerManifest': {
            'installerFile': manifest['installerFile'],
            'installerBytes': manifest['installerBytes'],
            'installerSha256': manifest['installerSha256'],
            'installedExeSha256': manifest['installedExeSha256'],
            'commitSha': manifest['commitSha'],
            'workflowRunId': manifest.get('workflowRunId'),
        },
        'signatureObservation': artifact['signatureStatus'],
        'signedConsumerReleaseVerified': False,
        'passedWindowsLifecycleChecks': list(REQUIRED_PASSES),
        'remainingUntestedWindowsGates': list(REQUIRED_UNTESTED),
        'screenshots': screenshots,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--installer-dir', type=Path, required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.installer_dir, args.evidence_dir)
    target = args.evidence_dir / 'windows-evidence-verification.json'
    target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('Windows engineering evidence checks passed. Consumer pilot remains BLOCKED.')


if __name__ == '__main__':
    main()
