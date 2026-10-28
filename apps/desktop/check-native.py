"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and its WebView runtime. This script
uses verified native keyboard focus, not debugging, injected JS or mocked IPC.
"""
from pathlib import Path
import subprocess
import os
import re
from uuid import uuid4
import sys
import time
import traceback
from uuid import UUID

from pywinauto import Application, Desktop
from pywinauto.keyboard import send_keys
from pywinauto.timings import wait_until

EXE = Path("apps/desktop/src-tauri/target/release/sornio-desktop.exe").resolve()
OUTPUT = Path("dist/native-review")
OUTPUT.mkdir(parents=True, exist_ok=True)
PASSWORD = "SornioReviewAccess2026"
ORIGINAL_NOTE = "Saved in the native app. Reopen without the website."
sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
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
    for _ in range(180):
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
    for title in ("Business name", "Search items for sale", "Saved invoice ID"):
        wait_until(15, 0.2, lambda title=title: not window.child_window(
            title=title, control_type="Edit", visible_only=False
        ).exists(timeout=0.1))


def assert_balances(cash, credit, stock):
    wait_until(30, 0.5, lambda: message_visible(f"Cash recorded: ₹{cash}"))
    wait_until(30, 0.5, lambda: message_visible(f"Credit receivable: ₹{credit}"))
    wait_until(30, 0.5, lambda: message_visible(f"{stock} pcs"))


def assert_no_receipt():
    wait_until(15, 0.2, lambda: not window.child_window(
        title="Saved invoice ID", control_type="Edit", visible_only=False
    ).exists(timeout=0.1))


def assert_review_blocked(reason):
    review = window.child_window(title="Review sale", control_type="Button", visible_only=False)
    wait_until(15, 0.2, lambda: not review.wrapper_object().is_enabled())
    wait_until(15, 0.2, lambda: message_visible(reason))
    assert_no_receipt()
    assert not window.child_window(
        title="Confirm sale", control_type="Button", visible_only=False
    ).exists(timeout=0.1), "Invalid checkout reached confirmation"


def saved_invoice_id():
    value = focus_control("Saved invoice ID", "Edit").get_value()
    assert str(UUID(value)) == value, "Saved invoice did not return its stable UUID"
    return value


def assert_saved_total(value):
    # WebView exposes the label and interpolated amount as separate UIA nodes.
    # Scope to this receipt so matching a ledger or line amount cannot pass.
    receipt = window.child_window(
        title="Sale saved on this PC", control_type="Group", visible_only=False
    )
    wait_until(30, 0.5, lambda: f"Saved total: ₹{value}" in "".join(
        control.window_text() for control in receipt.descendants(control_type="Text")
    ))


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
    fill("Quantity for Sample native rice (pcs)", "4.001")
    assert_review_blocked("Check quantities against available stock.")
    activate("Refresh checkout")
    assert_balances("0.00", "0.00", "4")
    assert_no_receipt()
    fill("Quantity for Sample native rice (pcs)", "1.250")
    activate("Review sale")
    # Leaving the review is not a sale and must not change durable balances.
    activate("Edit sale")
    activate("Refresh checkout")
    assert_balances("0.00", "0.00", "4")
    assert_no_receipt()
    activate("Review sale")
    activate("Confirm sale")
    wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    cash_id = saved_invoice_id()
    assert_saved_total("53.13")
    assert_balances("53.13", "0.00", "2.75")
    window.capture_as_image().save(OUTPUT / "windows-local-cash-receipt.png")
    activate("Start next sale")
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "0.750")
    focus_control("Transaction type", "ComboBox")
    send_keys("{END}{ENTER}", pause=0.2)
    assert_review_blocked("Enter a customer reference for credit")
    activate("Refresh checkout")
    assert_balances("53.13", "0.00", "2.75")
    assert_no_receipt()
    fill("Credit customer reference", "native-customer-1")
    activate("Review sale")
    activate("Confirm sale")
    wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    credit_id = saved_invoice_id()
    assert credit_id != cash_id, "Distinct sales returned the same invoice ID"
    assert_saved_total("31.88")
    assert_balances("53.13", "31.88", "2")
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
    window.child_window(title="Restore saved copy 3", control_type="Button", visible_only=False).wait("exists", timeout=30)
    assert saved_invoice_id() == credit_id, "Saved invoice changed after restart"
    assert_balances("53.13", "31.88", "2")
    window.capture_as_image().save(OUTPUT / "windows-local-reopened.png")

    # Acknowledgement clears the checkpoint, not the committed financial data.
    activate("Start next sale")
    assert_no_receipt()
    assert_balances("53.13", "31.88", "2")
    stop()
    launch()
    focus_control("Search items for sale", "Edit")
    assert_no_receipt()
    assert not window.child_window(
        title="Retry same sale", control_type="Button", visible_only=False
    ).exists(timeout=0.1), "Acknowledged checkout returned after restart"
    assert_balances("53.13", "31.88", "2")
    window.capture_as_image().save(OUTPUT / "windows-local-next-sale-reopened.png")
    # Real OS file picker, actual encrypted file, wrong-passphrase refusal and full restore.
    recovery_secret = "IndependentBackupPassphrase2026"
    backup = Path(os.environ["TEMP"]) / ("sornio-native-" + str(uuid4()) + ".sorniobackup")
    def pick_native_file(title, path):
        dialog = Desktop(backend="uia").window(title=title)
        dialog.wait("visible", timeout=45)
        dialog.set_focus()
        send_keys("%n", pause=0.1)
        send_keys("^a{BACKSPACE}", pause=0.1)
        send_keys(str(path), with_spaces=True, pause=0.01)
        send_keys("{ENTER}", pause=0.1)
        dialog.wait_not("visible", timeout=45)
    original_note = focus_control("Workspace note", "Edit").get_value()
    activate("Open backup controls")
    fill("Current local password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Confirm recovery passphrase for export", recovery_secret)
    activate("Export encrypted backup…")
    pick_native_file("Export encrypted Sornio backup", backup)
    wait_until(60, 0.5, lambda: message_visible("Encrypted backup saved and verified."))
    assert backup.exists() and backup.stat().st_size >= 4096
    payload = backup.read_bytes()
    for secret in (PASSWORD, recovery_secret, original_note):
        assert secret.encode() not in payload, "Backup leaked plaintext"
    assert not payload.startswith(b"SQLite format 3")
    fill("Workspace note", "This note was saved after the backup.")
    activate("Save local draft")
    wait_until(30, 0.5, lambda: message_visible("Saved to this PC. You can close and reopen Sornio."))
    activate("Choose encrypted backup…")
    pick_native_file("Choose encrypted Sornio backup", backup)
    fill("Current local password", PASSWORD)
    fill("Recovery passphrase", "WrongRecoveryPassphrase2026")
    fill("Original local password from backup", PASSWORD)
    activate("Verify and preview backup")
    wait_until(60, 0.5, lambda: message_visible("Backup could not be verified."))
    fill("Current local password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original local password from backup", PASSWORD)
    activate("Verify and preview backup")
    wait_until(60, 0.5, lambda: message_visible("Backup verified. Re-enter the passwords"))
    preview = window.child_window(title="Verified backup preview", control_type="Group", visible_only=False)
    preview.wait("exists", timeout=30)
    phrase_title = next(c.window_text() for c in window.descendants(control_type="Edit") if re.match(r"^Type RESTORE [a-f0-9]{12} to restore$", c.window_text()))
    phrase = re.match(r"^Type (RESTORE [a-f0-9]{12}) to restore$", phrase_title).group(1)
    for title in ("Current local password", "Recovery passphrase", "Original local password from backup"):
        assert focus_control(title, "Edit").get_value() == "", "Preview retained a password"
    focus_control(phrase_title, "Edit")
    window.capture_as_image().save(OUTPUT / "windows-backup-preview.png")
    fill("Current local password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original local password from backup", PASSWORD)
    fill(phrase_title, phrase)
    activate("Create safety backup and restore")
    assert_locked()
    enter_password()
    wait_until(30, 0.5, lambda: focus_control("Workspace note", "Edit").get_value() == original_note)
    assert_balances("53.13", "31.88", "2")
    window.capture_as_image().save(OUTPUT / "windows-backup-restored.png")
    stop()
    launch()
    assert focus_control("Workspace note", "Edit").get_value() == original_note
    assert_balances("53.13", "31.88", "2")
    print("Native Windows backup: OS-picked encrypted export, real ciphertext, wrong passphrase refusal, authenticated preview, cleared password controls, safety-backed restore, original note/financial balances and restart persistence passed.")
    print("Native Windows release: offline password setup, two saves, restore, lock/unlock, forced termination, wrong-password refusal, fractional item/stock saves, overselling and missing-credit-reference guards, review cancellation, real cash/credit checkout, committed receipt UUIDs/totals, ledger balances, deductions, receipt recovery and durable acknowledgement passed.")
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
