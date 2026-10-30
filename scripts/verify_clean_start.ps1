# Creates an isolated test project from the intended release files and existing built images.
# It never reads the real .env or resets the main project's data.
$ErrorActionPreference='Stop'
$releaseRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $releaseRoot
$checkId=[guid]::NewGuid().ToString('N').Substring(0,8)
$checkProject='inti-phase7-check-'+$checkId
$checkRoot=Join-Path $releaseRoot ('.tmp/clean-release-'+$checkId)
[IO.Directory]::CreateDirectory($checkRoot) | Out-Null
$sourceFiles=git -c core.quotePath=false ls-files --cached --others --exclude-standard
foreach ($relativeFile in $sourceFiles) {
  if ($relativeFile -eq '.env' -or $relativeFile.StartsWith('.git/')) {throw 'Private file in release source list'}
  $targetFile=[IO.Path]::GetFullPath((Join-Path $checkRoot $relativeFile))
  if (-not $targetFile.StartsWith($checkRoot+[IO.Path]::DirectorySeparatorChar)) {throw 'Invalid export path'}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($targetFile)) | Out-Null
  Copy-Item -LiteralPath (Join-Path $releaseRoot $relativeFile) -Destination $targetFile
}
function New-CheckCapability {
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
  return [Convert]::ToBase64String($bytes)
}
function New-CheckPort {
  $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
  $listener.Start()
  $port=$listener.LocalEndpoint.Port
  $listener.Stop()
  return $port
}
$apiPort=New-CheckPort
$webPort=New-CheckPort
$checkSettings=@{
  EXECUTION_OPERATOR_TOKEN=(New-CheckCapability);BROWSER_WORKER_TOKEN=(New-CheckCapability)
  VERIFICATION_READ_TOKEN=(New-CheckCapability);DEMO_FAULT_CONTROL_TOKEN=(New-CheckCapability)
  POSTGRES_PASSWORD=(New-CheckCapability);EXECUTION_ENABLED='true';VERIFICATION_ENABLED='true'
  RECOVERY_ENABLED='true';DEMO_CONTROLS_ENABLED='true';MISSION_MODEL_CALLS_ENABLED='false';META_API_KEY=''
}
$envFile=Join-Path $checkRoot '.env'
$lines=foreach ($setting in $checkSettings.GetEnumerator()) {Set-Item -Path ('Env:'+$setting.Key) -Value $setting.Value; $setting.Key+'='+$setting.Value}
[IO.File]::WriteAllLines($envFile,$lines,(New-Object Text.UTF8Encoding $false))
$overridePath=Join-Path $checkRoot 'clean-ports.yml'
$override=@"
services:
  postgres:
    ports: !reset []
  demo:
    image: inti-ai-demo:latest
    ports: !reset []
  inventory-state:
    image: inti-ai-inventory-state:latest
  backend:
    image: inti-ai-backend:latest
    ports: !override ["127.0.0.1:${apiPort}:8000"]
    environment:
      CORS_ORIGINS: '["http://127.0.0.1:$webPort"]'
  browser-worker:
    image: inti-ai-browser-worker:latest
  frontend:
    image: inti-ai-frontend:latest
    ports: !override ["127.0.0.1:${webPort}:5173"]
"@
[IO.File]::WriteAllText($overridePath,$override,(New-Object Text.UTF8Encoding $false))
$checkCompose=@('--project-directory',$checkRoot,'--env-file',$envFile,'-p',$checkProject,'-f',(Join-Path $checkRoot 'docker-compose.yml'),'-f',$overridePath)
try {
  docker compose @checkCompose up -d --no-build --wait
  if ($LASTEXITCODE -ne 0) {throw 'Fresh project did not become healthy'}
  $baseUrl='http://127.0.0.1:'+$apiPort
  $headers=@{Authorization='Bearer '+$checkSettings.EXECUTION_OPERATOR_TOKEN}
  $fresh=Invoke-RestMethod ($baseUrl+'/api/v1/mission-control') -Headers $headers
  $asset=Invoke-RestMethod ($baseUrl+'/api/v1/demo/status') -Headers $headers
  if ($fresh.mission_count -ne 0 -or $asset.asset.status -ne 'Inactive') {throw 'Project is not a fresh synthetic store'}
  $smokePath=Join-Path $checkRoot 'smoke.json'
  & (Join-Path $releaseRoot '.venv/Scripts/python.exe') (Join-Path $releaseRoot 'scripts/live_demo_check.py') --api $baseUrl --output $smokePath *> (Join-Path $checkRoot 'smoke.log')
  if ($LASTEXITCODE -ne 0) {throw 'Fresh-project authored browser/verifier smoke failed'}
  $smoke=Get-Content -Raw -LiteralPath $smokePath | ConvertFrom-Json
  $health=Invoke-RestMethod ($baseUrl+'/api/v1/health')
  $web=Invoke-WebRequest ('http://127.0.0.1:'+$webPort) -UseBasicParsing
  $summary=[ordered]@{
    recorded_at=[DateTime]::UtcNow.ToString('o');status='PASSED';project=$checkProject
    source='Release-file export, fresh random capabilities and named volumes; existing built images'
    backend_version=$health.version;initial_mission_count=$fresh.mission_count
    initial_asset=$asset.asset;frontend_http_status=$web.StatusCode
    execution_status=$smoke.execution.status;verification_verdict=$smoke.verification.effective_verdict
    evidence_count=$smoke.verification.evidence_count;real_model_calls=0
    main_project_data_touched=$false;dependency_install_from_empty_cache=$false
  }
  $summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $releaseRoot 'docs/evidence/phase7-clean-start.json')
  Write-Output 'Fresh-volume startup and authored real-browser verification PASSED; main project preserved.'
} finally {
  if (-not $checkProject.StartsWith('inti-phase7-check-')) {throw 'Refusing cleanup outside test project'}
  docker compose @checkCompose down --volumes
}
