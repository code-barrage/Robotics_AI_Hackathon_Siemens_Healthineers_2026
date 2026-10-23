"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const W = 320, H = 180;
  const ROI = { x: 215, y: 42, w: 94, h: 106 };
  const LINKS = [[0, 1], [0, 2], [1, 3], [2, 4], [5, 6], [5, 7], [7, 9],
    [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
  const KEYS = new Set(["0", "1", "2", "q", "b", "3", "4", "5", "6", "r"]);

  function loadScript(url, timeout = 4000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => reject(new Error(`Asset timeout: ${url}`)), timeout);
      script.src = url;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error(`Asset unavailable: ${url}`)); };
      document.head.append(script);
    });
  }

  function bounds(points) {
    const valid = points.filter((point) => point.score >= .3);
    if (valid.length < 3) return null;
    const xs = valid.map((point) => point.x), ys = valid.map((point) => point.y);
    return { x: Math.max(0, Math.min(...xs) - 12), y: Math.max(0, Math.min(...ys) - 12),
      w: Math.min(W - 1, Math.max(...xs) + 12) - Math.max(0, Math.min(...xs) - 12),
      h: Math.min(H - 1, Math.max(...ys) + 12) - Math.max(0, Math.min(...ys) - 12) };
  }

  function largestComponent(mask, cols, rows) {
    const seen = new Uint8Array(mask.length);
    let best = null;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      const queue = [start];
      seen[start] = 1;
      let minX = cols, minY = rows, maxX = 0, maxY = 0;
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], x = index % cols, y = Math.floor(index / cols);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const next = ny * cols + nx;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && mask[next] && !seen[next]) {
            seen[next] = 1; queue.push(next);
          }
        }
      }
      if (!best || queue.length > best.count) {
        best = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count: queue.length };
      }
    }
    return best;
  }

  class VisionEngine {
    constructor() {
      this.ws = window.CT;
      this.video = $("camera");
      this.canvas = $("hud");
      this.ctx = this.canvas.getContext("2d");
      this.sample = document.createElement("canvas");
      this.sample.width = W; this.sample.height = H;
      this.sctx = this.sample.getContext("2d", { willReadFrequently: true });
      this.detector = null;
      this.poses = [];
      this.stream = null;
      this.cameraStarting = false;
      this.audio = false;
      this.frame = null;
      this.lastSample = 0;
      this.lastPoseAt = 0;
      this.frames = 0;
      this.fpsAt = performance.now();
      this.seenEvents = new Set();
      this.clearLocal();
      this.bind();
      this.loadVision();
      this.raf = requestAnimationFrame((at) => this.tick(at));
    }
    clearLocal() {
      this.generation = (this.generation || 0) + 1;
      this.anchor = null;
      this.baseline = null;
      this.objectBox = null;
      this.qrScanned = false;
      this.pins = { identity: false, room: false, pose: false };
      this.stability = {};
      this.previousFrame = null;
      this.motionBox = null;
      this.lastMotion = 0;
      this.identitySince = performance.now();
      this.poses = [];
      this.lastPoseAt = 0;
      this.seenEvents.clear();
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (this.recognition) this.recognition.abort();
      text("override-status", "LIVE INPUTS / NO OVERRIDES");
      text("signature-status", "NO LIVE SIGNATURE");
      $("question").value = "";
      if (typeof window.jsQR === "function") text("qr-engine", "jsQR READY");
    }
    bind() {
      this.ws.addEventListener("state", (event) => this.onState(event.detail));
      this.ws.addEventListener("offline", () => {
        this.stability = {};
        if (window.speechSynthesis) speechSynthesis.cancel();
        text("tracking-label", "CONNECTION LOST / CONTROLS PAUSED");
      });
      this.ws.addEventListener("notice", (event) => {
        if (/confirm I am still/.test(event.detail)) this.speak(event.detail);
      });
      $("start-camera").addEventListener("click", () => this.startCamera());
      $("toggle-audio").addEventListener("click", () => {
        this.audio = !this.audio;
        text("toggle-audio", this.audio ? "Voice: ON" : "Voice: OFF");
        if (!this.audio && window.speechSynthesis) speechSynthesis.cancel();
      });
      $("live-inputs").addEventListener("click", () => this.resumeLive());
      document.querySelectorAll("[data-key]").forEach((button) =>
        button.addEventListener("click", () => this.hotkey(button.dataset.key)));
      document.querySelectorAll("[data-scenario]").forEach((button) =>
        button.addEventListener("click", () => this.ws.send(button.dataset.scenario, { source: "override" })));
      document.addEventListener("keydown", (event) => {
        if (event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
            event.target.closest("input, textarea, select, [contenteditable='true']")) return;
        if (KEYS.has(event.key.toLowerCase())) {
          event.preventDefault();
          this.hotkey(event.key);
        }
      });
      window.addEventListener("message", (event) => {
        if (event.origin === location.origin && event.source === parent && event.data?.type === "ct-hotkey") {
          this.hotkey(event.data.key);
        }
      });
      $("question-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.ask($("question").value)) $("question").value = "";
      });
      document.querySelectorAll("[data-question]").forEach((button) =>
        button.addEventListener("click", () => this.ask(button.dataset.question)));
      $("microphone").addEventListener("click", () => this.listen());
      window.addEventListener("pagehide", () => {
        this.stopped = true;
        cancelAnimationFrame(this.raf);
        this.stream?.getTracks().forEach((track) => track.stop());
        this.recognition?.abort();
        this.detector?.dispose();
        if (window.speechSynthesis) speechSynthesis.cancel();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.stream) this.invalidateLive("Camera view hidden. Live checks paused.");
      });
    }
    async loadVision() {
      const qrUrl = $("cdn-jsqr").dataset.src;
      loadScript(qrUrl).then(() => text("qr-engine", "jsQR READY")).catch((error) => {
        text("qr-engine", "QR OFFLINE / USE 1");
        this.ws.error(`${error.message}. QR override 1 remains available.`);
      });
      const deadline = performance.now() + 4000;
      let expired = false;
      const fallback = (reason) => {
        expired = true;
        text("vision-engine", "CANVAS MOTION / POSE OVERRIDES");
        text("engine-detail", `${reason} Canvas centroid tracking active; pose requires hotkeys 5 / 6.`);
      };
      const timer = setTimeout(() => fallback("MoveNet exceeded the 4-second deadline."), 4000);
      try {
        for (const node of document.querySelectorAll("[data-tf-cdn]")) {
          if (expired) return;
          await loadScript(node.dataset.src, Math.max(1, deadline - performance.now()));
        }
        if (expired) return;
        await tf.setBackend("webgl");
        await tf.ready();
        if (expired) return;
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
          enableTracking: true,
          trackerType: poseDetection.TrackerType.BoundingBox,
        });
        if (expired || this.stopped) { detector.dispose(); return; }
        clearTimeout(timer);
        this.detector = detector;
        text("vision-engine", "MOVENET / MULTI-PERSON");
        text("engine-detail", "Live 17-keypoint geometry. Color-signature continuity is not biometric authentication.");
      } catch (error) {
        clearTimeout(timer);
        fallback(`MoveNet unavailable: ${error.message}.`);
        console.warn("MoveNet fallback:", error);
      }
    }
    async startCamera() {
      if (this.stream || this.cameraStarting) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        this.ws.error("Camera API unavailable. Use localhost or HTTPS; all presenter overrides still work.");
        return;
      }
      this.cameraStarting = true;
      $("start-camera").disabled = true;
      text("camera-status", "REQUESTING CAMERA PERMISSION");
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false,
        });
        this.video.srcObject = this.stream;
        await this.video.play();
        for (const track of this.stream.getVideoTracks()) {
          track.addEventListener("ended", () => this.cameraEnded());
          track.addEventListener("mute", () => this.invalidateLive("Camera temporarily unavailable."));
        }
        text("camera-status", "CAMERA LIVE / LOCAL PROCESSING");
        text("start-camera", "Camera active");
      } catch (error) {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        text("camera-status", "CAMERA UNAVAILABLE / DEMO READY");
        this.ws.error(`Camera: ${error.name}: ${error.message}. Use the deterministic controls below.`);
      } finally {
        this.cameraStarting = false;
        $("start-camera").disabled = Boolean(this.stream);
      }
    }
    cameraEnded() {
      this.stream = null;
      this.frame = null;
      this.poses = [];
      $("start-camera").disabled = false;
      text("start-camera", "Restart camera");
      text("camera-status", "CAMERA ENDED / DEMO READY");
      this.invalidateLive("Camera stopped. Live identity and positioning are no longer verified.");
    }
    invalidateLive(message) {
      this.generation++;
      this.stability = {};
      this.poses = [];
      this.lastPoseAt = 0;
      if (!this.ws.connected) { this.ws.error(message); return; }
      const state = this.ws.state;
      if (state.patient && !this.pins.identity) this.ws.send("mismatch", { source: "live" });
      if (state.pose_active && !this.pins.pose) this.ws.send("pose_unknown", { source: "live" });
      if (state.baseline && !this.pins.room) this.ws.send("room_unknown", { source: "live" });
      this.ws.error(message);
    }
    onState({ state, previous }) {
      if (!previous || previous.epoch !== state.epoch) {
        this.clearLocal();
        for (const item of state.events) this.seenEvents.add(item.id);
        // A reloaded tab must not silently replace presenter evidence with live estimates.
        for (const field of ["identity", "room", "pose"]) {
          this.pins[field] = state[`${field}_source`] === "override";
        }
      }
      if (previous?.identity !== state.identity && state.identity === "MISMATCH") {
        if (window.speechSynthesis) speechSynthesis.cancel();
        this.recognition?.abort();
        $("question").value = "";
      }
      if (previous?.identity !== state.identity && state.identity === "VERIFIED") {
        this.identitySince = performance.now();
      }
      for (const item of state.events) {
        if (this.seenEvents.has(item.id)) continue;
        this.seenEvents.add(item.id);
        if (item.speech) this.speak(item.speech);
      }
      this.seenEvents = new Set(state.events.map((item) => item.id));
      text("mode-label", state.mode === "LIDAR_SIM" ? "SIMULATED LiDAR / NOT DEPTH SENSING" : "HUMAN AWARENESS / RGB");
      text("tracking-label", state.identity === "VERIFIED" ? "VERIFIED: SID"
        : state.identity === "MISMATCH" ? "WARNING: IDENTITY MISMATCH / UNVERIFIED PERSON" : "WAITING FOR APPOINTMENT QR");
      this.showPins();
    }
    showPins() {
      const active = Object.keys(this.pins).filter((key) => this.pins[key]);
      text("override-status", active.length ? `OVERRIDE LATCHED: ${active.join(" / ").toUpperCase()}` : "LIVE INPUTS / NO OVERRIDES");
    }
    hotkey(raw) {
      const key = String(raw).toLowerCase();
      if (!KEYS.has(key)) return;
      if (!this.ws.connected) { this.ws.error("Connect to the server before using presenter controls."); return; }
      const state = this.ws.state;
      if (key === "0") this.ws.send("mode", { mode: state.mode === "LIDAR_SIM" ? "HUMAN_AWARENESS" : "LIDAR_SIM" });
      if (key === "1") {
        this.pins.identity = true;
        this.qrScanned = true;
        this.captureAnchor();
        this.ws.send("identify", { source: "override" });
      }
      if (key === "2") {
        this.pins.identity = true;
        this.ws.send("mismatch", { source: "override" });
      }
      if (key === "q") this.ask("What does the contrast dye feel like?");
      if (key === "b") this.captureBaseline();
      if (key === "3" || key === "4") {
        this.pins.room = true;
        this.objectBox = key === "3" ? { x: ROI.x + 12, y: ROI.y + 30, w: 60, h: 46 } : null;
        this.ws.send(key === "3" ? "room_blocked" : "room_clear", { source: "override" });
      }
      if (key === "5") {
        this.pins.pose = false;
        this.stability.pose = null;
        this.ws.send("pose_start", { source: "override" });
      }
      if (key === "6") {
        this.pins.pose = true;
        this.ws.send("pose_verified", { source: "override" });
      }
      if (key === "r") this.ws.send("reset");
      this.showPins();
    }
    resumeLive() {
      if (!this.stream) { this.ws.error("Start a camera before resuming live inputs."); return; }
      if (!this.ws.connected) { this.ws.error("Reconnect before resuming live inputs."); return; }
      this.pins = { identity: false, room: false, pose: false };
      this.stability = {};
      this.identitySince = performance.now();
      if (this.ws.state.patient) {
        this.ws.send("mismatch", { source: "live" });
        if (!this.anchor) {
          this.qrScanned = false;
          this.ws.error("Show the appointment QR to establish a fresh live color signature.");
        }
      }
      if (this.ws.state.pose_active) this.ws.send("pose_unknown", { source: "live" });
      if (!this.baseline) {
        this.ws.send("room_unknown", { source: "live" });
        text("engine-detail", "Capture a real clean-room baseline with B to resume room monitoring.");
      }
      this.showPins();
    }
    ask(question) {
      if (!question.trim()) { this.ws.error("Enter a question first."); return false; }
      return this.ws.send("question", { text: question.trim() });
    }
    speak(message) {
      if (!this.audio) return;
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        this.ws.error("Speech synthesis unavailable. Guidance remains visible on screen.");
        return;
      }
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "en-US";
      utterance.rate = .96;
      utterance.onerror = (event) => {
        if (!["canceled", "interrupted"].includes(event.error)) this.ws.error(`Speech output: ${event.error}. Read the visible guidance.`);
      };
      speechSynthesis.speak(utterance);
    }
    listen() {
      if (this.ws.state?.identity !== "VERIFIED") {
        this.ws.error("Confirm Sid before starting a clinical voice question.");
        return;
      }
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        this.ws.error("Speech recognition is unavailable in this browser. Type a question or press Q.");
        return;
      }
      if (this.listening) { this.recognition.stop(); return; }
      this.audio = true;
      text("toggle-audio", "Voice: ON");
      if (window.speechSynthesis) speechSynthesis.cancel();
      const recognition = new Recognition();
      this.recognition = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => { this.listening = true; text("microphone", "Stop mic"); };
      recognition.onresult = (event) => {
        const question = event.results[0][0].transcript;
        $("question").value = question;
        this.ask(question);
      };
      recognition.onerror = (event) => {
        if (event.error !== "aborted") this.ws.error(`Microphone: ${event.error}. Type a question or press Q.`);
      };
      recognition.onend = () => { this.listening = false; text("microphone", "Mic"); };
      try { recognition.start(); }
      catch (error) { this.ws.error(`Could not start speech recognition: ${error.message}`); }
    }
    tick(at) {
      if (this.stopped) return;
      this.frames++;
      if (at - this.fpsAt > 1000) {
        text("fps", `${Math.round(this.frames * 1000 / (at - this.fpsAt))} FPS`);
        this.frames = 0; this.fpsAt = at;
      }
      if (!document.hidden && this.stream && this.video.readyState >= 2 &&
          this.stream.getVideoTracks().some((track) => track.readyState === "live" && !track.muted) &&
          at - this.lastSample >= 150) {
        this.lastSample = at;
        this.sctx.drawImage(this.video, 0, 0, W, H);
        this.frame = this.sctx.getImageData(0, 0, W, H);
        this.trackMotion(at);
        this.scanQR();
        this.checkRoom();
        if (this.detector && !this.estimating) this.estimatePose();
        if (!this.detector || at - this.lastPoseAt > 1800) {
          this.checkIdentity(at);
          if (this.ws.connected && this.ws.state?.pose_source === "live" &&
              this.ws.state.pose === "VERIFIED" && !this.pins.pose) {
            this.stable("pose-stale", "unknown", 3, () => this.ws.send("pose_unknown", { source: "live" }));
          }
        } else this.stability["pose-stale"] = null;
      }
      this.draw(at);
      this.raf = requestAnimationFrame((next) => this.tick(next));
    }
    async estimatePose() {
      this.estimating = true;
      const generation = this.generation;
      try {
        const poses = await this.detector.estimatePoses(this.video, { maxPoses: 6, flipHorizontal: false });
        if (this.stopped || generation !== this.generation || !this.stream || document.hidden) return;
        this.poses = poses.filter((pose) => (pose.score ?? 1) >= .25 &&
          [0, 5, 6].every((i) => (pose.keypoints[i]?.score || 0) >= .3)).map((pose) => ({
          id: pose.id,
          keypoints: pose.keypoints.map((point) => ({
            ...point, x: point.x * W / this.video.videoWidth,
            y: point.y * H / this.video.videoHeight, score: point.score || 0,
          })),
        }));
        this.lastPoseAt = performance.now();
        this.checkIdentity(this.lastPoseAt);
        this.checkPose();
      } catch (error) {
        this.ws.error(`Pose inference failed: ${error.message}. Canvas fallback and overrides remain available.`);
        this.detector?.dispose();
        this.detector = null;
        this.poses = [];
        text("vision-engine", "CANVAS MOTION / POSE OVERRIDES");
        if (this.ws.state?.pose_active && !this.pins.pose) this.ws.send("pose_unknown", { source: "live" });
      } finally { this.estimating = false; }
    }
    trackMotion(at) {
      if (this.previousFrame) {
        const cols = W / 4, rows = H / 4, mask = new Uint8Array(cols * rows);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = ((y * 4 + 2) * W + x * 4 + 2) * 4;
          const delta = [0, 1, 2].reduce((sum, c) => sum + Math.abs(this.frame.data[i + c] - this.previousFrame[i + c]), 0) / 3;
          mask[y * cols + x] = delta > 30 ? 1 : 0;
        }
        const component = largestComponent(mask, cols, rows);
        if (component && component.count > 18) {
          this.motionBox = { x: component.x * 4, y: component.y * 4, w: component.w * 4, h: component.h * 4 };
          this.lastMotion = at;
        } else if (at - this.lastMotion > 1500) this.motionBox = null;
      }
      this.previousFrame = new Uint8ClampedArray(this.frame.data);
    }
    signature() {
      if (!this.frame) return null;
      let region;
      const pose = performance.now() - this.lastPoseAt < 1800 ? this.poses[0] : null;
      if (pose) {
        const [nose, left, right] = [pose.keypoints[0], pose.keypoints[5], pose.keypoints[6]];
        const width = Math.max(15, Math.abs(left.x - right.x));
        region = { x: (left.x + right.x) / 2 - width / 2, y: nose.y,
          w: width, h: Math.max(20, Math.max(left.y, right.y) - nose.y + width * .6) };
      } else if (!this.detector && this.motionBox) region = this.motionBox;
      else return null;
      const histogram = new Float32Array(48);
      let count = 0;
      for (let y = Math.max(0, Math.floor(region.y)); y < Math.min(H, region.y + region.h); y += 2) {
        for (let x = Math.max(0, Math.floor(region.x)); x < Math.min(W, region.x + region.w); x += 2) {
          const i = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) histogram[c * 16 + (this.frame.data[i + c] >> 4)]++;
          count += 3;
        }
      }
      if (!count) return null;
      return { histogram: histogram.map((value) => value / count),
        center: { x: (region.x + region.w / 2) / W, y: (region.y + region.h / 2) / H } };
    }
    captureAnchor() {
      this.anchor = this.signature();
      this.identitySince = performance.now();
      text("signature-status", this.anchor ? "COLOR SIGNATURE ANCHORED / NOT AUTHENTICATION" : "NO LIVE SIGNATURE / PRESENTER EVIDENCE ONLY");
    }
    scanQR() {
      if (!this.ws.connected || this.qrScanned || typeof window.jsQR !== "function") return;
      const code = jsQR(this.frame.data, W, H, { inversionAttempts: "dontInvert" });
      if (!code) return;
      let data;
      try { data = JSON.parse(code.data); }
      catch {
        if (code.data.includes("PATIENT: SID") && code.data.includes("ABDOMINAL CT")) {
          data = { patient: "Sid", exam: "Abdominal CT" };
        } else { text("qr-engine", "UNRECOGNIZED QR / SHOW DEMO APPOINTMENT"); return; }
      }
      if (data?.patient !== "Sid" || data?.exam !== "Abdominal CT") {
        text("qr-engine", "APPOINTMENT NOT RECOGNIZED"); return;
      }
      this.captureAnchor();
      this.qrScanned = true;
      this.pins.identity = false;
      this.ws.send("identify", { source: "live" });
      text("qr-engine", "APPOINTMENT QR ACCEPTED");
    }
    stable(kind, value, samples, action) {
      const prior = this.stability[kind];
      this.stability[kind] = prior?.value === value ? { value, count: prior.count + 1 } : { value, count: 1 };
      if (this.stability[kind].count === samples) action();
    }
    checkIdentity(at) {
      const state = this.ws.state;
      if (!this.ws.connected || !state?.patient || this.pins.identity) return;
      const signature = this.signature();
      const fresh = at - this.lastPoseAt < 1800;
      if (fresh && this.poses.length > 1) {
        this.stable("identity", "mismatch", 2, () => this.ws.send("mismatch", { source: "live" }));
        return;
      }
      if (!this.anchor && signature && state.identity === "VERIFIED" && at - this.identitySince < 3000) {
        this.captureAnchor();
      }
      if (!signature || !this.anchor) {
        if (at - this.identitySince > 1800) {
          this.stable("identity", "lost", 3, () => this.ws.send("mismatch", { source: "live" }));
        }
        return;
      }
      const distance = signature.histogram.reduce((sum, value, i) => sum + Math.abs(value - this.anchor.histogram[i]), 0);
      const centerShift = Math.hypot(signature.center.x - this.anchor.center.x, signature.center.y - this.anchor.center.y);
      const mismatch = distance > .55 || (centerShift > .45 && distance > .25);
      const match = distance < .32 && centerShift < .5;
      if (mismatch) this.stable("identity", "mismatch", 3, () => this.ws.send("mismatch", { source: "live" }));
      else if (match) this.stable("identity", "match", 5, () => {
        if (state.identity !== "VERIFIED" || state.identity_source !== "live") this.ws.send("identify", { source: "live" });
      });
      else this.stability.identity = null;
    }
    checkPose() {
      const state = this.ws.state;
      if (!this.ws.connected || !state?.pose_active || this.pins.pose) return;
      const pose = this.poses.length === 1 ? this.poses[0] : null;
      const valid = pose && [0, 5, 6, 9, 10].every((i) => pose.keypoints[i].score >= .35);
      let target = "UNKNOWN";
      if (valid) {
        const k = pose.keypoints;
        target = k[9].y < k[5].y && k[10].y < k[6].y ? "VERIFIED" : "MISMATCH";
      }
      this.stable("pose", target, 3, () => {
        if (state.pose !== target || state.pose_source !== "live") {
          this.ws.send({ VERIFIED: "pose_verified", MISMATCH: "pose_mismatch", UNKNOWN: "pose_unknown" }[target], { source: "live" });
        }
      });
    }
    captureBaseline() {
      const live = Boolean(this.stream && this.video.readyState >= 2);
      if (live) {
        this.sctx.drawImage(this.video, 0, 0, W, H);
        this.baseline = this.sctx.getImageData(0, 0, W, H);
      } else {
        this.baseline = null;
      }
      this.pins.room = !live;
      this.objectBox = null;
      this.stability.room = null;
      this.ws.send("baseline", { source: live ? "live" : "override" });
      if (!live) this.ws.error("No camera frame: baseline is a presenter simulation. Start camera for a real reference.");
    }
    checkRoom() {
      if (!this.ws.connected || !this.baseline || this.pins.room) return;
      const cols = Math.floor(ROI.w / 4), rows = Math.floor(ROI.h / 4);
      const mask = new Uint8Array(cols * rows);
      let brightnessShift = 0, count = 0;
      for (let i = 0; i < this.frame.data.length; i += 64) {
        brightnessShift += this.frame.data[i] - this.baseline.data[i]; count++;
      }
      brightnessShift /= count;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = ((ROI.y + y * 4 + 2) * W + ROI.x + x * 4 + 2) * 4;
        const delta = [0, 1, 2].reduce((sum, c) =>
          sum + Math.abs(this.frame.data[i + c] - this.baseline.data[i + c] - brightnessShift), 0) / 3;
        const edgeChange = Math.abs(
          (this.frame.data[i] - this.frame.data[i + 4]) - (this.baseline.data[i] - this.baseline.data[i + 4]));
        mask[y * cols + x] = delta > 28 && (edgeChange > 16 || delta > 45) ? 1 : 0;
      }
      const component = largestComponent(mask, cols, rows);
      const blocked = Boolean(component && component.count >= 8);
      this.objectBox = blocked ? { x: ROI.x + component.x * 4, y: ROI.y + component.y * 4,
        w: component.w * 4, h: component.h * 4 } : null;
      this.stable("room", blocked, blocked ? 3 : 5, () => {
        const target = blocked ? "BLOCKED" : "CLEAR";
        if (this.ws.state.room !== target || this.ws.state.room_source !== "live") {
          this.ws.send(blocked ? "room_blocked" : "room_clear", { source: "live" });
        }
      });
    }
    syntheticPose() {
      const up = this.ws.state?.pose === "VERIFIED";
      const xy = [[152, 44], [148, 41], [156, 41], [144, 44], [160, 44],
        [134, 66], [170, 66], [up ? 119 : 127, up ? 44 : 91], [up ? 185 : 177, up ? 44 : 91],
        [up ? 116 : 123, up ? 21 : 116], [up ? 188 : 181, up ? 21 : 116],
        [140, 112], [164, 112], [138, 140], [166, 140], [136, 167], [168, 167]];
      return xy.map(([x, y]) => ({ x, y, score: 1 }));
    }
    draw(at) {
      const ctx = this.ctx, state = this.ws.state;
      const sx = this.canvas.width / W, sy = this.canvas.height / H;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.fillStyle = "#050e19"; ctx.fillRect(0, 0, W, H);
      const lidar = !state || state.mode === "LIDAR_SIM";
      if (!lidar && this.stream && this.video.readyState >= 2) ctx.drawImage(this.video, 0, 0, W, H);
      else {
        ctx.strokeStyle = "#123043"; ctx.lineWidth = .35;
        for (let x = 0; x <= W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y <= H; y += 15) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }
      if (lidar && this.frame) {
        ctx.lineWidth = .3;
        for (let x = 4; x < W - 4; x += 8) {
          let hit = null;
          for (let y = H - 16; y > 20; y -= 4) {
            const i = (y * W + x) * 4;
            if (Math.abs(this.frame.data[i] - this.frame.data[i - 16]) > 35) { hit = y; break; }
          }
          if (hit !== null) {
            ctx.strokeStyle = "#10b98166"; ctx.beginPath(); ctx.moveTo(W / 2, H);
            ctx.lineTo(x, hit); ctx.stroke();
            ctx.fillStyle = "#6ee7b7"; ctx.fillRect(x - .6, hit - .6, 1.2, 1.2);
          }
        }
      }
      const freshPoses = at - this.lastPoseAt < 1800 ? this.poses : [];
      const demo = this.pins.identity || this.pins.pose || (!this.detector && state?.pose_active);
      const poses = freshPoses.length ? freshPoses.map((p) => p.keypoints) : demo ? [this.syntheticPose()] : [];
      const color = state?.identity === "MISMATCH" ? "#f59e0b"
        : state?.pose_active && state.pose !== "VERIFIED" ? "#ef4444" : state?.identity === "VERIFIED" ? "#10b981" : "#06b6d4";
      for (let n = 0; n < poses.length; n++) {
        const points = poses[n], box = bounds(points);
        if (!box) continue;
        ctx.strokeStyle = lidar ? "#ef4444" : n > 0 ? "#f59e0b" : color;
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        if (!lidar) {
          ctx.beginPath();
          for (const [a, b] of LINKS) {
            if (points[a].score >= .3 && points[b].score >= .3) {
              ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y);
            }
          }
          ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle;
          for (const point of points.filter((p) => p.score >= .3)) {
            ctx.beginPath(); ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2); ctx.fill();
          }
          const nose = points[0];
          ctx.strokeRect(nose.x - 8, nose.y - 9, 16, 18);
        }
        ctx.font = "4.7px monospace"; ctx.fillStyle = ctx.strokeStyle;
        const label = lidar ? "OBSTACLE_ID_04: DYNAMIC CYLINDER | DIST: 1.4m (SIM)"
          : n > 0 ? "UNVERIFIED PERSON" : state?.identity === "VERIFIED" ? "VERIFIED: SID / RE-ID 01"
            : state?.identity === "MISMATCH" ? "WARNING: IDENTITY MISMATCH" : "PERSON / NOT VERIFIED";
        ctx.fillText(label, Math.max(3, Math.min(box.x, W - label.length * 2.85)), Math.max(22, box.y - 3));
      }
      if (!freshPoses.length && this.motionBox && !demo) {
        const box = this.motionBox;
        ctx.strokeStyle = "#06b6d4"; ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.fillStyle = "#67e8f9"; ctx.font = "5px monospace";
        ctx.fillText("MOTION CENTROID / NOT A PERSON CLASSIFIER", 8, 34);
      }
      ctx.strokeStyle = state?.room === "BLOCKED" ? "#ef4444" : "#06b6d4";
      ctx.setLineDash([3, 3]); ctx.lineWidth = .6;
      ctx.strokeRect(ROI.x, ROI.y, ROI.w, ROI.h); ctx.setLineDash([]);
      ctx.font = "5px monospace"; ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText("GANTRY ZONE / ROOM ROI", ROI.x, ROI.y - 3);
      if (this.objectBox && state?.room === "BLOCKED") {
        const b = this.objectBox;
        ctx.strokeStyle = "#ef4444"; ctx.fillStyle = "#ef444433"; ctx.lineWidth = 1.5;
        ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = "#fca5a5"; ctx.fillText("UNEXPECTED OBJECT", ROI.x, ROI.y + ROI.h + 7);
      }
      if (!freshPoses.length && demo) {
        ctx.fillStyle = "#fcd34d"; ctx.font = "5px monospace";
        ctx.fillText("DEMO SKELETON / NOT LIVE POSE", 8, H - 20);
      } else if (!this.stream) {
        ctx.fillStyle = "#8fa6be"; ctx.font = "7px monospace";
        ctx.fillText("START CAMERA OR USE PRESENTER CONTROLS", 18, H / 2);
      }
    }
  }
  window.vision = new VisionEngine();
})();
