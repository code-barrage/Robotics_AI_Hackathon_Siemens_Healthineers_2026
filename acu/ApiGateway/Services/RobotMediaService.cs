namespace AcuApiGateway.Services;

/// <summary>Separate file storage for uploaded PWA workflow media.</summary>
public sealed class RobotMediaService(IConfiguration configuration)
{
    public const long MaximumFileSize = 250 * 1024 * 1024;
    private readonly string root = Path.GetFullPath(configuration.GetValue<string>("RobotMediaDataPath")
        ?? "/data/robot-media");
    private static readonly Dictionary<string, (string Kind, string ContentType)> Formats = new(StringComparer.OrdinalIgnoreCase)
    {
        [".mp4"] = ("Video", "video/mp4"), [".webm"] = ("Video", "video/webm"),
        [".mp3"] = ("Audio", "audio/mpeg"), [".wav"] = ("Audio", "audio/wav"),
        [".m4a"] = ("Audio", "audio/mp4"), [".ogg"] = ("Audio", "audio/ogg"),
        [".png"] = ("Image", "image/png"), [".jpg"] = ("Image", "image/jpeg"),
        [".jpeg"] = ("Image", "image/jpeg"), [".webp"] = ("Image", "image/webp"),
    };

    /// <summary>Store a file under a server-generated name, never a caller-provided filesystem path.</summary>
    public async Task<string> Upload(string kind, IFormFile file, CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!Formats.TryGetValue(extension, out var format) || format.Kind != kind)
            throw new RobotWorkflowException(400, "Unsupported media format for this media type.");
        if (file.Length <= 0 || file.Length > MaximumFileSize)
            throw new RobotWorkflowException(400, "Media must be non-empty and no larger than 250 MB.");
        Directory.CreateDirectory(root);
        var name = Guid.NewGuid().ToString("N") + extension;
        var path = Path.Combine(root, name);
        try
        {
            await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                81920, FileOptions.Asynchronous);
            await file.CopyToAsync(stream, cancellationToken);
        }
        catch
        {
            File.Delete(path);
            throw;
        }
        return name;
    }

    /// <summary>Resolve only server-generated media names for streaming and range requests.</summary>
    public (string Path, string ContentType) Get(string name)
    {
        var extension = Path.GetExtension(name);
        if (!Guid.TryParseExact(Path.GetFileNameWithoutExtension(name), "N", out _) ||
            name != Path.GetFileName(name) || !Formats.TryGetValue(extension, out var format))
            throw new RobotWorkflowException(404, "Media not found.");
        var path = Path.Combine(root, name);
        if (!File.Exists(path)) throw new RobotWorkflowException(404, "Media not found.");
        return (path, format.ContentType);
    }
}
