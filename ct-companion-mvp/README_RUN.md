# CT Companion: one workspace

Open **http://localhost:8000/portal**. This is the single entry point:

- **Patient:** read-only live mirror; open the interactive patient screen only for a local simulation.
- **Technician:** patient status, assistance, and **Start positioning & preparation** after confirmed arrival.
- **Tracking:** camera-based posture/arms checks and clearly labeled demonstration overrides.
- **Robot / API:** telemetry, camera feeds, sensors, remote control and API exploration.
  The existing workflow editor is an optional advanced tool, loaded only on request.
- **Connections:** choose local/hosted ACU and the camera source.

The technician button activates preparation on the patient screen and opens tracking
below the technician view. Allow camera permission when prompted. Without live camera
evidence the pose stays **UNKNOWN**; this does not approve positioning or a scout.
Keep the Technician or Tracking view visible for live browser inference.
All checks remain research-prototype assistance, not validated clinical measurements.

Old `/acu`, `/clinician`, `/camera`, and `/studio` bookmarks redirect into the workspace.
`/journey`, `/patient`, and `/robot` redirect to the one patient implementation at
`/screens/patient`, preserving robot-host and language query parameters. Robot workflow
links therefore keep working. Open only one workspace controlling the tracking camera.

## Run

### One command (robot + ACU + CT, all linked)

From `PS_1_CT`:

```powershell
.\start-ct-demo.ps1                 # hosted ACU http://10.27.239.122:3000, robot 8PP076724060001, English
.\start-ct-demo.ps1 -Language de-DE # German voice and text
.\start-ct-demo.ps1 -Acu local      # start on the local ACU (switchable any time in the portal)
.\start-ct-demo.ps1 -NoLocalAcu       # do not start the local ACU gateway
```

It restarts the CT server (with natural voice, robot camera relay and the automatic ACU
link) and the optional workflow editor, then prints the workspace link. Logs go to `logs\`. Then just open the
robot app on the KettyBot: the CT server keeps the robot approved (only `CT_ROBOT_ID`) and the
`ct-patient-journey` workflow assigned with the current laptop URL, every 5 seconds, so there is
no install button to press and nothing to redo after an ACU or laptop IP change.

### Connections: switch ACU and camera (`http://localhost:8000/portal#settings`)

The launcher starts **both** ACUs side by side: our local gateway (`http://127.0.0.1:3000`, for
developing and testing workflows) and the hosted one (`http://10.27.239.122:3000`, which the
real robot talks to). The portal shows both live (reachable, latency, devices, workflows, CT
journey assignment, which ACU camera feeds exist) and makes one of them **active** with a click:

- The CT server's link loop, robot camera pulls and every screen follow the active ACU.
- Robot / API diagnostics use the same-origin `/acu-proxy` for JSON, camera MJPEG,
  and live sensor SSE. They pause polling and close streams when their tab is hidden.
  The optional workflow editor (`:3100`) uses Vite's proxy to the same active ACU.
- The real robot always uses the ACU URL set in its own app settings; switching here only
  changes what the laptop side talks to. Use the local ACU with the robot preview
  (`-RobotPreview`) or a robot app pointed at this laptop.

Camera feed for the Analysis screen: **laptop webcam** (default), **robot via ACU camera API**
(`/api/acu/robots/{id}/cameras/{front|tray-1|tray-2}/latest`), or **robot via LAN relay**; pick
the camera (face/front, tray 1, tray 2) and frame rate (1–15 fps). The choice is saved in
`portal_settings.json` (env `ACU_TARGET` overrides the saved ACU) and the Analysis screen
switches live.
| Screen | URL | What it shows |
| --- | --- | --- |
| Robot tablet (patient) | opened by the robot app: `http://<laptop>:8000/journey?host=robot` | The patient journey, natural voice, robot navigation; streams its face camera to the laptop |
| Technician | `http://localhost:8000/portal#technician` | Patient status, assistance, and preparation start |
| Tracking | `http://localhost:8000/portal#tracking` | Vision on the selected camera, posture checks and tray feeds |
| Robot / API | `http://localhost:8000/portal#diagnostics` | Telemetry, camera feeds, sensor readings and API tools |

How the pieces connect:

- **Voice**: `/api/tts` renders speech with offline Piper neural voices (`en_US-lessac-medium`,
  `de_DE-thorsten-medium`, downloaded once to `voices\`). The robot page plays the WAV; if that
  fails it falls back to the robot's Android TTS, then browser speech.
- **Cameras**: the robot page relays face-camera frames to `POST /api/robot-camera/face/frames`
  (memory only, nothing written to disk). `GET /api/robot-camera/{face|tray-1|tray-2}/latest`
  and `/stream` serve the freshest frame, falling back to the ACU camera API
  (`/api/acu/robots/{id}/cameras/...`) when a robot uploads there directly.
- **Status**: `GET /api/link/status` is the single health view every screen uses.
- **Firewall**: on a *Public* Wi-Fi profile Windows may block the robot from reaching port 8000.
  An administrator can allow it once with
  `New-NetFirewallRule -DisplayName 'CT companion 8000' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any`.
- **Navigation**: the robot walks only if its Pudu map has a point whose name contains "CT";
  otherwise the walk is simulated on screen.

### Manual

Use Python **3.12**, recommended for the specification's pinned dependencies.
Python 3.14 is not compatible with the pinned Pydantic core. On Windows:

```powershell
py install 3.12
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\.venv\Scripts\Activate.ps1
python app.py
```

If activation is blocked, run `.\.venv\Scripts\python.exe app.py` directly.
The single launch command in the activated environment is **`python app.py`**.
Open **http://localhost:8000/portal** for the unified workspace.
Stop the server with Ctrl+C.

## Which screen belongs to whom?

| URL | Audience | Default experience |
| --- | --- | --- |
| `/portal#patient` | Technician / demo observer | Read-only mirror of the patient screen |
| `/portal#technician` | Technician / clinician | Quiet status strip, assistance and preparation controls |
| `/portal#tracking` | Analysis / robot engineering | Selected camera, tracking, QR, room ROI and pose evidence |
| `/portal#diagnostics` | Robot engineering | Telemetry, sensors, remote commands and optional workflow editor |
| `/qr` | Appointment helper | Locally generated, downloadable wristband QR |
| `/journey` | Robot touchscreen (patient) | End-to-end flow: find → identify → inform → guide → wait/entertain → prepare → hand off |
| `/health` | Diagnostics | Server liveness and connected-client count |

### Patient journey and ACU robot bridge

`/journey` is a single, minimalist patient screen. Accessibility is built in
rather than toggled: large type and 72 px targets, one action per screen,
captions for every spoken line, high contrast, `prefers-reduced-motion` and
`forced-colors` support. The language follows the ACU setting
`speechLanguage` (`de-DE`/`en-US`) and falls back to the browser language.
On the robot tablet (landscape) every scene is two columns: picture left, words
and one action right.

- **Find**: camera frame-difference presence detection wakes the welcome screen.
- **Identify**: wristband QR (`{"patient":"Sid","exam":"Abdominal CT"}`). After
  three wrong codes (`id_failed`), staff receive an identity alert.
- **Inform → Guide → Wait**: three short info cards, a live route animation with
  pause, then breathing, calm scene, facts and FAQ chips.
- **Prepare → Hand off**: positioning guidance derived from the protocol, then the
  technologist approves and the patient finishes the session.

The journey connects as WebSocket role `journey` (one screen; the robot's has priority). The bridge
(`acu_bridge.py`) talks to the team's ACU API Gateway at `ACU_URL` (default
`http://127.0.0.1:3000`):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/acu-bridge/status` | Devices, speech language, whether the workflow is installed/assigned |
| `POST /api/acu-bridge/install` `{"device_id": "..."}` | Create/update the `ct-patient-journey` robot workflow and assign it |

The link loop installs the CT journey automatically; `/api/acu-bridge/install`
remains available for explicit installation. The installed
workflow is a single step whose description carries the journey URL
(`CT_PUBLIC_URL`, else `http://<laptop LAN IP>:8000/journey`). If the robot has
no Pudu map point containing "CT", walking is simulated. ACU assignments are kept
in memory, so reinstall after an ACU restart.

| Option | Default | Meaning |
| --- | --- | --- |
| `CT_LANGUAGE` env | `en-US` | Language of `/journey` and of the workflow installed on the robot |
| `CT_PUBLIC_URL` env | LAN IP + `CT_PORT` | Base URL the robot tablet uses to open `/journey` |
| `/journey?lang=de` | — | Force German on one screen |
| `/journey?cam=1`, `/camera?cam=logitech` | built-in camera | Pick a USB camera by index or label (indices are logged in the browser console) |
| `CT_HOST` env | `127.0.0.1` | Use `0.0.0.0` so the robot tablet can open `http://<laptop-ip>:8000/journey` |

### Run it on the actual KettyBot (one system, not separate parts)

```
 Laptop (same Wi-Fi as the robot)                     KettyBot tablet
 ACU API :3000  ── assigns "ct-patient-journey" ─▶  Robot.Pwa.App (APK)
 CT server :8000 ◀── /journey WebSocket (role=journey) ── full-screen WebView of /journey
   ▲  hub state                                         │ bridge: speak / navigate / camera
   │                                                    ▼
 ACU dashboard :3100 (CT tab = staff view)          Pudu navigation, Android TTS, face camera
```

1. On the laptop: start the ACU API (`0.0.0.0:3000`) and the CT server with
   `CT_HOST=0.0.0.0` (optionally `CT_PUBLIC_URL=http://<ip>:8000`). Allow ports
   3000 and 8000 through the Windows firewall.
2. Build the robot app once on a machine with Android Studio (JDK 17 + Android
   SDK): `cd acu/Robot.Pwa.App; npm install; npm run build:apk` (or
   `npx expo run:android` with the robot on adb). A rebuild is required because
   `react-native-webview` is a native module. Install the APK on the KettyBot.
3. On the robot: set `ACU_URL=http://<laptop-ip>:3000`, register, then approve it
   in the ACU dashboard.
4. In the Pudu app create map points, e.g. `Reception` and `CT 2`.
5. Open `/studio` and click **Install CT journey on robot** (or
   `POST /api/acu-bridge/install`).

The robot app now opens `/journey` full screen by itself. No Start button is
needed. The page drives the robot through a message bridge
(`src/features/ctJourney/journeyHost.ts`):

| Page → robot | Robot → page |
| --- | --- |
| `speak` (Android TTS), `navigate` / `cancelNavigation` (Pudu `RobotArrival`), `camera` on/off (Pudu face camera), `event` (ACU heartbeat) | `host` (capabilities, map points), `navigation` moving/arrived/failed/cancelled, `frame` (JPEG), `camera` errors |

The hub stays the single source of truth. **Dispatch** starts real navigation,
**Pause**/**Help** cancel it, **Resume** restarts it, and the robot's arrival
callback reports `arrive`. Over plain http the WebView cannot use
`getUserMedia`, so the wristband QR is read from the robot's face-camera frames
(jsQR is served locally from `/static/vendor`). The laptop's USB cameras remain
available via `/camera?cam=N` on the laptop.

The robot's screen always owns the journey. Opening `/journey` in another
browser shows "already open", and a reload on the robot takes over from any
older screen without raising a help alert. In the browser preview
(`http://localhost:8082`), the same page runs in an iframe with simulated
walking and browser speech.

Keep **only one patient controller and one camera controller** open per server.
Multiple clinician observers are supported, but only the clinician who requested
a call receives its media. Close the studio before opening standalone patient and
camera pages, since the studio already owns those controllers. A duplicate page
gets a visible explanation instead of competing for the webcam or call consent.

### Clinician: quiet by default

The bottom widget shows only the current meaningful update: checking in, ready for
invitation, on the way, arrived, or needing help. It never auto-opens, scrolls
headlines, makes routine sounds, or requires acknowledgment for normal progress.
This standalone prototype shows a neutral workspace rather than pretending to
integrate into an existing scan workstation.

Click the widget to expand a small assistance panel:

- Invite the confirmed patient, pause or resume the simulated escort.
- Check identity, room and positioning at a glance. Presenter evidence is labeled.
- Acknowledge an alert without falsely clearing its underlying condition.
- Request a patient-consented support call with optional robot camera video.
- Send written guidance, also read aloud on the patient tablet if voice is enabled.
- Mark a human help request handled. This does not fix room/identity/pose checks.
- Approve the scout **simulation** only after confirmation, arrival, and checks.
- Expand activity/FAQ detail only if needed. No KPI wall on the default screen.

The invite action is for the **current confirmed demo appointment**, not a real
queue scheduler or next-patient integration.

### Patient: one step at a time

1. Tap **Start & hear instructions** to enable speech output (browser gesture
   required). All guidance is also text, with a repeat button and voice toggle.
2. Show the wristband QR to the **robot camera**, not the tablet camera. The
   engineering camera controller does the scanning and background continuity check.
3. Confirm **Yes, that's me** after the appointment is read. If incorrect, request
   help. QR recognition alone does not count as the patient's confirmation.
4. When the clinician invites them, see a simple hospital layout and a moving
   location marker. The route is a **50-second simulation**, not real robot motion.
5. At arrival, see reassuring preparation text and a play/pause animated positioning
   illustration. The illustration has a text description and spoken equivalent.

Larger text, high-contrast text, 52px-or-larger patient controls, visible keyboard
focus, labels, dialogs, screen-reader updates, and reduced-motion support are
included. No tracking boxes, model scores, debug buttons or telemetry are shown to
the patient. “I need help” and written communication are available before identity
verification; clinical FAQs are gated by verified identity.

Identity loss pauses the escort and hides clinical details. The patient must
confirm again after identity is restored. A staff resume is required after a
pause: the simulation never resumes on its own.

## Real remote assistance, with explicit consent

Use headphones for the single-laptop demo to avoid speaker/microphone feedback.

1. In the camera lab, click **Start robot camera** and allow the webcam.
2. In the clinician panel, click **Request live support** and allow the microphone.
   No peer connection or transmitted media begins while the request is pending.
3. On the patient tablet, choose **Accept call**, or decline and use messages.
   **Camera sharing is unchecked by default** and separately optional.
4. On acceptance, browser-to-browser WebRTC carries two-way audio between clinician
   and patient. If selected, a second connection carries the robot's live camera
   to the clinician. The camera controller does not capture another microphone.
5. Either participant can end the call. Patient and clinician can mute their own
   microphone. Ending/resetting/disconnecting closes peers and stops support tracks.
   The camera's original tracking stream is not stopped by ending a support call.

FastAPI relays **signaling only**. It binds messages to the active call ID, epoch
and selected participants; unconsented camera signaling is rejected. Requests
expire after 45 seconds without consent. Call setup has a 20-second connection
timeout and explicit error feedback. Media is not recorded or stored.

There are **no third-party STUN/TURN services**. The demo targets one laptop or
peers on a directly reachable local network. Restricted networks may require a
separately provisioned TURN deployment; that is not silently worked around.
Video failure does not claim a live image; written support remains available.
If browser autoplay is blocked, use **Enable call sound**.

Calls are **not automatically captioned**. Typed two-way messages are the reliable
hearing-accessible alternative, separate from the browser's FAQ speech recognition.
Browser speech recognition may contact the browser provider's online service;
use only the synthetic demo patient and non-sensitive questions.

## Android and multiple devices

The patient interface is responsive browser HTML and works with Android Chrome;
no app install is needed. The laptop camera and patient tablet are independent
controllers connected to the same server.

`localhost` on a phone/tablet refers to that device, **not** the laptop. Real media
capture requires a secure context: laptop localhost for a local demo, or a trusted
**HTTPS/WSS** deployment for other devices. Do not disable browser security checks.
An administrator can explicitly set `CT_HOST` for a controlled network deployment
and put the service behind a trusted HTTPS reverse proxy; loopback is the default.
Do not expose this unauthenticated research prototype to the Internet or a clinical
network. There is no authentication, patient scheduling or production authorization.

## Camera lab and demo controls

MoveNet MultiPose, jsQR, background color-signature continuity, Canvas room
difference/connected-component boxes, simulated LiDAR and live arm geometry remain
in [vision_engine.js](static/vision_engine.js).

| Key | Action |
| --- | --- |
| `0` | Simulated LiDAR / RGB human awareness |
| `1` | Force wristband recognition for Sid |
| `2` | Identity mismatch |
| `Q` | Submit contrast FAQ |
| `B` | Capture clean room baseline (explicitly simulated without camera) |
| `3` / `4` | Foreign object / room clear |
| `5` / `6` | Start live arm check with arms-down cue / force arms-up pass |
| `R` | Reset workflow, confirmations, route, logs, call and metrics |

Additional labeled buttons simulate patient confirmation, dispatch, arrival and
help requests for recording. These are only in the camera lab, never on the
patient interface. All original hotkeys retain equivalent buttons. Hotkeys do not
intercept text input or browser shortcuts. Use the camera pane or studio header
for the recording shortcuts.

Suggested recording:

1. Studio: start robot camera; patient: enable spoken guidance.
2. Camera: `1` (or real QR); patient: **Yes, that's me**.
3. Clinician: open widget, **Invite patient to CT 2**, then minimize.
4. Patient: map advances; clinician: quiet “on the way” status.
5. Camera: **Arrive now**, `B`, `3`; clinician: open widget, acknowledge warning.
6. Patient: **I need help**; clinician: request support. Patient accepts, optionally
   shares camera, and both can speak or exchange written messages.
7. End call; clinician: mark help handled. Camera: `4`, `5`, physically raise arms
   or use `6`. Clinician: approve scout simulation.

MoveNet gets a four-second initialization deadline. If network/WebGL/model loading
fails, Canvas motion tracking and labeled deterministic skeleton overrides remain
usable. If jsQR is unavailable, use `1`. Local CSS has no CDN dependency.
Keep the camera page visible: browser background throttling can pause perception;
camera loss, hidden camera view, or last-controller disconnect invalidates live
evidence. Explicit presenter evidence remains labeled as simulated.

Capture a clean baseline with the camera stationary, then put an object in the
cyan ROI on the right. Single-camera color continuity is **not biometric
authentication**; arms geometry cannot establish head-first/supine orientation.
The specified 98% match and 1.4 m labels are illustrative, not measured values.
All demonstrations need an operator; nothing here authorizes actual patient
movement or scanner operation.

## Clinical boundaries and validation

The fixed, inspectable FAQ corpus is a demo corpus, not an externally approved
clinical protocol. Unknown/personal-risk/symptom questions go to staff and do not
increase the estimated saved-time metrics. No remote language model is used.
All workflow data is in memory and resets when the server restarts.

```powershell
python -m py_compile app.py
python -m unittest discover -s tests -v
node --check static\shared_ws.js
node --check static\vision_engine.js
node --check static\experience.js
node --check static\assistance.js
```

Browser checks should include small-tablet layout, 200% zoom / larger text, keyboard
dialog controls, reduced motion, offline state, denied media permissions, real
WebRTC tracks with consent and without camera consent, end-call cleanup, and
three-view synchronization. Measured local latency is not a hard real-time guarantee.

**Research Prototype — Neither room readiness nor positioning check is a
validated clinical safety system.**
