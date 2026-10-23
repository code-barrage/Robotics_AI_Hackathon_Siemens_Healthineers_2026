using Acu.Storage.Models;

namespace AcuApiGateway.Models;

/// <summary>The Device definition from device.schema.json, without operator-only fields.</summary>
public sealed record RobotDeviceResponse(
    string DeviceId, string Name, string Ip, string Mac, string Firmware,
    string RegisteredAt, string Status, string LastSeen, bool Online,
    Dictionary<string, object> StatusData, List<Destination> Destinations)
{
    /// <summary>Project a stored device into the PWA contract.</summary>
    public static RobotDeviceResponse FromDevice(Device device, string speechLanguage)
    {
        var statusData = device.StatusData is null
            ? new Dictionary<string, object>()
            : new Dictionary<string, object>(device.StatusData);
        statusData["speechLanguage"] = speechLanguage;
        return new(device.DeviceId, device.Name, device.Ip, device.Mac, device.Firmware,
            device.RegisteredAt, device.Status, device.LastSeen, device.Online,
            statusData, device.Destinations);
    }
}
