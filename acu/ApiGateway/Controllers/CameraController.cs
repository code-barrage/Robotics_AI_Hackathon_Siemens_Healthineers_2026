using System.Text;
using AcuApiGateway.Services;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>
/// Robot camera frames. Same routes as the hosted ACU so the robot app and dashboards work against both.
/// Robots POST raw JPEG bytes; operators read the latest frame, history, or a multipart MJPEG stream.
/// </summary>
[ApiController]
[Route("api")]
[Tags("Camera")]
public class CameraController(CameraFrameStore store) : ControllerBase
{
    private const string Boundary = "frame";

    /// <summary>Upload one JPEG frame (raw image/jpeg body). camera = face | tray | mark; location = tray layer (0/1).</summary>
    [HttpPost("camera/frames")]
    [RequestSizeLimit(CameraFrameStore.MaxFrameBytes + 1024)]
    [ProducesResponseType(typeof(CameraFrameInfo), 201)]
    [ProducesResponseType(typeof(ProblemDetails), 400)]
    public async Task<IActionResult> Upload([FromQuery] string camera, [FromQuery] string robotId,
        [FromQuery] int? location, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(robotId)) return Problem("robotId is required.", statusCode: 400);
        if (CameraFrameStore.RouteFor(camera, location) is null)
            return Problem("camera must be face, tray, mark, or a custom feed slug (a-z, 0-9, '-', max 32).", statusCode: 400);

        using var buffer = new MemoryStream();
        await Request.Body.CopyToAsync(buffer, ct);
        var jpeg = buffer.ToArray();
        if (jpeg.Length < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8)
            return Problem("Body must be a JPEG image.", statusCode: 400);

        try
        {
            var info = store.Add(robotId.Trim(), camera, location, jpeg);
            return Created(info.Url, info);
        }
        catch (InvalidOperationException e)
        {
            return Problem(e.Message, statusCode: 429);
        }
    }

    /// <summary>Camera feeds that have frames for a robot (built-in and custom), with their newest frame.</summary>
    [HttpGet("acu/robots/{robotId}/cameras")]
    public IEnumerable<object> Feeds(string robotId) =>
        store.Feeds(robotId).Select(i => new
        {
            feed = CameraFrameStore.FeedOf(i), latest = i, fresh = CameraFrameStore.IsFresh(i),
            stream = $"/api/acu/robots/{Uri.EscapeDataString(robotId)}/cameras/{CameraFrameStore.FeedOf(i)}/stream",
        });

    [HttpGet("camera/frames")]
    public IReadOnlyList<CameraFrameInfo> ListAll([FromQuery] int limit = 50) =>
        store.ListAll(Math.Clamp(limit, 1, 1000));

    [HttpGet("camera/frames/{id}")]
    public IActionResult GetFrame(string id) =>
        store.Get(id) is { } f ? File(f.Jpeg, "image/jpeg") : NotFound();

    [HttpGet("camera/latest")]
    public IActionResult LatestAny() => LatestResult(store.Latest(null, null));

    [HttpGet("acu/robots/{robotId}/cameras/{feed}/latest")]
    public IActionResult Latest(string robotId, string feed) =>
        IsFeed(feed) ? LatestResult(store.Latest(robotId, feed)) : NotFound();

    [HttpGet("acu/robots/{robotId}/cameras/{feed}/frames")]
    public IActionResult Frames(string robotId, string feed, [FromQuery] int limit = 50) =>
        IsFeed(feed) ? Ok(store.List(robotId, feed, Math.Clamp(limit, 1, CameraFrameStore.RetainedPerFeed))) : NotFound();

    [HttpGet("acu/robots/{robotId}/cameras/{feed}/frames/{id}")]
    public IActionResult FeedFrame(string robotId, string feed, string id) =>
        store.Get(id) is { } f && f.Info.RobotId == robotId ? File(f.Jpeg, "image/jpeg") : NotFound();

    /// <summary>Live multipart MJPEG stream; open directly in an &lt;img&gt; tag.</summary>
    [HttpGet("acu/robots/{robotId}/cameras/{feed}/stream")]
    public async Task Stream(string robotId, string feed, CancellationToken ct)
    {
        if (!IsFeed(feed)) { Response.StatusCode = 404; return; }

        Response.ContentType = $"multipart/x-mixed-replace; boundary={Boundary}";
        Response.Headers.CacheControl = "no-store";
        var (reader, subscription) = store.Watch(robotId, feed);
        using (subscription)
        {
            try
            {
                if (store.Latest(robotId, feed) is { } first && CameraFrameStore.IsFresh(first.Info))
                    await WritePart(first.Jpeg, ct);
                await foreach (var jpeg in reader.ReadAllAsync(ct))
                    await WritePart(jpeg, ct);
            }
            catch (OperationCanceledException) { }
        }
    }

    private async Task WritePart(byte[] jpeg, CancellationToken ct)
    {
        var header = Encoding.ASCII.GetBytes(
            $"--{Boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: {jpeg.Length}\r\n\r\n");
        await Response.Body.WriteAsync(header, ct);
        await Response.Body.WriteAsync(jpeg, ct);
        await Response.Body.WriteAsync("\r\n"u8.ToArray(), ct);
        await Response.Body.FlushAsync(ct);
    }

    private static bool IsFeed(string feed) => CameraFrameStore.IsFeedName(feed);

    private IActionResult LatestResult((CameraFrameInfo Info, byte[] Jpeg)? frame)
    {
        if (frame is not { } f || !CameraFrameStore.IsFresh(f.Info))
            return Problem("No camera frame received in the last 10 seconds.", statusCode: 503);
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Frame-Received-At"] = f.Info.ReceivedAt.ToString("O");
        return File(f.Jpeg, "image/jpeg");
    }
}
