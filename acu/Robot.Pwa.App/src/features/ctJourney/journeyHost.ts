import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRobotSync } from "../destinations/hooks/useDestinations";
import { moveAndWait } from "../workflows/services/followRoute";
import type { WorkflowPresentation } from "../workflows/model/workflowPresentation";
import { RobotArrival } from "../../platform/robot/robotArrival";
import { RobotTts } from "../../platform/robot/robotTts";
import { PuduCamera, cameraBackend } from "../../platform/robot/puduCamera";
import { userErrorMessage } from "../../api/userError";

/**
 * The CT Companion bridge installs a one-step ACU workflow whose Description carries the URL of
 * the full-screen patient journey. The robot app shows that page and lends it the robot's
 * hardware: navigation, speech and the face camera.
 */
export const CT_JOURNEY_WORKFLOW_ID = "ct-patient-journey";

export function ctJourneyUrl(run: WorkflowPresentation | null): string | null {
  if (!run || run.workflow.WorkflowID !== CT_JOURNEY_WORKFLOW_ID) return null;
  const match = run.workflow.Description?.match(/https?:\/\/[^\s"'<>]+\/journey[^\s"'<>]*/);
  if (!match) return null;
  const url = match[0].replace(/[).,;]+$/, "");
  return url + (url.includes("?") ? "&" : "?") + "host=robot";
}

/** Page → robot. */
export type PageMessage =
  | { type: "ready" }
  | { type: "speak"; text: string; lang?: string }
  | { type: "stopSpeech" }
  | { type: "navigate"; destination: string }
  | { type: "cancelNavigation" }
  | { type: "camera"; on: boolean }
  | { type: "event"; name: string };

/** Robot → page. */
export type HostMessage =
  | { type: "host"; platform: string; navigation: boolean; camera: boolean;
      destinations: string[]; currentDestination: string | null; speechLanguage: string }
  | { type: "navigation"; status: "moving" | "arrived" | "failed" | "cancelled"; destination: string; message?: string }
  | { type: "frame"; jpeg: string; width: number; height: number }
  | { type: "speech"; status: "error"; message: string }
  | { type: "camera"; status: "on" | "off" | "error"; message?: string };

export function parsePageMessage(raw: unknown): PageMessage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  const text = (key: string, max = 600) => typeof m[key] === "string" && (m[key] as string).length <= max;
  switch (m.type) {
    case "ready": case "stopSpeech": case "cancelNavigation":
      return { type: m.type };
    case "speak":
      return text("text") ? { type: "speak", text: m.text as string, lang: text("lang", 20) ? m.lang as string : undefined } : null;
    case "navigate":
      return text("destination", 120) && (m.destination as string).trim() ? { type: "navigate", destination: m.destination as string } : null;
    case "camera":
      return typeof m.on === "boolean" ? { type: "camera", on: m.on } : null;
    case "event":
      return text("name", 80) && /^[\w-]+$/.test(m.name as string) ? { type: "event", name: m.name as string } : null;
    default:
      return null;
  }
}

const FRAME_INTERVAL_MS = 300;

/** Returns the handler for page messages; `send` delivers host messages into the page. */
export function useJourneyHost(send: (message: HostMessage) => void) {
  const sync = useRobotSync();
  const latest = useRef({ sync, send });
  latest.current = { sync, send };
  const navigation = useRef<AbortController | null>(null);
  const camera = useRef<(() => void) | null>(null);

  const hello = useCallback(() => {
    const s = latest.current.sync;
    latest.current.send({
      type: "host", platform: Platform.OS, navigation: Platform.OS === "android",
      camera: cameraBackend === "native", destinations: s.destinations.map((d) => d.name),
      currentDestination: s.currentDestination, speechLanguage: s.speechLanguage,
    });
  }, []);

  const destinationKey = sync.destinations.map((d) => d.name).join("|");
  useEffect(() => { hello(); }, [hello, destinationKey, sync.speechLanguage]);

  const report = useCallback((event: string, location?: string) => {
    void latest.current.sync.report(event, location).catch((cause: unknown) =>
      console.warn("Could not report journey event to ACU", cause));
  }, []);

  const stopCamera = useCallback(async () => {
    if (!camera.current) return;
    camera.current();
    camera.current = null;
    // Unbinding also restores the Mark (navigation) camera.
    await PuduCamera.unbind().catch((cause: unknown) => console.warn("Camera unbind failed", cause));
  }, []);

  useEffect(() => () => {
    navigation.current?.abort();
    void stopCamera();
    void RobotTts.stop().catch(() => {});
  }, [stopCamera]);

  return useCallback(async (raw: unknown) => {
    const message = parsePageMessage(raw);
    if (!message) return;
    const { send: post } = latest.current;
    switch (message.type) {
      case "ready":
        hello();
        return;
      case "speak":
        try {
          await RobotTts.speak(message.text, message.lang || latest.current.sync.speechLanguage);
        } catch (cause) {
          post({ type: "speech", status: "error", message: userErrorMessage(cause, "speech") });
        }
        return;
      case "stopSpeech":
        await RobotTts.stop().catch(() => {});
        return;
      case "cancelNavigation":
        navigation.current?.abort();
        return;
      case "event":
        report(message.name);
        return;
      case "navigate": {
        const { destination } = message;
        navigation.current?.abort();
        const controller = new AbortController();
        navigation.current = controller;
        latest.current.sync.recordArrival(null);
        try {
          await moveAndWait(RobotArrival, destination, controller.signal, () => {
            post({ type: "navigation", status: "moving", destination });
            report(`navigating_to_${destination}`);
          });
          latest.current.sync.recordArrival(destination);
          report(`arrived_at_${destination}`, destination);
          post({ type: "navigation", status: "arrived", destination });
        } catch (cause) {
          post(controller.signal.aborted
            ? { type: "navigation", status: "cancelled", destination }
            : { type: "navigation", status: "failed", destination, message: userErrorMessage(cause, "movement") });
        } finally {
          if (navigation.current === controller) navigation.current = null;
        }
        return;
      }
      case "camera":
        if (!message.on) {
          await stopCamera();
          post({ type: "camera", status: "off" });
          return;
        }
        if (camera.current) return;
        try {
          await PuduCamera.bind();
          await PuduCamera.start("face");
          let last = 0;
          camera.current = PuduCamera.onFrame((frame) => {
            const now = Date.now();
            if (frame.camera !== "face" || !frame.jpeg || now - last < FRAME_INTERVAL_MS) return;
            last = now;
            latest.current.send({ type: "frame", jpeg: frame.jpeg, width: frame.width, height: frame.height });
          });
          post({ type: "camera", status: "on" });
        } catch (cause) {
          post({ type: "camera", status: "error", message: cause instanceof Error ? cause.message : String(cause) });
        }
        return;
    }
  }, [hello, report, stopCamera]);
}
