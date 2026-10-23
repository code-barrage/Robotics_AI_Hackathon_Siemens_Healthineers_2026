import { NativeEventEmitter, NativeModules } from "react-native";

export interface DiscoveredEndpoint {
  url: string;
  host: string;
  port: number;
}

/**
 * Native module (android/app/src/main/java/com/acu/robotpwa/mdns/AcuDiscoveryModule.java)
 * that wraps Android's NsdManager to find the ACU server's _pudu-cc._tcp mDNS announcement
 * on the local network. This is the React Native "NativeModules" equivalent of the old
 * Capacitor AcuDiscoveryPlugin — same Java-side NsdManager logic, different JS-side plumbing:
 * Capacitor used `registerPlugin(...)`, React Native autolinks native modules into the
 * global `NativeModules` object instead, and events are delivered via `NativeEventEmitter`
 * rather than Capacitor's `Promise<PluginListenerHandle>`-returning `addListener`.
 */
const { AcuDiscovery: AcuDiscoveryNative } = NativeModules;

const acuDiscoveryEmitter = new NativeEventEmitter(AcuDiscoveryNative);

export const AcuDiscovery = {
  getDiscoveredUrl(): Promise<{ url: string | null }> {
    return AcuDiscoveryNative.getDiscoveredUrl();
  },
  startDiscovery(): Promise<void> {
    return AcuDiscoveryNative.startDiscovery();
  },
  stopDiscovery(): Promise<void> {
    return AcuDiscoveryNative.stopDiscovery();
  },
  /** Returns an EmitterSubscription synchronously — call `.remove()` directly, no `await`/`.then()` needed. */
  addListener(eventName: "discovered", listener: (endpoint: DiscoveredEndpoint) => void) {
    return acuDiscoveryEmitter.addListener(eventName, listener);
  },
};
