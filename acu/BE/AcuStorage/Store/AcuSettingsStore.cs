using System.Text.Json;
using Acu.Storage.Models;
using Microsoft.Extensions.Configuration;

namespace Acu.Storage.Store;

/// <summary>
/// Thread-safe, file-backed store for ACU-wide settings.
/// Path: <c>AcuSettingsDataPath</c> in configuration (default /data/acu-settings.json).
/// </summary>
public class AcuSettingsStore(IConfiguration configuration)
{
    private static readonly JsonSerializerOptions myJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented               = true,
    };

    private readonly string myStoragePath =
        configuration.GetValue<string>("AcuSettingsDataPath") ?? "/data/acu-settings.json";
    private readonly object myLock = new();

    /// <summary>Current settings; defaults when the file does not exist yet.</summary>
    public AcuSettings Get()
    {
        lock (myLock)
        {
            return File.Exists(myStoragePath)
                ? JsonSerializer.Deserialize<AcuSettings>(File.ReadAllText(myStoragePath), myJsonOptions) ?? new AcuSettings()
                : new AcuSettings();
        }
    }

    /// <summary>Replace the stored settings atomically.</summary>
    public void Save(AcuSettings settings)
    {
        lock (myLock)
        {
            var directory = Path.GetDirectoryName(myStoragePath);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);
            var temporaryPath = myStoragePath + ".tmp";
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(settings, myJsonOptions));
            File.Move(temporaryPath, myStoragePath, overwrite: true);
        }
    }
}
