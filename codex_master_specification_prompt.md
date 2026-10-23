# CODEX EXECUTION PROMPT & SYSTEM SPECIFICATION
**Project:** Smart Robotic Patient Companion & ACU Technologist Workstation (CT Workflow)
**Target Environment:** Local Laptop (Single Webcam, Single/Dual Browser Windows, Microphone/Speakers)
**Execution Mode:** Autonomous End-to-End MVP Build (Zero-Dependency-Hell Architecture)

---

## 1. DIRECTIVE FOR CODEX (SYSTEM PROMPT)

You are an elite, autonomous Principal Robotics & Full-Stack Engineer. Your objective is to build a **100% functional, intertwined, real-time MVP** of the **Smart Robotic Patient Companion for CT Examinations** in a single cohesive pass.

### CRITICAL GUARDRAILS (ANTI-LOOP & ANTI-FAILURE RULES)
1. **DO NOT USE HEAVY C++ PYTHON LIBRARIES:** Do **NOT** attempt to install `dlib`, `face_recognition`, `insightface`, `pyzbar`, or `mediapipe` via Python `pip`. Those frequently fail to compile on local laptops or get stuck in dependency resolution loops.
2. **USE BROWSER-NATIVE & WASM VISION/AUDIO INSTEAD:** Perform webcam capture (`navigator.mediaDevices.getUserMedia`), QR scanning (`jsQR` via CDN), Pose Estimation / Person Tracking (`@tensorflow-models/pose-detection` MoveNet via CDN), Pixel-Diff Room Anomaly Detection (HTML5 Canvas pixel subtraction), and Speech-to-Text / Text-to-Speech (`window.SpeechRecognition` and `window.speechSynthesis`) **directly in the Frontend JavaScript**.
3. **ULTRA-LIGHTWEIGHT INTERTWINED BACKEND:** Use a single Python `FastAPI` + `WebSockets` server (`app.py`) that serves the static HTML/JS views, maintains the unified state machine, processes clinical Q&A (via local deterministic RAG + optional OpenAI API fallback), and syncs the **Robot Companion View** and **ACU Technologist Workstation View** in real time (<20ms latency).
4. **FAIL-SAFE STAGE OVERRIDES (MANDATORY):** Lighting and webcam angles vary during screen recording. Every single computer vision and voice trigger **MUST** have both a **Real Live Webcam/Mic implementation** AND a **Deterministic Keyboard Hotkey / Debug Button Override** so the presenter can force any state transition instantly during screen recording.
5. **DEFINITION OF DONE:** Do not stop until all files in Section 3 are created, syntax-verified, and ready to launch via a single command (`python app.py`). Do not leave `TODO` placeholders. Write the complete working code.

---

## 2. SYSTEM ARCHITECTURE (SINGLE-SERVER, DUAL-WINDOW SYNC)

The system runs locally on `http://localhost:8000` and synchronizes two distinct interfaces via WebSockets (`/ws`), plus a unified split-screen recording mode:

* **`http://localhost:8000/robot` (Window 1: Robot Companion Interface)**
  * Uses the laptop webcam as the robot's eyes.
  * Renders a live HUD overlay on an HTML5 `<canvas>` over the `<video>` feed.
  * Contains the **Opening Hook Toggle**: switches live between **Simulated LiDAR Mode** (renders webcam feed as a green/red geometric point-cloud/costmap obstacle grid) and **Human Awareness Mode** (clinical bounding boxes, skeletal keypoints, Re-ID tags).
  * Displays patient-facing guidance, route map to CT Room 2, and interactive voice/chat assistant.
* **`http://localhost:8000/acu` (Window 2: Technologist ACU Workstation Dashboard)**
  * Receives live telemetry, room readiness alerts, positioning checks, and patient Q&A logs over WebSockets.
  * Shows live KPI metrics: `Interruptions Prevented`, `Est. Tech Time Saved`, `Room 2 Status`, and `Patient Readiness`.
  * Allows the technologist to acknowledge alerts remotely or click `Approve & Initiate Scout Scan`.
* **`http://localhost:8000/studio` (Window 3: Screen-Recording Split View)**
  * Embeds both `/robot` (left 55%) and `/acu` (right 45%) side-by-side with a sleek top presenter bar for seamless 1080p screen recording.
* **`http://localhost:8000/qr` (Helper Utility)**
  * Generates and displays the scannable QR code for `PATIENT: SID | EXAM: ABDOMINAL CT (CONTRAST) | PROTOCOL: HEAD-FIRST SUPINE (ARMS UP)` so the user can open it on their phone and hold it up to the laptop webcam.

---

## 3. REQUIRED FILE TREE

Create ONLY these files. Keep the project clean and self-contained:

```text
ct-companion-mvp/
├── requirements.txt
├── app.py
├── static/
│   ├── styles.css
│   ├── shared_ws.js
│   ├── vision_engine.js
│   ├── robot.html
│   ├── acu.html
│   ├── studio.html
│   └── qr.html
└── README_RUN.md
```

---

## 4. FUNCTIONAL SPECIFICATIONS BY ACT (MUST BE 100% IMPLEMENTED)

### Opening — What Robots Already Understand vs. Human Awareness
* **Mode 0 (`LIDAR_SIM`):** The webcam canvas converts high-contrast edges and detected bodies into a simulated 2D/2.5D LiDAR laser scan (green raycast lines from bottom-center of screen, red obstacle polygons around the person, label: `OBSTACLE_ID_04: DYNAMIC CYLINDER | DIST: 1.4m`).
* **Mode 1 (`HUMAN_AWARENESS`):** Switches to full RGB video with clinical HUD overlays, face/body tracking, pose skeleton, and contextual telemetry.

### Act 1 — The Robot Knows Its Patient (`Identify`, `Guide`, `Inform`)
1. **QR Scan & Appointment Load (`Identify`):**
   * `jsQR` scans the video feed every 150ms.
   * When it detects JSON payload `{"patient":"Sid","exam":"Abdominal CT"}` (or when presenter presses Hotkey `1`), the system transitions to `PATIENT_VERIFIED`.
   * **Anchor Biometric Signature:** Captures the primary user's facial/upper-torso color histogram and bounding-box center from MoveNet keypoints (`nose`, `left_shoulder`, `right_shoulder`).
   * **Immediate Audio & UI Response:** Speaks via Web Speech API TTS: *"Hello Sid, welcome back. I see you're scheduled for your abdominal scan. Follow me to CT Suite 2."* Displays the animated hospital corridor route map.
2. **Continuous Re-ID & Mismatch Protection (`Identify` Negative Test):**
   * If a second person enters the frame (`poses.length > 1`), OR if the primary torso signature shifts drastically, OR if presenter presses Hotkey `2`:
   * Bounding box turns **Amber (`WARNING: IDENTITY MISMATCH / UNVERIFIED PERSON`)**.
   * Voice speaks: *"One moment—I need to confirm I am still speaking with Sid before sharing clinical preparation details."*
   * Sends real-time warning event to ACU Dashboard. Pressing Hotkey `1` or returning to single verified user restores **Green (`VERIFIED: SID`)**.
3. **Approved Clinical Q&A (`Inform`):**
   * Patient can click the mic button (Web Speech STT) or type/click quick-ask buttons (e.g., *"Is the contrast dye going to hurt?"*, *"Why couldn't I eat breakfast?"*, *"Can I keep my metal watch on?"*).
   * Backend matches query against a strict **Approved Clinical Protocol Knowledge Base** (no medical diagnosis hallucinations).
   * Responds via voice and logs `[AUTO-RESOLVED FAQ]` on the ACU Dashboard, incrementing `Interruptions Prevented +1` and `Time Saved +1.5m`.

### Act 2 — The Robot Notices What Humans Would Notice (`Check` — Ruthless Testing Phase)
1. **CT Room Readiness / Foreign Object Detection:**
   * Presenter triggers **Capture Clean Room Baseline** (Hotkey `B` or button). The canvas stores the reference background frame of the scene.
   * When an unexpected object is placed into the designated ROI box on camera (detected via structural pixel difference threshold + contour bounding box) OR Hotkey `3` is pressed:
   * Red alert box highlights the object: `ROOM DEVIATION FLAGGED: Unexpected Object in Gantry Zone`.
   * Pushes a critical alert card to the ACU Dashboard (`Room 2 Readiness: BLOCKED — Foreign Object Detected`).
   * Removing the object (or pressing Hotkey `4`) clears the anomaly (`Room 2 Readiness: CLEAR`).
2. **Siemens 8-Reference Positioning Check (Live Pose Geometry):**
   * Target Protocol for Sid's Abdominal CT: **Position 1 of 8 — Head-First Supine, Arms Raised Above Shoulders** (prevents beam-hardening artifacts over abdominal organs).
   * Using MoveNet 17-keypoint skeletal tracking in real time:
     * Extract `left_wrist`, `right_wrist`, `left_shoulder`, `right_shoulder`, `nose`.
     * **Condition A (Arms Down / Mismatch):** If `left_wrist.y > left_shoulder.y` OR `right_wrist.y > right_shoulder.y` (in canvas coordinates where $y=0$ is top of frame) OR Hotkey `5` is pressed:
       * Skeleton draws in **Red**.
       * Alert Banner: `POSITION MISMATCH: Abdominal Protocol requires BOTH ARMS RAISED above shoulder level (Current: Arms Down)`.
       * Voice prompts: *"Sid, for a clear abdominal scan, please raise both arms comfortably above your head."*
       * ACU Dashboard displays red positioning graphic.
     * **Condition B (Arms Raised / Verified):** When the user physically raises both hands above their shoulders (`left_wrist.y < left_shoulder.y` AND `right_wrist.y < right_shoulder.y`) OR Hotkey `6` is pressed:
       * Skeleton snaps to **Emerald Green**.
       * Banner: `SIEMENS REF POSITION VERIFIED: Head-First Supine (Arms Up) — 98% Match`.
       * ACU Dashboard updates `Positioning Status: VERIFIED — READY FOR SCOUT SCAN`.

### Act 3 — The Technologist Stays at Their Workstation (`Handoff`)
* **ACU Dashboard (`/acu`):**
  * Displays all 5 capabilities (`Identify`, `Guide`, `Inform`, `Check`, `Handoff`) as live pipeline badges that light up as Acts 1 and 2 progress.
  * Shows a real-time timestamped Clinical Event Log.
  * Features a `Remote Acknowledge` button next to routine warnings and a primary `Approve & Initiate CT Scan` button that unlocks once Identity, Room Readiness, and Positioning are green.
  * Clicking `Approve & Initiate CT Scan` triggers a synchronized confirmation banner on both windows: *"Technologist Approved Remotely — Initiating Scout Scan."*

---

## 5. DETERMINISTIC HOTKEY MATRIX (BUILD INTO `vision_engine.js`)

Ensure these keyboard shortcuts work anytime the `/robot` or `/studio` window is focused so screen recording is effortless:

| Key | Action / State Triggered |
| :--- | :--- |
| **`0`** | Toggle **Opening Hook**: Simulated LiDAR Mode $\leftrightarrow$ Human Awareness Mode |
| **`1`** | **Act 1:** Force QR Scan Success & Verify Patient "Sid" (Green Box + Welcome Voice) |
| **`2`** | **Act 1:** Trigger Identity Mismatch / Second Person Intrusion (Amber Box + Privacy Pause) |
| **`Q`** | **Act 1:** Simulate Patient Voice Question (*"What does the contrast dye feel like?"*) |
| **`B`** | **Act 2:** Capture Clean CT Room Baseline Frame |
| **`3`** | **Act 2:** Trigger Foreign Object Room Deviation Alert (Red Anomaly Box) |
| **`4`** | **Act 2:** Clear Room Deviation Alert (Room Ready) |
| **`5`** | **Act 2:** Switch to Siemens Pose Check Mode (Live MoveNet Arm-Angle Evaluation) |
| **`6`** | **Act 2:** Force Pose Verified Override (if sitting too close to webcam to raise arms) |
| **`R`** | **Reset All States** back to initial waiting state |

---

## 6. IMPLEMENTATION DETAILS & CODE STANDARDS

1. **`requirements.txt`:**
   ```text
   fastapi==0.115.0
   uvicorn[standard]==0.30.6
   websockets==13.0
   pydantic==2.9.2
   ```
2. **Frontend CDNs (Include in `robot.html`):**
   * Tailwind CSS: `<script src="https://cdn.tailwindcss.com"></script>`
   * jsQR: `<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>`
   * TensorFlow.js & MoveNet Pose Detection:
     ```html
     <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core"></script>
     <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter"></script>
     <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl"></script>
     <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection"></script>
     ```
   * Graceful Offline Fallback: If MoveNet CDN takes >4 seconds or fails to load, automatically fall back to a built-in Canvas Motion/Centroid Tracker + Hotkey Pose Skeleton renderer so the video feed and overlays still run at 60 FPS without crashing.
3. **Visual Design:**
   * Medical-grade dark UI theme (Siemens Healthineers inspired: deep slate `#0b1120`, clinical cyan `#06b6d4`, medical emerald `#10b981`, warning amber `#f59e0b`, alert crimson `#ef4444`).
   * Include the required disclaimer subtly in the footer: *"Research Prototype — Neither room readiness nor positioning check is a validated clinical safety system."*

---

## 7. EXECUTION STEPS FOR CODEX

1. Create the directory structure and `requirements.txt`.
2. Install dependencies (`pip install -r requirements.txt`).
3. Write `app.py` with the full FastAPI application, WebSocket broadcast manager, global clinical state store, and approved CT knowledge base responder.
4. Write `static/shared_ws.js` and `static/vision_engine.js` implementing webcam capture, LiDAR simulation shader/canvas, `jsQR` scanner, MoveNet pose geometry checker, pixel-diff room monitor, Web Speech TTS/STT, and the Hotkey Matrix.
5. Write `static/robot.html`, `static/acu.html`, `static/studio.html`, and `static/qr.html`.
6. Start the server briefly or run a syntax check (`python -m py_compile app.py`) to verify zero errors, and output exact instructions to open `http://localhost:8000/studio`.