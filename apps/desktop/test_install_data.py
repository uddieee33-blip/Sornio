import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('install_data', Path(__file__).with_name('check-install-data.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreservationEvidenceTests(unittest.TestCase):
    def test_same_size_corruption_and_wal_loss_are_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'workspace.db').write_bytes(b'ciphertext fixture')
            (root / 'workspace.db-wal').write_bytes(b'committed WAL fixture')
            original = module.snapshot(root)
            self.assertEqual(module.snapshot(root), original)
            (root / 'workspace.db').write_bytes(b'Ciphertext fixture')
            self.assertNotEqual(module.snapshot(root), original)
            (root / 'workspace.db').write_bytes(b'ciphertext fixture')
            (root / 'workspace.db-wal').unlink()
            self.assertNotEqual(module.snapshot(root), original)

    def test_missing_or_empty_database_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                module.snapshot(tmp)
            (Path(tmp) / 'workspace.db').touch()
            with self.assertRaises(ValueError):
                module.snapshot(tmp)

    def test_cli_rejects_changed_data_without_logging_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / 'workspace'
            data.mkdir()
            db = data / 'workspace.db'
            db.write_bytes(b'private-fixture-never-log')
            manifest = root / 'manifest.json'
            command = [sys.executable, str(Path(__file__).with_name('check-install-data.py'))]
            self.assertEqual(subprocess.run(command + ['snapshot', str(data), str(manifest)], capture_output=True).returncode, 0)
            self.assertEqual(subprocess.run(command + ['verify', str(data), str(manifest)], capture_output=True).returncode, 0)
            db.write_bytes(b'changed-fixture-never-log')
            failure = subprocess.run(command + ['verify', str(data), str(manifest)], capture_output=True)
            self.assertNotEqual(failure.returncode, 0)
            self.assertNotIn(b'changed-fixture-never-log', failure.stdout + failure.stderr)
            self.assertNotIn(b'private-fixture-never-log', manifest.read_bytes())

    def test_manifest_contains_no_file_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'workspace.db').write_bytes(b'not-a-real-password-or-database')
            result = module.snapshot(tmp)
            self.assertEqual(set(result), {'workspace.db'})
            self.assertEqual(set(result['workspace.db']), {'size', 'sha256'})
            self.assertEqual(len(result['workspace.db']['sha256']), 64)


if __name__ == '__main__':
    unittest.main()
