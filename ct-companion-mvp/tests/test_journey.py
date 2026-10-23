import unittest
import unittest.mock

import acu_bridge
from pathlib import Path
from fastapi import Request
from app import Command, Hub, acu_proxy, page, root, workspace_screen


class JourneyTests(unittest.TestCase):
    def setUp(self):
        self.hub = Hub()

    def command(self, action, role="journey", **fields):
        self.hub.apply(Command(action=action, epoch=self.hub.state["epoch"], **fields), role)

    def test_journey_screen_runs_patient_flow_but_not_clinical_checks(self):
        self.command("identify", source="live")
        self.command("patient_confirm")
        self.command("dispatch")
        self.assertEqual(self.hub.state["journey"]["status"], "MOVING")
        self.command("pause")
        self.command("resume")
        for action in ("approve", "room_clear", "pose_verified", "arrive", "staff_message"):
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.command(action, source="override")

    def test_three_failed_identifications_call_staff(self):
        self.command("id_failed", source="live")
        self.command("id_failed", source="live")
        self.assertFalse(any(a["kind"] == "identity" for a in self.hub.state["alerts"]))
        self.command("id_failed", source="live")
        self.assertEqual(self.hub.state["id_attempts"], 3)
        self.assertTrue(any(a["active"] and a["kind"] == "identity" for a in self.hub.state["alerts"]))
        self.command("identify", source="live")
        self.assertEqual(self.hub.state["id_attempts"], 0)
        self.command("id_failed", source="live")
        self.assertEqual(self.hub.state["id_attempts"], 0)

    def test_journey_reset_only_after_handoff(self):
        with self.assertRaises(ValueError):
            self.command("reset")
        self.command("identify", source="override", role="robot")
        self.command("patient_confirm")
        self.command("dispatch")
        self.command("arrive", role="robot")
        self.command("room_clear", source="override", role="robot")
        self.command("pose_verified", source="override", role="robot")
        self.command("approve", role="acu")
        epoch = self.hub.state["epoch"]
        self.command("reset")
        self.assertNotEqual(self.hub.state["epoch"], epoch)

    def test_technician_starts_preparation_only_after_confirmed_arrival(self):
        with self.assertRaises(ValueError):
            self.command("start_preparation", role="acu")
        self.command("identify", source="live")
        self.command("patient_confirm")
        self.command("dispatch", source="live")
        with self.assertRaises(ValueError):
            self.command("start_preparation", role="acu")
        self.command("arrive")
        for role in ("journey", "patient", "robot", "mirror"):
            with self.subTest(role=role), self.assertRaises(ValueError):
                self.command("start_preparation", role=role)
        self.assertFalse(self.hub.state["pose_active"])
        self.command("start_preparation", role="acu")
        self.assertTrue(self.hub.state["pose_active"])
        self.assertEqual(self.hub.state["pose"], "UNKNOWN")
        self.assertIsNone(self.hub.state["pose_source"])
        self.assertFalse(self.hub.ready())
        events = len(self.hub.state["events"])
        self.command("start_preparation", role="acu")
        self.assertEqual(len(self.hub.state["events"]), events)
        self.command("pose_verified", source="live", role="robot")
        self.command("start_preparation", role="acu")
        self.assertEqual(self.hub.state["pose"], "VERIFIED")

    def test_preparation_requires_reconfirmed_identity_and_cannot_restart_after_handoff(self):
        self.command("identify", source="live")
        self.command("patient_confirm")
        self.command("dispatch", source="live")
        self.command("arrive")
        self.command("mismatch", role="robot")
        with self.assertRaises(ValueError):
            self.command("start_preparation", role="acu")
        self.command("identify", source="live")
        with self.assertRaises(ValueError):
            self.command("start_preparation", role="acu")
        self.command("patient_confirm")
        self.command("start_preparation", role="acu")
        self.command("room_clear", source="override", role="robot")
        self.command("pose_verified", source="override", role="robot")
        self.command("approve", role="acu")
        with self.assertRaises(ValueError):
            self.command("start_preparation", role="acu")


class WorkspaceRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_routes_redirect_to_single_workspace(self):
        request = Request({"type": "http", "path": "/", "headers": [], "query_string": b""})
        for path, target in (("/", "/portal"), ("/studio", "/portal#technician"),
                             ("/acu", "/portal#technician"), ("/clinician", "/portal#technician"),
                             ("/camera", "/portal#tracking"),
                             ("/robot", "/screens/patient"), ("/patient", "/screens/patient")):
            with self.subTest(path=path):
                response = await root() if path == "/" else await page(request, path[1:])
                self.assertEqual(response.status_code, 307)
                self.assertEqual(response.headers["location"], target)

    async def test_robot_journey_parameters_survive_redirect(self):
        request = Request({"type": "http", "path": "/journey", "headers": [], "query_string": b"host=robot&lang=de&mirror=1"})
        response = await page(request, "journey")
        self.assertEqual(response.headers["location"], "/screens/patient?host=robot&lang=de&mirror=1")

    async def test_workspace_surfaces_are_served(self):
        for screen in ("patient", "technician", "tracking", "diagnostics"):
            with self.subTest(screen=screen):
                response = await workspace_screen(screen)
                self.assertEqual(response.status_code, 200)
                self.assertIn("no-store", response.headers["cache-control"])
                self.assertTrue(Path(response.path).is_file())
        response = await page(Request({"type": "http", "query_string": b""}), "portal")
        portal = Path(response.path).read_text(encoding="utf-8")
        self.assertIn('data-workspace="technician"', portal)
        self.assertIn('data-workspace="diagnostics"', portal)
        self.assertIn("/screens/patient?mirror=1", portal)

    async def test_diagnostics_proxy_streams_without_buffering(self):
        upstream = unittest.mock.MagicMock()
        upstream.status = 200
        upstream.headers = {"Content-Type": "text/event-stream"}
        upstream.read1.side_effect = [b": connected\n\n", b"event: vision\ndata: {}\n\n", b""]
        request = Request({"type": "http", "method": "GET", "path": "/acu-proxy/api/acu/robots/BOT/sensors/stream",
                           "headers": [], "query_string": b"kind=vision"},
                          receive=unittest.mock.AsyncMock(return_value={"type": "http.request", "body": b""}))
        with unittest.mock.patch.object(acu_bridge, "open_stream", return_value=upstream) as opening:
            response = await acu_proxy("api/acu/robots/BOT/sensors/stream", request)
            self.assertEqual(response.headers["content-type"], "text/event-stream")
            chunks = [chunk async for chunk in response.body_iterator]
        self.assertEqual(chunks, [b": connected\n\n", b"event: vision\ndata: {}\n\n"])
        opening.assert_called_once_with("/api/acu/robots/BOT/sensors/stream?kind=vision")
        upstream.read.assert_not_called()
        upstream.__exit__.assert_called_once()

    async def test_diagnostics_stream_failure_is_explicit(self):
        request = Request({"type": "http", "method": "GET", "path": "/acu-proxy/api/x/stream",
                           "headers": [], "query_string": b""},
                          receive=unittest.mock.AsyncMock(return_value={"type": "http.request", "body": b""}))
        with unittest.mock.patch.object(acu_bridge, "open_stream", side_effect=acu_bridge.BridgeError(503, "No live frames")):
            response = await acu_proxy("api/x/stream", request)
        self.assertEqual(response.status_code, 503)
        self.assertIn(b"No live frames", response.body)


class BridgeTests(unittest.TestCase):
    def test_destinations_are_picked_from_robot_map(self):
        self.assertEqual(acu_bridge.pick_destinations(["Reception", "Ward 3", "CT Room 2"]), ("Reception", "CT Room 2"))
        self.assertEqual(acu_bridge.pick_destinations(["A", "B"]), ("A", "B"))
        self.assertEqual(acu_bridge.pick_destinations([]), (None, None))

    def test_workflow_hands_the_robot_one_full_screen_journey(self):
        url = "http://10.0.0.5:8000/journey"
        wf = acu_bridge.build_workflow("BOT1", ["Empfang", "CT 2"], "de-DE", url)
        self.assertEqual(wf["RobotId"], "BOT1")
        self.assertEqual(wf["WorkflowID"], acu_bridge.WORKFLOW_ID)
        self.assertEqual([s["ScreenId"] for s in wf["Steps"]], ["Custom"])
        self.assertIn(url, wf["Description"])
        self.assertIn("CT 2", wf["Description"])
        self.assertNotIn("Buttons", wf["Steps"][0])

    def test_workflow_without_map_says_walking_is_simulated(self):
        wf = acu_bridge.build_workflow("BOT1", [], "en-US", "http://h:8000/journey")
        self.assertIn("simulated", wf["Description"])

    def test_public_journey_url_prefers_explicit_setting(self):
        with unittest.mock.patch.dict("os.environ", {"CT_PUBLIC_URL": "http://bot-host:9000/"}):
            self.assertEqual(acu_bridge.public_journey_url(), "http://bot-host:9000/journey")


class RobotEscortTests(unittest.TestCase):
    def setUp(self):
        self.hub = Hub()
        self.hub.apply(Command(action="identify", epoch=self.hub.state["epoch"], source="live"), "journey")
        self.hub.apply(Command(action="patient_confirm", epoch=self.hub.state["epoch"]), "journey")

    def command(self, action, role="journey", **fields):
        self.hub.apply(Command(action=action, epoch=self.hub.state["epoch"], **fields), role)

    def test_robot_reports_real_arrival(self):
        self.command("dispatch", source="live", text="CT Room 2")
        journey = self.hub.state["journey"]
        self.assertEqual((journey["status"], journey["source"], journey["destination"]), ("MOVING", "robot", "CT Room 2"))
        self.command("arrive")
        self.assertEqual(self.hub.state["journey"]["status"], "ARRIVED")

    def test_journey_cannot_fake_arrival_of_simulated_walk(self):
        self.command("dispatch")
        self.assertEqual(self.hub.state["journey"]["source"], "simulation")
        with self.assertRaises(ValueError):
            self.command("arrive")

    def test_clock_does_not_move_a_robot_escort(self):
        import asyncio
        self.command("dispatch", source="live", text="CT 2")

        async def one_tick():
            with unittest.mock.patch("asyncio.sleep", side_effect=[None, asyncio.CancelledError]):
                try:
                    await self.hub.tick()
                except asyncio.CancelledError:
                    pass
        asyncio.run(one_tick())
        self.assertEqual(self.hub.state["journey"]["progress"], 0)
        self.assertEqual(self.hub.state["journey"]["status"], "MOVING")

    def test_patient_can_withdraw_help_request(self):
        self.command("dispatch", source="live", text="CT 2")
        self.command("help")
        self.assertEqual(self.hub.state["journey"]["status"], "PAUSED")
        self.command("help_cancel")
        self.assertFalse(any(a["active"] and a["kind"] == "help" for a in self.hub.state["alerts"]))
        self.command("resume")
        self.assertEqual(self.hub.state["journey"]["status"], "MOVING")


if __name__ == "__main__":
    unittest.main()
