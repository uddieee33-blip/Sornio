# Ephemeral hosted-runner acceptance only. Never run against a shop profile.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Installer lifecycle acceptance requires an ephemeral GitHub-hosted Windows runner.'
}
$installDir = Join-Path $env:LOCALAPPDATA 'SornioPilotAcceptance'
$dataDir = Join-Path $env:LOCALAPPDATA 'com.sornio.localreview'
if ((Test-Path $installDir) -or (Test-Path $dataDir)) {
  throw 'Fresh-runner precondition failed. Existing installation/data will not be removed.'
}
$installers = @(Get-ChildItem 'apps/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe')
if ($installers.Count -ne 1) { throw 'Expected exactly one built installer.' }
$installer = $installers[0].FullName
$evidence = Join-Path (Get-Location) 'dist/native-review'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$signature = Get-AuthenticodeSignature -LiteralPath $installer
@{
  artifactSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
  signatureStatus = $signature.Status.ToString()
  lifecycle = 'same-version-reinstall-not-upgrade'
  execution = 'started-not-passed'
} | ConvertTo-Json | Set-Content (Join-Path $evidence 'installer-artifact.json')

function Install-Review {
  # NSIS /D must be last. It consumes the remaining directory text.
  $process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw 'Silent installer returned failure.' }
  $main = Join-Path $installDir 'sornio-desktop.exe'
  if (-not (Test-Path $main)) { throw 'Installed executable was not found at the expected path.' }
  return $main
}
function Uninstall-Review {
  $uninstallers = @(Get-ChildItem -LiteralPath $installDir -Filter '*uninstall*.exe' -File)
  if ($uninstallers.Count -ne 1) { throw 'Expected exactly one installed uninstaller.' }
  $process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw 'Silent uninstaller returned failure.' }
  if (Test-Path (Join-Path $installDir 'sornio-desktop.exe')) { throw 'Uninstaller retained the application executable.' }
}
function Check-Exit([string] $stage) {
  if ($LASTEXITCODE -ne 0) { throw "Native acceptance failed: $stage" }
}
# Dot-source the stage runner (Write-Stage + Invoke-NativeCheck) so the
# argument-forwarding regression test
# (test-invoke-native-check.ps1) exercises the exact production function.
. (Join-Path $PSScriptRoot 'lib/invoke-native-check.ps1')

Write-Stage 'install'
$app = Install-Review
$env:SORNIO_REVIEW_EXE = $app
$prefix = 'Sornio-installer-review-' + [guid]::NewGuid().ToString()
$runtimes = @(Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe" -ErrorAction SilentlyContinue)
if ($runtimes.Count -eq 0) { throw 'Could not locate WebView2 to enforce offline operation.' }
$programs = @($app) + @($runtimes | ForEach-Object { $_.FullName })
try {
  for ($index = 0; $index -lt $programs.Count; $index++) {
    New-NetFirewallRule -Name "$prefix-$index" -DisplayName "$prefix-$index" -Direction Outbound -Program $programs[$index] -Action Block | Out-Null
  }
  Invoke-NativeCheck 'installed offline fixture' @()
  $manifest = Join-Path $evidence 'installer-data-sha256.json'
  Write-Stage 'snapshot stopped application data'
  python apps/desktop/check-install-data.py snapshot $dataDir $manifest
  Check-Exit 'snapshot stopped application data'
  Write-Stage 'uninstall and data preservation'
  Uninstall-Review
  python apps/desktop/check-install-data.py verify $dataDir $manifest
  Check-Exit 'uninstallation data preservation'
  Write-Stage 'same-version reinstall'
  $null = Install-Review
  python apps/desktop/check-install-data.py verify $dataDir $manifest
  Check-Exit 'same-version reinstall data preservation'
  Invoke-NativeCheck 'reinstalled offline reopen with original credentials' @('--verify-preserved')
  # Reopening legitimately changes SQLite files; preserve the new stopped state.
  python apps/desktop/check-install-data.py snapshot $dataDir $manifest
  Check-Exit 'post-reopen snapshot'
  Write-Stage 'final uninstall'
  Uninstall-Review
  python apps/desktop/check-install-data.py verify $dataDir $manifest
  Check-Exit 'final uninstallation data preservation'
  @{
    installedOfflineFixture = 'passed'
    stoppedDataPreservedAcrossUninstall = 'passed'
    sameVersionReinstallAndVaultReopen = 'passed'
    finalUninstallPreservesData = 'passed'
    actualVersionUpgrade = 'untested'
    runtimeAbsentOfflineInstall = 'untested'
    physicalPrinterScannerPowerLoss = 'untested'
  } | ConvertTo-Json | Set-Content (Join-Path $evidence 'installer-lifecycle-result.json')
  # Mark this review completed only after all native, uninstall and reinstall checks finish.
  # Any earlier exception leaves installer-artifact.json at started-not-passed.
  $artifactPath = Join-Path $evidence 'installer-artifact.json'
  $artifactRecord = Get-Content -LiteralPath $artifactPath -Raw | ConvertFrom-Json
  $artifactRecord.execution = 'passed'
  $artifactRecord | ConvertTo-Json | Set-Content -LiteralPath $artifactPath
} catch {
  $msg = $_.Exception.Message -replace '%','%25' -replace "`r",'%0D' -replace "`n",'%0A'
  Write-Output ("::error::installer lifecycle failed: $msg")
  throw
} finally {
  Get-NetFirewallRule -Name "$prefix-*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Remove-Item Env:SORNIO_REVIEW_EXE -ErrorAction SilentlyContinue
}
