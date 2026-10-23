using System.ComponentModel.DataAnnotations;
using Acu.Storage.Models;
using Acu.Storage.Store;

namespace AcuApiGateway.Services;

/// <summary>Expected REST workflow validation and state errors.</summary>
public sealed class RobotWorkflowException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>Serializes separate robot CRUD, assignment and progress operations.</summary>
public sealed class RobotWorkflowService(
    RobotWorkflowStore workflows, DeviceStore devices)
{
    private readonly object myLock = new();
    private readonly Dictionary<string, Assignment> myAssignments = new(StringComparer.Ordinal);

    private sealed class Assignment(RobotWorkflow workflow)
    {
        public RobotWorkflow Workflow { get; } = workflow;
        public bool Completed { get; set; }
    }
    private static void Require(bool condition, int status, string message)
    {
        if (!condition) throw new RobotWorkflowException(status, message);
    }

    private Device ApprovedRobot(string id)
    {
        var db = devices.Read();
        Require(db.TryGetValue(id, out var robot), 404, "Robot is not registered.");
        Require(robot!.Status == "approved", 403, "Robot must be approved.");
        return robot;
    }

    private RobotWorkflow Workflow(string id) =>
        workflows.GetAll().FirstOrDefault(workflow => workflow.WorkflowID == id)
        ?? throw new RobotWorkflowException(404, "Robot workflow not found.");

    private static void Validate(object value)
    {
        var errors = new List<ValidationResult>();
        Require(Validator.TryValidateObject(value, new ValidationContext(value), errors, true),
            400, string.Join(" ", errors.Select(error => error.ErrorMessage)));
    }

    private static void ValidateButtons(RobotWorkflowButtons? buttons)
    {
        if (buttons is null) return;
        Validate(buttons);
        foreach (var button in new[] { buttons.Yes, buttons.No })
        {
            Require(button is not null && !string.IsNullOrWhiteSpace(button.Label),
                400, "Button labels are required.");
            Validate(button!);
        }
    }

    private void ValidateWorkflow(RobotWorkflow workflow)
    {
        Validate(workflow);
        var robot = ApprovedRobot(workflow.RobotId);
        var destinations = robot.Destinations.Select(destination => destination.Name).ToHashSet(StringComparer.Ordinal);
        Require(workflow.Steps.All(step => step is not null), 400, "Steps cannot contain null.");
        Require(workflow.Steps.Select(step => step.StepId).Distinct().Count() == workflow.Steps.Count,
            400, "Step IDs must be unique.");
        foreach (var step in workflow.Steps)
        {
            Require(step is not null, 400, "Steps cannot contain null.");
            Validate(step!);
            foreach (var name in new[] { step!.StartDestinationName, step.NextDestinationName })
                Require(string.IsNullOrEmpty(name) || destinations.Contains(name), 400,
                    $"Destination '{name}' was not received from robot '{workflow.RobotId}'.");
            ValidateButtons(step!.Buttons);
            foreach (var (media, path) in
                (step.Video ?? []).Select(item => (item, item?.VideoPath))
                .Concat((step.Audio ?? []).Select(item => (item, item?.AudioPath)))
                .Concat((step.Image ?? []).Select(item => (item, item?.ImagePath))))
            {
                Require(media is not null && !string.IsNullOrWhiteSpace(path),
                    400, "Each media item needs a path matching its media type.");
                ValidateButtons(media!.Buttons);
            }
        }
    }

    /// <summary>List only new-schema robot workflows.</summary>
    public List<RobotWorkflow> GetAll() => workflows.GetAll();

    /// <summary>Read one robot workflow.</summary>
    public RobotWorkflow Get(string id) => Workflow(id);

    /// <summary>Create a PWA workflow with validated device and destination references.</summary>
    public RobotWorkflow Create(RobotWorkflow workflow)
    {
        lock (myLock)
        {
            ValidateWorkflow(workflow);
            Require(workflows.Insert(workflow), 409, "Workflow already exists.");
            return workflow;
        }
    }

    /// <summary>Read unfinished assignments without exposing execution metadata.</summary>
    public List<RobotWorkflow> GetAssignments()
    {
        lock (myLock) return myAssignments.Values.Where(item => !item.Completed)
            .Select(item => item.Workflow).ToList();
    }

    /// <summary>Update a robot workflow while preserving its last assigned snapshot.</summary>
    public RobotWorkflow Update(string id, RobotWorkflow workflow)
    {
        lock (myLock)
        {
            _ = Workflow(id);
            Require(id == workflow.WorkflowID, 400, "Workflow ID cannot change.");
            ValidateWorkflow(workflow);
            Require(workflows.Update(workflow), 404, "Robot workflow not found.");
            return workflow;
        }
    }

    /// <summary>Delete a robot workflow and clear its in-memory assignments.</summary>
    public void Delete(string id)
    {
        lock (myLock)
        {
            _ = Workflow(id);
            Require(workflows.Delete(id), 404, "Robot workflow not found.");
            foreach (var robotId in myAssignments.Where(item => item.Value.Workflow.WorkflowID == id)
                         .Select(item => item.Key).ToList())
                myAssignments.Remove(robotId);
        }
    }

    /// <summary>Assign a workflow snapshot to an approved robot until the backend restarts.</summary>
    public void Assign(string id, string robotId)
    {
        lock (myLock)
        {
            var workflow = Workflow(id);
            Require(!string.IsNullOrWhiteSpace(robotId), 400, "Robot ID is required.");
            workflow.RobotId = robotId;
            ValidateWorkflow(workflow);
            myAssignments[robotId] = new Assignment(workflow);
        }
    }

    /// <summary>Robot pulls its current or most recently completed REST assignment.</summary>
    public RobotWorkflow? GetAssignedWorkflow(string robotId)
    {
        lock (myLock)
        {
            ApprovedRobot(robotId);
            return myAssignments.GetValueOrDefault(robotId)?.Workflow;
        }
    }

    /// <summary>
    /// Start the assigned workflow, refreshing its snapshot after completion.
    /// </summary>
    public RobotWorkflow Start(string robotId)
    {
        lock (myLock)
        {
            ApprovedRobot(robotId);
            Require(myAssignments.TryGetValue(robotId, out var assignment), 404,
                "No workflow is assigned to this robot.");
            if (assignment!.Completed)
            {
                var workflow = Workflow(assignment.Workflow.WorkflowID);
                workflow.RobotId = robotId;
                assignment = new Assignment(workflow);
                myAssignments[robotId] = assignment;
            }
            devices.ModifyDevice(robotId, device => device.RecentEvents.Clear());
            return assignment.Workflow;
        }
    }

    /// <summary>Complete the identified workflow if it is still assigned to this robot.</summary>
    public void CompleteWorkflow(string robotId, string workflowId)
    {
        lock (myLock)
        {
            ApprovedRobot(robotId);
            Require(myAssignments.TryGetValue(robotId, out var assignment) &&
                assignment.Workflow.WorkflowID == workflowId,
                409, "The workflow is no longer assigned to this robot.");
            assignment!.Completed = true;
        }
    }

    /// <summary>Clear a robot's in-memory assignment without changing legacy assignments.</summary>
    public void Clear(string robotId)
    {
        lock (myLock)
        {
            ApprovedRobot(robotId);
            myAssignments.Remove(robotId);
        }
    }

}
