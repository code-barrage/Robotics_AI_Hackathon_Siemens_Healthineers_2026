import { useState, useEffect, useCallback, useRef } from "react";
import type { DeviceRequest, RegisteredDevice } from "../types";

/** Poll cadence while the server is reachable. */
const POLL_INTERVAL_ONLINE_MS  = 3_000;
/** Initial back-off delay after a failure. */
const POLL_INTERVAL_OFFLINE_MIN_MS = 5_000;
/** Cap for the back-off delay; subsequent failures double up to this. */
const POLL_INTERVAL_OFFLINE_MAX_MS = 30_000;

export function useDeviceData() {
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null);
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Holds the current back-off delay; doubles on each consecutive failure.
  const offlineDelayRef = useRef<number>(POLL_INTERVAL_OFFLINE_MIN_MS);

  function showNotification(message: string, type: "success" | "error") {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }

  const fetchData = useCallback(async (): Promise<boolean> => {
    try {
      const { deviceApi } = await import("../api/deviceApi");
      // Single round-trip — partitions the response client-side.
      const { requests: reqs, registered } = await deviceApi.getAllDevices();
      setRequests(reqs);
      setRegisteredDevices(registered);
      setLastRefreshed(new Date());
      setIsServerOnline(true);
      offlineDelayRef.current = POLL_INTERVAL_OFFLINE_MIN_MS; // reset back-off
      return true;
    } catch {
      setIsServerOnline(false); // show offline banner instead of spamming toasts
      return false;
    }
  }, []);

  // Adaptive poller: 3 s while healthy, exponential back-off (5 → 10 → 20 → 30 s)
  // while the server is unreachable. Reschedules itself after each attempt so a
  // failed call doesn't drag the healthy cadence down.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = async () => {
      const ok = await fetchData();
      if (cancelled) return;
      const next = ok
        ? POLL_INTERVAL_ONLINE_MS
        : offlineDelayRef.current;
      if (!ok) {
        offlineDelayRef.current = Math.min(
          offlineDelayRef.current * 2,
          POLL_INTERVAL_OFFLINE_MAX_MS,
        );
      }
      timer = setTimeout(tick, next);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchData]);

  async function handleApprove(id: string) {
    const device = requests.find((r) => r.id === id);
    if (!device) return;
    setLoadingId(id);
    try {
      const { deviceApi } = await import("../api/deviceApi");
      await deviceApi.approveRequest(device.deviceId);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "approved" as const } : r)));
      showNotification("Device connection approved.", "success");
    } catch {
      showNotification("Failed to approve request.", "error");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDeny(id: string) {
    const device = requests.find((r) => r.id === id);
    if (!device) return;
    setLoadingId(id);
    try {
      const { deviceApi } = await import("../api/deviceApi");
      await deviceApi.denyRequest(device.deviceId);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "denied" as const } : r)));
      showNotification("Device connection denied.", "error");
    } catch {
      showNotification("Failed to deny request.", "error");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleUnregister(id: string) {
    const device = registeredDevices.find((d) => d.id === id);
    if (!device) return;
    setUnregisteringId(id);
    try {
      const { deviceApi } = await import("../api/deviceApi");
      await deviceApi.unregisterDevice(device.deviceId, device.macAddress);
      setRegisteredDevices((prev) => prev.filter((d) => d.id !== id));
      showNotification(`${device.deviceName} unregistered successfully.`, "success");
    } catch {
      showNotification("Failed to unregister device.", "error");
    } finally {
      setUnregisteringId(null);
    }
  }

  return {
    requests,
    registeredDevices,
    lastRefreshed,
    loadingId,
    unregisteringId,
    isServerOnline,
    notification,
    fetchData,
    handleApprove,
    handleDeny,
    handleUnregister,
  };
}
