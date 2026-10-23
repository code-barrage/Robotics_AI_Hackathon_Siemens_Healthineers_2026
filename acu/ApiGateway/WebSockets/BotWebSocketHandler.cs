using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.Extensions.Logging;

namespace AcuApiGateway.WebSockets;

/*
 * ── WebSocket message protocol ──────────────────────────────────────────────
 *
 * Bot → Server (inbound)
 * ────────────────────────────────────────────────────────────────────────────
 * Heartbeat (sent every ~5 s by the Android app):
 *   { "type": "heartbeat", "mac": "AA:BB:CC:DD:EE:FF",
 *     "event": "patient_walking", "battery": 85, "ip": "192.168.1.42" }
 *
 * Ping (keep-alive probe):
 *   { "type": "ping" }
 *
 * Server → Bot (outbound)
 * ────────────────────────────────────────────────────────────────────────────
 * On successful connect:
 *   { "type": "connected", "deviceId": "…", "status": "approved",
 *     "assignedWorkflowId": "…" | null }
 *
 * Heartbeat acknowledgement:
 *   { "type": "heartbeat_ack", "status": "approved",
 *     "assignedWorkflowId": "…" | null, "serverTime": "ISO8601" }
 *
 * Pong:
 *   { "type": "pong" }
 *
 * Operator pushed an instruction (via POST /api/acu/instructions/{deviceId}):
 *   { "type": "instruction", "command": "pause" }
 *
 * Operator changed the workflow assignment:
 *   { "type": "workflow_assigned", "workflowId": "…" }
 *
 * Operator cleared the workflow assignment:
 *   { "type": "workflow_cleared" }
 *
 * Error (sent before closing if auth fails on connect):
 *   { "type": "error", "message": "Device not approved" }
 */

/// <summary>
/// Handles the full lifecycle of a single bot WebSocket session:
/// connect → auth → receive loop → graceful disconnect.
/// Shares all business logic with the REST heartbeat endpoint
/// (<c>POST /api/bot/device-status/{deviceId}</c>) so both transports
/// produce identical device state changes.
/// </summary>
public class BotWebSocketHandler(
    DeviceStore          deviceStore,
    WorkflowStore        workflowStore,
    BotConnectionManager connectionManager,
    ILogger<BotWebSocketHandler> logger)
{
    private static readonly JsonSerializerOptions ParseOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    // ── Entry point ────────────────────────────────────────────────────────

    public async Task HandleAsync(string deviceId, WebSocket ws, CancellationToken ct)
    {
        var device = await AuthenticateAsync(deviceId, ws, ct);
        if (device is null) return;

        connectionManager.Register(deviceId, ws);

        await SendConnectedHandshakeAsync(deviceId, device, ct);

        await ReceiveLoopAsync(deviceId, ws, ct);

        UnregisterWebSocket(deviceId);

        await CloseIfOpenAsync(ws);
    }

    // ── Auth: device must exist and be approved ─────────────────────────────

    /// <summary>
    /// Validates the connecting device exists and is approved. Sends an
    /// <c>error</c> message and closes the socket (via <see cref="SendErrorAndCloseAsync"/>)
    /// if either check fails. Returns <c>null</c> on failure, or the device on success.
    /// </summary>
    private async Task<Device?> AuthenticateAsync(string deviceId, WebSocket ws, CancellationToken ct)
    {
        var db = deviceStore.Read();
        if (!db.TryGetValue(deviceId, out var device))
        {
            await SendErrorAndCloseAsync(ws, "Device not found", ct);
            return null;
        }
        if (device.Status != "approved")
        {
            await SendErrorAndCloseAsync(ws, $"Device not approved (status: {device.Status})", ct);
            return null;
        }
        return device;
    }

    // ── Handshake ────────────────────────────────────────────────────────────

    /// <summary>
    /// Sends the initial <c>connected</c> greeting, and immediately pushes the bot's
    /// assigned workflow (if one exists) using the unified <see cref="BotConnectionManager.SendWorkflowToBotAsync"/>
    /// helper so the bot receives workflow data through a single standard message format.
    /// </summary>
    private async Task SendConnectedHandshakeAsync(string deviceId, Device device, CancellationToken ct)
    {
        workflowStore.GetAssignments().TryGetValue(deviceId, out var assignedWorkflowId);
        var assignedWorkflow = assignedWorkflowId != null
            ? workflowStore.GetWorkflows().FirstOrDefault(w => w.Id == assignedWorkflowId)
            : null;

        await connectionManager.SendAsync(deviceId, new
        {
            type               = "connected",
            deviceId,
            status             = device.Status,
            assignedWorkflowId,
            workflow           = assignedWorkflow
        }, ct);

        if (assignedWorkflow is not null)
        {
            await connectionManager.SendWorkflowAsync(deviceId, assignedWorkflow, ct);
        }
    }

    // ── Receive loop ─────────────────────────────────────────────────────────

    /// <summary>
    /// Reads raw WebSocket frames until the socket closes or cancellation is
    /// requested, reassembling fragmented sends into complete text messages
    /// (split on <see cref="WebSocketReceiveResult.EndOfMessage"/>) and handing
    /// each one to <see cref="DispatchAsync"/>.
    /// </summary>
    private async Task ReceiveLoopAsync(string deviceId, WebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[8192];
        try
        {
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                // Accumulate frames until EndOfMessage (handles fragmented sends)
                using var msgStream = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await ws.ReceiveAsync(buffer, ct);

                    if (result.MessageType == WebSocketMessageType.Close)
                        return;

                    msgStream.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                var json = Encoding.UTF8.GetString(msgStream.ToArray());
                await DispatchAsync(deviceId, json, ct);
            }
        }
        catch (OperationCanceledException) { /* server shutting down */ }
        catch (WebSocketException)          { /* client disconnected  */ }
    }

    // ── Unregister WebSocket ──────────────────────────────────────────────────

    /// <summary>
    /// Unregisters the socket from the in-memory connection manager on disconnect.
    /// </summary>
    private void UnregisterWebSocket(string deviceId)
    {
        connectionManager.Unregister(deviceId);
    }

    /// <summary>Sends a normal-closure WebSocket close handshake if the socket is still open.</summary>
    private static async Task CloseIfOpenAsync(WebSocket ws)
    {
        if (ws.State == WebSocketState.Open)
        {
            await ws.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "Goodbye",
                CancellationToken.None);
        }
    }

    // ── Message router ─────────────────────────────────────────────────────
 private async Task DispatchAsync(string deviceId, string json, CancellationToken ct)
{
    Dictionary<string, JsonElement>? msg;
    try
    {
        msg = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, ParseOpts);
    }
    catch { return; } 

    if (msg is null || !msg.TryGetValue("type", out var typeEl)) return;

    if (typeEl.ValueEquals("destinations"))
    {
        await HandleDestinationsAsync(deviceId, msg, ct);
    }
}

    // ── Destinations handler ───────────────────────────────────────────────

    /// <summary>
    /// Reacts to an inbound <c>destinations</c> message: validates the payload,
    /// parses it into <see cref="Destination"/> entries, stores it against the
    /// device, logs it, and acks (or errors) back to the bot.
    /// </summary>
    private async Task HandleDestinationsAsync(
        string deviceId,
        Dictionary<string, JsonElement> body,
        CancellationToken ct)
    {
        if (!TryParseDestinations(body, out var parsed, out var validationError))
        {
            await connectionManager.SendAsync(deviceId,
                new { type = "error", message = validationError }, ct);
            return;
        }

        StoreDestinations(deviceId, parsed);

        LogDestinations(deviceId, parsed);

        await SendDestinationsAckAsync(deviceId, parsed.Count, ct);
    }

    /// <summary>
    /// Validates that <paramref name="body"/> contains a <c>destinations</c> JSON
    /// array and parses it into <see cref="Destination"/> entries. Entries with a
    /// blank <c>name</c> are skipped — that is the only validation rule; <c>type</c>
    /// is free-form, passed through verbatim from Pudu.
    /// </summary>
    private static bool TryParseDestinations(
        Dictionary<string, JsonElement> body,
        out List<Destination> parsed,
        out string? validationError)
    {
        parsed = new List<Destination>();
        validationError = null;

        if (!body.TryGetValue("destinations", out var destEl) ||
            destEl.ValueKind != JsonValueKind.Array)
        {
            validationError = "'destinations' must be a JSON array";
            return false;
        }

        foreach (var item in destEl.EnumerateArray())
        {
            var name = item.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
            var type = item.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
            double? x = item.TryGetProperty("x", out var xEl) && xEl.ValueKind == JsonValueKind.Number
                            ? xEl.GetDouble() : null;
            double? y = item.TryGetProperty("y", out var yEl) && yEl.ValueKind == JsonValueKind.Number
                            ? yEl.GetDouble() : null;
            double? z = item.TryGetProperty("z", out var zEl) && zEl.ValueKind == JsonValueKind.Number
                            ? zEl.GetDouble() : null;

            if (string.IsNullOrWhiteSpace(name)) continue;

            parsed.Add(new Destination { Name = name, Type = type, X = x, Y = y, Z = z });
        }

        return true;
    }

    /// <summary>Stores the parsed destination list against the device.</summary>
    private void StoreDestinations(string deviceId, List<Destination> parsed) =>
        deviceStore.ModifyDevice(deviceId, d => d.Destinations = parsed);

    /// <summary>Logs the received destination list to the terminal for diagnostics.</summary>
    private void LogDestinations(string deviceId, List<Destination> parsed)
    {
        var lines = string.Join("\n", parsed.Select(d =>
            $"  [{d.Type}] {d.Name}" +
            (d.X.HasValue ? $"  (x={d.X:F2}, y={d.Y:F2}, z={d.Z:F2})" : "")));

        logger.LogInformation(
            "[WS ← {DeviceId}] destinations received ({Count}):\n{List}",
            deviceId, parsed.Count, lines);
    }

    /// <summary>Acknowledges a successfully stored destination list back to the bot.</summary>
    private async Task SendDestinationsAckAsync(string deviceId, int storedCount, CancellationToken ct) =>
        await connectionManager.SendAsync(deviceId,
            new { type = "destinations_ack", stored = storedCount }, ct);

    // ── Helpers ────────────────────────────────────────────────────────────
    private static async Task SendErrorAndCloseAsync(WebSocket ws, string message, CancellationToken ct)
    {
        if (ws.State != WebSocketState.Open) return;
        try
        {
            var payload = Encoding.UTF8.GetBytes(
                JsonSerializer.Serialize(new { type = "error", message }));
            await ws.SendAsync(payload, WebSocketMessageType.Text, true, ct);
            await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, message, ct);
        }
        catch (WebSocketException) { }
    }
}
