using System.Text.Json;
using System.Text.Json.Serialization;
using Acu.Storage.Models;
using Microsoft.Extensions.Configuration;

namespace Acu.Storage.Store;

/// <summary>
/// Thread-safe, file-backed store for robot workflows.
/// Path: <c>RobotWorkflowDataPath</c> in configuration (default /data/robot-workflows.json).
/// </summary>
public class RobotWorkflowStore(IConfiguration configuration)
{
    // PascalCase on disk to match workflow.schema.json.
    private static readonly JsonSerializerOptions myJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented               = true,
        DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly string myStoragePath =
        configuration.GetValue<string>("RobotWorkflowDataPath") ?? "/data/robot-workflows.json";
    private readonly object myLock = new();

    private RobotWorkflowData ReadData() => File.Exists(myStoragePath)
        ? JsonSerializer.Deserialize<RobotWorkflowData>(File.ReadAllText(myStoragePath), myJsonOptions)
          ?? throw new InvalidDataException("Robot workflow file contains null.")
        : new RobotWorkflowData();

    private void WriteData(RobotWorkflowData data)
    {
        var directory = Path.GetDirectoryName(myStoragePath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);
        var temporaryPath = myStoragePath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(data, myJsonOptions));
        File.Move(temporaryPath, myStoragePath, overwrite: true);
    }

    /// <summary>Read independent robot workflows without joining legacy assignments.</summary>
    public List<RobotWorkflow> GetAll()
    {
        lock (myLock) return ReadData().Workflows;
    }

    /// <summary>Replace an existing robot workflow.</summary>
    public bool Update(RobotWorkflow workflow)
    {
        lock (myLock)
        {
            var data = ReadData();
            var index = data.Workflows.FindIndex(item => item.WorkflowID == workflow.WorkflowID);
            if (index < 0) return false;
            data.Workflows[index] = workflow;
            WriteData(data);
            return true;
        }
    }

    /// <summary>Delete a robot workflow without touching legacy workflows.</summary>
    public bool Delete(string id)
    {
        lock (myLock)
        {
            var data = ReadData();
            if (data.Workflows.RemoveAll(item => item.WorkflowID == id) == 0) return false;
            WriteData(data);
            return true;
        }
    }

    /// <summary>Append a workflow. Returns false if the WorkflowID already exists.</summary>
    public bool Insert(RobotWorkflow workflow)
    {
        lock (myLock)
        {
            var data = ReadData();

            if (data.Workflows.Any(w => w.WorkflowID == workflow.WorkflowID))
                return false;

            data.Workflows.Add(workflow);

            WriteData(data);
            return true;
        }
    }
}
