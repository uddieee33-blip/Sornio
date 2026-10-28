"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and its WebView runtime. This script
uses verified native keyboard focus, not debugging, injected JS or mocked IPC.
"""
from pathlib import Path
import subprocess
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
    for _ in range(240):
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


def enter_password(setup=False, account="owner"):
    if setup:
        fill("Business name for setup", "Sample local store")
        fill("Owner name", "Review owner")
    fill("Account name", account)
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
    fill("Customer ID", "native-customer-1")
    fill("Customer name", "Native credit customer")
    fill("Customer phone (optional)", "+91 98765 43210")
    fill("Credit limit (₹, blank for no limit)", "50.00")
    activate("Save customer")
    wait_until(30, 0.5, lambda: message_visible("Customer saved."))
    fill("Find credit customer", "9876543210")
    activate("Use customer native-customer-1")
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
    # Native customer cash collections: partial repayment, forced restart,
    # exact saved receipt recovery, acknowledgement, full settlement and print.
    activate("Open customer native-customer-1")
    fill("Credit entry amount (₹)", "10.00")
    activate("Review credit entry")
    activate("Cancel credit review")
    assert_balances("53.13", "31.88", "2")
    activate("Review credit entry")
    activate("Confirm credit entry")
    payment_id = focus_control("Saved credit entry ID", "Edit").get_value()
    assert str(UUID(payment_id)) == payment_id
    assert_balances("63.13", "21.88", "2")
    stop()
    launch()
    assert focus_control("Saved credit entry ID", "Edit").get_value() == payment_id
    assert_balances("63.13", "21.88", "2")
    activate("Start next credit entry")
    fill("Credit entry amount (₹)", "21.88")
    activate("Review credit entry")
    activate("Confirm credit entry")
    second_payment = focus_control("Saved credit entry ID", "Edit").get_value()
    assert second_payment != payment_id
    assert_balances("85.01", "0.00", "2")
    activate("Start next credit entry")
    activate("Prepare full customer statement")
    window.child_window(title="Print customer statement", control_type="Button", visible_only=False).wait("exists", timeout=30)
    wait_until(30, 0.5, lambda: message_visible("Customer statement"))
    window.capture_as_image().save(OUTPUT / "windows-customer-ledger.png")
    # Owner provisions a real staff account, then native access is tested under
    # that account. This uses only keyboard/UIA on the packaged release binary.
    fill("Staff name", "Native cashier")
    fill("Staff account name", "native-cashier")
    fill("Staff password", PASSWORD)
    activate("Create staff account")
    window.child_window(title="Disable native-cashier", control_type="Button", visible_only=False).wait("exists", timeout=30)
    activate("Lock workspace")
    assert_locked()
    enter_password(account="native-cashier")
    focus_control("Search items for sale", "Edit")
    for title in ("Business name", "Staff password", "Quantity change", "Item name", "Customer name", "Existing credit invoice ID"):
        assert not window.child_window(title=title, control_type="Edit", visible_only=False).exists(timeout=0.1), title
    assert not message_visible("Cash recorded:"), "Cashier received aggregate reports"
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "0.250")
    activate("Review sale")
    activate("Confirm sale")
    saved_invoice_id()
    assert_saved_total("10.63")
    activate("Start next sale")
    activate("Lock workspace")
    assert_locked()
    enter_password()
    assert_balances("95.64", "0.00", "1.75")
    focus_control("Role for native-cashier", "ComboBox")
    send_keys("{HOME}{ENTER}", pause=0.2)
    activate("Save role for native-cashier")
    wait_until(30, 0.5, lambda: message_visible("Staff updated."))
    activate("Lock workspace")
    enter_password(account="native-cashier")
    focus_control("Quantity change", "Edit")
    assert_balances("95.64", "0.00", "1.75")
    activate("Lock workspace")
    enter_password()
    activate("Disable native-cashier")
    window.child_window(title="Enable native-cashier", control_type="Button", visible_only=False).wait("exists", timeout=30)
    activate("Lock workspace")
    enter_password(account="native-cashier")
    wait_until(30, 0.5, lambda: message_visible("That password did not unlock this workspace."))
    assert_locked()
    window.capture_as_image().save(OUTPUT / "windows-staff-disabled.png")
    # Retail operations use the real bundled IPC and encrypted transaction engine.
    enter_password()
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "0.250")
    fill("Tax (%)", "0")
    focus_control("Transaction type", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Split cash amount (₹)", "5.00")
    fill("Split UPI amount (₹)", "5.63")
    activate("Review sale")
    activate("Confirm sale")
    retail_invoice = saved_invoice_id()
    assert_saved_total("10.63")
    assert_balances("100.64", "0.00", "1.5")
    activate("Start next sale")
    activate("Refresh payment records")
    fill("Invoice ID for payment records", retail_invoice)

    def retail_text(text):
        return text in "".join(c.window_text() for c in window.descendants(control_type="Text"))

    def activate_prefix(prefix):
        wait_until(30, 0.5, lambda: any(c.window_text().startswith(prefix) for c in window.descendants(control_type="Button")))
        names = [c.window_text() for c in window.descendants(control_type="Button") if c.window_text().startswith(prefix)]
        assert len(names) == 1, f"Ambiguous native action {prefix}: {names}"
        activate(names[0])

    wait_until(30, 0.5, lambda: retail_text("Pending — unverified"))
    fill("Bank or terminal reference (never card number)", "WINUPI123456")
    fill("Bank statement amount (₹)", "5.63")
    fill("Manual statement check note", "Manually compared synthetic bank statement")
    activate_prefix("Review manual match ")
    activate("Confirm retail operation")
    match_id = focus_control("Saved retail operation ID", "Edit").get_value()
    assert str(UUID(match_id)) == match_id
    stop()
    launch()
    assert focus_control("Saved retail operation ID", "Edit").get_value() == match_id
    activate("Start next retail operation")
    fill("Invoice ID for payment records", retail_invoice)
    wait_until(30, 0.5, lambda: retail_text("Manually matched — not externally verified"))
    wait_until(30, 0.5, lambda: retail_text("Externally verified: ₹0.00"))
    fill("Return quantity for line 1: Sample native rice (pcs)", "0.250")
    fill("Return or correction reason", "Native returned goods inspected")
    activate("Calculate native return")
    wait_until(30, 0.5, lambda: retail_text("Digital refund pending ₹5.63"))
    activate("Review invoice return")
    activate("Confirm retail operation")
    return_id = focus_control("Saved retail operation ID", "Edit").get_value()
    assert return_id != match_id
    assert_balances("95.64", "0.00", "1.75")
    activate("Start next retail operation")
    activate("Save CA settlement CSV")
    export_path = focus_control("Saved settlement CSV path", "Edit").get_value()
    assert Path(export_path).is_file(), "Native settlement CSV was not saved"
    csv_text = Path(export_path).read_text(encoding="utf-8")
    assert csv_text.startswith("record_type,") and "refund_obligation" in csv_text
    assert PASSWORD not in csv_text
    assert all(line.endswith(",false") for line in csv_text.splitlines()[1:])
    fill("Counted drawer cash (₹)", "85.00")
    activate("Review cashier closing")
    activate("Confirm retail operation")
    focus_control("Saved retail operation ID", "Edit")
    wait_until(30, 0.5, lambda: retail_text("Closing expected cash ₹85.01 · Counted ₹85.00 · Variance -₹0.01"))
    window.capture_as_image().save(OUTPUT / "windows-retail-closing.png")
    print("Native retail release: real cash/UPI split, pending/unverified separation, explicit manual statement match, forced match receipt recovery, authorized return, cash refund, pending digital refund, atomic stock restoration, saved CA CSV and exact cashier variance passed.")
    print("Native Windows release: offline password setup, two saves, restore, lock/unlock, forced termination, wrong-password refusal, fractional item/stock saves, overselling and missing-credit-reference guards, review cancellation, real cash/credit checkout, committed receipt UUIDs/totals, ledger balances, deductions, receipt recovery, durable acknowledgement, owner staff creation, cashier restrictions/sale, role changes, disabled-account refusal, customer creation/phone lookup, partial and full cash collection, forced repayment receipt recovery, ledger balances and native printable statement passed.")
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
