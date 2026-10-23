import type { DeviceInfo } from "../../config/types";

export type DeviceDestination = {
  name: string; type: string; x?: number | null; y?: number | null; z?: number | null;
};
export type DeviceRecord = DeviceInfo & {
  registeredAt?: string; status?: "pending" | "approved" | "rejected";
  lastSeen?: string; online?: boolean; statusData?: Record<string, unknown> | null;
  destinations: DeviceDestination[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function destination(value: unknown): value is DeviceDestination {
  return record(value) && typeof value.name === "string" && typeof value.type === "string" &&
    ["x", "y", "z"].every((key) => value[key] === undefined || value[key] === null ||
      (typeof value[key] === "number" && Number.isFinite(value[key])));
}

function device(value: unknown): value is DeviceRecord {
  return record(value) && ["deviceId", "name", "ip", "mac", "firmware"].every(
    (key) => typeof value[key] === "string"
  ) && ["registeredAt", "lastSeen"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
    (value.status === undefined || value.status === "pending" || value.status === "approved" || value.status === "rejected") &&
    (value.online === undefined || typeof value.online === "boolean") &&
    (value.statusData === undefined || value.statusData === null || record(value.statusData)) &&
    Array.isArray(value.destinations) && value.destinations.every(destination);
}

/** The root of device.schema.json is a dictionary, not a bare device or heartbeat envelope. */
export function parseDeviceDocument(value: unknown, deviceId: string): DeviceRecord {
  if (!record(value) || !Object.entries(value).every(([id, item]) => device(item) && item.deviceId === id) ||
      !device(value[deviceId])) {
    throw new Error("ACU returned an invalid device.schema.json document for this robot.");
  }
  return value[deviceId];
}
