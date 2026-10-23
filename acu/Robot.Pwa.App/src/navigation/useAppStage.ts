import { useCallback, useEffect, useState } from "react";
import { isConfigValid } from "../config/validation";
import { clearAll, loadConfig, loadDevice } from "../storage/appStorage";

type Stage = "loading" | "config" | "register" | "ready";

async function computeStage(): Promise<Stage> {
  if (!isConfigValid(await loadConfig())) return "config";
  if (!(await loadDevice())) return "register";
  return "ready";
}

export default function useAppStage() {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStage(await computeStage());
      setError(null);
    } catch (cause) {
      console.warn("Could not load app", cause);
      setError("Could not load app settings.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    computeStage().then((next) => {
      if (active) setStage(next);
    }).catch((cause: unknown) => {
      console.warn("Could not load app", cause);
      if (active) setError("Could not load app settings.");
    });
    return () => { active = false; };
  }, []);

  const reset = useCallback(async () => {
    try {
      await clearAll();
      setError(null);
      setStage("config");
    } catch (cause) {
      console.warn("Could not reset app", cause);
      setError("Could not reset app.");
    }
  }, []);

  return { stage, error, refresh, reset };
}
