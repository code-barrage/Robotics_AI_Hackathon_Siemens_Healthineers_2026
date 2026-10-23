$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$feRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$repoRoot = Resolve-Path (Join-Path $feRoot "..")
$fixtureDir = Resolve-Path (Join-Path $scriptDir "..\fixtures")

$tempRoot = Join-Path $env:TEMP "acu-e2e"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$dataPath = Join-Path $tempRoot "devices.json"
$workflowPath = Join-Path $tempRoot "workflows.json"

Copy-Item (Join-Path $fixtureDir "devices.seed.json") $dataPath -Force
Copy-Item (Join-Path $fixtureDir "workflows.seed.json") $workflowPath -Force

$env:DataPath = $dataPath
$env:WorkflowDataPath = $workflowPath
$env:ASPNETCORE_URLS = "http://localhost:3000"

Set-Location $repoRoot

dotnet run --project .\ApiGateway\ApiGateway.csproj -c Debug -p:Platform=x64 --no-launch-profile
