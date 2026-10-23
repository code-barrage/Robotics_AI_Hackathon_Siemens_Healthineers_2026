using System.Text.Json.Serialization;

namespace Acu.Storage.Models;

/// <summary>
/// A localized string supporting multiple language variants.
/// </summary>
public class LocalizedString
{
    [JsonPropertyName("en")]
    public string En { get; set; } = "";

    [JsonPropertyName("de")]
    public string? De { get; set; }
}

/// <summary>
/// Data-entry block: the ordered lists of destination names used by
/// the {{destinations[0]}}, {{destinations[1]}}, … template references in steps.
/// </summary>
public class WorkflowDataEntry
{
    [JsonPropertyName("destination_categories")]
    public List<string> DestinationCategories { get; set; } = new();

    [JsonPropertyName("destination_names")]
    public List<string> DestinationNames { get; set; } = new();
}

/// <summary>
/// Polymorphic base class for all workflow step types.
/// The JSON "type" field is used as the discriminator.
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(ConfirmationStep),  "confirmation")]
[JsonDerivedType(typeof(FollowMeStep),      "follow_me")]
[JsonDerivedType(typeof(VideoPlaybackStep), "video_playback")]
[JsonDerivedType(typeof(FinishedStep),      "finished")]
public abstract class WorkflowStep { }

/// <summary>A confirmation / information screen shown to the patient.</summary>
public class ConfirmationStep : WorkflowStep
{
    [JsonPropertyName("title")]
    public LocalizedString? Title { get; set; }

    [JsonPropertyName("text")]
    public LocalizedString? Text { get; set; }

    [JsonPropertyName("button_text")]
    public LocalizedString? ButtonText { get; set; }

    /// <summary>TTS mode: repeat_infinite | single | null (no TTS)</summary>
    [JsonPropertyName("tts")]
    public string? Tts { get; set; }

    [JsonPropertyName("status_event")]
    public string? StatusEvent { get; set; }

    /// <summary>When true the patient can navigate back to the previous step.</summary>
    [JsonPropertyName("can_go_back")]
    public bool? CanGoBack { get; set; }
}

/// <summary>A navigation step that guides the patient to a destination.</summary>
public class FollowMeStep : WorkflowStep
{
    [JsonPropertyName("title")]
    public LocalizedString? Title { get; set; }

    [JsonPropertyName("subtitle")]
    public LocalizedString? Subtitle { get; set; }

    /// <summary>
    /// Target destination, e.g. "{{destinations[0]}}" (resolved from
    /// <see cref="WorkflowDataEntry.DestinationNames"/> at runtime) or a literal name.
    /// </summary>
    [JsonPropertyName("destination")]
    public string? Destination { get; set; }

    /// <summary>How long (ms) the robot waits at the destination before continuing. 0 = wait for next trigger.</summary>
    [JsonPropertyName("duration_ms")]
    public int DurationMs { get; set; }
}

/// <summary>A video playback step.</summary>
public class VideoPlaybackStep : WorkflowStep
{
    [JsonPropertyName("video")]
    public string Video { get; set; } = "";
}

/// <summary>Terminal step that marks the end of the workflow.</summary>
public class FinishedStep : WorkflowStep
{
    [JsonPropertyName("status_event")]
    public string? StatusEvent { get; set; }
}

/// <summary>
/// A workflow definition: ordered steps with data-entry destination metadata.
/// </summary>
public class Workflow
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";

    [JsonPropertyName("data_entry")]
    public WorkflowDataEntry DataEntry { get; set; } = new();

    [JsonPropertyName("steps")]
    public List<WorkflowStep> Steps { get; set; } = new();

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = "";

    [JsonPropertyName("updatedAt")]
    public string UpdatedAt { get; set; } = "";
}

/// <summary>
/// Root document persisted to disk: all workflows plus device→workflow assignments.
/// </summary>
public class WorkflowData
{
    [JsonPropertyName("workflows")]
    public List<Workflow> Workflows { get; set; } = new();

    /// <summary>Maps a deviceId to the id of the workflow assigned to it.</summary>
    [JsonPropertyName("assignments")]
    public Dictionary<string, string> Assignments { get; set; } = new();
}
