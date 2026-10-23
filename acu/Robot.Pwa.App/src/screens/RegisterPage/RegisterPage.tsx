import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from "react-native";

import { loadConfig, saveConfig, saveDevice } from "../../storage/appStorage";
import type { DeviceInfo } from "../../config/types";
import { getRegistrationStatus, registerBot } from "../../api/acu/deviceApi";
import { NativeDevice } from "../../platform/device/nativeDevice";
import { HttpError } from "../../api/http/jsonRequest";
import { reportUserError } from "../../api/userError";
import { isSameDeviceRegistrationConflict } from "../../features/registration/model/registrationConflict";
import { useTheme } from "../../theme";
import Button from "../../components/Button";
import { createStyles } from "./RegisterPage.styles";

const EMPTY: DeviceInfo = { deviceId: "8PP076724060001", name: "Pudu Bot BLR", ip: "", mac: "", firmware: "" };
const APPROVAL_POLL_MS = 3_000;

interface Props {
  onRegistered: () => void;
}

export default function RegisterPage({ onRegistered }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [device, setDevice] = useState<DeviceInfo>(EMPTY);
  const [acuUrl, setAcuUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // After registering, the device is "pending" on ACU until an operator approves it.
  useEffect(() => {
    if (!waiting) return;
    let finished = false;

    const poll = async () => {
      try {
        const { acuUrl: url } = await loadConfig();
        const { status } = await getRegistrationStatus(url, device.deviceId);
        if (finished) return;
        setError(null);
        setLastStatus(status);
        if (status === "approved") {
          finished = true;
          try {
            await saveDevice(device);
          } catch (cause) {
            console.warn("Could not save device registration", cause);
            setWaiting(false);
            setError("Could not save device registration.");
            return;
          }
          onRegistered();
        } else if (status === "rejected" || status === "unregistered") {
          finished = true;
          setWaiting(false);
          setError(status === "rejected"
            ? "Registration rejected."
            : "Device is not registered. Please register again.");
        }
      } catch (cause) {
        if (!finished) setError(reportUserError(cause, "acu"));
      }
    };

    poll();
    const timer = setInterval(poll, APPROVAL_POLL_MS);
    return () => {
      finished = true;
      clearInterval(timer);
    };
  }, [waiting]);

  useEffect(() => {
    loadConfig().then((c) => setAcuUrl(c.acuUrl)).catch((cause: unknown) => {
      console.warn("Could not load configuration", cause);
      setError("Could not load settings.");
    });

    if (Platform.OS === "web") return;

    // Auto-fetch real runtime hardware IP, MAC, and firmware just like Robot.App
    NativeDevice.getDeviceInfo()
      .then((info) => {
        setDevice((d) => ({
          ...d,
          ip: info.ip || d.ip,
          mac: info.mac || d.mac,
          firmware: info.firmware || d.firmware,
        }));
      })
      .catch((cause: unknown) => {
        console.warn("Could not read device details", cause);
        setError("Could not read device details. Enter them manually.");
      });
  }, []);

  function update<K extends keyof DeviceInfo>(key: K, value: string) {
    setDevice((d) => ({ ...d, [key]: value }));
  }

  async function handleRegister() {
    if (!device.deviceId.trim() || !device.mac.trim()) {
      setError("Enter the device SN and MAC.");
      return;
    }
    const targetUrl = acuUrl.trim().replace(/\/+$/, "");
    try {
      const server = new URL(targetUrl);
      if (!["http:", "https:"].includes(server.protocol) || !server.hostname)
        throw new Error("Invalid server address.");
    } catch {
      setError("Enter a valid server address with http:// or https://.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      try {
        await saveConfig({ ...(await loadConfig()), acuUrl: targetUrl });
      } catch (cause) {
        console.warn("Could not save server address", cause);
        setError("Could not save server address.");
        return;
      }
      await registerBot(targetUrl, device);
      setWaiting(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Re-registering a pending device (e.g. after an app restart) resumes waiting for approval.
      if (err instanceof HttpError && isSameDeviceRegistrationConflict(err.status, msg, device.deviceId)) {
        setWaiting(true);
      } else {
        setError(reportUserError(err, "registration"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <View style={styles.waitingContainer} testID="waiting-confirmation">
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.heading}>Waiting for confirmation</Text>
        <Text style={styles.hint}>An operator must approve this robot in ACU.</Text>
        <Text style={styles.hint} testID="waiting-status">
          {`Device ${device.deviceId} · ACU status: ${lastStatus ?? "checking…"}`}
        </Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button variant="outline" label="Cancel" onPress={() => setWaiting(false)} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.heading}>Register Bot to ACU</Text>
        <Text style={styles.label}>Server</Text>
        <TextInput
          testID="registration-server"
          accessibilityLabel="Server"
          style={styles.input}
          placeholder="http://localhost:3000"
          placeholderTextColor={colors.muted}
          value={acuUrl}
          onChangeText={setAcuUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
        />

        <Text style={styles.label}>Device ID</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. robot-001"
          placeholderTextColor={colors.muted}
          value={device.deviceId}
          onChangeText={(v) => update("deviceId", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Pudu Bot Lobby"
          placeholderTextColor={colors.muted}
          value={device.name}
          onChangeText={(v) => update("name", v)}
        />

        <Text style={styles.label}>IP</Text>
        <TextInput
          style={styles.input}
          placeholder="Auto-detected from network"
          placeholderTextColor={colors.muted}
          value={device.ip}
          onChangeText={(v) => update("ip", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>MAC</Text>
        <TextInput
          style={styles.input}
          placeholder="Auto-detected hardware MAC"
          placeholderTextColor={colors.muted}
          value={device.mac}
          onChangeText={(v) => update("mac", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Firmware</Text>
        <TextInput
          style={styles.input}
          placeholder="Auto-detected OS/Model"
          placeholderTextColor={colors.muted}
          value={device.firmware}
          onChangeText={(v) => update("firmware", v)}
        />

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label={busy ? "Registering…" : "Register"} onPress={handleRegister} disabled={busy} style={styles.button} />
      </View>
    </ScrollView>
  );
}
