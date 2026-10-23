import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type CameraId = "face" | "mark" | "tray";

export interface CameraInfo {
  id: CameraId;
  title: string;
  description: string;
  /** Face camera is off by default, Mark is normally on, Tray is always on with no switch. */
  defaultOn: boolean;
  switchable: boolean;
  /** AIDL calls behind this camera, shown in the debug screen. */
  apis: string[];
  warning?: string;
}

export const CAMERAS: CameraInfo[] = [
  {
    id: "face",
    title: "Face camera (monocular)",
    description: "Front face camera. Off by default.",
    defaultOn: false,
    switchable: true,
    apis: ["addMonoCameraListener", "runMonocularCamera", "stopMonocularCamera", "removeMonoCameraListener"],
  },
  {
    id: "mark",
    title: "Mark camera",
    description: "Navigation marker camera. Normally on.",
    defaultOn: true,
    switchable: true,
    apis: ["addMarkCameraListener", "runMarkerCamera", "stopMarkerCamera", "removeMarkCameraListener"],
    warning: "Stopping the Mark camera can break robot localisation. It is restored automatically on disconnect.",
  },
  {
    id: "tray",
    title: "Tray camera (pallet)",
    description: "Tray layers 0 and 1. Always on, no switch.",
    defaultOn: true,
    switchable: false,
    apis: ["addPalletCameraListener", "removePalletCameraListener"],
  },
];

export interface CameraFrame {
  camera: CameraId;
  width: number;
  height: number;
  timestamp: number;
  /** Tray only: 0 = first layer, 1 = second layer. */
  location?: number;
  /** Base64 JPEG when the native side provides a preview. */
  jpeg?: string;
}

export type CameraBackend = "native" | "unavailable";

type FrameListener = (frame: CameraFrame) => void;
type GatewayListener = (bound: boolean) => void;

interface NativePuduCamera {
  bind(): Promise<boolean>;
  unbind(): Promise<void>;
  startCamera(camera: CameraId): Promise<void>;
  stopCamera(camera: CameraId): Promise<void>;
  reRegisterTray(): Promise<void>;
  startUpload(acuUrl: string, robotId: string, intervalMs: number, includeMark: boolean): Promise<void>;
  stopUpload(): Promise<void>;
  getUploadStats(): Promise<CameraUploadStats>;
}

export interface CameraUploadStats {
  active: boolean;
  sent: number;
  failed: number;
  intervalMs: number;
  lastSentAt?: number;
  lastError?: string;
}

const native: NativePuduCamera | undefined = Platform.OS === "web" ? undefined : NativeModules.PuduCamera;

export const cameraBackend: CameraBackend = native ? "native" : "unavailable";

const frameListeners = new Set<FrameListener>();
const gatewayListeners = new Set<GatewayListener>();
const logListeners = new Set<(message: string) => void>();
let bound = false;
const running = new Set<CameraId>(CAMERAS.filter((c) => c.defaultOn).map((c) => c.id));
let nativeSubscribed = false;

function setBound(value: boolean) {
  bound = value;
  gatewayListeners.forEach((l) => l(value));
}

function subscribeNative() {
  if (nativeSubscribed || !native) return;
  nativeSubscribed = true;
  const emitter = new NativeEventEmitter(NativeModules.PuduCamera);
  emitter.addListener("PuduCameraFrame", (frame: CameraFrame) => frameListeners.forEach((l) => l(frame)));
  emitter.addListener("PuduCameraGateway", (e: { bound: boolean }) => setBound(e.bound));
  emitter.addListener("PuduCameraLog", (e: { message: string }) => logListeners.forEach((l) => l(e.message)));
}

function requireNative(): NativePuduCamera {
  if (!native) throw new Error("Robot cameras are unavailable on this device.");
  return native;
}

export const PuduCamera = {
  isBound: () => bound,
  isRunning: (camera: CameraId) => running.has(camera),

  onFrame(listener: FrameListener): () => void {
    subscribeNative();
    frameListeners.add(listener);
    return () => frameListeners.delete(listener);
  },

  onGatewayChange(listener: GatewayListener): () => void {
    gatewayListeners.add(listener);
    return () => gatewayListeners.delete(listener);
  },

  /** Step-by-step messages from the native module (binding, listener registration, first frames, errors). */
  onLog(listener: (message: string) => void): () => void {
    subscribeNative();
    logListeners.add(listener);
    return () => logListeners.delete(listener);
  },

  /** Binds TpRobotGatewayAidlService and registers the frame listeners. */
  async bind(): Promise<void> {
    const camera = requireNative();
    subscribeNative();
    const ok = await camera.bind();
    if (!ok) throw new Error("Could not connect to robot cameras.");
    setBound(true);
  },

  /** Stops the face camera, restores the Mark camera, removes listeners and unbinds. */
  async unbind(): Promise<void> {
    await requireNative().unbind();
    running.clear();
    CAMERAS.filter((c) => c.defaultOn).forEach((c) => running.add(c.id));
    setBound(false);
  },

  async start(camera: CameraId): Promise<void> {
    if (!bound) throw new Error("Connect to the robot gateway first.");
    await requireNative().startCamera(camera);
    running.add(camera);
  },

  async stop(camera: CameraId): Promise<void> {
    if (!bound) throw new Error("Connect to the robot gateway first.");
    await requireNative().stopCamera(camera);
    running.delete(camera);
  },

  /** Removes and re-adds the tray listener without disconnecting from the gateway. */
  async reRegisterTray(): Promise<void> {
    if (!bound) throw new Error("Connect to the robot gateway first.");
    await requireNative().reRegisterTray();
  },

  /**
   * Streams JPEG frames from native code to the ACU (POST /api/camera/frames), one per camera per interval.
   * Frames only flow while bound; the face camera must also be started to get front video.
   */
  async startUpload(acuUrl: string, robotId: string, intervalMs = 500, includeMark = false): Promise<void> {
    await requireNative().startUpload(acuUrl, robotId, intervalMs, includeMark);
  },

  async stopUpload(): Promise<void> {
    if (native) await native.stopUpload();
  },

  async uploadStats(): Promise<CameraUploadStats | null> {
    return native ? native.getUploadStats() : null;
  },
};
