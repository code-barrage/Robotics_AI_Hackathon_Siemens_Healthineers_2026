# ---------------------------------------------------------------------------
# Verify the ACU mDNS broadcast is actually leaving this machine.
#
# Run the advertiser in one window:
#   BE\MdnsAdvertiser\scripts\advertise-mdns.ps1 -Port 3000
# Then run this sniffer in a SECOND window:
#   BE\MdnsAdvertiser\scripts\verify-broadcast.ps1
#
# It joins the mDNS multicast group (224.0.0.251:5353) and prints any packet
# containing "pudu-cc". Seeing lines here proves the advertiser is broadcasting
# on the LAN -- if your phone still can't see it, the problem is the network
# (AP/client isolation) or the browser app, NOT this code.
# ---------------------------------------------------------------------------
[CmdletBinding()]
param(
    [string]$Match = 'pudu-cc',
    [int]$Seconds = 30
)

$ErrorActionPreference = 'Stop'
$mdnsAddr = [System.Net.IPAddress]::Parse('224.0.0.251')

$udp = New-Object System.Net.Sockets.UdpClient
try {
    # MUST set these BEFORE Bind so we can share port 5353 with the advertiser
    # and the OS mDNS responder (otherwise Bind throws "address in use").
    $udp.ExclusiveAddressUse = $false
    $udp.Client.SetSocketOption(
        [System.Net.Sockets.SocketOptionLevel]::Socket,
        [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)

    $udp.Client.Bind([System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 5353))
    $udp.JoinMulticastGroup($mdnsAddr)
}
catch {
    Write-Error "Could not bind/join multicast: $($_.Exception.Message)"
    $udp.Dispose()
    exit 1
}

Write-Host "Listening on 224.0.0.251:5353 for '$Match' (up to $Seconds s, Ctrl+C to stop)..."
$deadline = (Get-Date).AddSeconds($Seconds)
$hits = 0

while ((Get-Date) -lt $deadline) {
    # Non-blocking-ish: only Receive when data is available so the timeout works.
    if ($udp.Client.Poll(500000, [System.Net.Sockets.SelectMode]::SelectRead)) {
        $ep = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
        $data = $udp.Receive([ref]$ep)
        $txt = -join ($data | ForEach-Object { if ($_ -ge 32 -and $_ -lt 127) { [char]$_ } else { '.' } })
        if ($txt -match $Match) {
            $hits++
            Write-Host "[$($ep.Address)] $txt"
        }
    }
}

$udp.DropMulticastGroup($mdnsAddr)
$udp.Dispose()

Write-Host ""
if ($hits -gt 0) {
    Write-Host "RESULT: $hits '$Match' packet(s) captured -- the broadcast IS live on this network." -ForegroundColor Green
} else {
    Write-Host "RESULT: no '$Match' packets seen. Is the advertiser running in the other window?" -ForegroundColor Yellow
}
