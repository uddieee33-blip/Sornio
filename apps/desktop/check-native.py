"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and the installed WebView runtime before
launch. No debugging port, JavaScript injection, mock IPC or hosted app is used.
"""
from pathlib import Path
import subprocess
import time
import traceback

from pywinauto import Application, Desktop
from pywinauto.keyboard import send_keys
from pywinauto.timings import wait_until

EXE = Path("apps/desktop/src-tauri/target/release/sornio-desktop.exe").resolve()
OUTPUT = Path("dist/native-review")
OUTPUT.mkdir(parents=True, exist_ok=True)
app = None
window = None
PASSWORD = "SornioReviewAccess2026"


def enter_password(setup=False):
    password = window.child_window(title="Local password", control_type="Edit")
    password.wait("exists enabled visible", timeout=45)
    password.set_focus()
    send_keys(PASSWORD, pause=0.02)
    if setup:
        send_keys("{TAB}", pause=0.1)
        send_keys(PASSWORD, pause=0.02)
    send_keys("{TAB}{ENTER}", pause=0.1)


def launch(setup=False):
    global app, window
    app = Application(backend="uia").start(str(EXE), timeout=60)
    # Desktop traversal includes the WebView accessibility nodes, whose process
    # IDs differ from their containing application window.
    window = Desktop(backend="uia").window(title_re="Sornio.*Local workspace review")
    window.wait("visible", timeout=60)
    window.set_focus()
    password = window.child_window(title="Local password", control_type="Edit")
    password.wait("exists enabled visible", timeout=45)
    assert not window.child_window(title="Business name", control_type="Edit").exists(), "Draft controls appeared before unlock"
    if not setup:
        password.set_focus()
        send_keys("WrongReviewPassword{TAB}{ENTER}", pause=0.05)
        wait_until(30, 0.5, lambda: any("That password did not unlock this workspace." in c.window_text()
                   for c in window.descendants(control_type="Text")))
        assert not window.child_window(title="Business name", control_type="Edit").exists(), "Wrong password exposed the draft"
    enter_password(setup=setup)
    field = window.child_window(title="Business name", control_type="Edit")
    field.wait("exists enabled", timeout=45)
    return field.wrapper_object()


def stop():
    global app, window
    if app is not None:
        subprocess.run(["taskkill", "/pid", str(app.process), "/T", "/F"], check=False, capture_output=True)
        app = None
        window = None
        time.sleep(1)


def saved_message_visible():
    return any("Saved to this PC. You can close and reopen Sornio." in control.window_text()
               for control in window.descendants(control_type="Text"))


try:
    field = launch(setup=True)
    field.set_edit_text("Sample local store")
    field.set_focus()
    # Keyboard navigation scrolls the browser's focused control into view on
    # small desktops. UIA SetFocus alone does not scroll WebView2 content.
    send_keys("{TAB}{TAB}", pause=0.1)
    note = window.child_window(title="Workspace note", control_type="Edit")
    note.wait("visible enabled", timeout=15)
    note.set_edit_text("Saved in the native app. Reopen without the website.")
    note.set_focus()
    send_keys("{TAB}{ENTER}", pause=0.1)
    wait_until(30, 0.5, saved_message_visible)
    window.capture_as_image().save(OUTPUT / "windows-local-saved.png")

    # Commit a second copy, then restore the first through the normal UI.
    note.set_edit_text("A second saved draft to undo.")
    note.set_focus()
    send_keys("{TAB}{ENTER}", pause=0.1)
    # At the runner's window width the top revision label is hidden. Chromium
    # exposes the copy's revision in the button/list item rather than Text.
    window.child_window(title="Restore saved copy 2", control_type="Button").wait("exists", timeout=30)
    restore = window.child_window(title="Restore saved copy 1", control_type="Button")
    # Offscreen WebView buttons may report disabled to UIA until keyboard
    # navigation scrolls them into view. Confirm restore by its committed result.
    restore.wait("exists", timeout=30)
    # From the saved note, Tab skips the disabled Save/current-copy buttons:
    # Reopen -> Refresh copies -> Restore copy 1. This also scrolls it into view.
    note.set_focus()
    send_keys("{TAB}{TAB}{TAB}{SPACE}", pause=0.1)
    wait_until(30, 0.5, lambda: any("Restored saved copy 1 as revision 3." in c.window_text()
               for c in window.descendants(control_type="Text")))
    window.capture_as_image().save(OUTPUT / "windows-local-restored.png")

    # Lock a saved workspace and unlock it through native accessibility controls.
    note.set_focus()
    send_keys("+{TAB}+{TAB}+{TAB}{SPACE}", pause=0.1)
    window.child_window(title="Local password", control_type="Edit").wait("visible enabled", timeout=30)
    assert not window.child_window(title="Business name", control_type="Edit").exists(), "Lock left draft controls exposed"
    window.capture_as_image().save(OUTPUT / "windows-local-locked.png")
    enter_password()
    window.child_window(title="Business name", control_type="Edit").wait("exists enabled", timeout=30)
    stop()
    field = launch()
    assert field.get_value() == "Sample local store", "Business draft did not survive process termination"
    field.set_focus()
    send_keys("{TAB}{TAB}", pause=0.1)
    note = window.child_window(title="Workspace note", control_type="Edit")
    note.wait("visible enabled", timeout=15)
    assert note.get_value() == "Saved in the native app. Reopen without the website.", "Saved note changed on reopen"
    window.capture_as_image().save(OUTPUT / "windows-local-reopened.png")
    window.child_window(title="Restore saved copy 3", control_type="Button").wait("exists", timeout=30)
    print("Native Windows release: offline password setup, two saves, restore, lock/unlock, forced termination, wrong-password refusal and unlock/reopen passed.")
except Exception:
    traceback.print_exc()
    if window is not None:
        try:
            window.capture_as_image().save(OUTPUT / "windows-local-failure.png")
            for control in window.descendants()[:100]:
                print(control.element_info.control_type, repr(control.window_text()), "enabled=", control.is_enabled(), "visible=", control.is_visible())
        except Exception as capture_error:
            print("Could not capture the failing native window:", type(capture_error).__name__)
    raise
finally:
    stop()

