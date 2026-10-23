"use strict";

// One shared "is everything linked?" strip: ACU, robot, CT journey, robot screen, cameras, voice.
// Renders into #robot-link, refreshes [data-tray] thumbnails, and emits a "ct-link" window event.
(() => {
  const box = document.getElementById("robot-link");
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chip = (ok, label, detail, warn = false) =>
    `<span class="link-chip ${ok ? "ok" : warn ? "warn" : "bad"}" title="${esc(detail)}">${esc(label)}</span>`;

  function render(s) {
    if (!box) return;
    const r = s.robot;
    const cfg = s.camera_config || { source: "laptop" };
    const feed = s.cameras?.[cfg.camera] || {};
    const target = s.target === "local" ? "Local ACU" : "Hosted ACU";
    const robotLabel = r ? `${r.name} · ${r.online ? "online" : "offline"}${r.battery != null ? ` · ${r.battery}%` : ""}${r.lastSeenLocation ? ` · ${r.lastSeenLocation}` : ""}` : "No robot";
    const camLabel = cfg.source === "laptop" ? "Camera: laptop webcam"
      : `Camera: ${cfg.camera} via ${cfg.source === "acu" ? "ACU API" : "LAN relay"} · ${cfg.fps} fps${feed.fresh ? "" : " · idle"}`;
    box.innerHTML = [
      `<a class="link-chip ${s.reachable ? "ok" : "bad"}" href="/portal" title="${esc(s.acu_url)} · switch in the portal">${esc(target)} ${s.reachable ? "linked" : "offline"}</a>`,
      chip(r?.online, robotLabel, r ? `${r.deviceId} · ${r.status}${r.ip ? ` · ${r.ip}` : ""}` : s.note),
      chip(s.journey_assigned, s.journey_assigned ? "CT journey on robot" : "Journey not assigned", s.journey_url),
      chip(s.robot_screen, s.robot_screen ? "Robot screen live" : "Robot screen not open", "The CT journey page running inside the robot app", !s.robot_screen),
      chip(cfg.source === "laptop" || feed.fresh, camLabel, `${feed.frames || 0} frames relayed`, true),
      chip(s.voice?.loaded?.length, s.voice?.loaded?.length ? "Natural voice ready" : "Voice loading", JSON.stringify(s.voice?.voices || {}), true),
      s.note ? `<span class="link-note">${esc(s.note)}</span>` : "",
    ].join("");
  }

  const trays = [...document.querySelectorAll("img[data-tray]")];
  function refreshTrays(s) {
    for (const img of trays) {
      const cam = img.dataset.tray;
      const info = s?.cameras?.[cam];
      const label = document.querySelector(`[data-tray-status="${cam}"]`);
      if (label) label.textContent = info?.fresh ? "live" : "no frames";
      img.classList.toggle("stale", !info?.fresh);
      if (info?.fresh) img.src = `/api/robot-camera/${cam}/latest?t=${Date.now()}`;
    }
  }

  let last = null;
  async function poll() {
    try {
      const res = await fetch("/api/link/status", { cache: "no-store" });
      last = await res.json();
      render(last);
      window.dispatchEvent(new CustomEvent("ct-link", { detail: last }));
    } catch {
      if (box) box.innerHTML = chip(false, "CT server unreachable", location.host);
    }
  }
  poll();
  setInterval(poll, 3000);
  if (trays.length) setInterval(() => refreshTrays(last), 1000);
})();
