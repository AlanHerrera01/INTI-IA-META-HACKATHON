param([switch]$SkipBuild, [string]$BuildCaPem = "")
$ErrorActionPreference = 'Stop'
$computerRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $computerRoot
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with Linux containers first.' }
$environmentPath = Join-Path $computerRoot '.env'
if (-not (Test-Path -LiteralPath $environmentPath)) { Copy-Item -LiteralPath '.env.example' -Destination $environmentPath }
$settingsText = [IO.File]::ReadAllText($environmentPath)
$tokenMatch = [regex]::Match($settingsText, '(?m)^EXECUTION_OPERATOR_TOKEN=(.*)$')
if (-not $tokenMatch.Success -or $tokenMatch.Groups[1].Value.Trim().Length -lt 24) {
  $randomBytes = New-Object byte[] 32
  $randomSource = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $randomSource.GetBytes($randomBytes) } finally { $randomSource.Dispose() }
  $setting = 'EXECUTION_OPERATOR_TOKEN=' + [Convert]::ToBase64String($randomBytes)
  if ($tokenMatch.Success) { $settingsText = [regex]::Replace($settingsText, '(?m)^EXECUTION_OPERATOR_TOKEN=.*$', $setting) }
  else { $settingsText += "`n$setting`n" }
  [IO.File]::WriteAllText($environmentPath, $settingsText, (New-Object Text.UTF8Encoding $false))
}
$composeArguments = @('-f', 'docker-compose.yml')
if ($BuildCaPem) {
  $trustedCa = (Resolve-Path -LiteralPath $BuildCaPem).Path.Replace('\', '/')
  $temporaryDirectory = Join-Path $computerRoot '.tmp'
  [IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
  $overridePath = Join-Path $temporaryDirectory 'computer-build-ca.yml'
  $quotedCa = ConvertTo-Json $trustedCa -Compress
  $override = @"
services:
  backend:
    build:
      secrets: [build_ca]
  frontend:
    build:
      secrets: [build_ca]
secrets:
  build_ca:
    file: $quotedCa
"@
  [IO.File]::WriteAllText($overridePath, $override, (New-Object Text.UTF8Encoding $false))
  $composeArguments += @('-f', $overridePath)
}
if (-not $SkipBuild) {
  docker compose @composeArguments build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed. Check the build log and trusted certificate configuration.' }
}
docker compose @composeArguments up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Services did not become healthy. Inspect docker compose ps and logs.' }
Write-Output 'Ready: http://localhost:5173. Connect privately using EXECUTION_OPERATOR_TOKEN from .env.'
Write-Output 'Pair the Windows agent in Computers & Permissions. Model calls remain disabled.'
