import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios BEFORE importing the module under test. deviceApi builds its
// client via axios.create(), so create() must return our stub client.
// vi.hoisted lets the stub be defined before the hoisted vi.mock factory runs.
const mockClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("axios", () => ({
  default: { create: () => mockClient },
}));

import { deviceApi } from "../../../src/api/deviceApi";

// A minimal backend device row as returned by GET /api/acu/devices.
function backendDevice(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "robot-001",
    name: "Ward Bot",
    ip: "192.168.1.42",
    mac: "AA:BB:CC:DD:EE:FF",
    firmware: "v1.0.0",
    registeredAt: "2026-01-01T00:00:00Z",
    status: "pending",
    online: false,
    ...overrides,
  };
}

describe("deviceApi.getAllDevices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("partitions approved devices into registered and the rest into requests", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        backendDevice({ deviceId: "a", status: "approved", online: true }),
        backendDevice({ deviceId: "b", status: "pending" }),
        backendDevice({ deviceId: "c", status: "rejected" }),
      ],
    });

    const { requests, registered } = await deviceApi.getAllDevices();

    expect(mockClient.get).toHaveBeenCalledWith("/api/acu/devices");
    expect(registered.map((r) => r.id)).toEqual(["a"]);
    expect(requests.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("maps a rejected backend status to the UI 'denied' status", async () => {
    mockClient.get.mockResolvedValue({
      data: [backendDevice({ status: "rejected" })],
    });

    const { requests } = await deviceApi.getAllDevices();

    expect(requests[0].status).toBe("denied");
  });

  it("maps backend fields onto the registered-device shape", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        backendDevice({
          status: "approved",
          online: true,
          assignedWorkflowId: "wf-1",
          recentEvents: [{ event: "workflow_started", receivedAt: "t" }],
          destinations: [{ name: "Reception", type: "usher" }],
        }),
      ],
    });

    const { registered } = await deviceApi.getAllDevices();
    const d = registered[0];

    expect(d.deviceName).toBe("Ward Bot");
    expect(d.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    expect(d.isOnline).toBe(true);
    expect(d.assignedWorkflowId).toBe("wf-1");
    expect(d.eventQueue).toHaveLength(1);
    expect(d.destinations?.[0].name).toBe("Reception");
  });
});
