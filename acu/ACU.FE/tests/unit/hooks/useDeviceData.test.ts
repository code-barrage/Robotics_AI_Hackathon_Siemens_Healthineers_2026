import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock the API module the hook imports dynamically (`await import("../api/deviceApi")`).
const getAllDevices = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/deviceApi", () => ({
  deviceApi: { getAllDevices },
}));

import { useDeviceData } from "../../../src/hooks/useDeviceData";

const emptyPayload = { requests: [], registered: [] };

describe("useDeviceData polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getAllDevices.mockReset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("fetches on mount and marks the server online", async () => {
    getAllDevices.mockResolvedValue(emptyPayload);
    const { result } = renderHook(() => useDeviceData());

    await vi.advanceTimersByTimeAsync(0); // flush the mount fetch
    expect(getAllDevices).toHaveBeenCalledTimes(1);
    expect(result.current.isServerOnline).toBe(true);
  });

  it("polls every 3s while healthy", async () => {
    getAllDevices.mockResolvedValue(emptyPayload);
    renderHook(() => useDeviceData());

    await vi.advanceTimersByTimeAsync(0);
    expect(getAllDevices).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(getAllDevices).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(getAllDevices).toHaveBeenCalledTimes(3);
  });

  it("marks the server offline and backs off (5s → 10s) after failures", async () => {
    getAllDevices.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useDeviceData());

    await vi.advanceTimersByTimeAsync(0); // mount attempt fails
    expect(getAllDevices).toHaveBeenCalledTimes(1);
    expect(result.current.isServerOnline).toBe(false);

    // Should not retry before the 5s back-off elapses.
    await vi.advanceTimersByTimeAsync(4999);
    expect(getAllDevices).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getAllDevices).toHaveBeenCalledTimes(2);

    // Next back-off doubles to 10s.
    await vi.advanceTimersByTimeAsync(9999);
    expect(getAllDevices).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(getAllDevices).toHaveBeenCalledTimes(3);
  });

  it("resets to the 3s cadence once the server recovers", async () => {
    getAllDevices.mockRejectedValueOnce(new Error("down"))
                 .mockResolvedValue(emptyPayload);
    const { result } = renderHook(() => useDeviceData());

    await vi.advanceTimersByTimeAsync(0); // fail on mount
    expect(getAllDevices).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000); // back-off retry succeeds
    expect(getAllDevices).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0); // flush the success state update
    expect(result.current.isServerOnline).toBe(true);

    // Cadence is back to 3s, not the 10s doubled back-off.
    await vi.advanceTimersByTimeAsync(3000);
    expect(getAllDevices).toHaveBeenCalledTimes(3);
  });
});
