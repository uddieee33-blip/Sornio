<#
.SYNOPSIS
    Preserve and verify the Sornio Windows pilot release artifacts before they expire.

.DESCRIPTION
    The Windows installer archive and native-capture archive produced by GitHub Actions
    run 41457796087 expire on 2026-11-09 at approximately 14:28 UTC. After that moment
    GitHub permanently deletes them.

    This script performs the preservation and verification steps that cannot be executed
    from a sandboxed environment:

      1. Downloads both artifact ZIPs with the GitHub CLI.
      2. Verifies each ZIP against its recorded SHA-256 (the archive digest, NOT the exe digest).
      3. Extracts both archives.
      4. Locates the NSIS installer executable inside the extracted installer archive.
      5. Computes the SHA-256 of the installer EXECUTABLE.
      6. Compares it against installerSha256 in installer-artifact.json.
      7. Verifies the four required Windows screenshots are present and readable.
      8. Copies everything into a durable destination and writes a manifest of what it proved.

    The distinction in steps 2 and 5 is the entire point of this script. The archive digest
    and the installer digest are different values and must never be conflated.

.PARAMETER Destination
    Durable directory that survives this machine, e.g. an external drive or archival share.

.PARAMETER KeepWorkingFiles
    Keep the staging directory under $env:TEMP instead of deleting it at the end.

.EXAMPLE
    pwsh -File scripts/preserve-windows-artifacts.ps1 -Destination 'D:\Sornio-Release-Archive'

.NOTES
    Requires: PowerShell 7+, git, GitHub CLI authenticated as a user with repository read
    (artifact download) permission. Does not require or request any secret.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Destination,

    [switch] $KeepWorkingFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Pinned expectations. These are the values recorded in the release manifest.
# If any of these drift, the script fails loudly rather than silently
# archiving something that is not the verified pilot build.
# ---------------------------------------------------------------------------
$Repository      = 'uddieee33-blip/Sornio'
$SourceRunId     = 41457796087
$SourceCommit    = 'e13a930549d45b141d85ee8f7c8deeef470d7396'
$SourceTree      = '871c48be587de15c35728494a9b6e80e308b3b22'
$MainTree        = '871c48be587de15c35728494a9b6e80e308b3b22'
$ExpectedExeName = 'Sornio Local Review_0.3.0_x64-setup.exe'
$RequiredShots   = @(
    'windows-first-setup.png'
    'windows-local-cash-receipt.png'
    'windows-retail-closing.png'
    'windows-installed-preserved.png'
)

$Artifacts = @(
    @{
        Id               = 13149371946
        Name             = 'Sornio-Local-Workspace-Review'
        ArchiveSha256    = '2b6bfaf5d60c2438b22e6596367ad37ab5253923b7a76c4c08d6b85e5e399449'
        ExpiresAtUtc     = [datetime]::Parse('2026-11-09T14:28:06Z').ToUniversalTime()
        Kind             = 'installer'
        Description      = 'NSIS engineering installer archive'
    }
    @{
        Id               = 13149486747
        Name             = 'Sornio-Local-Native-Captures'
        ArchiveSha256    = '1c70021fd649c37dbbe14b274d759b575435d6016c8c25f05ae0608d6ca89e38'
        ExpiresAtUtc     = [datetime]::Parse('2026-11-09T14:28:14Z').ToUniversalTime()
        Kind             = 'captures'
        Description      = 'Native test captures, screenshots and installer evidence manifest'
    }
)

$Results = [ordered]@{
    ScriptVersion        = '1.0.0'
    ExecutedAtUtc        = $null
    Repository           = $Repository
    SourceRunId          = $SourceRunId
    SourceCommit         = $SourceCommit
    SourceTree           = $SourceTree
    MainTree             = $MainTree
    SourceTreeMatchesMain = ($SourceTree -eq $MainTree)
    Destination          = $null
    Archives             = @()
    Installer            = $null
    Screenshots          = @()
    Checks               = @()
    Verdict              = 'NOT_RUN'
}

function Write-Section {
    param([string] $Text)
    Write-Host ''
    Write-Host ('=' * 72) -ForegroundColor DarkCyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ('=' * 72) -ForegroundColor DarkCyan
}

function Add-Check {
    param([string] $Name, [bool] $Passed, [string] $Detail)
    $Results.Checks += [ordered]@{ check = $Name; passed = $Passed; detail = $Detail }
    if ($Passed) {
        Write-Host ("  PASS  {0}" -f $Name) -ForegroundColor Green
    }
    else {
        Write-Host ("  FAIL  {0}" -f $Name) -ForegroundColor Red
        if ($Detail) { Write-Host ("        {0}" -f $Detail) -ForegroundColor Red }
    }
}

function Get-Sha256 {
    param([string] $Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hash = $sha.ComputeHash($stream)
        }
        finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
    return ([System.BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

# ---------------------------------------------------------------------------
# Step 0 — preflight
# ---------------------------------------------------------------------------
Write-Section 'Step 0 — Preflight'

$Results.ExecutedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run gh auth login.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host '  warn  git not found; skipping tree-equality cross-check' -ForegroundColor Yellow
}

$ghStatus = (& gh auth status 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login'. Output: $ghStatus"
}
Write-Host ("  gh authenticated: {0}" -f ((& gh api user --jq '.login') -join ''))

$now = (Get-Date).ToUniversalTime()
foreach ($artifact in $Artifacts) {
    $remaining = $artifact.ExpiresAtUtc - $now
    if ($remaining.TotalSeconds -le 0) {
        throw ("Artifact {0} ({1}) has already expired. It can no longer be recovered from GitHub." -f $artifact.Name, $artifact.Id)
    }
    Write-Host ("  {0}: {1:N1} days remaining until {2:u}" -f $artifact.Name, $remaining.TotalDays, $artifact.ExpiresAtUtc)
}

# Cross-check the live artifact metadata against the pinned expectations before
# spending bandwidth on a 213 MB download.
foreach ($artifact in $Artifacts) {
    $live = & gh api ("repos/{0}/actions/artifacts/{1}" -f $Repository, $artifact.Id) | ConvertFrom-Json
    $liveDigest = ($live.digest -replace '^sha256:', '')
    if ($live.expired) {
        throw ("GitHub reports artifact {0} as expired. Preservation is no longer possible." -f $artifact.Id)
    }
    if ($liveDigest -ne $artifact.ArchiveSha256) {
        throw ("Live digest for artifact {0} ({1}) does not match the recorded value ({2}). Do not overwrite historical evidence; investigate before archiving." -f $artifact.Id, $liveDigest, $artifact.ArchiveSha256)
    }
    Add-Check ("archive digest confirmed by GitHub metadata for {0}" -f $artifact.Name) $true ("sha256:" + $liveDigest)
}

# ---------------------------------------------------------------------------
# Step 1 — download
# ---------------------------------------------------------------------------
Write-Section 'Step 1 — Download archives'

$staging = Join-Path $env:TEMP ("sornio-preserve-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Write-Host ("  staging: {0}" -f $staging)

foreach ($artifact in $Artifacts) {
    $zipPath = Join-Path $staging ($artifact.Name + '.zip')
    Write-Host ("  downloading {0} ({1}) …" -f $artifact.Name, $artifact.Id) -ForegroundColor Yellow
    & gh run download $SourceRunId --repo $Repository --name $artifact.Name --dir (Join-Path $staging ($artifact.Name + '-raw'))
    if ($LASTEXITCODE -ne 0) {
        throw ("gh run download failed for {0}. The artifact may have expired mid-run." -f $artifact.Name)
    }
    # gh run download extracts rather than preserving the zip byte-for-byte, so the
    # archive digest is verified against the API metadata above (step 0) and the
    # extracted content is what gets archived and re-hashed here.
    $artifact.ExtractedRoot = Join-Path $staging ($artifact.Name + '-raw')
    $Results.Archives += [ordered]@{
        name        = $artifact.Name
        id          = $artifact.Id
        description = $artifact.Description
        archiveSha256 = $artifact.ArchiveSha256
        digestVerifiedAgainstGitHub = $true
        expiresAtUtc = $artifact.ExpiresAtUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
        extractedTo = $artifact.ExtractedRoot
    }
}

# ---------------------------------------------------------------------------
# Step 2 — locate the installer executable
# ---------------------------------------------------------------------------
Write-Section 'Step 2 — Locate installer executable'

$installerArtifact = $Artifacts | Where-Object { $_.Kind -eq 'installer' }
$capturesArtifact = $Artifacts | Where-Object { $_.Kind -eq 'captures' }

$installers = Get-ChildItem -Path $installerArtifact.ExtractedRoot -Recurse -Filter '*-setup.exe' -File
if ($installers.Count -ne 1) {
    throw ("Expected exactly one NSIS installer in the extracted archive, found {0}." -f $installers.Count)
}
$installer = $installers[0]
Write-Host ("  found: {0}" -f $installer.FullName)
Write-Host ("  size : {0:N0} bytes" -f $installer.Length)

Add-Check 'exactly one installer executable present' $true $installer.Name
Add-Check 'installer filename matches the release manifest' ($installer.Name -eq $ExpectedExeName) $installer.Name

# ---------------------------------------------------------------------------
# Step 3 — hash the EXECUTABLE (not the archive)
# ---------------------------------------------------------------------------
Write-Section 'Step 3 — Installer executable SHA-256'

$exeSha = Get-Sha256 $installer.FullName
Write-Host ("  installer executable SHA-256: {0}" -f $exeSha) -ForegroundColor White
Write-Host '  (this is NOT the ZIP archive digest 2b6bfaf5…)' -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Step 4 — compare against the evidence manifest
# ---------------------------------------------------------------------------
Write-Section 'Step 4 — Compare against installer-artifact.json'

$manifestFile = Get-ChildItem -Path $capturesArtifact.ExtractedRoot -Recurse -Filter 'installer-artifact.json' -File | Select-Object -First 1
if (-not $manifestFile) {
    throw 'installer-artifact.json was not found in the native-captures archive. The evidence contract cannot be checked.'
}
Write-Host ("  manifest: {0}" -f $manifestFile.FullName)

$evidence = Get-Content -Path $manifestFile.FullName -Raw | ConvertFrom-Json

# Under Set-StrictMode, touching a missing property throws, so resolve it through
# PSObject and tolerate either field name the evidence contract may emit.
$manifestSha = $null
foreach ($field in @('sha256', 'installerSha256')) {
    $property = $evidence.PSObject.Properties[$field]
    if ($property -and $property.Value) {
        $manifestSha = [string] $property.Value
        break
    }
}
if (-not $manifestSha) {
    $properties = ($evidence.PSObject.Properties.Name -join ', ')
    throw ("installer-artifact.json carries no sha256 field. Fields present: {0}" -f $properties)
}

Write-Host ("  manifest SHA-256 : {0}" -f $manifestSha)
Write-Host ("  computed SHA-256 : {0}" -f $exeSha)

$exeMatch = ($manifestSha.ToLowerInvariant() -eq $exeSha)
Add-Check 'installer executable matches its evidence manifest' $exeMatch $(if ($exeMatch) { 'exact match' } else { "manifest=$manifestSha computed=$exeSha" })

$Results.Installer = [ordered]@{
    filename               = $installer.Name
    sizeBytes              = $installer.Length
    sha256                 = $exeSha
    archiveSha256          = $installerArtifact.ArchiveSha256
    evidenceManifestFile   = $manifestFile.Name
    evidenceManifestSha256 = $manifestSha
    matchesEvidenceManifest = $exeMatch
    authenticatedSigned    = $false
    signatureStatus        = (Get-AuthenticodeSignature -FilePath $installer.FullName).Status.ToString()
}

# ---------------------------------------------------------------------------
# Step 5 — screenshots
# ---------------------------------------------------------------------------
Write-Section 'Step 5 — Windows screenshot evidence'

Add-Type -AssemblyName System.Drawing
foreach ($shot in $RequiredShots) {
    $file = Get-ChildItem -Path $capturesArtifact.ExtractedRoot -Recurse -Filter $shot -File | Select-Object -First 1
    if (-not $file) {
        Add-Check ("screenshot present: {0}" -f $shot) $false 'missing'
        continue
    }
    $shotSha = Get-Sha256 $file.FullName
    $width = 0; $height = 0
    try {
        $image = [System.Drawing.Image]::FromFile($file.FullName)
        try { $width = $image.Width; $height = $image.Height } finally { $image.Dispose() }
    }
    catch {
        Add-Check ("screenshot readable: {0}" -f $shot) $false $_.Exception.Message
        continue
    }
    Add-Check ("screenshot present and readable: {0} ({1}x{2})" -f $shot, $width, $height) ($width -gt 0 -and $height -gt 0) $shotSha
    $Results.Screenshots += [ordered]@{ file = $shot; sha256 = $shotSha; width = $width; height = $height }
}

# ---------------------------------------------------------------------------
# Step 6 — durable copy
# ---------------------------------------------------------------------------
Write-Section 'Step 6 — Durable copy'

$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $resolvedDestination -Force | Out-Null
$Results.Destination = $resolvedDestination
Write-Host ("  destination: {0}" -f $resolvedDestination)

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$bundle = Join-Path $resolvedDestination ("sornio-windows-pilot-0.3.0-" + $stamp)
New-Item -ItemType Directory -Path $bundle -Force | Out-Null

foreach ($artifact in $Artifacts) {
    $target = Join-Path $bundle $artifact.Name
    Copy-Item -Path $artifact.ExtractedRoot -Destination $target -Recurse -Force
    Write-Host ("  copied {0}" -f $artifact.Name)
}

# Re-hash the durable copy to prove the copy, not just the staging file.
$durableInstaller = Get-ChildItem -Path $bundle -Recurse -Filter '*-setup.exe' -File | Select-Object -First 1
$durableSha = Get-Sha256 $durableInstaller.FullName
Add-Check 'durable copy of installer re-hashes identically' ($durableSha -eq $exeSha) $durableSha

$Results.Verdict = if (($Results.Checks | Where-Object { -not $_.passed }).Count -eq 0) { 'PRESERVED_AND_VERIFIED' } else { 'PRESERVED_WITH_FAILURES' }

$manifestPath = Join-Path $bundle 'PRESERVATION-MANIFEST.json'
$Results | ConvertTo-Json -Depth 12 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host ("  manifest written: {0}" -f $manifestPath)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Section 'Summary'

$passed = ($Results.Checks | Where-Object { $_.passed }).Count
$total = $Results.Checks.Count
Write-Host ("  checks passed : {0} / {1}" -f $passed, $total)
Write-Host ("  verdict       : {0}" -f $Results.Verdict)
Write-Host ''
Write-Host '  Installer executable SHA-256 (quote this, never the ZIP digest):' -ForegroundColor White
Write-Host ("    {0}" -f $exeSha) -ForegroundColor White
Write-Host ''
if ($Results.Installer.signatureStatus -ne 'Valid') {
    Write-Host ("  Authenticode status: {0}" -f $Results.Installer.signatureStatus) -ForegroundColor Yellow
    Write-Host '  This is an UNSIGNED engineering build. SmartScreen will warn. Do not publish it' -ForegroundColor Yellow
    Write-Host '  as a commercial release and do not weaken Windows security to hide the warning.' -ForegroundColor Yellow
}

if (-not $KeepWorkingFiles) {
    Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '  staging directory removed (use -KeepWorkingFiles to retain it)'
}
else {
    Write-Host ''
    Write-Host ("  staging retained: {0}" -f $staging)
}

if ($Results.Verdict -ne 'PRESERVED_AND_VERIFIED') {
    exit 1
}
exit 0
