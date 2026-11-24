<#
.SYNOPSIS
  Genuine Windows cross-version in-place upgrade acceptance (0.3.0 -> 0.4.0),
  pre-migration backup verification, OS-vault data preservation audit,
  single-instance workspace lock verification, and downgrade-refusal check.
  Ephemeral GitHub-hosted Windows runner only; never run on a shop PC.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $OldInstallerPath,
  [Parameter(Mandatory = $true)]
  [string] $NewInstallerPath,
  [Parameter(Mandatory = $true)]
  [string] $AuditBridgePath,
  [Parameter(Mandatory = $true)]
  [string] $OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Cross-version upgrade acceptance requires an ephemeral GitHub-hosted Windows runner.'
}

$oldInstaller = (Resolve-Path -LiteralPath $OldInstallerPath).Path
$newInstaller = (Resolve-Path -LiteralPath $NewInstallerPath).Path
$auditBridge = (Resolve-Path -LiteralPath $AuditBridgePath).Path
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$oldVer = (Get-Item -LiteralPath $oldInstaller).VersionInfo.ProductVersion
$newVer = (Get-Item -LiteralPath $newInstaller).VersionInfo.ProductVersion
$oldSha = (Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$newSha = (Get-FileHash -LiteralPath $newInstaller -Algorithm SHA256).Hash.ToLowerInvariant()

if ($oldSha -eq $newSha) {
  throw 'Old and new installers are identical; refusing to claim a cross-version upgrade.'
}

$installDir = Join-Path $env:LOCALAPPDATA 'SornioUpgradeAcceptance'
$dataDir = Join-Path $env:LOCALAPPDATA 'com.sornio.localreview'
$oldBinCopy = Join-Path $env:TEMP ('sornio-old-0.3.0-' + [guid]::NewGuid().ToString('N') + '.exe')

# Clean any leftover state from a previous step on this ephemeral runner.
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
if (Test-Path -LiteralPath $dataDir) { Remove-Item -LiteralPath $dataDir -Recurse -Force }

. (Join-Path $PSScriptRoot 'lib/invoke-native-check.ps1')

function Invoke-SilentInstall([string] $setupExe, [string] $targetDir) {
  $proc = Start-Process -FilePath $setupExe -ArgumentList "/S /D=$targetDir" -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "Silent installer failed ($setupExe) with exit code $($proc.ExitCode)."
  }
  $exe = Join-Path $targetDir 'sornio-desktop.exe'
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Expected installed executable not found at $exe"
  }
  return $exe
}

function Invoke-SilentUninstall([string] $targetDir) {
  $uninstallers = @(Get-ChildItem -LiteralPath $targetDir -Filter '*uninstall*.exe' -File -ErrorAction SilentlyContinue)
  if ($uninstallers.Count -ne 1) {
    throw "Expected exactly one uninstaller in $targetDir, found $($uninstallers.Count)."
  }
  $proc = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "Silent uninstaller failed with exit code $($proc.ExitCode)."
  }
}

function Assert-CiphertextHeader([string] $filePath, [string] $label) {
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  if ($bytes.Length -lt 4096) {
    throw "$label is unexpectedly small ($($bytes.Length) bytes)."
  }
  $header = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 15)
  if ($header -eq 'SQLite format 3') {
    throw "$label starts with plaintext SQLite header instead of SQLCipher ciphertext."
  }
  return $bytes.Length
}

$prefix = 'Sornio-upgrade-review-' + [guid]::NewGuid().ToString()
$runtimes = @(Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe" -ErrorAction SilentlyContinue)
if ($runtimes.Count -eq 0) {
  throw 'Could not locate WebView2 runtime executable to enforce offline firewall policy.'
}

$evidence = [ordered]@{
  oldInstallerFile             = (Get-Item -LiteralPath $oldInstaller).Name
  oldInstallerVersion          = $oldVer
  oldInstallerSha256           = $oldSha
  newInstallerFile             = (Get-Item -LiteralPath $newInstaller).Name
  newInstallerVersion          = $newVer
  newInstallerSha256           = $newSha
  installedOldExeVersion       = $null
  installedNewExeVersion       = $null
  preUpgradeDbBytes            = $null
  preUpgradeDbSha256           = $null
  preMigrationBackupCount      = 0
  preMigrationBackupCiphertext = $false
  postUpgradeReopenPassed      = $false
  postUpgradeStoreAuditPassed  = $false
  workstationSettingsPersisted = $false
  singleInstanceLockVerified   = $false
  downgradeRefusalVerified     = $false
  result                       = 'FAIL'
  recordedAtUtc                = (Get-Date).ToUniversalTime().ToString('o')
}

try {
  # 1. Install genuine older version (0.3.0)
  Write-Stage 'upgrade-1: install baseline 0.3.0'
  $oldApp = Invoke-SilentInstall $oldInstaller $installDir
  $oldExeVer = (Get-Item -LiteralPath $oldApp).VersionInfo.FileVersion
  $evidence.installedOldExeVersion = $oldExeVer
  if ($oldExeVer -notlike '0.3.0*') {
    throw "Expected baseline 0.3.0 executable, found FileVersion=$oldExeVer"
  }
  Copy-Item -LiteralPath $oldApp -Destination $oldBinCopy -Force

  # Block outbound network for installed binary and WebView2
  $programs = @($oldApp) + @($runtimes | ForEach-Object { $_.FullName })
  for ($i = 0; $i -lt $programs.Count; $i++) {
    New-NetFirewallRule -Name "$prefix-$i" -DisplayName "$prefix-$i" -Direction Outbound -Program $programs[$i] -Action Block | Out-Null
  }

  # 2. Seed realistic data inside the installed 0.3.0 application offline
  Write-Stage 'upgrade-2: seed genuine 0.3.0 workspace offline'
  $env:SORNIO_REVIEW_EXE = $oldApp
  Invoke-NativeCheck 'seed 0.3.0 installed workspace' @()

  $dbPath = Join-Path $dataDir 'workspace.db'
  if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) {
    throw "Baseline 0.3.0 did not create workspace.db at $dbPath"
  }
  $evidence.preUpgradeDbBytes = Assert-CiphertextHeader $dbPath 'baseline 0.3.0 workspace.db'
  $evidence.preUpgradeDbSha256 = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash.ToLowerInvariant()

  # 3. Genuine IN-PLACE upgrade: run 0.4.0 installer directly over 0.3.0 (no uninstall!)
  Write-Stage 'upgrade-3: in-place upgrade 0.3.0 -> 0.4.0'
  $newApp = Invoke-SilentInstall $newInstaller $installDir
  $newExeVer = (Get-Item -LiteralPath $newApp).VersionInfo.FileVersion
  $evidence.installedNewExeVersion = $newExeVer
  if ($newExeVer -notlike '0.4.0*') {
    throw "Expected upgraded 0.4.0 executable, found FileVersion=$newExeVer"
  }

  # 4. Launch upgraded 0.4.0 offline with original credentials & verify all prior data survived
  Write-Stage 'upgrade-4: verify upgraded 0.4.0 preserves all data offline'
  $env:SORNIO_REVIEW_EXE = $newApp
  Invoke-NativeCheck 'upgraded 0.4.0 offline reopen with original credentials' @('--verify-preserved')
  $evidence.postUpgradeReopenPassed = $true

  # 5. Verify automatic pre-migration encrypted backup (v23 -> v24)
  Write-Stage 'upgrade-5: verify automatic pre-migration safety backup'
  $migDir = Join-Path $dataDir 'migration-backups'
  $migFiles = @(Get-ChildItem -LiteralPath $migDir -Filter 'pre-migration-v23-to-v24-*.db' -File -ErrorAction SilentlyContinue)
  $evidence.preMigrationBackupCount = $migFiles.Count
  if ($migFiles.Count -lt 1) {
    throw "Expected pre-migration-v23-to-v24-*.db in $migDir, found none."
  }
  $null = Assert-CiphertextHeader $migFiles[0].FullName 'pre-migration v23 safety backup'
  $evidence.preMigrationBackupCiphertext = $true

  # 6. Independently audit the upgraded encrypted workspace under the OS credential vault
  Write-Stage 'upgrade-6: independent OS-vault store & v24 workstation-settings audit'
  $auditOut = Join-Path $OutputDir 'upgrade-purchasing-audit.json'
  python apps/desktop/check-purchasing-store.py `
    --bridge $auditBridge `
    --device-dir $dataDir `
    --backup-receipt 'dist/native-review/purchasing-backup-receipt.json' `
    --output $auditOut
  if ($LASTEXITCODE -ne 0) {
    throw "Independent store audit failed after 0.3.0 -> 0.4.0 upgrade (exit $LASTEXITCODE)."
  }
  $evidence.postUpgradeStoreAuditPassed = $true

  # Verify new v24 workstation settings read/write through the native bridge under the real device key
  $prevDeviceDir = $env:SORNIO_REVIEW_DEVICE_DIR
  try {
    $env:SORNIO_REVIEW_DEVICE_DIR = $dataDir
    $wsCalls = @(
      '{"command":"unlock_workspace","args":{"username":"owner","password":"SornioReviewAccess2026"}}',
      '{"command":"read_workstation_settings","args":{}}',
      '{"command":"save_workstation_settings","args":{"r":{"expectedRevision":1,"receiptLayout":"58mm","receiptLanguage":"pa","printerName":"TVS RP-3200","barcodeSuffix":"enter_or_tab","cashDrawerMode":"escpos_pin2","backupDestinationNote":"Shop USB E:\\Backups"}}}',
      '{"command":"read_workstation_settings","args":{}}'
    ) -join "`n"
    $wsResp = $wsCalls | & $auditBridge 'unused-in-device-mode'
    if ($LASTEXITCODE -ne 0) { throw "Workstation settings bridge check failed: $LASTEXITCODE" }
    $lines = @($wsResp)
    if ($lines.Count -lt 4) { throw "Unexpected bridge response line count: $($lines.Count)" }
    $finalRead = $lines[3] | ConvertFrom-Json
    if (-not $finalRead.ok -or $finalRead.value.receiptLayout -ne '58mm' -or $finalRead.value.printerName -ne 'TVS RP-3200') {
      throw "Upgraded workstation settings did not persist: $($lines[3])"
    }
    $evidence.workstationSettingsPersisted = $true
  }
  finally {
    if ($null -eq $prevDeviceDir) { Remove-Item Env:SORNIO_REVIEW_DEVICE_DIR -ErrorAction SilentlyContinue }
    else { $env:SORNIO_REVIEW_DEVICE_DIR = $prevDeviceDir }
  }

  # 7. Single-instance workspace lock verification
  Write-Stage 'upgrade-7: single-instance workspace lock check'
  $firstProc = Start-Process -FilePath $newApp -PassThru
  try {
    $lockPath = Join-Path $dataDir 'workspace.lock'
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Path -LiteralPath $lockPath) -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 250
    }
    if (-not (Test-Path -LiteralPath $lockPath)) {
      throw "Running 0.4.0 desktop process did not create workspace.lock at $lockPath"
    }
    $lockedAsExpected = $false
    try {
      $fs = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $fs.Close()
    }
    catch [System.IO.IOException] {
      $lockedAsExpected = $true
    }
    if (-not $lockedAsExpected) {
      throw 'workspace.lock was not exclusively locked while 0.4.0 was running.'
    }
    $evidence.singleInstanceLockVerified = $true
  }
  finally {
    if (-not $firstProc.HasExited) {
      Stop-Process -Id $firstProc.Id -Force -ErrorAction SilentlyContinue
      $firstProc.WaitForExit(10000) | Out-Null
    }
  }

  # 8. Downgrade refusal check: launch old 0.3.0 executable against upgraded v24 workspace
  Write-Stage 'upgrade-8: downgrade refusal check (0.3.0 binary vs v24 database)'
  $beforeDowngradeSha = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $oldProc = Start-Process -FilePath $oldBinCopy -PassThru
  Start-Sleep -Seconds 5
  if (-not $oldProc.HasExited) {
    Stop-Process -Id $oldProc.Id -Force -ErrorAction SilentlyContinue
    $oldProc.WaitForExit(10000) | Out-Null
  }
  $afterDowngradeSha = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($beforeDowngradeSha -ne $afterDowngradeSha) {
    throw "Older 0.3.0 binary modified v24 workspace.db ($beforeDowngradeSha -> $afterDowngradeSha)."
  }
  $evidence.downgradeRefusalVerified = $true
  $evidence.result = 'PASS'

  # Clean uninstall after all upgrade assertions pass
  Invoke-SilentUninstall $installDir
}
catch {
  $msg = $_.Exception.Message -replace '%','%25' -replace "`r",'%0D' -replace "`n",'%0A'
  Write-Output "::error::PHASE23_UPGRADE_FAILED: $msg"
  throw
}
finally {
  $outPath = Join-Path $OutputDir 'upgrade-evidence.json'
  $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outPath -Encoding utf8
  $compact = $evidence | ConvertTo-Json -Compress -Depth 5
  Write-Output "::notice::PHASE23_UPGRADE_EVIDENCE $compact"
  Get-NetFirewallRule -Name "$prefix-*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Remove-Item Env:SORNIO_REVIEW_EXE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $oldBinCopy) { Remove-Item -LiteralPath $oldBinCopy -Force -ErrorAction SilentlyContinue }
}
