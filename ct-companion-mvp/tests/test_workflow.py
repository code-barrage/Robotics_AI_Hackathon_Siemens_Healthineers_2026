import asyncio
import json
import time
import unittest
from contextlib import suppress

from app import Command, Hub, Signal


class Peer:
    def __init__(self, role):
        self.query_params = {"role": role}


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.hub = Hub()

    def command(self, action, role="robot", **fields):
        self.hub.apply(Command(action=action, epoch=self.hub.state["epoch"], **fields), role)

    def arrive_ready(self):
        self.command("identify", source="override")
        self.command("patient_confirm", role="patient")
        self.command("dispatch", role="acu")
        self.command("arrive")
        self.command("room_clear", source="override")
        self.command("pose_verified", source="override")

    def test_confirmation_and_arrival_required(self):
        self.command("identify")
        self.command("room_clear", source="override")
        self.command("pose_verified", source="override")
        self.assertFalse(self.hub.ready())
        with self.assertRaises(ValueError):
            self.command("dispatch", role="acu")
        self.command("patient_confirm", role="patient")
        self.command("dispatch", role="acu")
        self.assertFalse(self.hub.ready())
        self.command("arrive")
        self.assertTrue(self.hub.ready())

    def test_wrong_interfaces_cannot_override_checks(self):
        for action in ("identify", "pose_verified", "room_clear", "reset", "approve", "dispatch"):
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.command(action, role="patient")
        with self.assertRaises(ValueError):
            self.command("approve")

    def test_mismatch_pauses_and_requires_reconfirmation(self):
        self.command("identify")
        self.command("patient_confirm", role="patient")
        self.command("dispatch", role="acu")
        self.command("mismatch")
        self.assertEqual(self.hub.state["journey"]["status"], "PAUSED")
        self.assertFalse(self.hub.state["patient_confirmed"])
        self.command("identify")
        with self.assertRaises(ValueError):
            self.command("resume", role="acu")
        self.command("patient_confirm", role="patient")
        self.assertEqual(self.hub.state["journey"]["status"], "PAUSED")
        self.command("resume", role="acu")
        self.assertEqual(self.hub.state["journey"]["status"], "MOVING")

    def test_help_does_not_require_identity_or_start_microphone(self):
        self.command("help", role="patient")
        self.assertIsNone(self.hub.state["call"])
        self.assertTrue(any(a["active"] and a["kind"] == "help" for a in self.hub.state["alerts"]))

    def test_help_pauses_and_prevents_resume_until_handled(self):
        self.command("identify")
        self.command("patient_confirm", role="patient")
        self.command("dispatch", role="acu")
        self.command("help", role="patient")
        self.assertEqual(self.hub.state["journey"]["status"], "PAUSED")
        with self.assertRaises(ValueError):
            self.command("resume", role="acu")
        self.command("resolve_help", role="acu")
        self.assertEqual(self.hub.state["journey"]["status"], "PAUSED")
        self.command("resume", role="acu")

    def test_acknowledgment_never_clears_safety_condition(self):
        self.arrive_ready()
        self.command("room_blocked", source="override")
        alert = next(a for a in self.hub.state["alerts"] if a["kind"] == "room")
        self.command("acknowledge", role="acu", alert_id=alert["id"])
        self.command("resolve_help", role="acu")
        self.assertEqual(self.hub.state["room"], "BLOCKED")
        self.assertFalse(self.hub.ready())

    def test_approval_revoked_for_each_prerequisite(self):
        for action in ("mismatch", "room_blocked", "room_unknown", "pose_unknown", "pose_mismatch", "help"):
            with self.subTest(action=action):
                self.hub = Hub()
                self.arrive_ready()
                self.command("approve", role="acu")
                self.assertTrue(self.hub.state["approved"])
                self.command(action, source="override")
                self.assertFalse(self.hub.state["approved"])

    def test_qa_privacy_and_metrics(self):
        with self.assertRaises(ValueError):
            self.command("question", role="patient", text="contrast?")
        self.command("identify")
        for question in ("What does contrast feel like?", "Why couldn't I eat breakfast?", "Can I keep my watch on?"):
            self.command("question", role="patient", text=question)
        self.assertEqual(self.hub.state["interruptions"], 3)
        self.assertEqual(self.hub.state["minutes_saved"], 4.5)
        self.command("question", role="patient", text="I have chest pain")
        self.assertFalse(self.hub.state["qa"][-1]["resolved"])
        self.assertEqual(self.hub.state["interruptions"], 3)
        self.command("mismatch")
        with self.assertRaises(ValueError):
            self.command("question", role="patient", text="contrast?")

    def test_written_assistance_works_before_verification(self):
        self.command("staff_message", role="acu", text="Please wait here. We can help.")
        self.command("patient_message", role="patient", text="I cannot hear you.")
        self.assertEqual([m["sender"] for m in self.hub.state["messages"]], ["clinician", "patient"])
        self.assertTrue(any(a["active"] and a["kind"] == "question" for a in self.hub.state["alerts"]))
        with self.assertRaises(ValueError):
            self.command("staff_message", role="acu", text=" ")

    def test_reset_clears_new_state_and_rejects_old_epoch(self):
        old_epoch = self.hub.state["epoch"]
        self.arrive_ready()
        self.command("staff_message", role="acu", text="A message")
        self.command("reset", role="acu")
        self.assertEqual(self.hub.state["journey"]["progress"], 0)
        self.assertFalse(self.hub.state["patient_confirmed"])
        self.assertEqual(self.hub.state["messages"], [])
        with self.assertRaises(ValueError):
            self.hub.apply(Command(action="identify", epoch=old_epoch), "robot")

    def test_room_monitoring_requires_live_baseline(self):
        with self.assertRaises(ValueError):
            self.command("room_clear", source="live")
        self.command("baseline", source="live")
        self.command("room_blocked", source="live")
        self.assertEqual(self.hub.state["room"], "BLOCKED")


class CallTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.hub = Hub()
        self.patient, self.clinician, self.camera, self.observer = (
            Peer("patient"), Peer("acu"), Peer("robot"), Peer("acu"))
        for peer, peer_id in ((self.patient, "patient"), (self.clinician, "clinician"),
                              (self.camera, "camera"), (self.observer, "observer")):
            self.hub.peers[peer] = asyncio.Queue(maxsize=16)
            self.hub.peer_ids[peer] = peer_id

    def call(self, action, peer=None, **fields):
        peer = peer or self.clinician
        self.hub.call_command(peer, Command(action=action, epoch=self.hub.state["epoch"], **fields),
                              peer.query_params["role"])

    def accept(self, video=False):
        self.call("call_request")
        call_id = self.hub.state["call"]["id"]
        self.call("call_accept", self.patient, call_id=call_id, share_camera=video)
        return call_id

    async def signal(self, sender, target, call_id):
        await self.hub.signal(sender, Signal(type="signal", epoch=self.hub.state["epoch"],
                                            call_id=call_id, target=target,
                                            description={"type": "offer", "sdp": "test"}))

    def test_request_waits_for_explicit_consent(self):
        self.call("call_request")
        self.assertEqual(self.hub.state["call"]["status"], "RINGING")
        self.assertFalse(self.hub.state["call"]["share_camera"])
        with self.assertRaises(ValueError):
            self.call("call_accept", self.observer, call_id=self.hub.state["call"]["id"])

    async def test_signaling_rejected_before_consent(self):
        self.call("call_request")
        await self.signal(self.clinician, "patient", self.hub.state["call"]["id"])
        self.assertTrue(self.hub.peers[self.patient].empty())
        self.assertEqual(self.hub.peers[self.clinician].get_nowait()["type"], "error")

    async def test_audio_only_consent_blocks_camera(self):
        call_id = self.accept()
        await self.signal(self.clinician, "camera", call_id)
        self.assertTrue(self.hub.peers[self.camera].empty())
        self.assertEqual(self.hub.peers[self.clinician].get_nowait()["type"], "error")
        await self.signal(self.clinician, "patient", call_id)
        self.assertEqual(self.hub.peers[self.patient].get_nowait()["sender"], "clinician")

    async def test_camera_consent_routes_only_to_selected_clinician(self):
        call_id = self.accept(video=True)
        await self.signal(self.camera, "clinician", call_id)
        self.assertEqual(self.hub.peers[self.clinician].get_nowait()["sender"], "camera")
        await self.signal(self.camera, "observer", call_id)
        self.assertTrue(self.hub.peers[self.observer].empty())
        self.assertEqual(self.hub.peers[self.camera].get_nowait()["type"], "error")

    async def test_end_call_rejects_late_signaling(self):
        call_id = self.accept(video=True)
        self.call("call_end", self.patient, call_id=call_id)
        self.assertIsNone(self.hub.state["call"])
        await self.signal(self.camera, "clinician", call_id)
        self.assertTrue(self.hub.peers[self.clinician].empty())

    def test_observer_cannot_end_someone_elses_call(self):
        call_id = self.accept()
        with self.assertRaises(ValueError):
            self.call("call_end", self.observer, call_id=call_id)
        self.assertIsNotNone(self.hub.state["call"])

    def test_decline_and_missing_patient(self):
        self.call("call_request")
        self.call("call_decline", self.patient, call_id=self.hub.state["call"]["id"])
        self.assertIsNone(self.hub.state["call"])
        self.hub.peers.pop(self.patient)
        with self.assertRaises(ValueError):
            self.call("call_request")

    def test_no_camera_consent_without_camera_controller(self):
        self.hub.peers.pop(self.camera)
        self.accept(video=True)
        self.assertFalse(self.hub.state["call"]["share_camera"])

    def test_snapshot_serialization_is_immutable(self):
        self.hub.broadcast()
        queued = self.hub.peers[self.patient].get_nowait()
        self.hub.state["journey"]["progress"] = 42
        self.assertEqual(json.loads(queued)["state"]["journey"]["progress"], 0)

    async def test_unanswered_request_expires(self):
        self.call("call_request")
        self.hub.call_started = time.monotonic() - 46
        ticker = asyncio.create_task(self.hub.tick())
        try:
            await asyncio.sleep(1.1)
            self.assertIsNone(self.hub.state["call"])
            self.assertIn("expired", self.hub.state["call_note"])
        finally:
            ticker.cancel()
            with suppress(asyncio.CancelledError):
                await ticker

    async def test_journey_clock_arrives_and_paused_clock_stays_still(self):
        self.hub.state["journey"].update(status="MOVING", progress=98)
        ticker = asyncio.create_task(self.hub.tick())
        try:
            await asyncio.sleep(1.1)
            self.assertEqual(self.hub.state["journey"]["status"], "ARRIVED")
            self.assertEqual(self.hub.state["journey"]["progress"], 100)
            self.hub.state["journey"].update(status="PAUSED", progress=42)
            await asyncio.sleep(1.1)
            self.assertEqual(self.hub.state["journey"]["progress"], 42)
        finally:
            ticker.cancel()
            with suppress(asyncio.CancelledError):
                await ticker


if __name__ == "__main__":
    unittest.main()
