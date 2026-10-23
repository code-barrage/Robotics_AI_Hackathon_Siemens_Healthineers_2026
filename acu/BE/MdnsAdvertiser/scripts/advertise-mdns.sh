#!/bin/sh
# ---------------------------------------------------------------------------
# Advertise the ACU control center over mDNS from the host (macOS / Linux) so
# the Android bot can auto-discover it (service type _pudu-cc._tcp).
#
# Run this ALONGSIDE the Docker stack started with the dev overlay:
#   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
#   BE/MdnsAdvertiser/scripts/advertise-mdns.sh
#
# Prefers native tools (macOS Bonjour `dns-sd`, Linux `avahi-publish-service`);
# otherwise falls back to the cross-platform .NET advertiser.
#
# Usage: BE/MdnsAdvertiser/scripts/advertise-mdns.sh [port] [name]
# ---------------------------------------------------------------------------
set -e

PORT="${1:-3000}"
NAME="${2:-ACU Control Center}"
# This script lives in BE/MdnsAdvertiser/scripts, so the project is one level up.
PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if command -v dns-sd >/dev/null 2>&1; then
  # macOS (Bonjour is built in)
  echo "Advertising via dns-sd: _pudu-cc._tcp on port ${PORT} (Ctrl+C to stop)"
  exec dns-sd -R "$NAME" _pudu-cc._tcp . "$PORT"
elif command -v avahi-publish-service >/dev/null 2>&1; then
  # Linux with avahi-utils installed
  echo "Advertising via avahi-publish-service: _pudu-cc._tcp on port ${PORT} (Ctrl+C to stop)"
  exec avahi-publish-service "$NAME" _pudu-cc._tcp "$PORT"
else
  echo "No native mDNS tool found -- using the .NET advertiser instead."
  exec dotnet run --project "$PROJ_DIR" -- --port "$PORT" --name "$NAME"
fi
