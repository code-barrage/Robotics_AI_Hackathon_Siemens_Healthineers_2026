import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeviceInfo, PuduConfig } from "../config/types";

const CONFIG_KEY = "robotPwa.config";
const DEVICE_KEY = "robotPwa.device";

/**
 * There is no "window.location.hostname" in React Native (no browser, no URL bar) and no
 * reliable way to guess where the ACU server lives — unlike the old PWA's browser-tab dev
 * fallback, a React Native build is always a real installed app, so this always returns ""
 * and leaves the field for mDNS auto-discovery or manual entry.
 */
function defaultAcuUrl(): string {
  return "";
}

/**
 * AsyncStorage (React Native's equivalent of the browser's localStorage) is asynchronous —
 * every read/write is a Promise, so callers must `await` these functions. This is the single
 * biggest behavioral difference from the old PWA's storage.ts, and it's why App.tsx now needs
 * a loading/bootstrap state instead of synchronously computing the initial stage.
 */
export async function loadConfig(): Promise<PuduConfig> {
  const base: PuduConfig = {
    apiAppKey: "APIDaxtOXHv6u647sGWUmhFe6473om3yQ9TMR",
    apiAppSecret: "nUUSM4aH8Y1BnUHvwqhvSL6g9kBmZguuv7OHujE",
    puduUrlCss: "https://css-open-platform.pudutech.com/pudu-entry",
    robotSn: "8PP076724060001",
    acuUrl: defaultAcuUrl(),
  };
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return base;
  try {
    return { ...base, ...JSON.parse(raw) };
  } catch {
    return base;
  }
}

export async function saveConfig(config: PuduConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function loadDevice(): Promise<DeviceInfo | null> {
  const raw = await AsyncStorage.getItem(DEVICE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceInfo;
  } catch {
    return null;
  }
}

export async function saveDevice(device: DeviceInfo): Promise<void> {
  await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(device));
}

/** Wipes saved config/device so the app restarts at the Config stage — used by the local dev reset button. */
export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([CONFIG_KEY, DEVICE_KEY]);
}
