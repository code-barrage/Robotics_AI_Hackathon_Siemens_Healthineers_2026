# CT Companion MVP

Browser-native CT workflow research demonstrator. One FastAPI process synchronizes
the robot console and ACU workstation. It never connects to a scanner.

## Run on Windows

Use **Python 3.12** (recommended). The specification pins Pydantic 2.9.2 and its
native core: Python 3.14 is not supported by those pins. Do not attempt to compile
old dependencies on 3.14. With the current Windows Python install manager, a
compatible interpreter can be obtained with `py install 3.12`.

From this directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\.venv\Scripts\Activate.ps1
python app.py
```

If PowerShell blocks activation, use `.\.venv\Scripts\python.exe app.py` instead;
there is no need to change machine execution policy. Once the environment is
activated, **`python app.py` is the single launch command**.

Open **http://localhost:8000/studio** in current Chrome or Edge. Click **Start
camera & audio** in the left panel and grant webcam permission. Keep only one robot
view open if the device cannot share the webcam. Stop the server with Ctrl+C.

Other views:

- http://localhost:8000/robot - patient-side camera, HUD, route, and Q&A
- http://localhost:8000/acu - remote technologist workstation
- http://localhost:8000/qr - locally generated, downloadable appointment QR
- http://localhost:8000/health - server health check

The server binds to loopback only. A phone cannot reach your laptop's `localhost`.
Save the QR SVG or photograph the QR first, display it on the phone, and hold that
image in front of the webcam. No network exposure is needed.

## Record the complete demo

At 1920x1080 use `/studio` for the 55% robot / 45% ACU split. Fullscreen is optional;
use browser zoom if your display is smaller. Hotkeys work in the presenter bar,
the robot frame, and the ACU frame. They deliberately do not intercept typing in
text inputs or modified browser shortcuts. Every hotkey also has a robot button.

| Key | Action |
| --- | --- |
| `0` | Toggle simulated LiDAR / human awareness |
| `1` | Verify Sid, anchor a color signature if available, show route, speak welcome |
| `2` | Identity mismatch / privacy pause |
| `Q` | Submit the contrast question through the same backend as microphone input |
| `B` | Capture actual clean camera baseline; explicitly simulated if no camera |
| `3` | Force foreign-object alert |
| `4` | Force room clear |
| `5` | Show arms-down mismatch and start live pose evaluation |
| `6` | Force positioning verified |
| `R` | Reset all shared states, metrics, logs, and local evidence |

Suggested sequence: `R`, `0`, `1`, `Q`, `2`, `1`, `B`, `3`, remotely acknowledge,
`4`, `5`, `6`, then **Approve & Initiate CT Scan** at the ACU. The synchronized
banner says **Technologist Approved Remotely - Initiating Scout Scan** and
explicitly labels the action as a simulation.

Identity, room, and verified-pose overrides latch independently so a noisy camera
cannot undo a recording cue. **Resume live inputs** releases all overrides.
`5` releases the pose latch; `B` releases the room latch when a camera is active.
A latched identity mismatch requires `1` or Resume live inputs. A live mismatch
recovers only after a single matching signature is seen consistently.

Approval is enforced by the server, not just by a disabled button. All three
checks must be green. A subsequent mismatch or object alert revokes approval.
Acknowledging an alert does not clear its underlying condition.

## Live perception

- Webcam frames, color signatures, and pose keypoints remain in the robot browser.
  No images or biometric templates are sent to Python.
- jsQR samples every 150 ms and accepts
  `{"patient":"Sid","exam":"Abdominal CT"}`. The QR helper generates this exact
  payload without any QR service or additional Python dependency.
- MoveNet MultiPose Lightning provides 17 keypoints and multiple-person detection.
  Shoulder/nose-derived normalized RGB histograms and centers provide a **crude
  continuity heuristic, not biometric identity authentication**. Loss of evidence
  pauses clinical answers. Verify again when necessary.
- The fixed gantry ROI is the cyan rectangle on the right of the video. Keep the
  camera fixed, capture a genuinely clean baseline with `B`, and place/remove an
  object inside that rectangle. Brightness-normalized differences, edge changes,
  connected-component bounding boxes, and temporal debouncing drive alerts.
  Changes anywhere else are not an exhaustive room inspection.
- `5` starts arms evaluation. Keep nose, shoulders, and wrists visible.
  Both wrists above their respective shoulders is the passing geometry.
  Low-confidence or missing keypoints are unknown, never a live pass.
- The 8-reference display is illustrative. A single webcam **cannot validate
  head-first/supine orientation**. The specified **98% match** is a labeled demo
  score, not a measured clinical accuracy or model confidence.
- Simulated LiDAR renders image edges and person boxes, not measured depth.
  The 1.4m obstacle label is simulated.

## Offline, permissions, and degraded operation

Local CSS makes the interface independent of Tailwind availability. JavaScript
vision assets are fetched from jsDelivr; MoveNet also downloads model weights.
The **entire MoveNet initialization has a four-second deadline**. If a CDN, WebGL,
or the model is unavailable/slow, Canvas motion/centroid tracking and the labeled
presenter skeleton take over without blocking the animation loop. Animation uses
`requestAnimationFrame`; the HUD displays actual FPS, not a guaranteed 60 FPS.
Canvas fallback does not claim reliable person counting or live arm recognition.
If jsQR is unavailable, use `1`. No heavy Python vision packages are needed.

Camera denial is visible and leaves all deterministic controls functional.
Camera access requires localhost or HTTPS. Microphone speech recognition depends
on browser support and may use the browser vendor's online speech service; use
only the synthetic demo patient and non-sensitive questions. Type or press `Q`
when recognition is unsupported/offline. TTS requires a user gesture and installed
voices; click Start camera & audio or toggle Voice on. Speech errors remain visible.

WebSocket reconnect uses capped backoff and resynchronizes from the authoritative
server snapshot. Actions while offline are rejected, not queued/replayed. A
reloaded robot retains override labels but cannot restore camera pixel baselines
or signature data; recapture them for live use. Camera loss, a hidden camera view,
stale pose estimates, or disconnection of the last robot invalidate applicable live
evidence rather than preserving a misleading green check. Explicitly labeled
presenter overrides remain available.

## Clinical Q&A and boundaries

The deterministic corpus in [app.py](app.py) covers contrast sensations,
preparation instructions, removable metal, positioning, and the demonstration
route. Each resolved response includes an auditable reference ID. Every resolved
FAQ adds one estimated prevented interruption and 1.5 estimated minutes saved.
Unknown, symptomatic, medication, and individualized questions are escalated
without incrementing those metrics. Identity mismatch blocks Q&A server-side.
The demo corpus is fixed, not an externally clinically approved protocol.
No OpenAI key, optional remote model, or patient-data transfer is used.

All state is in memory and resets when the process restarts. Event and Q&A history
are bounded. There is no clinical data persistence, authentication, role security,
or real-device integration; do not expose this server beyond the local laptop.
The `role` query parameter separates UI behavior, not authenticated users.

## Validation

```powershell
python -m py_compile app.py
node --check static\shared_ws.js
node --check static\vision_engine.js
```

After launch, check `/health`, verify both views update together, confirm approval
is blocked until all checks pass, and confirm `2` pauses questions and revokes an
approved scout simulation. Reset clears all KPI totals. Local WebSocket
propagation targets <20 ms; actual latency depends on host load and browser
scheduling, so it is not a guaranteed real-time safety property.

**Research Prototype — Neither room readiness nor positioning check is a
validated clinical safety system.**
