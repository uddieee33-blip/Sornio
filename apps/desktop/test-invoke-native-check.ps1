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

  # 3. A failing child process must fail the stage (throw), keep the stage name
  #    in the exception, and still emit the ::error:: annotation whose tail
  #    contains the child's own diagnostic output.
  $env:SORNIO_FAKE_EXIT = '1'
  $outFile = Join-Path $work 'stage-out.txt'
  $threw = $false
  $annotation = $null
  try {
    Invoke-NativeCheck -stage 'failing stage' -stageArgs @() *> $outFile
  } catch {
    $threw = $true
    $annotation = $_.Exception.Message
  }
  $stageText = Get-Content -Raw $outFile
  Assert-True $threw 'nonzero child exit fails the acceptance stage (throws)'
  Assert-True ($annotation -eq 'Native acceptance failed: failing stage') "throw message names the stage (got: '$annotation')"
  Assert-True ($stageText -match '::error::check-native failed at ''failing stage''') 'failure annotation is emitted and names the stage'
  Assert-True ($stageText -match 'fake-python diagnostic tail line') 'failure annotation tail retains the child diagnostic output'
  $env:SORNIO_FAKE_EXIT = '0'

  # 4. A successful child must not fail the stage and its stdout must be
  #    observable by the caller (no output-consuming assignment in the helper).
  $captured = Invoke-NativeCheck -stage 'capture stage' -stageArgs @() | Out-String -Width 4096
  Assert-True ($captured -match 'fake-python diagnostic tail line') 'successful child stdout is visible in the stage output stream'
  Assert-True ($captured -match 'capture stage') 'stage notice is visible in the stage output stream'

  # 5. Arguments with spaces survive forwarding, and --verify-preserved is
  #    forwarded exactly once (never duplicated, never dropped).
  Invoke-NativeCheck -stage 'spaces stage' -stageArgs @('arg with spaces', '--verify-preserved')
  $argv3 = (Get-Content -Raw $record).Trim()
  Write-Output "recorded argv (spaces): '$argv3'"
  Assert-True ($argv3 -match 'arg with spaces') "argument containing spaces survives forwarding (got: '$argv3')"
  Assert-True (([regex]::Matches($argv3, [regex]::Escape('--verify-preserved'))).Count -eq 1) "--verify-preserved is forwarded exactly once (got: '$argv3')"

  # 6. A prior failing invocation must not leak its exit status or output into
  #    the next independent invocation.
  $env:SORNIO_FAKE_EXIT = '1'
  try { Invoke-NativeCheck -stage 'stale first' -stageArgs @() *> $null } catch { }
  $env:SORNIO_FAKE_EXIT = '0'
  Invoke-NativeCheck -stage 'stale second' -stageArgs @('fresh-marker')
  $argv4 = (Get-Content -Raw $record).Trim()
  Assert-True ($argv4 -eq 'apps/desktop/check-native.py fresh-marker') "a prior failure leaks neither exit status nor argv into the next run (got: '$argv4')"

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
