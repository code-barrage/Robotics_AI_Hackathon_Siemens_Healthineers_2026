"""Local CT workflow demonstrator. Does not connect to or control a scanner."""

import asyncio
import base64
import binascii
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
import uvicorn

import acu_bridge
import tts


ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("ct-companion")
DISCLAIMER = (
    "Research Prototype — Neither room readiness nor positioning check is a "
    "validated clinical safety system."
)
WELCOME = (
    "Hello Sid, welcome back. I see you're scheduled for your abdominal scan. "
    "Follow me to CT Suite 2."
)
PRIVACY = (
    "One moment—I need to confirm I am still speaking with Sid before sharing "
    "clinical preparation details."
)
ARMS = "Sid, for a clear abdominal scan, please raise both arms comfortably above your head."
# "mirror" is a read-only copy of the robot's journey screen (studio / technician display).
ROLES = ("robot", "patient", "acu", "journey", "mirror")
SINGLE_ROLES = {"robot", "patient", "journey"}
MAX_ID_ATTEMPTS = 3

# Fixed, inspectable demo corpus: no external model or patient-data transmission.
KNOWLEDGE_BASE = (
    {
        "id": "CT-CONTRAST-01",
        "terms": r"\b(contrast|dye|warm|metallic|injection|iv|needle)\b",
        "answer": (
            "The IV needle may cause a brief pinch. During contrast injection, some people "
            "notice warmth or a metallic taste that usually passes quickly. Tell the "
            "technologist immediately about pain, swelling, breathing difficulty, or feeling "
            "unwell. Your care team will confirm the preparation appropriate for you."
        ),
    },
    {
        "id": "CT-PREP-02",
        "terms": r"\b(breakfast|eat|eating|food|fast|fasting|hungry)\b",
        "answer": (
            "Food and drink instructions vary by scan and local protocol. Follow the "
            "instructions from your imaging team; do not change medicines or extend fasting "
            "based on this demo. If you ate or are unsure, tell the technologist so they "
            "can check your preparation."
        ),
    },
    {
        "id": "CT-METAL-03",
        "terms": r"\b(metal|watch|jewel\w*|belt|zipper)\b",
        "answer": (
            "Removable metal in the scan area can affect the images. The technologist "
            "will tell you which items to remove and where to store them. Tell the team "
            "about implants or medical devices; never remove a medical device yourself."
        ),
    },
    {
        "id": "CT-POSITION-04",
        "terms": r"\b(arms?|position|shoulders?|head.first|supine)\b",
        "answer": (
            "For this demonstration, the target is head-first supine with both arms raised. "
            "Raise your arms only if comfortable and follow the technologist's instructions. "
            "Tell them if pain or limited movement makes this difficult; they can adapt "
            "your positioning."
        ),
    },
    {
        "id": "CT-GUIDE-05",
        "terms": r"\b(where|route|room|suite|directions?)\b",
        "answer": (
            "The demonstration route leads from reception along the corridor to CT Suite 2. "
            "In a real hospital, follow staff directions and local signs."
        ),
    },
)
ESCALATION = re.compile(
    r"\b(pain|painful|allerg\w*|pregnan\w*|kidney|renal|diabet\w*|metformin|"
    r"medicin\w*|medicat\w*|dose|cancer|diagnos\w*|results?|"
    r"breath\w*|swelling|rash|unwell|dizz\w*|faint|emergency)\b",
    re.IGNORECASE,
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# Double-QR arrival check: the patient is re-verified at the destination by scanning a room
# QR (on the door / physician screen) plus the wristband, confirming "right patient, right room".
EXPECTED_ROOM = "CT-2"
ROOM_NAMES = {
    "CT-2": "CT Room 2", "CT-1": "CT Room 1", "MRI-1": "MRI Room 1", "XR-3": "X-Ray Room 3",
}


def fresh_state() -> dict:
    return {
        "epoch": uuid4().hex,
        "version": 0,
        "updated_at": now(),
        "mode": "LIDAR_SIM",
        "stage": "WAITING",
        "patient": None,
        "identity": "WAITING",
        "identity_source": None,
        "id_attempts": 0,
        "room": "UNKNOWN",
        "room_source": None,
        "baseline": False,
        "pose": "NOT_CHECKED",
        "pose_source": None,
        "pose_active": False,
        "approved": False,
        "approval_id": None,
        "interruptions": 0,
        "minutes_saved": 0.0,
        "informed": False,
        "alerts": [],
        "events": [],
        "qa": [],
        "patient_confirmed": False,
        "arrival_room": None,
        "arrival_room_ok": False,
        "arrival_verified": False,
        "journey": {"status": "WAITING", "progress": 0, "source": "simulation", "destination": None},
        "messages": [],
        "call": None,
        "call_note": "",
    }


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal[
        "reset", "mode", "identify", "id_failed", "mismatch", "baseline",
        "room_blocked", "room_clear", "room_unknown", "pose_start", "pose_verified", "start_preparation",
        "pose_mismatch", "pose_unknown", "question", "acknowledge", "approve",
        "patient_confirm", "dispatch", "pause", "resume", "arrive", "room_scan", "arrival_verify", "help",
        "resolve_help", "help_cancel", "staff_message", "patient_message",
        "call_request", "call_accept", "call_decline", "call_end",
    ]
    epoch: str = Field(min_length=1, max_length=64)
    source: Literal["live", "override", "operator"] = "operator"
    text: str = Field(default="", max_length=500)
    alert_id: str = Field(default="", max_length=64)
    mode: Literal["LIDAR_SIM", "HUMAN_AWARENESS"] | None = None
    call_id: str = Field(default="", max_length=64)
    share_camera: bool = False
    room: str = Field(default="", max_length=64)


class Signal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["signal"]
    epoch: str = Field(max_length=64)
    call_id: str = Field(max_length=64)
    target: str = Field(max_length=64)
    description: dict | None = None
    candidate: dict | None = None


class Hub:
    def __init__(self) -> None:
        self.state = fresh_state()
        self.lock = asyncio.Lock()
        self.peers: dict[WebSocket, asyncio.Queue] = {}
        self.peer_ids: dict[WebSocket, str] = {}
        self.replaced: set[WebSocket] = set()
        self.call_started = 0.0

    def ready(self) -> bool:
        s = self.state
        return (s["identity"] == "VERIFIED" and s["room"] == "CLEAR" and s["pose"] == "VERIFIED"
                and s["patient_confirmed"] and s["journey"]["status"] == "ARRIVED"
                and s["arrival_verified"]
                and not any(a["active"] and a["kind"] == "help" for a in s["alerts"]))

    def snapshot(self) -> dict:
        s = self.state
        return {
            "type": "state",
            "state": {
                **s,
                "ready": self.ready(),
                "presence": {role: sum(p.query_params.get("role") == role for p in self.peers)
                             for role in ROLES},
                "pipeline": {
                    "Identify": s["identity"] == "VERIFIED",
                    "Guide": s["patient"] is not None and s["identity"] == "VERIFIED",
                    "Inform": s["informed"],
                    "Check": self.ready(),
                    "Handoff": s["approved"],
                },
            },
        }

    def event(self, message: str, level: str = "info", speech: str = "") -> None:
        self.state["events"] = [
            *self.state["events"][-79:],
            {"id": uuid4().hex, "time": now(), "message": message, "level": level, "speech": speech},
        ]

    def alert(self, kind: str, message: str) -> None:
        if not any(a["kind"] == kind and a["active"] for a in self.state["alerts"]):
            self.state["alerts"] = [
                *self.state["alerts"][-29:],
                {"id": uuid4().hex, "kind": kind, "message": message,
                 "time": now(), "active": True, "acknowledged": False},
            ]

    def resolve(self, kind: str) -> None:
        self.state["alerts"] = [
            {**a, "active": False} if a["kind"] == kind else a
            for a in self.state["alerts"]
        ]

    def apply(self, cmd: Command, role: str) -> None:
        s = self.state
        action = cmd.action
        if cmd.epoch != s["epoch"]:
            raise ValueError("State was reset. Retry the action against the current session.")
        allowed = {
            "acu": {"approve", "acknowledge", "dispatch", "pause", "resume", "resolve_help", "staff_message", "reset",
                    "start_preparation"},
            "patient": {"patient_confirm", "question", "help", "help_cancel", "pause", "patient_message"},
            "robot": {"reset", "mode", "identify", "mismatch", "baseline", "room_blocked",
                      "room_clear", "room_unknown", "pose_start", "pose_verified", "pose_mismatch",
                      "pose_unknown", "question", "dispatch", "arrive", "patient_confirm", "help", "pause",
                      "resume", "id_failed", "room_scan", "arrival_verify"},
            # Patient-facing journey screen on the robot's touchscreen.
            "journey": {"identify", "id_failed", "mismatch", "patient_confirm", "dispatch", "pause",
                        "resume", "arrive", "room_scan", "arrival_verify", "help", "help_cancel", "question", "reset"},
        }
        if action not in allowed.get(role, set()):
            raise ValueError("This action is not available from this interface.")
        if action == "reset":
            self.state = fresh_state()
            self.event("Session reset. Waiting for patient identification.")
            return
        if action == "mode":
            if cmd.mode is None:
                raise ValueError("A display mode is required.")
            s["mode"] = cmd.mode
            return
        if action == "patient_confirm":
            if s["identity"] != "VERIFIED":
                raise ValueError("Scan and verify the wristband before confirming the patient.")
            if s["patient_confirmed"]:
                return
            s["patient_confirmed"] = True
            if s["journey"]["status"] == "WAITING":
                s["journey"]["status"] = "READY"
            self.event("Patient confirmed their appointment. Ready for invitation to CT 2.")
        elif action in {"dispatch", "resume"}:
            if s["identity"] != "VERIFIED" or not s["patient_confirmed"]:
                raise ValueError("The patient must verify and confirm their appointment first.")
            if s["room"] == "BLOCKED" or any(a["active"] and a["kind"] == "help" for a in s["alerts"]):
                raise ValueError("Resolve the room obstruction or patient help request before continuing.")
            expected = "READY" if action == "dispatch" else "PAUSED"
            if s["journey"]["status"] != expected:
                raise ValueError(f"Journey must be {expected.lower()} before this action.")
            if action == "dispatch":
                # The robot-hosted journey reports real motion; everything else is simulated by tick().
                robot = role == "journey" and cmd.source == "live"
                s["journey"].update(source="robot" if robot else "simulation", destination=cmd.text or "CT 2")
            s["journey"]["status"] = "MOVING"
            if s["journey"]["source"] == "robot":
                self.event(f"Robot escorting patient to {s['journey']['destination']}.",
                           speech="Please follow me. I will go at your pace.")
            else:
                self.event("Patient on the way to CT 2. Simulated escort started.",
                           speech="We are going to CT Room 2. Follow the route on the screen at your own pace.")
        elif action == "arrive":
            if s["journey"]["status"] != "MOVING":
                raise ValueError("Start the simulated journey before marking arrival.")
            if role == "journey" and s["journey"]["source"] != "robot":
                raise ValueError("Only the robot can report arrival.")
            s["journey"].update(status="ARRIVED", progress=100)
            self.event("Patient has arrived at CT 2.", speech="We have arrived at CT Room 2. Please scan the room code and your wristband.")
        elif action == "room_scan":
            # Step 1 of the arrival check: the robot automatically scans the QR on the room
            # door to confirm it reached the right room before asking the patient to re-scan.
            if s["journey"]["status"] != "ARRIVED":
                raise ValueError("Mark arrival before scanning the room code.")
            if s["identity"] != "VERIFIED":
                raise ValueError("Verify the patient before the room check.")
            room = (cmd.room or "").strip().upper()
            if not room:
                raise ValueError("No room code was scanned.")
            s["arrival_room"] = room
            name = ROOM_NAMES.get(room, room)
            if room == EXPECTED_ROOM:
                if s["arrival_room_ok"]:
                    return
                s["arrival_room_ok"] = True
                self.resolve("room_mismatch")
                self.event(
                    f"ROOM DOOR CONFIRMED: {name} [{cmd.source}]. Asking the patient to re-scan their wristband.",
                    speech="We've reached the correct room. Please scan your wristband again so I know it's still you.",
                )
            else:
                s["arrival_room_ok"] = False
                s["arrival_verified"] = False
                self.alert("room_mismatch",
                           f"WRONG ROOM: robot scanned {name} at the door, expected {ROOM_NAMES[EXPECTED_ROOM]}.")
                self.event(
                    f"ROOM MISMATCH at the door: {name}; expected {ROOM_NAMES[EXPECTED_ROOM]}. Handoff blocked.",
                    "critical",
                    speech="This is not the right room. Please wait here — your care team has been alerted.",
                )
        elif action == "arrival_verify":
            # Step 2 of the arrival check: inside the confirmed room, the patient re-scans their
            # wristband so the robot confirms the right patient is in the right room.
            if s["journey"]["status"] != "ARRIVED":
                raise ValueError("Mark arrival before the room check.")
            if not s["arrival_room_ok"]:
                raise ValueError("Confirm the room door code before the patient re-scan.")
            if s["identity"] != "VERIFIED":
                raise ValueError("Patient identity is not verified.")
            if s["arrival_verified"]:
                return
            s["arrival_verified"] = True
            self.event(
                f"ARRIVAL VERIFIED: patient re-scan matches at {ROOM_NAMES[EXPECTED_ROOM]} "
                f"— right patient, right room [{cmd.source}].",
                speech="Thank you. You're confirmed in the correct room. Please wait for your care team.",
            )
        elif action == "pause":
            if s["journey"]["status"] != "MOVING":
                raise ValueError("There is no moving journey to pause.")
            s["journey"]["status"] = "PAUSED"
            self.event("Escort paused. Waiting for staff to resume.", "warning",
                       "We have paused. Take your time. Your care team can help.")
        elif action == "help":
            self.alert("help", "Patient requests assistance.")
            if s["journey"]["status"] == "MOVING":
                s["journey"]["status"] = "PAUSED"
            self.event("Patient requests assistance. No automatic call or microphone activation.", "warning")
        elif action == "resolve_help":
            self.resolve("help")
            self.resolve("question")
            self.event("Technologist marked the help request handled. Safety checks remain unchanged.")
        elif action == "help_cancel":
            if not any(a["active"] and a["kind"] == "help" for a in s["alerts"]):
                return
            self.resolve("help")
            self.event("Patient withdrew the help request. Staff may still check in.", "warning")
        elif action in {"staff_message", "patient_message"}:
            if not cmd.text:
                raise ValueError("Write a message first.")
            s["messages"] = [*s["messages"][-29:], {
                "id": uuid4().hex, "time": now(), "sender": "clinician" if role == "acu" else "patient",
                "text": cmd.text, "verified_context": s["identity"] == "VERIFIED",
            }]
            if action == "patient_message":
                self.alert("question", "Patient sent a written message. Review the conversation.")
            self.event("A written message was sent by the care team." if role == "acu" else "Patient sent a message to the care team.")
        elif action == "identify":
            if s["identity"] == "VERIFIED" and s["identity_source"] == cmd.source:
                return
            s["identity"] = "VERIFIED"
            s["identity_source"] = cmd.source
            s["id_attempts"] = 0
            s["patient"] = {"name": "Sid", "exam": "Abdominal CT (contrast)",
                            "protocol": "Head-first supine / arms up"}
            self.resolve("identity")
            self.event(f"PATIENT_VERIFIED: SID. Route to CT Suite 2. [{cmd.source}]", speech=WELCOME)
        elif action == "id_failed":
            if s["identity"] == "VERIFIED":
                return
            s["id_attempts"] = min(MAX_ID_ATTEMPTS, s["id_attempts"] + 1)
            if s["id_attempts"] >= MAX_ID_ATTEMPTS:
                self.alert("identity", "Identification failed 3 times. Staff check-in needed.")
                self.event("Identification failed 3 times. Patient asked to wait for staff.", "warning",
                           "Let's get a team member to help you check in.")
            else:
                self.event(f"Wristband not recognized (attempt {s['id_attempts']} of {MAX_ID_ATTEMPTS}).")
        elif action == "mismatch":
            if s["identity"] == "MISMATCH":
                return
            s["identity"] = "MISMATCH"
            s["identity_source"] = cmd.source
            s["patient_confirmed"] = False
            s["arrival_room_ok"] = False
            s["arrival_verified"] = False
            self.alert("identity", "WARNING: IDENTITY MISMATCH / UNVERIFIED PERSON")
            self.event("Identity mismatch or tracking lost. Clinical details paused.", "warning", PRIVACY)
        elif action == "baseline":
            s["baseline"] = True
            s["room"] = "CLEAR"
            s["room_source"] = cmd.source
            self.resolve("room")
            self.event(f"Clean room reference captured [{cmd.source}]. Keep the camera stationary.")
        elif action in {"room_blocked", "room_clear", "room_unknown"}:
            target = {"room_blocked": "BLOCKED", "room_clear": "CLEAR", "room_unknown": "UNKNOWN"}[action]
            if s["room"] == target and s["room_source"] == cmd.source:
                return
            if cmd.source == "live" and target != "UNKNOWN" and not s["baseline"]:
                raise ValueError("Capture a clean room baseline before live room monitoring.")
            s["room"] = target
            s["room_source"] = cmd.source
            if target == "BLOCKED":
                self.alert("room", "Room 2 Readiness: BLOCKED — Foreign Object Detected")
                self.event("ROOM DEVIATION FLAGGED: Unexpected Object in Gantry Zone", "critical")
            elif target == "CLEAR":
                self.resolve("room")
                self.event(f"Room 2 Readiness: CLEAR [{cmd.source}].")
            else:
                self.alert("room", "Room 2 readiness unknown: live camera evidence unavailable.")
                self.event("Room 2 readiness UNKNOWN. Restore the camera and recapture a clean reference.", "warning")
        elif action == "start_preparation":
            if s["journey"]["status"] != "ARRIVED" or s["identity"] != "VERIFIED" or not s["patient_confirmed"]:
                raise ValueError("Confirm the patient's identity and arrival before starting preparation.")
            if not s["arrival_verified"]:
                raise ValueError("Complete the arrival room check (room + wristband QR) before preparation.")
            if s["approved"]:
                raise ValueError("The patient has already been handed over.")
            if s["pose_active"]:
                return
            s["pose_active"] = True
            s["pose"] = "UNKNOWN"
            s["pose_source"] = None
            self.alert("pose", "Position unknown: waiting for live camera evidence.")
            self.event("Technologist started patient preparation and positioning tracking.",
                       speech="Your technologist is ready. Follow the preparation guidance on the screen.")
        elif action in {"pose_start", "pose_mismatch", "pose_verified", "pose_unknown"}:
            target = {"pose_start": "MISMATCH", "pose_mismatch": "MISMATCH",
                      "pose_verified": "VERIFIED", "pose_unknown": "UNKNOWN"}[action]
            if s["pose"] == target and s["pose_source"] == cmd.source:
                return
            s["pose_active"] = True
            s["pose"] = target
            s["pose_source"] = cmd.source
            if target == "VERIFIED":
                self.resolve("pose")
                self.event(
                    f"SIEMENS REF POSITION VERIFIED: Head-First Supine (Arms Up) — "
                    f"98% Match [demo display; {cmd.source}; arms geometry only]"
                )
            else:
                message = (
                    "POSITION MISMATCH: Abdominal Protocol requires BOTH ARMS RAISED "
                    "above shoulder level (Current: Arms Down)"
                    if target == "MISMATCH" else
                    "Position unknown: keep nose, shoulders and both wrists in camera view."
                )
                self.alert("pose", message)
                self.event(message, "warning", ARMS if target == "MISMATCH" and s["identity"] == "VERIFIED" else "")
        elif action == "question":
            if s["identity"] != "VERIFIED":
                raise ValueError(PRIVACY)
            if not cmd.text:
                raise ValueError("Enter or speak a question first.")
            match = None if ESCALATION.search(cmd.text) else next(
                (entry for entry in KNOWLEDGE_BASE if re.search(entry["terms"], cmd.text, re.I)),
                None,
            )
            answer = match["answer"] if match else (
                "This question needs your technologist. I cannot assess symptoms, diagnoses, "
                "medications, or individual risks. Please speak to your care team before "
                "proceeding. If you feel unwell now, alert staff immediately."
            )
            s["qa"] = [
                *s["qa"][-39:],
                {"id": uuid4().hex, "time": now(), "question": cmd.text, "answer": answer,
                 "resolved": match is not None, "reference": match["id"] if match else "TECHNOLOGIST"},
            ]
            if match:
                s["interruptions"] += 1
                s["minutes_saved"] = round(s["interruptions"] * 1.5, 1)
                s["informed"] = True
                self.event(f"[AUTO-RESOLVED FAQ] {cmd.text} ({match['id']})", speech=answer)
            else:
                self.alert("question", "Patient question requires technologist review.")
                self.event(f"[ESCALATED TO TECHNOLOGIST] {cmd.text}", "warning", answer)
        elif action == "acknowledge":
            alert = next((a for a in s["alerts"] if a["id"] == cmd.alert_id), None)
            if alert is None:
                raise ValueError("This alert no longer exists.")
            s["alerts"] = [
                {**a, "acknowledged": True} if a["id"] == cmd.alert_id else a for a in s["alerts"]
            ]
            self.event(f"Technologist remotely acknowledged: {alert['message']}")
        elif action == "approve":
            if not self.ready():
                raise ValueError("Approval blocked: verify identity, clear Room 2, and verify positioning.")
            if s["approved"]:
                return
            s["approved"] = True
            s["approval_id"] = uuid4().hex
            self.event(
                "Technologist Approved Remotely — Initiating Scout Scan.",
                speech="Technologist approved remotely. Initiating scout scan. Simulation only.",
            )
        if s["approved"] and not self.ready():
            s["approved"] = False
            s["approval_id"] = None
            self.event("Scout simulation stopped: a readiness prerequisite changed.", "critical")
        if s["journey"]["status"] == "MOVING" and (s["identity"] != "VERIFIED" or s["room"] == "BLOCKED"):
            s["journey"]["status"] = "PAUSED"
            self.event("Escort paused for a readiness check. Staff can assist remotely.", "warning")
        s["stage"] = (
            "SCOUT_SIMULATION" if s["approved"] else "READY_FOR_SCOUT" if self.ready()
            else "PRIVACY_PAUSED" if s["identity"] == "MISMATCH"
            else "PATIENT_VERIFIED" if s["identity"] == "VERIFIED" else "WAITING"
        )

    def enqueue(self, ws: WebSocket, message: dict) -> None:
        queue = self.peers[ws]
        if queue.full():
            # Full snapshots supersede older queued states; never grow without bound.
            LOG.warning("Slow WebSocket consumer: replacing stale queued snapshot")
            queue.get_nowait()
        queue.put_nowait(message)

    async def command(self, ws: WebSocket, cmd: Command, role: str) -> None:
        async with self.lock:
            try:
                if cmd.action.startswith("call_"):
                    self.call_command(ws, cmd, role)
                else:
                    self.apply(cmd, role)
            except ValueError as exc:
                self.enqueue(ws, {"type": "error", "message": str(exc)})
                return
            self.broadcast()

    def end_call(self, reason: str) -> None:
        self.state["call"] = None
        self.state["call_note"] = reason
        self.event(reason)

    def call_command(self, ws: WebSocket, cmd: Command, role: str) -> None:
        if cmd.epoch != self.state["epoch"]:
            raise ValueError("Session changed. Request a new call.")
        caller = self.peer_ids[ws]
        call = self.state["call"]
        if cmd.action == "call_request":
            if role != "acu":
                raise ValueError("Only the clinician can request a support call.")
            if call:
                raise ValueError("A support call is already pending or active.")
            patients = [p for p in self.peers if p.query_params.get("role") == "patient"]
            cameras = [p for p in self.peers if p.query_params.get("role") == "robot"]
            if not patients:
                raise ValueError("The patient tablet is not connected. Use local staff assistance.")
            self.state["call"] = {
                "id": uuid4().hex, "status": "RINGING", "clinician": caller,
                "patient": self.peer_ids[patients[0]],
                "camera": self.peer_ids[cameras[0]] if cameras else None,
                "share_camera": False,
            }
            self.state["call_note"] = "Waiting for the patient to accept. No audio or video is shared yet."
            self.call_started = time.monotonic()
            self.event("Clinician requested a support call. Waiting for patient consent.")
            return
        if not call or cmd.call_id != call["id"]:
            raise ValueError("This call has ended. Request a new call.")
        if cmd.action in {"call_accept", "call_decline"}:
            if caller != call["patient"] or call["status"] != "RINGING":
                raise ValueError("Only the invited patient can respond to this request.")
            if cmd.action == "call_decline":
                self.end_call("Patient declined the call. Written assistance remains available.")
            else:
                call["status"] = "ACCEPTED"
                call["share_camera"] = cmd.share_camera and call["camera"] is not None
                self.state["call_note"] = "Patient consent received. Connecting live support."
                self.event("Patient accepted audio support" + (" and robot camera sharing." if call["share_camera"] else " without camera sharing."))
        elif cmd.action == "call_end":
            if caller not in {call["patient"], call["clinician"], call["camera"]}:
                raise ValueError("Only a participant can end this call.")
            self.end_call("Support call ended. Microphones and remote video stopped.")

    async def signal(self, ws: WebSocket, signal: Signal) -> None:
        async with self.lock:
            call = self.state["call"]
            sender = self.peer_ids[ws]
            if (not call or call["status"] != "ACCEPTED" or signal.epoch != self.state["epoch"]
                    or signal.call_id != call["id"]):
                self.enqueue(ws, {"type": "error", "message": "Call is not active; media signaling rejected."})
                return
            pairs = [{call["clinician"], call["patient"]}]
            if call["share_camera"] and call["camera"]:
                pairs.append({call["clinician"], call["camera"]})
            if {sender, signal.target} not in pairs or sender == signal.target:
                self.enqueue(ws, {"type": "error", "message": "Media sharing was not authorized for this participant."})
                return
            target = next((p for p, peer_id in self.peer_ids.items() if peer_id == signal.target), None)
            if target is None:
                self.enqueue(ws, {"type": "error", "message": "Support peer disconnected."})
                return
            self.enqueue(target, {**signal.model_dump(), "sender": sender})

    async def tick(self) -> None:
        while True:
            await asyncio.sleep(1)
            async with self.lock:
                changed = False
                call = self.state["call"]
                if call and call["status"] == "RINGING" and time.monotonic() - self.call_started >= 45:
                    self.end_call("Call request expired without consent. Try again or send a written message.")
                    changed = True
                journey = self.state["journey"]
                if journey["status"] == "MOVING" and journey["source"] != "robot":
                    journey["progress"] = min(100, journey["progress"] + 8)
                    if journey["progress"] == 100:
                        self.apply(Command(action="arrive", epoch=self.state["epoch"]), "robot")
                    changed = True
                if changed:
                    self.broadcast()

    def broadcast(self) -> None:
        self.state["version"] += 1
        self.state["updated_at"] = now()
        # Serialize now: later in-place state changes must not mutate queued messages.
        payload = json.dumps(self.snapshot(), ensure_ascii=False)
        for queue in self.peers.values():
            if queue.full():
                LOG.warning("Slow WebSocket consumer: replacing stale queued snapshot")
                queue.get_nowait()
            queue.put_nowait(payload)

    async def writer(self, ws: WebSocket) -> None:
        queue = self.peers[ws]
        try:
            while True:
                message = await queue.get()
                if isinstance(message, str):
                    await asyncio.wait_for(ws.send_text(message), timeout=2)
                else:
                    await asyncio.wait_for(ws.send_json(message), timeout=2)
        except (WebSocketDisconnect, RuntimeError, OSError, TimeoutError):
            LOG.info("WebSocket writer disconnected")
            with suppress(RuntimeError, OSError):
                await ws.close()


hub = Hub()

CAMERAS = ("face", "tray-1", "tray-2")
FRESH_SECONDS = 10
MAX_FRAME_BYTES = 600_000


class CameraRelay:
    """Latest robot camera frames, kept in memory only. Fed by the robot's journey page, else by the ACU."""

    def __init__(self) -> None:
        self.frames: dict[str, tuple[bytes, float, str]] = {}
        self.acu_cache: dict[str, tuple[bytes | None, float]] = {}
        self.counts: dict[str, int] = {}

    def put(self, camera: str, jpeg: bytes, source: str) -> None:
        self.frames[camera] = (jpeg, time.monotonic(), source)
        self.counts[camera] = self.counts.get(camera, 0) + 1

    def fresh(self, camera: str) -> tuple[bytes, float, str] | None:
        frame = self.frames.get(camera)
        return frame if frame and time.monotonic() - frame[1] < FRESH_SECONDS else None

    async def latest(self, camera: str, via: str = "auto", min_interval: float = 0.15) -> tuple[bytes, str] | None:
        if via != "acu":
            frame = self.fresh(camera)
            if frame:
                return frame[0], frame[2]
            if via == "relay":
                return None
        robot_id = link_state.get("robot_id")
        if not robot_id:
            return None
        cached, at = self.acu_cache.get(camera, (None, 0.0))
        # Throttle ACU polling across all viewers (and back off when the ACU has nothing).
        if time.monotonic() - at < (min_interval if cached else 2.0):
            return (cached, "acu") if cached else None
        data = await asyncio.to_thread(acu_bridge.camera_latest, robot_id, camera)
        self.acu_cache[camera] = (data, time.monotonic())
        return (data, "acu") if data else None

    def status(self) -> dict:
        out = {}
        for camera in CAMERAS:
            frame = self.frames.get(camera)
            acu = self.acu_cache.get(camera, (None, 0.0))
            age = round(time.monotonic() - frame[1], 1) if frame else None
            out[camera] = {
                "fresh": bool(self.fresh(camera)) or bool(acu[0] and time.monotonic() - acu[1] < FRESH_SECONDS),
                "age_s": age, "source": frame[2] if frame else ("acu" if acu[0] else None),
                "frames": self.counts.get(camera, 0),
            }
        return out


relay = CameraRelay()
link_state: dict = {"checked_at": None, "reachable": False, "robot": None, "robot_id": acu_bridge.ROBOT_ID or None,
                    "journey_assigned": False, "note": "Connecting to the ACU…"}

# Portal choices (which ACU, which camera feed), remembered across restarts. Not patient data.
PORTAL_FILE = Path(os.environ.get("CT_PORTAL_FILE", ROOT / "portal_settings.json"))
CAMERA_SOURCES = ("laptop", "acu", "relay")
portal: dict = {"camera": {"source": "laptop", "camera": "face", "fps": 6}}


def load_portal() -> None:
    try:
        saved = json.loads(PORTAL_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    cam = saved.get("camera") or {}
    if cam.get("source") in CAMERA_SOURCES and cam.get("camera") in CAMERAS and isinstance(cam.get("fps"), int):
        portal["camera"] = {"source": cam["source"], "camera": cam["camera"], "fps": max(1, min(15, cam["fps"]))}
    # An explicit ACU_TARGET (launcher -Acu) wins over the remembered choice.
    if saved.get("acu") in acu_bridge.TARGETS and not os.environ.get("ACU_TARGET"):
        acu_bridge.use(saved["acu"])
        link_state["robot_id"] = acu_bridge.ROBOT_ID or None


def save_portal() -> None:
    with suppress(OSError):
        PORTAL_FILE.write_text(json.dumps({"acu": acu_bridge.ACTIVE, **portal}, indent=2), encoding="utf-8")


load_portal()
link_wake = asyncio.Event()
link_generation = 0


async def link_loop() -> None:
    """Keep robot + ACU + CT journey linked without manual setup steps."""
    while True:
        generation = link_generation
        result = await asyncio.to_thread(acu_bridge.link)
        # Discard a result that raced with an ACU switch: it describes the previous ACU.
        if generation == link_generation:
            robot = result.get("robot")
            link_state.update(result, checked_at=now(),
                              robot_id=(robot or {}).get("deviceId") or acu_bridge.ROBOT_ID or None)
            if result.get("note"):
                LOG.info("ACU link (%s): %s", acu_bridge.ACTIVE, result["note"])
        link_wake.clear()
        with suppress(TimeoutError):
            await asyncio.wait_for(link_wake.wait(), timeout=5)


def robot_screen_connected() -> bool:
    return any(p.query_params.get("role") == "journey" and p.query_params.get("host") == "robot" for p in hub.peers)


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = [asyncio.create_task(hub.tick()), asyncio.create_task(link_loop())]
    asyncio.get_running_loop().run_in_executor(None, tts.warm_up)
    yield
    for task in tasks:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    for ws in list(hub.peers):
        with suppress(RuntimeError, OSError):
            await ws.close(code=1001)


app = FastAPI(title="CT Companion Research Prototype", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/portal")


@app.get("/health")
async def health():
    return {"status": "ok", "prototype": True, "clients": len(hub.peers)}


@app.get("/api/acu-bridge/status")
async def bridge_status():
    return await asyncio.to_thread(acu_bridge.status)


class InstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: str = Field(min_length=1, max_length=128)


@app.post("/api/acu-bridge/install")
async def bridge_install(body: InstallRequest):
    try:
        return await asyncio.to_thread(acu_bridge.install, body.device_id)
    except acu_bridge.BridgeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=exc.status)


@app.get("/api/link/status")
async def link_status():
    """One place for every screen to see whether the robot, ACU, journey and cameras are working together."""
    journey = hub.state["journey"]
    return {
        **{k: link_state.get(k) for k in ("checked_at", "acu_url", "reachable", "robot", "robot_id",
                                           "journey_assigned", "journey_url", "auto_approve", "note")},
        "target": acu_bridge.ACTIVE,
        "camera_config": portal["camera"],
        "robot_screen": robot_screen_connected(),
        "screens": hub.snapshot()["state"]["presence"],
        "journey": {"stage": hub.state.get("stage"), "status": journey.get("status"),
                    "source": journey.get("source")},
        "cameras": relay.status(),
        "voice": tts.status(),
    }


@app.get("/api/tts")
async def speech(text: str = "", lang: str = "en-US"):
    if not text.strip() or len(text) > 1200:
        return JSONResponse({"error": "Text must be 1–1200 characters."}, status_code=400)
    try:
        audio = await asyncio.to_thread(tts.synthesize, text, lang)
    except tts.TtsUnavailable as exc:
        return JSONResponse({"error": str(exc)}, status_code=503)
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


@app.post("/api/robot-camera/{camera}/frames")
async def camera_upload(camera: Literal["face", "tray-1", "tray-2"], request: Request):
    body = await request.body()
    if len(body) > MAX_FRAME_BYTES * 4 // 3 + 64:
        return JSONResponse({"error": "Frame too large."}, status_code=413)
    if body[:2] != b"\xff\xd8":
        try:
            text = body.decode("ascii").strip()
            body = base64.b64decode(text.split(",", 1)[-1], validate=True)
        except (UnicodeDecodeError, binascii.Error):
            return JSONResponse({"error": "Send a JPEG or base64 JPEG."}, status_code=400)
    if body[:2] != b"\xff\xd8" or len(body) > MAX_FRAME_BYTES:
        return JSONResponse({"error": "Not a JPEG frame."}, status_code=400)
    relay.put(camera, body, "robot")
    return Response(status_code=204)


@app.get("/api/robot-camera/status")
async def camera_status():
    return relay.status()


@app.get("/api/robot-camera/{camera}/latest")
async def camera_latest(camera: Literal["face", "tray-1", "tray-2"],
                        via: Literal["auto", "acu", "relay"] = "auto", fps: int = 6):
    frame = await relay.latest(camera, via, 1 / max(1, min(15, fps)))
    if not frame:
        return JSONResponse({"error": f"No fresh {camera} frame from the robot."}, status_code=503,
                            headers={"Cache-Control": "no-store"})
    return Response(frame[0], media_type="image/jpeg",
                    headers={"Cache-Control": "no-store", "X-Frame-Source": frame[1]})


@app.get("/api/robot-camera/{camera}/stream")
async def camera_stream(camera: Literal["face", "tray-1", "tray-2"], request: Request,
                        via: Literal["auto", "acu", "relay"] = "auto", fps: int = 6):
    interval = 1 / max(1, min(15, fps))

    async def frames():
        last = None
        while not await request.is_disconnected():
            frame = await relay.latest(camera, via, interval)
            if frame and frame[0] is not last:
                last = frame[0]
                yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                       + str(len(last)).encode() + b"\r\n\r\n" + last + b"\r\n")
            await asyncio.sleep(interval if frame else 1.0)

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-store"})


# ---------- Portal: switch ACU (local ↔ hosted) and camera feed for every screen ----------
def portal_view() -> dict:
    return {
        "acu": {"active": acu_bridge.ACTIVE,
                "targets": {k: {"label": v["label"], "url": v["url"], "robot_id": v["robot_id"] or None}
                            for k, v in acu_bridge.TARGETS.items()}},
        "camera": portal["camera"],
        "dashboard_proxy": "/acu-proxy",
    }


@app.get("/api/portal")
async def portal_get():
    return portal_view()


@app.get("/api/portal/probe/{target}")
async def portal_probe(target: Literal["local", "hosted"]):
    return await asyncio.to_thread(acu_bridge.probe, target)


class AcuChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: Literal["local", "hosted"]


@app.post("/api/portal/acu")
async def portal_acu(body: AcuChoice):
    global link_generation
    if body.target != acu_bridge.ACTIVE:
        acu_bridge.use(body.target)
        link_generation += 1
        relay.acu_cache.clear()
        link_state.update(checked_at=None, reachable=False, robot=None, journey_assigned=False,
                          robot_id=acu_bridge.ROBOT_ID or None, acu_url=acu_bridge.ACU_URL,
                          note=f"Switching to {acu_bridge.TARGETS[body.target]['label']}…")
        hub.event(f"ACU switched to {acu_bridge.TARGETS[body.target]['label']}.")
        hub.broadcast()
        save_portal()
        link_wake.set()
    return portal_view()


class CameraChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["laptop", "acu", "relay"]
    camera: Literal["face", "tray-1", "tray-2"] = "face"
    fps: int = Field(default=6, ge=1, le=15)


@app.post("/api/portal/camera")
async def portal_camera(body: CameraChoice):
    portal["camera"] = body.model_dump()
    save_portal()
    return portal_view()


@app.api_route("/acu-proxy/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
async def acu_proxy(path: str, request: Request):
    """The unified dashboard talks to whichever ACU the portal has selected, through here."""
    if not path.startswith("api/"):
        return JSONResponse({"error": "Only ACU /api routes are proxied."}, status_code=404)
    body = await request.body()
    if len(body) > 20_000_000:
        return JSONResponse({"error": "Request too large."}, status_code=413)
    path_qs = "/" + path + (f"?{request.url.query}" if request.url.query else "")
    target = acu_bridge.ACTIVE
    if request.method == "GET" and path.endswith("/stream"):
        try:
            upstream = await asyncio.to_thread(acu_bridge.open_stream, path_qs)
        except acu_bridge.BridgeError as exc:
            return JSONResponse({"error": str(exc)}, status_code=exc.status)

        def chunks():
            try:
                with upstream:
                    while data := upstream.read1(65536):
                        yield data
            except (OSError, TimeoutError):
                LOG.warning("ACU %s stream interrupted: %s", target, path, exc_info=True)
                raise

        return StreamingResponse(chunks(), status_code=upstream.status,
                                 headers={"Content-Type": upstream.headers.get("Content-Type", "application/octet-stream"),
                                          "Cache-Control": "no-store", "X-Acu-Target": target,
                                          "X-Accel-Buffering": "no"})
    status_code, content, content_type = await asyncio.to_thread(
        acu_bridge.forward, request.method, path_qs, body, request.headers.get("content-type"))
    return Response(content, status_code=status_code, media_type=content_type,
                    headers={"Cache-Control": "no-store", "X-Acu-Target": target})


@app.get("/screens/{screen}", include_in_schema=False)
async def workspace_screen(screen: Literal["patient", "technician", "tracking", "diagnostics"]):
    file = {"patient": "journey", "technician": "acu", "tracking": "robot"}.get(screen)
    path = ROOT / "static" / f"{file}.html" if file else ROOT.parent / "robot-dashboard.html"
    return FileResponse(path, headers={"Cache-Control": "no-store"})


@app.get("/{view}", include_in_schema=False)
async def page(request: Request, view: Literal["robot", "patient", "acu", "clinician", "camera", "studio", "qr", "journey", "portal"]):
    if view in {"portal", "qr"}:
        return FileResponse(ROOT / "static" / f"{view}.html", headers={"Cache-Control": "no-store"})
    if view in {"journey", "patient", "robot"}:
        suffix = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"/screens/patient{suffix}")
    section = {"acu": "technician", "clinician": "technician", "camera": "tracking", "studio": "technician"}[view]
    return RedirectResponse(f"/portal#{section}")


async def close_quietly(ws: WebSocket) -> None:
    with suppress(Exception):
        await ws.close(code=4001)


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and urlparse(origin).netloc != ws.headers.get("host"):
        await ws.close(code=1008, reason="Same-origin connections only")
        return
    role = ws.query_params.get("role", "")
    if role not in ROLES:
        await ws.close(code=1008, reason="A robot, patient, journey, mirror, or acu role is required")
        return
    await ws.accept()
    if role == "journey":
        # The robot tablet's screen wins; otherwise the newest patient screen takes over so a stale tab can't block it.
        robot_screen = ws.query_params.get("host") == "robot"
        journeys = [p for p in hub.peers if p.query_params.get("role") == "journey"]
        if not robot_screen and any(p.query_params.get("host") == "robot" for p in journeys):
            await ws.send_json({"type": "error", "message": "Only one journey screen can be open. It is running on the robot."})
            await ws.close(code=1008)
            return
        for old in journeys:
            hub.replaced.add(old)
            hub.enqueue(old, {"type": "error", "message": "Moved: this journey screen was opened on another device."})
            asyncio.get_running_loop().call_later(0.5, lambda o=old: asyncio.ensure_future(close_quietly(o)))
    elif role in SINGLE_ROLES and any(p.query_params.get("role") == role for p in hub.peers):
        await ws.send_json({"type": "error", "message": f"Only one {role} controller can be open. Close the other tab first."})
        await ws.close(code=1008)
        return
    hub.peers[ws] = asyncio.Queue(maxsize=16)
    hub.peer_ids[ws] = uuid4().hex
    hub.enqueue(ws, {"type": "hello", "peer_id": hub.peer_ids[ws]})
    hub.enqueue(ws, hub.snapshot())
    writer = asyncio.create_task(hub.writer(ws))
    hub.broadcast()
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 32768:
                hub.enqueue(ws, {"type": "error", "message": "Message exceeds the 32768 character limit."})
                continue
            try:
                payload = json.loads(raw)
                if isinstance(payload, dict) and payload.get("type") == "signal":
                    await hub.signal(ws, Signal.model_validate(payload))
                    continue
                cmd = Command.model_validate_json(raw)
            except (ValidationError, json.JSONDecodeError):
                hub.enqueue(ws, {"type": "error", "message": "Invalid command, fields, or payload."})
                continue
            await hub.command(ws, cmd, role)
    except (WebSocketDisconnect, RuntimeError):
        LOG.info("%s client disconnected", role)
    finally:
        writer.cancel()
        with suppress(asyncio.CancelledError):
            await writer
        hub.peers.pop(ws, None)
        peer_id = hub.peer_ids.pop(ws, None)
        was_replaced = ws in hub.replaced
        hub.replaced.discard(ws)
        call = hub.state["call"]
        if call and peer_id in {call["clinician"], call["patient"], call["camera"]}:
            hub.end_call("Support participant disconnected. Call ended; request consent again to reconnect.")
        if role in {"patient", "journey"} and not was_replaced and hub.state["journey"]["status"] == "MOVING":
            hub.state["journey"]["status"] = "PAUSED"
            hub.alert("help", "Patient screen disconnected during escort.")
            hub.event("Escort paused: patient screen disconnected.", "warning")
        if role == "robot":
            async with hub.lock:
                if not any(peer.query_params.get("role") == "robot" for peer in hub.peers):
                    changed = False
                    for field, valid, action in (
                        ("identity", "VERIFIED", "mismatch"),
                        ("room", "CLEAR", "room_unknown"),
                        ("pose", "VERIFIED", "pose_unknown"),
                    ):
                        if hub.state[f"{field}_source"] == "live" and hub.state[field] == valid:
                            hub.apply(Command(action=action, epoch=hub.state["epoch"], source="live"), "robot")
                            changed = True
                    if changed:
                        hub.event("Robot disconnected. Live readiness evidence invalidated.", "warning")
        hub.broadcast()


if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("CT_HOST", "127.0.0.1"), port=8000, ws_max_size=65536)
