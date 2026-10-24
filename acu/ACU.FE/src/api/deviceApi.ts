import axios from 'axios';
import type { DeviceRequest, RegisteredDevice, Instruction } from '../types';

// Point at the C# ApiGateway. Override with VITE_API_BASE_URL in .env for local dev.
// e.g. VITE_API_BASE_URL=http://INBLRGHVDICT581:3000
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Shape returned by the C# ApiGateway (AcuStorage.Models.Device + assignment join)
interface BackendDevice {
  deviceId: string;
  name: string;
  ip: string;
  mac: string;
  firmware: string;
  registeredAt: string;
  status: 'pending' | 'approved' | 'rejected';
  lastSeen?: string;
  online: boolean;
  statusData?: Record<string, unknown>;
  instructions?: string;
  recentEvents?: Array<{ event: string; receivedAt: string }>;
  assignedWorkflowId?: string;
  destinations?: Array<{ name: string; type: string; x?: number; y?: number; z?: number }>;
  paused?: boolean;
  pauseReason?: string | null;
}

function toDeviceRequest(d: BackendDevice): DeviceRequest {
  return {
    id: d.deviceId,
    deviceName: d.name,
    deviceId: d.deviceId,
    ipAddress: d.ip,
    macAddress: d.mac,
    firmwareVersion: d.firmware || undefined,
    requestedAt: d.registeredAt,
    status: d.status === 'rejected' ? 'denied' : d.status,
    deviceType: 'mobile-robot',
  };
}

function toRegisteredDevice(d: BackendDevice): RegisteredDevice {
  const lastSeen = (d.lastSeen ?? (d.statusData?.['timestamp'] as string) ?? d.registeredAt);
  const firmware = (d.statusData?.['firmware'] as string) || d.firmware || undefined;
  const statusData = d.statusData
    ? Object.fromEntries(Object.entries(d.statusData).map(([k, v]) => [k, String(v)]))
    : undefined;
  return {
    id: d.deviceId,
    deviceName: d.name,
    deviceId: d.deviceId,
    deviceType: 'mobile-robot',
    ipAddress: d.ip,
    macAddress: d.mac,
    firmwareVersion: firmware,
    connectedAt: d.registeredAt,
    lastSeen,
    isOnline: d.online,
    lastEvent: d.statusData?.['event'] ? String(d.statusData['event']) : undefined,
    assignedWorkflowId: d.assignedWorkflowId ?? undefined,
    eventQueue: d.recentEvents ?? [],
    statusData,
    destinations: d.destinations ?? [],
    paused: d.paused ?? false,
    pauseReason: d.pauseReason ?? undefined,
  };
}

export const deviceApi = {
  /**
   * Single round-trip fetch of all devices, partitioned into the two shapes
   * the UI cares about. Use this instead of `getAllRequests` +
   * `getRegisteredDevices` to avoid hitting `/api/acu/devices` twice per
   * poll cycle.
   */
  getAllDevices: async (): Promise<{ requests: DeviceRequest[]; registered: RegisteredDevice[] }> => {
    const res = await apiClient.get<BackendDevice[]>('/api/acu/devices');
    const requests: DeviceRequest[] = [];
    const registered: RegisteredDevice[] = [];
    for (const d of res.data) {
      if (d.status === 'approved') registered.push(toRegisteredDevice(d));
      else requests.push(toDeviceRequest(d));
    }
    return { requests, registered };
  },

  getAllRequests: async (): Promise<DeviceRequest[]> => {
    const { requests } = await deviceApi.getAllDevices();
    return requests;
  },

  approveRequest: async (deviceId: string): Promise<void> => {
    await apiClient.post(`/api/acu/accept/${deviceId}`);
  },

  denyRequest: async (deviceId: string): Promise<void> => {
    await apiClient.post(`/api/acu/reject/${deviceId}`);
  },

  getRegisteredDevices: async (): Promise<RegisteredDevice[]> => {
    const { registered } = await deviceApi.getAllDevices();
    return registered;
  },

  sendInstruction: async (deviceId: string, command: string, _payload?: string): Promise<Instruction> => {
    await apiClient.post(`/api/acu/instructions/${deviceId}`, { command });
    return {
      id: `ins-${Date.now()}`,
      deviceId,
      command,
      sentAt: new Date().toISOString(),
      status: 'success',
    };
  },

  getInstructionLog: async (_deviceId: string): Promise<Instruction[]> => {
    return []; // instruction log is maintained client-side
  },

  /** Clear a re-identification auto-pause after the operator confirms the patient is back. */
  resumeEscort: async (deviceId: string): Promise<void> => {
    await apiClient.post(`/api/acu/resume/${deviceId}`);
  },

  unregisterDevice: async (deviceId: string, mac: string): Promise<void> => {
    await apiClient.delete(`/api/bot/unregister/${deviceId}`, { data: { mac } });
  },

  /** ACU-wide settings delivered to every robot with its heartbeat response. */
  getAcuSettings: async (): Promise<AcuSettings> => {
    const res = await apiClient.get<AcuSettings>('/api/acu/settings');
    return res.data;
  },

  updateAcuSettings: async (settings: AcuSettings): Promise<AcuSettings> => {
    const res = await apiClient.put<AcuSettings>('/api/acu/settings', settings);
    return res.data;
  },
};

export interface AcuSettings {
  /** BCP-47 tag (e.g. "de-DE", "hi-IN") the robot uses for workflow-step TTS. */
  speechLanguage: string;
}

export { BASE_URL };
export default apiClient;
