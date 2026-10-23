"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const role = document.body.dataset.role;
  const ws = window.CT;
  if (!ws) return;

  class Assistance extends EventTarget {
    constructor() {
      super();
      this.peers = new Map();
      this.local = null;
      this.callId = null;
      this.generation = 0;
      this.busy = false;
      this.epoch = null;
      this.status = "No live connection. Microphone off.";
      this.videoStatus = "Camera is shared only with patient consent.";
      this.muted = false;
      $("call-request")?.addEventListener("click", () => this.request());
      $("call-accept")?.addEventListener("click", () => this.accept());
      $("call-decline")?.addEventListener("click", () => this.respond("call_decline"));
      $("call-end")?.addEventListener("click", () => this.end());
      $("call-mute")?.addEventListener("click", () => {
        this.muted = !this.muted;
        this.local?.getAudioTracks().forEach((track) => { track.enabled = !this.muted; });
        this.emit();
      });
      $("play-audio")?.addEventListener("click", () => this.playAudio());
      ws.addEventListener("state", ({ detail }) => this.onState(detail.state));
      ws.addEventListener("signal", ({ detail }) => this.receive(detail));
      ws.addEventListener("offline", () => {
        this.cleanup();
        this.status = "Connection lost. Microphone and video stopped.";
        this.emit();
      });
      ws.addEventListener("notice", () => {
        if (this.local && !ws.state?.call) this.cleanup();
      });
      window.addEventListener("pagehide", () => this.cleanup());
      if (ws.state) this.onState(ws.state);
    }
    emit() {
      if ($("call-status")) $("call-status").textContent = this.status;
      if ($("remote-video-status")) $("remote-video-status").textContent = this.videoStatus;
      if ($("call-mute")) {
        $("call-mute").textContent = this.muted ? "Turn microphone on" : "Mute microphone";
        $("call-mute").setAttribute("aria-pressed", String(this.muted));
        $("call-mute").disabled = !this.local;
      }
      this.dispatchEvent(new Event("change"));
    }
    async microphone() {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error("Live calls need a supported browser on localhost or HTTPS. Written messages still work.");
      }
      const generation = this.generation;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      if (generation !== this.generation || !ws.connected) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("The request ended while microphone permission was pending. Please try again.");
      }
      this.local = stream;
      this.muted = false;
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => {
        if (this.callId) this.fail(new Error("Microphone disconnected. The call has ended."));
      }));
    }
    async request() {
      if (this.busy || ws.state?.call) return;
      if (!ws.connected || !ws.state?.presence.patient) {
        ws.error("Patient tablet is offline. No call was started.");
        return;
      }
      this.busy = true;
      if ($("call-request")) $("call-request").disabled = true;
      try {
        await this.microphone();
        this.status = "Waiting for patient consent. Audio is not being transmitted.";
        if (!ws.send("call_request")) this.cleanup();
      } catch (error) { this.fail(error); }
      finally {
        this.busy = false;
        this.emit();
      }
    }
    async accept() {
      const call = ws.state?.call;
      if (this.busy || call?.patient !== ws.peerId || call.status !== "RINGING") return;
      this.busy = true;
      if ($("call-accept")) $("call-accept").disabled = true;
      try {
        await this.microphone();
        if (ws.state?.call?.id !== call.id) {
          this.cleanup();
          return;
        }
        ws.send("call_accept", { call_id: call.id, share_camera: Boolean($("camera-consent")?.checked) });
        this.status = "Connecting to your care team...";
      } catch (error) {
        this.cleanup();
        ws.error(`${error.message} You can decline the call and use written messages.`);
      } finally {
        this.busy = false;
        if ($("call-accept")) $("call-accept").disabled = false;
        this.emit();
      }
    }
    respond(action) {
      const call = ws.state?.call;
      if (call) ws.send(action, { call_id: call.id });
    }
    end() {
      this.respond("call_end");
      this.cleanup();
      this.status = "Call ended. Microphone off.";
      this.emit();
    }
    cleanup() {
      this.generation++;
      this.callId = null;
      for (const peer of this.peers.values()) {
        clearTimeout(peer.timer);
        peer.pc.close();
        peer.clones?.forEach((track) => track.stop());
      }
      this.peers.clear();
      this.local?.getTracks().forEach((track) => track.stop());
      this.local = null;
      for (const id of ["remote-audio", "remote-video"]) {
        const element = $(id);
        if (element) { element.srcObject = null; element.hidden = true; }
      }
      if ($("play-audio")) $("play-audio").hidden = true;
      this.videoStatus = "Camera is shared only with patient consent.";
      this.muted = false;
    }
    onState(state) {
      if (this.epoch !== state.epoch) {
        this.epoch = state.epoch;
        this.cleanup();
      }
      const call = state.call;
      const participant = call && [call.patient, call.clinician, call.share_camera ? call.camera : null].includes(ws.peerId);
      if (!participant) {
        if (this.callId || (this.local && !this.busy)) this.cleanup();
        this.status = state.call_note || "No live connection. Microphone off.";
        this.emit();
        return;
      }
      if (call.status === "RINGING") {
        this.status = role === "patient" ? "Your care team would like to talk. Your microphone is still off."
          : "Waiting for patient consent. No media is being transmitted.";
        this.emit();
        return;
      }
      if (this.callId === call.id) return;
      this.callId = call.id;
      this.status = role === "robot" ? "Patient consent received. Connecting camera to clinician..." : "Consent received. Connecting live audio...";
      this.videoStatus = call.share_camera ? "Connecting robot camera..." : "Patient chose audio only. Camera remains private.";
      this.emit();
      if (role === "acu") {
        this.offer(call.patient, "audio").catch((error) => { if (this.callId === call.id) this.fail(error); });
        if (call.share_camera && call.camera) {
          this.offer(call.camera, "video").catch((error) => { if (this.callId === call.id) this.videoFailure(error); });
        }
      }
    }
    createPeer(target, kind) {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const peer = { pc, kind, pending: [], clones: [], timer: null };
      this.peers.set(target, peer);
      const callId = this.callId;
      pc.onicecandidate = ({ candidate }) => {
        if (candidate && this.callId === callId) ws.signal(callId, target, { candidate: candidate.toJSON() });
      };
      if (kind === "audio") {
        if (!this.local) throw new Error("Microphone is not ready. End this call and request a new one.");
        this.local.getAudioTracks().forEach((track) => pc.addTrack(track, this.local));
      } else if (role === "robot") {
        const stream = window.vision?.stream;
        const track = stream?.getVideoTracks().find((item) => item.readyState === "live");
        if (!track) throw new Error("Robot camera is off. Start it in the Camera lab before requesting video.");
        const clone = track.clone();
        peer.clones.push(clone);
        pc.addTrack(clone, new MediaStream([clone]));
        clone.addEventListener("ended", () => this.videoFailure(new Error("Robot camera stopped.")));
      } else {
        pc.addTransceiver("video", { direction: "recvonly" });
      }
      pc.ontrack = ({ track, streams }) => {
        const element = $(track.kind === "video" ? "remote-video" : "remote-audio");
        if (!element) return;
        element.srcObject = streams[0] || new MediaStream([track]);
        element.hidden = false;
        const update = () => {
          if (this.callId !== callId) return;
          if (track.kind === "video") this.videoStatus = "Live robot camera / shared with patient consent";
          else this.status = "Live call connected. Your microphone is on.";
          this.emit();
        };
        track.addEventListener("unmute", update);
        track.addEventListener("mute", () => {
          if (this.callId !== callId) return;
          if (track.kind === "video") this.videoStatus = "Video interrupted. Do not rely on the last image.";
          else this.status = "Audio interrupted. Use written messages if needed.";
          this.emit();
        });
        element.play().catch((error) => {
          if (this.callId !== callId) return;
          if (track.kind === "audio") {
            if ($("play-audio")) $("play-audio").hidden = false;
            this.status = "Tap Enable call sound to hear your care team.";
          } else this.videoStatus = `Video playback blocked: ${error.message}`;
          this.emit();
        });
      };
      pc.onconnectionstatechange = () => {
        if (this.callId !== callId) return;
        if (pc.connectionState === "connected") {
          clearTimeout(peer.timer);
          if (kind === "audio") this.status = "Live call connected. Microphone on unless muted.";
          else if (role === "robot") this.status = "Robot camera shared with clinician. Patient can stop sharing at any time.";
          this.emit();
        }
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          const error = new Error("Live connection interrupted. Use written assistance or retry the call.");
          if (kind === "video") this.videoFailure(error);
          else this.fail(error);
        }
      };
      peer.timer = setTimeout(() => {
        if (pc.connectionState !== "connected" && this.callId === callId) {
          const error = new Error("Live connection timed out. Local/LAN connectivity is required; use written messages.");
          if (kind === "video") this.videoFailure(error);
          else this.fail(error);
        }
      }, 20000);
      return peer;
    }
    async offer(target, kind) {
      const callId = this.callId;
      const peer = this.createPeer(target, kind);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      if (this.callId === callId) ws.signal(callId, target, { description: peer.pc.localDescription.toJSON() });
    }
    async receive(signal) {
      if (signal.call_id !== this.callId) return;
      const call = ws.state.call;
      let peer = this.peers.get(signal.sender);
      const kind = role === "robot" || signal.sender === call.camera ? "video" : "audio";
      try {
        if (!peer) peer = this.createPeer(signal.sender, kind);
        if (signal.description) {
          await peer.pc.setRemoteDescription(signal.description);
          for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
          if (signal.description.type === "offer") {
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            if (this.callId === signal.call_id) ws.signal(this.callId, signal.sender, { description: peer.pc.localDescription.toJSON() });
          }
        } else if (signal.candidate) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate);
          else peer.pending.push(signal.candidate);
        }
      } catch (error) {
        if (this.callId !== signal.call_id) return;
        if (kind === "video") this.videoFailure(error);
        else this.fail(error);
      }
    }
    async playAudio() {
      try {
        await $("remote-audio").play();
        $("play-audio").hidden = true;
        this.status = "Call audio enabled.";
        this.emit();
      } catch (error) { ws.error(`Audio playback: ${error.message}. Written messages remain available.`); }
    }
    videoFailure(error) {
      this.videoStatus = `Video unavailable: ${error.message} Audio/text assistance can continue.`;
      for (const [id, peer] of this.peers) {
        if (peer.kind !== "video") continue;
        clearTimeout(peer.timer);
        peer.pc.close();
        peer.clones.forEach((track) => track.stop());
        this.peers.delete(id);
      }
      if ($("remote-video")) { $("remote-video").srcObject = null; $("remote-video").hidden = true; }
      ws.error(this.videoStatus);
      this.emit();
    }
    fail(error) {
      if (ws.state?.call && [ws.state.call.patient, ws.state.call.clinician].includes(ws.peerId)) this.respond("call_end");
      this.cleanup();
      this.status = `Call unavailable: ${error.message}`;
      ws.error(this.status);
      this.emit();
    }
  }
  window.support = new Assistance();
})();
