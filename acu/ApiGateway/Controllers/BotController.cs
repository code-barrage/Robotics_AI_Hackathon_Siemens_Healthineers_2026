using System.Text.Json;
using AcuApiGateway.Models;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>Endpoints consumed by robot devices (bots).</summary>
[ApiController]
[Route("api")]
[Tags("bot")]
[Produces("application/json")]
public class BotController(DeviceStore store, WorkflowStore workflowStore, AcuSettingsStore settingsStore) : ControllerBase
{
    // ── Identity helper ────────────────────────────────────────────────────
    /// <summary>
    /// Looks up a device and validates that BOTH the deviceId and the MAC
    /// address match the registered record.  Returns the Device on success,
    /// or a ready-to-return IActionResult on failure.
    /// </summary>
    private (Device? device, IActionResult? error) LookupDevice(
        string deviceId, string mac, Dictionary<string, Device> db)
    {
        if (!db.TryGetValue(deviceId, out var d))
            return (null, NotFound(new { error = "Device not found" }));

        if (!string.Equals(d.Mac, mac, StringComparison.OrdinalIgnoreCase))
            return (null, StatusCode(StatusCodes.Status403Forbidden,
                new { error = "MAC address does not match the registered device" }));

        return (d, null);
    }

    /// <summary>Robot registers itself with the ACU.</summary>
    /// <remarks>
    /// The device enters <b>pending</b> state and must be approved by an operator
    /// before any other bot endpoints become usable.
    /// </remarks>
    [HttpPost("bot/register")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public IActionResult Register([FromBody] RegisterRequest body)
    {
        var db = store.Read();

        // ── Block re-registration if deviceId is still active in the store ──
        if (db.TryGetValue(body.DeviceId, out var existing))
        {
            if (!string.Equals(existing.Mac, body.Mac, StringComparison.OrdinalIgnoreCase))
                return Conflict(new { error = $"Device ID '{body.DeviceId}' is already in use by a different MAC address" });

            // Same device — must unregister before registering again
            return Conflict(new { error = $"Device '{body.DeviceId}' is already registered (status: {existing.Status}). Unregister it first." });
        }

        // ── Block if another device already holds this MAC ────────────────
        var macOwner = store.FindDeviceIdByMac(body.Mac);
        if (macOwner != null)
            return Conflict(new { error = $"MAC address '{body.Mac}' is already registered to device '{macOwner}'" });

        // ── Fresh registration ────────────────────────────────────────────
        db[body.DeviceId] = new Device
        {
            DeviceId     = body.DeviceId,
            Name         = body.Name,
            Ip           = body.Ip,
            Mac          = body.Mac,
            Firmware     = body.Firmware,
            RegisteredAt = DateTime.UtcNow.ToString("o"),
            Status       = "pending"
        };

        store.Write(db);
        return Ok(new { message = "Registration received, awaiting approval", deviceId = body.DeviceId });
    }

    /// <summary>Robot polls its own registration state.</summary>
    /// <remarks>
    /// Always returns 200 with a <c>status</c> field — never 404.
    /// The bot should poll this after registering and react to each state:
    /// <list type="bullet">
    ///   <item><c>pending</c>   – waiting for operator approval, keep polling</item>
    ///   <item><c>approved</c>  – cleared to operate</item>
    ///   <item><c>rejected</c>  – operator denied, show rejection screen</item>
    ///   <item><c>unregistered</c> – was removed by operator, go back to registration screen</item>
    /// </list>
    /// </remarks>
    [HttpGet("bot/registration-status/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public IActionResult GetRegistrationStatus(string deviceId)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return Ok(new { status = "unregistered", deviceId });

        return Ok(new { status = d.Status, deviceId });
    }
    /// <remarks>Both deviceId (URL) and mac (body) must match the registration.</remarks>
    [HttpDelete("bot/unregister/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Unregister(string deviceId, [FromBody] UnregisterRequest body)
    {
        var db = store.Read();

        var (_, err) = LookupDevice(deviceId, body.Mac, db);
        if (err != null) return err;

        db.Remove(deviceId);
        store.Write(db);
        return Ok(new { message = "Device unregistered", deviceId });
    }

    /// <summary>Robot sends live telemetry (battery, location, etc.).</summary>
    /// <remarks>
    /// Also used as an approval-status poll — sends empty body <c>{}</c> when pending.
    /// MAC is validated only when present in the body.
    /// </remarks>
    [HttpPost("bot/device-status/{deviceId}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult PostStatus(string deviceId, [FromBody] Dictionary<string, object> body)
    {
        // Capture the incoming event BEFORE entering the lock so string work
        // is done outside the critical section.
        var newEvtStr = body.TryGetValue("event", out var evtRaw) ? evtRaw?.ToString() : null;
        var mac       = body.TryGetValue("mac",   out var macObj)  ? macObj?.ToString()  : null;

        string? lastSeenLocation = null;

        if (body.Remove("lastSeenLocation", out var locationRaw))
        {
            if (locationRaw is not JsonElement locationElement ||
                locationElement.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(locationElement.GetString()))
            {
                return BadRequest(new
                {
                    error = "'lastSeenLocation' must be a non-empty string."
                });
            }

            lastSeenLocation = locationElement.GetString();
        }

        // Optional destinations replace the stored list, never merge into statusData.
        List<Destination>? destinations = null;
        if (body.Remove("destinations", out var destinationsRaw))
        {
            List<MapDestination>? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<List<MapDestination>>(
                    JsonSerializer.Serialize(destinationsRaw), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            catch (JsonException)
            {
                return BadRequest(new { error = "'destinations' must be an array of destinations." });
            }
            if (parsed is null || parsed.Any(item => item is null || string.IsNullOrWhiteSpace(item.Name)))
                return BadRequest(new { error = "Destination 'name' must not be empty." });
            destinations = parsed
                .Select(r => new Destination { Name = r.Name, Type = r.Type ?? "", X = r.X, Y = r.Y, Z = r.Z })
                .ToList();
        }

        // --- Atomic read-modify-write (single lock, no TOCTOU race) -----------
        // Two status POSTs that arrive within the same millisecond (e.g.
        // patient_reached_reception and workflow_completed from the Finished step)
        // would previously overwrite each other because Read() and Write() held the
        // lock separately. ModifyDevice() holds the lock for the entire cycle.
        Device? snapshot = null;
        var result = store.ModifyDevice(deviceId, d =>
        {
            // MAC validation (only when the bot includes it)
            if (!string.IsNullOrEmpty(mac) &&
                !string.Equals(d.Mac, mac, StringComparison.OrdinalIgnoreCase))
            {
                snapshot = null; // signal forbidden below
                return;
            }

            if (d.Status != "approved") { snapshot = null; return; }

            // Merge body into statusData
            var merged = d.StatusData != null
                ? new Dictionary<string, object>(d.StatusData)
                : new Dictionary<string, object>();
            foreach (var kvp in body) merged[kvp.Key] = kvp.Value;
            d.StatusData = merged;
            if (lastSeenLocation is not null) d.LastSeenLocation = lastSeenLocation;
            if (destinations is not null) d.Destinations = destinations;
            d.LastSeen   = DateTime.UtcNow.ToString("o");
            d.Online     = true;

  
            if (newEvtStr == "clear")
            {
                d.RecentEvents.Clear();
            }
            else if (!string.IsNullOrEmpty(newEvtStr))
            {
                var lastEvt = d.RecentEvents.Count > 0 ? d.RecentEvents[^1].Event : null;
                if (newEvtStr != lastEvt)
                {
                    d.RecentEvents.Add(new EventEntry
                    {
                        Event      = newEvtStr,
                        ReceivedAt = DateTime.UtcNow.ToString("o"),
                    });
                    if (d.RecentEvents.Count > 50) d.RecentEvents.RemoveAt(0);
                }
            }

            snapshot = d;
        });

        if (result is null)
            return NotFound(new { error = "Device not found" });

        if (snapshot is null)
        {
            // Re-read to distinguish forbidden vs not-approved
            var db2 = store.Read();
            if (!db2.TryGetValue(deviceId, out var d2)) return NotFound(new { error = "Device not found" });
            if (!string.IsNullOrEmpty(mac) && !string.Equals(d2.Mac, mac, StringComparison.OrdinalIgnoreCase))
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "MAC address does not match the registered device" });
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Device not approved" });
        }

        workflowStore.GetAssignments().TryGetValue(deviceId, out var assignedWorkflowId);

        return Ok(new
        {
            message            = "Status updated",
            status             = snapshot.Status,
            instructions       = snapshot.Instructions,
            deviceId           = snapshot.DeviceId,
            online             = snapshot.Online,
            assignedWorkflowId,
            speechLanguage     = settingsStore.Get().SpeechLanguage
        });
    }

    /// <summary>Robot polls for its registration status and latest instruction.</summary>
    /// <remarks>
    /// Returns 403 while pending (device not yet approved), 200 once approved.
    /// If <c>mac</c> is supplied it is validated; omitting it is allowed for backward compatibility.
    /// </remarks>
    [HttpGet("bot/instructions/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult GetInstructions(string deviceId, [FromQuery] string? mac = null)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return NotFound(new { error = "Device not found" });

        // Validate mac only when the caller supplies it
        if (!string.IsNullOrEmpty(mac) &&
            !string.Equals(d.Mac, mac, StringComparison.OrdinalIgnoreCase))
            return StatusCode(StatusCodes.Status403Forbidden,
                new { error = "MAC address does not match the registered device" });

        if (d.Status != "approved")
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Device not approved" });

        d.LastSeen = DateTime.UtcNow.ToString("o");
        store.Write(db);

        workflowStore.GetAssignments().TryGetValue(deviceId, out var assignedWorkflowId);

        return Ok(new { command = d.Instructions, assignedWorkflowId });
    }

    // ── Workflow delivery ──────────────────────────────────────────────────

    /// <summary>
    /// Returns the full workflow assigned to this device.
    /// The bot should call this after receiving <c>approved</c> status and
    /// whenever it needs to reload its workflow definition.
    /// </summary>
    /// <response code="200">The full workflow object.</response>
    /// <response code="404">No workflow is assigned to this device, or the assigned workflow no longer exists.</response>
    [HttpGet("bot/workflow/{deviceId}")]
    [ProducesResponseType(typeof(Workflow), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult GetWorkflow(string deviceId)
    {
        var assignments = workflowStore.GetAssignments();

        if (!assignments.TryGetValue(deviceId, out var workflowId))
            return NotFound(new { error = "No workflow assigned to this device", deviceId });

        var workflow = workflowStore.GetWorkflows().FirstOrDefault(w => w.Id == workflowId);
        if (workflow is null)
            return NotFound(new { error = "Assigned workflow not found", workflowId });

        return Ok(workflow);
    }
}
