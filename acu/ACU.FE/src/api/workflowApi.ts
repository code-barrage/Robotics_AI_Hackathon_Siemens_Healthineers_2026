import apiClient from "./deviceApi";
import type { Workflow, RobotWorkflow } from "../types";

/**
 * Workflow + assignment API, backed by the C# ApiGateway which persists
 * everything to /data/workflows.json on the `acu-data` Docker volume.
 */
export const workflowApi = {
  getAll: async (): Promise<Workflow[]> => {
    const res = await apiClient.get<Workflow[]>("/api/workflows");
    return res.data ?? [];
  },

  /** Create a brand-new workflow.*/
  create: async (workflow: Workflow): Promise<Workflow> => {
    const res = await apiClient.post<Workflow>("/api/workflows", workflow);
    return res.data;
  },

  /** Update an existing */
  update: async (workflow: Workflow): Promise<Workflow> => {
    const res = await apiClient.put<Workflow>(`/api/workflows/${workflow.id}`, workflow);
    return res.data;
  },

  /** Create a workflow in the workflow.schema.json format (stored server-side). */
  createRobotWorkflow: async (workflow: RobotWorkflow): Promise<RobotWorkflow> => {
    const res = await apiClient.post<RobotWorkflow>("/api/workflows/robot", workflow);
    return res.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/workflows/${id}`);
  },

  getAssignments: async (): Promise<Record<string, string>> => {
    const res = await apiClient.get<Record<string, string>>("/api/workflows/assignments");
    return res.data ?? {};
  },

  setAssignment: async (deviceId: string, workflowId: string): Promise<void> => {
    await apiClient.put(`/api/workflows/assignments/${deviceId}`, { workflowId });
  },

  clearAssignment: async (deviceId: string): Promise<void> => {
    await apiClient.delete(`/api/workflows/assignments/${deviceId}`);
  },
};
