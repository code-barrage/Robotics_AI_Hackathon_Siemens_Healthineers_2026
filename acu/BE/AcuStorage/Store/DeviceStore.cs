using System.Text.Json;
using Acu.Storage.Models;
using Microsoft.Extensions.Configuration;

namespace Acu.Storage.Store;

/// <summary>
/// Thread-safe, file-backed store for device records.
/// Default path: /data/devices.json  (override via DataPath in appsettings).
/// </summary>
public class DeviceStore(IConfiguration configuration)
{
    private static readonly JsonSerializerOptions myJsonSerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented               = true
    };

    private readonly string myStoragePath = configuration.GetValue<string>("DataPath") ?? "/data/devices.json";
    private readonly object myReadLock = new();

    // In-memory MAC → deviceId index (pending + approved only).
    // Null means "not yet built"; rebuilt on every Write() and lazily on first FindDeviceIdByMac().
    // All access must be inside lock(myReadLock).
    private Dictionary<string, string>? _macIndex;

    private static Dictionary<string, string> BuildMacIndex(Dictionary<string, Device> db) =>
        db.Values
          .Where(d => !string.IsNullOrEmpty(d.Mac) && d.Status is "pending" or "approved")
          .ToDictionary(d => d.Mac, d => d.DeviceId);

    /// <summary>Read the full device map from disk.</summary>
    public Dictionary<string, Device> Read()
    {
        lock (myReadLock)
        {
            if (!File.Exists(myStoragePath))
                return new Dictionary<string, Device>();

            var json = File.ReadAllText(myStoragePath);
            return JsonSerializer.Deserialize<Dictionary<string, Device>>(json, myJsonSerializerOptions)
                   ?? new Dictionary<string, Device>();
        }
    }

    /// <summary>Persist the full device map to disk and rebuild the MAC index.</summary>
    public void Write(Dictionary<string, Device> db)
    {
        lock (myReadLock)
        {
            _macIndex = BuildMacIndex(db);   // keep index in sync on every write

            var dir = Path.GetDirectoryName(myStoragePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var json = JsonSerializer.Serialize(db, myJsonSerializerOptions);
            File.WriteAllText(myStoragePath, json);
        }
    }

    /// <summary>
    /// O(1) lookup: returns the deviceId that currently owns <paramref name="mac"/>
    /// (pending or approved), or <c>null</c> if the MAC is free.
    /// </summary>
    public string? FindDeviceIdByMac(string mac)
    {
        lock (myReadLock)
        {
            // Build the index from disk the very first time (warm-up after restart).
            if (_macIndex is null)
            {
                var db = File.Exists(myStoragePath)
                    ? JsonSerializer.Deserialize<Dictionary<string, Device>>(
                          File.ReadAllText(myStoragePath), myJsonSerializerOptions)
                      ?? new()
                    : new Dictionary<string, Device>();

                _macIndex = BuildMacIndex(db);
            }

            return _macIndex.TryGetValue(mac, out var id) ? id : null;
        }
    }

    /// <summary>
    /// Atomically reads the device map, applies <paramref name="mutate"/> to the
    /// specified device, then writes the map back to disk — all under a single lock.
    /// This prevents the TOCTOU race that could cause concurrent status-event POSTs
    /// (e.g. patient_reached_reception + workflow_completed arriving within the same
    /// millisecond) from overwriting each other.
    /// Returns the mutated <see cref="Device"/>, or <c>null</c> if not found.
    /// </summary>
    public Device? ModifyDevice(string deviceId, Action<Device> mutate)
    {
        lock (myReadLock)
        {
            var json = File.Exists(myStoragePath)
                ? File.ReadAllText(myStoragePath)
                : "{}";

            var db = JsonSerializer.Deserialize<Dictionary<string, Device>>(json, myJsonSerializerOptions)
                     ?? new Dictionary<string, Device>();

            if (!db.TryGetValue(deviceId, out var d))
                return null;

            mutate(d);

            _macIndex = BuildMacIndex(db);
            File.WriteAllText(myStoragePath, JsonSerializer.Serialize(db, myJsonSerializerOptions));

            return d;
        }
    }

    /// <summary>
    /// How long a device may go without a heartbeat before it counts as offline.
    /// </summary>
    public static readonly TimeSpan HeartbeatTimeout = TimeSpan.FromSeconds(20);

    /// <summary>
    /// True when <paramref name="lastSeen"/> (ISO-8601) is within <see cref="HeartbeatTimeout"/>.
    /// </summary>
    /// <remarks>
    /// The REST heartbeat (<c>POST /api/bot/device-status/{deviceId}</c>) is the
    /// authoritative liveness signal, so this is the single definition of "online"
    /// shared by the background sweep and the WebSocket disconnect path.
    /// </remarks>
    public static bool IsHeartbeatFresh(string? lastSeen)
    {
        if (string.IsNullOrEmpty(lastSeen) || !DateTime.TryParse(lastSeen, out var last))
            return false;

        return DateTime.UtcNow - last.ToUniversalTime() < HeartbeatTimeout;
    }

    /// <summary>
    /// Called every 10 s to flip <see cref="Device.Online"/> to false
    /// when the last heartbeat is older than <see cref="HeartbeatTimeout"/>.
    /// </summary>
    public void UpdateOnlineStatus()
    {
        var db      = Read();
        var changed = false;

        foreach (var d in db.Values)
        {
            if (d.Status != "approved" || string.IsNullOrEmpty(d.LastSeen))
                continue;

            var shouldBeOnline = IsHeartbeatFresh(d.LastSeen);
            if (d.Online != shouldBeOnline)
            {
                d.Online = shouldBeOnline;
                changed  = true;
            }
        }

        if (changed)
            Write(db);
    }
}