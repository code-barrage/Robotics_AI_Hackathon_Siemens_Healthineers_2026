import { useCallback, useEffect, useState } from "react";
import { robotWorkflowApi, robotWorkflowError } from "../api/robotWorkflowApi";
import type { RobotWorkflow } from "../types";
import { useT } from "../i18n/I18nProvider";

export function useRobotWorkflows() {
  const t = useT();
  const [workflows, setWorkflows] = useState<RobotWorkflow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const message = t("robotLoadFailed");
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const values = await robotWorkflowApi.getAll(signal);
      if (!signal?.aborted) { setWorkflows(values); setError(null); }
    } catch (cause) {
      if (!signal?.aborted) setError(robotWorkflowError(cause, message));
    }
  }, [message]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);
  return { workflows, error, reload };
}
