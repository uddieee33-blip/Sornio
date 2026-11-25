"""Cross-platform contract & negative tests for Windows Authenticode signing and manifest verification."""
import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIGN_SCRIPT = ROOT / "scripts" / "sign-windows-installer.ps1"
SIGN_TEST_PS1 = ROOT / "scripts" / "test-windows-signing.ps1"
WIN_WORKFLOW = ROOT / ".github" / "workflows" / "windows-local.yml"


def verify_manifest_offline(installer_path: Path, manifest_path: Path, require_signed: bool = False) -> dict:
    """Pure cross-platform manifest integrity & policy verifier matching sign-windows-installer.ps1."""
    if not installer_path.is_file():
        raise ValueError(f"Installer not found: {installer_path}")
    if not manifest_path.is_file():
        raise ValueError(f"Manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw = installer_path.read_bytes()
    actual_sha = hashlib.sha256(raw).hexdigest().lower()

    if manifest.get("fileName") != installer_path.name:
        raise ValueError("Manifest fileName mismatch")
    if int(manifest.get("sizeBytes", -1)) != len(raw):
        raise ValueError("Manifest sizeBytes mismatch")
    if manifest.get("sha256") != actual_sha:
        raise ValueError("Installer SHA-256 mismatch against manifest")

    state = manifest.get("signingState")
    release_ready = manifest.get("releaseReady")
    auth_status = manifest.get("authenticodeStatus")
    eku_ok = manifest.get("codeSigningEkuVerified")
    ts_ok = manifest.get("timestampVerified")

    if state == "SIGNED" or release_ready is True:
        if state != "SIGNED" or release_ready is not True:
            raise ValueError("signingState and releaseReady disagree")
        if auth_status != "Valid":
            raise ValueError("SIGNED manifest requires authenticodeStatus == Valid")
        if eku_ok is not True:
            raise ValueError("SIGNED manifest requires codeSigningEkuVerified == True")
        if ts_ok is not True or not manifest.get("timestampSigner"):
            raise ValueError("SIGNED manifest requires RFC 3161 timestamp verification")
        if not manifest.get("signerThumbprint"):
            raise ValueError("SIGNED manifest requires signerThumbprint")
    elif state == "BLOCKED":
        if release_ready is not False:
            raise ValueError("BLOCKED manifest must set releaseReady=False")
        if auth_status == "Valid":
            raise ValueError("BLOCKED manifest cannot claim Valid authenticodeStatus")
    else:
        raise ValueError(f"Unsupported signingState: {state!r}")

    if require_signed and not (state == "SIGNED" and release_ready is True and auth_status == "Valid"):
        raise ValueError("Release signature required but manifest is not release-ready")

    return manifest


class WindowsSigningContractTests(unittest.TestCase):
    def test_sign_script_enforces_eku_rfc3161_redaction_and_fail_closed_checks(self):
        src = SIGN_SCRIPT.read_text(encoding="utf-8")
        # Required Code Signing EKU OID check
        self.assertIn("1.3.6.1.5.5.7.3.3", src)
        self.assertIn("Test-CodeSigningEku", src)
        # Certificate validity window and private key check
        self.assertIn("HasPrivateKey", src)
        self.assertIn("NotBefore", src)
        self.assertIn("NotAfter", src)
        # Mandatory RFC 3161 SHA-256 timestamping & strict verify
        self.assertIn("/fd SHA256 /tr $timestampUrl /td SHA256", src)
        self.assertIn("verify /pa /tw", src)
        # Partial secret misconfiguration fails closed
        self.assertIn("$hasCert -xor $hasPass", src)
        # Secret redaction & secure temp PFX zero-wipe before delete
        self.assertIn("Remove-SecretText", src)
        self.assertIn("[REDACTED]", src)
        self.assertIn("New-Object byte[] ($pfxBytes.Length)", src)
        # Manifest verification mode
        self.assertIn("Invoke-VerifyInstallerManifest", src)
        self.assertIn("-VerifyManifest", src)
        # releaseReady strictly gated on SIGNED + Valid + EKU + timestamp
        self.assertIn(
            "$releaseReady = ($signingState -eq 'SIGNED' -and $statusText -eq 'Valid' -and $ekuVerified -and $timestampVerified)",
            src,
        )
        # Never echoes secrets directly
        self.assertIsNone(re.search(r"Write-(Output|Host|Warning|Error).*\$cert(Pass|B64)", src))

    def test_windows_workflow_runs_signing_tests_and_manifest_verification(self):
        wf = WIN_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("WINDOWS_SIGNING_CERT_PFX_BASE64", wf)
        self.assertIn("WINDOWS_SIGNING_CERT_PASSWORD", wf)
        self.assertIn("scripts/test-windows-signing.ps1", wf)
        self.assertIn("scripts/sign-windows-installer.ps1", wf)
        self.assertIn("-VerifyManifest", wf)
        self.assertTrue(SIGN_TEST_PS1.is_file())

    def test_manifest_verification_positive_and_negative_cases(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            installer = root / "Sornio Local Review_0.4.0_x64-setup.exe"
            payload = b"MZ-synthetic-unsigned-installer-bytes-for-manifest-test"
            installer.write_bytes(payload)
            sha = hashlib.sha256(payload).hexdigest().lower()

            blocked_manifest = root / "blocked.json"
            blocked = {
                "fileName": installer.name,
                "sizeBytes": len(payload),
                "sha256": sha,
                "signingState": "BLOCKED",
                "releaseReady": False,
                "authenticodeStatus": "NotSigned",
                "signerThumbprint": None,
                "codeSigningEkuVerified": False,
                "timestampVerified": False,
                "timestampSigner": None,
            }
            blocked_manifest.write_text(json.dumps(blocked), encoding="utf-8")

            # Valid BLOCKED manifest passes non-release check and fails require_signed
            self.assertEqual(verify_manifest_offline(installer, blocked_manifest)["signingState"], "BLOCKED")
            with self.assertRaisesRegex(ValueError, "Release signature required"):
                verify_manifest_offline(installer, blocked_manifest, require_signed=True)

            # Tampered installer bytes fail SHA-256 verification
            tampered = root / "tampered.json"
            tampered_bin = root / installer.name
            tampered_bin.write_bytes(payload[:-1] + b"X")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify_manifest_offline(tampered_bin, blocked_manifest)
            installer.write_bytes(payload)

            # Forged SIGNED/releaseReady without Valid status, EKU, or RFC 3161 timestamp fails closed
            for mutation, pattern in [
                ({"signingState": "BLOCKED", "releaseReady": True}, "disagree"),
                ({"signingState": "SIGNED", "releaseReady": True, "authenticodeStatus": "NotSigned"}, "Valid"),
                (
                    {
                        "signingState": "SIGNED",
                        "releaseReady": True,
                        "authenticodeStatus": "Valid",
                        "codeSigningEkuVerified": False,
                        "timestampVerified": True,
                        "timestampSigner": "CN=DigiCert TSA",
                        "signerThumbprint": "ABCD1234",
                    },
                    "codeSigningEkuVerified",
                ),
                (
                    {
                        "signingState": "SIGNED",
                        "releaseReady": True,
                        "authenticodeStatus": "Valid",
                        "codeSigningEkuVerified": True,
                        "timestampVerified": False,
                        "timestampSigner": None,
                        "signerThumbprint": "ABCD1234",
                    },
                    "RFC 3161 timestamp",
                ),
            ]:
                forged = {**blocked, **mutation}
                tampered.write_text(json.dumps(forged), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, pattern):
                    verify_manifest_offline(installer, tampered, require_signed=True)

            # Genuine fully-verified SIGNED manifest passes require_signed
            signed = {
                **blocked,
                "signingState": "SIGNED",
                "releaseReady": True,
                "authenticodeStatus": "Valid",
                "codeSigningEkuVerified": True,
                "timestampVerified": True,
                "timestampSigner": "CN=DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1",
                "signerThumbprint": "0123456789ABCDEF0123456789ABCDEF01234567",
            }
            signed_manifest = root / "signed.json"
            signed_manifest.write_text(json.dumps(signed), encoding="utf-8")
            verified = verify_manifest_offline(installer, signed_manifest, require_signed=True)
            self.assertTrue(verified["releaseReady"])


if __name__ == "__main__":
    unittest.main()
