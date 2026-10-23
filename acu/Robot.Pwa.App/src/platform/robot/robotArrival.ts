import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export interface ArrivalEvent {
  tableNum: string;
}

/**
 * Native module (android/app/src/main/java/com/acu/robotpwa/RobotArrivalModule.java) that
 * dispatches the `robot://com.pudutech/order_result` Intent to the vendor robot OS and listens
 * for its arrival-callback Intent — same Java-side `startActivity(Intent)` / `onNewIntent`
 * logic as the old Capacitor RobotArrivalPlugin, exposed via React Native's `NativeModules` +
 * `NativeEventEmitter` instead of Capacitor's `registerPlugin(...)`.
 */
type NativeArrival = {
  moveToDestination(destination: string): Promise<{ success: boolean; destination: string }>;
  getLastArrival(): Promise<{ tableNum: string | null }>;
  clearLastArrival(tableNum: string): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
};

function native(): NativeArrival {
  if (Platform.OS !== "android")
    throw new Error("Movement is only available on the Android robot.");
  const module: NativeArrival | undefined = NativeModules.RobotArrival;
  if (!module) throw new Error("RobotArrival native module is missing. Rebuild the Android app.");
  return module;
}

let robotArrivalEmitter: NativeEventEmitter | undefined;

export const RobotArrival = {
  moveToDestination(options: { destination: string }): Promise<{ success: boolean; destination: string }> {
    return native().moveToDestination(options.destination);
  },
  getLastArrival(): Promise<{ tableNum: string | null }> {
    return native().getLastArrival();
  },
  clearLastArrival(tableNum: string): Promise<void> {
    return native().clearLastArrival(tableNum);
  },
  /** Returns an EmitterSubscription synchronously — call `.remove()` directly, no `await`/`.then()` needed. */
  addListener(eventName: "arrival", listener: (event: ArrivalEvent) => void) {
    robotArrivalEmitter ??= new NativeEventEmitter(native());
    return robotArrivalEmitter.addListener(eventName, listener);
  },
};
