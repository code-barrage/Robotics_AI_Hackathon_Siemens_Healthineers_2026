using System.Collections.Concurrent;
using System.Threading.Channels;

namespace AcuApiGateway.Services;

/// <summary>Metadata of a stored camera frame, same shape as the hosted ACU's CameraFrame.</summary>
public sealed record CameraFrameInfo(
    string Id, DateTimeOffset ReceivedAt, long Bytes, string Url, string Camera, string RobotId, int? Location);

/// <summary>
/// In-memory ring buffer of robot camera JPEGs, keyed by robot and feed route
/// (<c>front</c>, <c>tray-1</c>, <c>tray-2</c>, <c>mark</c>). Frames are lost on restart by design:
/// they are live video, not records.
/// </summary>
public sealed class CameraFrameStore
{
    public const int MaxFrameBytes = 4 * 1024 * 1024;
    public const int RetainedPerFeed = 200;
    public const int MaxFeeds = 64;
    public static readonly TimeSpan FreshFor = TimeSpan.FromSeconds(10);
    public static readonly string[] Routes = ["front", "tray-1", "tray-2", "mark"];

    private sealed record Entry(CameraFrameInfo Info, byte[] Jpeg);

    private readonly ConcurrentDictionary<string, LinkedList<Entry>> feeds = new();
    private readonly ConcurrentDictionary<string, Entry> byId = new();
    private readonly ConcurrentDictionary<Guid, (string Key, Channel<byte[]> Channel)> watchers = new();
    private readonly object gate = new();

    private static string Key(string robotId, string route) => $"{robotId}\n{route}";

    /// <summary>
    /// Maps the robot's camera name (+ tray layer) to the ACU feed route. Any other short slug
    /// (e.g. <c>laptop-2</c>, <c>rear</c>) becomes a custom feed of the same name.
    /// </summary>
    public static string? RouteFor(string? camera, int? location) => camera?.Trim().ToLowerInvariant() switch
    {
        "face" or "front" => "front",
        "tray" => location == 1 ? "tray-2" : "tray-1",
        "tray-1" => "tray-1",
        "tray-2" => "tray-2",
        "mark" => "mark",
        var name when IsFeedName(name) => name,
        _ => null,
    };

    public static bool IsFeedName(string? feed) =>
        feed is { Length: > 0 and <= 32 } && char.IsAsciiLetterOrDigit(feed[0]) &&
        feed.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-');

    /// <summary>Feeds that have received frames for a robot, newest first.</summary>
    public IReadOnlyList<CameraFrameInfo> Feeds(string robotId)
    {
        lock (gate)
            return feeds.Where(kv => kv.Key.StartsWith(robotId + "\n", StringComparison.Ordinal))
                .Select(kv => kv.Value.First?.Value.Info).OfType<CameraFrameInfo>()
                .OrderByDescending(i => i.ReceivedAt).ToList();
    }

    public static string FeedOf(CameraFrameInfo info) => RouteFor(info.Camera, info.Location) ?? info.Camera;

    public CameraFrameInfo Add(string robotId, string camera, int? location, byte[] jpeg)
    {
        var route = RouteFor(camera, location) ?? throw new ArgumentException("Unknown camera.", nameof(camera));
        var now = DateTimeOffset.UtcNow;
        var id = $"{now.UtcTicks:D19}-{Guid.NewGuid():N}.jpg";
        var info = new CameraFrameInfo(id, now, jpeg.Length, $"/api/camera/frames/{id}",
            camera.Trim().ToLowerInvariant(), robotId, location);
        var entry = new Entry(info, jpeg);
        var key = Key(robotId, route);

        lock (gate)
        {
            if (!feeds.ContainsKey(key) && feeds.Count >= MaxFeeds)
                throw new InvalidOperationException($"At most {MaxFeeds} camera feeds are kept.");
            var list = feeds.GetOrAdd(key, _ => new LinkedList<Entry>());
            list.AddFirst(entry);
            byId[id] = entry;
            while (list.Count > RetainedPerFeed)
            {
                byId.TryRemove(list.Last!.Value.Info.Id, out _);
                list.RemoveLast();
            }
        }

        foreach (var (_, watcher) in watchers)
            if (watcher.Key == key) watcher.Channel.Writer.TryWrite(jpeg);
        return info;
    }

    public IReadOnlyList<CameraFrameInfo> List(string robotId, string route, int limit = RetainedPerFeed)
    {
        lock (gate)
            return feeds.TryGetValue(Key(robotId, route), out var list)
                ? list.Take(limit).Select(e => e.Info).ToList()
                : [];
    }

    public IReadOnlyList<CameraFrameInfo> ListAll(int limit)
    {
        lock (gate)
            return feeds.Values.SelectMany(l => l).Select(e => e.Info)
                .OrderByDescending(i => i.ReceivedAt).Take(limit).ToList();
    }

    public (CameraFrameInfo Info, byte[] Jpeg)? Get(string id) =>
        byId.TryGetValue(id, out var e) ? (e.Info, e.Jpeg) : null;

    /// <summary>Newest frame of a feed, or of any feed when <paramref name="route"/> is null.</summary>
    public (CameraFrameInfo Info, byte[] Jpeg)? Latest(string? robotId, string? route)
    {
        lock (gate)
        {
            var candidates = feeds
                .Where(kv => (robotId is null || kv.Key.StartsWith(robotId + "\n", StringComparison.Ordinal)) &&
                             (route is null || kv.Key.EndsWith("\n" + route, StringComparison.Ordinal)))
                .Select(kv => kv.Value.First?.Value)
                .Where(e => e is not null)
                .OrderByDescending(e => e!.Info.ReceivedAt)
                .FirstOrDefault();
            return candidates is null ? null : (candidates.Info, candidates.Jpeg);
        }
    }

    public static bool IsFresh(CameraFrameInfo info) => DateTimeOffset.UtcNow - info.ReceivedAt <= FreshFor;

    /// <summary>Subscribes to new frames of one feed; only the newest unread frame is kept per watcher.</summary>
    public (ChannelReader<byte[]> Reader, IDisposable Subscription) Watch(string robotId, string route)
    {
        var channel = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(1)
        {
            FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true,
        });
        var id = Guid.NewGuid();
        watchers[id] = (Key(robotId, route), channel);
        return (channel.Reader, new Unsubscribe(() =>
        {
            watchers.TryRemove(id, out _);
            channel.Writer.TryComplete();
        }));
    }

    private sealed class Unsubscribe(Action action) : IDisposable
    {
        private int done;
        public void Dispose() { if (Interlocked.Exchange(ref done, 1) == 0) action(); }
    }
}
