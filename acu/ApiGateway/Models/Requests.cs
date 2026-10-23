using System.ComponentModel.DataAnnotations;

namespace AcuApiGateway.Models;

/// <summary>Payload sent by a robot when registering with the ACU.</summary>
public class RegisterRequest
{
    /// <example>robot-001</example>
    [Required]
    public string DeviceId { get; set; } = "";

    /// <example>Warehouse Bot A</example>
    public string Name { get; set; } = "";

    /// <example>192.168.1.42</example>
    public string Ip { get; set; } = "";

    /// <example>AA:BB:CC:DD:EE:FF</example>
    [Required]
    public string Mac { get; set; } = "";

    /// <example>v1.2.3</example>
    public string Firmware { get; set; } = "";
}

/// <summary>Instruction payload sent by the UI operator to a robot.</summary>
public class InstructionRequest
{
    /// <example>move_forward</example>
    [Required]
    public string Command { get; set; } = "";
}

/// <summary>Payload sent by a robot when unregistering.</summary>
public class UnregisterRequest
{
    /// <example>AA:BB:CC:DD:EE:FF</example>
    [Required]
    public string Mac { get; set; } = "";
}

/// <summary>Payload to assign a workflow to a device.</summary>
public class AssignmentRequest
{
    /// <example>3f8c1e9a-1b2c-4d5e-8f90-abc123def456</example>
    [Required]
    public string WorkflowId { get; set; } = "";
}
