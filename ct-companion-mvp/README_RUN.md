# CT Companion: three simple perspectives

The same clinical workflow now has three deliberately different interfaces.
FastAPI remains the lightweight state/signaling backend. Browser-native Canvas,
MoveNet, jsQR, speech APIs and WebRTC handle perception and media. No Python vision
packages, native Android app, .NET migration, or scanner connection are required.

## Run

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
Open **http://localhost:8000/studio** for the three-pane hackathon demonstration.
Stop the server with Ctrl+C.

## Which screen belongs to whom?

| URL | Audience | Default experience |
| --- | --- | --- |
| `/patient` (also `/robot`) | Patient's Android tablet | One next step, large touch controls, text and optional voice, hospital route |
| `/acu` (also `/clinician`) | Technician / clinician | Quiet status strip; no dashboard until they open it |
| `/camera` | Hackathon / robot engineering | Laptop webcam, live tracking, QR, room ROI, pose evidence, deterministic overrides |
| `/studio` | Screen recording | All three views, with camera-focus layout toggle |
| `/qr` | Appointment helper | Locally generated, downloadable wristband QR |
| `/health` | Diagnostics | Server liveness and connected-client count |

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
