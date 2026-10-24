using AcuApiGateway.Models;
using AcuApiGateway.WebSockets;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>Endpoints consumed by the operator UI dashboard.</summary>
[ApiController]
[Route("api")]
[Tags("Acu")]
[Produces("application/json")]
public class AcuController(
    DeviceStore store,
    WorkflowStore workflowStore) : ControllerBase
{
    /// <summary>Health check — used by bots and the UI to detect if the ACU is reachable.</summary>
    [HttpGet("health")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public IActionResult Health() =>
        Ok(new { status = "ok", timestamp = DateTime.UtcNow.ToString("o") });

    /// <summary>Fetch all registered devices, each annotated with its current workflow assignment.</summary>
    [HttpGet("acu/devices")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public IActionResult GetDevices()
    {
        var db          = store.Read();
        var assignments = workflowStore.GetAssignments();  // { deviceId → workflowId }
        var result = db.Values.Select(d =>
        {
            assignments.TryGetValue(d.DeviceId, out var wfId);
            return new
            {
                deviceId           = d.DeviceId,
                name               = d.Name,
                ip                 = d.Ip,
                mac                = d.Mac,
                firmware           = d.Firmware,
                registeredAt       = d.RegisteredAt,
                status             = d.Status,
                lastSeen           = d.LastSeen,
                lastSeenLocation   = d.LastSeenLocation,
                online             = d.Online,
                statusData         = d.StatusData,
                instructions       = d.Instructions,
                recentEvents       = d.RecentEvents,
                assignedWorkflowId = wfId,   // null when no workflow is assigned
                destinations       = d.Destinations, // waypoints received from bot via WebSocket
                paused             = d.Paused,       // escort auto-paused by re-identification
                pauseReason        = d.PauseReason
            };
        });
        return Ok(result);
    }

    /// <summary>Approve a pending device.</summary>
    [HttpPost("acu/accept/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Accept(string deviceId)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return NotFound(new { error = "Device not found" });

        d.Status = "approved";
        store.Write(db);
        return Ok(new { message = "Device approved", deviceId });
    }

    /// <summary>Reject a pending device.</summary>
    [HttpPost("acu/reject/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Reject(string deviceId)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return NotFound(new { error = "Device not found" });

        d.Status = "rejected";
        store.Write(db);
        return Ok(new { message = "Device rejected", deviceId });
    }

    /// <summary>Manually resume an escort that was auto-paused by re-identification.</summary>
    /// <remarks>Used by the operator after they confirm the patient is back with the robot.</remarks>
    [HttpPost("acu/resume/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Resume(string deviceId)
    {
        var updated = store.ModifyDevice(deviceId, d =>
        {
            d.Paused       = false;
            d.PauseReason  = null;
            d.Instructions = "resume";
        });

        if (updated is null)
            return NotFound(new { error = "Device not found" });

        return Ok(new { message = "Escort resumed", deviceId });
    }

    /// <summary>Read the latest telemetry snapshot of a device.</summary>
    [HttpGet("acu/device-status/{deviceId}")]
    [ProducesResponseType(typeof(Dictionary<string, object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult GetStatus(string deviceId)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return NotFound(new { error = "Device not found" });

        if (d.Status != "approved")
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Device not approved" });

        return Ok(d.StatusData);
    }

    /// <summary>Send an instruction to an approved, online robot.</summary>
    [HttpPost("acu/instructions/{deviceId}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(object), StatusCodes.Status503ServiceUnavailable)]
    public IActionResult PostInstructions(string deviceId, [FromBody] InstructionRequest body)
    {
        var db = store.Read();

        if (!db.TryGetValue(deviceId, out var d))
            return NotFound(new { error = "Device not found" });

        if (d.Status != "approved")
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Device not approved" });

        if (!d.Online)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Device is offline" });

        d.Instructions = body.Command;
        store.Write(db);

        // Push to bot immediately if it has an active WebSocket connection.
        // Falls back to the bot's next REST poll if not connected via WS.
        // _ = connectionManager.SendAsync(deviceId, new { type = "instruction", command = body.Command });

        return Ok(new { message = "Instructions saved" });
    }
}
