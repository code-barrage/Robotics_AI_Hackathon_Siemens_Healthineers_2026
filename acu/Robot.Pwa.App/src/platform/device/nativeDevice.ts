import { NativeModules } from "react-native";

export interface NativeDeviceInfo {
  ip: string;
  mac: string;
  firmware: string;
}

/**
 * Native module (android/app/src/main/java/com/acu/robotpwa/AcuDeviceInfoModule.java) that reads
 * the device's MAC/IP/firmware via Android's NetworkInterface/WifiManager/Build APIs — same
 * Java logic as the old Capacitor DeviceInfoPlugin, exposed through React Native's
 * `NativeModules` registry instead of `registerPlugin(...)`.
 *
 * Registered as "AcuDeviceInfo", not "DeviceInfo" — React Native itself ships a built-in core
 * module already named "DeviceInfo" (used for Dimensions/PixelRatio), so reusing that name
 * would collide with it instead of exposing our own methods.
 */
export interface NativeTelemetry {
  batteryPercent?: number;
  charging?: boolean;
  powerSource?: string;
  batteryTempC?: number;
  batteryVoltage?: number;
  wifiRssi?: number;
  memFreeMb?: number;
  memTotalMb?: number;
  uptimeSec?: number;
  ip?: string;
}

const { AcuDeviceInfo: DeviceInfoNative } = NativeModules;

export const NativeDevice = {
  getDeviceInfo(): Promise<NativeDeviceInfo> {
    return DeviceInfoNative.getDeviceInfo();
  },
  /** Battery, Wi-Fi signal, memory and uptime; requires an APK built with AcuDeviceInfoModule.getTelemetry. */
  async getTelemetry(): Promise<NativeTelemetry | null> {
    if (typeof DeviceInfoNative?.getTelemetry !== "function") return null;
    return DeviceInfoNative.getTelemetry();
  },
};
