(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dashUrl = `${location.protocol}//${location.hostname}:3100`;
  let view = null;
  const probes = {};
  let preview = { on: false, stream: null, timer: null, token: 0 };
  const sections = new Set(["patient", "technician", "tracking", "diagnostics", "settings"]);

  function selectSection() {
    const selected = sections.has(location.hash.slice(1)) ? location.hash.slice(1) : "technician";
    document.querySelectorAll("[data-workspace]").forEach((panel) => {
      const visible = panel.dataset.workspace === selected
        || (selected === "technician" && panel.dataset.workspace === "tracking" && window.CT.state?.pose_active);
      panel.hidden = !visible;
      const frame = panel.querySelector("[data-screen]");
      if (visible && frame && !frame.hasAttribute("src")) frame.src = frame.dataset.src;
      if (frame?.hasAttribute("src") && frame.dataset.visible !== String(visible)) {
        frame.dataset.visible = String(visible);
        frame.contentWindow.postMessage({ type: "ct-workspace-visibility", visible }, location.origin);
      }
    });
    document.querySelectorAll("[data-section]").forEach((link) => {
      if (link.dataset.section === selected) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (selected !== "settings" && preview.on) {
      stopPreview();
      preview.on = false;
      $("cam-preview-toggle").textContent = "Start preview";
    }
  }

  window.addEventListener("hashchange", selectSection);
  window.CT.addEventListener("state", selectSection);
  document.querySelectorAll("[data-screen]").forEach((frame) => frame.addEventListener("load", () => {
    frame.contentWindow.postMessage({ type: "ct-workspace-visibility", visible: !frame.closest("[data-workspace]").hidden }, location.origin);
  }));
  selectSection();

  function notice(msg) {
    const box = $("portal-notice");
    box.textContent = msg || "";
    box.classList.toggle("visible", !!msg);
  }

  async function api(path, body) {
    const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail?.[0]?.msg || `HTTP ${res.status}`);
    return data;
  }

  // ---------- ACU cards ----------
  const camPill = (name, state) => {
    const cls = state === "live" ? "ok" : state === "idle" ? "warn" : "bad";
    return `<span class="pill ${cls}" title="ACU camera API">${esc(name)}: ${esc(state)}</span>`;
  };

  function renderCard(target) {
    const card = document.querySelector(`.acu-card[data-target="${target}"]`);
    const meta = view?.acu.targets[target] || {};
    const p = probes[target];
    const active = view?.acu.active === target;
    card.classList.toggle("active", active);
    const dot = !p ? "" : p.reachable ? "ok" : "bad";
    const devices = (p?.devices || []).map((d) => `<li class="${d.deviceId === p.pinned ? "pinned" : ""}">
        <span class="dot ${d.online ? "ok" : "bad"}"></span>${esc(d.name)}
        <span class="pill">${esc(d.status || "?")}</span>
        ${d.battery != null ? `<span class="pill">${esc(d.battery)}%</span>` : ""}
        ${d.lastSeenLocation ? `<span class="pill">${esc(d.lastSeenLocation)}</span>` : ""}
        ${d.deviceId === p.pinned ? `<span class="pill ok">used by CT</span>` : ""}</li>`).join("");
    const cams = p?.cameras ? Object.entries(p.cameras).map(([k, v]) => camPill(k, v)).join(" ") : `<span class="muted">${p?.reachable ? "no approved robot" : "—"}</span>`;
    card.innerHTML = `
      <header>
        <h3><span class="dot ${dot}"></span>${esc(meta.label || target)}</h3>
        ${active ? `<span class="badge">ACTIVE</span>` : ""}
      </header>
      <div class="url">${esc(meta.url || "")}</div>
      ${!p ? `<p class="muted">Checking…</p>` : !p.reachable ? `<p class="pill bad">Unreachable: ${esc(p.error || "no response")}</p>` : `
      <dl class="facts">
        <dt>Latency</dt><dd>${esc(p.latency_ms)} ms</dd>
        <dt>Robot pin</dt><dd>${esc(p.robot_id || "auto (single approved robot)")}</dd>
        <dt>Workflows</dt><dd>${p.workflows.length} ${p.workflows.length ? `<span class="muted">(${esc(p.workflows.slice(0, 4).map((w) => w.name).join(", "))}${p.workflows.length > 4 ? "…" : ""})</span>` : ""}</dd>
        <dt>CT journey</dt><dd>${p.journey_assigned_to.length ? `assigned to ${esc(p.journey_assigned_to.join(", "))}` : `<span class="muted">not assigned (the CT server assigns it automatically)</span>`}</dd>
        <dt>Speech</dt><dd>${esc(p.speech_language || "—")}</dd>
        <dt>Cameras</dt><dd>${cams}</dd>
      </dl>
      <div><div class="muted" style="font-size:12px;margin-bottom:4px">Devices (${p.devices.length})</div>
        <ul class="devices">${devices || `<li class="muted">No devices registered yet.</li>`}</ul></div>`}
      <div class="row">
        <button class="primary" data-use="${target}" ${active ? "disabled" : ""}>${active ? "In use" : "Use this ACU"}</button>
        <a href="${esc(meta.url)}/docs/index.html" target="_blank" rel="noopener">API docs ↗</a>
        <a href="${esc(meta.url)}/swagger" target="_blank" rel="noopener">Swagger ↗</a>
      </div>`;
  }

  async function probe(target) {
    try { probes[target] = await api(`/api/portal/probe/${target}`); }
    catch (err) { probes[target] = { reachable: false, error: err.message, devices: [] }; }
    renderCard(target);
  }

  async function useAcu(target) {
    notice("");
    try {
      view = await api("/api/portal/acu", { target });
      renderAll();
      if ($("dashboard").hasAttribute("src")) reloadDashboard();
      const diagnostics = document.querySelector('[data-screen="diagnostics"]');
      if (diagnostics.hasAttribute("src")) diagnostics.src = diagnostics.dataset.src;
      probe(target);
    } catch (err) { notice(`Could not switch ACU: ${err.message}`); }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-use]");
    if (btn) useAcu(btn.dataset.use);
  });

  // ---------- Camera ----------
  const form = $("cam-form");

  function renderCamera() {
    const c = view.camera;
    form.querySelector(`input[name=source][value="${c.source}"]`).checked = true;
    const camRadio = form.querySelector(`input[name=camera][value="${c.camera}"]`);
    if (camRadio) camRadio.checked = true;
    form.querySelectorAll("fieldset")[1].disabled = c.source === "laptop";
    $("fps").value = c.fps; $("fps-out").textContent = c.fps;
    const active = probes[view.acu.active];
    const state = active?.cameras?.[c.camera];
    $("cam-availability").textContent = c.source === "laptop"
      ? "The Analysis screen uses this laptop's webcam (browser permission prompt on first use)."
      : c.source === "acu"
        ? `Frames are pulled from ${view.acu.targets[view.acu.active].label}: ${state ? `${c.camera} camera is ${state}` : "camera API status unknown"}.`
        : "Frames are pushed by the robot's journey page to this laptop over the LAN.";
  }

  let saveTimer = null;
  form.addEventListener("input", (e) => {
    if (e.target.id === "fps") $("fps-out").textContent = e.target.value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCamera, e.target.id === "fps" ? 300 : 0);
  });

  async function saveCamera() {
    const data = new FormData(form);
    const body = { source: data.get("source"), camera: data.get("camera") || "face", fps: Number($("fps").value) };
    try {
      view = await api("/api/portal/camera", body);
      renderCamera();
      if (preview.on) startPreview();
    } catch (err) { notice(`Could not save camera choice: ${err.message}`); }
  }

  function stopPreview() {
    preview.token++;
    clearTimeout(preview.timer);
    preview.stream?.getTracks().forEach((t) => t.stop());
    preview.stream = null;
    $("cam-video").hidden = true; $("cam-canvas").hidden = true;
    $("cam-rate").textContent = "—";
  }

  async function startPreview() {
    stopPreview();
    preview.on = true;
    $("cam-preview-toggle").textContent = "Stop preview";
    const token = preview.token;
    const c = view.camera;
    if (c.source === "laptop") {
      $("cam-label").textContent = "Laptop webcam";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: c.fps }, audio: false });
        if (token !== preview.token) { stream.getTracks().forEach((t) => t.stop()); return; }
        preview.stream = stream;
        $("cam-video").srcObject = stream; $("cam-video").hidden = false;
        $("cam-rate").textContent = `${c.fps} fps requested`;
      } catch (err) { $("cam-rate").textContent = `webcam unavailable: ${err.message}`; }
      return;
    }
    $("cam-label").textContent = `${c.camera} · ${c.source === "acu" ? "ACU camera API" : "LAN relay"}`;
    const canvas = $("cam-canvas"); canvas.hidden = false;
    const ctx = canvas.getContext("2d");
    const times = [];
    const tick = async () => {
      if (token !== preview.token) return;
      const started = performance.now();
      try {
        const res = await fetch(`/api/robot-camera/${c.camera}/latest?via=${c.source}&fps=${c.fps}`, { cache: "no-store" });
        if (token !== preview.token) return;
        if (res.ok) {
          const bmp = await createImageBitmap(await res.blob());
          if (canvas.width !== bmp.width) { canvas.width = bmp.width; canvas.height = bmp.height; }
          ctx.drawImage(bmp, 0, 0); bmp.close?.();
          times.push(performance.now()); while (times.length > 10) times.shift();
          const fps = times.length > 1 ? ((times.length - 1) * 1000) / (times.at(-1) - times[0]) : 0;
          $("cam-rate").textContent = `${fps.toFixed(1)} fps received · ${res.headers.get("X-Frame-Source") || "?"}`;
        } else {
          $("cam-rate").textContent = "no fresh frame (camera idle or not supported by this ACU)";
        }
      } catch (err) { $("cam-rate").textContent = `error: ${err.message}`; }
      preview.timer = setTimeout(tick, Math.max(0, 1000 / c.fps - (performance.now() - started)));
    };
    tick();
  }

  $("cam-preview-toggle").addEventListener("click", () => {
    if (preview.on) { stopPreview(); preview.on = false; $("cam-preview-toggle").textContent = "Start preview"; }
    else startPreview();
  });

  // ---------- Dashboard ----------
  function reloadDashboard() {
    $("dashboard").src = `${dashUrl}/?acu=${view.acu.active}&t=${Date.now()}`;
  }

  async function checkDashboard() {
    try { await fetch(dashUrl, { mode: "no-cors", cache: "no-store" }); $("dash-hint").hidden = true; }
    catch { $("dash-hint").hidden = false; }
  }

  $("dash-reload").addEventListener("click", () => { reloadDashboard(); checkDashboard(); });
  $("dash-open").href = dashUrl;

  function renderAll() {
    renderCard("local"); renderCard("hosted"); renderCamera();
    $("dash-target").textContent = `→ ${view.acu.targets[view.acu.active].label} (${view.acu.targets[view.acu.active].url})`;
  }

  // Another tab switched ACU or camera: follow it.
  window.addEventListener("ct-link", async (e) => {
    const s = e.detail || {};
    if (!view) return;
    const camChanged = JSON.stringify(s.camera_config) !== JSON.stringify(view.camera);
    if (s.target !== view.acu.active || camChanged) {
      const switched = s.target !== view.acu.active;
      view = await api("/api/portal");
      renderAll();
      if (switched) {
        if ($("dashboard").hasAttribute("src")) reloadDashboard();
        const diagnostics = document.querySelector('[data-screen="diagnostics"]');
        if (diagnostics.hasAttribute("src")) diagnostics.src = diagnostics.dataset.src;
      }
      if (camChanged && preview.on) startPreview();
    }
  });

  (async () => {
    try {
      view = await api("/api/portal");
      renderAll();
      const loop = () => { probe("local"); probe("hosted"); renderCamera(); };
      loop();
      setInterval(loop, 5000);
    } catch (err) { notice(`Portal API unavailable: ${err.message}`); }
  })();
})();
