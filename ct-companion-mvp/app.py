"""Local CT workflow demonstrator. Does not connect to or control a scanner."""

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

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
    }


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal[
        "reset", "mode", "identify", "mismatch", "baseline",
        "room_blocked", "room_clear", "room_unknown", "pose_start", "pose_verified",
        "pose_mismatch", "pose_unknown", "question", "acknowledge", "approve",
    ]
    epoch: str = Field(min_length=1, max_length=64)
    source: Literal["live", "override", "operator"] = "operator"
    text: str = Field(default="", max_length=500)
    alert_id: str = Field(default="", max_length=64)
    mode: Literal["LIDAR_SIM", "HUMAN_AWARENESS"] | None = None


class Hub:
    def __init__(self) -> None:
        self.state = fresh_state()
        self.lock = asyncio.Lock()
        self.peers: dict[WebSocket, asyncio.Queue] = {}

    def ready(self) -> bool:
        s = self.state
        return s["identity"] == "VERIFIED" and s["room"] == "CLEAR" and s["pose"] == "VERIFIED"

    def snapshot(self) -> dict:
        s = self.state
        return {
            "type": "state",
            "state": {
                **s,
                "ready": self.ready(),
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
        if action in {"approve", "acknowledge"} and role != "acu":
            raise ValueError("This action must be performed at the ACU workstation.")
        if action not in {"approve", "acknowledge", "reset"} and role != "robot":
            raise ValueError("This action must be performed at the robot console.")
        if action == "reset":
            self.state = fresh_state()
            self.event("Session reset. Waiting for patient identification.")
            return
        if action == "mode":
            if cmd.mode is None:
                raise ValueError("A display mode is required.")
            s["mode"] = cmd.mode
            return
        if action == "identify":
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
                self.apply(cmd, role)
            except ValueError as exc:
                self.enqueue(ws, {"type": "error", "message": str(exc)})
                return
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
    yield
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
async def page(view: Literal["robot", "acu", "studio", "qr"]):
    return FileResponse(ROOT / "static" / f"{view}.html")


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and urlparse(origin).netloc != ws.headers.get("host"):
        await ws.close(code=1008, reason="Same-origin connections only")
        return
    role = ws.query_params.get("role", "")
    if role not in {"robot", "acu"}:
        await ws.close(code=1008, reason="A robot or acu role is required")
        return
    await ws.accept()
    hub.peers[ws] = asyncio.Queue(maxsize=16)
    hub.enqueue(ws, hub.snapshot())
    writer = asyncio.create_task(hub.writer(ws))
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 4096:
                hub.enqueue(ws, {"type": "error", "message": "Message exceeds the 4096 character limit."})
                continue
            try:
                cmd = Command.model_validate_json(raw)
            except ValidationError:
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
    uvicorn.run(app, host="127.0.0.1", port=8000, ws_max_size=8192)
