"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and its WebView runtime. This script
uses verified native keyboard focus, not debugging, injected JS or mocked IPC.
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
PASSWORD = "SornioReviewAccess2026"
ORIGINAL_NOTE = "Saved in the native app. Reopen without the website."
app = None
window = None


def focus_control(title, control_type):
    """Tab until UIA confirms the target is visible, enabled and focused.

    UIA SetFocus may return successfully without focusing WebView controls.
    Resolving offscreen controls with visible_only=False plus actual Tab input
    avoids relying on layout, scroll position, or a fixed number of Tab stops.
    """
    target = window.child_window(title=title, control_type=control_type, visible_only=False)
    target.wait("exists", timeout=45)
    window.set_focus()
    for _ in range(80):
        control = target.wrapper_object()
        if control.is_visible() and control.is_enabled() and control.has_keyboard_focus():
            return control
        send_keys("{TAB}", pause=0.1)
    raise AssertionError(f"Keyboard focus did not reach {control_type}: {title}")


def fill(title, text):
    control = focus_control(title, "Edit")
    send_keys("^a{BACKSPACE}", pause=0.1)
    send_keys(text, with_spaces=True, pause=0.01)
    return control


def activate(title):
    focus_control(title, "Button")
    send_keys("{SPACE}", pause=0.1)


def message_visible(text):
    return any(text in control.window_text() for control in window.descendants())


def assert_locked():
    window.child_window(title="Local password", control_type="Edit").wait("visible enabled", timeout=30)
    wait_until(15, 0.2, lambda: not window.child_window(
        title="Business name", control_type="Edit", visible_only=False
    ).exists(timeout=0.1))


def enter_password(setup=False):
    fill("Local password", PASSWORD)
    if setup:
        fill("Confirm password", PASSWORD)
    activate("Set up local access" if setup else "Unlock workspace")


def launch(setup=False):
    global app, window
    app = Application(backend="uia").start(str(EXE), timeout=60)
    # WebView accessibility nodes have different PIDs from their native window.
    window = Desktop(backend="uia").window(title_re="Sornio.*Local workspace review")
    window.wait("visible", timeout=60)
    assert_locked()
    if not setup:
        fill("Local password", "WrongReviewPassword")
        activate("Unlock workspace")
        wait_until(30, 0.5, lambda: message_visible("That password did not unlock this workspace."))
        assert_locked()
    enter_password(setup=setup)
    return focus_control("Business name", "Edit")


def stop():
    global app, window
    if app is not None:
        subprocess.run(["taskkill", "/pid", str(app.process), "/T", "/F"], check=False, capture_output=True)
        app = None
        window = None
        time.sleep(1)


try:
    launch(setup=True)
    fill("Business name", "Sample local store")
    fill("Workspace note", ORIGINAL_NOTE)
    activate("Save local draft")
    wait_until(30, 0.5, lambda: message_visible("Saved to this PC. You can close and reopen Sornio."))
    window.capture_as_image().save(OUTPUT / "windows-local-saved.png")

    fill("Workspace note", "A second saved draft to undo.")
    activate("Save local draft")
    window.child_window(title="Restore saved copy 2", control_type="Button", visible_only=False).wait("exists", timeout=30)
    activate("Restore saved copy 1")
    wait_until(30, 0.5, lambda: message_visible("Restored saved copy 1 as revision 3."))
    window.capture_as_image().save(OUTPUT / "windows-local-restored.png")

    fill("Item name", "Sample native rice")
    fill("Item code (optional)", "NATIVE-RICE")
    fill("Unit price (₹)", "42.50")
    fill("Opening stock", "1.250")
    activate("Save item on this PC")
    wait_until(30, 0.5, lambda: message_visible("Saved item changes to this PC."))
    wait_until(30, 0.5, lambda: message_visible("1.25 pcs"))
    # Select the first saved item using native keyboard input on the actual combo.
    focus_control("Item to adjust", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Quantity change", "2.750")
    fill("Reason for stock change", "Counted delivery")
    activate("Save stock change")
    wait_until(30, 0.5, lambda: message_visible("4 pcs"))
    window.capture_as_image().save(OUTPUT / "windows-local-stock.png")

    # Actual bundled cashier -> authorized native posting -> encrypted SQLite.
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "1.250")
    activate("Review sale")
    activate("Confirm sale")
    wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    cash_id = focus_control("Saved invoice ID", "Edit").get_value()
    assert len(cash_id) == 36, "Cash invoice did not return its stable ID"
    wait_until(30, 0.5, lambda: message_visible("Cash recorded: ₹53.13"))
    wait_until(30, 0.5, lambda: message_visible("2.75 pcs"))
    activate("Start next sale")
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "0.750")
    focus_control("Transaction type", "ComboBox")
    send_keys("{END}{ENTER}", pause=0.2)
    fill("Credit customer reference", "native-customer-1")
    activate("Review sale")
    activate("Confirm sale")
    wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    credit_id = focus_control("Saved invoice ID", "Edit").get_value()
    assert len(credit_id) == 36 and credit_id != cash_id, "Credit invoice ID is invalid"
    wait_until(30, 0.5, lambda: message_visible("Credit receivable: ₹31.88"))
    wait_until(30, 0.5, lambda: message_visible("2 pcs"))
    window.capture_as_image().save(OUTPUT / "windows-local-checkout.png")

    activate("Lock workspace")
    assert_locked()
    window.capture_as_image().save(OUTPUT / "windows-local-locked.png")
    enter_password()
    focus_control("Business name", "Edit")
    stop()

    field = launch()
    assert field.get_value() == "Sample local store", "Business draft changed after termination"
    note = focus_control("Workspace note", "Edit")
    assert note.get_value() == ORIGINAL_NOTE, "Restored note changed after unlock/reopen"
    window.capture_as_image().save(OUTPUT / "windows-local-reopened.png")
    window.child_window(title="Restore saved copy 3", control_type="Button", visible_only=False).wait("exists", timeout=30)
    wait_until(30, 0.5, lambda: message_visible("2 pcs"))
    assert focus_control("Saved invoice ID", "Edit").get_value() == credit_id, "Saved invoice changed after restart"
    wait_until(30, 0.5, lambda: message_visible("Cash recorded: ₹53.13"))
    wait_until(30, 0.5, lambda: message_visible("Credit receivable: ₹31.88"))
    print("Native Windows release: offline password setup, two saves, restore, lock/unlock, forced termination, wrong-password refusal, fractional item/stock saves, real cash/credit checkout, committed receipt IDs, ledger balances, deductions and receipt retained after unlock/reopen passed.")
except Exception:
    traceback.print_exc()
    if window is not None:
        try:
            window.capture_as_image().save(OUTPUT / "windows-local-failure.png")
            for control in window.descendants()[:100]:
                print(control.element_info.control_type, repr(control.window_text()),
                      "enabled=", control.is_enabled(), "visible=", control.is_visible(),
                      "focused=", control.has_keyboard_focus())
        except Exception as capture_error:
            print("Could not capture the failing native window:", type(capture_error).__name__)
    raise
finally:
    stop()
