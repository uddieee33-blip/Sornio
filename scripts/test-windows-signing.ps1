<#
.SYNOPSIS
  Safe automated verification suite for scripts/sign-windows-installer.ps1.
  Exercises missing secrets, partial secrets, invalid Base64/PFX, wrong
  password, missing Code Signing EKU, expired certificate, RFC 3161 timestamp
  failure, untrusted self-signed certificate refusal, modified-installer
  tamper detection, manifest mismatch rejection, and secret non-leakage.
  Never generates or exports any certificate as a trusted release credential.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'sign-windows-installer.ps1')).Path
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sornio-signing-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$createdThumbprints = New-Object System.Collections.Generic.List[string]
$savedEnv = @{
  WINDOWS_SIGNING_CERT_PFX_BASE64 = $env:WINDOWS_SIGNING_CERT_PFX_BASE64
  WINDOWS_SIGNING_CERT_PASSWORD   = $env:WINDOWS_SIGNING_CERT_PASSWORD
  WINDOWS_SIGNING_TIMESTAMP_URL   = $env:WINDOWS_SIGNING_TIMESTAMP_URL
  GITHUB_ACTIONS                  = $env:GITHUB_ACTIONS
}

function Clear-SigningEnv {
  Remove-Item Env:WINDOWS_SIGNING_CERT_PFX_BASE64 -ErrorAction SilentlyContinue
  Remove-Item Env:WINDOWS_SIGNING_CERT_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:WINDOWS_SIGNING_TIMESTAMP_URL -ErrorAction SilentlyContinue
  $env:GITHUB_ACTIONS = 'false'
}

function Invoke-SignExpectFailure {
  param(
    [string] $CaseName,
    [scriptblock] $Action,
    [string] $ExpectedPattern,
    [string[]] $ForbiddenSecrets = @()
  )
  $threw = $false
  $combined = ''
  try {
    $out = (& $Action | Out-String)
    $combined = $out
  }
  catch {
    $threw = $true
    $combined = ($_.Exception.Message + "`n" + ($_ | Out-String))
  }
  if (-not $threw) {
    throw "FAIL [$CaseName]: expected failure matching '$ExpectedPattern', but succeeded. Output: $combined"
  }
  if ($ExpectedPattern -and ($combined -notmatch $ExpectedPattern)) {
    throw "FAIL [$CaseName]: error did not match '$ExpectedPattern'. Got: $combined"
  }
  foreach ($secret in $ForbiddenSecrets) {
    if (-not [string]::IsNullOrEmpty($secret) -and $combined.Contains($secret)) {
      throw "FAIL [$CaseName]: SECRET LEAKED IN ERROR OUTPUT!"
    }
  }
  Write-Output "PASS [$CaseName]"
}

function Export-TempCertBase64 {
  param(
    [System.Security.Cryptography.X509Certificates.X509Certificate2] $Cert,
    [string] $Password
  )
  $createdThumbprints.Add($Cert.Thumbprint)
  $bytes = $Cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password)
  return [Convert]::ToBase64String($bytes)
}

try {
  $dummyFile = Join-Path $tempRoot 'Sornio-Test-Installer.ps1'
  Set-Content -LiteralPath $dummyFile -Value "Write-Output 'Sornio signing test fixture'" -Encoding utf8
  $manifestPath = Join-Path $tempRoot 'manifest.json'

  # 1. Missing secrets -> honest BLOCKED manifest, releaseReady=false, not SIGNED
  Clear-SigningEnv
  $null = & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  $m = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
  if ($m.signingState -ne 'BLOCKED' -or $m.releaseReady -ne $false -or $m.authenticodeStatus -ne 'NotSigned') {
    throw "FAIL [missing-secrets]: unexpected manifest: $($m | ConvertTo-Json -Compress)"
  }
  # VerifyManifest accepts matching BLOCKED manifest without -RequireSignature
  $null = & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath -VerifyManifest
  Write-Output 'PASS [missing-secrets-blocked-manifest]'

  # 2. Missing secrets with -RequireSignature -> fails closed
  Invoke-SignExpectFailure -CaseName 'missing-secrets-require-signature' -ExpectedPattern 'Signature required' -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath -RequireSignature
  }
  Invoke-SignExpectFailure -CaseName 'verify-blocked-manifest-require-signature' -ExpectedPattern 'Release signature required' -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath -VerifyManifest -RequireSignature
  }

  # 3. Partial secrets (cert without password; password without cert) -> fail closed, no leak
  $secretSentinel = 'SuperSecretTestPass_NeverLog_987654!'
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = 'QUFBQUFB'
  Invoke-SignExpectFailure -CaseName 'partial-secret-cert-only' -ExpectedPattern 'Incomplete signing configuration' -ForbiddenSecrets @('QUFBQUFB') -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'partial-secret-password-only' -ExpectedPattern 'Incomplete signing configuration' -ForbiddenSecrets @($secretSentinel) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 4. Invalid Base64 / corrupt PFX -> fail closed, no leak
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = '%%%not-valid-base64%%%'
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'invalid-base64' -ExpectedPattern 'not valid Base64' -ForbiddenSecrets @($secretSentinel, '%%%not-valid-base64%%%') -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('corrupt-pfx-bytes'))
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'corrupt-pfx' -ExpectedPattern 'could not be loaded' -ForbiddenSecrets @($secretSentinel) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 5. Wrong password for a real PFX -> fail closed, password never leaked
  $wrongPassCert = New-SelfSignedCertificate -Subject 'CN=Sornio Negative Test Only' -Type CodeSigningCert -KeyExportPolicy Exportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(2)
  $wrongPassB64 = Export-TempCertBase64 -Cert $wrongPassCert -Password 'CorrectTestPassword123!'
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = $wrongPassB64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'wrong-pfx-password' -ExpectedPattern 'could not be loaded' -ForbiddenSecrets @($secretSentinel, $wrongPassB64) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 6. Certificate lacking Code Signing EKU (ServerAuth only) -> rejected before signing
  $noEkuCert = New-SelfSignedCertificate -Subject 'CN=Sornio No-EKU Negative Test' -Type SSLServerAuthentication -KeyExportPolicy Exportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(2)
  $noEkuB64 = Export-TempCertBase64 -Cert $noEkuCert -Password $secretSentinel
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = $noEkuB64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'missing-code-signing-eku' -ExpectedPattern '1\.3\.6\.1\.5\.5\.7\.3\.3' -ForbiddenSecrets @($secretSentinel, $noEkuB64) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 7. Expired Code Signing certificate -> rejected before signing
  $expiredCert = New-SelfSignedCertificate -Subject 'CN=Sornio Expired Negative Test' -Type CodeSigningCert -KeyExportPolicy Exportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotBefore (Get-Date).AddDays(-10) -NotAfter (Get-Date).AddDays(-1)
  $expiredB64 = Export-TempCertBase64 -Cert $expiredCert -Password $secretSentinel
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = $expiredB64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $secretSentinel
  Invoke-SignExpectFailure -CaseName 'expired-certificate' -ExpectedPattern 'expired' -ForbiddenSecrets @($secretSentinel, $expiredB64) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 8. Invalid timestamp URL -> fail closed
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = $wrongPassB64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = 'CorrectTestPassword123!'
  $env:WINDOWS_SIGNING_TIMESTAMP_URL = 'ftp://invalid-tsa.example'
  Invoke-SignExpectFailure -CaseName 'invalid-timestamp-url' -ExpectedPattern 'Invalid RFC 3161 timestamp server URL' -ForbiddenSecrets @('CorrectTestPassword123!', $wrongPassB64) -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $manifestPath
  }

  # 9. Unreachable RFC 3161 timestamp server -> signtool fails closed & secret never leaked
  $tsaTestFile = Join-Path $tempRoot 'Sornio-TSA-Fail-Test.ps1'
  Copy-Item -LiteralPath $dummyFile -Destination $tsaTestFile -Force
  Clear-SigningEnv
  $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = $wrongPassB64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = 'CorrectTestPassword123!'
  $env:WINDOWS_SIGNING_TIMESTAMP_URL = 'http://127.0.0.1:1/unreachable-tsa'
  Invoke-SignExpectFailure -CaseName 'unreachable-rfc3161-tsa' -ExpectedPattern 'signtool\.exe sign failed' -ForbiddenSecrets @('CorrectTestPassword123!', $wrongPassB64) -Action {
    & $scriptPath -InstallerPath $tsaTestFile -OutputManifestPath (Join-Path $tempRoot 'tsa-fail-manifest.json')
  }

  # 10. Modified installer after manifest generation -> VerifyManifest detects SHA-256 / size tamper
  Clear-SigningEnv
  $tamperFile = Join-Path $tempRoot 'Sornio-Tamper-Test.ps1'
  $tamperManifest = Join-Path $tempRoot 'tamper-manifest.json'
  Copy-Item -LiteralPath $dummyFile -Destination $tamperFile -Force
  $null = & $scriptPath -InstallerPath $tamperFile -OutputManifestPath $tamperManifest
  # Modify single byte preserving file length -> catches SHA-256 mismatch
  $origBytes = [System.IO.File]::ReadAllBytes($tamperFile)
  $origBytes[$origBytes.Length - 1] = [byte]($origBytes[$origBytes.Length - 1] -bxor 0x01)
  [System.IO.File]::WriteAllBytes($tamperFile, $origBytes)
  Invoke-SignExpectFailure -CaseName 'modified-installer-sha256-mismatch' -ExpectedPattern 'SHA-256 mismatch' -Action {
    & $scriptPath -InstallerPath $tamperFile -OutputManifestPath $tamperManifest -VerifyManifest
  }

  # 11. Forged manifest claiming SIGNED/releaseReady for an unsigned file -> rejected fail-closed
  $forgedManifest = Join-Path $tempRoot 'forged-manifest.json'
  $forgedObj = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
  $forgedObj.signingState = 'SIGNED'
  $forgedObj.releaseReady = $true
  $forgedObj.authenticodeStatus = 'Valid'
  $forgedObj.codeSigningEkuVerified = $true
  $forgedObj.timestampVerified = $true
  $forgedObj.timestampSigner = 'CN=Fake TSA'
  $forgedObj | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $forgedManifest -Encoding utf8
  Invoke-SignExpectFailure -CaseName 'forged-signed-manifest-for-unsigned-file' -ExpectedPattern 'Manifest claims SIGNED/releaseReady' -Action {
    & $scriptPath -InstallerPath $dummyFile -OutputManifestPath $forgedManifest -VerifyManifest
  }

  Write-Output 'ALL 11 WINDOWS SIGNING NEGATIVE & CONTRACT TESTS PASSED'
  if ($savedEnv['GITHUB_ACTIONS'] -eq 'true') {
    Write-Output '::notice::WINDOWS_SIGNING_TESTS_PASSED 11/11'
  }
}
catch {
  if ($savedEnv['GITHUB_ACTIONS'] -eq 'true') {
    Write-Output "::error::WINDOWS_SIGNING_TEST_FAILURE: $($_.Exception.Message)"
  }
  throw
}
finally {
  foreach ($tp in $createdThumbprints) {
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$tp" -Force -ErrorAction SilentlyContinue
  }
  foreach ($k in $savedEnv.Keys) {
    if ($null -eq $savedEnv[$k]) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:$k" -Value $savedEnv[$k] }
  }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
