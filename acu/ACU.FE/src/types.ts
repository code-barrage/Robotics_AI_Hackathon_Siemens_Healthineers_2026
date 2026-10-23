export type ConnectionStatus = "pending" | "approved" | "denied";

interface RobotButton { Label: string; Action: "Next" | "Previous"; }
interface RobotButtons { Yes: RobotButton; No: RobotButton; }
interface RobotMedia {
  VideoPath?: string; AudioPath?: string; ImagePath?: string; TTS?: string; Buttons?: RobotButtons;
}
interface RobotWorkflowStep {
  StepId: string; ScreenId: string; Title?: string; TTS?: string;
  StartDestinationName?: string; NextDestinationName?: string;
  Video?: RobotMedia[]; Audio?: RobotMedia[]; Image?: RobotMedia[]; Buttons?: RobotButtons;
}
export interface RobotWorkflow {
  WorkflowID: string; WorkflowName: string; Description: string; RobotId: string; Steps: RobotWorkflowStep[];
}

/** A single Pudu robot map waypoint, as received from the bot via WebSocket. */
export interface MapDestination {
  name: string;
  type: string;   // Pudu point type e.g. "table", "usher", "transit", "dining_outlet"
  x?:   number;
  y?:   number;
  z?:   number;
}

export interface DeviceRequest {
  id: string;
  deviceName: string;
  deviceId: string;
  ipAddress: string;
  macAddress: string;
  requestedAt: string;
  status: ConnectionStatus;
  description?: string;
  firmwareVersion?: string;
  deviceType: "robot-arm" | "mobile-robot" | "drone" | "sensor-unit" | "controller";
}

export interface RegisteredDevice {
  id: string;
  deviceName: string;
  deviceId: string;
  deviceType: DeviceRequest["deviceType"];
  ipAddress: string;
  macAddress: string;
  firmwareVersion?: string;
  connectedAt: string;
  lastSeen: string;
  isOnline: boolean;
  lastEvent?: string;
  assignedWorkflowId?: string;
  eventQueue?: Array<{ event: string; receivedAt: string }>;
  statusData?: Record<string, string>;
  /** Destinations received from the bot via WebSocket on startup. */
  destinations?: MapDestination[];
}

export interface Instruction {
  id: string;
  deviceId: string;
  command: string;
  payload?: string;
  sentAt: string;
  status: "success" | "failed" | "pending";
}

/* --- Workflows -------------------------------------------- */

export interface LocalizedString {
  en: string;
  de?: string;
}

export interface WorkflowDataEntry {
  destination_categories: string[];
  destination_names: string[];
}

export interface ConfirmationStep {
  type: "confirmation";
  title?: LocalizedString;
  text?: LocalizedString;
  button_text?: LocalizedString;
  tts?: string;
  status_event?: string;
  can_go_back?: boolean;
}

export interface FollowMeStep {
  type: "follow_me";
  title?: LocalizedString;
  subtitle?: LocalizedString;
  destination?: string;
  duration_ms: number;
}

export interface VideoPlaybackStep {
  type: "video_playback";
  video: string;
}

export interface FinishedStep {
  type: "finished";
  status_event?: string;
}

export type WorkflowStep = ConfirmationStep | FollowMeStep | VideoPlaybackStep | FinishedStep;

export interface Workflow {
  id: string;
  name: string;
  description: string;
  data_entry: WorkflowDataEntry;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export type AppTab = "requests" | "devices" | "workflows" | "ct" | "settings";