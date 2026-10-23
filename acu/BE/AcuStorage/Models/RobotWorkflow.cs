using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Acu.Storage.Models;
// Mirrors BE/AcuStorage/Store/Schemas/workflow.schema.json

/// <summary>Document persisted to disk: <c>{ "Workflows": [ ... ] }</c>.</summary>
public class RobotWorkflowData
{
    [JsonPropertyName("Workflows")]
    public List<RobotWorkflow> Workflows { get; set; } = new();
}

public class RobotWorkflow
{
    [JsonPropertyName("WorkflowID")]
    [Required] public string WorkflowID { get; set; } = "";
    [JsonPropertyName("WorkflowName")]
    [Required] public string WorkflowName { get; set; } = "";
    [JsonPropertyName("Description")]
    public string Description { get; set; } = "";
    [JsonPropertyName("RobotId")]
    [Required] public string RobotId { get; set; } = "";
    [JsonPropertyName("Steps")]
    [Required, MinLength(1)] public List<RobotWorkflowStep> Steps { get; set; } = new();
}

/// <summary>One screen of a robot workflow.</summary>
public class RobotWorkflowStep
{
    [JsonPropertyName("StepId")]
    [Required] public string StepId { get; set; } = "";
    [JsonPropertyName("ScreenId")]
    [Required] public string ScreenId { get; set; } = "";
    [JsonPropertyName("Title")]
    public string Title { get; set; } = "";
    [JsonPropertyName("TTS")]
    public string? TTS { get; set; }
    [JsonPropertyName("StartDestinationName")]
    public string? StartDestinationName { get; set; }
    [JsonPropertyName("NextDestinationName")]
    public string? NextDestinationName { get; set; }
    [JsonPropertyName("Video")]
    public List<RobotWorkflowMedia>? Video { get; set; }
    [JsonPropertyName("Audio")]
    public List<RobotWorkflowMedia>? Audio { get; set; }
    [JsonPropertyName("Image")]
    public List<RobotWorkflowMedia>? Image { get; set; }
    [JsonPropertyName("Buttons")]
    public RobotWorkflowButtons? Buttons { get; set; }
}

/// <summary>Yes/No button definition.</summary>
public class ButtonAction
{
    [JsonPropertyName("Label")]
    public string Label { get; set; } = "";

    /// <example>Next</example>
    [JsonPropertyName("Action")]
    [RegularExpression("^(Next|Previous)$")]
    public string Action { get; set; } = "Next";
}

/// <summary>Yes/No button pair.</summary>
public class RobotWorkflowButtons
{
    [JsonPropertyName("Yes")]
    [Required] public ButtonAction? Yes { get; set; }
    [JsonPropertyName("No")]
    [Required] public ButtonAction? No { get; set; }
}

/// <summary>A single media item; only the path matching its list (Video/Audio/Image) is normally set.</summary>
public class RobotWorkflowMedia
{
    [JsonPropertyName("VideoPath")]
    public string? VideoPath { get; set; }
    [JsonPropertyName("AudioPath")]
    public string? AudioPath { get; set; }
    [JsonPropertyName("ImagePath")]
    public string? ImagePath { get; set; }
    [JsonPropertyName("TTS")]
    public string? TTS { get; set; }
    [JsonPropertyName("Buttons")]
    public RobotWorkflowButtons? Buttons { get; set; }
}
