using AcuApiGateway.Models;
using AcuApiGateway.WebSockets;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using AcuApiGateway.Services;

namespace AcuApiGateway.Controllers;

/// <summary>
/// CRUD endpoints for workflows and device→workflow assignments.
/// Backed by <see cref="WorkflowStore"/> which persists to the /data Docker volume.
/// </summary>
[ApiController]
[Route("api")]
[Tags("Workflows")]
[Produces("application/json")]
public class WorkflowsController(
    WorkflowStore store,
    DeviceStore deviceStore,
    BotConnectionManager connectionManager) : ControllerBase
{
    /// <summary>Upload media for PWA workflows only and return its ACU REST path.</summary>
    [HttpPost("acu/robot-workflows/media"), RobotWorkflowErrors, Consumes("multipart/form-data")]
    [RequestSizeLimit(RobotMediaService.MaximumFileSize + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = RobotMediaService.MaximumFileSize + 1024 * 1024)]
    [ProducesResponseType(typeof(object), 201)]
    [ProducesResponseType(typeof(ProblemDetails), 400)]
    public async Task<IActionResult> UploadRobotWorkflowMedia([FromForm] string kind, IFormFile file,
        [FromServices] RobotMediaService service, CancellationToken cancellationToken)
    {
        var name = await service.Upload(kind, file, cancellationToken);
        var path = $"/api/bot/robot-workflows/media/{name}";
        return Created(path, new { path });
    }

    /// <summary>Stream uploaded PWA workflow media with seeking support.</summary>
    [HttpGet("bot/robot-workflows/media/{name}"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(FileResult), 200)]
    [ProducesResponseType(206)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    public IActionResult GetRobotWorkflowMedia(string name, [FromServices] RobotMediaService service)
    {
        var media = service.Get(name);
        return PhysicalFile(media.Path, media.ContentType, enableRangeProcessing: true);
    }

    /// <summary>List robot-schema workflows separately from legacy workflows.</summary>
    [HttpGet("acu/robot-workflows"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(List<RobotWorkflow>), 200)]
    public IActionResult GetRobotWorkflows([FromServices] RobotWorkflowService service) =>
        Ok(service.GetAll());

    /// <summary>Read a robot-schema workflow.</summary>
    [HttpGet("acu/robot-workflows/{id}"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(RobotWorkflow), 200)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    public IActionResult GetRobotWorkflow(string id, [FromServices] RobotWorkflowService service) =>
        Ok(service.Get(id));

    /// <summary>Update a robot-schema workflow without changing legacy workflows.</summary>
    [HttpPut("acu/robot-workflows/{id}"), RobotWorkflowErrors, Consumes("application/json")]
    [ProducesResponseType(typeof(RobotWorkflow), 200)]
    [ProducesResponseType(typeof(ProblemDetails), 400)]
    [ProducesResponseType(typeof(ProblemDetails), 403)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    [ProducesResponseType(typeof(ProblemDetails), 409)]
    public IActionResult UpdateRobotWorkflow(string id, [FromBody] RobotWorkflow workflow,
        [FromServices] RobotWorkflowService service) =>
        Ok(service.Update(id, workflow));

    /// <summary>Delete a robot-schema workflow.</summary>
    [HttpDelete("acu/robot-workflows/{id}"), RobotWorkflowErrors]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    [ProducesResponseType(typeof(ProblemDetails), 409)]
    public IActionResult DeleteRobotWorkflow(string id, [FromServices] RobotWorkflowService service)
    {
        service.Delete(id);
        return NoContent();
    }

    /// <summary>List unfinished in-memory assignments in the workflow schema document shape.</summary>
    [HttpGet("acu/robot-workflows/assignments"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(RobotWorkflowData), 200)]
    public IActionResult GetRobotWorkflowAssignments([FromServices] RobotWorkflowService service) =>
        Ok(new RobotWorkflowData { Workflows = service.GetAssignments() });

    /// <summary>Assign a robot workflow snapshot over REST only.</summary>
    [HttpPost("acu/robot-workflows/{id}/assignments/{deviceId}"), RobotWorkflowErrors]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ProblemDetails), 400)]
    [ProducesResponseType(typeof(ProblemDetails), 403)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    [ProducesResponseType(typeof(ProblemDetails), 409)]
    public IActionResult AssignRobotWorkflow(string id, string deviceId,
        [FromServices] RobotWorkflowService service)
    {
        service.Assign(id, deviceId);
        return NoContent();
    }

    /// <summary>Remove only the separate robot workflow assignment.</summary>
    [HttpDelete("acu/robot-workflows/assignments/{deviceId}"), RobotWorkflowErrors]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    [ProducesResponseType(typeof(ProblemDetails), 409)]
    public IActionResult ClearRobotWorkflowAssignment(string deviceId,
        [FromServices] RobotWorkflowService service)
    {
        service.Clear(deviceId);
        return NoContent();
    }

    /// <summary>Return the robot's assignment in the workflow.schema.json document shape.</summary>
    [HttpGet("bot/robot-workflows/{deviceId}/workflow"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(RobotWorkflowData), 200)]
    [ProducesResponseType(typeof(ProblemDetails), 403)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    public IActionResult GetRobotWorkflowDocument(string deviceId,
        [FromServices] RobotWorkflowService service) =>
        WorkflowDocument(service.GetAssignedWorkflow(deviceId));

    private IActionResult WorkflowDocument(RobotWorkflow? workflow)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new RobotWorkflowData
        {
            Workflows = workflow is null ? [] : [workflow]
        });
    }

    /// <summary>Start the current schema workflow.</summary>
    [HttpPost("bot/robot-workflows/{deviceId}/workflow/start"), RobotWorkflowErrors]
    [ProducesResponseType(typeof(RobotWorkflowData), 200)]
    [ProducesResponseType(typeof(ProblemDetails), 403)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    public IActionResult StartRobotWorkflowDocument(string deviceId,
        [FromServices] RobotWorkflowService service)
    {
        return WorkflowDocument(service.Start(deviceId));
    }

    /// <summary>Complete a workflow identified by WorkflowID and RobotId, without a run JSON payload.</summary>
    [HttpPost("bot/robot-workflows/{deviceId}/workflows/{workflowId}/complete"), RobotWorkflowErrors]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ProblemDetails), 403)]
    [ProducesResponseType(typeof(ProblemDetails), 404)]
    [ProducesResponseType(typeof(ProblemDetails), 409)]
    public IActionResult CompleteRobotWorkflowDocument(string deviceId, string workflowId,
        [FromServices] RobotWorkflowService service)
    {
        service.CompleteWorkflow(deviceId, workflowId);
        return NoContent();
    }

    /// <summary>Create a workflow in the workflow.schema.json format and persist it to the robot workflows file.</summary>
    [HttpPost("workflows/robot"), RobotWorkflowErrors]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RobotWorkflow), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public IActionResult CreateRobotWorkflow([FromBody] RobotWorkflow workflow,
        [FromServices] RobotWorkflowService service)
    {
        var created = service.Create(workflow);
        return CreatedAtAction(nameof(GetRobotWorkflow), new { id = created.WorkflowID }, created);
    }

    /// <summary>Explicit problem responses for expected errors in the parallel robot methods only.</summary>
    public sealed class RobotWorkflowErrorsAttribute : ExceptionFilterAttribute
    {
        public override void OnException(ExceptionContext context)
        {
            if (context.Exception is not RobotWorkflowException error) return;
            context.Result = new ObjectResult(new ProblemDetails
            {
                Status = error.StatusCode, Title = "Robot workflow operation failed", Detail = error.Message
            }) { StatusCode = error.StatusCode };
            context.ExceptionHandled = true;
        }

    }

    /// <summary>List all saved workflows.</summary>
    [HttpGet("workflows")]
    [ProducesResponseType(typeof(IEnumerable<Workflow>), StatusCodes.Status200OK)]
    public IActionResult GetAll() => Ok(store.GetWorkflows());

    /// <summary>Create a new workflow. Fails if a workflow with the same id already exists.</summary>
    [HttpPost("workflows")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(Workflow), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public IActionResult Create([FromBody] Workflow workflow)
    {
        if (string.IsNullOrWhiteSpace(workflow.Id))
            return BadRequest(new { error = "Workflow id is required" });

        if (string.IsNullOrWhiteSpace(workflow.Name))
            return BadRequest(new { error = "Workflow name is required" });

        if (!store.Insert(workflow))
            return Conflict(new { error = "Workflow already exists", id = workflow.Id });

        return CreatedAtAction(nameof(GetAll), workflow);
    }

    /// <summary>Update an existing workflow (matched by id).</summary>
    [HttpPut("workflows/{id}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(Workflow), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Update(string id, [FromBody] Workflow workflow)
    {
        if (string.IsNullOrWhiteSpace(workflow.Name))
            return BadRequest(new { error = "Workflow name is required" });

        workflow.Id = id;

        if (!store.Update(workflow))
            return NotFound(new { error = "Workflow not found", id });

        return Ok(workflow);
    }

    /// <summary>Delete a workflow (and clear any assignments referencing it).</summary>
    [HttpDelete("workflows/{id}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public IActionResult Delete(string id)
    {
        if (!store.Delete(id))
            return NotFound(new { error = "Workflow not found" });

        return Ok(new { message = "Workflow deleted", id });
    }

    /// <summary>Get the device→workflow assignment map.</summary>
    [HttpGet("workflows/assignments")]
    [ProducesResponseType(typeof(Dictionary<string, string>), StatusCodes.Status200OK)]
    public IActionResult GetAssignments() => Ok(store.GetAssignments());

    /// <summary>Assign a workflow to a device.</summary>
    [HttpPut("workflows/assignments/{deviceId}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    public IActionResult SetAssignment(string deviceId, [FromBody] AssignmentRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.WorkflowId))
            return BadRequest(new { error = "workflowId is required" });

        store.SetAssignment(deviceId, body.WorkflowId);

        // Clear stale event history so the FE starts fresh for the new run.
        deviceStore.ModifyDevice(deviceId, d => d.RecentEvents.Clear());

        // Push to the bot immediately if it has an open WebSocket.
        var workflow = store.GetWorkflows().FirstOrDefault(w => w.Id == body.WorkflowId);
        _ = connectionManager.SendWorkflowAsync(deviceId, workflow);

        return Ok(new { message = "Assignment saved", deviceId, workflowId = body.WorkflowId });
    }

    /// <summary>Remove a device's workflow assignment.</summary>
    [HttpDelete("workflows/assignments/{deviceId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public IActionResult ClearAssignment(string deviceId)
    {
        store.ClearAssignment(deviceId);

        // Notify the bot so it can stop executing the old workflow immediately.
        _ = connectionManager.ClearWorkflowAsync(deviceId);

        return Ok(new { message = "Assignment cleared", deviceId });
    }
}
