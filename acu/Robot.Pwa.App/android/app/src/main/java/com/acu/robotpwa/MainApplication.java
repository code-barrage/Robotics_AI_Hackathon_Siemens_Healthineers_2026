package com.acu.robotpwa;

import android.app.Application;
import android.content.res.Configuration;

import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeApplicationEntryPoint;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.ReactHost;
import com.facebook.react.common.ReleaseLevel;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;

import expo.modules.ApplicationLifecycleDispatcher;
import expo.modules.ReactNativeHostWrapper;

import java.util.List;

import com.acu.robotpwa.mdns.AcuDiscoveryModule;

/**
 Starts React Native and Expo when the app launches. Registers our custom native modules through the package below.
 */
public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost =
      new ReactNativeHostWrapper(
          this,
          new DefaultReactNativeHost(this) {
            @Override
            public List<ReactPackage> getPackages() {
              List<ReactPackage> packages = new PackageList(this).getPackages();
              packages.add(new RobotPwaPackage());
              return packages;
            }

            @Override
            public String getJSMainModuleName() {
              return ".expo/.virtual-metro-entry";
            }

            @Override
            public boolean getUseDeveloperSupport() {
              return BuildConfig.DEBUG;
            }

            @Override
            public boolean isNewArchEnabled() {
              return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
            }
          });

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public ReactHost getReactHost() {
    return ReactNativeHostWrapper.createReactHost(getApplicationContext(), mReactNativeHost);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      DefaultNewArchitectureEntryPoint.INSTANCE.setReleaseLevel(
          ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.toUpperCase()));
    } catch (IllegalArgumentException e) {
      DefaultNewArchitectureEntryPoint.INSTANCE.setReleaseLevel(ReleaseLevel.STABLE);
    }
    ReactNativeApplicationEntryPoint.loadReactNative(this);
    ApplicationLifecycleDispatcher.onApplicationCreate(this);
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig);
  }
}
