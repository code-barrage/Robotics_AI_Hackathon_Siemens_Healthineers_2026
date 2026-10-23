using System.Text.Json.Serialization;

namespace Acu.Storage.Models;

/// <summary>
/// A named navigation waypoint on the robot's onboard map.
/// Stored per-device; overwritten wholesale on each destinations upload.
/// </summary>
public class Destination
{
    /// <summary>
    /// Exact waypoint name as it appears on the robot's map.
    /// Must match the <c>destination</c> field in <c>follow_me</c> workflow steps
    /// character-for-character (casing and spacing included).
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>
    /// Pudu point type — e.g. "table", "usher", "transit", "dining_outlet".
    /// Free-form string sent verbatim from the Pudu map; not validated by the backend.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    /// <summary>X coordinate on the robot's map grid (from Pudu Cloud).</summary>
    [JsonPropertyName("x")]
    public double? X { get; set; }

    /// <summary>Y coordinate on the robot's map grid.</summary>
    [JsonPropertyName("y")]
    public double? Y { get; set; }

    /// <summary>Z coordinate on the robot's map grid.</summary>
    [JsonPropertyName("z")]
    public double? Z { get; set; }
}
