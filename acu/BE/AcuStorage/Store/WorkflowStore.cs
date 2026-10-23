using System.Text.Json;
using Acu.Storage.Models;
using Microsoft.Extensions.Configuration;

namespace Acu.Storage.Store;

/// <summary>
/// Thread-safe, file-backed store for workflows and their device assignments.
/// Default path: /data/workflows.json  (override via WorkflowDataPath in appsettings).
/// The /data directory is mounted to a Docker volume so the data survives restarts.
/// </summary>
public class WorkflowStore(IConfiguration configuration)
{
    private static readonly JsonSerializerOptions myJsonSerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented               = true
    };

    private readonly string myStoragePath =
        configuration.GetValue<string>("WorkflowDataPath") ?? "/data/workflows.json";
    private readonly object myLock = new();

    /// <summary>Read the full workflow document from disk.</summary>
    public WorkflowData Read()
    {
        lock (myLock)
        {
            if (!File.Exists(myStoragePath))
                return new WorkflowData();

            var json = File.ReadAllText(myStoragePath);
            return JsonSerializer.Deserialize<WorkflowData>(json, myJsonSerializerOptions)
                   ?? new WorkflowData();
        }
    }

    /// <summary>Persist the full workflow document to disk.</summary>
    public void Write(WorkflowData data)
    {
        lock (myLock)
        {
            var dir = Path.GetDirectoryName(myStoragePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var json = JsonSerializer.Serialize(data, myJsonSerializerOptions);
            File.WriteAllText(myStoragePath, json);
        }
    }

    /// <summary>Return all saved workflows.</summary>
    public List<Workflow> GetWorkflows() => Read().Workflows;

    /// <summary>Create a new workflow. Returns false if a workflow with the same id already exists.</summary>
    public bool Insert(Workflow workflow)
    {
        lock (myLock)
        {
            var data = Read();
            if (data.Workflows.Any(w => w.Id == workflow.Id))
                return false;

            data.Workflows.Add(workflow);
            Write(data);
            return true;
        }
    }

    /// <summary>Replace an existing workflow with the same id. Returns false if no such workflow exists.</summary>
    public bool Update(Workflow workflow)
    {
        lock (myLock)
        {
            var data = Read();
            var index = data.Workflows.FindIndex(w => w.Id == workflow.Id);
            if (index < 0)
                return false;

            data.Workflows[index] = workflow;
            Write(data);
            return true;
        }
    }

    /// <summary>
    /// Delete a workflow by id. Also clears any device assignments that
    /// referenced it so no dangling assignments remain.
    /// </summary>
    public bool Delete(string id)
    {
        lock (myLock)
        {
            var data    = Read();
            var removed = data.Workflows.RemoveAll(w => w.Id == id) > 0;

            var staleDevices = data.Assignments
                .Where(kv => kv.Value == id)
                .Select(kv => kv.Key)
                .ToList();
            foreach (var deviceId in staleDevices)
                data.Assignments.Remove(deviceId);

            if (removed || staleDevices.Count > 0)
                Write(data);

            return removed;
        }
    }

    /// <summary>Return the device→workflow assignment map (pruned of dangling workflow ids).</summary>
    public Dictionary<string, string> GetAssignments()
    {
        lock (myLock)
        {
            var data       = Read();
            var validWfIds = new HashSet<string>(data.Workflows.Select(w => w.Id));
            var pruned     = data.Assignments
                .Where(kv => validWfIds.Contains(kv.Value))
                .ToDictionary(kv => kv.Key, kv => kv.Value);

            if (pruned.Count != data.Assignments.Count)
            {
                data.Assignments = pruned;
                Write(data);
            }
            return pruned;
        }
    }

    /// <summary>Assign a workflow to a device.</summary>
    public void SetAssignment(string deviceId, string workflowId)
    {
        lock (myLock)
        {
            var data = Read();
            data.Assignments[deviceId] = workflowId;
            Write(data);
        }
    }

    /// <summary>Remove a device's workflow assignment.</summary>
    public void ClearAssignment(string deviceId)
    {
        lock (myLock)
        {
            var data = Read();
            if (data.Assignments.Remove(deviceId))
                Write(data);
        }
    }
}
