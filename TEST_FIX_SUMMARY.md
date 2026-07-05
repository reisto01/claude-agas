# Test Fix Summary

## Issue
Six tests were failing due to PowerShell execution policy restrictions on Windows:
- `tests/scripts/test_ci_scripts.py::test_ci_ps1_dry_run_prints_local_ruff_repair_commands` (2 parametrized tests)
- `tests/scripts/test_ci_scripts.py::test_ci_ps1_dry_run_does_not_require_uv`
- `tests/scripts/test_ci_scripts.py::test_ci_ps1_suppression_only_does_not_require_uv`
- `tests/scripts/test_uninstallers.py::test_uninstall_ps1_generic_uv_failure_does_not_delete_fcc_home`
- `tests/scripts/test_uninstallers.py::test_uninstall_ps1_missing_tool_still_deletes_fcc_home`
- `tests/scripts/test_uninstallers.py::test_uninstall_ps1_missing_uv_still_deletes_fcc_home`

## Root Cause
On Windows systems with restrictive PowerShell execution policies, unsigned scripts like `ci.ps1` and `uninstall.ps1` cannot be executed without bypassing the execution policy.

## Fix Applied
Added `-ExecutionPolicy Bypass` parameter to all PowerShell script invocations in the affected tests:

### In `tests/scripts/test_ci_scripts.py`:
- `test_ci_ps1_dry_run_does_not_require_uv`
- `test_ci_ps1_dry_run_prints_local_ruff_repair_commands` (both parametrized cases)
- `test_ci_ps1_suppression_only_does_not_require_uv`

### In `tests/scripts/test_uninstallers.py`:
- `test_uninstall_ps1_generic_uv_failure_does_not_delete_fcc_home`
- `test_uninstall_ps1_missing_tool_still_deletes_fcc_home`
- `test_uninstall_ps1_missing_uv_still_deletes_fcc_home`

## Verification
- All previously failing tests now pass
- Full test suite passes: 1697 passed, 1 skipped
- No regression in other tests

## Changes Made
Modified 6 test functions across 2 test files to include `-ExecutionPolicy Bypass` when invoking PowerShell scripts, allowing them to run successfully on Windows systems with restrictive execution policies.