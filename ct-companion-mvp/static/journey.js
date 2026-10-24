"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STRINGS = {
    en: {
      stepCheck: "Check in", stepWalk: "Walk", stepRelax: "Relax", stepPrepare: "Prepare", stepScan: "Scan", visit: "Your visit",
      fromTeam: "From your care team",
      welcomeTitle: "Hello.", welcomeNoticed: "Hello there.",
      welcomeLead: "I'm your CT companion. I'll take you to your scan and stay with you.",
      begin: "Begin",
      identifyTitle: "Show your wristband.",
      identifyLead: "Hold the code on your wristband in front of my screen.",
      identifyRetry: "I couldn't read that one. Let's try again, a little slower.",
      identifyNoCamera: "I can't use my camera right now. A team member will check you in.",
      attempt: (n, max) => `Try ${n} of ${max}`,
      noWristband: "I don't have a wristband",
      confirmTitle: (name) => `Hello, ${name}.`,
      confirmLead: (exam, room) => `You're here for your ${exam} in ${room}. Is this you?`,
      yesMe: "Yes, that's me", notMe: "No, that's not me",
      info: [
        { icon: "icon-time", title: "About fifteen minutes.", lead: "That's your whole visit. The scan itself takes less than a minute." },
        { icon: "icon-metal", title: "Metal off, please.", lead: "Before the scan, you'll remove things like watches, jewellery and belts. Your team will help." },
        { icon: "icon-heart", title: "You're never alone.", lead: "Tap Help at any time. A real person from your care team will come." },
      ],
      next: "Continue", ready: "I'm ready. Let's go.", back: "Back",
      guideTitle: "Please follow me.",
      guideLead: (room) => `We're walking to ${room}. I'll go at your pace.`,
      pausedTitle: "Take your time.",
      pausedLead: "We've stopped. Tap the button when you're ready, or ask for help.",
      pause: "Pause. I need a moment.", resume: "I'm ready to continue",
      routeLabel: (room, p) => `Route to ${room}. ${p} percent of the way there.`,
      waitTitle: "Please take a seat.",
      waitLead: "Your technologist will come for you soon. Here's something while you wait.",
      roomDoorTitle: "Reaching your room…",
      roomDoorLead: "I'm reading the code on the door to be sure this is the right room.",
      roomPatientTitle: "You're at CT Room 2.",
      roomPatientLead: "Please scan your wristband again so I know it's still you.",
      roomHint: "Hold your wristband to the camera.",
      roomWrong: "This looks like the wrong room. Please wait here — your care team has been alerted.",
      tileBreathe: "Breathe with me", tileCalm: "A calm view", tileFacts: "Did you know?", tileAsk: "Ask a question",
      breatheIn: "Breathe in", breatheOut: "Breathe out",
      breatheLead: "Follow the circle. In through your nose, slowly out through your mouth.",
      calmTitle: "Take a moment.", calmLead: "Watch the waves. There is nothing you need to do right now.",
      factsTitle: "Did you know?", anotherFact: "Tell me another",
      facts: [
        "A CT scanner takes many X-ray pictures from different angles, then a computer puts them together like slices of bread.",
        "The ring of the scanner is open. You won't be closed in, and you can talk to your team the whole time.",
        "Sea otters hold hands while they sleep, so they don't drift apart.",
        "Honey never spoils. Jars thousands of years old are still edible.",
        "The scanner makes a soft whirring sound. That's normal. It means it's working.",
        "A hummingbird's heart can beat more than a thousand times a minute.",
      ],
      askTitle: "What would you like to know?",
      questions: [
        ["contrast", "Will the contrast feel strange?", "What does contrast injection feel like?"],
        ["eat", "Could I eat before?", "Can I eat food before the scan?"],
        ["metal", "Should I take off my watch?", "Do I need to remove my watch and metal?"],
        ["position", "How will I lie?", "What position and arms for the scan?"],
        ["where", "Where are we going?", "Where is the room?"],
      ],
      other: "Something else",
      otherLead: "I'll ask your care team to come and answer that for you.",
      thinking: "One moment…",
      prepareTitle: "Getting ready.",
      supine: "Lie on your back", prone: "Lie on your front", right: "Lie on your right side", left: "Lie on your left side",
      headFirst: "with your head toward the ring", feetFirst: "with your feet toward the ring",
      armsUp: "Raise both arms above your head, only if it feels comfortable.",
      teamHelps: "Your technologist will help you onto the table.",
      poseOk: "That's perfect. Please stay still.",
      poseAdjust: "Nearly there. Raise both arms above your head, only if comfortable.",
      poseUnknown: "Your technologist will check your position.",
      handoffTitle: (name) => `Thank you, ${name}.`,
      handoffLead: "Your technologist will take it from here. You're doing great.",
      finish: "Finish",
      staffTitle: "Let's get a team member.",
      staffLead: "Please stay here. Someone from your care team is on the way to help you check in.",
      helpTitle: "Help is on the way.",
      helpLead: "Please stay where you are. A member of your care team has been told.",
      helpCancel: "I'm okay now",
      robotLead: (room) => `I'm walking with you to ${room}. Stay beside me, I'll go at your pace.`,
      navMoving: "Walking", navFailed: "I can't find my way right now. A team member is coming.",
      help: "Help",
      privacy: "The camera only reads your wristband. Nothing is recorded.",
      privacyRelay: "My camera helps your care team keep you safe. Nothing is recorded.",
      privacyOff: "Camera off.",
      online: "Connected to your care team", offline: "Reconnecting…",
      duplicate: "This screen is already open on another device.",
      moved: "This journey is now running on another screen, such as the robot. Reload to take it back.",
      wait: "One moment. Your care team is getting things ready.",
      defaultRoom: "CT Room 2", defaultExam: "CT scan",
    },
    de: {
      stepCheck: "Anmelden", stepWalk: "Gehen", stepRelax: "Entspannen", stepPrepare: "Vorbereiten", stepScan: "Aufnahme", visit: "Ihr Besuch",
      fromTeam: "Von Ihrem Team",
      welcomeTitle: "Hallo.", welcomeNoticed: "Schön, dass Sie da sind.",
      welcomeLead: "Ich bin Ihr CT-Begleiter. Ich bringe Sie zu Ihrer Untersuchung und bleibe bei Ihnen.",
      begin: "Los geht's",
      identifyTitle: "Zeigen Sie Ihr Armband.",
      identifyLead: "Halten Sie den Code auf Ihrem Armband vor meinen Bildschirm.",
      identifyRetry: "Das konnte ich nicht lesen. Versuchen wir es noch einmal, etwas langsamer.",
      identifyNoCamera: "Meine Kamera ist gerade nicht verfügbar. Ein Teammitglied meldet Sie an.",
      attempt: (n, max) => `Versuch ${n} von ${max}`,
      noWristband: "Ich habe kein Armband",
      confirmTitle: (name) => `Hallo, ${name}.`,
      confirmLead: (exam, room) => `Sie sind hier für Ihre ${exam} in ${room}. Sind Sie das?`,
      yesMe: "Ja, das bin ich", notMe: "Nein, das bin ich nicht",
      info: [
        { icon: "icon-time", title: "Etwa fünfzehn Minuten.", lead: "So lange dauert Ihr Termin. Die Aufnahme selbst dauert weniger als eine Minute." },
        { icon: "icon-metal", title: "Bitte Metall ablegen.", lead: "Vor der Aufnahme legen Sie Uhren, Schmuck und Gürtel ab. Ihr Team hilft Ihnen." },
        { icon: "icon-heart", title: "Sie sind nie allein.", lead: "Tippen Sie jederzeit auf Hilfe. Ein Mensch aus Ihrem Team kommt zu Ihnen." },
      ],
      next: "Weiter", ready: "Ich bin bereit. Los geht's.", back: "Zurück",
      guideTitle: "Bitte folgen Sie mir.",
      guideLead: (room) => `Wir gehen zu ${room}. Ich passe mich Ihrem Tempo an.`,
      pausedTitle: "Lassen Sie sich Zeit.",
      pausedLead: "Wir haben angehalten. Tippen Sie, wenn Sie bereit sind, oder bitten Sie um Hilfe.",
      pause: "Pause. Ich brauche einen Moment.", resume: "Ich bin bereit weiterzugehen",
      routeLabel: (room, p) => `Weg zu ${room}. ${p} Prozent geschafft.`,
      waitTitle: "Bitte nehmen Sie Platz.",
      waitLead: "Ihr Team holt Sie gleich ab. Hier ist etwas für die Wartezeit.",
      roomDoorTitle: "Wir erreichen Ihren Raum…",
      roomDoorLead: "Ich lese den Code an der Tür, um sicherzugehen, dass es der richtige Raum ist.",
      roomPatientTitle: "Sie sind im CT-Raum 2.",
      roomPatientLead: "Bitte scannen Sie Ihr Armband noch einmal, damit ich weiß, dass Sie es sind.",
      roomHint: "Halten Sie Ihr Armband vor die Kamera.",
      roomWrong: "Das scheint der falsche Raum zu sein. Bitte warten Sie hier — Ihr Team wurde informiert.",
      tileBreathe: "Mit mir atmen", tileCalm: "Ein ruhiger Blick", tileFacts: "Wussten Sie schon?", tileAsk: "Eine Frage stellen",
      breatheIn: "Einatmen", breatheOut: "Ausatmen",
      breatheLead: "Folgen Sie dem Kreis. Durch die Nase ein, langsam durch den Mund aus.",
      calmTitle: "Einen Moment durchatmen.", calmLead: "Schauen Sie den Wellen zu. Sie müssen gerade nichts tun.",
      factsTitle: "Wussten Sie schon?", anotherFact: "Noch eins, bitte",
      facts: [
        "Ein CT macht viele Röntgenbilder aus verschiedenen Winkeln. Ein Computer setzt sie wie Brotscheiben zusammen.",
        "Der Ring des Scanners ist offen. Sie sind nicht eingeschlossen und können jederzeit mit Ihrem Team sprechen.",
        "Seeotter halten sich beim Schlafen an den Händen, damit sie nicht auseinandertreiben.",
        "Honig verdirbt nie. Tausende Jahre alter Honig ist noch essbar.",
        "Der Scanner surrt leise. Das ist normal und bedeutet, dass er arbeitet.",
        "Das Herz eines Kolibris kann über tausendmal pro Minute schlagen.",
      ],
      askTitle: "Was möchten Sie wissen?",
      questions: [
        ["contrast", "Fühlt sich das Kontrastmittel komisch an?", "What does contrast injection feel like?"],
        ["eat", "Durfte ich vorher essen?", "Can I eat food before the scan?"],
        ["metal", "Muss ich meine Uhr abnehmen?", "Do I need to remove my watch and metal?"],
        ["position", "Wie werde ich liegen?", "What position and arms for the scan?"],
        ["where", "Wohin gehen wir?", "Where is the room?"],
      ],
      answers: {
        contrast: "Die Nadel kann kurz pieksen. Beim Kontrastmittel spüren manche Menschen Wärme oder einen metallischen Geschmack, der schnell vergeht. Sagen Sie Ihrem Team sofort Bescheid, wenn Sie Schmerzen haben oder sich unwohl fühlen.",
        eat: "Die Regeln zu Essen und Trinken hängen von Ihrer Untersuchung ab. Folgen Sie den Anweisungen Ihres Teams. Wenn Sie gegessen haben oder unsicher sind, sagen Sie es bitte Ihrem Team.",
        metal: "Metall im Aufnahmebereich kann die Bilder stören. Ihr Team sagt Ihnen, was Sie ablegen sollen. Entfernen Sie niemals selbst ein medizinisches Gerät.",
        position: "In dieser Demonstration liegen Sie auf dem Rücken, mit dem Kopf zuerst, die Arme über dem Kopf, nur wenn es bequem ist. Ihr Team passt die Lagerung bei Bedarf an.",
        where: "Wir gehen von der Anmeldung den Flur entlang zum CT-Raum. Ich zeige Ihnen den Weg.",
      },
      other: "Etwas anderes",
      otherLead: "Ich bitte Ihr Team, zu Ihnen zu kommen und das zu beantworten.",
      thinking: "Einen Moment…",
      prepareTitle: "Vorbereitung.",
      supine: "Legen Sie sich auf den Rücken", prone: "Legen Sie sich auf den Bauch", right: "Legen Sie sich auf die rechte Seite", left: "Legen Sie sich auf die linke Seite",
      headFirst: "mit dem Kopf zum Ring", feetFirst: "mit den Füßen zum Ring",
      armsUp: "Heben Sie beide Arme über den Kopf, nur wenn es bequem ist.",
      teamHelps: "Ihr Team hilft Ihnen auf den Tisch.",
      poseOk: "Perfekt. Bitte bleiben Sie ruhig liegen.",
      poseAdjust: "Fast geschafft. Heben Sie beide Arme über den Kopf, nur wenn es bequem ist.",
      poseUnknown: "Ihr Team prüft Ihre Lage.",
      handoffTitle: (name) => `Danke, ${name}.`,
      handoffLead: "Ihr Team übernimmt jetzt. Sie machen das großartig.",
      finish: "Fertig",
      staffTitle: "Wir holen jemanden aus dem Team.",
      staffLead: "Bitte bleiben Sie hier. Jemand aus Ihrem Team kommt und hilft Ihnen bei der Anmeldung.",
      helpTitle: "Hilfe ist unterwegs.",
      helpLead: "Bitte bleiben Sie, wo Sie sind. Ihr Team wurde informiert.",
      helpCancel: "Mir geht es gut",
      robotLead: (room) => `Ich gehe mit Ihnen zu ${room}. Bleiben Sie neben mir, ich passe mich Ihrem Tempo an.`,
      navMoving: "Unterwegs", navFailed: "Ich finde gerade den Weg nicht. Jemand aus dem Team kommt.",
      help: "Hilfe",
      privacy: "Die Kamera liest nur Ihr Armband. Es wird nichts aufgezeichnet.",
      privacyRelay: "Meine Kamera hilft Ihrem Team, auf Sie aufzupassen. Es wird nichts aufgezeichnet.",
      privacyOff: "Kamera aus.",
      online: "Mit Ihrem Team verbunden", offline: "Verbindung wird hergestellt…",
      duplicate: "Dieser Bildschirm ist bereits auf einem anderen Gerät geöffnet.",
      moved: "Diese Begleitung läuft jetzt auf einem anderen Bildschirm, z. B. dem Roboter. Neu laden, um sie zurückzuholen.",
      wait: "Einen Moment. Ihr Team bereitet alles vor.",
      defaultRoom: "CT-Raum 2", defaultExam: "CT-Untersuchung",
    },
  };

  // English by default; "?lang=de" switches explicitly. Server default comes from CT_LANGUAGE.
  const forcedLang = ["en", "de"].find((l) => l === new URLSearchParams(location.search).get("lang")) || null;
  let lang = forcedLang || "en";
  let speechTag = lang === "de" ? "de-DE" : "en-US";
  let T = STRINGS[lang];
  let room = null;

  const local = {
    epoch: null, started: false, scene: null, info: 0, panel: null, fact: 0,
    lastMessage: null, lastQa: null, chip: null, cooldown: 0, lastPose: null, audio: false,
  };
  let state = null;

  // ---------- Robot host: the KettyBot app (WebView) or its web preview (iframe) ----------
  // Speech, navigation and the face camera live in the robot app; this page asks for them by message.
  const params = new URLSearchParams(location.search);
  const robotHosted = params.get("host") === "robot";
  const EXPECTED_ROOM = "CT-2"; // the room this appointment belongs to (double-QR arrival check)
  // "?mirror=1": a read-only live copy of the robot's screen for the studio / technician. Never speaks or acts.
  const mirror = params.get("mirror") === "1" && !robotHosted;
  const host = { info: null, navigating: null };

  function hostPost(msg) {
    if (mirror) return;
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (window.parent !== window) window.parent.postMessage(msg, "*");
  }

  window.ctHost = {
    receive(msg) {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "host") {
        host.info = msg;
        if (msg.platform === "android") local.audio = true;
        if (!room) room = (msg.destinations || []).find((n) => /\bct\b|^ct/i.test(n)) || null;
        if (state) render(state);
        // On the robot the face camera stays on all visit so the analysis screen can follow the patient.
        if (relayCamera() || ["welcome", "identify"].includes(local.scene)) startCamera();
      } else if (msg.type === "navigation") onNavigation(msg);
      else if (msg.type === "frame") onHostFrame(msg);
      else if (msg.type === "camera" && msg.status === "error") cameraFailed();
    },
  };
  if (robotHosted && !window.ReactNativeWebView) {
    window.addEventListener("message", (event) => {
      if (event.source === window.parent) window.ctHost.receive(event.data);
    });
  }
  const hostNav = () => !!(host.info?.navigation && room);
  const hostEvent = (name) => { if (host.info) hostPost({ type: "event", name }); };

  function navigateRobot() {
    if (!hostNav()) return;
    host.navigating = room;
    hostPost({ type: "navigate", destination: room });
  }

  function onNavigation(msg) {
    if (msg.status === "arrived") {
      host.navigating = null;
      if (state?.journey.status === "MOVING") socket.send("arrive");
    } else if (msg.status === "failed") {
      host.navigating = null;
      toast(T.navFailed);
      speak(T.navFailed);
      if (state?.journey.status === "MOVING") socket.send("help");
    } else if (msg.status === "cancelled") host.navigating = null;
  }

  // ---------- Voice: every spoken line is also on screen, always. ----------
  // Natural neural voice (Piper on the CT laptop) first; the robot's / browser's own TTS is the fallback.
  const voice = { audio: new Audio(), natural: true, token: 0 };
  voice.audio.preload = "auto";

  function deviceSpeak(text) {
    if (host.info?.platform === "android") { hostPost({ type: "speak", text, lang: speechTag }); return; }
    if (!local.audio || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechTag;
    u.rate = 0.92;
    const match = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(speechTag.slice(0, 2).toLowerCase()));
    if (match) u.voice = match;
    speechSynthesis.speak(u);
  }

  function speak(text) {
    if (!text || mirror) return;
    const token = ++voice.token;
    if (!voice.natural || !local.audio) { deviceSpeak(text); return; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (host.info?.platform === "android") hostPost({ type: "stopSpeech" });
    voice.audio.pause();
    voice.audio.src = `/api/tts?lang=${encodeURIComponent(speechTag)}&text=${encodeURIComponent(text)}`;
    voice.audio.play().catch((error) => {
      if (token !== voice.token || error.name === "AbortError") return;
      console.warn("Natural voice unavailable; using device speech.", error);
      // Server said no (503 / missing voice): stop trying for this session. Autoplay blocks just fall back once.
      if (error.name === "NotSupportedError") voice.natural = false;
      deviceSpeak(text);
    });
  }

  function toast(text, sticky = false) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toast.timer);
    if (!sticky) toast.timer = setTimeout(() => { $("toast").hidden = true; }, 5000);
  }

  function translateStatic() {
    document.documentElement.lang = lang;
    $("steps").setAttribute("aria-label", T.visit);
    document.querySelectorAll("[data-t]").forEach((node) => {
      const value = T[node.dataset.t];
      if (typeof value === "string") node.textContent = value;
    });
  }

  // ---------- Connection ----------
  const socket = {
    ws: null, connected: false, retry: 500, closed: false,
    connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${protocol}//${location.host}/ws?role=${mirror ? "mirror" : "journey"}${robotHosted ? "&host=robot" : ""}`);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") {
          this.connected = true;
          this.retry = 500;
          $("link").textContent = T.online;
          render(msg.state);
        } else if (msg.type === "error") {
          console.warn(msg.message);
          if (msg.message.startsWith("Only one")) { this.closed = true; toast(T.duplicate); }
          else if (msg.message.startsWith("Moved")) { this.closed = true; $("link").textContent = T.moved; toast(T.moved, true); }
          else toast(T.wait);
        }
      };
      this.ws.onclose = (event) => {
        this.connected = false;
        if (event.code === 4001 && !this.closed) { this.closed = true; toast(T.moved, true); }
        $("link").textContent = this.closed ? T.moved : T.offline;
        if (!this.closed) {
          setTimeout(() => this.connect(), this.retry);
          this.retry = Math.min(8000, this.retry * 2);
        }
      };
    },
    send(action, fields = {}) {
      if (mirror) return false;
      if (!this.connected || !state) { toast(T.offline); return false; }
      this.ws.send(JSON.stringify({ action, epoch: state.epoch, ...fields }));
      return true;
    },
  };

  // ---------- Camera: presence ("find") and wristband QR ("identify"). Local only. ----------
  const camera = { stream: null, host: false, timer: null, canvas: document.createElement("canvas"), detector: null, prev: null, motion: 0 };

  // "?cam=2" (index) or "?cam=logitech" (label text) picks one of several USB cameras.
  async function cameraConstraints() {
    const base = { width: 640, height: 480 };
    const wanted = new URLSearchParams(location.search).get("cam");
    if (!wanted) return { ...base, facingMode: "user" };
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    probe.getTracks().forEach((t) => t.stop());
    const pick = /^\d+$/.test(wanted) ? cams[Number(wanted)] : cams.find((c) => c.label.toLowerCase().includes(wanted.toLowerCase()));
    console.info("Cameras:", cams.map((c, i) => `${i}: ${c.label}`), "using", pick?.label);
    return pick ? { ...base, deviceId: { exact: pick.deviceId } } : { ...base, facingMode: "user" };
  }

  function startCamera() {
    if (mirror) return Promise.resolve(false);
    camera.starting ??= openCamera().finally(() => { camera.starting = null; });
    return camera.starting;
  }

  // The robot's face camera is relayed (in memory, over the LAN) to the CT laptop's analysis screen.
  const relayCamera = () => robotHosted && !!host.info?.camera;
  const relay = { busy: false, last: 0 };

  function relayFrame(jpeg) {
    const now = Date.now();
    if (relay.busy || now - relay.last < 250) return;
    relay.busy = true;
    relay.last = now;
    fetch("/api/robot-camera/face/frames", { method: "POST", headers: { "Content-Type": "text/plain" }, body: jpeg })
      .catch(() => {})
      .finally(() => { relay.busy = false; });
  }

  async function openCamera() {
    if (camera.stream || camera.host) return true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable (insecure context?)");
      camera.stream = await navigator.mediaDevices.getUserMedia({ video: await cameraConstraints(), audio: false });
      $("camera").srcObject = camera.stream;
      await $("camera").play().catch(() => {});
    } catch (error) {
      if (!host.info?.camera) { console.warn("Camera unavailable", error); return false; }
      // On the robot the page is served over LAN http, so use the robot's own face camera instead.
      camera.host = true;
      $("camera").hidden = true;
      hostPost({ type: "camera", on: true });
    }
    // Only use the native BarcodeDetector if it truly supports QR (it exists but can't
    // decode QR on macOS Chrome / some browsers). Otherwise fall back to the bundled jsQR.
    camera.detector = null;
    if ("BarcodeDetector" in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes("qr_code")) camera.detector = new BarcodeDetector({ formats: ["qr_code"] });
      } catch { camera.detector = null; }
    }
    if (!camera.detector) loadJsQr().catch(() => {});
    $("privacy").textContent = camera.host && relayCamera() ? T.privacyRelay : T.privacy;
    clearInterval(camera.timer);
    camera.timer = setInterval(cameraTick, 250);
    return true;
  }

  function stopCamera(force = false) {
    if (!force && camera.host && relayCamera()) return;
    clearInterval(camera.timer);
    camera.stream?.getTracks().forEach((t) => t.stop());
    camera.stream = null;
    if (camera.host) {
      hostPost({ type: "camera", on: false });
      camera.host = false;
      $("host-frame").hidden = true;
      $("camera").hidden = false;
    }
    camera.prev = null;
    $("privacy").textContent = T.privacyOff;
  }

  function onHostFrame(msg) {
    if (!camera.host || typeof msg.jpeg !== "string") return;
    if (relayCamera()) relayFrame(msg.jpeg);
    const img = $("host-frame");
    img.src = msg.jpeg.startsWith("data:") ? msg.jpeg : `data:image/jpeg;base64,${msg.jpeg}`;
    img.hidden = false;
  }

  function cameraFailed() {
    stopCamera(true);
    if (local.scene === "identify") { $("identify-lead").textContent = T.identifyNoCamera; speak(T.identifyNoCamera); }
  }

  let jsQrLoading = null;
  function loadJsQr() {
    jsQrLoading ??= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/static/vendor/jsQR.js";
      s.onload = resolve; s.onerror = reject;
      document.head.append(s);
    });
    return jsQrLoading;
  }

  const cameraSource = () => (camera.host ? $("host-frame") : $("camera"));

  // One <video> element is shared across scenes; move it into the active scene's viewfinder
  // so the live feed is visible there (reparenting keeps the stream playing).
  function mountCamera(scene) {
    const vf = document.querySelector(`#scene-${scene} .viewfinder`);
    const cam = $("camera"), frame = $("host-frame");
    if (vf && cam.parentElement !== vf) {
      vf.insertBefore(frame, vf.firstChild);
      vf.insertBefore(cam, vf.firstChild);
    }
  }

  function frame(width, height) {
    const source = cameraSource();
    if (camera.host ? !(source.complete && source.naturalWidth) : !source.videoWidth) return null;
    camera.canvas.width = width; camera.canvas.height = height;
    const ctx = camera.canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  async function cameraTick() {
    if (local.scene === "welcome") detectPresence();
    else if (local.scene === "identify" || local.scene === "roomcheck") await scanQr();
  }

  function detectPresence() {
    const img = frame(64, 48);
    if (!img) return;
    const gray = new Uint8Array(64 * 48);
    for (let i = 0; i < gray.length; i++) gray[i] = (img.data[i * 4] + img.data[i * 4 + 1] + img.data[i * 4 + 2]) / 3;
    if (camera.prev) {
      let diff = 0;
      for (let i = 0; i < gray.length; i++) diff += Math.abs(gray[i] - camera.prev[i]);
      camera.motion = diff / gray.length > 6 ? camera.motion + 1 : Math.max(0, camera.motion - 1);
      if (camera.motion >= 3 && !local.noticed) {
        local.noticed = true;
        document.querySelector(".orb").classList.add("noticed");
        document.querySelector("#scene-welcome h1").textContent = T.welcomeNoticed;
        speak(`${T.welcomeNoticed} ${T.welcomeLead}`);
      }
    }
    camera.prev = gray;
  }

  function acceptedPayload(text) {
    let data = null;
    try { data = JSON.parse(text); } catch {
      if (text.includes("PATIENT: SID") && text.includes("ABDOMINAL CT")) data = { patient: "Sid", exam: "Abdominal CT" };
    }
    return data?.patient === "Sid" && data?.exam === "Abdominal CT";
  }

  // Room QR at the destination: {"room":"CT-2"} or plain text "ROOM: CT-2".
  function roomPayload(text) {
    let data = null;
    try { data = JSON.parse(text); } catch {
      const m = text.match(/ROOM[:\s-]*([A-Z]{2,3}[-\s]?\d+)/i);
      if (m) data = { room: m[1] };
    }
    const r = data?.room ? String(data.room).toUpperCase().replace(/\s+/g, "-") : null;
    return r && /^[A-Z]{2,3}-\d+$/.test(r) ? r : null;
  }

  async function scanQr() {
    if (Date.now() < local.cooldown || !socket.connected) return;
    let text = null;
    try {
      if (camera.detector) {
        const codes = await camera.detector.detect(cameraSource());
        text = codes[0]?.rawValue ?? null;
      } else {
        await loadJsQr();
        const img = frame(400, 300);
        if (img && window.jsQR) text = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
      }
    } catch (error) { console.warn("QR decode failed", error); return; }
    if (!text) return;
    local.cooldown = Date.now() + 3500;
    if (local.scene === "roomcheck") {
      if (!state?.arrival_room_ok) {
        const room = roomPayload(text);                      // step 1: robot reads the door code
        if (room) socket.send("room_scan", { room, source: "live" });
      } else if (acceptedPayload(text)) {
        socket.send("arrival_verify", { source: "live" });   // step 2: patient re-scans wristband
      }
      return;
    }
    if (acceptedPayload(text)) {
      document.querySelector(".viewfinder").classList.add("success");
      socket.send("identify", { source: "live" });
    } else {
      socket.send("id_failed", { source: "live" });
      $("identify-lead").textContent = T.identifyRetry;
      speak(T.identifyRetry);
    }
  }

  // ---------- Scenes ----------
  const STEP_OF = { welcome: 0, identify: 0, confirm: 0, staff: 0, inform: 1, guide: 1, roomcheck: 2, wait: 2, prepare: 3, handoff: 4 };
  const helpActive = (s) => s.alerts.some((a) => a.active && a.kind === "help");

  function sceneFor(s) {
    if (s.approved) return "handoff";
    if (s.identity === "MISMATCH" || (s.identity !== "VERIFIED" && s.id_attempts >= 3)) return "staff";
    if (s.identity !== "VERIFIED") return local.started || (mirror && s.id_attempts > 0) ? "identify" : "welcome";
    if (!s.patient_confirmed) return "confirm";
    const j = s.journey.status;
    if (j === "MOVING" || j === "PAUSED") return "guide";
    if (j === "ARRIVED") {
      if (s.pose_active) return "prepare";
      if (!s.arrival_verified) return "roomcheck";
      return "wait";
    }
    return "inform";
  }

  function show(scene) {
    document.querySelectorAll(".scene").forEach((node) => { node.hidden = node.id !== `scene-${scene}`; });
    const step = STEP_OF[scene];
    document.querySelectorAll("#steps li").forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle("done", i < step);
      li.classList.toggle("current", i === step);
      if (i === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    const heading = document.querySelector(`#scene-${scene} h1`);
    requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
  }

  const patientName = (s) => s.patient?.name || "";
  const roomName = () => room || T.defaultRoom;

  function enter(scene, s) {
    local.scene = scene;
    show(scene);
    if (scene === "welcome") {
      local.noticed = false;
      document.querySelector("#scene-welcome h1").textContent = T.welcomeTitle;
      document.querySelector(".orb").classList.remove("noticed");
      document.querySelector(".viewfinder").classList.remove("success");
      startCamera();
    } else if (scene === "identify") {
      mountCamera("identify");
      $("identify-lead").textContent = T.identifyLead;
      startCamera().then((ok) => {
        if (!ok) { $("identify-lead").textContent = T.identifyNoCamera; speak(T.identifyNoCamera); }
      });
      speak(`${T.identifyTitle} ${T.identifyLead}`);
    } else if (scene === "confirm") {
      stopCamera();
      const name = patientName(s);
      $("initial").textContent = name.slice(0, 1).toUpperCase();
      $("confirm-title").textContent = T.confirmTitle(name);
      const exam = (s.patient?.exam || T.defaultExam).replace(/\s*\(.*\)/, "");
      $("confirm-lead").textContent = T.confirmLead(exam, roomName());
      speak(`${$("confirm-title").textContent} ${$("confirm-lead").textContent}`);
    } else if (scene === "inform") {
      stopCamera();
      local.info = 0;
      renderInfo();
    } else if (scene === "roomcheck") {
      local.roomPhase = null;
      mountCamera("roomcheck");
      startCamera().then((ok) => { if (!ok) $("roomcheck-lead").textContent = T.identifyNoCamera; });
      renderRoomcheck(s);
    } else if (scene === "wait") {
      stopCamera();
      openPanel(null);
      speak(`${T.waitTitle} ${T.waitLead}`);
    } else if (scene === "prepare") {
      openPanel(null);
      renderPrepare(s, true);
    } else if (scene === "handoff") {
      openPanel(null);
      $("handoff-title").textContent = T.handoffTitle(patientName(s));
      speak(`${$("handoff-title").textContent} ${T.handoffLead}`);
    } else if (scene === "staff") {
      stopCamera();
      speak(`${T.staffTitle} ${T.staffLead}`);
    }
  }

  function renderInfo() {
    const card = T.info[local.info];
    $("inform-icon").className = `card-icon ${card.icon}`;
    $("inform-title").textContent = card.title;
    $("inform-lead").textContent = card.lead;
    $("inform-pager").innerHTML = T.info.map((_, i) => `<span class="${i === local.info ? "on" : ""}"></span>`).join("");
    const last = local.info === T.info.length - 1;
    $("inform-next").textContent = last ? T.ready : T.next;
    $("inform-back").hidden = local.info === 0;
    $("inform-title").focus({ preventScroll: true });
    speak(`${card.title} ${card.lead}`);
  }

  function renderGuide(s, entering) {
    const j = s.journey;
    const moving = j.status === "MOVING";
    const robot = j.source === "robot";
    const title = moving ? T.guideTitle : T.pausedTitle;
    const lead = moving ? (robot ? T.robotLead(roomName()) : T.guideLead(roomName())) : T.pausedLead;
    const changed = $("guide-title").textContent !== title;
    $("guide-title").textContent = title;
    $("guide-lead").textContent = lead;
    $("guide-toggle").textContent = moving ? T.pause : T.resume;
    $("route-svg").classList.toggle("moving", moving);
    // The robot reports only "moving" and "arrived", so its walk has no fake percentage.
    $("route-svg").classList.toggle("indeterminate", robot && moving);
    $("nav-status").hidden = !(robot && moving);
    $("nav-status").textContent = `${T.navMoving} · ${roomName()}`;
    const base = document.querySelector(".route-base");
    const p = robot ? 0 : Math.max(0, Math.min(100, j.progress));
    $("route-progress").setAttribute("stroke-dasharray", `${p} 100`);
    const point = base.getPointAtLength((base.getTotalLength() * p) / 100);
    $("route-dot").setAttribute("cx", point.x);
    $("route-dot").setAttribute("cy", point.y);
    $("route-title").textContent = robot ? T.robotLead(roomName()) : T.routeLabel(roomName(), p);
    if (entering || changed) speak(`${title} ${lead}`);
  }

  // The hub decides whether the patient may walk; the robot follows that decision.
  function syncRobotMotion(s) {
    if (!hostNav()) return;
    const shouldMove = s.journey.status === "MOVING" && s.journey.source === "robot";
    if (shouldMove && !host.navigating) navigateRobot();
    else if (!shouldMove && host.navigating) { host.navigating = null; hostPost({ type: "cancelNavigation" }); }
  }

  function parseProtocol(text) {
    const p = (text || "").toLowerCase();
    return {
      feetFirst: /feet|ff\b/.test(p),
      lying: /prone/.test(p) ? "prone" : /right/.test(p) ? "right" : /left/.test(p) ? "left" : "supine",
      armsUp: /arms?\s*up|arms raised/.test(p),
    };
  }

  function renderPrepare(s, entering) {
    const pose = parseProtocol(s.patient?.protocol);
    const svg = $("pose-svg");
    svg.querySelector(".gantry").setAttribute("transform", "translate(110 150)");
    $("figure").setAttribute("transform", pose.feetFirst ? "translate(540 153) scale(-1 1)" : "translate(150 153)");
    const face = svg.querySelector(".face-mark");
    const faceAt = { supine: [-2, -14], prone: [-2, 14], right: [-16, -2], left: [-16, -2] }[pose.lying];
    face.setAttribute("cx", faceAt[0]); face.setAttribute("cy", faceAt[1]);
    svg.classList.toggle("arms-up", pose.armsUp);
    const lead = `${T[pose.lying]} ${pose.feetFirst ? T.feetFirst : T.headFirst}. ${pose.armsUp ? T.armsUp + " " : ""}${T.teamHelps}`;
    $("prepare-title").textContent = T.prepareTitle;
    $("prepare-lead").textContent = lead;
    $("pose-title").textContent = lead;
    const status = s.pose === "VERIFIED" ? T.poseOk : s.pose === "MISMATCH" ? T.poseAdjust : s.pose === "UNKNOWN" ? T.poseUnknown : "";
    $("pose-status").hidden = !status;
    $("pose-status").textContent = status;
    $("pose-status").classList.toggle("warn", s.pose === "MISMATCH");
    if (entering) speak(`${T.prepareTitle} ${lead}`);
    else if (s.pose !== local.lastPose && status) speak(status);
    local.lastPose = s.pose;
  }

  // ---------- Waiting room ----------
  let breathTimer = null;
  function openPanel(name) {
    local.panel = name;
    $("wait-home").hidden = !!name;
    ["breathe", "calm", "facts", "ask"].forEach((p) => { $(`panel-${p}`).hidden = p !== name; });
    $("panel-back").hidden = !name;
    clearTimeout(breathTimer);
    if (!name) return;
    const heading = document.querySelector(`#panel-${name} h1`);
    requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
    if (name === "breathe") { speak(T.breatheLead); breathe(true); }
    if (name === "calm") speak(`${T.calmTitle} ${T.calmLead}`);
    if (name === "facts") showFact();
    if (name === "ask") { $("answer").textContent = ""; renderChips(); speak(T.askTitle); }
  }

  function breathe(inhale) {
    if (local.panel !== "breathe") return;
    const circle = document.querySelector(".breath");
    circle.classList.toggle("in", inhale);
    circle.classList.toggle("out", !inhale);
    $("breath-word").textContent = inhale ? T.breatheIn : T.breatheOut;
    breathTimer = setTimeout(() => breathe(!inhale), inhale ? 4000 : 6000);
  }

  function showFact() {
    const text = T.facts[local.fact % T.facts.length];
    $("fact-text").textContent = text;
    speak(text);
  }

  function renderChips() {
    $("chips").innerHTML = "";
    [...T.questions, ["other", T.other, ""]].forEach(([id, label, query]) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = label;
      chip.setAttribute("aria-pressed", String(local.chip === id));
      chip.addEventListener("click", () => ask(id, query));
      $("chips").append(chip);
    });
  }

  function ask(id, query) {
    local.chip = id;
    renderChips();
    if (id === "other") {
      socket.send("help");
      $("answer").textContent = T.otherLead;
      speak(T.otherLead);
      return;
    }
    $("answer").textContent = T.thinking;
    local.awaitingAnswer = id;
    socket.send("question", { text: query });
  }

  function renderAnswer(s) {
    const latest = s.qa[s.qa.length - 1];
    if (!latest || latest.id === local.lastQa) return;
    local.lastQa = latest.id;
    if (!local.awaitingAnswer) return;
    const text = lang === "de" ? T.answers[local.awaitingAnswer] || latest.answer : latest.answer;
    local.awaitingAnswer = null;
    $("answer").textContent = text;
    speak(text);
  }

  function renderMessage(s) {
    const latest = [...s.messages].reverse().find((m) => m.sender === "clinician");
    $("message").hidden = !latest;
    if (!latest) return;
    $("message-text").textContent = latest.text;
    if (latest.id !== local.lastMessage) {
      speak(`${T.fromTeam}: ${latest.text}`);
      local.lastMessage = latest.id;
    }
  }

  // ---------- Render ----------
  function renderRoomcheck(s) {
    const wrong = Boolean(s.arrival_room && !s.arrival_room_ok);
    const phase = wrong ? "wrong" : s.arrival_room_ok ? "patient" : "door";
    $("roomcheck-title").textContent = phase === "patient" ? T.roomPatientTitle : T.roomDoorTitle;
    $("roomcheck-lead").textContent = phase === "wrong" ? T.roomWrong
      : phase === "patient" ? T.roomPatientLead : T.roomDoorLead;
    $("roomcheck-hint").hidden = phase !== "patient";
    document.querySelector("#scene-roomcheck .viewfinder")?.classList.toggle("alert", phase === "wrong");
    if (local.roomPhase !== phase) {
      local.roomPhase = phase;
      speak(phase === "wrong" ? T.roomWrong : phase === "patient" ? T.roomPatientLead : T.roomDoorLead);
    }
  }

  function render(s) {
    const previous = state;
    state = s;
    if (s.epoch !== local.epoch) {
      local.epoch = s.epoch;
      local.started = false;
      local.scene = null;
      local.lastQa = s.qa[s.qa.length - 1]?.id ?? null;
      local.lastPose = null;
      local.chip = null;
      local.lastMessage = [...s.messages].reverse().find((m) => m.sender === "clinician")?.id ?? null;
    }
    const scene = sceneFor(s);
    if (scene !== local.scene) { enter(scene, s); hostEvent(`ct_${scene}`); }
    syncRobotMotion(s);
    if (scene === "guide") renderGuide(s, previous === null || sceneFor(previous) !== "guide");
    if (scene === "prepare") renderPrepare(s, false);
    if (scene === "roomcheck") renderRoomcheck(s);
    if (scene === "identify") {
      $("attempts").textContent = s.id_attempts > 0 ? T.attempt(s.id_attempts + 1, 3) : "";
    }
    renderAnswer(s);
    renderMessage(s);
    const help = helpActive(s);
    const wasHelp = !$("help-sheet").hidden;
    $("help-sheet").hidden = !help;
    $("help").hidden = help;
    if (help && !wasHelp) { $("help-title").focus(); speak(`${T.helpTitle} ${T.helpLead}`); }
  }

  // ---------- Wiring ----------
  function unlockAudio() {
    if (local.audio) return;
    local.audio = true;
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  }

  $("begin").addEventListener("click", () => {
    unlockAudio();
    local.started = true;
    if (state) render(state);
  });
  $("confirm-yes").addEventListener("click", () => socket.send("patient_confirm"));
  $("confirm-no").addEventListener("click", () => socket.send("mismatch"));
  $("inform-next").addEventListener("click", () => {
    if (local.info < T.info.length - 1) { local.info += 1; renderInfo(); }
    else if (hostNav()) socket.send("dispatch", { source: "live", text: room });
    else socket.send("dispatch");
  });
  $("inform-back").addEventListener("click", () => { local.info = Math.max(0, local.info - 1); renderInfo(); });
  $("guide-toggle").addEventListener("click", () => socket.send(state?.journey.status === "MOVING" ? "pause" : "resume"));
  document.querySelectorAll("[data-panel]").forEach((tile) => tile.addEventListener("click", () => openPanel(tile.dataset.panel)));
  $("back-home").addEventListener("click", () => { openPanel(null); document.querySelector("#wait-home h1").focus(); });
  $("fact-next").addEventListener("click", () => { local.fact += 1; showFact(); });
  $("finish").addEventListener("click", () => socket.send("reset"));
  $("restart-demo")?.addEventListener("click", () => { if (confirm("Restart the whole demo from the beginning?")) socket.send("reset"); });
  $("help-cancel").addEventListener("click", () => socket.send("help_cancel"));
  document.querySelectorAll("[data-help]").forEach((b) => b.addEventListener("click", () => { unlockAudio(); socket.send("help"); }));
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  // Presenter fallback for the arrival room check (webcam double-scan can be finicky live):
  // V = correct room (CT-2), W = wrong room (MRI-1). Ignored in the read-only mirror.
  if (!mirror) document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest("input, textarea, [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if (key === "v") {
      if (!state?.arrival_room_ok) socket.send("room_scan", { room: EXPECTED_ROOM, source: "override" });
      else socket.send("arrival_verify", { source: "override" });
    } else if (key === "w") socket.send("room_scan", { room: "MRI-1", source: "override" });
  });

  // Pick up the robot's speech language and CT map point from the team's ACU (via the bridge).
  async function loadAcuContext() {
    try {
      const res = await fetch("/api/acu-bridge/status", { cache: "no-store" });
      const info = await res.json();
      if (!forcedLang && info.language) {
        lang = info.language.toLowerCase().startsWith("de") ? "de" : "en";
        speechTag = info.language;
        T = STRINGS[lang];
      }
      const robot = info.devices?.find((d) => d.online && d.status === "approved");
      room = robot?.destinations?.find((n) => /\bct\b|^ct/i.test(n)) || room;
    } catch (error) {
      console.warn("ACU context unavailable; using browser language.", error);
    }
    translateStatic();
  }

  if (reduceMotion) document.documentElement.classList.add("reduced-motion");
  if (robotHosted) { document.documentElement.classList.add("robot"); hostPost({ type: "ready" }); }
  if (mirror) document.documentElement.classList.add("mirror");
  translateStatic();
  loadAcuContext().finally(() => {
    $("link").textContent = T.offline;
    socket.connect();
  });
  window.addEventListener("pagehide", () => { socket.closed = true; socket.ws?.close(); stopCamera(true); });
})();
