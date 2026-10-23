package com.acu.robotpwa;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import com.acu.robotpwa.mdns.AcuDiscoveryModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
Makes the five native modules available to TypeScript: device information, ACU discovery, movement/arrival, cameras and speech.
 */
public class RobotPwaPackage implements ReactPackage {

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new AcuDeviceInfoModule(reactContext));
        modules.add(new AcuDiscoveryModule(reactContext));
        modules.add(new RobotArrivalModule(reactContext));
        modules.add(new PuduCameraModule(reactContext));
        modules.add(new RobotTtsModule(reactContext));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
