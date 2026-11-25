<#
.SYNOPSIS
  Safe, read-only Windows physical bench preflight collector for Sornio.
  Records Windows OS build, installer SHA-256 & Authenticode status, installed
  Windows printers (including WorkOffline / PrinterStatus / DetectedErrorState),
  attached USB HID keyboard/scanner devices, and mounted removable USB drives.
  Never modifies any Sornio workspace database or Windows Credential Manager entry.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string] $InstallerPath = '',
  [Parameter(Mandatory = $false)]
  [string] $ExpectedSha256 = '',
  [Parameter(Mandatory = $false)]
  [string] $OutputJsonPath = 'bench-preflight.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cs = Get-CimInstance -ClassName Win32_ComputerSystem

$installerReport = $null
if (-not [string]::IsNullOrWhiteSpace($InstallerPath)) {
  if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    throw "Installer file not found: $InstallerPath"
  }
  $item = Get-Item -LiteralPath $InstallerPath
  $actualHash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $sig = Get-AuthenticodeSignature -FilePath $item.FullName
  $shaMatches = if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $actualHash -eq $ExpectedSha256.Trim().ToLowerInvariant()
  } else {
    $null
  }
  $installerReport = [ordered]@{
    fileName           = $item.Name
    sizeBytes          = $item.Length
    sha256             = $actualHash
    expectedSha256     = if ($ExpectedSha256) { $ExpectedSha256.Trim().ToLowerInvariant() } else { $null }
    sha256Matches      = $shaMatches
    authenticodeStatus = $sig.Status.ToString()
    signerSubject      = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
    timestampVerified  = ($null -ne $sig.TimeStamperCertificate)
    timestampSigner    = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
  }
}

$printers = @(
  Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue |
    ForEach-Object {
      [ordered]@{
        name               = $_.Name
        driverName         = $_.DriverName
        portName           = $_.PortName
        isDefault          = [bool]$_.Default
        workOffline        = [bool]$_.WorkOffline
        printerStatus      = $_.PrinterStatus
        detectedErrorState = $_.DetectedErrorState
      }
    }
)

$hidDevices = @(
  Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue |
    Where-Object { $_.PNPClass -in @('Keyboard', 'HIDClass') -and $_.Status -eq 'OK' } |
    Select-Object -First 40 |
    ForEach-Object {
      [ordered]@{
        name     = $_.Name
        pnpClass = $_.PNPClass
        deviceId = $_.DeviceID
      }
    }
)

$removableDrives = @(
  Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2' -ErrorAction SilentlyContinue |
    ForEach-Object {
      [ordered]@{
        driveLetter = $_.DeviceID
        volumeName  = $_.VolumeName
        fileSystem  = $_.FileSystem
        freeGB      = [Math]::Round($_.FreeSpace / 1GB, 2)
        sizeGB      = [Math]::Round($_.Size / 1GB, 2)
      }
    }
)

$report = [ordered]@{
  recordedAtUtc   = (Get-Date).ToUniversalTime().ToString('o')
  windowsCaption  = $os.Caption
  windowsVersion  = $os.Version
  windowsBuild    = $os.BuildNumber
  totalRamGB      = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
  installer       = $installerReport
  printers        = $printers
  hidDevicesCount = $hidDevices.Count
  hidDevices      = $hidDevices
  removableDrives = $removableDrives
}

$json = $report | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $OutputJsonPath -Value $json -Encoding utf8
Write-Output "Preflight evidence saved to $OutputJsonPath"
Write-Output ("Windows: {0} (Build {1}), RAM: {2} GB" -f $report.windowsCaption, $report.windowsBuild, $report.totalRamGB)
Write-Output ("Printers detected: {0} | HID devices: {1} | Removable USB drives: {2}" -f $printers.Count, $hidDevices.Count, $removableDrives.Count)
if ($installerReport) {
  Write-Output ("Installer: {0} | SHA-256 Match: {1} | Authenticode: {2} | Timestamped: {3}" -f $installerReport.fileName, $installerReport.sha256Matches, $installerReport.authenticodeStatus, $installerReport.timestampVerified)
}
