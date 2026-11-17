$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gitignore = Join-Path $root '.gitignore'
if (Test-Path $gitignore) {
  $content = Get-Content $gitignore -Raw
  if ($content -match '(?m)^\s*\.kiro\s*/?\s*$') {
    Write-Error 'REPO HYGIENE FAIL: .kiro is listed in .gitignore. Remove it so steering, specs and hooks stay in version control.'
    exit 1
  }
}
if (-not (Test-Path (Join-Path $root 'LICENSE'))) {
  Write-Error 'REPO HYGIENE FAIL: root MIT LICENSE file is missing.'
  exit 1
}
Write-Host 'Repo hygiene OK: .kiro not in .gitignore, LICENSE present.'
