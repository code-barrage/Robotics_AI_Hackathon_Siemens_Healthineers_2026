export type WorkflowResponse = { document: unknown };

export async function retrieveRobotWorkflowJson(
  base: string, robotId: string, signal?: AbortSignal,
): Promise<WorkflowResponse> {
  return workflowRequest(base, robotId, "/workflow", "GET", signal);
}

export async function startRobotWorkflow(
  base: string, robotId: string, signal?: AbortSignal,
): Promise<WorkflowResponse> {
  return workflowRequest(base, robotId, "/workflow/start", "POST", signal);
}

export async function completeRobotWorkflow(
  base: string, robotId: string, workflowId: string, signal?: AbortSignal,
): Promise<void> {
  if (!workflowId.trim()) throw new Error("A workflow is required.");
  await workflowRequest(base, robotId, `/workflows/${encodeURIComponent(workflowId)}/complete`,
    "POST", signal);
}

export class WorkflowHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function workflowRequest(
  base: string, robotId: string, path: string, method: "GET" | "POST", signal?: AbortSignal,
): Promise<WorkflowResponse> {
  if (!/^https?:\/\//i.test(base)) throw new Error("ACU URL must use HTTP or HTTPS.");
  if (!robotId.trim()) throw new Error("A registered robot device ID is required.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const url = `${base.replace(/\/+$/, "")}/api/bot/robot-workflows/${encodeURIComponent(robotId)}${path}`;
    const response = await fetch(url, {
      method, headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new WorkflowHttpError(response.status, `ACU returned HTTP ${response.status}${message ? `: ${message}` : ""}`);
    }
    return { document: response.status === 204 ? null : await response.json() };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
