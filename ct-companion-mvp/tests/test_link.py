import asyncio
import base64
import json
import pathlib
import tempfile
import unittest
import unittest.mock

import pydantic

import acu_bridge
import app as server
from app import Command, Hub

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"


def device(status="approved", device_id="BOT-1"):
    return {"deviceId": device_id, "name": "Bot", "status": status, "online": True, "destinations": []}


class LinkTests(unittest.TestCase):
    def test_mirror_role_is_read_only(self):
        hub = Hub()
        for action in ("identify", "patient_confirm", "dispatch", "help", "reset"):
            with self.subTest(action=action), self.assertRaises(ValueError):
                hub.apply(Command(action=action, epoch=hub.state["epoch"], source="live"), "mirror")

    def test_link_only_auto_approves_the_configured_robot(self):
        calls = []

        def fake(method, path, body=None):
            calls.append((method, path))
            if path == "/api/acu/devices":
                return [device("pending", "OTHER"), device("pending", "BOT-1")]
            if path.endswith("/assignments"):
                return {"Workflows": []}
            return {}

        with unittest.mock.patch.object(acu_bridge, "ROBOT_ID", "BOT-1"), \
                unittest.mock.patch.object(acu_bridge, "AUTO_APPROVE", True), \
                unittest.mock.patch.object(acu_bridge, "call", side_effect=fake), \
                unittest.mock.patch.object(acu_bridge, "install") as install:
            result = acu_bridge.link()
        self.assertIn(("POST", "/api/acu/accept/BOT-1"), calls)
        self.assertNotIn(("POST", "/api/acu/accept/OTHER"), calls)
        install.assert_called_once_with("BOT-1")
        self.assertTrue(result["journey_assigned"])

    def test_link_keeps_a_current_assignment(self):
        url = acu_bridge.public_journey_url()

        def fake(method, path, body=None):
            if path == "/api/acu/devices":
                return [device()]
            return {"Workflows": [{"RobotId": "BOT-1", "WorkflowID": acu_bridge.WORKFLOW_ID, "Description": f"Open {url}"}]}

        with unittest.mock.patch.object(acu_bridge, "ROBOT_ID", "BOT-1"), \
                unittest.mock.patch.object(acu_bridge, "call", side_effect=fake), \
                unittest.mock.patch.object(acu_bridge, "install") as install:
            self.assertTrue(acu_bridge.link()["journey_assigned"])
        install.assert_not_called()


class FakeRequest:
    def __init__(self, body: bytes):
        self._body = body

    async def body(self):
        return self._body


class CameraRelayTests(unittest.TestCase):
    def setUp(self):
        server.relay.frames.clear()
        server.relay.acu_cache.clear()

    def upload(self, camera, body):
        return asyncio.run(server.camera_upload(camera, FakeRequest(body))).status_code

    def test_robot_frames_round_trip_raw_and_base64(self):
        self.assertEqual(self.upload("face", JPEG), 204)
        latest = asyncio.run(server.camera_latest("face"))
        self.assertEqual(latest.body, JPEG)
        self.assertEqual(latest.headers["x-frame-source"], "robot")
        body = ("data:image/jpeg;base64," + base64.b64encode(JPEG).decode()).encode()
        self.assertEqual(self.upload("tray-1", body), 204)
        self.assertTrue(server.relay.status()["tray-1"]["fresh"])

    def test_rejects_non_jpeg(self):
        self.assertEqual(self.upload("face", b"hello"), 400)
        self.assertEqual(self.upload("face", base64.b64encode(b"not a jpeg")), 400)

    def test_no_frame_is_503(self):
        with unittest.mock.patch.dict(server.link_state, {"robot_id": None}):
            self.assertEqual(asyncio.run(server.camera_latest("tray-2")).status_code, 503)

    def test_tts_validates_text(self):
        self.assertEqual(asyncio.run(server.speech(text="")).status_code, 400)

    def test_link_status_reports_every_part(self):
        status = asyncio.run(server.link_status())
        for key in ("reachable", "robot", "journey_assigned", "robot_screen", "screens", "journey", "cameras", "voice"):
            self.assertIn(key, status)
        self.assertIn("mirror", status["screens"])
        self.assertIn(status["target"], ("local", "hosted"))
        self.assertIn("source", status["camera_config"])


class PortalTests(unittest.TestCase):
    def setUp(self):
        self.saved = (acu_bridge.ACTIVE, acu_bridge.ACU_URL, acu_bridge.ROBOT_ID, acu_bridge.AUTO_APPROVE,
                      dict(server.portal["camera"]))
        self.tmp = tempfile.TemporaryDirectory()
        patcher = unittest.mock.patch.object(server, "PORTAL_FILE", pathlib.Path(self.tmp.name) / "portal.json")
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        acu_bridge.ACTIVE, acu_bridge.ACU_URL, acu_bridge.ROBOT_ID, acu_bridge.AUTO_APPROVE, camera = self.saved
        server.portal["camera"] = camera
        self.tmp.cleanup()

    def test_use_switches_url_and_robot(self):
        acu_bridge.use("local")
        self.assertEqual(acu_bridge.ACU_URL, acu_bridge.TARGETS["local"]["url"])
        self.assertEqual(acu_bridge.ROBOT_ID, acu_bridge.TARGETS["local"]["robot_id"])
        acu_bridge.use("hosted")
        self.assertEqual(acu_bridge.ACU_URL, acu_bridge.TARGETS["hosted"]["url"])
        with self.assertRaises(acu_bridge.BridgeError):
            acu_bridge.use("elsewhere")

    def test_portal_switch_persists_and_resets_link(self):
        acu_bridge.use("hosted")
        server.link_state["reachable"] = True
        view = asyncio.run(server.portal_acu(server.AcuChoice(target="local")))
        self.assertEqual(view["acu"]["active"], "local")
        self.assertEqual(acu_bridge.ACU_URL, acu_bridge.TARGETS["local"]["url"])
        self.assertFalse(server.link_state["reachable"])
        self.assertEqual(json.loads(server.PORTAL_FILE.read_text())["acu"], "local")

    def test_camera_choice_validated_and_saved(self):
        view = asyncio.run(server.portal_camera(server.CameraChoice(source="acu", camera="tray-1", fps=10)))
        self.assertEqual(view["camera"], {"source": "acu", "camera": "tray-1", "fps": 10})
        self.assertEqual(json.loads(server.PORTAL_FILE.read_text())["camera"]["fps"], 10)
        with self.assertRaises(pydantic.ValidationError):
            server.CameraChoice(source="acu", fps=60)

    def test_probe_reports_unreachable_target(self):
        with unittest.mock.patch.object(acu_bridge, "call", side_effect=acu_bridge.BridgeError(502, "down")):
            result = acu_bridge.probe("hosted")
        self.assertFalse(result["reachable"])
        self.assertEqual(result["error"], "down")

    def test_probe_lists_devices_and_cameras_of_the_given_target(self):
        bases = []

        def fake(method, path, body=None, timeout=4, base=None):
            bases.append(base)
            if path == "/api/acu/devices":
                return [device()]
            if path == "/api/acu/robot-workflows":
                return [{"WorkflowID": "w1", "Name": "Tour"}]
            if path.endswith("/assignments"):
                return {"Workflows": [{"RobotId": "BOT-1", "WorkflowID": acu_bridge.WORKFLOW_ID}]}
            return {"speechLanguage": "en-US"}

        with unittest.mock.patch.object(acu_bridge, "call", side_effect=fake), \
                unittest.mock.patch.object(acu_bridge, "camera_probe", return_value={"face": "live"}):
            result = acu_bridge.probe("local")
        self.assertTrue(result["reachable"])
        self.assertEqual(set(bases), {acu_bridge.TARGETS["local"]["url"]})
        self.assertEqual(result["pinned"], "BOT-1")
        self.assertEqual(result["journey_assigned_to"], ["BOT-1"])
        self.assertEqual(result["cameras"], {"face": "live"})

    def test_forward_reports_unreachable_acu_as_502(self):
        with unittest.mock.patch.object(acu_bridge, "ACU_URL", "http://127.0.0.1:9"):
            status, body, ctype = acu_bridge.forward("GET", "/api/acu/devices", None, None, timeout=2)
        self.assertEqual(status, 502)
        self.assertIn("unreachable", json.loads(body)["error"])

    def test_proxy_only_forwards_api_paths(self):
        res = asyncio.run(server.acu_proxy("etc/passwd", FakeRequest(b"")))
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
