import { useEffect, useRef } from "react";
import { PuduCamera } from "../../platform/robot/puduCamera";
import { RobotArrival } from "../../platform/robot/robotArrival";
import { RobotTts } from "../../platform/robot/robotTts";
import { loadConfig, loadDevice } from "../../storage/appStorage";
import type { RobotSync } from "../destinations/hooks/useDestinations";
import { moveAndWait } from "../workflows/services/followRoute";
import { commandEvent, RemoteCommandGate, type CommandStatus, type RemoteCommand } from "./remoteCommand";
import { reportCommand, setAppTelemetry } from "./telemetry";

function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.name === "AbortError" ? "cancelled" : cause.message;
  return String(cause);
}

/**
 * Executes operator commands (navigate, say, camera on/off, cancel...) that arrive via the heartbeat's
 * `instructions` field. Progress is reported back as heartbeat events and as statusData.lastCommand.
 */
export default function useRemoteControl(sync: RobotSync, enabled: boolean): void {
  const latest = useRef(sync);
  latest.current = sync;
  const gate = useRef(new RemoteCommandGate());
  const navigation = useRef<AbortController | null>(null);
  const startedFace = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    gate.current = new RemoteCommandGate();
    return () => {
      navigation.current?.abort();
      navigation.current = null;
      void PuduCamera.stopUpload().catch(() => undefined);
      if (startedFace.current && PuduCamera.isBound()) void PuduCamera.stop("face").catch(() => undefined);
      startedFace.current = false;
      setAppTelemetry({ navigationTarget: undefined });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || sync.instructions === undefined) return;
    const command = gate.current.accept(sync.instructions);
    if (command) void execute(command);
    // execute only reads refs, so it is intentionally not a dependency.
  }, [enabled, sync.instructions]);

  async function execute(command: RemoteCommand): Promise<void> {
    const update = (status: CommandStatus, message?: string) => {
      const report = { id: command.id, action: command.action, status, at: new Date().toISOString(), message };
      reportCommand(report);
      void latest.current.report(commandEvent(report)).catch(() => undefined);
    };
    try {
      switch (command.action) {
        case "ping":
          update("done", "pong");
          return;
        case "say":
          update("running");
          await RobotTts.speak(command.text, command.lang ?? latest.current.speechLanguage);
          update("done");
          return;
        case "stopSpeech":
          await RobotTts.stop();
          update("done");
          return;
        case "cancel":
          navigation.current?.abort();
          await RobotTts.stop().catch(() => undefined);
          update("done");
          return;
        case "navigate":
          await navigate(command.destination, update);
          return;
        case "camera":
          await camera(command.on, command.face, command.intervalMs);
          update("done", command.on ? "streaming" : "stopped");
          return;
      }
    } catch (cause) {
      update("failed", errorText(cause));
    }
  }

  async function navigate(destination: string, update: (status: CommandStatus, message?: string) => void) {
    navigation.current?.abort();
    const controller = new AbortController();
    navigation.current = controller;
    setAppTelemetry({ navigationTarget: destination });
    update("running", `to ${destination}`);
    try {
      await moveAndWait(RobotArrival, destination, controller.signal, () => undefined);
      latest.current.recordArrival(destination);
      update("done", `arrived ${destination}`);
    } finally {
      if (navigation.current === controller) {
        navigation.current = null;
        setAppTelemetry({ navigationTarget: undefined });
      }
    }
  }

  async function camera(on: boolean, face: boolean, intervalMs: number) {
    if (!on) {
      await PuduCamera.stopUpload();
      if (startedFace.current && PuduCamera.isBound() && PuduCamera.isRunning("face")) await PuduCamera.stop("face");
      startedFace.current = false;
      return;
    }
    const [config, device] = await Promise.all([loadConfig(), loadDevice()]);
    if (!device) throw new Error("Robot registration is missing.");
    if (!PuduCamera.isBound()) await PuduCamera.bind();
    if (face && !PuduCamera.isRunning("face")) {
      await PuduCamera.start("face");
      startedFace.current = true;
    }
    await PuduCamera.startUpload(config.acuUrl, device.deviceId, intervalMs);
  }
}
