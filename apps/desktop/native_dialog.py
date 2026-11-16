"""Drive the real OS Save/Open dialog, and report enough to diagnose a failure.

Why this is a module and not a closure inside the acceptance script
---------------------------------------------------------------
The installed-app acceptance opens a native dialog four times in one run:

    retail export -> retail open -> (restart) -> purchasing export -> purchasing open

Only the third one ever failed. A closure cannot be tested without pywinauto,
a Windows desktop and the product installed, so every attempt to fix it was
verified by re-running a ~40-minute installed-app job and reading an annotation
that said "timed out". The logic therefore lives here, where

    python -m unittest discover -s apps/desktop -p test_native_dialog.py

drives it on a plain Linux box with synthetic handles, and where each real
attempt emits a bounded evidence record (`DialogEvidence`) naming the handle,
window class, title, owner, foreground window, the requested path, whether the
field accepted that path, and which windows were still visible afterwards.

The measured failure this replaces
----------------------------------
Run 43792415789, step "Verify installed offline app, recovery and lifecycle
preservation", at `pick_native_file("Export encrypted Sornio backup", ...)`:

    wait_until(10, 0.5, lambda: not any_live_dialog())  ->  TimeoutError

with "Order PO-1 is Closed." / "PO-1 · Closed" on screen, after six attempts,
each on a freshly resolved handle, each pressing Save. Earlier runs recorded the
other half of the same defect: when the driver did press Save, the app saved to
the dialog's *default* name, not the requested one, and reported that path
truthfully. So the preconditions of that timeout are all measurable:

  1. The requested filename never verifiably reached the field, and the old code
     pressed Save anyway rather than retrying the entry.
  2. The default name had therefore already been used by the retail export in
     the same run, so the third dialog had a name that exists on disk — which is
     where a real Windows Save dialog raises a "confirm file replace" modal.
  3. A modal owned by the file dialog swallows every later click on the parent,
     which is exactly "the dialog is still visible and nothing happens".

This module removes cause 1 (entry is retried until read-back matches, and the
press is never made with an unverified field unless the caller asks for that
fallback), handles cause 2 deterministically (a confirmation window is
identified, recorded and answered), and proves cause 3 when it happens (the
evidence record names every visible window at the moment of each attempt).

Two rules this enforces
-----------------------
1. **The dialog must genuinely be gone, or the run fails.** Nothing here is
   satisfied by "clicked once and hoped". `close_dialog` re-resolves the live
   window on every attempt and refuses to return while one is visible.
2. **A dialog that will not close is a harness failure with evidence**, not a
   product failure and not a pass. `DialogNotClosed.harness_failure` is set so a
   caller can never mistake it for the product refusing a path.
"""
from dataclasses import dataclass, field, asdict
from pathlib import Path
import json
import os
import time

__all__ = [
    "ConfirmationSeen",
    "DialogEvidence",
    "DialogNotClosed",
    "asdict",
    "close_dialog",
    "describe_window",
    "foreground_window",
    "live_windows",
]

# A Save dialog that asks to replace an existing file. Windows uses a
# #32770-class message box; the label differs by locale and by whether the
# shell is offering "Save As". Matching is on the affirmative button because
# that is what a user answers, not on the language of the question.
CONFIRM_TITLES = (
    "Confirm Save As",
    "Confirm Save as",
    "Confirm File Replace",
    "Confirm replacement",
)
AFFIRMATIVE = ("Yes", "&Yes", "Replace", "&Replace", "Save", "&Save", "OK", "Overwrite")


class DialogNotClosed(RuntimeError):
    """The native dialog is still on screen after the attempt budget.

    This is a failure of the automation, not of the product: while a modal
    dialog is open the product's handler has not run at all.
    """

    def __init__(self, title, attempts, evidence):
        self.title = title
        self.attempts = attempts
        self.evidence = evidence
        self.harness_failure = True
        super().__init__(
            f"{title!r} was still visible after {attempts} attempts; "
            f"no product code runs until a Save dialog returns a path"
        )


@dataclass
class ConfirmationSeen:
    """A modal the driver answered on the way to closing the dialog."""

    title: str = ""
    class_name: str = ""
    buttons: list = field(default_factory=list)
    answered: str = ""


@dataclass
class DialogEvidence:
    """What the failing action looked like. No credentials, no file contents."""

    title: str = ""
    mode: str = "save"
    attempts: int = 0
    requested_path: str = ""
    entry_verified: bool = False
    entry_attempts: int = 0
    pressed: int = 0
    harness_failure: bool = False
    handles: list = field(default_factory=list)
    live_windows: list = field(default_factory=list)
    confirmations: list = field(default_factory=list)
    foreground: str = ""
    live_after: bool = False
    app_wrote_path: bool = False
    error: str = ""

    def record(self):
        """Append this record to $SORNIO_DIALOG_EVIDENCE (JSON lines) if set."""
        target = os.environ.get("SORNIO_DIALOG_EVIDENCE")
        if not target:
            return None
        try:
            path = Path(target)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(asdict(self), sort_keys=True) + "\n")
            return path
        except OSError:
            return None


def describe_window(candidate):
    """Best-effort identity of a UIA wrapper; never raises.

    A stale element is expected here — the failure being diagnosed is a dialog
    that outlives its handle — and a description failure must not become the
    run's failure.
    """
    detail = {}
    try:
        info = candidate.element_info
    except Exception:
        return {"error": "no element_info"}
    for key, getter in (
        ("title", lambda: info.name),
        ("class_name", lambda: info.class_name),
        ("control_type", lambda: info.control_type),
        ("pid", lambda: info.process_id),
        ("handle", lambda: info.handle),
        ("automation_id", lambda: info.automation_id),
    ):
        try:
            detail[key] = getter()
        except Exception:
            detail[key] = None
    for key, getter in (("visible", candidate.is_visible), ("enabled", candidate.is_enabled)):
        try:
            detail[key] = bool(getter())
        except Exception:
            detail[key] = None
    try:
        detail["owner"] = candidate.parent().window_text()
    except Exception:
        detail["owner"] = None
    return detail


def foreground_window(desktop):
    """The window the OS says the user is looking at, or why that is unknown."""
    try:
        return describe_window(desktop.window(active_only=True))
    except Exception as error:
        return {"error": type(error).__name__}


def live_windows(desktop, title, title_re=None):
    """Every currently visible top-level window matching the title.

    Matching is by title *and* visibility: `Desktop().window()` returns the
    first match even when it is the detached element left behind by an earlier
    dialog with the same title, which is one of the failure modes this run has
    to be able to tell apart from a dialog that genuinely will not close.
    """
    try:
        candidates = (
            desktop.windows(title_re=title_re) if title_re else desktop.windows(title=title)
        )
        candidates = list(candidates)
    except Exception:
        return []
    matches = []
    for candidate in candidates:
        try:
            if candidate.is_visible():
                matches.append(candidate)
        except Exception:
            continue
    return matches


def find_button(dialog, wanted, control_type="Button"):
    """A control whose visible label contains `wanted`."""
    try:
        descendants = list(dialog.descendants(control_type=control_type))
    except Exception:
        return None
    for candidate in descendants:
        try:
            label = candidate.window_text() or ""
        except Exception:
            continue
        if wanted.lower() in label.lower():
            return candidate
    return None


def find_filename_edit(dialog):
    """The dialog's file-name field, via every identification that works.

    Current common-dialogs expose "File name:"; some builds drop the colon and
    older shells use automation id 1001 inside the combo. Trying all of them
    matters because "the field was not found" and "the field rejected the text"
    have different fixes.
    """
    for title in ("File name:", "File name", "Name:", "File &name:"):
        try:
            spec = dialog.child_window(title=title, control_type="Edit")
            if spec.exists(timeout=1):
                return spec.wrapper_object()
        except Exception:
            continue
    for auto_id in ("1001", "1152"):
        try:
            spec = dialog.child_window(auto_id=auto_id, control_type="Edit")
            if spec.exists(timeout=1):
                return spec.wrapper_object()
        except Exception:
            continue
    try:
        edits = list(dialog.descendants(control_type="Edit"))
    except Exception:
        return None
    return edits[0] if edits else None


def type_path(edit, path, send_keys, pause=0.03, settle=0.3):
    """Put `path` in the field with real keystrokes and read it back.

    Only keyboard read-back counts as verified. A UIA ValuePattern write can
    report the text back without the dialog's internal state accepting it —
    measured on this runner, documented in
    docs/reviews/windows-release-gate-2026-11-01.md.

    `pause` is not decorative: the recorded failure of the fastest attempt was a
    *mangled* path (`C:\\Users\\RUNNER.sorniobackup`), which is what typing too
    fast looks like. The caller retries with a longer pause rather than
    assuming the keystrokes landed.
    """
    target = str(path)
    try:
        edit.set_focus()
        send_keys("^a{BACKSPACE}", pause=0.1)
        send_keys(target, with_spaces=True, pause=pause)
        time.sleep(settle)
        return os.path.normcase(str(edit.get_value())) == os.path.normcase(target)
    except Exception:
        return False


def enter_path(dialog, path, send_keys, attempts=3, evidence=None):
    """Retry the filename entry until UIA read-back matches the requested path."""
    edit = find_filename_edit(dialog)
    if edit is None:
        return False
    for index in range(attempts):
        if evidence is not None:
            evidence.entry_attempts = index + 1
        # Slower keystrokes on each retry: the measured failure mode of the fast
        # path is dropped or transposed characters, not a rejected value.
        if type_path(edit, path, send_keys, pause=0.03 * (index + 1)):
            return True
    return False


def confirmation_windows(desktop, dialog_title, known_titles=()):
    """Visible dialogs that are asking a question, not saving a file.

    Two shapes are covered, because a hosted runner's shell can produce either:

    * a separate top-level #32770 with a "confirm ..." title, and
    * a modal owned by the file dialog whose title is none of the known ones
      but whose buttons ask for a yes/no answer.

    `known_titles` are the titles the caller legitimately expects (the Save and
    Open dialogs of this run); anything else with an affirmative button is
    treated as a question.
    """
    found = []
    try:
        candidates = list(desktop.windows())
    except Exception:
        return found
    for candidate in candidates:
        try:
            if not candidate.is_visible():
                continue
            title = candidate.window_text() or ""
        except Exception:
            continue
        if not title or title in known_titles or title == dialog_title:
            continue
        try:
            labels = [c.window_text() for c in candidate.descendants(control_type="Button")]
        except Exception:
            continue
        affirmative = [label for label in labels if label.strip() in AFFIRMATIVE]
        if not affirmative:
            continue
        if not any(marker.lower() in title.lower() for marker in CONFIRM_TITLES):
            # Not a replace prompt by title. Only accept it as a question when
            # it is a plain message box (class #32770); a WebView panel with a
            # Save button is not a modal to answer.
            try:
                class_name = candidate.element_info.class_name or ""
            except Exception:
                class_name = ""
            if class_name != "#32770":
                continue
        found.append((candidate, affirmative))
    return found


def answer_confirmation(candidate, affirmative, evidence):
    """Press the affirmative button and record what was asked."""
    seen = ConfirmationSeen()
    try:
        seen.title = candidate.window_text() or ""
        seen.class_name = candidate.element_info.class_name or ""
    except Exception:
        pass
    seen.buttons = list(affirmative)
    pressed = ""
    for wanted in AFFIRMATIVE:
        button = find_button(candidate, wanted)
        if button is None:
            continue
        try:
            button.click_input()
            pressed = wanted
            break
        except Exception:
            continue
    seen.answered = pressed
    return seen


def close_dialog(
    title,
    path,
    desktop,
    send_keys,
    mode="save",
    attempts=6,
    attempt_timeout=10,
    wait_until=None,
    evidence=None,
    known_titles=(),
    require_verified_entry=False,
    poll=0.5,
    settle=0.2,
):
    """Close a native Save/Open dialog towards `path`.

    Returns True when real keystrokes verifiably put `path` in the field before
    the button was pressed, and raises `DialogNotClosed` — with evidence — if the
    dialog is still visible after `attempts` rounds. It never returns while a
    dialog with this title is visible.

    `require_verified_entry=True` refuses to press the button with a field that
    does not hold the requested path: on a dialog whose default name already
    exists, pressing with the default is what raises a replace prompt, and the
    caller may prefer to fail loudly instead.
    """
    evidence = evidence or DialogEvidence(title=title, mode=mode)
    evidence.title = title
    evidence.mode = mode
    evidence.requested_path = str(path)
    wanted = "Save" if mode == "save" else "Open"

    def still_live():
        return bool(live_windows(desktop, title))

    for attempt in range(attempts):
        evidence.attempts = attempt + 1
        windows = live_windows(desktop, title)
        evidence.live_windows = [describe_window(w) for w in windows]
        if not windows:
            evidence.live_after = False
            return evidence.entry_verified
        # Newest match: this run opens the same titled dialog twice, and the
        # older element is the one that must not be driven.
        dialog = windows[-1]
        evidence.handles.append(describe_window(dialog))
        evidence.foreground = foreground_window(desktop)
        try:
            dialog.set_focus()
        except Exception:
            pass
        # A modal raised by an earlier press is answered before the parent is
        # clicked again: the parent ignores input while the question is open.
        for candidate, affirmative in confirmation_windows(desktop, title, known_titles):
            seen = answer_confirmation(candidate, affirmative, evidence)
            evidence.confirmations.append(asdict(seen))
            time.sleep(settle)
        if not evidence.entry_verified:
            evidence.entry_verified = enter_path(dialog, path, send_keys, evidence=evidence)
        if require_verified_entry and not evidence.entry_verified:
            continue
        button = find_button(dialog, wanted)
        try:
            if button is not None:
                button.click_input()
            else:
                send_keys("{ENTER}", pause=0.1)
            evidence.pressed += 1
        except Exception:
            try:
                send_keys("{ENTER}", pause=0.1)
                evidence.pressed += 1
            except Exception as error:
                evidence.error = f"{type(error).__name__}: {error}"
        # Poll: the dialog must be gone. A fixed sleep would hide both a fast
        # dismissal and a dialog that never leaves.
        try:
            if wait_until is not None:
                wait_until(attempt_timeout, poll, lambda: not still_live())
                evidence.live_after = False
                return evidence.entry_verified
        except Exception:
            pass
        if not still_live():
            evidence.live_after = False
            return evidence.entry_verified
    evidence.live_after = still_live()
    evidence.harness_failure = True
    raise DialogNotClosed(title, attempts, evidence)
