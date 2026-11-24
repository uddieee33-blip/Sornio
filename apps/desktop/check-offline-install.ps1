<#
.SYNOPSIS
  Audits and tests offline Windows installation of the 0.4.0 NSIS installer
  with outbound network blocked via Windows Firewall. Attempts clean WebView2
  removal on the disposable runner to test runtime-absent offline installation;
  if the runner OS prevents removing WebView2, records an honest BLOCKED status
  with exact diagnostics rather than fabricating clean-install success.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $InstallerPath,
  [Parameter(Mandatory = $true)]
  [string] $OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Offline installation audit requires an ephemeral GitHub-hosted Windows runner.'
}

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Get-WebView2Version {
  $keys = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  )
  foreach ($key in $keys) {
    if (Test-Path -LiteralPath $key) {
      $pv = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).pv
      if ($pv -and $pv -ne '0.0.0.0') { return $pv }
    }
  }
  return $null
}

$item = Get-Item -LiteralPath $installer
$sig = Get-AuthenticodeSignature -FilePath $installer
$webviewBefore = Get-WebView2Version

$evidence = [ordered]@{
  installerFile                 = $item.Name
  installerBytes                = $item.Length
  installerMegabytes            = [Math]::Round($item.Length / 1MB, 2)
  installerSha256               = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  authenticodeStatus            = $sig.Status.ToString()
  webview2PreinstalledVersion   = $webviewBefore
  webview2RemovalAttempted      = $false
  webview2RemovalExitCode       = $null
  webview2VersionAfterRemoval   = $webviewBefore
  cleanNoWebView2InstallStatus  = 'NOT RUN'
  firewallBlockedInstallStatus  = 'FAIL'
  offlineInstallDurationSeconds = $null
  offlineFirstLaunchPassed      = $false
  uninstallDataPreserved        = $false
  recordedAtUtc                 = (Get-Date).ToUniversalTime().ToString('o')
}

$installDir = Join-Path $env:LOCALAPPDATA 'SornioOfflineInstallAudit'
$dataDir = Join-Path $env:LOCALAPPDATA 'com.sornio.localreview'
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
if (Test-Path -LiteralPath $dataDir) { Remove-Item -LiteralPath $dataDir -Recurse -Force }

$prefix = 'Sornio-offline-install-' + [guid]::NewGuid().ToString()

try {
  # Attempt genuine WebView2 removal so we test truly runtime-absent offline install when the runner OS permits it.
  if ($webviewBefore) {
    $evidence.webview2RemovalAttempted = $true
    $setupExe = Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\Installer\setup.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($setupExe) {
      $uninstallWv = Start-Process -FilePath $setupExe.FullName `
        -ArgumentList '--uninstall --msedgewebview --system-level --verbose-logging --force-uninstall' `
        -Wait -PassThru
      $evidence.webview2RemovalExitCode = $uninstallWv.ExitCode
    }
    Start-Sleep -Seconds 2
    $afterRemoval = Get-WebView2Version
    $evidence.webview2VersionAfterRemoval = $afterRemoval
  }

  # Block outbound traffic for the NSIS installer before running installation
  New-NetFirewallRule -Name "$prefix-installer" -DisplayName "$prefix-installer" -Direction Outbound -Program $installer -Action Block | Out-Null

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $installProc = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDir" -Wait -PassThru
  $sw.Stop()
  $evidence.offlineInstallDurationSeconds = [Math]::Round($sw.Elapsed.TotalSeconds, 2)
  if ($installProc.ExitCode -ne 0) {
    throw "Offline NSIS installation failed with exit code $($installProc.ExitCode)."
  }

  $app = Join-Path $installDir 'sornio-desktop.exe'
  if (-not (Test-Path -LiteralPath $app -PathType Leaf)) {
    throw "Installed executable missing after offline install: $app"
  }
  $evidence.firewallBlockedInstallStatus = 'PASS'

  $webviewAfterInstall = Get-WebView2Version
  if ($null -eq $evidence.webview2VersionAfterRemoval) {
    if ($webviewAfterInstall) {
      $evidence.cleanNoWebView2InstallStatus = 'PASS'
    } else {
      $evidence.cleanNoWebView2InstallStatus = 'FAIL'
      throw 'Clean runtime-absent offline install finished but WebView2 runtime was not installed.'
    }
  } else {
    $evidence.cleanNoWebView2InstallStatus = "BLOCKED: runner OS retained WebView2 $($evidence.webview2VersionAfterRemoval) (uninstall exit $($evidence.webview2RemovalExitCode))"
  }

  # Block outbound traffic for installed app & WebView2 and confirm network-independent startup
  New-NetFirewallRule -Name "$prefix-app" -DisplayName "$prefix-app" -Direction Outbound -Program $app -Action Block | Out-Null
  $runtimes = @(Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe" -ErrorAction SilentlyContinue)
  for ($i = 0; $i -lt $runtimes.Count; $i++) {
    New-NetFirewallRule -Name "$prefix-wv-$i" -DisplayName "$prefix-wv-$i" -Direction Outbound -Program $runtimes[$i].FullName -Action Block | Out-Null
  }

  $launch = Start-Process -FilePath $app -PassThru
  $deadline = (Get-Date).AddSeconds(25)
  $dbPath = Join-Path $dataDir 'workspace.db'
  while (-not (Test-Path -LiteralPath $dbPath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
  }
  if (-not (Test-Path -LiteralPath $dbPath)) {
    throw "Installed app did not initialize local workspace offline at $dbPath"
  }
  $evidence.offlineFirstLaunchPassed = $true
  if (-not $launch.HasExited) {
    Stop-Process -Id $launch.Id -Force -ErrorAction SilentlyContinue
    $launch.WaitForExit(10000) | Out-Null
  }

  # Uninstall and verify local workspace data is preserved byte-for-byte
  $beforeUninstallSha = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $uninstaller = @(Get-ChildItem -LiteralPath $installDir -Filter '*uninstall*.exe' -File)[0]
  $unProc = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($unProc.ExitCode -ne 0) {
    throw "Silent uninstaller exited with code $($unProc.ExitCode)."
  }
  if (Test-Path -LiteralPath $app) {
    throw 'Uninstaller left sornio-desktop.exe behind.'
  }
  $afterUninstallSha = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($beforeUninstallSha -ne $afterUninstallSha) {
    throw "Uninstallation altered workspace.db ($beforeUninstallSha -> $afterUninstallSha)."
  }
  $evidence.uninstallDataPreserved = $true
}
catch {
  $msg = $_.Exception.Message -replace '%','%25' -replace "`r",'%0D' -replace "`n",'%0A'
  Write-Output "::error::PHASE23_OFFLINE_INSTALL_FAILED: $msg"
  throw
}
finally {
  $outPath = Join-Path $OutputDir 'offline-install-evidence.json'
  $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outPath -Encoding utf8
  $compact = $evidence | ConvertTo-Json -Compress -Depth 5
  Write-Output "::notice::PHASE23_OFFLINE_INSTALL_EVIDENCE $compact"
  Get-NetFirewallRule -Name "$prefix-*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
