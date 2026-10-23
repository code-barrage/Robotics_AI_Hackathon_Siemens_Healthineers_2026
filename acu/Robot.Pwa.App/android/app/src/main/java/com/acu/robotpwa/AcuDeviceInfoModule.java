package com.acu.robotpwa;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.SystemClock;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;

/**
Reads the device’s IP, MAC and Android/model information to prefill registration.
 */
public class AcuDeviceInfoModule extends ReactContextBaseJavaModule {

    public AcuDeviceInfoModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "AcuDeviceInfo";
    }

    @ReactMethod
    public void getDeviceInfo(Promise promise) {
        WritableMap result = Arguments.createMap();
        result.putString("ip", getIpAddress());
        result.putString("mac", getMacAddress());
        result.putString("firmware", getFirmware());
        promise.resolve(result);
    }

    /** Live telemetry for the heartbeat: battery, Wi-Fi signal, memory and uptime. Missing values are omitted. */
    @ReactMethod
    public void getTelemetry(Promise promise) {
        WritableMap t = Arguments.createMap();
        Context ctx = getReactApplicationContext().getApplicationContext();
        try {
            Intent battery = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (battery != null) {
                int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) t.putInt("batteryPercent", Math.round(level * 100f / scale));
                int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                t.putBoolean("charging", status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL);
                int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                t.putString("powerSource", plugged == BatteryManager.BATTERY_PLUGGED_AC ? "ac"
                    : plugged == BatteryManager.BATTERY_PLUGGED_USB ? "usb"
                    : plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS ? "wireless"
                    : plugged != 0 ? "dock" : "battery");
                int temp = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                if (temp != Integer.MIN_VALUE) t.putDouble("batteryTempC", temp / 10.0);
                int mv = battery.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
                if (mv > 0) t.putDouble("batteryVoltage", mv / 1000.0);
            }
        } catch (Exception ignored) { }
        try {
            WifiManager wifi = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            if (wifi != null && wifi.getConnectionInfo() != null) {
                int rssi = wifi.getConnectionInfo().getRssi();
                if (rssi > -127 && rssi < 0) t.putInt("wifiRssi", rssi);
            }
        } catch (Exception ignored) { }
        try {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mem = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mem);
                t.putDouble("memFreeMb", Math.round(mem.availMem / 1048576.0));
                t.putDouble("memTotalMb", Math.round(mem.totalMem / 1048576.0));
            }
        } catch (Exception ignored) { }
        t.putDouble("uptimeSec", SystemClock.elapsedRealtime() / 1000);
        t.putString("ip", getIpAddress());
        promise.resolve(t);
    }

    private String getIpAddress() {
        try {
            String ip = getIpFromNetworkInterface();
            if (ip != null && !ip.trim().isEmpty() && !ip.equals("0.0.0.0")) {
                return ip;
            }
            WifiManager wifiManager =
                (WifiManager) getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                int ipInt = wifiManager.getConnectionInfo().getIpAddress();
                if (ipInt != 0) {
                    return (ipInt & 0xFF) + "." + ((ipInt >> 8) & 0xFF) + "." + ((ipInt >> 16) & 0xFF) + "." + ((ipInt >> 24) & 0xFF);
                }
            }
        } catch (Exception e) {
            // fall through to default below
        }
        return "0.0.0.0";
    }

    private String getMacAddress() {
        try {
            for (String ifaceName : new String[]{"wlan0", "eth0"}) {
                NetworkInterface iface = NetworkInterface.getByName(ifaceName);
                if (iface == null) continue;
                byte[] mac = iface.getHardwareAddress();
                if (mac == null || mac.length == 0) continue;
                return formatMac(mac);
            }
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface iface : interfaces) {
                if (iface.isLoopback()) continue;
                byte[] mac = iface.getHardwareAddress();
                if (mac == null || mac.length == 0) continue;
                return formatMac(mac);
            }
        } catch (Exception e) {
            // fall through to default below
        }
        return "00:00:00:00:00:00";
    }

    private String formatMac(byte[] mac) {
        StringBuilder sb = new StringBuilder();
        for (byte b : mac) {
            sb.append(String.format("%02X:", b));
        }
        if (sb.length() > 0) sb.deleteCharAt(sb.length() - 1);
        return sb.toString();
    }

    private String getFirmware() {
        return "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") — " + Build.MANUFACTURER + " " + Build.MODEL;
    }

    private String getIpFromNetworkInterface() {
        try {
            for (String ifaceName : new String[]{"eth0", "wlan0"}) {
                NetworkInterface iface = NetworkInterface.getByName(ifaceName);
                if (iface == null || !iface.isUp() || iface.isLoopback()) continue;
                for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr.getHostAddress() != null && !addr.getHostAddress().contains(":")) {
                        return addr.getHostAddress();
                    }
                }
            }
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface iface : interfaces) {
                if (!iface.isUp() || iface.isLoopback()) continue;
                for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr.getHostAddress() != null && !addr.getHostAddress().contains(":")) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            // ignored — caller falls back to WifiManager / "0.0.0.0"
        }
        return null;
    }
}
