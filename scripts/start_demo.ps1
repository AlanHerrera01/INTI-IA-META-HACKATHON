param([switch]$EnableModelCalls,[string]$BuildCaPem="",[switch]$SkipBuild)
$ErrorActionPreference="Stop"
$releaseRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $releaseRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {throw 'Docker Desktop is required.'}
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {throw 'Start Docker Desktop with Linux containers first.'}
$environmentPath=Join-Path $releaseRoot '.env'
if (-not (Test-Path -LiteralPath $environmentPath)) {Copy-Item -LiteralPath '.env.example' -Destination $environmentPath}
$releaseSettings=[IO.File]::ReadAllText($environmentPath)
function Set-ReleaseSetting([string]$name,[string]$value) {
  $pattern='(?m)^'+[regex]::Escape($name)+'=.*$'
  if ([regex]::IsMatch($script:releaseSettings,$pattern)) {$script:releaseSettings=[regex]::Replace($script:releaseSettings,$pattern,$name+'='+$value)}
  else {$script:releaseSettings+="`n$name=$value`n"}
}
function Read-ReleaseSetting([string]$name) {
  $match=[regex]::Match($script:releaseSettings,'(?m)^'+[regex]::Escape($name)+'=(.*)$')
  if ($match.Success) {return $match.Groups[1].Value.Trim()}
  return ''
}
foreach ($capabilityName in @('EXECUTION_OPERATOR_TOKEN','BROWSER_WORKER_TOKEN','VERIFICATION_READ_TOKEN','DEMO_FAULT_CONTROL_TOKEN')) {
  if ((Read-ReleaseSetting $capabilityName).Length -lt 24) {
    $randomBytes=New-Object byte[] 32
    $randomSource=[Security.Cryptography.RandomNumberGenerator]::Create()
    try {$randomSource.GetBytes($randomBytes)} finally {$randomSource.Dispose()}
    Set-ReleaseSetting $capabilityName ([Convert]::ToBase64String($randomBytes))
  }
}
if ($EnableModelCalls -and -not (Read-ReleaseSetting 'META_API_KEY')) {throw 'Configure META_API_KEY locally before enabling model calls. Never paste it into chat.'}
foreach ($featureName in @('EXECUTION_ENABLED','VERIFICATION_ENABLED','RECOVERY_ENABLED','DEMO_CONTROLS_ENABLED')) {Set-ReleaseSetting $featureName 'true'}
Set-ReleaseSetting 'MISSION_MODEL_CALLS_ENABLED' ($EnableModelCalls.IsPresent.ToString().ToLowerInvariant())
Set-ReleaseSetting 'DEMO_CONTROL_TOKEN' (Read-ReleaseSetting 'DEMO_FAULT_CONTROL_TOKEN')
[IO.File]::WriteAllText($environmentPath,$releaseSettings,(New-Object Text.UTF8Encoding $false))
$composeArguments=@('-f','docker-compose.yml')
if ($BuildCaPem) {
  $trustedCa=(Resolve-Path -LiteralPath $BuildCaPem).Path.Replace('\','/')
  $temporaryDirectory=Join-Path $releaseRoot '.tmp'
  [IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
  $overridePath=Join-Path $temporaryDirectory 'release-build-ca.yml'
  $quotedCa=ConvertTo-Json $trustedCa -Compress
  $override=@"
services:
  backend:
    build:
      secrets: [build_ca]
  browser-worker:
    build:
      secrets: [build_ca]
  frontend:
    build:
      secrets: [build_ca]
secrets:
  build_ca:
    file: $quotedCa
"@
  [IO.File]::WriteAllText($overridePath,$override,(New-Object Text.UTF8Encoding $false))
  $composeArguments+=@('-f',$overridePath)
}
if (-not $SkipBuild) {
  docker compose @composeArguments build
  if ($LASTEXITCODE -ne 0) {throw 'Build failed. See docs/DEVELOPMENT.md for trusted CA setup; never disable TLS.'}
}
docker compose @composeArguments up -d --wait
if ($LASTEXITCODE -ne 0) {throw 'A service did not become healthy. Inspect docker compose ps and service logs.'}
$health=Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/health'
if ($health.version -ne '0.7.0') {throw 'The running backend does not match release 0.7.0.'}
Write-Output ('Ready: http://localhost:5173 | model calls enabled: '+$EnableModelCalls.IsPresent)
Write-Output 'Operator capability is stored in ignored .env. Startup preserves existing app data; reset explicitly in Mission Control.'
