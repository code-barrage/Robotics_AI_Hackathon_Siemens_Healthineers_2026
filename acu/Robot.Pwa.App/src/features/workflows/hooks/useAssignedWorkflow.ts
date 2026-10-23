import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig, loadDevice } from "../../../storage/appStorage";
import { completeRobotWorkflow, retrieveRobotWorkflowJson, startRobotWorkflow } from "../../../api/acu/robotWorkflowApi";
import { parseWorkflowPresentation, type WorkflowPresentation } from "../model/workflowPresentation";
import { validateWorkflowDocument } from "../../../api/acu/schemaValidation";
import { startRobotWorkflowReceiver } from "../services/workflowReceiver";
import { reportUserError } from "../../../api/userError";
import { sendHeartbeat } from "../../../api/acu/deviceApi";

async function robotContext() {
  const [config, device] = await Promise.all([loadConfig(), loadDevice()]);
  if (!device || !config.acuUrl) throw new Error("Configure and register this robot first.");
  return { acuUrl: config.acuUrl, robotId: device.deviceId, mac: device.mac };
}

/**
 * Assigned = latest schema workflow for this robot (the operator's assignment).
 * Active = the workflow the robot is playing after Start; cleared on completion or when the operator
 * cancels / reassigns, which returns the app to the start page.
 */
export default function useAssignedWorkflow(enabled: boolean) {
  const [assigned, setAssigned] = useState<WorkflowPresentation | null>(null);
  const [active, setActive] = useState<WorkflowPresentation | null>(null);
  const [acuUrl, setAcuUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const activeRef = useRef<WorkflowPresentation | null>(null);
  const assignedRef = useRef<WorkflowPresentation | null>(null);
  const busy = useRef(false);
  // Bumped on Start so polls that began earlier cannot override the freshly started run.
  const generation = useRef(0);

  const activate = useCallback((run: WorkflowPresentation | null) => {
    activeRef.current = run;
    setActive(run);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAssigned(null);
      assignedRef.current = null;
      generation.current++;
      activate(null);
      return;
    }
    return startRobotWorkflowReceiver({
      receive: async (signal) => {
        const polled = generation.current;
        const robot = await robotContext();
        const response = await retrieveRobotWorkflowJson(robot.acuUrl, robot.robotId, signal);
        validateWorkflowDocument(response.document);
        const presentation = parseWorkflowPresentation(response, robot.robotId);
        if (!signal.aborted) setAcuUrl(robot.acuUrl);
        return { polled, presentation };
      },
      onReceived: (value) => {
        const { polled, presentation } = value as { polled: number; presentation: WorkflowPresentation | null };
        if (polled !== generation.current || starting) return;
        const current = presentation;
        setAssigned(current);
        assignedRef.current = current;
        const running = activeRef.current;
        if (running && (!current ||
            current.workflow.WorkflowID !== running.workflow.WorkflowID)) activate(null);
        setError(null);
      },
      onError: (cause) => setError(reportUserError(cause, "acu")),
      onSettled: () => {},
    });
  }, [enabled, activate, starting]);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    generation.current++;
    setStarting(true);
    setError(null);
    try {
      const robot = await robotContext();
      const assignment = assignedRef.current;
      if (!assignment) throw new Error("No workflow is assigned to this robot.");
      const started = generation.current;
      const response = await startRobotWorkflow(robot.acuUrl, robot.robotId);
      validateWorkflowDocument(response.document);
      const run = parseWorkflowPresentation(response, robot.robotId);
      if (started !== generation.current) return;
      if (!run) throw new Error("ACU did not return this robot's workflow.");
      await sendHeartbeat(robot.acuUrl, robot.robotId, robot.mac, { event: "clear" });
      if (started !== generation.current) return;
      setAcuUrl(robot.acuUrl);
      setAssigned(run);
      assignedRef.current = run;
      activate(run);
    } catch (cause) {
      setError(reportUserError(cause, "acu"));
    } finally {
      busy.current = false;
      setStarting(false);
    }
  }, [activate]);

  const complete = useCallback(async (run: WorkflowPresentation) => {
    if (busy.current) return;
    busy.current = true;
    setCompleting(true);
    try {
      const current = activeRef.current;
      if (!current || current !== run) return;
      const robot = await robotContext();
      if (activeRef.current !== run) return;
      await completeRobotWorkflow(robot.acuUrl, robot.robotId, current.workflow.WorkflowID);
      if (activeRef.current === run) activate(null);
    } finally {
      busy.current = false;
      setCompleting(false);
    }
  }, [activate]);

  return { assigned, active, acuUrl, error, starting, completing, start, complete };
}
