package com.acu.robotpwa.mdns;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class AcuDiscoveryModule extends ReactContextBaseJavaModule {

    private static final String SERVICE_TYPE = "_pudu-cc._tcp";
    private static final String SERVICE_TYPE_BASE = "_pudu-cc";

    private NsdManager nsdManager;
    private WifiManager wifiManager;
    private WifiManager.MulticastLock multicastLock;
    private NsdManager.DiscoveryListener discoveryListener;
    private boolean isDiscovering = false;
    private boolean discoveryEnabled = true;
    private ConnectivityManager connectivityManager;
    private boolean networkCallbackRegistered;
    private final ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override
        public void onAvailable(Network network) {
            synchronized (AcuDiscoveryModule.this) {
                if (!discoveryEnabled) return;
                lastDiscoveredUrl = null;
                stopInternalDiscovery();
                startInternalDiscovery();
            }
        }
    };

    private volatile String lastDiscoveredUrl = null;

    public AcuDiscoveryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        Context context = reactContext.getApplicationContext();
        nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        startInternalDiscovery();
        connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        try {
            connectivityManager.registerNetworkCallback(new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), networkCallback);
            networkCallbackRegistered = true;
        } catch (RuntimeException e) {
            Log.e("AcuDiscovery", "Could not monitor Wi-Fi changes", e);
        }
    }

    @NonNull
    @Override
    public String getName() {
        return "AcuDiscovery";
    }

    @ReactMethod
    public void getDiscoveredUrl(Promise promise) {
        WritableMap ret = Arguments.createMap();
        ret.putString("url", lastDiscoveredUrl);
        promise.resolve(ret);
    }

    @ReactMethod
    public synchronized void startDiscovery(Promise promise) {
        discoveryEnabled = true;
        startInternalDiscovery();
        promise.resolve(null);
    }

    @ReactMethod
    public synchronized void stopDiscovery(Promise promise) {
        discoveryEnabled = false;
        stopInternalDiscovery();
        promise.resolve(null);
    }

    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(double count) {
    }

    private synchronized void startInternalDiscovery() {
        if (isDiscovering || nsdManager == null) return;
        isDiscovering = true;
        acquireMulticastLock();

        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String regType) {
            }

            @Override
            public void onServiceFound(NsdServiceInfo service) {
                String type = service.getServiceType() != null ? service.getServiceType().toLowerCase() : "";
                String name = service.getServiceName() != null ? service.getServiceName().toLowerCase() : "";
                if (type.contains(SERVICE_TYPE_BASE) || name.contains(SERVICE_TYPE_BASE)) {
                    resolveService(service, this);
                }
            }

            @Override
            public void onServiceLost(NsdServiceInfo service) {
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                synchronized (AcuDiscoveryModule.this) {
                    if (discoveryListener != this) return;
                    isDiscovering = false;
                    releaseMulticastLock();
                }
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                synchronized (AcuDiscoveryModule.this) {
                    if (discoveryListener != this) return;
                    Log.e("AcuDiscovery", "Discovery start failed: " + errorCode);
                    isDiscovering = false;
                    releaseMulticastLock();
                }
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                Log.e("AcuDiscovery", "Discovery stop failed: " + errorCode);
            }
        };

        try {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
        } catch (Exception e) {
            Log.e("AcuDiscovery", "Could not start discovery", e);
            isDiscovering = false;
            releaseMulticastLock();
        }
    }

    private synchronized void stopInternalDiscovery() {
        if (!isDiscovering || nsdManager == null || discoveryListener == null) return;
        try {
            nsdManager.stopServiceDiscovery(discoveryListener);
        } catch (Exception e) {
            Log.w("AcuDiscovery", "Could not stop discovery", e);
        }
        discoveryListener = null;
        releaseMulticastLock();
        isDiscovering = false;
    }

    @SuppressWarnings("deprecation")
    private synchronized void resolveService(NsdServiceInfo service, NsdManager.DiscoveryListener session) {
        if (!isDiscovering || discoveryListener != session) return;
        nsdManager.resolveService(service, new NsdManager.ResolveListener() {
            @Override
            public void onServiceResolved(NsdServiceInfo resolved) {
                synchronized (AcuDiscoveryModule.this) {
                    if (!isDiscovering || discoveryListener != session) return;
                    if (resolved.getHost() == null) return;
                    String host = resolved.getHost().getHostAddress();
                    int port = resolved.getPort();
                    lastDiscoveredUrl = "http://" + host + ":" + port;

                    WritableMap data = Arguments.createMap();
                    data.putString("url", lastDiscoveredUrl);
                    data.putString("host", host);
                    data.putInt("port", port);
                    emitEvent("discovered", data);
                }
            }

            @Override
            public void onResolveFailed(NsdServiceInfo service, int errorCode) {
                Log.w("AcuDiscovery", "Service resolution failed: " + errorCode);
            }
        });
    }

    private void emitEvent(String eventName, WritableMap data) {
        ReactApplicationContext context = getReactApplicationContext();
        if (context == null) return;
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, data);
    }

    private void acquireMulticastLock() {
        try {
            if (wifiManager != null) {
                multicastLock = wifiManager.createMulticastLock("acu-discovery-lock");
                multicastLock.setReferenceCounted(true);
                multicastLock.acquire();
            }
        } catch (Exception e) {
            // ignored — discovery still runs, just subject to OS multicast throttling
        }
    }

    private void releaseMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
            }
        } catch (Exception e) {
            // ignored
        }
        multicastLock = null;
    }

    @Override
    public synchronized void invalidate() {
        discoveryEnabled = false;
        if (networkCallbackRegistered) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException e) {
                Log.w("AcuDiscovery", "Could not stop Wi-Fi monitoring", e);
            }
        }
        stopInternalDiscovery();
        super.invalidate();
    }
}
