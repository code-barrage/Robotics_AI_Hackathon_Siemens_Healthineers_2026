import type { DeviceInfo } from "../../config/types";
import type { Destination } from "../../features/destinations/model/destination";
import { jsonRequest } from "../http/jsonRequest";

function base(acuUrl: string): string {
  return acuUrl.trim().replace(/\/+$/, "");
}

/** POST /api/bot/register — device enters "pending" until an operator approves it. */
export async function registerBot(acuUrl: string, device: DeviceInfo): Promise<void> {
  await jsonRequest(`${base(acuUrl)}/api/bot/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: device,
  });
}

export type RegistrationStatus = "pending" | "approved" | "rejected" | "unregistered";

/** GET /api/bot/registration-status/{deviceId} — always 200; poll it until the operator decides. */
export async function getRegistrationStatus(acuUrl: string, deviceId: string): Promise<{ status: RegistrationStatus }> {
  return await jsonRequest<{ status: RegistrationStatus }>(
    `${base(acuUrl)}/api/bot/registration-status/${encodeURIComponent(deviceId)}`,
    { method: "GET" }
  );
}

export type HeartbeatExtras = {
  event?: string;
  lastSeenLocation?: string;
  /** Sent right after registration and whenever the robot's destination list changes. */
  destinations?: Destination[];
  /** Extra status keys (battery, camera, app state); the ACU merges them into statusData. */
  telemetry?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type HeartbeatResponse = {
  deviceId: string;
  status: string;
  online: boolean;
  message?: string | null;
  instructions?: string | null;
  assignedWorkflowId?: string | null;
  speechLanguage?: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHeartbeatResponse(response: unknown): response is HeartbeatResponse {
  if (!record(response)) return false;
  return typeof response.deviceId === "string" &&
    typeof response.status === "string" && response.status.trim().length > 0 &&
    typeof response.online === "boolean" &&
    ["message", "instructions", "assignedWorkflowId"].every((key) =>
      response[key] === undefined || response[key] === null || typeof response[key] === "string") &&
    (response.speechLanguage === undefined ||
      (typeof response.speechLanguage === "string" && response.speechLanguage.trim().length > 0));
}

/** Destination payload ACU stores in devices.json. */
export function toAcuDestinations(destinations: Destination[]) {
  return destinations.map(({ name, type, x, y, z }) => ({ name, type: type?.trim() || "unknown", x, y, z }));
}

/**
 * POST /api/bot/device-status/{deviceId} — this is also the heartbeat.
 * Call it every few seconds; pass `event` when reporting something noteworthy (e.g. navigation start)
 * and `destinations` when the list changed (ACU replaces the stored list in devices.json).
 */
export async function sendHeartbeat(
  acuUrl: string,
  deviceId: string,
  mac: string,
  { event, lastSeenLocation, destinations, telemetry, signal }: HeartbeatExtras = {},
): Promise<HeartbeatResponse> {
  const response = await jsonRequest<unknown>(
    `${base(acuUrl)}/api/bot/device-status/${encodeURIComponent(deviceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        ...(telemetry ?? {}),
        mac,
        ...(event ? { event } : {}),
        ...(lastSeenLocation ? { lastSeenLocation } : {}),
        ...(destinations ? { destinations: toAcuDestinations(destinations) } : {}),
      },
      signal,
    }
  );
  if (!isHeartbeatResponse(response) || response.deviceId !== deviceId)
    throw new Error("ACU returned an invalid heartbeat response for this robot.");
  return response;
}
