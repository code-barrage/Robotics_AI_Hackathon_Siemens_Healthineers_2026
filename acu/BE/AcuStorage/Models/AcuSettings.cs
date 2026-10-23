using System.Text.Json.Serialization;

namespace Acu.Storage.Models;

/// <summary>ACU-wide settings that are pushed to every robot.</summary>
public class AcuSettings
{
    /// <summary>Default robot speech language when none has been chosen.</summary>
    public const string DefaultSpeechLanguage = "de-DE";

    /// <summary>BCP-47 language tag (e.g. <c>de-DE</c>, <c>en-US</c>, <c>hi-IN</c>) the robot uses to speak step TTS text.</summary>
    [JsonPropertyName("speechLanguage")]
    public string SpeechLanguage { get; set; } = DefaultSpeechLanguage;
}
