"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const set = (id, text) => { if ($(id)) $(id).textContent = text; };
  const time = (value) => new Date(value).toLocaleTimeString([], { hour12: false });
  const role = document.body.dataset.role;
  if (!role) return;

  class ClinicalSocket extends EventTarget {
    constructor() {
      super();
      this.state = null;
      this.connected = false;
      this.retry = 500;
      this.closed = false;
      this.connect();
      window.addEventListener("pagehide", () => {
        this.closed = true;
        clearTimeout(this.timer);
        this.socket.close();
      });
    }
    connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      this.socket = new WebSocket(`${protocol}//${location.host}/ws?role=${role}`);
      this.socket.onopen = () => {
        this.retry = 500;
        set("connection", "SYNCING");
      };
      this.socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); }
        catch (error) { this.error(`Invalid server response: ${error.message}`); return; }
        if (message.type === "error") { this.error(message.message); return; }
        if (message.type !== "state") { this.error("Unknown server message."); return; }
        const previous = this.state;
        this.state = message.state;
        this.connected = true;
        set("connection", "LIVE SYNC");
        $("connection")?.classList.add("online");
        render(this.state);
        this.dispatchEvent(new CustomEvent("state", { detail: { state: this.state, previous } }));
      };
      this.socket.onerror = () => this.error("WebSocket unavailable. Reconnecting; actions are not queued.");
      this.socket.onclose = () => {
        this.connected = false;
        set("connection", "OFFLINE / RETRYING");
        $("connection")?.classList.remove("online");
        if ($("approve")) $("approve").disabled = true;
        this.dispatchEvent(new Event("offline"));
        if (!this.closed) {
          this.timer = setTimeout(() => this.connect(), this.retry);
          this.retry = Math.min(8000, this.retry * 2);
        }
      };
    }
    error(message) {
      set("notice", message);
      $("notice")?.classList.add("visible");
      this.dispatchEvent(new CustomEvent("notice", { detail: message }));
      console.warn(message);
    }
    send(action, fields = {}) {
      if (!this.connected || this.socket.readyState !== WebSocket.OPEN || !this.state) {
        this.error("Not connected. Reconnect before using controls; no action was sent.");
        return false;
      }
      $("notice")?.classList.remove("visible");
      this.socket.send(JSON.stringify({ action, epoch: this.state.epoch, ...fields }));
      return true;
    }
  }

  function badge(id, value, good, bad) {
    const node = $(id);
    if (!node) return;
    node.textContent = value.replaceAll("_", " ");
    node.className = `status ${value === good ? "good" : value === bad ? "bad" : "warn"}`;
  }

  function render(state) {
    set("stage", state.stage.replaceAll("_", " "));
    set("interruptions", state.interruptions);
    set("saved", `${state.minutes_saved.toFixed(1)} min`);
    set("room-kpi", state.room);
    set("readiness", state.ready ? "READY" : "PENDING");
    set("session-version", `v${state.version} / ${time(state.updated_at)}`);
    badge("identity-status", state.identity, "VERIFIED", "MISMATCH");
    badge("room-status", state.room, "CLEAR", "BLOCKED");
    badge("pose-status", state.pose, "VERIFIED", "MISMATCH");
    for (const name of ["identity", "room", "pose"]) {
      set(`${name}-source`, state[`${name}_source`] ? `Evidence: ${state[`${name}_source`]}` : "No evidence yet");
    }
    document.querySelectorAll("[data-capability]").forEach((node) => {
      node.classList.toggle("complete", Boolean(state.pipeline[node.dataset.capability]));
    });
    const approved = $("approval-banner");
    if (approved) {
      approved.hidden = !state.approved;
      approved.textContent = "Technologist Approved Remotely — Initiating Scout Scan. [SIMULATION ONLY]";
    }
    if ($("approve")) {
      $("approve").disabled = !state.ready || state.approved || !window.CT.connected;
      $("approve").textContent = state.approved ? "Scout simulation initiated" : "Approve & Initiate CT Scan";
    }
    set("approval-reason", state.ready
      ? "All demo prerequisites green. No scanner is connected."
      : "Locked until identity, room readiness, and positioning are green.");
    const verified = state.identity === "VERIFIED";
    set("patient-name", role === "robot" && state.identity === "MISMATCH"
      ? "Identity paused" : state.patient ? "SID" : "Awaiting patient");
    set("patient-exam", state.patient && (verified || role === "acu") ? state.patient.exam : "Scan appointment QR to begin");
    set("guidance", verified ? "Follow the illuminated route to CT Suite 2."
      : state.identity === "MISMATCH" ? "Privacy pause. Confirm Sid before discussing preparation."
      : "Welcome. Start camera & audio, then show your appointment QR.");
    if ($("route")) $("route").classList.toggle("active", verified);
    if ($("privacy-banner")) $("privacy-banner").hidden = state.identity !== "MISMATCH";
    if ($("pose-figure")) {
      $("pose-figure").classList.toggle("raised", state.pose === "VERIFIED");
      $("pose-figure").classList.toggle("verified", state.pose === "VERIFIED");
    }
    set("pose-detail", role === "robot" && !verified
      ? state.identity === "MISMATCH" ? "Clinical positioning guidance paused pending identity confirmation."
        : "Verify the appointment to start the positioning check."
      : state.pose === "VERIFIED"
      ? "SIEMENS REF POSITION VERIFIED: Head-First Supine (Arms Up) — 98% Match"
      : state.pose === "MISMATCH"
        ? "POSITION MISMATCH: BOTH ARMS must be above shoulder level (Current: Arms Down)"
        : state.pose === "UNKNOWN" ? "Tracking uncertain. Show nose, both shoulders and wrists."
          : "Position 1 of 8 / Head-first supine / Arms up");
    set("baseline-status", state.baseline ? "REFERENCE CAPTURED" : "NO CLEAN REFERENCE");
    if ($("event-log")) {
      $("event-log").replaceChildren(...state.events.slice().reverse().map((event) => {
        const item = document.createElement("li");
        item.className = event.level;
        const stamp = document.createElement("time");
        stamp.textContent = time(event.time);
        const text = document.createElement("span");
        text.textContent = event.message;
        item.append(stamp, text);
        return item;
      }));
    }
    if ($("alerts")) {
      const alerts = state.alerts.filter((alert) => alert.active);
      $("alerts").replaceChildren(...alerts.map((alert) => {
        const item = document.createElement("div");
        item.className = `alert-card ${alert.kind === "room" ? "critical" : ""}`;
        const text = document.createElement("p");
        text.textContent = alert.message;
        const button = document.createElement("button");
        button.textContent = alert.acknowledged ? "Acknowledged / condition still active" : "Remote Acknowledge";
        button.disabled = alert.acknowledged;
        button.addEventListener("click", () => window.CT.send("acknowledge", { alert_id: alert.id }));
        item.append(text, button);
        return item;
      }));
      if (!alerts.length) $("alerts").textContent = "No active alerts. Monitoring workflow.";
    }
    if ($("qa-log")) {
      const items = role === "robot" && !verified ? [] : state.qa;
      $("qa-log").replaceChildren(...items.slice().reverse().map((entry) => {
        const item = document.createElement("article");
        item.className = "qa-entry";
        const question = document.createElement("strong");
        question.textContent = entry.question;
        const answer = document.createElement("p");
        answer.textContent = entry.answer;
        const ref = document.createElement("small");
        ref.textContent = `${time(entry.time)} / ${entry.reference} / ${entry.resolved ? "AUTO-RESOLVED FAQ" : "STAFF REVIEW"}`;
        item.append(question, answer, ref);
        return item;
      }));
    }
  }

  window.CT = new ClinicalSocket();
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => window.CT.send(button.dataset.command));
  });
  $("dismiss-notice")?.addEventListener("click", () => $("notice").classList.remove("visible"));
  // Forward presenter hotkeys when the ACU iframe, rather than the robot, owns focus.
  if (role === "acu" && window.parent !== window) {
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat ||
          event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if ("0123456qbr".includes(event.key.toLowerCase()) && event.key.length === 1) {
        event.preventDefault();
        parent.postMessage({ type: "ct-hotkey", key: event.key }, location.origin);
      }
    });
  }
})();
