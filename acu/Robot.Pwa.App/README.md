# Robot PWA App

Robot PWA is the robot-facing companion app for Alfred Control Unit (ACU). It provides a setup and registration flow, shows Pudu Cloud destinations, and lets an Android robot launch navigation through the Pudu vendor app.

> **Implementation note:** Despite the project name, the current app is built with Expo and React Native, not the former Vite/Capacitor stack. The same React Native UI can run in a browser through React Native Web, but robot control, device information, and mDNS discovery require the Android app.

## Architecture

```text
React Native UI (Expo)
  App.tsx
    ├── ConfigPage ── AsyncStorage: ACU URL + Pudu configuration
    ├── RegisterPage ── POST device details to ACU
    └── DestinationsPage
          ├── GET destination points from Pudu Cloud
          ├── POST heartbeat / navigation events to ACU
          └── Android RobotArrival bridge ── robot:// Intent ──► Pudu vendor app

Android native modules
  ├── AcuDeviceInfo     Reads device IP, MAC, and firmware
  ├── AcuDiscovery      Finds ACU on the LAN using Android NSD/mDNS
  └── RobotArrival      Starts navigation and forwards arrival callbacks to JavaScript
```

### Application layers

- **UI and flow:** `src/App.tsx` selects the configuration, registration, or destination screen according to saved setup state. Shared styling and light/dark palettes live in `src/theme.tsx`.
- **Persistence:** `src/lib/storage.ts` stores configuration and registered device details in React Native AsyncStorage. Reads and writes are asynchronous.
- **ACU API:** `src/lib/acu.ts` registers a device at `POST /api/bot/register` and sends status/heartbeat requests to `POST /api/bot/device-status/{deviceId}`. The destination screen sends heartbeats every five seconds and reports navigation and arrival events.
- **Pudu Cloud:** `src/lib/puduRequest.ts` builds the signed destination request; `src/lib/puduCloud.ts` fetches and maps destination points. In Expo development mode, it returns sample destinations so UI development does not require a live robot or Pudu Cloud connection.
- **HTTP:** `src/lib/acuHttp.ts` is the shared JSON request helper. React Native uses its native networking stack; browser preview requests are subject to browser networking and CORS rules.
- **Android bridge:** Native modules are registered in `android/app/src/main/java/com/acu/robotpwa/RobotPwaPackage.java`. `MainActivity.java` forwards robot arrival Intents to the `RobotArrival` module, which emits events to JavaScript.
- **Browser preview:** Expo serves the React Native UI through React Native Web. Selecting a destination in the browser simulates the navigation screen; it does not move a robot.

### Setup and runtime flow

1. **Configure:** Enter Pudu API settings and the ACU URL. On Android, the app can discover ACU on the local network; in a browser, enter the URL manually.
2. **Register:** Enter or confirm the device details and register the robot with ACU. ACU may require an operator to approve the device.
3. **Operate:** The app loads destination points, checks ACU connectivity, and offers destinations. Android launches the Pudu vendor app through a `robot://` Intent and receives the arrival callback.

## Requirements

- Node.js (22 LTS or newer) and npm.
- For Android: Android Studio, Android SDK/platform tools, a configured JDK, and an Android emulator or connected robot.
- For browser tests: the Playwright Chromium browser (installation command below).

The development browser preview does not require an Android device. Native discovery and hardware metadata are unavailable there.
Workflow introductions support full-screen images and videos in both browser and
Android builds; videos advance on completion and report playback errors.

## Install and run

Run these commands in PowerShell from the repository root:

```powershell
Set-Location .\Robot.Pwa.App
npm ci
npm run typecheck
```

Start the Expo development server and choose a target from its terminal menu:

```powershell
npm start
```

If startup fails with `TypeError: fetch failed` in a restricted or unavailable network, run Expo in offline mode:

```powershell
npm start -- --offline
```

Offline mode skips Expo's network-dependent checks and can serve the local app, but does not make ACU or Pudu Cloud services available; the Android device/browser still needs network access to those services when used.

Or start a specific target:

```powershell
npm run web       # Browser preview
npm run android   # Build/install and launch on an Android emulator or device
```

For Android, start an emulator or connect the robot with USB debugging enabled before running `npm run android`. The Android device and ACU must be able to reach each other over the network. Use the app’s Settings screen to clear saved configuration and registration and return to the initial setup screen.

## Build the Android APK

From `Robot.Pwa.App`:

```powershell
npm run build:apk
```

This builds a standalone release APK (Siemens petrol theme) at:

```text
android/app/build/outputs/apk/ACU-Robot-Siemens-Petrol.apk
```

Install it on a connected device:

```powershell
adb devices
adb install -r .\android\app\build\outputs\apk\ACU-Robot-Siemens-Petrol.apk
adb shell am start -n com.acu.robotpwa/.MainActivity
```

The release variant currently uses the debug keystore; configure a production keystore before public distribution.

The build script uses the existing Android project and does not run `expo prebuild`, which would regenerate native files and remove custom manifest changes (such as cleartext traffic). Review generated changes before building after any intentional prebuild.

### Windows build workarounds

- If `npm run build:apk` is blocked by the PowerShell execution policy, run Gradle directly.
- Use JDK 17 (`JAVA_HOME=%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-17.*`). Java 8 and Java 25 both fail.
- If CMake/ninja fails with path-length errors, copy the app (including `node_modules`) to a short path such as `C:\rb` and build there:

```powershell
robocopy . C:\rb /E /XD .git /NFL /NDL
cd C:\rb\android
.\gradlew.bat --no-daemon assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
# APK: C:\rb\android\app\build\outputs\apk\release\app-release.apk
```

Re-copy changed source files to `C:\rb` before every rebuild.

## Remote control, live cameras and sensors (own ACU)

Point the app's ACU URL to the laptop gateway (`http://<laptop-ip>:3000`; open TCP 3000 in the Windows firewall), register, and approve the robot in `robot-dashboard.html` (🎮 Control tab).

- **Heartbeat** every 2 s to `POST /api/bot/device-status/{id}` carries telemetry: battery, charging, temperature, voltage, Wi‑Fi RSSI, memory, uptime, camera upload stats, and the last command ack (`lastCommand`).
- **Remote commands** are JSON strings sent with `POST /api/acu/instructions/{id}` `{ "command": "{\"id\":\"…\",\"action\":\"…\"}" }`. The robot receives them in the heartbeat response.
  - Actions: `navigate {destination}`, `say {text, lang?}`, `stopSpeech`, `cancel`, `camera {on, face?, intervalMs}`, `ping`.
  - Each `id` runs once.
  - The robot acks in `statusData.lastCommand` and in events `remote_<action>_<status>`.
- **Camera upload** (`camera on`) sends JPEGs from native code with `POST /api/camera/frames?camera=face|tray|mark&location=&robotId=`. Read them back at `/api/acu/robots/{id}/cameras/{front|tray-1|tray-2}/latest|frames|stream`.
- **Tray depth sensor:** while uploading, every tray frame also publishes a down-sampled grid of the raw tray-camera values (≤ 48 columns) to `POST /api/bot/{id}/sensors/tray-depth-{0|1}`.

### Sensor API (local gateway only)

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/bot/{id}/sensors/{kind}` | Publish any JSON reading (≤ 1 MB; kind = `a-z0-9-`, ≤ 32 chars) |
| `GET` | `/api/acu/robots/{id}/sensors` | Sensor streams with count, last time, freshness |
| `GET` | `/api/acu/robots/{id}/sensors/{kind}/latest` | Newest reading |
| `GET` | `/api/acu/robots/{id}/sensors/{kind}/history?limit=` | Last ≤ 100 readings |
| `GET` | `/api/acu/robots/{id}/sensors/stream[?kind=]` | Live Server-Sent Events (`event: <kind>`) |
| `GET` | `/api/acu/robots/{id}/cameras` | All camera feeds incl. custom ones (`camera=<any-slug>` on upload) |

The Pudu secondary-development SDK (`ITpRobotGatewayService`) exposes only the face (mono), mark and tray cameras. LiDAR scans, odometry and pose are not available to third-party apps. Add new sensor kinds here if Pudu provides further AIDL methods.

`robot-dashboard.html` → 📡 Sensors shows every feed, sensor stream, live SSE event and a depth heatmap. `laptop-robot.html` (repo root) turns the laptop's USB cameras into a simulated robot with front/tray/custom feeds.

## Tests and checks

Run from `Robot.Pwa.App`:

```powershell
npm run typecheck
npm run test:pudu
npx playwright install chromium   # One-time browser setup for Playwright
npm run test:web
```

The browser test command starts the web app on port `8082` and runs the Playwright desktop and phone projects. To run a subset of tests, pass Playwright options, for example:

```powershell
npm run test:web -- --grep "registration"
```

## Available npm scripts

| Command | Purpose |
| --- | --- |
| `npm start` / `npm run start` | Start the Expo development server. |
| `npm run web` | Start the browser preview. |
| `npm run android` | Run the app on Android. |
| `npm run prebuild` | Generate the Android native project with Expo. |
| `npm run build:apk` | Build the standalone Siemens petrol release APK. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run test:web` | Run Playwright browser tests. |
| `npm run test:pudu` | Run Pudu request unit tests with Node’s test runner. |
| `npm run ios` | Run on iOS; requires macOS and Xcode. |

## Useful Android troubleshooting commands

```powershell
adb logcat
adb shell pm clear com.acu.robotpwa
adb shell am start -n com.acu.robotpwa/.MainActivity --es tableNum T-101
```

`pm clear` removes the app’s saved setup and registered-device data. The final command sends a sample arrival Intent to the app for testing the Android arrival callback; it does not simulate physical robot movement.
