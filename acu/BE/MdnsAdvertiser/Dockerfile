# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Shared MSBuild property sheet imported by MdnsAdvertiser.csproj
COPY _Globals/PropertySheets/ _Globals/PropertySheets/

# Copy nuget.config first so restore uses the right package sources
COPY BE/MdnsAdvertiser/nuget.config BE/MdnsAdvertiser/

# Copy project file and restore
COPY BE/MdnsAdvertiser/MdnsAdvertiser.csproj BE/MdnsAdvertiser/
RUN dotnet restore BE/MdnsAdvertiser/MdnsAdvertiser.csproj --configfile BE/MdnsAdvertiser/nuget.config

# Copy source and publish
COPY BE/MdnsAdvertiser/ BE/MdnsAdvertiser/

RUN dotnet publish BE/MdnsAdvertiser/MdnsAdvertiser.csproj \
        -c Release \
        -o /app/publish

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# NOTE: mDNS multicast must reach the physical LAN. On a Linux host, run this
# container with `network_mode: host` (see docker-compose.yml) so the
# announcement isn't trapped behind Docker's bridge NAT. On Windows/macOS
# Docker Desktop, host networking runs inside the Desktop VM and STILL cannot
# reach the real Wi-Fi/Ethernet NIC — use BE/MdnsAdvertiser/scripts/advertise-mdns.ps1
# on the host instead in that case.
ENTRYPOINT ["dotnet", "Acu.MdnsAdvertiser.dll"]
