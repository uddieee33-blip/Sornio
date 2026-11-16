"""Contract tests for the native Save/Open dialog driver.

Runs anywhere: no Windows, no pywinauto, no installed product. The point is
that the one thing this session could not previously test — the retry,
re-resolution and evidence behaviour of `pick_native_file` — now fails here
instead of failing an installed-app job 40 minutes in.

    python -m unittest discover -s apps/desktop -p test_native_dialog.py
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import native_dialog as nd  # noqa: E402


class FakeInfo:
    def __init__(self, name, class_name="SunAria2Dialog", pid=4242, handle=99):
        self.name = name
        self.class_name = class_name
        self.control_type = "Window"
        self.process_id = pid
        self.handle = handle
        self.automation_id = ""


class FakeElement:
    """Enough of a UIA wrapper for the driver, with scripted visibility."""

    def __init__(self, name, visible=True, enabled=True, owner="Sornio Local Review"):
        self.element_info = FakeInfo(name)
        self._visible = visible
        self._enabled = enabled
        self._owner = owner
        self.focused = False

    def is_visible(self):
        return self._visible

    def is_enabled(self):
        return self._enabled

    def window_text(self):
        return self.element_info.name

    def set_focus(self):
        self.focused = True

    def parent(self):
        if self._owner is None:
            raise RuntimeError("no owner")
        return FakeElement(self._owner)


class FakeEdit(FakeElement):
    def __init__(self, value=""):
        super().__init__("File name:")
        self.value = value

    def get_value(self):
        return self.value


class FakeButton(FakeElement):
    def __init__(self, label, on_click):
        super().__init__(label)
        self._on_click = on_click

    def click_input(self):
        self._on_click()


class ScriptedDialog:
    """A dialog whose visibility is scripted per press.

    `closes_after` is how many presses it needs before it disappears. A value
    of None means it never closes — the measured runner failure. `raises_modal`
    makes the first press open a replace-confirmation, which the parent then
    ignores until it is answered, exactly like a real modal.
    """

    def __init__(self, title, closes_after=1, edits=None, class_name="SunAria2Dialog",
                 raises_modal=False, decoys=(), decoy=None):
        self.title = title
        self.remaining = closes_after
        self.visible = True
        self.presses = 0
        self.class_name = class_name
        self.edit = FakeEdit()
        self.edits = edits if edits is not None else [self.edit]
        # Controls that are Edit-shaped but are NOT the file-name field: a real
        # Save dialog's address bar and search box. Text typed here reads back
        # perfectly and the dialog saves its own default name.
        self.decoys = ([decoy] if decoy is not None else []) + list(decoys)
        self.raises_modal = raises_modal
        self.modal = None
        self.buttons = [FakeButton("Save", self.press), FakeButton("Cancel", lambda: None)]

    def press(self):
        self.presses += 1
        if self.raises_modal and self.modal is None:
            self.modal = Modal("Confirm Save As")
            return
        if self.modal is not None and self.modal.visible:
            # The parent ignores input while its question is open.
            return
        if self.remaining is None:
            return
        self.remaining -= 1
        if self.remaining <= 0:
            self.visible = False

    # UIA surface used by the driver.
    def is_visible(self):
        return self.visible

    def is_enabled(self):
        return True

    def window_text(self):
        return self.title

    def set_focus(self):
        pass

    @property
    def element_info(self):
        return FakeInfo(self.title, class_name=self.class_name)

    def parent(self):
        return FakeElement("Sornio Local Review")

    def descendants(self, control_type=None):
        if control_type == "Edit":
            return list(self.decoys) + list(self.edits)
        if control_type == "Button":
            return list(self.buttons)
        return list(self.edits) + list(self.buttons)

    def child_window(self, title=None, control_type=None, auto_id=None):
        for edit in self.edits:
            if title and edit.window_text().lower() != str(title).lower():
                continue
            if auto_id is not None and getattr(edit, "automation_id", None) != str(auto_id):
                continue
            if control_type and control_type != "Edit":
                continue
            return _Spec(edit)
        return _Spec(None)


class _Spec:
    """`child_window(...)` returns a specification, not a wrapper."""

    def __init__(self, element):
        self._element = element

    def exists(self, timeout=0):
        return self._element is not None and getattr(self._element, "is_visible", lambda: False)()

    def wrapper_object(self):
        return self._element



class Modal:
    """A #32770 confirmation owned by a file dialog."""

    def __init__(self, title, affirmative="Yes"):
        self._title = title
        self.visible = True
        self.affirmative = affirmative
        self.pressed = False

    def window_text(self):
        return self._title

    @property
    def element_info(self):
        return FakeInfo(self._title, class_name="#32770")

    def is_visible(self):
        return self.visible

    def is_enabled(self):
        return True

    def descendants(self, control_type=None):
        if control_type != "Button":
            return []

        def answer():
            self.pressed = True
            self.visible = False

        return [FakeButton(self.affirmative, answer), FakeButton("No", lambda: None)]


class FakeDesktop:
    def __init__(self, dialogs):
        self.dialogs = dialogs

    def windows(self, title=None, title_re=None):
        if title is not None:
            return [d for d in self.dialogs if d.title == title]
        # Every visible top-level window, dialogs and their modals alike.
        found = [d for d in self.dialogs if getattr(d, "visible", True)]
        found.extend(m for d in self.dialogs for m in [getattr(d, "modal", None)] if m and m.visible)
        return found

    def window(self, active_only=False):
        return self.dialogs[-1] if self.dialogs else FakeElement("", visible=False)


def typing_keys(text_log):
    """A send_keys stand-in that records what was typed and lands it in the edit."""

    def send_keys(sequence, pause=0.05, with_spaces=False):
        text_log.append(sequence)

    return send_keys


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.log = []
        self.keys = typing_keys(self.log)

    def close(self, desktop, title, path, **kwargs):
        return nd.close_dialog(
            title,
            path,
            desktop=desktop,
            send_keys=self.keys,
            attempts=kwargs.pop("attempts", 4),
            attempt_timeout=kwargs.pop("attempt_timeout", 0.05),
            wait_until=_fast_wait_until,
            poll=0.02,
            settle=0.01,
            **kwargs,
        )

    def test_closes_on_first_press_and_reports_verified_entry(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup")
        evidence = nd.DialogEvidence()
        # The keystrokes are what put the path in the field; the driver must
        # read it back rather than trust the write.
        original = nd.type_path

        def type_path(edit, path, send_keys, pause=0.03):
            edit.value = str(path)
            return original(edit, path, send_keys, pause=pause)

        nd.type_path = type_path
        try:
            verified = self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                                  evidence=evidence)
        finally:
            nd.type_path = original
        self.assertTrue(verified)
        self.assertEqual(dialog.presses, 1)
        self.assertEqual(evidence.attempts, 1)
        self.assertFalse(evidence.harness_failure)
        self.assertFalse(evidence.live_after)
        self.assertEqual(evidence.requested_path, "C:\\Temp\\x.sorniobackup")

    def test_reports_unverified_entry_without_claiming_the_path(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup")
        # The field silently keeps its own text: exactly the runner behaviour
        # recorded in windows-release-gate-2026-11-01.md.
        dialog.edit.value = "sornio-business.sorniobackup"
        verified = self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup")
        self.assertFalse(verified)
        self.assertEqual(dialog.presses, 1)

    def test_a_dialog_that_never_closes_fails_the_harness_with_evidence(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=None)
        evidence = nd.DialogEvidence()
        with self.assertRaises(nd.DialogNotClosed) as raised:
            self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                       evidence=evidence)
        self.assertEqual(dialog.presses, 4)
        self.assertTrue(evidence.harness_failure)
        self.assertTrue(evidence.live_after)
        self.assertEqual(len(evidence.handles), 4)
        self.assertEqual(evidence.handles[0]["class_name"], "SunAria2Dialog")
        self.assertEqual(evidence.handles[0]["owner"], "Sornio Local Review")
        self.assertIn("attempts", str(raised.exception))

    def test_it_retries_and_recovers_when_the_second_press_lands(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=2)
        evidence = nd.DialogEvidence()
        self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                   evidence=evidence)
        self.assertEqual(dialog.presses, 2)
        self.assertEqual(evidence.attempts, 2)

    def test_it_drives_the_newest_dialog_not_the_stale_one(self):
        # Two windows with the same title, as after a restart leaves the old
        # element enumerable. The live one is the newest.
        stale = ScriptedDialog("Export encrypted Sornio backup", closes_after=1)
        stale.visible = True
        live = ScriptedDialog("Export encrypted Sornio backup", closes_after=1)
        desktop = FakeDesktop([stale, live])
        evidence = nd.DialogEvidence()
        self.close(desktop, "Export encrypted Sornio backup", "C:\\Temp\\x.sorniobackup",
                   evidence=evidence)
        # The newest is pressed; the stale one is re-resolved on the next round
        # and pressed then, so both end up gone and the function returns.
        self.assertFalse(stale.visible)
        self.assertFalse(live.visible)

    def test_absent_dialog_fails_closed_instead_of_claiming_success(self):
        evidence = nd.DialogEvidence()
        with self.assertRaises(nd.DialogNotFound):
            self.close(FakeDesktop([]), "Export encrypted Sornio backup",
                       "C:\\Temp\\x.sorniobackup", evidence=evidence,
                       appearance_timeout=0.05)
        self.assertTrue(evidence.harness_failure)
        self.assertFalse(evidence.live_after)
        self.assertEqual(evidence.pressed, 0)

    def test_delayed_windows_picker_is_waited_for_and_then_driven(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup")

        class DelayedDesktop(FakeDesktop):
            def __init__(self, dialogs):
                super().__init__(dialogs)
                self.polls = 0

            def windows(self, title=None, title_re=None):
                if title == dialog.title and self.polls < 3:
                    self.polls += 1
                    return []
                return super().windows(title=title, title_re=title_re)

        evidence = nd.DialogEvidence()
        self.close(DelayedDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                   evidence=evidence, appearance_timeout=0.25)
        self.assertEqual(dialog.presses, 1)
        self.assertFalse(dialog.visible)
        self.assertFalse(evidence.harness_failure)
        self.assertEqual(evidence.pressed, 1)

    def test_open_mode_looks_for_the_open_button(self):
        dialog = ScriptedDialog("Choose encrypted Sornio backup", closes_after=1)
        dialog.buttons = [FakeButton("Open", dialog.press), FakeButton("Cancel", lambda: None)]
        self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup", mode="open")
        self.assertEqual(dialog.presses, 1)


    def test_a_replace_confirmation_is_answered_and_recorded(self):
        # The measured sequence: the requested name never landed, Save was
        # pressed with the dialog's default name, and that name already existed
        # from the retail export minutes earlier — so Windows asked a question.
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=1,
                                raises_modal=True)
        evidence = nd.DialogEvidence()
        self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                   evidence=evidence)
        self.assertIsNotNone(dialog.modal)
        self.assertTrue(dialog.modal.pressed)
        self.assertFalse(dialog.visible)
        self.assertEqual(len(evidence.confirmations), 1)
        self.assertEqual(evidence.confirmations[0]["title"], "Confirm Save As")
        self.assertEqual(evidence.confirmations[0]["answered"], "Yes")
        self.assertEqual(evidence.confirmations[0]["class_name"], "#32770")

    def test_verified_entry_is_retried_before_the_press(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=1)
        dialog.edit.value = "sornio-business.sorniobackup"
        original = nd.type_path
        calls = {"n": 0}

        def type_path(edit, path, send_keys, pause=0.03):
            calls["n"] += 1
            if calls["n"] < 3:
                return False
            edit.value = str(path)
            return original(edit, path, send_keys, pause=pause)

        nd.type_path = type_path
        try:
            evidence = nd.DialogEvidence()
            verified = self.close(FakeDesktop([dialog]), dialog.title,
                                  "C:\\Temp\\x.sorniobackup", evidence=evidence)
        finally:
            nd.type_path = original
        self.assertTrue(verified)
        self.assertEqual(evidence.entry_attempts, 3)
        self.assertEqual(dialog.presses, 1)

    def test_require_verified_entry_never_presses_an_unverified_field(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=1)
        dialog.edit.value = "sornio-business.sorniobackup"
        with self.assertRaises(nd.DialogNotClosed):
            self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                       require_verified_entry=True)
        self.assertEqual(dialog.presses, 0)

    def test_evidence_records_every_visible_window_on_failure(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=None)
        evidence = nd.DialogEvidence()
        with self.assertRaises(nd.DialogNotClosed):
            self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                       evidence=evidence)
        self.assertTrue(evidence.live_windows)
        self.assertEqual(evidence.live_windows[-1]["title"], "Export encrypted Sornio backup")
        self.assertEqual(evidence.live_windows[-1]["class_name"], "SunAria2Dialog")
        self.assertEqual(evidence.live_windows[-1]["owner"], "Sornio Local Review")


    def test_an_address_box_is_never_mistaken_for_the_file_name_field(self):
        # Run 43827276040: the driver fell back to "the first Edit control",
        # typed into the dialog's address/search box, read its own text back,
        # reported a verified entry and pressed Save. The dialog then closed on
        # its own default name and the retail export produced no success
        # message. A decoy must be ignored even though it accepts text.
        decoy = FakeEdit("")
        decoy.element_info = FakeInfo("Address bar")
        dialog = ScriptedDialog("Export encrypted Sornio backup", decoy=decoy)
        dialog.decoys = [decoy]
        evidence = nd.DialogEvidence()

        def type_path(edit, path, send_keys, pause=0.03, settle=0.3):
            edit.value = str(path)  # text always "lands", in either field
            return True

        original = nd.type_path
        nd.type_path = type_path
        try:
            verified = self.close(FakeDesktop([dialog]), dialog.title,
                                  "C:\\Temp\\x.sorniobackup", evidence=evidence)
        finally:
            nd.type_path = original
        self.assertTrue(verified)
        # The typed value went to the titled field, not to the decoy.
        self.assertEqual(dialog.edit.value, "C:\\Temp\\x.sorniobackup")
        self.assertEqual(decoy.value, "")
        self.assertEqual(evidence.field_selector, "title='File name:'")

    def test_a_dialog_with_no_identifiable_file_name_field_is_a_harness_failure(self):
        dialog = ScriptedDialog("Export encrypted Sornio backup", closes_after=None)
        decoy = FakeEdit("")
        decoy.element_info = FakeInfo("Search")
        dialog.decoys = [decoy]
        dialog.edits = []  # no titled field and no auto_id 1001
        evidence = nd.DialogEvidence()
        with self.assertRaises(nd.DialogNotClosed):
            self.close(FakeDesktop([dialog]), dialog.title, "C:\\Temp\\x.sorniobackup",
                       evidence=evidence)
        self.assertTrue(evidence.field_missing)
        self.assertEqual(dialog.presses, 4)  # retried, never a blind write
        self.assertTrue(evidence.harness_failure)

    def test_evidence_writes_json_lines_only_when_asked(self):
        record = nd.DialogEvidence(title="t", requested_path="p", attempts=1)
        os.environ.pop("SORNIO_DIALOG_EVIDENCE", None)
        self.assertIsNone(record.record())
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "nested" / "dialog-evidence.jsonl"
            os.environ["SORNIO_DIALOG_EVIDENCE"] = str(target)
            try:
                record.record()
                record.record()
            finally:
                os.environ.pop("SORNIO_DIALOG_EVIDENCE", None)
            lines = target.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 2)
            payload = json.loads(lines[0])
            self.assertEqual(payload["title"], "t")
            self.assertTrue(payload["requested_path"])

    def test_evidence_never_carries_credentials(self):
        payload = json.dumps(nd.DialogEvidence().__dict__)
        for forbidden in ("password", "passphrase", "key", "token", "secret"):
            self.assertNotIn(forbidden, payload.lower().replace("requested_path", ""))


def _fast_wait_until(timeout, interval, condition):
    """wait_until for tests: poll the condition immediately, raise on timeout."""
    deadline = time_now() + timeout
    while time_now() < deadline:
        if condition():
            return
        sleep(interval)
    raise TimeoutError("condition not met")


def time_now():
    import time

    return time.monotonic()


def sleep(seconds):
    import time

    time.sleep(seconds)


if __name__ == "__main__":
    unittest.main()
