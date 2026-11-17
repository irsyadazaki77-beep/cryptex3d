$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$hits = Get-ChildItem (Join-Path $root 'src') -Recurse -Include *.tsx,*.ts,*.html |
  Select-String -Pattern 'style=\{\{', 'style="', "\.style\.[a-zA-Z]+\s*=" |
  Where-Object { $_.Line -notmatch '^\s*(//|\*)' }
$idx = Get-Content (Join-Path $root 'index.html') -Raw
if ($idx -match 'style="') { $hits += [pscustomobject]@{ Path = 'index.html'; LineNumber = 0; Line = 'inline style' } }
if ($hits) {
  $hits | ForEach-Object { Write-Host ("CSP GUARD: {0}:{1}  {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()) }
  Write-Error 'CSP GUARD FAIL: inline styles are blocked by the production CSP. Use classes in base.css / scene.css or Tailwind.'
  exit 1
}
Write-Host 'CSP guard OK: no inline styles found.'
