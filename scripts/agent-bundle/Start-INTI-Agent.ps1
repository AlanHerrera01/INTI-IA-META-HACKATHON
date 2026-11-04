param([string]$Backend = "http://127.0.0.1:8000")
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$agentPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $agentPython)) {
    py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 or newer first.' }
}
& $agentPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Agent dependencies could not be installed.' }
$env:PYTHONPATH = $PSScriptRoot
& $agentPython -m inti.local_agent --backend $Backend --state '.local\computer-agent.json' --workspace 'workspace'
