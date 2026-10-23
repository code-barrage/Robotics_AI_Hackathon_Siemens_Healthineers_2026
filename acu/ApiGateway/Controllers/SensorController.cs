using System.Text.Json;
using AcuApiGateway.Services;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>
/// Generic robot sensor API (local ACU extension). The robot app POSTs any JSON reading under a
/// sensor kind (e.g. <c>tray-depth-0</c>, <c>scan</c>, <c>imu</c>); operators read the latest value,
/// a short history, or a live Server-Sent Events stream.
/// </summary>
[ApiController]
[Route("api")]
[Tags("Sensors")]
public class SensorController(SensorStore store) : ControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Publish one reading. Body: any JSON value (max 1 MB). kind: a-z, 0-9, '-', max 32.</summary>
    [HttpPost("bot/{deviceId}/sensors/{kind}")]
    [RequestSizeLimit(SensorStore.MaxReadingBytes + 1024)]
    [ProducesResponseType(typeof(SensorReading), 201)]
    [ProducesResponseType(typeof(ProblemDetails), 400)]
    public async Task<IActionResult> Publish(string deviceId, string kind, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) return Problem("deviceId is required.", statusCode: 400);
        if (!SensorStore.IsKind(kind)) return Problem("kind must be a-z, 0-9 and '-', max 32 characters.", statusCode: 400);

        using var buffer = new MemoryStream();
        await Request.Body.CopyToAsync(buffer, ct);
        if (buffer.Length == 0 || buffer.Length > SensorStore.MaxReadingBytes)
            return Problem("Body must be a JSON value of at most 1 MB.", statusCode: 400);

        JsonDocument doc;
        try { doc = JsonDocument.Parse(buffer.ToArray()); }
        catch (JsonException) { return Problem("Body must be valid JSON.", statusCode: 400); }

        using (doc)
        {
            try
            {
                var reading = store.Add(deviceId.Trim(), kind, doc.RootElement, buffer.Length);
                return Created($"/api/acu/robots/{Uri.EscapeDataString(reading.RobotId)}/sensors/{kind}/latest", reading);
            }
            catch (InvalidOperationException e)
            {
                return Problem(e.Message, statusCode: 429);
            }
        }
    }

    /// <summary>Sensor streams that have readings for a robot.</summary>
    [HttpGet("acu/robots/{robotId}/sensors")]
    public IReadOnlyList<SensorInfo> List(string robotId) => store.List(robotId);

    /// <summary>Newest reading of one sensor (any age; check <c>receivedAt</c>).</summary>
    [HttpGet("acu/robots/{robotId}/sensors/{kind}/latest")]
    public IActionResult Latest(string robotId, string kind)
    {
        if (store.Latest(robotId, kind) is not { } r) return NotFound();
        Response.Headers.CacheControl = "no-store";
        return Ok(r);
    }

    [HttpGet("acu/robots/{robotId}/sensors/{kind}/history")]
    public IReadOnlyList<SensorReading> History(string robotId, string kind, [FromQuery] int limit = 20) =>
        store.History(robotId, kind, Math.Clamp(limit, 1, SensorStore.RetainedPerKind));

    /// <summary>Live Server-Sent Events of every sensor of a robot (or only <c>?kind=</c>). Use EventSource.</summary>
    [HttpGet("acu/robots/{robotId}/sensors/stream")]
    public Task StreamAll(string robotId, [FromQuery] string? kind, CancellationToken ct) => Sse(robotId, kind, ct);

    [HttpGet("acu/robots/{robotId}/sensors/{kind}/stream")]
    public Task StreamKind(string robotId, string kind, CancellationToken ct) => Sse(robotId, kind, ct);

    private async Task Sse(string robotId, string? kind, CancellationToken ct)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-store";
        var (reader, subscription) = store.Watch(robotId, string.IsNullOrWhiteSpace(kind) ? null : kind);
        using (subscription)
        {
            try
            {
                await Response.WriteAsync(": connected\n\n", ct);
                await Response.Body.FlushAsync(ct);
                await foreach (var r in reader.ReadAllAsync(ct))
                {
                    await Response.WriteAsync($"event: {r.Kind}\ndata: {JsonSerializer.Serialize(r, Json)}\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
            }
            catch (OperationCanceledException) { }
        }
    }
}
