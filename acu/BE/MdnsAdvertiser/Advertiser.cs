using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Makaretu.Dns;

namespace Acu.MdnsAdvertiser;

// ═══════════════════════════════════════════════════════════════════════════
//  ACU mDNS / DNS-SD discovery service  (standalone backend process)
// ═══════════════════════════════════════════════════════════════════════════
//
//  WHAT
//  ----
//  Advertises the ACU Control Center on the local network as `_pudu-cc._tcp`
//  so clients (the Android robot's NSD client, phones, etc.) can resolve the
//  server's IP + port DYNAMICALLY — no hard-coded server address anywhere.
//
//  WHY A SEPARATE PROCESS (not part of ApiGateway)
//  -----------------------------------------------
//  This runs as its own executable, completely decoupled from the REST API:
//    * it can never block, lag, or crash request handling in ApiGateway;
//    * the API stays a pure REST service (single responsibility);
//    * discovery can be started/stopped independently of the API.
//
//  EXACTLY ONE ADDRESS IS ADVERTISED
//  ---------------------------------
//  A DNS-SD client resolves a service to a SINGLE address. When several A
//  records share one hostname the client picks one non-deterministically, so
//  advertising an address the client cannot route to does not degrade
//  gracefully — it fails randomly, with no server-side log line, because the
//  packets never arrive. We therefore publish one address, chosen by asking the
//  OS routing table (see GetDefaultRouteAddress) rather than by guessing from
//  adapter names.
//
//  WHERE IT RUNS
//  -------------
//    * Linux host  : run with `network_mode: host` (see docker-compose.yml) so
//                    multicast reaches the real LAN.
//    * Windows/macOS: Docker Desktop runs containers in a VM whose multicast
//                    can't reach the physical LAN, so we run THIS on the host
//                    (via scripts/advertise-mdns.* in this folder) to broadcast on the real
//                    Wi-Fi/Ethernet NIC.
//
//  USAGE
//  -----
//    dotnet run --project BE/MdnsAdvertiser -- --port 3000 --name "ACU Control Center"
//    (or set MDNS_PORT / MDNS_NAME environment variables)
//
//    Options:
//      --port, -p   TCP port the Control Center listens on   (default 3000)
//      --name, -n   Instance name shown to clients           (default "ACU Control Center")
//      --ip         Pin a specific address instead of auto-detecting the LAN IP.
//                   Useful when automatic routing chooses the wrong interface
//                   (for example a VPN). A pin must be updated if that address
//                   changes; it does not make Docker Desktop multicast reach the LAN.
//
// ═══════════════════════════════════════════════════════════════════════════
internal static class Advertiser
{
    private const string ServiceType = "_pudu-cc._tcp";

    /// <summary>How often the beacon re-announces, and re-checks the host address.</summary>
    private static readonly TimeSpan AnnounceInterval = TimeSpan.FromSeconds(3);

    /// <summary>Spacing of the initial announcement burst after (re)starting the responder.</summary>
    private static readonly TimeSpan BurstInterval = TimeSpan.FromSeconds(1);

    /// <summary>How often to print a liveness line, so the log shows the address in use.</summary>
    private static readonly TimeSpan StatusInterval = TimeSpan.FromMinutes(5);

    private static void Main(string[] args)
    {
        // ── 1. Read configuration (env vars, overridable by CLI flags) ──────
        ushort port         = ParsePort(Environment.GetEnvironmentVariable("MDNS_PORT")) ?? 3000;
        string instance     = Environment.GetEnvironmentVariable("MDNS_NAME") ?? "ACU Control Center";
        IPAddress? pinnedIp = null;

        for (int i = 0; i + 1 < args.Length; i++)
        {
            switch (args[i])
            {
                case "--port" or "-p":
                    if (ushort.TryParse(args[i + 1], out var p)) port = p;
                    break;
                case "--name" or "-n":
                    instance = args[i + 1];
                    break;
                case "--ip":
                    IPAddress.TryParse(args[i + 1], out pinnedIp);
                    break;
            }
        }

        Console.WriteLine("ACU mDNS advertiser");
        Console.WriteLine($"  service : {ServiceType}");
        Console.WriteLine($"  instance: {instance}");
        Console.WriteLine($"  port    : {port}");
        Console.WriteLine($"  address : {(pinnedIp is null ? "auto (default-route interface)" : $"{pinnedIp} (pinned via --ip)")}");

        // ── 2. Wait for a usable address ────────────────────────────────────
        // The container can start before DHCP has handed out a lease, so block
        // here rather than advertising nothing (or something wrong) forever.
        var address = WaitForAddress(pinnedIp);

        // ── 3. Advertise, and keep the advertisement true ───────────────────
        // The address is re-checked on every tick. If the host moves network
        // (DHCP renewal, Wi-Fi <-> Ethernet, hotspot swapped for a router) the
        // responder is rebuilt on the new address within one interval. Rebuilding
        // rather than mutating also rebinds the multicast sockets to the new
        // interface, which is required for the announcement to actually egress.
        var responder = Responder.Start(instance, ServiceType, port, address);
        AnnounceBurst(responder);

        var lastStatus = DateTime.UtcNow;

        while (true)
        {
            Thread.Sleep(AnnounceInterval);

            var latest = ResolveAdvertisedAddress(pinnedIp);

            if (latest is not null && !latest.Equals(responder.Address))
            {
                Console.WriteLine($"Host address changed: {responder.Address} -> {latest}. Re-advertising.");
                responder.Dispose();
                responder = Responder.Start(instance, ServiceType, port, latest);
                AnnounceBurst(responder);
                lastStatus = DateTime.UtcNow;
                continue;
            }

            if (latest is null)
                Console.WriteLine($"No usable LAN address right now — still announcing {responder.Address}.");

            responder.Announce();

            if (DateTime.UtcNow - lastStatus >= StatusInterval)
            {
                Console.WriteLine($"Still advertising {ServiceType} at {responder.Address}:{port}.");
                lastStatus = DateTime.UtcNow;
            }
        }
    }

    /// <summary>
    /// Sends a short burst of announcements so clients already listening pick the
    /// service up within a second or two, instead of waiting for the steady beacon.
    /// </summary>
    private static void AnnounceBurst(Responder responder)
    {
        for (int i = 0; i < 3; i++)
        {
            responder.Announce();
            Thread.Sleep(BurstInterval);
        }
    }

    /// <summary>Blocks until an address is available, logging while it waits.</summary>
    private static IPAddress WaitForAddress(IPAddress? pinnedIp)
    {
        var warned = false;
        while (true)
        {
            var address = ResolveAdvertisedAddress(pinnedIp);
            if (address is not null)
            {
                Console.WriteLine($"Advertising host address: {address}");
                return address;
            }

            if (!warned)
            {
                Console.WriteLine("No usable LAN address yet (no default route?) — waiting...");
                warned = true;
            }
            Thread.Sleep(AnnounceInterval);
        }
    }

    /// <summary>
    /// The single IPv4 address a robot on the LAN can actually reach this host at.
    /// </summary>
    /// <remarks>
    /// Resolution order:
    /// <list type="number">
    ///   <item>the <c>--ip</c> override, used verbatim;</item>
    ///   <item>the source address the OS would use for off-link traffic;</item>
    ///   <item>a name-filtered adapter scan, for hosts with no default route.</item>
    /// </list>
    /// </remarks>
    private static IPAddress? ResolveAdvertisedAddress(IPAddress? pinnedIp)
        => pinnedIp ?? GetDefaultRouteAddress() ?? GetPhysicalIPv4Addresses().FirstOrDefault();

    /// <summary>
    /// Asks the OS routing table which source address it would use to reach a host
    /// off the local link.
    /// </summary>
    /// <remarks>
    /// Connecting a UDP socket transmits nothing: the kernel only performs a route
    /// lookup and binds the resulting source address, so this needs no reachable
    /// peer and costs nothing.
    /// <para>
    /// On a typical Linux host this chooses Wi-Fi/Ethernet rather than a Compose
    /// bridge. It is not a reachability test: VPN or policy routes may select an
    /// address unavailable to the robot. Use <c>--ip</c> when automatic selection
    /// does not match the robot's network.
    /// </para>
    /// </remarks>
    private static IPAddress? GetDefaultRouteAddress()
    {
        try
        {
            using var probe = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);

            // TEST-NET-3 (RFC 5737) is reserved for documentation and is never a
            // real peer; port 9 is discard. Nothing leaves the machine.
            probe.Connect(new IPEndPoint(IPAddress.Parse("203.0.113.1"), 9));

            return probe.LocalEndPoint is IPEndPoint local && IsUsableLanAddress(local.Address)
                ? local.Address
                : null;
        }
        catch (SocketException)
        {
            return null;   // no default route — isolated network
        }
    }

    /// <summary>Rejects loopback, APIPA and non-IPv4 addresses.</summary>
    private static bool IsUsableLanAddress(IPAddress address) =>
        address.AddressFamily == AddressFamily.InterNetwork
        && !IPAddress.IsLoopback(address)
        && !address.ToString().StartsWith("169.254.", StringComparison.Ordinal);

    /// <summary>
    /// Substrings identifying adapters that are host-internal: a LAN peer can
    /// never route to them.
    /// </summary>
    /// <remarks>
    /// <c>"br-"</c>, <c>"veth"</c> and friends matter on Linux: with
    /// <c>network_mode: host</c> this process sees the host's full adapter list,
    /// including the bridge <c>docker compose</c> creates per project. That bridge
    /// is named <c>br-&lt;hash&gt;</c> — it contains neither "docker" nor
    /// "vethernet", so it used to pass as a physical adapter and its gateway
    /// address (172.18.0.1 and similar) was advertised to robots.
    /// <para>
    /// Note <c>"br-"</c> keeps the hyphen deliberately, so a genuine host bridge
    /// named <c>br0</c> is still treated as physical.
    /// </para>
    /// </remarks>
    private static readonly string[] VirtualAdapterMarkers =
    [
        "wsl", "hyper-v", "vethernet", "docker", "virtualbox", "vmware",
        "loopback", "bluetooth", "tunnel", "vpn",
        "br-", "veth", "virbr", "podman", "flannel", "tailscale"
    ];

    /// <summary>
    /// True for real LAN adapters; false for loopback and virtual adapters
    /// (WSL, Hyper-V, Docker/Compose bridges, VM, VPN, tunnel, Bluetooth).
    /// </summary>
    private static bool IsPhysical(NetworkInterface nic)
    {
        if (nic.OperationalStatus != OperationalStatus.Up) return false;
        if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) return false;

        var id = (nic.Name + " " + nic.Description).ToLowerInvariant();
        return !VirtualAdapterMarkers.Any(marker => id.Contains(marker, StringComparison.Ordinal));
    }

    /// <summary>
    /// Fallback for hosts with no default route: the real physical LAN IPv4
    /// address(es), excluding loopback, APIPA (169.254.*), and virtual adapters.
    /// </summary>
    private static List<IPAddress> GetPhysicalIPv4Addresses()
    {
        var result = new List<IPAddress>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (!IsPhysical(nic)) continue;

            foreach (var ua in nic.GetIPProperties().UnicastAddresses)
            {
                if (IsUsableLanAddress(ua.Address))
                    result.Add(ua.Address);
            }
        }
        return result;
    }

    private static ushort? ParsePort(string? s) => ushort.TryParse(s, out var v) ? v : null;

    /// <summary>
    /// One running mDNS responder, pinned to a single advertised address.
    /// Disposed and rebuilt whenever that address changes.
    /// </summary>
    private sealed class Responder : IDisposable
    {
        private readonly MulticastService myMdns;
        private readonly ServiceDiscovery myDiscovery;
        private readonly ServiceProfile myProfile;

        /// <summary>The address published in this responder's A record.</summary>
        public IPAddress Address { get; }

        private Responder(MulticastService mdns, ServiceDiscovery discovery, ServiceProfile profile, IPAddress address)
        {
            myMdns      = mdns;
            myDiscovery = discovery;
            myProfile   = profile;
            Address     = address;
        }

        public static Responder Start(string instance, string serviceType, ushort port, IPAddress address)
        {
            // Bind to physical interfaces only, so announcements egress the
            // Wi-Fi/Ethernet NIC rather than a dead-end virtual adapter.
            var mdns = new MulticastService(filter: nics => nics.Where(IsPhysical));
            var discovery = new ServiceDiscovery(mdns);

            // Exactly one address — see the header comment on why multiple is harmful.
            var profile = new ServiceProfile(instance, serviceType, port, [address]);

            // Advertise() answers incoming queries; Announce() (below) also PUSHES
            // unsolicited announcements, so discovery works as a pure beacon even
            // if a client never queries.
            discovery.Advertise(profile);
            mdns.Start();

            Console.WriteLine($"Broadcasting {serviceType} as {address}:{port} on the LAN.");
            return new Responder(mdns, discovery, profile, address);
        }

        public void Announce() => myDiscovery.Announce(myProfile);

        public void Dispose()
        {
            try { myDiscovery.Dispose(); } catch (Exception e) { Console.WriteLine($"  (discovery dispose: {e.Message})"); }
            try { myMdns.Dispose(); }      catch (Exception e) { Console.WriteLine($"  (mdns dispose: {e.Message})"); }
        }
    }
}
