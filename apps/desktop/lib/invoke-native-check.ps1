# Fail-closed native acceptance stage runner, dot-sourced by check-installer.ps1
# and by test-invoke-native-check.ps1. Keeping it in its own file lets CI test
# the argument-forwarding contract without installing the product.
#
# The parameter is deliberately NOT named $args: a parameter named $args makes
# `@args` splatting ambiguous with the automatic variable, and CI evidence
# (stage 'reinstalled offline reopen with original credentials' on run
# 41324495119) showed the '--verify-preserved' flag silently never reaching
# python that way, so the preserved-data verification ran first-run setup.
function Write-Stage([string] $stage) {
  # Progress markers surface in the check record even when raw logs expire.
  Write-Output ("::notice::installer lifecycle stage: " + $stage)
}

function Invoke-NativeCheck([string] $stage, [string[]] $stageArgs) {
  Write-Stage $stage
  # Build the command explicitly and splat a plain array via the call operator.
  $cmd = @('apps/desktop/check-native.py') + $stageArgs
  # No output-consuming assignment: the child's merged stdout/stderr must stay
  # observable by the caller, while Tee-Object still captures it into
  # $nativeOut for the ::error:: annotation tail. $LASTEXITCODE is still set
  # by the native command, so a nonzero exit keeps failing the stage.
  & python @cmd 2>&1 | Tee-Object -Variable nativeOut
  if ($LASTEXITCODE -ne 0) {
    $tail = (($nativeOut | Select-Object -Last 40) -join "`n") -replace '%','%25' -replace "`r",'%0D' -replace "`n",'%0A'
    Write-Output ("::error::check-native failed at '$stage': $tail")
    throw "Native acceptance failed: $stage"
  }
}
