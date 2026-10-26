"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and the installed WebView runtime before
launch. No debugging port, JavaScript injection, mock IPC or hosted app is used.
"""
from pathlib import Path
import subprocess
import time
import traceback

from pywinauto import Application, Desktop
from pywinauto.timings import wait_until

EXE = Path("apps/desktop/src-tauri/target/release/sornio-desktop.exe").resolve()
OUTPUT = Path("dist/native-review")
OUTPUT.mkdir(parents=True, exist_ok=True)
app = None
window = None


def launch():
    global app, window
    app = Application(backend="uia").start(str(EXE), timeout=60)
    # Desktop traversal includes the WebView accessibility nodes, whose process
    # IDs differ from their containing application window.
    window = Desktop(backend="uia").window(title_re="Sornio.*Local workspace review")
    window.wait("visible", timeout=60)
    window.set_focus()
    field = window.child_window(title="Business name", control_type="Edit")
    field.wait("visible enabled", timeout=45)
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
    field = launch()
    field.set_edit_text("Sample local store")
    note = window.child_window(title="Workspace note", control_type="Edit")
    note.wait("visible enabled", timeout=15)
    note.set_edit_text("Saved in the native app. Reopen without the website.")
    save = window.child_window(title="Save local draft", control_type="Button")
    save.wait("visible enabled", timeout=15)
    save.invoke()
    wait_until(30, 0.5, saved_message_visible)
    window.capture_as_image().save(OUTPUT / "windows-local-saved.png")
    stop()
    field = launch()
    assert field.get_value() == "Sample local store", "Business draft did not survive process termination"
    note = window.child_window(title="Workspace note", control_type="Edit").wrapper_object()
    assert note.get_value() == "Saved in the native app. Reopen without the website.", "Saved note changed on reopen"
    window.capture_as_image().save(OUTPUT / "windows-local-reopened.png")
    print("Native Windows release: network-blocked startup, draft save, process termination and reopen passed.")
except Exception:
    traceback.print_exc()
    if window is not None:
        try:
            window.capture_as_image().save(OUTPUT / "windows-local-failure.png")
            for control in window.descendants()[:100]:
                print(control.element_info.control_type, repr(control.window_text()))
        except Exception as capture_error:
            print("Could not capture the failing native window:", type(capture_error).__name__)
    raise
finally:
    stop()
