import { Platform } from "react-native";
import { NativeDevice } from "../../platform/device/nativeDevice";
import { PuduCamera } from "../../platform/robot/puduCamera";
import type { CommandReport } from "./remoteCommand";

/**
 * Extra keys sent with every heartbeat. The ACU merges unknown heartbeat keys into the device's
 * statusData, so dashboards can read them from GET /api/acu/devices without server changes.
 */
export type Telemetry = Record<string, unknown>;

const appState: Telemetry = { appPlatform: Platform.OS };

/** Records app-side state (current command, navigation target, active screen...) for the next heartbeat. */
export function setAppTelemetry(values: Telemetry): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete appState[key];
    else appState[key] = value;
  }
}

export function reportCommand(report: CommandReport): void {
  setAppTelemetry({ lastCommand: report });
}

/** Keys the ACU interprets itself; telemetry must never overwrite them. */
const RESERVED = new Set(["mac", "event", "lastSeenLocation", "destinations"]);

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); })]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Native readings (battery, Wi-Fi, memory) + camera upload stats + app state. Never throws. */
export async function collectTelemetry(): Promise<Telemetry> {
  const [device, camera] = await Promise.all([
    Platform.OS === "android" ? withTimeout(NativeDevice.getTelemetry(), 1_000) : Promise.resolve(null),
    withTimeout(PuduCamera.uploadStats(), 1_000),
  ]);
  const result: Telemetry = {
    ...(device ?? {}),
    ...(camera ? { cameraUpload: camera } : {}),
    cameraGatewayBound: PuduCamera.isBound(),
    faceCameraOn: PuduCamera.isRunning("face"),
    ...appState,
    telemetryAt: new Date().toISOString(),
  };
  for (const key of RESERVED) delete result[key];
  return result;
}
