# ---------------------------------------------------------------------------
# Advertise the ACU control center over mDNS from the Windows host so the
# Android bot can auto-discover it (service type _pudu-cc._tcp).
#
# Run this ALONGSIDE the Docker stack started with the dev overlay:
#   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
#   BE\MdnsAdvertiser\scripts\advertise-mdns.ps1
#
# It prefers Apple Bonjour's dns-sd.exe if installed; otherwise it falls back
# to the cross-platform .NET advertiser (no extra install -- uses your .NET SDK).
# ---------------------------------------------------------------------------
param(
    [int]$Port = 3000,
    [string]$Name = "ACU Control Center"
)

$ErrorActionPreference = "Stop"
# This script lives in BE/MdnsAdvertiser/scripts, so the project is one level up.
$projDir = Split-Path -Parent $PSScriptRoot

# Stop any advertiser already running. This prevents (a) duplicate beacons and
# (b) a locked DLL that would make the build below fail with exit code 1.
Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" |
    Where-Object { $_.CommandLine -like '*MdnsAdvertiser*' } |
    ForEach-Object {
        Write-Host "Stopping previous advertiser (PID $($_.ProcessId))"
        Stop-Process -Id $_.ProcessId -Force
    }

$dnssd = Get-Command dns-sd -ErrorAction SilentlyContinue
if ($dnssd) {
    Write-Host "Advertising via Bonjour (dns-sd): _pudu-cc._tcp on port $Port"
    Write-Host "Press Ctrl+C to stop."
    & dns-sd -R $Name "_pudu-cc._tcp" "local." $Port
    return
}

Write-Host "Bonjour (dns-sd) not found -- using the .NET advertiser instead."

# Build first, then run the prebuilt DLL directly (NOT `dotnet run`). `dotnet run`
# rebuilds on launch, which fails with exit code 1 if a previous advertiser still
# holds the DLL. Building explicitly + running the DLL avoids that trap.
$proj = Join-Path $projDir "MdnsAdvertiser.csproj"
Write-Host "Building advertiser..."
dotnet build $proj -c Release | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed."; exit 1 }

$dll = Join-Path $projDir "bin\Release\net8.0\Acu.MdnsAdvertiser.dll"
Write-Host "Press Ctrl+C to stop."
& dotnet $dll --port $Port --name $Name
