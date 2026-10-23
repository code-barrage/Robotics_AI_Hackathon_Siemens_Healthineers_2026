package com.acu.robotpwa;

import android.os.Build;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

import expo.modules.ReactActivityDelegateWrapper;

import android.content.Intent;
import android.util.Log;
import android.widget.Toast;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactContext;

/**
 Hosts the app screen, hides Android system bars, and handles incoming robot arrival intents. Reads the destination and forwards it to the arrival module.
 */
public class MainActivity extends ReactActivity {

  private static final String TAG = "RobotArrival";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null);
    checkIntentForArrival(getIntent());
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "main";
  }

  /**
   * Returns the instance of the ReactActivityDelegate. We use DefaultReactActivityDelegate
   * which allows you to enable New Architecture with a single boolean flag fabricEnabled.
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new ReactActivityDelegateWrapper(
        this,
        BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
        new DefaultReactActivityDelegate(
            this,
            getMainComponentName(),
            DefaultNewArchitectureEntryPoint.getFabricEnabled()));
  }

  /**
   * Align the back button behavior with Android S, where moving root activities to background
   * instead of finishing activities.
   * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
   */
  @Override
  public void invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed();
      }
      return;
    }
    super.invokeDefaultOnBackPressed();
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    checkIntentForArrival(intent);
  }

  @Override
  protected void onResume() {
    super.onResume();
    hideSystemBars();
    checkIntentForArrival(getIntent());
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  /** Immersive sticky: hides status and navigation bars; a swipe from the edge shows them briefly. */
  private void hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }

  private void checkIntentForArrival(Intent intent) {
    if (intent == null) return;
    String tableNum = intent.getStringExtra("tableNum");
    if (tableNum == null && intent.getExtras() != null) {
      tableNum = intent.getExtras().getString("tableNum");
    }
    if (tableNum == null && intent.getData() != null) {
      tableNum = intent.getData().getQueryParameter("tableNum");
      if (tableNum == null) {
        tableNum = intent.getData().getQueryParameter("destination");
      }
    }
    if (tableNum != null && !tableNum.isEmpty()) {
      MainApplication app = (MainApplication) getApplication();
      ReactContext reactContext = app.getReactHost().getCurrentReactContext();
      if (reactContext == null) {
        Log.w(TAG, "Arrival '" + tableNum + "' received before React context is ready; will retry on resume.");
        return;
      }
      NativeModule found = reactContext.getNativeModule(RobotArrivalModule.NAME);
      if (!(found instanceof RobotArrivalModule)) {
        Log.e(TAG, "Arrival '" + tableNum + "' dropped: RobotArrival native module not found.");
        Toast.makeText(this, "Arrival '" + tableNum + "' could not be delivered to the app.", Toast.LENGTH_LONG).show();
        return;
      }
      Log.i(TAG, "Arrival received: " + tableNum);
      ((RobotArrivalModule) found).notifyArrival(tableNum);
      // Do not replay the same arrival when this activity resumes for a later move.
      intent.removeExtra("tableNum");
      intent.setData(null);
    }
  }
}
