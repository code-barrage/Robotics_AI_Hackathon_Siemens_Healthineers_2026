package com.acu.robotpwa;

import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
Sends the destination to the vendor robot app through an Android intent. Stores the latest arrival and emits an arrival event to TypeScript.
 */
// @ReactModule is required: under the New Architecture, ReactContext.getNativeModule(Class)
// resolves modules only via this annotation and otherwise returns null.
@ReactModule(name = RobotArrivalModule.NAME)
public class RobotArrivalModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RobotArrival";

    private String lastArrivalTableNum = null;

    public RobotArrivalModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void moveToDestination(String destination, Promise promise) {
        if (destination == null || destination.trim().isEmpty()) {
            promise.reject("INVALID_DESTINATION", "Destination is required");
            return;
        }

        try {
            Uri uri = Uri.parse("robot://com.pudutech/order_result")
                .buildUpon()
                .appendQueryParameter("success", "1")
                .appendQueryParameter("destination", destination)
                .build();

            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);

            WritableMap res = Arguments.createMap();
            res.putBoolean("success", true);
            res.putString("destination", destination);
            promise.resolve(res);
        } catch (Exception e) {
            promise.reject("INTENT_DISPATCH_FAILED", "Failed to dispatch movement intent: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getLastArrival(Promise promise) {
        WritableMap res = Arguments.createMap();
        res.putString("tableNum", lastArrivalTableNum);
        promise.resolve(res);
    }

    @ReactMethod
    public void clearLastArrival(String tableNum, Promise promise) {
        if (tableNum != null && tableNum.equals(lastArrivalTableNum)) {
            lastArrivalTableNum = null;
        }
        promise.resolve(null);
    }

    /** Required boilerplate so NativeEventEmitter on the JS side doesn't warn about a missing addListener/removeListeners. */
    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(double count) {
    }

    /** Called directly by MainActivity.checkIntentForArrival() — not a @ReactMethod, just a plain Java call. */
    public void notifyArrival(String tableNum) {
        this.lastArrivalTableNum = tableNum;
        WritableMap data = Arguments.createMap();
        data.putString("tableNum", tableNum);

        ReactApplicationContext context = getReactApplicationContext();
        if (context == null) return;
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("arrival", data);
    }
}
