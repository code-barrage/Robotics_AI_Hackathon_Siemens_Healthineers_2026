using System.ComponentModel.DataAnnotations;

namespace AcuApiGateway.Models;

/// <summary>
/// A single Pudu robot map waypoint.
/// Used as the request/response body for the map destinations endpoints
/// and as the WebSocket <c>destinations</c> message payload.
/// </summary>
public class MapDestination
{
    /// <summary>
    /// Exact waypoint name as it appears on the robot's map.
    /// Must match the <c>destination</c> field used in <c>follow_me</c>
    /// workflow steps — character-for-character, casing and spacing included.
    /// </summary>
    /// <example>Waiting Room 1</example>
    [Required]
    public string Name { get; set; } = "";

    /// <summary>
    /// Pudu point type — e.g. "table", "usher", "transit", "dining_outlet".
    /// Passed through verbatim; the backend does not validate or restrict this value.
    /// </summary>
    /// <example>usher</example>
    [Required]
    public string Type { get; set; } = "";

    /// <summary>X coordinate from Pudu Cloud map.</summary>
    /// <example>12.5</example>
    public double? X { get; set; }

    /// <summary>Y coordinate from Pudu Cloud map.</summary>
    /// <example>8.3</example>
    public double? Y { get; set; }

    /// <summary>Z coordinate from Pudu Cloud map.</summary>
    /// <example>0.0</example>
    public double? Z { get; set; }
}
