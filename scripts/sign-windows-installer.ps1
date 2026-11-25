<#
.SYNOPSIS
  Signs and verifies a Windows NSIS installer with an Authenticode code-signing
  certificate when signing credentials are provisioned, or records an honest
  BLOCKED status when no certificate secret is configured.

  Security invariants (fail-closed):
  - Partial secret configuration (only base64 or only password) fails closed.
  - Certificate validity window (NotBefore/NotAfter), private key presence, and
    Code Signing EKU (OID 1.3.6.1.5.5.7.3.3) are verified before signing.
  - RFC 3161 SHA-256 timestamping (/tr /td SHA256) is mandatory; missing
    timestamp countersignature fails closed.
  - Unsigned, tampered, self-signed/untrusted, or untimestamped installers can
    NEVER receive signingState='SIGNED' or releaseReady=$true.
  - Secrets (certificate base64 or password) are redacted from all logs,
    errors, command output, and manifest files.
  - Supports -VerifyManifest mode to verify installer-to-manifest SHA-256,
    size, filename, EKU, timestamp, and live Authenticode signature integrity.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $InstallerPath,
  [Parameter(Mandatory = $true)]
  [string] $OutputManifestPath,
  [switch] $RequireSignature,
  [switch] $VerifyManifest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CODE_SIGNING_EKU_OID = '1.3.6.1.5.5.7.3.3'

function Remove-SecretText {
  param(
    [string] $Text,
    [string[]] $Secrets
  )
  if ([string]::IsNullOrEmpty($Text)) { return '' }
  $sanitized = $Text
  foreach ($s in $Secrets) {
    if (-not [string]::IsNullOrEmpty($s)) {
      $sanitized = $sanitized.Replace($s, '[REDACTED]')
    }
  }
  return $sanitized
}

function Test-CodeSigningEku {
  param([System.Security.Cryptography.X509Certificates.X509Certificate2] $Cert)
  if ($null -eq $Cert) { return $false }
  foreach ($ext in $Cert.Extensions) {
    if ($ext -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
      foreach ($oid in $ext.EnhancedKeyUsages) {
        if ($oid.Value -eq $CODE_SIGNING_EKU_OID) {
          return $true
        }
      }
    }
  }
  return $false
}

function Find-SignTool {
  $signtool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($signtool) { return $signtool.FullName }
  $cmd = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Invoke-VerifyInstallerManifest {
  param(
    [string] $TargetInstaller,
    [string] $ManifestPath,
    [bool] $MustBeSigned
  )
  if (-not (Test-Path -LiteralPath $TargetInstaller -PathType Leaf)) {
    throw "Installer not found for manifest verification: $TargetInstaller"
  }
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Manifest not found: $ManifestPath"
  }
  $item = Get-Item -LiteralPath $TargetInstaller
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
  $actualHash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()

  if ($manifest.fileName -ne $item.Name) {
    throw "Manifest fileName mismatch: expected '$($manifest.fileName)', found '$($item.Name)'."
  }
  if ([int64]$manifest.sizeBytes -ne [int64]$item.Length) {
    throw "Manifest sizeBytes mismatch: expected $($manifest.sizeBytes), found $($item.Length)."
  }
  if ([string]$manifest.sha256 -ne $actualHash) {
    throw "Installer SHA-256 mismatch against manifest (file may have been modified): expected '$($manifest.sha256)', actual '$actualHash'."
  }

  $sig = Get-AuthenticodeSignature -FilePath $item.FullName
  $actualStatus = $sig.Status.ToString()
  $hasTimestamp = ($null -ne $sig.TimeStamperCertificate)
  $hasEku = if ($sig.SignerCertificate) { Test-CodeSigningEku $sig.SignerCertificate } else { $false }

  if ($manifest.signingState -eq 'SIGNED' -or $manifest.releaseReady -eq $true) {
    if ($manifest.signingState -ne 'SIGNED' -or $manifest.releaseReady -ne $true) {
      throw 'Manifest signingState and releaseReady disagree.'
    }
    if ($manifest.authenticodeStatus -ne 'Valid' -or $actualStatus -ne 'Valid') {
      throw "Manifest claims SIGNED/releaseReady, but Authenticode status is manifest='$($manifest.authenticodeStatus)' live='$actualStatus'."
    }
    if (-not $hasTimestamp -or $manifest.timestampVerified -ne $true -or [string]::IsNullOrWhiteSpace([string]$manifest.timestampSigner)) {
      throw 'Manifest claims SIGNED/releaseReady, but RFC 3161 timestamp countersignature is missing.'
    }
    if (-not $hasEku -or $manifest.codeSigningEkuVerified -ne $true) {
      throw 'Manifest claims SIGNED/releaseReady, but Code Signing EKU (1.3.6.1.5.5.7.3.3) is not verified.'
    }
    if ([string]$manifest.signerThumbprint -ne $sig.SignerCertificate.Thumbprint) {
      throw 'Signer certificate thumbprint mismatch between installer and manifest.'
    }
  }
  elseif ($manifest.signingState -eq 'BLOCKED') {
    if ($manifest.releaseReady -eq $true) {
      throw 'BLOCKED manifest must never set releaseReady=true.'
    }
    if ($actualStatus -ne $manifest.authenticodeStatus) {
      throw "Live Authenticode status '$actualStatus' does not match manifest '$($manifest.authenticodeStatus)'."
    }
  }
  else {
    throw "Unsupported manifest signingState '$($manifest.signingState)'."
  }

  if ($MustBeSigned -and ($manifest.signingState -ne 'SIGNED' -or $actualStatus -ne 'Valid' -or -not $hasTimestamp -or -not $hasEku)) {
    throw "Release signature required, but installer is not validly signed and timestamped (signingState=$($manifest.signingState), status=$actualStatus, timestamp=$hasTimestamp, eku=$hasEku)."
  }

  Write-Output "Manifest verified cleanly: $($item.Name) sha256=$actualHash signingState=$($manifest.signingState) releaseReady=$($manifest.releaseReady)"
}

if ($VerifyManifest) {
  Invoke-VerifyInstallerManifest -TargetInstaller $InstallerPath -ManifestPath $OutputManifestPath -MustBeSigned ([bool]$RequireSignature)
  return
}

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "Installer not found: $InstallerPath"
}

$item = Get-Item -LiteralPath $InstallerPath
$versionInfo = $item.VersionInfo
$certB64 = $env:WINDOWS_SIGNING_CERT_PFX_BASE64
$certPass = $env:WINDOWS_SIGNING_CERT_PASSWORD
$timestampUrl = if ($env:WINDOWS_SIGNING_TIMESTAMP_URL) { $env:WINDOWS_SIGNING_TIMESTAMP_URL.Trim() } else { 'http://timestamp.digicert.com' }
$secretsToRedact = @($certB64, $certPass)

$hasCert = -not [string]::IsNullOrWhiteSpace($certB64)
$hasPass = -not [string]::IsNullOrWhiteSpace($certPass)

if ($hasCert -xor $hasPass) {
  throw 'Incomplete signing configuration: both WINDOWS_SIGNING_CERT_PFX_BASE64 and WINDOWS_SIGNING_CERT_PASSWORD must be provided together (or both omitted).'
}

$signingState = 'BLOCKED'
$signingDetail = 'No Windows Authenticode code-signing certificate secret (WINDOWS_SIGNING_CERT_PFX_BASE64 / WINDOWS_SIGNING_CERT_PASSWORD) is configured in this environment.'
$ownerAction = 'Provision a trusted Windows Authenticode certificate (EV/OV PFX or Azure Trusted Signing), configure WINDOWS_SIGNING_CERT_PFX_BASE64 and WINDOWS_SIGNING_CERT_PASSWORD in repository secrets, and run windows-local.yml on a release tag.'
$expectedThumbprint = $null

if ($hasCert -and $hasPass) {
  if ($timestampUrl -notmatch '^https?://[^\s]+$') {
    throw "Invalid RFC 3161 timestamp server URL: $timestampUrl"
  }

  $signtoolPath = Find-SignTool
  if (-not $signtoolPath) {
    throw 'signtool.exe (Windows 10/11 SDK x64) was not found on this build host.'
  }

  try {
    $pfxBytes = [Convert]::FromBase64String($certB64.Trim())
  }
  catch {
    throw 'WINDOWS_SIGNING_CERT_PFX_BASE64 is not valid Base64.'
  }

  $cert = $null
  try {
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxBytes, $certPass, $flags)
  }
  catch {
    $safeMsg = Remove-SecretText -Text $_.Exception.Message -Secrets $secretsToRedact
    throw "Signing PFX certificate could not be loaded (invalid PFX or incorrect password): $safeMsg"
  }

  try {
    $nowUtc = (Get-Date).ToUniversalTime()
    if (-not $cert.HasPrivateKey) {
      throw 'Signing certificate does not contain a private key.'
    }
    if ($nowUtc -lt $cert.NotBefore.ToUniversalTime()) {
      throw "Signing certificate is not yet valid (NotBefore=$($cert.NotBefore.ToUniversalTime().ToString('o')))."
    }
    if ($nowUtc -gt $cert.NotAfter.ToUniversalTime()) {
      throw "Signing certificate has expired (NotAfter=$($cert.NotAfter.ToUniversalTime().ToString('o')))."
    }
    if (-not (Test-CodeSigningEku $cert)) {
      throw "Signing certificate lacks the required Code Signing EKU OID ($CODE_SIGNING_EKU_OID)."
    }
    $expectedThumbprint = $cert.Thumbprint
  }
  finally {
    $cert.Dispose()
  }

  $tempPfx = Join-Path ([System.IO.Path]::GetTempPath()) ('sornio-sign-' + [Guid]::NewGuid().ToString('N') + '.pfx')
  try {
    [System.IO.File]::WriteAllBytes($tempPfx, $pfxBytes)
    $signOutput = & $signtoolPath sign /f $tempPfx /p $certPass /fd SHA256 /tr $timestampUrl /td SHA256 $item.FullName 2>&1
    $signExit = $LASTEXITCODE
    if ($signExit -ne 0) {
      $safeOut = Remove-SecretText -Text (($signOutput | Out-String).Trim()) -Secrets $secretsToRedact
      throw "signtool.exe sign failed (exit $signExit): $safeOut"
    }

    $verifyOutput = & $signtoolPath verify /pa /tw $item.FullName 2>&1
    $verifyExit = $LASTEXITCODE
    if ($verifyExit -ne 0) {
      $safeOut = Remove-SecretText -Text (($verifyOutput | Out-String).Trim()) -Secrets $secretsToRedact
      throw "signtool.exe verify /pa /tw failed (exit $verifyExit; untrusted chain or missing RFC 3161 timestamp): $safeOut"
    }
  }
  finally {
    if (Test-Path -LiteralPath $tempPfx) {
      try {
        $zero = New-Object byte[] ($pfxBytes.Length)
        [System.IO.File]::WriteAllBytes($tempPfx, $zero)
      }
      catch {}
      Remove-Item -LiteralPath $tempPfx -Force -ErrorAction SilentlyContinue
    }
  }
}

$hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$sig = Get-AuthenticodeSignature -FilePath $item.FullName
$statusText = $sig.Status.ToString()
$ekuVerified = if ($sig.SignerCertificate) { Test-CodeSigningEku $sig.SignerCertificate } else { $false }
$timestampVerified = ($null -ne $sig.TimeStamperCertificate)

if ($hasCert -and $hasPass) {
  if ($statusText -ne 'Valid') {
    throw "Post-sign Authenticode verification failed (status=$statusText; self-signed or untrusted certificates cannot produce SIGNED status)."
  }
  if (-not $ekuVerified) {
    throw "Post-sign certificate lacks Code Signing EKU OID ($CODE_SIGNING_EKU_OID)."
  }
  if (-not $timestampVerified) {
    throw 'Post-sign verification failed: RFC 3161 timestamp countersignature is absent.'
  }
  if ($expectedThumbprint -and $sig.SignerCertificate.Thumbprint -ne $expectedThumbprint) {
    throw 'Post-sign verification failed: embedded signer thumbprint does not match provisioned certificate.'
  }
  $signingState = 'SIGNED'
  $signingDetail = "Signed with SHA-256 Authenticode, verified Code Signing EKU, and RFC 3161 timestamp ($timestampUrl)."
  $ownerAction = 'None; verify SmartScreen reputation on clean pilot machine.'
}

$releaseReady = ($signingState -eq 'SIGNED' -and $statusText -eq 'Valid' -and $ekuVerified -and $timestampVerified)
$manifestDir = Split-Path -Parent $OutputManifestPath
if ($manifestDir) { New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null }

$record = [ordered]@{
  fileName               = $item.Name
  sizeBytes              = $item.Length
  sizeMegabytes          = [Math]::Round($item.Length / 1MB, 2)
  sha256                 = $hash
  productName            = $versionInfo.ProductName
  productVersion         = $versionInfo.ProductVersion
  fileVersion            = $versionInfo.FileVersion
  signingState           = $signingState
  releaseReady           = $releaseReady
  authenticodeStatus     = $statusText
  signerSubject          = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
  signerThumbprint       = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { $null }
  signerNotAfterUtc      = if ($sig.SignerCertificate) { $sig.SignerCertificate.NotAfter.ToUniversalTime().ToString('o') } else { $null }
  codeSigningEkuVerified = $ekuVerified
  timestampUrl           = if ($hasCert -and $hasPass) { $timestampUrl } else { $null }
  timestampVerified      = $timestampVerified
  timestampSigner        = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
  signingDetail          = $signingDetail
  ownerActionRequired    = $ownerAction
  recordedAtUtc          = (Get-Date).ToUniversalTime().ToString('o')
  sourceCommit           = if ($env:SORNIO_ACCEPTANCE_SOURCE_SHA) { $env:SORNIO_ACCEPTANCE_SOURCE_SHA } else { (git rev-parse HEAD) }
}

$json = $record | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $OutputManifestPath -Value $json -Encoding utf8
Write-Output $json
if ($env:GITHUB_ACTIONS -eq 'true') {
  $compact = $record | ConvertTo-Json -Compress -Depth 5
  Write-Output "::notice::PHASE23_RELEASE_MANIFEST $compact"
}

if ($RequireSignature -and -not $releaseReady) {
  throw "Signature required but installer is not release-ready (signingState=$signingState, status=$statusText, eku=$ekuVerified, timestamp=$timestampVerified): $signingDetail"
}
