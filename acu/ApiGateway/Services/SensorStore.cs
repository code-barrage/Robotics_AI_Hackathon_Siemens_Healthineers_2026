using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;

namespace AcuApiGateway.Services;

/// <summary>One sensor reading as stored: arbitrary JSON from the robot, stamped by the ACU.</summary>
public sealed record SensorReading(string RobotId, string Kind, long Seq, DateTimeOffset ReceivedAt, JsonElement Data);

/// <summary>Summary of one sensor stream of a robot.</summary>
public sealed record SensorInfo(string Kind, long Count, DateTimeOffset LastAt, bool Fresh, long LastBytes);

/// <summary>
/// In-memory store for any robot sensor stream (tray depth, scans, IMU, custom app data...).
/// Each (robot, kind) keeps a short history; readings are live data and are lost on restart.
/// </summary>
public sealed class SensorStore
{
    public const int MaxReadingBytes = 1024 * 1024;
    public const int RetainedPerKind = 100;
    public const int MaxStreams = 128;
    public static readonly TimeSpan FreshFor = TimeSpan.FromSeconds(10);

    private sealed class Stream
    {
        public readonly LinkedList<SensorReading> History = new();
        public long Count;
        public long LastBytes;
    }

    private readonly Dictionary<string, Stream> streams = new();
    private readonly ConcurrentDictionary<Guid, (string Robot, string? Kind, Channel<SensorReading> Channel)> watchers = new();
    private readonly object gate = new();

    private static string Key(string robotId, string kind) => $"{robotId}\n{kind}";

    /// <summary>Same slug rule as custom camera feeds: a-z, 0-9 and '-', max 32 characters.</summary>
    public static bool IsKind(string? kind) => CameraFrameStore.IsFeedName(kind);

    public SensorReading Add(string robotId, string kind, JsonElement data, long bytes)
    {
        SensorReading reading;
        lock (gate)
        {
            var key = Key(robotId, kind);
            if (!streams.TryGetValue(key, out var stream))
            {
                if (streams.Count >= MaxStreams)
                    throw new InvalidOperationException($"At most {MaxStreams} sensor streams are kept.");
                streams[key] = stream = new Stream();
            }
            reading = new SensorReading(robotId, kind, ++stream.Count, DateTimeOffset.UtcNow, data.Clone());
            stream.LastBytes = bytes;
            stream.History.AddFirst(reading);
            while (stream.History.Count > RetainedPerKind) stream.History.RemoveLast();
        }

        foreach (var (_, w) in watchers)
            if (w.Robot == robotId && (w.Kind is null || w.Kind == kind))
                w.Channel.Writer.TryWrite(reading);
        return reading;
    }

    public IReadOnlyList<SensorInfo> List(string robotId)
    {
        lock (gate)
            return streams.Where(kv => kv.Key.StartsWith(robotId + "\n", StringComparison.Ordinal))
                .Select(kv =>
                {
                    var last = kv.Value.History.First!.Value;
                    return new SensorInfo(last.Kind, kv.Value.Count, last.ReceivedAt, IsFresh(last), kv.Value.LastBytes);
                })
                .OrderBy(i => i.Kind, StringComparer.Ordinal).ToList();
    }

    public SensorReading? Latest(string robotId, string kind)
    {
        lock (gate)
            return streams.TryGetValue(Key(robotId, kind), out var s) ? s.History.First?.Value : null;
    }

    public IReadOnlyList<SensorReading> History(string robotId, string kind, int limit)
    {
        lock (gate)
            return streams.TryGetValue(Key(robotId, kind), out var s) ? s.History.Take(limit).ToList() : [];
    }

    public static bool IsFresh(SensorReading r) => DateTimeOffset.UtcNow - r.ReceivedAt <= FreshFor;

    /// <summary>Subscribes to new readings of a robot (one kind, or all when <paramref name="kind"/> is null).</summary>
    public (ChannelReader<SensorReading> Reader, IDisposable Subscription) Watch(string robotId, string? kind)
    {
        var channel = Channel.CreateBounded<SensorReading>(new BoundedChannelOptions(32)
        {
            FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true,
        });
        var id = Guid.NewGuid();
        watchers[id] = (robotId, kind, channel);
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
