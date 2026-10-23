import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { sendHeartbeat } from "../../../api/acu/deviceApi";
import { Platform } from "react-native";
import { fetchDestinations } from "../../../api/pudu/destinationsApi";
import { RobotArrival } from "../../../platform/robot/robotArrival";
import { loadConfig, loadDevice } from "../../../storage/appStorage";
import type { Destination } from "../model/destination";
import { destinationsToSend } from "../syncDestinations";
import { reportUserError } from "../../../api/userError";
import { collectTelemetry } from "../../remote/telemetry";

const HEARTBEAT_DELAY_MS = 2_000;
const DESTINATIONS_REFRESH_MS = 10_000;

export type RobotSync = {
  destinations: Destination[];
  loading: boolean;
  error: string | null;
  online: boolean;
  currentDestination: string | null;
  recordArrival: (destination: string | null) => void;
  /** Sends a one-off heartbeat event (e.g. navigating_to_X / arrived_at_X). */
  report: (event: string, lastSeenLocation?: string) => Promise<void>;
  /** TTS language (BCP-47) selected in ACU Settings; delivered with every heartbeat response. */
  speechLanguage: string;
  /**
   * Latest operator instruction from the heartbeat response (remote commands are JSON strings).
   * undefined until the first heartbeat after start-up has answered.
   */
  instructions: string | null | undefined;
};

export const DEFAULT_SPEECH_LANGUAGE = "de-DE";

export const RobotSyncContext = createContext<RobotSync | null>(null);

export function useRobotSync(): RobotSync {
  const value = useContext(RobotSyncContext);
  if (!value) throw new Error("useRobotSync must be used inside RobotSyncContext.");
  return value;
}

/**
 * App-level robot sync, active once the robot is registered:
 * heartbeat every 2 s carrying telemetry (battery, cameras, app state) and returning the latest
 * operator instruction; destinations fetched every 10 s and attached to the heartbeat
 * immediately after registration and whenever they change (ACU stores them in devices.json).
 */
export default function useDestinations(enabled: boolean): RobotSync {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [currentDestination, setCurrentDestination] = useState<string | null>(null);
  const [speechLanguage, setSpeechLanguage] = useState(DEFAULT_SPEECH_LANGUAGE);
  const [instructions, setInstructions] = useState<string | null | undefined>(undefined);
  const recordArrival = useCallback((destination: string | null) => setCurrentDestination(destination), []);

  useEffect(() => {
    if (!enabled) {
      setOnline(false);
      setCurrentDestination(null);
      setInstructions(undefined);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    let latest: Destination[] | null = null;
    let acknowledged: string | null = null;
    let beatTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let again = false;

    async function beat() {
      if (inFlight) { again = true; return; }
      inFlight = true;
      if (beatTimer !== undefined) clearTimeout(beatTimer);
      try {
        const [config, device, telemetry] = await Promise.all([loadConfig(), loadDevice(), collectTelemetry()]);
        if (!device) throw new Error("Robot registration is missing.");
        const pending = destinationsToSend(latest, acknowledged);
        const result = await sendHeartbeat(config.acuUrl, device.deviceId, device.mac, pending
          ? { destinations: pending.destinations, telemetry, signal }
          : { telemetry, signal });
        if (signal.aborted) return;
        if (pending) acknowledged = pending.signature;
        setOnline(result.online);
        setInstructions(result.instructions ?? null);
        if (result.speechLanguage !== undefined) setSpeechLanguage(result.speechLanguage);
      } catch (cause) {
        if (signal.aborted) return;
        console.warn("ACU heartbeat failed", cause);
        setOnline(false);
      } finally {
        inFlight = false;
        if (!signal.aborted) {
          if (again) { again = false; void beat(); }
          else beatTimer = setTimeout(() => { void beat(); }, HEARTBEAT_DELAY_MS);
        }
      }
    }

    async function refresh(first: boolean) {
      if (first) setLoading(true);
      try {
        const list = await fetchDestinations(await loadConfig(), signal);
        if (signal.aborted) return;
        latest = list;
        setDestinations(list);
        setError(list.length === 0 ? "No destinations found for this robot." : null);
        if (destinationsToSend(list, acknowledged)) void beat();
      } catch (cause) {
        if (!signal.aborted) setError(reportUserError(cause, "destinations"));
      } finally {
        if (!signal.aborted) {
          if (first) setLoading(false);
          refreshTimer = setTimeout(() => { void refresh(false); }, DESTINATIONS_REFRESH_MS);
        }
      }
    }

    void beat();
    void refresh(true);
    return () => {
      controller.abort();
      if (beatTimer !== undefined) clearTimeout(beatTimer);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    };
  }, [enabled]);

  const report = useCallback(async (event: string, lastSeenLocation?: string) => {
    const device = await loadDevice();
    if (!device) return;
    await sendHeartbeat((await loadConfig()).acuUrl, device.deviceId, device.mac, { event, lastSeenLocation });
  }, []);

  useEffect(() => {
  if (!enabled || Platform.OS !== "android") return;

  const controller = new AbortController();
  let pendingLocation: string | null = null;
  let activeLocation: string | null = null;
  let sendingLocation = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function sendLocation(tableNum: string) {
    const location = tableNum.trim();
    if (!location || controller.signal.aborted) return;

    recordArrival(location);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    if (location !== activeLocation) pendingLocation = location;
    if (sendingLocation) return;

    sendingLocation = true;
    while (pendingLocation && !controller.signal.aborted) {
      const current = pendingLocation;
      pendingLocation = null;
      activeLocation = current;

      try {
        const [config, device] = await Promise.all([loadConfig(), loadDevice()]);
        if (controller.signal.aborted) break;
        if (!device) throw new Error("Robot registration is missing.");
        await sendHeartbeat(config.acuUrl, device.deviceId, device.mac, {
          lastSeenLocation: current,
          signal: controller.signal,
        });
        await RobotArrival.clearLastArrival(current);
      } catch (error) {
        if (controller.signal.aborted) break;
        pendingLocation ??= current;
        console.warn("ACU location update failed", error);
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (pendingLocation) void sendLocation(pendingLocation);
        }, HEARTBEAT_DELAY_MS);
        break;
      } finally {
        activeLocation = null;
      }
    }
    sendingLocation = false;
  }

  const subscription = RobotArrival.addListener("arrival", ({ tableNum }) => {
    void sendLocation(tableNum);
  });
  void RobotArrival.getLastArrival().then(({ tableNum }) => {
    if (tableNum) void sendLocation(tableNum);
  });

  return () => {
    controller.abort();
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    subscription.remove();
  };
}, [enabled, recordArrival]);

  return { destinations, loading, error, online, report, currentDestination, recordArrival, speechLanguage, instructions };
}
