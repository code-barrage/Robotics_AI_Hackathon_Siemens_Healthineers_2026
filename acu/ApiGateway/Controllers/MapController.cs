using AcuApiGateway.Models;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>
/// Map APIs — robot map destination management.
///
/// <b>Write path A — External source (Swagger / hospital system):</b><br/>
/// <c>POST /api/bot/destinations/{deviceId}</c> stores the destination list.
///
/// <b>Write path B — Bot uploads its own map on startup:</b><br/>
/// The bot sends a WebSocket <c>destinations</c> message after connecting.
/// The WebSocket handler handles that path identically.
///
/// Both paths produce identical storage in <c>devices.json</c>.
/// </summary>
[ApiController]
[Route("api")]
[Tags("Map APIs")]
[Produces("application/json")]
public class MapController(DeviceStore store) : ControllerBase
{
    /// <summary>
    /// Store the destination list for a device.
    /// </summary>
    /// <remarks>
    /// Simulates an external source (hospital room-management system / Pudu Cloud)
    /// sending map data to the backend. The list is stored for the operator UI.
    ///
    /// Overwrites any previously stored list. Only <c>name</c> is required.
    /// <c>type</c> is the Pudu point type (e.g. "table", "usher", "transit") —
    /// passed through verbatim with no validation.
    /// </remarks>
    /// <response code="200">Destinations stored.</response>
    /// <response code="400">One or more entries are missing a name.</response>
    /// <response code="404">Device not found.</response>
    [HttpPost("bot/destinations/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult StoreDestinations(
        string deviceId,
        [FromBody] List<MapDestination> body)
    {
        // Only rule: name must not be blank.
        var emptyNames = body
            .Select((d, i) => (d, i))
            .Where(x => string.IsNullOrWhiteSpace(x.d.Name))
            .Select(x => x.i)
            .ToList();

        if (emptyNames.Count > 0)
            return BadRequest(new { error = "Destination 'name' must not be empty.", indices = emptyNames });

        // ── Atomic store ──────────────────────────────────────────────────
        var saved = body
            .Select(r => new Destination { Name = r.Name, Type = r.Type, X = r.X, Y = r.Y, Z = r.Z })
            .ToList();

        var result = store.ModifyDevice(deviceId, d => d.Destinations = saved);

        if (result is null)
            return NotFound(new { error = "Device not found", deviceId });

        return Ok(new
        {
            message  = $"Stored {body.Count} destination(s) for '{deviceId}'",
            deviceId
        });
    }

    /// <summary>Returns the stored destination list for a device.</summary>
    /// <remarks>
    /// Returns an empty array when no destinations have been received yet — never 404.
    /// </remarks>
    /// <response code="200">The destination list (may be empty).</response>
    [HttpGet("bot/destinations/{deviceId}")]
    [ProducesResponseType(typeof(List<Destination>), StatusCodes.Status200OK)]
    public IActionResult GetDestinations(string deviceId)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return Ok(Array.Empty<object>());

        return Ok(d.Destinations);
    }
}
