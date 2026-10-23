import axios from "axios";
import apiClient from "./deviceApi";
import type { RobotWorkflow } from "../types";

const root = "/api/acu/robot-workflows";
const resource = (id: string) => `${root}/${encodeURIComponent(id)}`;

export const robotWorkflowApi = {
  async uploadMedia(kind: "Video" | "Audio" | "Image", file: File): Promise<string> {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return (await apiClient.post<{ path: string }>(`${root}/media`, form,
      { headers: { "Content-Type": undefined } })).data.path;
  },
  async getAll(signal?: AbortSignal): Promise<RobotWorkflow[]> {
    return (await apiClient.get<RobotWorkflow[]>(root, { signal })).data;
  },
  async getAssignments(signal?: AbortSignal): Promise<RobotWorkflow[]> {
    return (await apiClient.get<{ Workflows: RobotWorkflow[] }>(`${root}/assignments`, { signal })).data.Workflows;
  },
  async update(workflow: RobotWorkflow): Promise<RobotWorkflow> {
    return (await apiClient.put<RobotWorkflow>(resource(workflow.WorkflowID), workflow)).data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(resource(id));
  },
  async publish(id: string, robotId: string): Promise<void> {
    await apiClient.post(`${resource(id)}/assignments/${encodeURIComponent(robotId)}`);
  },
  async clear(robotId: string): Promise<void> {
    await apiClient.delete(`${root}/assignments/${encodeURIComponent(robotId)}`);
  },
};

export function robotWorkflowError(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: string; title?: string; error?: string }>(error)) {
    return error.response?.data?.detail || error.response?.data?.error ||
      error.response?.data?.title || fallback;
  }
  return fallback;
}
