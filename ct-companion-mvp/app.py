"""Local CT workflow demonstrator. Does not connect to or control a scanner."""

import asyncio
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

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
import uvicorn


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
        "journey": {"status": "WAITING", "progress": 0, "source": "simulation"},
        "messages": [],
        "call": None,
        "call_note": "",
    }


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal[
        "reset", "mode", "identify", "mismatch", "baseline",
        "room_blocked", "room_clear", "room_unknown", "pose_start", "pose_verified",
        "pose_mismatch", "pose_unknown", "question", "acknowledge", "approve",
        "patient_confirm", "dispatch", "pause", "resume", "arrive", "help",
        "resolve_help", "staff_message", "patient_message",
        "call_request", "call_accept", "call_decline", "call_end",
    ]
    epoch: str = Field(min_length=1, max_length=64)
    source: Literal["live", "override", "operator"] = "operator"
    text: str = Field(default="", max_length=500)
    alert_id: str = Field(default="", max_length=64)
    mode: Literal["LIDAR_SIM", "HUMAN_AWARENESS"] | None = None
    call_id: str = Field(default="", max_length=64)
    share_camera: bool = False


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
        self.call_started = 0.0

    def ready(self) -> bool:
        s = self.state
        return (s["identity"] == "VERIFIED" and s["room"] == "CLEAR" and s["pose"] == "VERIFIED"
                and s["patient_confirmed"] and s["journey"]["status"] == "ARRIVED"
                and not any(a["active"] and a["kind"] == "help" for a in s["alerts"]))

    def snapshot(self) -> dict:
        s = self.state
        return {
            "type": "state",
            "state": {
                **s,
                "ready": self.ready(),
                "presence": {role: sum(p.query_params.get("role") == role for p in self.peers)
                             for role in ("robot", "patient", "acu")},
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
            "acu": {"approve", "acknowledge", "dispatch", "pause", "resume", "resolve_help", "staff_message", "reset"},
            "patient": {"patient_confirm", "question", "help", "pause", "patient_message"},
            "robot": {"reset", "mode", "identify", "mismatch", "baseline", "room_blocked",
                      "room_clear", "room_unknown", "pose_start", "pose_verified", "pose_mismatch",
                      "pose_unknown", "question", "dispatch", "arrive", "patient_confirm", "help", "pause", "resume"},
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
            s["journey"]["status"] = "MOVING"
            self.event("Patient on the way to CT 2. Simulated escort started.",
                       speech="We are going to CT Room 2. Follow the route on the screen at your own pace.")
        elif action == "arrive":
            if s["journey"]["status"] != "MOVING":
                raise ValueError("Start the simulated journey before marking arrival.")
            s["journey"].update(status="ARRIVED", progress=100)
            self.event("Patient has arrived at CT 2.", speech="We have arrived at CT Room 2. Please wait for your care team.")
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
            s["patient"] = {"name": "Sid", "exam": "Abdominal CT (contrast)",
                            "protocol": "Head-first supine / arms up"}
            self.resolve("identity")
            self.event(f"PATIENT_VERIFIED: SID. Route to CT Suite 2. [{cmd.source}]", speech=WELCOME)
        elif action == "mismatch":
            if s["identity"] == "MISMATCH":
                return
            s["identity"] = "MISMATCH"
            s["identity_source"] = cmd.source
            s["patient_confirmed"] = False
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
                if journey["status"] == "MOVING":
                    journey["progress"] = min(100, journey["progress"] + 2)
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    ticker = asyncio.create_task(hub.tick())
    yield
    ticker.cancel()
    with suppress(asyncio.CancelledError):
        await ticker
    for ws in list(hub.peers):
        with suppress(RuntimeError, OSError):
            await ws.close(code=1001)


app = FastAPI(title="CT Companion Research Prototype", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/studio")


@app.get("/health")
async def health():
    return {"status": "ok", "prototype": True, "clients": len(hub.peers)}


@app.get("/{view}", include_in_schema=False)
async def page(view: Literal["robot", "patient", "acu", "clinician", "camera", "studio", "qr"]):
    file = {"robot": "patient", "clinician": "acu", "camera": "robot"}.get(view, view)
    return FileResponse(ROOT / "static" / f"{file}.html", headers={"Cache-Control": "no-store"})


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and urlparse(origin).netloc != ws.headers.get("host"):
        await ws.close(code=1008, reason="Same-origin connections only")
        return
    role = ws.query_params.get("role", "")
    if role not in {"robot", "acu", "patient"}:
        await ws.close(code=1008, reason="A robot, patient, or acu role is required")
        return
    await ws.accept()
    if role in {"robot", "patient"} and any(p.query_params.get("role") == role for p in hub.peers):
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
    except WebSocketDisconnect:
        LOG.info("%s client disconnected", role)
    finally:
        writer.cancel()
        with suppress(asyncio.CancelledError):
            await writer
        hub.peers.pop(ws, None)
        peer_id = hub.peer_ids.pop(ws, None)
        call = hub.state["call"]
        if call and peer_id in {call["clinician"], call["patient"], call["camera"]}:
            hub.end_call("Support participant disconnected. Call ended; request consent again to reconnect.")
        if role == "patient" and hub.state["journey"]["status"] == "MOVING":
            hub.state["journey"]["status"] = "PAUSED"
            hub.alert("help", "Patient tablet disconnected during escort.")
            hub.event("Escort paused: patient tablet disconnected.", "warning")
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
