using System.Text.Json.Serialization;

namespace Acu.Storage.Models;

/// <summary>A timestamped workflow event recorded when the bot posts a status update.</summary>
public class EventEntry
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "";

    [JsonPropertyName("receivedAt")]
    public string ReceivedAt { get; set; } = "";
}

/// <summary>
/// Represents a robot device managed by the ACU.
/// </summary>
public class Device
{
    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("ip")]
    public string Ip { get; set; } = "";

    [JsonPropertyName("mac")]
    public string Mac { get; set; } = "";

    [JsonPropertyName("firmware")]
    public string Firmware { get; set; } = "";

    [JsonPropertyName("registeredAt")]
    public string RegisteredAt { get; set; } = "";

    /// <summary>pending | approved | rejected</summary>
    [JsonPropertyName("status")]
    public string Status { get; set; } = "pending";

    [JsonPropertyName("lastSeen")]
    public string LastSeen { get; set; } = "";
    
    [JsonPropertyName("lastSeenLocation")]
    public string? LastSeenLocation { get; set; }

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("statusData")]
    public Dictionary<string, object>? StatusData { get; set; }

    [JsonPropertyName("instructions")]
    public string Instructions { get; set; } = "";

    /// <summary>
    /// Rolling log of the last 50 events posted by this device.
    /// Append-only; the FE filters by receivedAt to ignore stale entries.
    /// </summary>
    [JsonPropertyName("recentEvents")]
    public List<EventEntry> RecentEvents { get; set; } = new();

    /// <summary>
    /// Named navigation waypoints uploaded by the robot from its onboard map.
    /// Overwritten wholesale whenever the bot calls POST /api/bot/destinations/{deviceId}.
    /// </summary>
    [JsonPropertyName("destinations")]
    public List<Destination> Destinations { get; set; } = new();

    /// <summary>
    /// True while the escort is auto-paused because continuous re-identification
    /// lost the patient (bot posted a <c>patient_lost</c> event). Cleared when the
    /// bot re-acquires the patient or an operator resumes manually.
    /// </summary>
    [JsonPropertyName("paused")]
    public bool Paused { get; set; }

    /// <summary>Human-readable reason shown to the operator while <see cref="Paused"/> is true.</summary>
    [JsonPropertyName("pauseReason")]
    public string? PauseReason { get; set; }
}
