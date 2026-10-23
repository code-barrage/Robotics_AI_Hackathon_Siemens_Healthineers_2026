"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const set = (id, text) => {
    const node = $(id);
    if (node && node.textContent !== String(text)) node.textContent = String(text);
  };
  const show = (id, visible) => { if ($(id)) $(id).hidden = !visible; };
  const role = document.body.dataset.role;
  const ws = window.CT;
  const patient = role === "patient";
  let voice = true, started = false, recognition = null, listening = false;
  let previousEpoch = null, lastMessage = "", lastAnswer = "", lastGuidance = "", lastCall = "";
  let currentGuidance = "", announced = "", lastLog = "", lastAlertSignature = "";

  function speak(message) {
    if (!patient || !voice || !started || ws.state?.call?.status === "ACCEPTED") return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      ws.error("Voice output is unavailable. All instructions remain on screen.");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-US"; utterance.rate = .9;
    utterance.onerror = ({ error }) => {
      if (!["interrupted", "canceled"].includes(error)) ws.error(`Voice output: ${error}. Please read the on-screen instructions.`);
    };
    speechSynthesis.speak(utterance);
  }

  function openDialog(id) {
    $(id).querySelectorAll(".dialog-error").forEach((node) => node.remove());
    if (!$(id).open) $(id).showModal();
  }
  function closeDialog(id) {
    if ($(id)?.open) $(id).close();
  }
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => closeDialog(button.dataset.close)));

  if (patient) {
    $("patient-start").addEventListener("click", () => {
      started = true;
      show("patient-start", false);
      speak(currentGuidance);
    });
    $("repeat-guidance").addEventListener("click", () => {
      started = true;
      voice = true;
      updateVoice();
      speak(currentGuidance);
    });
    $("voice-toggle").addEventListener("click", () => {
      started = true;
      voice = !voice;
      updateVoice();
      if (voice) speak(currentGuidance);
      else window.speechSynthesis?.cancel();
    });
    $("large-text").addEventListener("click", () => {
      const active = document.body.classList.toggle("large-type");
      $("large-text").setAttribute("aria-pressed", String(active));
      $("large-text").querySelector("span").textContent = active ? "Standard text" : "Larger text";
    });
    $("patient-confirm").addEventListener("click", () => ws.send("patient_confirm"));
    $("patient-help").addEventListener("click", () => ws.send("help"));
    $("patient-pause").addEventListener("click", () => ws.send("pause"));
    $("open-questions").addEventListener("click", () => openDialog("question-dialog"));
    $("open-messages").addEventListener("click", () => openDialog("message-dialog"));
    $("consent-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      window.support.respond("call_decline");
    });
    $("animation-toggle").addEventListener("click", () => {
      const active = $("preparation-view").classList.toggle("playing");
      $("animation-toggle").setAttribute("aria-pressed", String(active));
      set("animation-toggle", active ? "Pause positioning guide" : "Play positioning guide");
      if (active) { started = true; speak($("preparation-caption").textContent); }
    });
    const ask = (text) => {
      if (!text.trim()) { ws.error("Please type or speak a question."); return; }
      if (ws.send("question", { text: text.trim() })) $("question").value = "";
    };
    $("question-form").addEventListener("submit", (event) => { event.preventDefault(); ask($("question").value); });
    document.querySelectorAll("[data-question]").forEach((button) =>
      button.addEventListener("click", () => ask(button.dataset.question)));
    $("microphone").addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      if (ws.state?.call) { ws.error("Finish the support call before using voice questions."); return; }
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) { ws.error("Voice questions are unavailable. Please type or choose a question."); return; }
      started = true;
      window.speechSynthesis?.cancel();
      recognition = new Recognition();
      recognition.lang = "en-US"; recognition.continuous = false; recognition.interimResults = false;
      recognition.onstart = () => { listening = true; set("microphone", "Stop listening"); };
      recognition.onresult = (event) => ask(event.results[0][0].transcript);
      recognition.onerror = ({ error }) => { if (error !== "aborted") ws.error(`Microphone: ${error}. You can type instead.`); };
      recognition.onend = () => { listening = false; set("microphone", "Speak a question"); };
      try { recognition.start(); } catch (error) { ws.error(error.message); }
    });
  } else {
    const expand = (open) => {
      show("clinician-detail", open);
      document.querySelector(".quiet-workspace").hidden = open;
      $("companion-widget").setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("detail-open", open);
      if (open) $("close-detail").focus();
      else $("companion-widget").focus();
    };
    $("companion-widget").addEventListener("click", () => expand($("clinician-detail").hidden));
    $("close-detail").addEventListener("click", () => expand(false));
    $("dispatch-patient").addEventListener("click", () => ws.send("dispatch"));
    $("journey-control").addEventListener("click", () => ws.send(ws.state?.journey.status === "PAUSED" ? "resume" : "pause"));
    $("approve").addEventListener("click", () => ws.send("approve"));
    $("resolve-help").addEventListener("click", () => ws.send("resolve_help"));
  }

  $("message-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (ws.send(patient ? "patient_message" : "staff_message", { text: $("message-input").value })) {
      $("message-input").value = "";
    }
  });
  window.addEventListener("pagehide", () => {
    recognition?.abort();
    if (patient) window.speechSynthesis?.cancel();
  });
  function updateVoice() {
    $("voice-toggle").setAttribute("aria-pressed", String(voice));
    set("voice-toggle", voice ? "Voice on" : "Voice off");
  }

  function patientView(s) {
    const verified = s.identity === "VERIFIED";
    const journey = s.journey.status;
    let title, instruction, subtext = "Your care team is always close by.";
    if (!ws.connected) {
      title = "Let's wait here.";
      instruction = "The connection to your care team was interrupted. Please ask nearby staff for help.";
    } else if (s.identity === "MISMATCH") {
      title = "Let's check your wristband again.";
      instruction = "We have paused to make sure we are helping the right person.";
    } else if (!verified) {
      title = "Hello. Let's get you to your scan.";
      instruction = "Show the code on your wristband to the robot's camera.";
      subtext = s.presence.robot ? "Your camera is managed by the care team." : "Your care team is preparing the robot camera.";
    } else if (!s.patient_confirmed) {
      title = "Hello, Sid. Is this you?";
      instruction = "Your appointment is for an abdominal CT scan.";
      subtext = "If this isn't you, choose “I need help”.";
    } else if (s.approved) {
      title = "Your care team is ready.";
      instruction = "Please follow your technologist's instructions.";
      subtext = "Scout scan demonstration only. No scanner is connected.";
    } else if (journey === "MOVING") {
      title = "Let's go to CT Room 2.";
      instruction = "Follow the route. We'll go at your pace.";
      subtext = "Need a moment? You can pause or ask for help.";
    } else if (journey === "PAUSED") {
      title = "We've paused. Take your time.";
      instruction = "Please stay here. Your care team can help us continue.";
    } else if (journey === "ARRIVED") {
      title = "We've arrived.";
      instruction = s.pose_active && s.pose !== "VERIFIED"
        ? "Raise both arms only if comfortable. Your care team can help."
        : s.pose === "VERIFIED" ? "You're ready for your care team. Please wait here." : "Your care team will help you get ready for your scan.";
    } else {
      title = "You're checked in, Sid.";
      instruction = "We'll let you know when it's time to go to CT Room 2.";
      subtext = "You can ask a question while you wait.";
    }
    set("patient-title", title); set("patient-instruction", instruction); set("patient-subtext", subtext);
    set("patient-kicker", journey === "MOVING" ? "Your journey, one step at a time" : "A little help, every step of the way");
    currentGuidance = `${title} ${instruction}`;
    if (currentGuidance !== lastGuidance) {
      lastGuidance = currentGuidance;
      speak(currentGuidance);
    }
    show("offline-banner", !ws.connected);
    show("patient-confirm", verified && !s.patient_confirmed && ws.connected);
    show("patient-start", !started && !s.patient_confirmed);
    show("wristband-visual", !s.patient_confirmed);
    const journeyVisible = verified && s.patient_confirmed && ["MOVING", "PAUSED", "ARRIVED"].includes(journey);
    show("journey-view", journeyVisible);
    show("preparation-view", verified && journey === "ARRIVED" && !s.approved);
    show("patient-pause", journey === "MOVING");
    $("patient-help").disabled = !ws.connected || s.alerts.some((a) => a.kind === "help" && a.active);
    set("help-feedback", s.alerts.some((a) => a.kind === "help" && a.active)
      ? "Your care team has been notified. For urgent help, alert nearby staff." : "");
    $("open-questions").disabled = !verified || !ws.connected;
    $("open-messages").disabled = !ws.connected;
    if (!verified) {
      closeDialog("question-dialog");
      $("question").value = "";
      $("patient-answer").textContent = "";
      recognition?.abort();
    }
    if (journeyVisible) {
      const path = $("map-route"), length = path.getTotalLength();
      const progress = s.journey.progress / 100;
      const point = path.getPointAtLength(length * progress);
      $("map-progress").setAttribute("stroke-dasharray", `${length * progress} ${length}`);
      $("map-marker").setAttribute("transform", `translate(${point.x} ${point.y})`);
      set("journey-label", journey === "PAUSED" ? "Paused" : journey === "ARRIVED" ? "You are here" : "On our way");
      set("map-caption", journey === "ARRIVED" ? "You are at CT Room 2." : progress > .65 ? "CT Room 2 is just ahead." : progress > .1 ? "We are following the main corridor." : "We are leaving reception.");
    }
    const step = !s.patient_confirmed ? "check" : journey === "ARRIVED" ? "scan" : "journey";
    for (const name of ["check", "journey", "scan"]) {
      if (name === step) $(`step-${name}`).setAttribute("aria-current", "step");
      else $(`step-${name}`).removeAttribute("aria-current");
    }
    const answer = s.qa.at(-1);
    if (verified && answer && answer.id !== lastAnswer) {
      lastAnswer = answer.id;
      set("patient-answer", answer.answer);
      if ($("question-dialog").open) speak(answer.answer);
    }
    const staff = s.messages.filter((message) => message.sender === "clinician" && (verified || !message.verified_context)).at(-1);
    show("staff-note", Boolean(staff));
    if (staff) {
      set("staff-note-text", staff.text);
      if (staff.id !== lastMessage) { lastMessage = staff.id; speak(`A message from your care team. ${staff.text}`); }
    }
    const call = s.call;
    const invited = call?.patient === ws.peerId && call.status === "RINGING";
    if (invited) {
      if (lastCall !== call.id) {
        lastCall = call.id;
        $("camera-consent").checked = false;
        $("camera-consent").disabled = !call.camera;
        set("consent-camera-note", call.camera ? "Camera sharing is optional. Nothing is recorded." : "Robot camera is offline. Audio and written support are still available.");
        closeDialog("question-dialog");
        closeDialog("message-dialog");
        openDialog("consent-dialog");
        speak("Your care team would like to talk. Choose Accept call to turn on your microphone, or Not now to use messages.");
      }
    } else closeDialog("consent-dialog");
    const active = call?.patient === ws.peerId && call.status === "ACCEPTED";
    show("call-panel", active);
    if (active) { window.speechSynthesis?.cancel(); recognition?.abort(); }
  }

  function summarize(s) {
    if (!ws.connected) return { title: "Connection lost", detail: "Live updates are unavailable. Check the connection.", tone: "attention", action: "Check connection" };
    if (s.identity === "MISMATCH") return { title: "Patient check needed", detail: "Escort paused. Confirm the wristband before continuing.", tone: "attention", action: "Assist remotely" };
    if (s.room === "BLOCKED") return { title: "CT 2 needs attention", detail: "Unexpected object in the room zone. Scout remains blocked.", tone: "attention", action: "Review room" };
    if (s.alerts.some((a) => a.active && a.kind === "room")) return {
      title: "Room monitoring needs a check", detail: "Live room evidence is unavailable. Do not rely on the last status.", tone: "attention", action: "Review monitoring",
    };
    if (s.alerts.some((a) => a.active && ["help", "question"].includes(a.kind))) return {
      title: "Your patient needs help", detail: "Send a message or request a live support call.", tone: "attention", action: "Assist remotely",
    };
    if (s.approved) return { title: "Patient handed over", detail: "Scout simulation approved. No scanner is connected.", tone: "calm", action: "View journey" };
    if (s.journey.status === "PAUSED") return { title: "Escort paused", detail: "The patient is waiting. Review before resuming.", tone: "attention", action: "Review pause" };
    if (s.ready) return { title: "Sid is ready at CT 2", detail: "Checks complete. Review and approve the scout simulation.", tone: "ready", action: "Review & approve" };
    if (s.journey.status === "MOVING") return { title: "Sid is on the way to CT 2", detail: "Escorted from reception. No action needed.", tone: "calm", action: "View journey" };
    if (s.journey.status === "ARRIVED") return { title: "Sid has arrived at CT 2", detail: s.pose === "MISMATCH" ? "Arms positioning needs a check. Remote help is available." : "Preparation checks in progress.", tone: s.pose === "MISMATCH" ? "attention" : "calm", action: "View preparation" };
    if (s.patient_confirmed) return { title: "Sid is ready to come through", detail: "Invite the patient when CT 2 is ready.", tone: "ready", action: "Invite patient" };
    if (s.patient) return { title: "Patient is checking in", detail: "Wristband read. Waiting for the patient's confirmation.", tone: "calm", action: "View journey" };
    return { title: "Companion is ready", detail: "Waiting for the patient's wristband. No action needed.", tone: "calm", action: "View journey" };
  }

  function clinicianView(s) {
    const summary = summarize(s);
    $("companion-widget").dataset.tone = summary.tone;
    set("widget-title", summary.title); set("widget-subtitle", summary.detail);
    set("widget-action", `${summary.action} ↗`);
    set("widget-symbol", summary.tone === "attention" ? "!" : summary.tone === "ready" ? "→" : "✓");
    if (summary.title !== announced) {
      announced = summary.title;
      set("widget-announcement", `${summary.title}. ${summary.detail}`);
      set("urgent-announcement", summary.tone === "attention" ? `${summary.title}. ${summary.detail}` : "");
    }
    set("detail-patient", s.patient ? "Sid / Abdominal CT" : "Waiting for patient");
    set("detail-journey", { WAITING: "At reception", READY: "Ready for invitation", MOVING: "On the way to CT 2", PAUSED: "Escort paused", ARRIVED: "At CT Room 2" }[s.journey.status]);
    set("detail-next", summary.detail);
    set("message-privacy-note", s.identity === "VERIFIED" ? "Written guidance also appears on the patient tablet."
      : "Identity is not confirmed. Send only general reassurance; do not share patient-specific details.");
    const checks = [
      ["Identity", s.identity === "VERIFIED" && s.patient_confirmed, s.identity_source],
      ["Room", s.room === "CLEAR", s.room_source], ["Position", s.pose === "VERIFIED", s.pose_source],
    ];
    const signature = JSON.stringify(checks);
    if ($("simple-checks").dataset.signature !== signature) {
      $("simple-checks").dataset.signature = signature;
      $("simple-checks").replaceChildren(...checks.map(([label, good, source]) => {
        const item = document.createElement("span");
        item.className = good ? "check-ok" : "check-pending";
        item.textContent = `${good ? "✓" : "○"} ${label}${source === "override" ? " (demo)" : ""}`;
        return item;
      }));
    }
    show("dispatch-patient", s.journey.status === "READY");
    $("dispatch-patient").disabled = !ws.connected || s.identity !== "VERIFIED" || !s.patient_confirmed || s.room === "BLOCKED";
    show("journey-control", ["PAUSED", "MOVING"].includes(s.journey.status));
    set("journey-control", s.journey.status === "PAUSED" ? "Resume escort" : "Pause escort");
    $("journey-control").disabled = !ws.connected;
    show("approve", s.journey.status === "ARRIVED");
    $("approve").disabled = !ws.connected || !s.ready || s.approved;
    set("approve", s.approved ? "Scout simulation approved" : "Approve scout simulation");
    set("approval-reason", s.ready ? "All prerequisites passed. Simulation only; no scanner connection."
      : "Patient confirmation, arrival, identity, room and position are required for scout approval.");
    const alerts = s.alerts.filter((a) => a.active);
    const alertSignature = JSON.stringify(alerts);
    if (lastAlertSignature !== alertSignature) {
      lastAlertSignature = alertSignature;
      $("simple-alerts").replaceChildren(...alerts.map((alert) => {
        const card = document.createElement("div"); card.className = "simple-alert";
        const message = document.createElement("p"); message.textContent = alert.message;
        const button = document.createElement("button"); button.textContent = alert.acknowledged ? "Seen · condition still active" : "Acknowledge";
        button.disabled = alert.acknowledged || !ws.connected;
        button.addEventListener("click", () => ws.send("acknowledge", { alert_id: alert.id }));
        card.append(message, button); return card;
      }));
    }
    $("resolve-help").disabled = !ws.connected || !alerts.some((a) => ["help", "question"].includes(a.kind));
    $("call-request").disabled = !ws.connected || !s.presence.patient || Boolean(s.call) || Boolean(window.support?.busy);
    const ownCall = s.call?.clinician === ws.peerId;
    show("call-mute", ownCall && s.call.status === "ACCEPTED");
    show("call-end", ownCall);
    show("remote-video-wrap", ownCall && s.call.status === "ACCEPTED");
    set("interruptions", s.interruptions); set("saved", `${s.minutes_saved.toFixed(1)} min`);
    if (lastLog !== s.events.at(-1)?.id) {
      lastLog = s.events.at(-1)?.id;
      $("compact-log").replaceChildren(...s.events.slice(-12).reverse().map((event) => {
        const item = document.createElement("li");
        item.textContent = `${new Date(event.time).toLocaleTimeString()} · ${event.message}`;
        return item;
      }));
      $("clinician-qa").replaceChildren(...s.qa.slice(-4).reverse().map((entry) => {
        const article = document.createElement("article"), question = document.createElement("strong"), answer = document.createElement("p");
        article.className = "qa-entry"; question.textContent = entry.question; answer.textContent = entry.answer;
        article.append(question, answer); return article;
      }));
    }
  }

  function render(s) {
    if (previousEpoch !== s.epoch) {
      previousEpoch = s.epoch; lastMessage = ""; lastAnswer = ""; lastGuidance = ""; lastCall = "";
      lastAlertSignature = ""; lastLog = "";
      $("message-input").value = "";
      if (patient) {
        $("question").value = ""; $("patient-answer").textContent = "";
        recognition?.abort(); window.speechSynthesis?.cancel();
        for (const id of ["question-dialog", "message-dialog", "consent-dialog"]) closeDialog(id);
      }
    }
    if (patient) patientView(s);
    else clinicianView(s);
    const visibleMessages = patient && s.identity !== "VERIFIED"
      ? s.messages.filter((message) => !message.verified_context) : s.messages;
    const messages = JSON.stringify(visibleMessages);
    if ($("message-log").dataset.messages !== messages) {
      $("message-log").dataset.messages = messages;
      $("message-log").replaceChildren(...visibleMessages.map((message) => {
        const item = document.createElement("p"), name = document.createElement("strong"), content = document.createElement("span");
        name.textContent = message.sender === "clinician" ? "Care team: " : "Patient: ";
        content.textContent = message.text;
        item.append(name, content); return item;
      }));
      $("message-log").scrollTop = $("message-log").scrollHeight;
    }
  }
  ws.addEventListener("state", ({ detail }) => render(detail.state));
  ws.addEventListener("offline", () => { if (ws.state) render(ws.state); });
  ws.addEventListener("notice", ({ detail }) => {
    if (!patient) return;
    const dialog = document.querySelector("dialog[open]");
    if (dialog) {
      let error = dialog.querySelector(".dialog-error");
      if (!error) {
        error = document.createElement("p");
        error.className = "dialog-error";
        error.setAttribute("role", "alert");
        dialog.append(error);
      }
      error.textContent = detail;
    }
  });
  window.support?.addEventListener("change", () => { if (!patient && ws.state) clinicianView(ws.state); });
  if (ws.state) render(ws.state);
})();
