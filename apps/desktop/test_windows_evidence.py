"""Synthetic regression tests for the installed-Windows evidence gate."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location('windows_evidence', Path(__file__).with_name('check-windows-evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WindowsEvidenceContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.installer_dir = root / 'nsis'
        self.evidence = root / 'evidence'
        self.installer_dir.mkdir()
        self.evidence.mkdir()
        self.installer = self.installer_dir / 'Sornio-review-setup.exe'
        self.installer.write_bytes(b'Synthetic installer, not an executable')
        self.artifact = {
            'artifactSha256': hashlib.sha256(self.installer.read_bytes()).hexdigest().upper(),
            'signatureStatus': 'NotSigned',
            'lifecycle': 'same-version-reinstall-not-upgrade',
            'execution': 'passed',
        }
        self.lifecycle = {key: 'passed' for key in module.REQUIRED_PASSES}
        self.lifecycle.update({key: 'untested' for key in module.REQUIRED_UNTESTED})
        self.manifest = {
            'generatedAtUtc': '2026-11-03T00:00:00.0000000Z',
            'commitSha': 'a' * 40,
            'workflowName': 'Windows local workspace',
            'workflowRunId': '12345',
            'runnerOs': 'Windows',
            'installerFile': self.installer.name,
            'installerBytes': self.installer.stat().st_size,
            'installerSha256': hashlib.sha256(self.installer.read_bytes()).hexdigest(),
            'installedExePath': 'C:\\SornioPilotAcceptance\\sornio-desktop.exe',
            'installedExeBytes': 23456789,
            'installedExeSha256': 'b' * 64,
        }
        for name in module.REQUIRED_SCREENSHOTS:
            Image.new('RGB', (800, 500), (242, 242, 242)).save(self.evidence / name)
        self.write_records()

    def write_records(self):
        (self.evidence / 'installer-artifact.json').write_text(json.dumps(self.artifact), encoding='utf-8')
        (self.evidence / 'installer-lifecycle-result.json').write_text(json.dumps(self.lifecycle), encoding='utf-8')
        (self.evidence / 'installer-manifest.json').write_text(json.dumps(self.manifest), encoding='utf-8')

    def run_check(self):
        return module.verify(self.installer_dir, self.evidence)

    def test_complete_engineering_evidence_never_claims_consumer_ready(self):
        result = self.run_check()
        self.assertEqual(result['windowsEngineeringEvidence'], 'passed')
        self.assertEqual(result['consumerPilotDecision'], 'blocked')
        self.assertFalse(result['signedConsumerReleaseVerified'])
        self.assertEqual(len(result['screenshots']), len(module.REQUIRED_SCREENSHOTS))
        self.assertEqual(result['installerManifest']['installerSha256'], self.manifest['installerSha256'])
        self.assertEqual(result['installerManifest']['installedExeSha256'], 'b' * 64)
        self.assertEqual(result['installerManifest']['commitSha'], 'a' * 40)

    def test_manifest_installer_hash_mismatch_is_detected(self):
        self.manifest['installerSha256'] = 'c' * 64
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'installerSha256'):
            self.run_check()

    def test_manifest_size_mismatch_is_detected(self):
        self.manifest['installerBytes'] = self.manifest['installerBytes'] + 1
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'installerBytes'):
            self.run_check()

    def test_manifest_without_installed_exe_hash_is_rejected(self):
        self.manifest['installedExeSha256'] = 'not-a-hash'
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'installed application executable'):
            self.run_check()

    def test_manifest_without_commit_is_rejected(self):
        self.manifest['commitSha'] = ''
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'commit SHA'):
            self.run_check()

    def test_missing_manifest_is_rejected(self):
        (self.evidence / 'installer-manifest.json').unlink()
        with self.assertRaisesRegex(ValueError, 'evidence record'):
            self.run_check()

    def test_installer_tampering_is_detected(self):
        self.installer.write_bytes(b'Different installer, same filename')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.run_check()

    def test_incomplete_execution_is_rejected(self):
        self.artifact['execution'] = 'started-not-passed'
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'completed execution'):
            self.run_check()

    def test_failed_lifecycle_is_not_accepted(self):
        self.lifecycle['sameVersionReinstallAndVaultReopen'] = 'blocked'
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'not passed'):
            self.run_check()

    def test_untested_upgrade_cannot_be_claimed_passed_without_new_evidence_contract(self):
        self.lifecycle['actualVersionUpgrade'] = 'passed'
        self.write_records()
        with self.assertRaisesRegex(ValueError, 'untested gate'):
            self.run_check()

    def test_missing_screenshot_is_rejected(self):
        (self.evidence / 'windows-retail-closing.png').unlink()
        with self.assertRaisesRegex(ValueError, 'native screenshot'):
            self.run_check()

    def test_corrupt_screenshot_is_rejected(self):
        (self.evidence / 'windows-retail-closing.png').write_bytes(b'PNG header only')
        with self.assertRaisesRegex(ValueError, 'native screenshot'):
            self.run_check()

    def test_missing_lifecycle_record_is_rejected(self):
        (self.evidence / 'installer-lifecycle-result.json').unlink()
        with self.assertRaisesRegex(ValueError, 'evidence record'):
            self.run_check()

    def test_multiple_installers_are_rejected(self):
        (self.installer_dir / 'another-setup.exe').write_bytes(b'extra')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            self.run_check()

    def test_cli_writes_blocked_pilot_evidence_only_after_success(self):
        command = [sys.executable, str(Path(__file__).with_name('check-windows-evidence.py')),
                   '--installer-dir', str(self.installer_dir), '--evidence-dir', str(self.evidence)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        evidence = json.loads((self.evidence / 'windows-evidence-verification.json').read_text())
        self.assertEqual(evidence['consumerPilotDecision'], 'blocked')
        self.assertEqual(evidence['windowsEngineeringEvidence'], 'passed')
        self.assertIn('BLOCKED', run.stdout)

    def test_cli_failure_does_not_publish_success_evidence(self):
        (self.evidence / 'windows-local-cash-receipt.png').unlink()
        command = [sys.executable, str(Path(__file__).with_name('check-windows-evidence.py')),
                   '--installer-dir', str(self.installer_dir), '--evidence-dir', str(self.evidence)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertFalse((self.evidence / 'windows-evidence-verification.json').exists())
        self.assertNotIn('BLOCKED.', run.stdout)


if __name__ == '__main__':
    unittest.main()
