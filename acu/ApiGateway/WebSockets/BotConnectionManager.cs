using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AcuApiGateway.WebSockets;

/// <summary>
/// Singleton registry of all currently open bot WebSocket connections.
/// Any server-side component (controller, background task) can inject this
/// service and push a JSON message to a specific bot without polling.
/// </summary>
public class BotConnectionManager
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented               = false
    };

    // deviceId → open WebSocket
    private readonly ConcurrentDictionary<string, WebSocket> _sockets = new();

    // ── Registration ───────────────────────────────────────────────────────

    /// <summary>Register a freshly accepted WebSocket for <paramref name="deviceId"/>.</summary>
    public void Register(string deviceId, WebSocket ws) =>
        _sockets[deviceId] = ws;

    /// <summary>Remove a device's socket entry on disconnect.</summary>
    public void Unregister(string deviceId) =>
        _sockets.TryRemove(deviceId, out _);

    /// <summary>Whether <paramref name="deviceId"/> currently has an open WebSocket.</summary>
    public bool IsConnected(string deviceId) =>
        _sockets.TryGetValue(deviceId, out var ws) && ws.State == WebSocketState.Open;

    // ── Push ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Pushes the assigned workflow to the bot via WebSocket using a standard
    /// <c>workflow_assigned</c> message. No-op if the workflow is null or the
    /// device is not connected.
    /// </summary>
    public async Task SendWorkflowAsync(string deviceId, Acu.Storage.Models.Workflow? workflow, CancellationToken ct = default)
    {
        if (workflow is null) return;

        await SendAsync(deviceId, new
        {
            type       = "workflow_assigned",
            workflowId = workflow.Id,
            workflow
        }, ct);
    }

    /// <summary>
    /// Notifies the bot that its workflow assignment was removed.
    /// </summary>
    public async Task ClearWorkflowAsync(string deviceId, CancellationToken ct = default)
    {
        await SendAsync(deviceId, new { type = "workflow_cleared" }, ct);
    }

    /// <summary>
    /// Serialise <paramref name="message"/> as JSON and send it to the bot.
    /// Fire-and-forget safe: no-op if the device is not connected or the socket
    /// is no longer open.
    /// </summary>
    public async Task SendAsync(string deviceId, object message, CancellationToken ct = default)
    {
        if (!_sockets.TryGetValue(deviceId, out var ws) || ws.State != WebSocketState.Open)
            return;

        try
        {
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message, JsonOpts));
            await ws.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                endOfMessage: true,
                ct);
        }
        catch (WebSocketException)          { /* socket dropped between check and send */ }
        catch (OperationCanceledException)  { /* server shutting down                 */ }
    }
}
