"""Bridge to the team's ACU API Gateway (acu/ApiGateway). Standard library only."""

import json
import os
import socket
import time
from urllib import error, request
from urllib.parse import quote

WORKFLOW_ID = "ct-patient-journey"
# Our patient language. Deliberately independent of the ACU's robot speechLanguage setting.
CT_LANGUAGE = os.environ.get("CT_LANGUAGE", "en-US")
# Local camera names → ACU camera routes (/api/acu/robots/{id}/cameras/{route}).
ACU_CAMERAS = {"face": "front", "tray-1": "tray-1", "tray-2": "tray-2"}

# Two ACUs, switchable at runtime from /portal: our own gateway for developing workflows, and the
# organisers' hosted gateway that the real robot talks to. Each may pin the robot it manages; the
# hosted ACU is shared, so only that pinned robot is ever auto-approved.
_legacy = os.environ.get("ACU_URL", "").rstrip("/")
_local_url = os.environ.get("ACU_LOCAL_URL", "http://127.0.0.1:3000").rstrip("/")
TARGETS = {
    "local": {"label": "Local ACU (this laptop)", "url": _local_url,
              "robot_id": os.environ.get("CT_LOCAL_ROBOT_ID", "").strip()},
    "hosted": {"label": "Hosted ACU (real robot)",
               "url": os.environ.get("ACU_HOSTED_URL", "").rstrip("/")
               or (_legacy if _legacy and _legacy != _local_url else "http://10.27.239.122:3000"),
               "robot_id": os.environ.get("CT_ROBOT_ID", "").strip()},
}
ACTIVE = os.environ.get("ACU_TARGET") or ("local" if _legacy == _local_url else "hosted")
if ACTIVE not in TARGETS:
    ACTIVE = "hosted"
ACU_URL = TARGETS[ACTIVE]["url"]
ROBOT_ID = TARGETS[ACTIVE]["robot_id"]
AUTO_APPROVE = os.environ.get("CT_AUTO_APPROVE", "0") == "1" and bool(ROBOT_ID)


def use(target: str) -> dict:
    """Switch every CT server call (link loop, cameras, dashboard proxy) to another ACU."""
    global ACTIVE, ACU_URL, ROBOT_ID, AUTO_APPROVE
    if target not in TARGETS:
        raise BridgeError(400, f"Unknown ACU target {target!r}.")
    ACTIVE = target
    ACU_URL = TARGETS[target]["url"]
    ROBOT_ID = TARGETS[target]["robot_id"]
    AUTO_APPROVE = os.environ.get("CT_AUTO_APPROVE", "0") == "1" and bool(ROBOT_ID)
    return {"active": ACTIVE, "url": ACU_URL, "robot_id": ROBOT_ID or None}


class BridgeError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


def call(method: str, path: str, body: object | None = None, timeout: float = 4, base: str | None = None) -> object:
    base = base or ACU_URL
    data = None if body is None else json.dumps(body).encode()
    req = request.Request(f"{base}{path}", data=data, method=method,
                          headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            parsed = json.loads(detail)
            detail = parsed.get("detail") or parsed.get("error") or parsed.get("title") or detail
        except (ValueError, AttributeError):
            pass
        raise BridgeError(exc.code, f"ACU {method} {path} failed: {detail}") from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise BridgeError(503, f"ACU API Gateway unreachable at {base}: {exc}") from exc


def pick_destinations(names: list[str]) -> tuple[str | None, str | None]:
    """Choose a start point and a CT point from the robot's Pudu map names."""
    if not names:
        return None, None
    lower = [n.lower() for n in names]
    ct = next((names[i] for i, n in enumerate(lower) if "ct" in n.split() or n.startswith("ct")), None)
    ct = ct or next((names[i] for i, n in enumerate(lower) if any(k in n for k in ("scan", "radiolog", "imaging"))), None)
    start = next((names[i] for i, n in enumerate(lower) if any(k in n for k in ("recep", "empfang", "lobby", "wait", "warte"))), None)
    ct = ct or names[-1]
    start = start if start and start != ct else next((n for n in names if n != ct), None)
    return start, ct


TEXT = {
    "en": {"welcome": ("Hello. I'm your CT companion.",
                       "Hello. I'm your CT companion. I will take you to your scan and stay with you.")},
    "de": {"welcome": ("Hallo. Ich bin Ihr CT-Begleiter.",
                       "Hallo. Ich bin Ihr CT-Begleiter. Ich bringe Sie zu Ihrer Untersuchung und bleibe bei Ihnen.")},
}


def build_workflow(robot_id: str, destinations: list[str], language: str = "en", journey_url: str = "") -> dict:
    """One marker step: the robot app opens `journey_url` full screen and drives the robot from there.

    Older robot app builds without the CT host simply show the welcome step.
    """
    t = TEXT["de" if language.lower().startswith("de") else "en"]
    title, tts = t["welcome"]
    _, ct = pick_destinations(destinations)
    nav = f" Navigation target: {ct}." if ct else " No CT map point yet, so walking is simulated."
    return {
        "WorkflowID": WORKFLOW_ID,
        "WorkflowName": "CT Patient Journey",
        "Description": f"Full-screen CT patient journey: {journey_url}{nav} "
                       "Find, identify, guide, inform, comfort and hand off. Not a clinical safety system.",
        "RobotId": robot_id,
        "Steps": [{"StepId": "ct-journey", "ScreenId": "Custom", "Title": title, "TTS": tts}],
    }


def public_journey_url() -> str:
    """URL the robot tablet can reach. Override with CT_PUBLIC_URL when auto-detection picks the wrong network."""
    explicit = os.environ.get("CT_PUBLIC_URL", "").rstrip("/")
    if explicit:
        return explicit if explicit.endswith("/journey") else f"{explicit}/journey"
    host = "127.0.0.1"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # No packet is sent; this only asks the OS which interface routes outward.
            probe.connect(("10.255.255.255", 1))
            host = probe.getsockname()[0]
    except OSError:
        pass
    return f"http://{host}:{os.environ.get('CT_PORT', '8000')}/journey"


def device_summary(d: dict) -> dict:
    data = d.get("statusData") or {}
    return {
        "deviceId": d.get("deviceId"), "name": d.get("name") or d.get("deviceId"),
        "status": d.get("status"), "online": bool(d.get("online")), "lastSeen": d.get("lastSeen"),
        "ip": d.get("ip"), "event": data.get("event"), "battery": data.get("battery"),
        "lastSeenLocation": d.get("lastSeenLocation") or data.get("location"),
        "destinations": [x.get("name") for x in d.get("destinations") or [] if x.get("name")],
    }


def status() -> dict:
    try:
        devices = call("GET", "/api/acu/devices") or []
        settings = call("GET", "/api/acu/settings") or {}
        workflows = call("GET", "/api/acu/robot-workflows") or []
        assignments = (call("GET", "/api/acu/robot-workflows/assignments") or {}).get("Workflows", [])
    except BridgeError as exc:
        return {"acu_url": ACU_URL, "reachable": False, "error": str(exc), "devices": [],
                "language": CT_LANGUAGE, "installed": False, "assigned_to": []}
    return {
        "acu_url": ACU_URL,
        "reachable": True,
        "journey_url": public_journey_url(),
        "language": CT_LANGUAGE,
        "acu_speech_language": settings.get("speechLanguage"),
        "devices": [device_summary(d) for d in devices],
        "installed": any(w.get("WorkflowID") == WORKFLOW_ID for w in workflows),
        "assigned_to": [w.get("RobotId") for w in assignments if w.get("WorkflowID") == WORKFLOW_ID],
    }


def install(device_id: str) -> dict:
    devices = call("GET", "/api/acu/devices") or []
    device = next((d for d in devices if d.get("deviceId") == device_id), None)
    if device is None:
        raise BridgeError(404, "Robot is not registered with the ACU.")
    if device.get("status") != "approved":
        raise BridgeError(403, "Approve the robot in the ACU dashboard first.")
    names = [x.get("name") for x in device.get("destinations") or [] if x.get("name")]
    workflow = build_workflow(device_id, names, CT_LANGUAGE, public_journey_url())
    existing = {w.get("WorkflowID") for w in call("GET", "/api/acu/robot-workflows") or []}
    if WORKFLOW_ID in existing:
        call("PUT", f"/api/acu/robot-workflows/{WORKFLOW_ID}", workflow)
    else:
        call("POST", "/api/workflows/robot", workflow)
    call("POST", f"/api/acu/robot-workflows/{WORKFLOW_ID}/assignments/{device_id}")
    return {"workflow": workflow, "journey_url": public_journey_url(),
            "navigation_target": pick_destinations(names)[1]}


def choose_robot_for(devices: list[dict], robot_id: str) -> dict | None:
    if robot_id:
        return next((d for d in devices if d.get("deviceId") == robot_id), None)
    approved = [d for d in devices if d.get("status") == "approved"]
    return approved[0] if len(approved) == 1 else None


def choose_robot(devices: list[dict]) -> dict | None:
    return choose_robot_for(devices, ROBOT_ID)


def link() -> dict:
    """Keep the chosen robot approved and assigned to the current CT journey. Idempotent; polled by the server."""
    result = {"target": ACTIVE, "acu_url": ACU_URL, "reachable": False, "robot": None, "journey_assigned": False,
              "journey_url": public_journey_url(), "auto_approve": AUTO_APPROVE, "note": ""}
    try:
        devices = call("GET", "/api/acu/devices") or []
        result["reachable"] = True
        device = choose_robot(devices)
        if device is None:
            approved = [d for d in devices if d.get("status") == "approved"]
            result["note"] = (f"Robot {ROBOT_ID} has not registered with the ACU yet. Open the robot app and register."
                              if ROBOT_ID else
                              "No approved robot on this ACU yet. Register one (robot app or preview pointed at this ACU) and approve it in the dashboard."
                              if not approved else
                              f"{len(approved)} approved robots. Set CT_LOCAL_ROBOT_ID / CT_ROBOT_ID to choose one.")
            return result
        rid = device["deviceId"]
        if device.get("status") == "pending" and AUTO_APPROVE:
            call("POST", f"/api/acu/accept/{quote(rid)}")
            device["status"] = "approved"
        result["robot"] = device_summary(device)
        if device.get("status") != "approved":
            result["note"] = "Robot is waiting for approval in the ACU dashboard."
            return result
        assignments = (call("GET", "/api/acu/robot-workflows/assignments") or {}).get("Workflows", [])
        mine = next((w for w in assignments if w.get("RobotId") == rid and w.get("WorkflowID") == WORKFLOW_ID), None)
        current = mine is not None and ("Description" not in mine or result["journey_url"] in (mine.get("Description") or ""))
        if not current:
            install(rid)
            result["note"] = "CT journey assigned to the robot."
        result["journey_assigned"] = True
    except BridgeError as exc:
        result["note"] = str(exc)
    return result


def camera_latest(robot_id: str, camera: str, timeout: float = 3) -> bytes | None:
    """Latest fresh JPEG the robot uploaded to the ACU, or None (the ACU answers 503 after ten silent seconds)."""
    route = ACU_CAMERAS.get(camera)
    if not route or not robot_id:
        return None
    req = request.Request(f"{ACU_URL}/api/acu/robots/{quote(robot_id)}/cameras/{route}/latest",
                          headers={"Accept": "image/jpeg"})
    try:
        with request.urlopen(req, timeout=timeout) as res:
            data = res.read(4_000_000)
    except (error.URLError, TimeoutError, OSError):
        return None
    return data if data[:2] == b"\xff\xd8" else None


def camera_probe(base: str, robot_id: str, timeout: float = 3) -> dict:
    """Which ACU camera feeds exist for this robot: live, idle (no frame in 10 s), or unsupported."""
    out = {}
    for camera, route in ACU_CAMERAS.items():
        req = request.Request(f"{base}/api/acu/robots/{quote(robot_id)}/cameras/{route}/latest",
                              headers={"Accept": "image/jpeg"})
        try:
            with request.urlopen(req, timeout=timeout) as res:
                res.read(4_000_000)
                out[camera] = "live"
        except error.HTTPError as exc:
            out[camera] = "idle" if exc.code == 503 else "unsupported" if exc.code in (404, 405) else f"error {exc.code}"
        except (error.URLError, TimeoutError, OSError):
            out[camera] = "unreachable"
    return out


def probe(target: str) -> dict:
    """Health of one ACU target, whether or not it is the active one (for the portal)."""
    cfg = TARGETS[target]
    base = cfg["url"]
    result = {"target": target, "label": cfg["label"], "url": base, "robot_id": cfg["robot_id"] or None,
              "active": target == ACTIVE, "reachable": False, "latency_ms": None, "devices": [],
              "workflows": [], "journey_assigned_to": [], "speech_language": None, "cameras": None,
              "pinned": None, "error": None}
    started = time.monotonic()
    try:
        devices = call("GET", "/api/acu/devices", base=base, timeout=3) or []
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        result["reachable"] = True
        result["devices"] = [device_summary(d) for d in devices]
        workflows = call("GET", "/api/acu/robot-workflows", base=base, timeout=3) or []
        result["workflows"] = [{"id": w.get("WorkflowID"), "name": w.get("Name") or w.get("WorkflowID")} for w in workflows]
        assignments = (call("GET", "/api/acu/robot-workflows/assignments", base=base, timeout=3) or {}).get("Workflows", [])
        result["journey_assigned_to"] = [w.get("RobotId") for w in assignments if w.get("WorkflowID") == WORKFLOW_ID]
        result["speech_language"] = (call("GET", "/api/acu/settings", base=base, timeout=3) or {}).get("speechLanguage")
    except BridgeError as exc:
        result["error"] = str(exc)
        return result
    robot = choose_robot_for(devices, cfg["robot_id"])
    if robot:
        result["pinned"] = robot["deviceId"]
        result["cameras"] = camera_probe(base, robot["deviceId"])
    return result


def forward(method: str, path_qs: str, body: bytes | None, content_type: str | None,
            timeout: float = 15) -> tuple[int, bytes, str]:
    """Raw pass-through to the active ACU (used so the dashboard follows the portal's ACU switch)."""
    headers = {"Accept": "application/json, */*"}
    if content_type:
        headers["Content-Type"] = content_type
    req = request.Request(f"{ACU_URL}{path_qs}", data=body or None, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read(20_000_000), res.headers.get("Content-Type", "application/octet-stream")
    except error.HTTPError as exc:
        return exc.code, exc.read(), exc.headers.get("Content-Type", "text/plain")
    except (error.URLError, TimeoutError, OSError) as exc:
        return 502, json.dumps({"error": f"ACU unreachable at {ACU_URL}: {exc}"}).encode(), "application/json"


def open_stream(path_qs: str):
    """Open without buffering: camera MJPEG and sensor SSE never finish normally."""
    req = request.Request(f"{ACU_URL}{path_qs}", headers={"Accept": "*/*"})
    try:
        return request.urlopen(req, timeout=30)
    except error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        exc.close()
        raise BridgeError(exc.code, f"ACU stream failed: {detail}") from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise BridgeError(502, f"ACU stream unreachable at {ACU_URL}: {exc}") from exc
