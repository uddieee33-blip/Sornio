<#
.SYNOPSIS
  Signs a Windows NSIS installer with an Authenticode certificate when signing
  credentials are provisioned, or records an honest BLOCKED status when no
  certificate secret is configured. Never generates misleading self-signed
  certificates and never claims an unsigned binary is signed.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $InstallerPath,
  [Parameter(Mandatory = $true)]
  [string] $OutputManifestPath,
  [switch] $RequireSignature
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "Installer not found: $InstallerPath"
}

$item = Get-Item -LiteralPath $InstallerPath
$versionInfo = $item.VersionInfo
$certB64 = $env:WINDOWS_SIGNING_CERT_PFX_BASE64
$certPass = $env:WINDOWS_SIGNING_CERT_PASSWORD
$timestampUrl = if ($env:WINDOWS_SIGNING_TIMESTAMP_URL) { $env:WINDOWS_SIGNING_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }

$signingState = 'BLOCKED'
$signingDetail = 'No Windows Authenticode code-signing certificate secret (WINDOWS_SIGNING_CERT_PFX_BASE64 / WINDOWS_SIGNING_CERT_PASSWORD) is configured in this environment.'
$ownerAction = 'Provision a trusted Windows Authenticode certificate (EV/OV PFX or Azure Trusted Signing), configure WINDOWS_SIGNING_CERT_PFX_BASE64 and WINDOWS_SIGNING_CERT_PASSWORD in repository secrets, and run windows-local.yml on a release tag.'

if ($certB64 -and $certPass) {
  $signtool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if (-not $signtool) {
    throw 'signtool.exe (Windows 10/11 SDK x64) was not found on this build host.'
  }
  $tempPfx = Join-Path ([System.IO.Path]::GetTempPath()) ("sornio-sign-" + [Guid]::NewGuid().ToString('N') + ".pfx")
  try {
    [System.IO.File]::WriteAllBytes($tempPfx, [Convert]::FromBase64String($certB64))
    & $signtool.FullName sign /f $tempPfx /p $certPass /fd SHA256 /tr $timestampUrl /td SHA256 $item.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "signtool.exe exited with status $LASTEXITCODE"
    }
    $signingState = 'SIGNED'
    $signingDetail = "Signed with SHA-256 Authenticode and RFC 3161 timestamp ($timestampUrl)."
    $ownerAction = 'None; verify SmartScreen reputation on clean pilot machine.'
  }
  finally {
    if (Test-Path -LiteralPath $tempPfx) {
      Remove-Item -LiteralPath $tempPfx -Force -ErrorAction SilentlyContinue
    }
  }
}

$hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$sig = Get-AuthenticodeSignature -FilePath $item.FullName
$manifestDir = Split-Path -Parent $OutputManifestPath
if ($manifestDir) { New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null }

$record = [ordered]@{
  fileName            = $item.Name
  sizeBytes           = $item.Length
  sizeMegabytes       = [Math]::Round($item.Length / 1MB, 2)
  sha256              = $hash
  productName         = $versionInfo.ProductName
  productVersion      = $versionInfo.ProductVersion
  fileVersion         = $versionInfo.FileVersion
  signingState        = $signingState
  authenticodeStatus  = $sig.Status.ToString()
  signerSubject       = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
  timestampSigner     = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
  signingDetail       = $signingDetail
  ownerActionRequired = $ownerAction
  recordedAtUtc       = (Get-Date).ToUniversalTime().ToString('o')
  sourceCommit        = if ($env:SORNIO_ACCEPTANCE_SOURCE_SHA) { $env:SORNIO_ACCEPTANCE_SOURCE_SHA } else { (git rev-parse HEAD) }
}

$json = $record | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $OutputManifestPath -Value $json -Encoding utf8
Write-Output $json
if ($env:GITHUB_ACTIONS -eq 'true') {
  $compact = $record | ConvertTo-Json -Compress -Depth 5
  Write-Output "::notice::PHASE23_RELEASE_MANIFEST $compact"
}

if ($RequireSignature -and $sig.Status -ne 'Valid') {
  throw "Signature required but Authenticode status is $($sig.Status): $signingDetail"
}
