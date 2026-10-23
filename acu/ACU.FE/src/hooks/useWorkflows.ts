import { useCallback, useEffect, useState } from "react";
import type { Workflow } from "../types";
import { workflowApi } from "../api/workflowApi";

/**
 * Manages the list of saved workflows. Data is persisted server-side by the
 * ApiGateway to /data/workflows.json on the `acu-data` Docker volume, so it is
 * shared across clients and survives container restarts.
 *
 * Updates are applied optimistically to the local state and then synced to the
 * backend; if a request fails we re-fetch the server's source of truth.
 */
export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await workflowApi.getAll();
      setWorkflows(data);
    } catch (err) {
      console.error("Failed to load workflows", err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Create a new workflow or update an existing one (matched by id). */
  const saveWorkflow = useCallback(async (workflow: Workflow) => {
    const exists = workflows.some((w) => w.id === workflow.id);
    setWorkflows((prev) => {
      const alreadyExists = prev.some((w) => w.id === workflow.id);
      return alreadyExists
        ? prev.map((w) => (w.id === workflow.id ? workflow : w))
        : [...prev, workflow];
    });
    try {
      if (exists) {
        await workflowApi.update(workflow);
      } else {
        await workflowApi.create(workflow);
      }
    } catch (err) {
      console.error("Failed to save workflow", err);
      refresh();
    }
  }, [refresh, workflows]);

  const deleteWorkflow = useCallback(async (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    try {
      await workflowApi.remove(id);
    } catch (err) {
      console.error("Failed to delete workflow", err);
      refresh();
    }
  }, [refresh]);

  return { workflows, saveWorkflow, deleteWorkflow };
}
