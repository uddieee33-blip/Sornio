# Deterministic regression test for the Invoke-NativeCheck argument-forwarding
# contract. Runs in CI before the real installer acceptance and needs no
# product install, credentials or shop data: a fake `python` on PATH records
# its argv and exits with a scripted code.
#
#   pwsh -File apps/desktop/test-invoke-native-check.ps1
#
# It fails closed if the preserved-data stage would ever run check-native.py
# without '--verify-preserved' (which is exactly what made the reinstall
# verification execute first-run setup on run 41324495119).
$ErrorActionPreference = 'Stop'
$script:failures = 0
function Assert-True([bool] $condition, [string] $label) {
  if ($condition) {
    Write-Output "ok   $label"
  } else {
    # ::error:: so the failure is visible in the check record even when raw
    # logs expire; the plain line keeps it readable in the step output.
    Write-Output "FAIL $label"
    Write-Output "::error::invoke-native-check FAILED: $label"
    $script:failures += 1
  }
}

try {
  $work = Join-Path ([System.IO.Path]::GetTempPath()) ("sornio-invoke-test-" + [guid]::NewGuid().ToString('N'))
  $fakeBin = Join-Path $work 'bin'
  $null = New-Item -ItemType Directory -Path $fakeBin -Force
  $record = Join-Path $work 'argv.txt'
  # Fake python: record every argument on one line, print a diagnostic, exit
  # with the scripted code so failure propagation can be exercised.
  $cmd = Join-Path $fakeBin 'python.cmd'
  @"
@echo off
echo %* > "$record"
echo fake-python diagnostic tail line
if "%SORNIO_FAKE_EXIT%"=="" (exit /b 0) else (exit /b %SORNIO_FAKE_EXIT%)
"@ | Set-Content -Path $cmd -Encoding ASCII
  $env:PATH = "$fakeBin;$env:PATH"
  $env:SORNIO_FAKE_EXIT = '0'

  . (Join-Path $PSScriptRoot 'lib/invoke-native-check.ps1')

  # 1. The installed-offline-fixture stage must pass zero extra arguments.
  Invoke-NativeCheck -stage 'installed offline fixture' -stageArgs @()
  $argv1 = (Get-Content -Raw $record).Trim()
  Write-Output "recorded argv (fixture): '$argv1'"
  Assert-True ($argv1 -eq 'apps/desktop/check-native.py') "fixture stage forwards zero extra arguments (got: '$argv1')"

  # 2. The preserved-reopen stage must pass exactly '--verify-preserved'.
  Invoke-NativeCheck -stage 'reinstalled offline reopen with original credentials' -stageArgs @('--verify-preserved')
  $argv2 = (Get-Content -Raw $record).Trim()
  Write-Output "recorded argv (preserved): '$argv2'"
  Assert-True ($argv2 -eq 'apps/desktop/check-native.py --verify-preserved') "preserved stage forwards exactly --verify-preserved (got: '$argv2')"
  Assert-True ($argv2 -notmatch 'setup') "no setup-like argument is injected (got: '$argv2')"

  # 3. A failing child process must fail the stage (throw) and still emit the
  #    ::error:: annotation with captured output for the check record.
  $env:SORNIO_FAKE_EXIT = '1'
  $threw = $false
  $annotation = $null
  try {
    Invoke-NativeCheck -stage 'failing stage' -stageArgs @()
  } catch {
    $threw = $true
    $annotation = $_.Exception.Message
  }
  Assert-True $threw 'nonzero child exit fails the acceptance stage (throws)'
  Assert-True ($annotation -eq 'Native acceptance failed: failing stage') "throw message names the stage (got: '$annotation')"
  $env:SORNIO_FAKE_EXIT = '0'

  # 4. Output capture: the child's stdout must be surfaced through the stage.
  $captured = Invoke-NativeCheck -stage 'capture stage' -stageArgs @() | Out-String -Width 4096
  Assert-True ($captured -match 'fake-python diagnostic tail line') 'child stdout is captured and visible in stage output'

  Remove-Item -Recurse -Force $work
} catch {
  Write-Output "::error::invoke-native-check test crashed: $($_.Exception.Message)"
  exit 1
}
if ($script:failures -gt 0) {
  Write-Output "$script:failures Invoke-NativeCheck forwarding check(s) FAILED"
  exit 1
}
Write-Output 'all Invoke-NativeCheck argument-forwarding checks passed'
exit 0
