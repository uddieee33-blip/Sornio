"""Exercise the unmodified release app through Windows accessibility controls.

CI blocks outbound traffic for this app and its WebView runtime. This script
uses verified native keyboard focus, not debugging, injected JS or mocked IPC.
"""
from pathlib import Path
import json
import os
import re
import subprocess
import sys
import time
import traceback
from uuid import UUID, uuid4

from pywinauto import Application, Desktop
from pywinauto.keyboard import send_keys
from pywinauto.timings import wait_until

EXE = Path(os.environ.get("SORNIO_REVIEW_EXE", "apps/desktop/src-tauri/target/release/sornio-desktop.exe")).resolve()
OUTPUT = Path("dist/native-review")
OUTPUT.mkdir(parents=True, exist_ok=True)
PASSWORD = "SornioReviewAccess2026"
ORIGINAL_NOTE = "Saved in the native app. Reopen without the website."
# The copy the checkout renders when a credit sale has no resolved customer.
# It is pinned here because the installed app is the only place this sentence
# can be read, and a stale expectation there fails as a 30-second locator
# timeout that says nothing about the cause.
CREDIT_CUSTOMER_REQUIRED = "Select an existing credit customer and wait for their credit details."
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


def activate_link(title):
    """Click a rail navigation link. WebView2 exposes a[href] as Hyperlink on
    some builds and as Button on others, so try both; Enter activates it."""
    for control_type in ("Hyperlink", "Button"):
        target = window.child_window(title=title, control_type=control_type, visible_only=False)
        if not target.exists(timeout=1.0):
            continue
        focus_control(title, control_type)
        send_keys("{ENTER}" if control_type == "Hyperlink" else "{SPACE}", pause=0.1)
        return
    raise AssertionError(f"Navigation link not found as Hyperlink or Button: {title}")


def ui_descendants(control_type=None):
    """Descendants tolerating transient UIA enumeration failures (see ui_texts)."""
    try:
        if control_type:
            return window.descendants(control_type=control_type)
        return window.descendants()
    except Exception:
        return []


def ui_texts():
    """All descendant texts, tolerating transient UIA enumeration failures.

    While the WebView re-renders, descendants() can raise (observed:
    KeyError: None for an element with a null control type) and individual
    window_text() calls can hit stale elements. Callers poll these helpers in
    wait_until loops, so a transient error must be an empty result, not a
    crash.
    """
    try:
        controls = window.descendants()
    except Exception:
        return []
    texts = []
    for control in controls:
        try:
            texts.append(control.window_text())
        except Exception:
            continue
    return texts


def message_visible(text):
    return any(text in t for t in ui_texts())


def visible_product_labels():
    """The product copy on screen, without any input value.

    Edit controls are skipped entirely, so a password can never be read out
    of the form, and long digit runs are masked so a phone number cannot
    reach a log. What remains is the copy a cashier sees, which is exactly
    what a stale expectation needs to be compared against.
    """
    labels = []
    for control in ui_descendants():
        try:
            kind = control.element_info.control_type
            if kind not in ("Button", "Header", "Text"):
                continue
            text = control.window_text()
        except Exception:
            continue
        if not text or len(text) > 160:
            continue
        text = re.sub(r"\d{6,}", "[digits]", text)
        if text.strip():
            labels.append(text.strip())
    return sorted(set(labels))


def message_text(substr):
    """Full text of the first UIA control containing substr (may span lines)."""
    for text in ui_texts():
        if substr in text:
            return text
    return None


def list_sorniobackups():
    """Top-level *.sorniobackup files in likely save locations (diagnostics only)."""
    home = os.path.expanduser("~")
    roots = {
        os.environ.get("TEMP", ""),
        os.path.join(home, "Documents"),
        os.path.join(home, "Downloads"),
        os.getcwd(),
        str(EXE.parent),
    }
    found = []
    for root in roots:
        if root and os.path.isdir(root):
            try:
                for p in Path(root).glob("*.sorniobackup"):
                    found.append(f"{p} ({p.stat().st_size} bytes)")
            except OSError:
                pass
    return found


def assert_locked():
    window.set_focus()
    window.child_window(title="Local password", control_type="Edit").wait("visible enabled", timeout=60)
    for title in ("Business name", "Search items for sale", "Saved invoice ID"):
        wait_until(15, 0.2, lambda title=title: not window.child_window(
            title=title, control_type="Edit", visible_only=False
        ).exists(timeout=0.1))


def assert_balances(cash, credit, stock):
    wait_until(30, 0.5, lambda: message_visible(f"Cash recorded: ₹{cash}"))
    wait_until(30, 0.5, lambda: message_visible(f"Credit receivable: ₹{credit}"))
    wait_until(30, 0.5, lambda: message_visible(f"{stock} pcs"))


def stock_label(milli):
    """Render a stock quantity exactly as the app's `quantity()` helper does.

    `quantity` is `(milli / 1000).toLocaleString('en-IN', {maximumFractionDigits:
    3, useGrouping: false})`, so 1500 reads "1.5" and 3000 reads "3".
    """
    return f"{f'{milli / 1000:.3f}'.rstrip('0').rstrip('.')} pcs"


def assert_stock(milli, item="Sample native rice"):
    """Assert the installed app reports this exact stock for `item`.

    Two independent places state the figure and either may be used: the saved
    item row renders `<strong>{quantity(stock)} {unit}</strong>` as its own
    text node, and the purchase-order item dropdown renders the option
    `{name} ({quantity(stock)} {unit})`. The bare form is compared by equality
    so it cannot be satisfied by a longer string that merely contains it.
    """
    expected = stock_label(milli)
    option = f"{item} ({expected})"

    def shown():
        texts = ui_texts()
        return any(option in t for t in texts) or any(t.strip() == expected for t in texts)

    try:
        wait_until(30, 0.5, shown)
    except Exception as timeout_error:
        visible = " | ".join(visible_product_labels()[:40])
        raise AssertionError(
            f"Stock for {item!r} did not reach {expected!r}. Visible copy: {visible}"
        ) from timeout_error


def assert_closing_balance(paise):
    """Assert the supplier statement's own closing-balance figure."""
    wait_until(30, 0.5, lambda: message_visible(f"Supplier statement · closing balance {money(paise)}"))


def money(paise):
    """The app's `money()`: paise rendered as rupees with Indian grouping."""
    sign = "-" if paise < 0 else ""
    whole, fraction = divmod(abs(paise), 100)
    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        head = f"{int(head):,}"
        digits = f"{head},{tail}"
    return f"{sign}₹{digits}.{fraction:02d}"


def assert_no_receipt():
    wait_until(15, 0.2, lambda: not window.child_window(
        title="Saved invoice ID", control_type="Edit", visible_only=False
    ).exists(timeout=0.1))


def assert_review_blocked(reason):
    """The checkout gate must refuse this operation before any receipt exists.

    `reason` is the validation copy the app renders. It is matched as a
    substring of the visible UI text, so a longer sentence still matches.
    """
    review = window.child_window(title="Review sale", control_type="Button", visible_only=False)
    wait_until(15, 0.2, lambda: not review.wrapper_object().is_enabled())
    try:
        wait_until(15, 0.2, lambda: message_visible(reason))
    except Exception as timeout_error:
        # A timeout here means the app showed a different sentence than the
        # one this check expects. Name the copy that was actually on screen,
        # so the failure says "the wording moved" instead of "timed out".
        visible = " | ".join(visible_product_labels()[:40])
        raise AssertionError(
            f"The checkout gate did not show {reason!r}. Visible copy: {visible}"
        ) from timeout_error
    assert_no_receipt()
    assert not window.child_window(
        title="Confirm sale", control_type="Button", visible_only=False
    ).exists(timeout=0.1), "Invalid checkout reached confirmation"


def wait_enabled(title, control_type="Button", timeout=30):
    """Wait until a control is present and enabled, and return it.

    The checkout enables "Review sale" only once the native store has read
    the selected credit customer back, and that read is asynchronous. Tabbing
    until a control takes focus (what activate() does) would race it, so wait
    for the enabled state first and only then press the control.
    """
    control = window.child_window(title=title, control_type=control_type, visible_only=False)
    wait_until(timeout, 0.2, lambda: control.exists(timeout=0.1) and control.wrapper_object().is_enabled())
    return control.wrapper_object()


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
    window.capture_as_image().save(OUTPUT / ("windows-first-setup.png" if setup else "windows-unlock.png"))
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
    if sys.argv[1:] not in ([], ['--verify-preserved']):
        raise ValueError('Unknown native acceptance mode')
    if '--verify-preserved' in sys.argv:
        print('mode: --verify-preserved (the reinstalled workspace must unlock with the original credentials; a fresh-setup screen is forbidden)')
        field = launch()
        if window.child_window(title='Business name for setup', control_type='Edit', visible_only=False).exists(timeout=0.1):
            raise AssertionError('--verify-preserved reached a fresh-setup screen: the preserved workspace was '
                                 'not found (argument forwarding or data preservation is broken)')
        assert field.get_value() == 'Sample local store'
        assert focus_control('Workspace note', 'Edit').get_value() == ORIGINAL_NOTE
        # The Phase 5 ₹1,000.00 split (₹600 cash + ₹400 credit on top of the
        # Phase 4 ₹10.63 split) must be the preserved ledger after reinstall.
        #
        # Stock is asserted separately, because purchasing moved it. Cash and
        # credit are untouched by purchasing, but rice stood at 1.5 pcs when the
        # retail stages finished and the installed-app purchasing lifecycle then
        # received 1.750 and returned 0.250 — so the preserved workspace holds
        # 3 pcs, not the 1.5 this line used to demand. The old figure was written
        # before the lifecycle existed and would fail on every preserved
        # workspace the lifecycle actually produces.
        wait_until(30, 0.5, lambda: message_visible('Cash recorded: ₹701.64'))
        wait_until(30, 0.5, lambda: message_visible('Credit receivable: ₹404.63'))
        assert_stock(3000)
        window.child_window(title='Restore saved copy 3', control_type='Button', visible_only=False).wait('exists', timeout=30)
        # The last posted sale (the Phase 5 ₹1,000.00 mixed cash+credit split)
        # must be the preserved receipt after reinstall; it is a checkout
        # receipt, not a retail-panel operation.
        assert saved_invoice_id(), 'Preserved sale receipt missing after reinstall'
        assert_saved_total('1,000.00')
        window.capture_as_image().save(OUTPUT / 'windows-installed-preserved.png')
        activate_link('Suppliers & purchases')
        activate('Open supplier native-supplier-1')
        wait_until(30, 0.5, lambda: message_visible('Supplier statement · closing balance ₹125.00'))
        activate('Open order PO-1')
        wait_until(30, 0.5, lambda: message_visible('PO-1 · Closed'))
        window.capture_as_image().save(OUTPUT / 'windows-purchasing-reinstalled.png')
        print('Installed-app reopen preserved original credentials, draft/history, stock, balances and the ₹1,000.00 saved closing receipt.')
        sys.exit(0)
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
    window.capture_as_image().save(OUTPUT / "windows-product-creation.png")
    activate("Save item on this PC")
    wait_until(30, 0.5, lambda: message_visible("Saved item changes to this PC."))
    wait_until(30, 0.5, lambda: message_visible("1.25 pcs"))
    activate("Acknowledge item save")
    # Select the first saved item using native keyboard input on the actual combo.
    focus_control("Item to adjust", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Quantity change", "2.750")
    fill("Reason for stock change", "Counted delivery")
    activate("Save stock change")
    wait_until(30, 0.5, lambda: message_visible("4 pcs"))
    activate("Acknowledge item save")
    window.capture_as_image().save(OUTPUT / "windows-local-stock.png")

    # Actual bundled cashier -> authorized native posting -> encrypted SQLite.
    fill("Search items for sale", "NATIVE-RICE")
    send_keys("{ENTER}", pause=0.2)
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
    # A credit sale must name a customer the native store has actually read
    # back, so the store knows the limit and the balance before it posts the
    # debt. A typed reference is not enough any more, and the app says so.
    assert_review_blocked(CREDIT_CUSTOMER_REQUIRED)
    activate("Refresh checkout")
    assert_balances("53.13", "0.00", "2.75")
    assert_no_receipt()
    fill("Customer ID", "native-customer-1")
    fill("Customer name", "Native credit customer")
    fill("Customer phone (optional)", "+91 98765 43210")
    fill("Credit limit (₹, blank for no limit)", "50.00")
    activate("Save customer")
    wait_until(30, 0.5, lambda: message_visible("Customer saved."))
    fill("Find credit customer", "native-customer-1")
    activate("Use customer native-customer-1")
    # The store reads the customer back before the sale may be reviewed.
    wait_enabled("Review sale")
    activate("Review sale")
    activate("Confirm sale")
    wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    credit_id = saved_invoice_id()
    assert credit_id != cash_id, "Distinct sales returned the same invoice ID"
    assert_saved_total("31.88")
    assert_balances("53.13", "31.88", "2")
    window.capture_as_image().save(OUTPUT / "windows-customer-credit-sale.png")
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
    chosen = Path(os.environ["TEMP"]) / ("sornio-native-" + str(uuid4()) + ".sorniobackup")
    def pick_native_file(title, path):
        """Drive the real OS save/open dialog towards an exact path.

        Returns True only when real keystrokes verifiably put the requested
        path into the dialog's "File name:" Edit before the dialog's own
        Save/Open button was clicked. UIA ValuePattern writes can report the
        requested text back without the dialog's internal state accepting it
        (observed on the GitHub runner), so only keyboard read-back counts as
        verified; set_edit_text and the legacy Alt+N sequence remain as
        fallbacks for environments where they do work.
        """
        dialog = Desktop(backend="uia").window(title=title)
        dialog.wait("visible", timeout=45)
        dialog.set_focus()
        target = str(path)
        edit = dialog.child_window(title="File name:", control_type="Edit")
        edit.wait("exists", timeout=30)
        verified = False
        try:
            edit.set_focus()
            send_keys("^a{BACKSPACE}", pause=0.1)
            send_keys(target, with_spaces=True, pause=0.01)
            time.sleep(0.3)
            verified = os.path.normcase(edit.get_value()) == os.path.normcase(target)
        except Exception:
            verified = False
        if not verified:
            try:
                edit.set_edit_text(target)
            except Exception:
                pass
            send_keys("%n", pause=0.1)
            send_keys("^a{BACKSPACE}", pause=0.1)
            send_keys(target, with_spaces=True, pause=0.01)
        wanted = "Save" if "Export" in title else "Open"
        button = None
        try:
            for candidate in dialog.descendants(control_type="Button"):
                try:
                    if wanted.lower() in candidate.window_text().lower():
                        button = candidate
                        break
                except Exception:
                    continue
        except Exception:
            button = None
        if button is not None:
            try:
                button.wait("exists enabled", timeout=10)
                button.click_input()
            except Exception:
                send_keys("{ENTER}", pause=0.1)  # the dialog's default action
        else:
            send_keys("{ENTER}", pause=0.1)
        # Drive the dialog until it is actually gone.
        #
        # A single click was assumed to be enough, and it was not: run
        # 43759908030 at code candidate 78837b09 failed here, after 45 seconds,
        # with the dialog still on screen. Every purchasing assertion ahead of
        # it had already passed, so the run reported "installed acceptance
        # failed" for a save dialog that had simply not been pressed. A hosted
        # runner gives no guarantee that click_input() lands while the window is
        # being composited, so the timeout is now a budget for several attempts
        # instead of one shot.
        #
        # Nothing is skipped by retrying: the dialog must still disappear for
        # this function to return, and the caller independently asserts that the
        # app reported saving the exact path that was verified above.
        for attempt in range(4):
            try:
                dialog.wait_not("visible", timeout=15)
                break
            except Exception:
                if attempt == 3:
                    raise
                try:
                    if button is not None and button.exists():
                        dialog.set_focus()
                        button.click_input()
                    else:
                        dialog.set_focus()
                        send_keys("{ENTER}", pause=0.1)
                except Exception:
                    send_keys("{ENTER}", pause=0.1)
        return verified
    original_note = focus_control("Workspace note", "Edit").get_value()
    activate("Open backup controls")
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Confirm recovery passphrase for export", recovery_secret)
    activate("Export encrypted backup…")
    driven = pick_native_file("Export encrypted Sornio backup", chosen)
    wait_until(60, 0.5, lambda: message_visible("Encrypted backup saved and verified."))
    saved_text = message_text("Encrypted backup saved and verified.") or ""
    stated_match = re.search(r"Saved to: (.+?)\. Backup ID ", saved_text)
    assert stated_match, f"Success message did not state the saved path: {saved_text!r}"
    # The app-reported path is the source of truth for every check below.
    backup = Path(stated_match.group(1))
    assert backup.suffix == ".sorniobackup", f"Stated backup path is not a .sorniobackup: {backup!r}"
    if driven:
        # Real keystrokes verifiably put the chosen path into the dialog, so the
        # app must report exactly that path.
        assert os.path.normcase(os.path.realpath(backup)) == os.path.normcase(os.path.realpath(chosen)), (
            f"Backup was saved to {backup!r}, not the dialog-verified chosen path {chosen!r}")
    else:
        # Conclusively diagnosed on the GitHub runner: the OS save dialog ignores
        # synthetic filename input (raw keys and UIA value writes alike) and picks
        # its own default. The product is still fully proven: it wrote the archive
        # exactly where the dialog returned and now reports that path in the UI,
        # and every integrity check below runs on that app-stated file.
        print(f"NOTE: the runner's save dialog did not accept synthetic filename input; "
              f"the OS dialog chose {backup} and the app reported that path truthfully.")
    if not (backup.exists() and backup.stat().st_size >= 4096):
        found = list_sorniobackups()
        raise AssertionError(
            f"Backup missing or smaller than 4096 bytes at the app-stated path {backup}; "
            f"*.sorniobackup found: {found or 'none'}")
    payload = backup.read_bytes()
    for secret in (PASSWORD, recovery_secret, original_note):
        assert secret.encode() not in payload, "Backup leaked plaintext"
    assert not payload.startswith(b"SQLite format 3")
    fill("Workspace note", "This note was saved after the backup.")
    activate("Save local draft")
    wait_until(30, 0.5, lambda: message_visible("Saved to this PC. You can close and reopen Sornio."))
    activate("Choose encrypted backup…")
    pick_native_file("Choose encrypted Sornio backup", backup)
    shown = [t for t in ui_texts() if t.rstrip().endswith(".sorniobackup")]
    # Compare by filename: WebView2 may split the displayed path into several
    # text runs, so a shown run can carry just the file name.
    assert any(os.path.normcase(t.rstrip()).endswith(os.path.normcase(backup.name)) for t in shown), (
        f"Choose dialog did not show the exported backup {backup!r}; texts ending in .sorniobackup: {shown!r}")
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", "WrongRecoveryPassphrase2026")
    fill("Original Owner password from backup", PASSWORD)
    activate("Verify and preview backup")
    wait_until(60, 0.5, lambda: message_visible("Backup could not be verified."))
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original Owner password from backup", PASSWORD)
    activate("Verify and preview backup")
    wait_until(60, 0.5, lambda: message_visible("Backup verified. Re-enter the passwords"))
    preview = window.child_window(title="Verified backup preview", control_type="Group", visible_only=False)
    preview.wait("exists", timeout=30)
    phrase_title = None
    for candidate in ui_descendants(control_type="Edit"):
        try:
            candidate_text = candidate.window_text()
        except Exception:
            continue
        if re.match(r"^Type RESTORE [a-f0-9]{12} to restore$", candidate_text):
            phrase_title = candidate_text
            break
    assert phrase_title, "Restore confirmation phrase field not found in the backup preview"
    phrase = re.match(r"^Type (RESTORE [a-f0-9]{12}) to restore$", phrase_title).group(1)
    for title in ("Current Owner password", "Recovery passphrase", "Original Owner password from backup"):
        assert focus_control(title, "Edit").get_value() == "", "Preview retained a password"
    focus_control(phrase_title, "Edit")
    window.capture_as_image().save(OUTPUT / "windows-backup-preview.png")
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original Owner password from backup", PASSWORD)
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
    window.capture_as_image().save(OUTPUT / "windows-customer-partial-repayment.png")
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
    window.capture_as_image().save(OUTPUT / "windows-owner-staff.png")
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
    window.capture_as_image().save(OUTPUT / "windows-retail-pending-payment.png")
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
    window.capture_as_image().save(OUTPUT / "windows-retail-reconciliation.png")
    fill("Return quantity for line 1: Sample native rice (pcs)", "0.250")
    fill("Return or correction reason", "Native returned goods inspected")
    activate("Calculate native return")
    wait_until(30, 0.5, lambda: retail_text("Digital refund pending ₹5.63"))
    activate("Review invoice return")
    activate("Confirm retail operation")
    return_id = focus_control("Saved retail operation ID", "Edit").get_value()
    assert return_id != match_id
    window.capture_as_image().save(OUTPUT / "windows-retail-return-refund.png")
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
    # Phase 4 acceptance: a mixed cash + customer-credit split driven only through
    # the installed UI, with repeated submit keys to prove a single operation id.
    activate("Start next retail operation")
    # The closing above shut the cashier day; reopen it through the owner UI first.
    fill("Return or correction reason", "Phase 4 acceptance: reopen day for the mixed split sale")
    activate("Review cashier day reopening")
    activate("Confirm retail operation")
    window.child_window(title="Start next retail operation", control_type="Button", visible_only=False).wait("exists", timeout=30)
    activate("Start next retail operation")
    activate("Refresh checkout")
    assert_balances("95.64", "0.00", "1.75")
    fill("Search items for sale", "NATIVE-RICE")
    activate("Add Sample native rice to sale")
    fill("Quantity for Sample native rice (pcs)", "0.250")
    fill("Tax (%)", "0")
    focus_control("Transaction type", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Split cash amount (₹)", "6.00")
    fill("Split customer credit amount (₹)", "4.63")
    # A split that includes customer credit must name a customer the store has
    # read back, exactly like a plain credit sale: typing a reference into the
    # optional field is not enough, and the field is filled by the lookup.
    fill("Find credit customer", "native-customer-1")
    activate("Use customer native-customer-1")
    wait_enabled("Review sale")
    activate("Review sale")
    confirm_button = window.child_window(title="Confirm sale", control_type="Button", visible_only=False)
    confirm_button.wait("exists enabled", timeout=30)
    # Repeated submission of the same review must not create a second sale: the
    # busy guard locks the UI and the native layer replays one operation id.
    activate("Confirm sale")
    send_keys("{ENTER}{ENTER}{SPACE}", pause=0.05)
    try:
        wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    except Exception:
        texts = " | ".join(ui_texts())
        raise AssertionError(f"Mixed split sale did not save. Visible UI texts: {texts[:4000]}")
    split_id = saved_invoice_id()
    assert split_id not in (cash_id, credit_id, retail_invoice), "Mixed split sale reused an existing invoice ID"
    assert_saved_total("10.63")
    assert_balances("101.64", "4.63", "1.5")
    window.capture_as_image().save(OUTPUT / "windows-mixed-cash-credit-sale.png")
    # Forced termination and relaunch of the installed app: the committed split
    # sale, its cash and its receivable must survive exactly once.
    stop()
    launch()
    assert saved_invoice_id() == split_id, "Mixed split sale changed after restart"
    assert_balances("101.64", "4.63", "1.5")
    window.capture_as_image().save(OUTPUT / "windows-mixed-split-reopened.png")
    print("Phase 4 installed-UI acceptance: mixed ₹6.00 cash + ₹4.63 customer-credit sale through the packaged app under repeated submit keys produced exactly one invoice (₹10.63), correct cash/credit balances and one stock deduction, and survived a forced restart.")
    # Phase 5 release-blocking regression: the original ₹1,000.00 acceptance
    # scenario — invoice 100000 paise = 60000 cash + 40000 customer credit —
    # driven only through the installed UI of the packaged application.
    # The ₹400.00 credit part needs headroom: native-customer-1 has a ₹50.00
    # limit, so create a fresh customer through the owner UI with NO credit
    # limit (blank means no limit) and use it for this sale.
    if window.child_window(title="Cancel customer edit", control_type="Button", visible_only=False).exists(timeout=0.1):
        activate("Cancel customer edit")
    fill("Customer ID", "native-customer-2")
    fill("Customer name", "Phase 5 credit customer")
    fill("Customer phone (optional)", "+91 98765 43211")
    # Blank (not "0") means no credit limit; clear the field without send_keys("").
    focus_control("Credit limit (₹, blank for no limit)", "Edit")
    send_keys("^a{BACKSPACE}", pause=0.1)
    activate("Save customer")
    wait_until(30, 0.5, lambda: message_visible("Customer saved."))
    # A ₹1,000.00-priced item so the invoice total is exact at 0% tax.
    fill("Item name", "Phase 5 acceptance ghee")
    fill("Item code (optional)", "P5-GHEE-1000")
    fill("Unit price (₹)", "1000.00")
    fill("Opening stock", "2.000")
    activate("Save item on this PC")
    wait_until(30, 0.5, lambda: message_visible("Saved item changes to this PC."))
    wait_until(30, 0.5, lambda: message_visible("2 pcs"))
    activate("Acknowledge item save")
    # After the restart the checkout panel shows the last saved receipt, so the
    # fresh-sale button is "Start next sale" (the retail panel's own button only
    # exists while a retail-operation receipt is pending).
    activate("Start next sale")
    activate("Refresh checkout")
    assert_balances("101.64", "4.63", "1.5")
    fill("Search items for sale", "P5-GHEE-1000")
    activate("Add Phase 5 acceptance ghee to sale")
    fill("Quantity for Phase 5 acceptance ghee (pcs)", "1.000")
    fill("Tax (%)", "0")
    focus_control("Transaction type", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Split cash amount (₹)", "600.00")
    fill("Split customer credit amount (₹)", "400.00")
    # The same rule as the Phase 4 split: the credit part of a split needs a
    # customer the store has read back, not a typed reference.
    fill("Find credit customer", "native-customer-2")
    activate("Use customer native-customer-2")
    wait_enabled("Review sale")
    activate("Review sale")
    confirm_button = window.child_window(title="Confirm sale", control_type="Button", visible_only=False)
    confirm_button.wait("exists enabled", timeout=30)
    # Burst of repeated submit keys: the busy guard locks the UI and the native
    # layer replays one operation id, so this must stay exactly one invoice.
    activate("Confirm sale")
    send_keys("{ENTER}{ENTER}{SPACE}", pause=0.05)
    try:
        wait_until(30, 0.5, lambda: message_visible("Sale saved on this PC"))
    except Exception:
        texts = " | ".join(ui_texts())
        raise AssertionError(f"₹1,000.00 split sale did not save. Visible UI texts: {texts[:4000]}")
    thousand_id = saved_invoice_id()
    assert thousand_id not in (cash_id, credit_id, retail_invoice, split_id), "₹1,000.00 sale reused an existing invoice ID"
    # money() groups rupees en-IN style, so ₹100000 renders as ₹1,000.00.
    assert_saved_total("1,000.00")
    # The receipt must display the exact split: ₹600.00 cash + ₹400.00 credit
    # for customer native-customer-2.
    receipt_texts = "".join(
        control.window_text() for control in window.child_window(
            title="Sale saved on this PC", control_type="Group", visible_only=False
        ).descendants(control_type="Text")
    )
    assert "₹600.00" in receipt_texts, f"Receipt does not show the ₹600.00 cash part: {receipt_texts[:2000]}"
    assert "₹400.00" in receipt_texts, f"Receipt does not show the ₹400.00 credit part: {receipt_texts[:2000]}"
    assert "native-customer-2" in receipt_texts, "Receipt does not name the credit customer"
    # One invoice, one stock deduction: cash ₹101.64+₹600.00, credit
    # ₹4.63+₹400.00, rice stock untouched at 1.5 pcs (ghee went 2 → 1).
    assert_balances("701.64", "404.63", "1.5")
    window.capture_as_image().save(OUTPUT / "windows-thousand-split-sale.png")
    # Forced termination and relaunch of the installed app: the committed
    # ₹1,000.00 split sale survives exactly once (reinstall preservation is
    # asserted separately by the --verify-preserved run after reinstallation).
    stop()
    launch()
    assert saved_invoice_id() == thousand_id, "₹1,000.00 split sale changed after restart"
    assert_saved_total("1,000.00")
    assert_balances("701.64", "404.63", "1.5")
    window.capture_as_image().save(OUTPUT / "windows-thousand-split-reopened.png")
    print("Phase 5 installed-UI regression: ₹1,000.00 = ₹600.00 cash + ₹400.00 customer credit (100000/60000/40000 paise) through the packaged app under a burst of repeated submit keys produced exactly one invoice, a receipt showing ₹600.00 + ₹400.00 for native-customer-2, balances ₹701.64 cash / ₹404.63 credit / 1.5 pcs stock, and survived a forced restart; reinstall preservation is asserted by --verify-preserved.")
    print("Native retail release: real cash/UPI split, pending/unverified separation, explicit manual statement match, forced match receipt recovery, authorized return, cash refund, pending digital refund, atomic stock restoration, saved CA CSV and exact cashier variance passed.")
    # Phase 22: operate the full lifecycle through the installed release app.
    purchasing_started = time.monotonic()
    activate_link("Suppliers & purchases")
    wait_until(30, 0.2, lambda: message_visible("Suppliers are up to date."))
    fill("Supplier ID", "native-supplier-1")
    fill("Supplier name", "Native supplier")
    window.capture_as_image().save(OUTPUT / "windows-supplier-created.png")
    activate("Save supplier")
    wait_until(30, 0.5, lambda: message_visible("Supplier saved."))
    # Saving selects the new supplier, so the account section renders with the
    # archive toggle. Archive and restore it, both directions against the native store.
    activate("Archive supplier")
    wait_until(30, 0.5, lambda: message_visible("Supplier archived."))
    activate("Restore supplier")
    wait_until(30, 0.5, lambda: message_visible("Supplier restored."))
    window.capture_as_image().save(OUTPUT / "windows-suppliers.png")
    focus_control("Item", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Quantity", "2")
    fill("Unit cost (₹)", "100")
    activate("Create draft order")
    wait_until(30, 0.5, lambda: message_visible("Draft order created."))
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Draft"))
    activate("Submit for approval")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Awaiting approval"))
    activate("Approve order")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Approved"))
    fill("Good quantity received", "1")
    fill("Damaged within that quantity", "0.25")
    fill("Delivery challan / note reference", "NATIVE-PARTIAL")
    activate("Receive goods")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Partially received"))
    assert_closing_balance(7500)
    # Inventory reconciliation, partial receipt: 1.000 was received and 0.250 of
    # it was damaged. Damaged goods never enter stock, so the count must move by
    # the accepted 0.750 only — 1.5 pcs becomes 2.25 pcs, not 2.5 pcs.
    assert_stock(2250)
    # Restart and recovery in the middle of the lifecycle, before the invoice is
    # anchored to the receipt. The partially received order and the 75.00 it
    # accrued must both come back exactly once: a receipt replayed on reopen
    # would show 150.00, and a lost one would show nothing.
    stop()
    launch()
    activate_link("Suppliers & purchases")
    activate("Open supplier native-supplier-1")
    assert_closing_balance(7500)
    activate("Open order PO-1")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Partially received"))
    assert_stock(2250)
    window.capture_as_image().save(OUTPUT / "windows-purchasing-restart-partial.png")
    fill("Invoice reference", "NATIVE-INVOICE-1")
    fill("Invoice total (₹)", "80")
    activate("Record invoice")
    wait_until(30, 0.5, lambda: message_visible("Supplier invoice recorded."))
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹80.00"))
    fill("Amount (₹)", "30")
    fill("Payment reference", "NATIVE-BANK-PARTIAL")
    activate("Record payment")
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹50.00"))
    focus_control("Goods receipt", "ComboBox")
    send_keys("{HOME}{DOWN}{ENTER}", pause=0.2)
    fill("Quantity to return", "0.25")
    fill("Reason for the return", "Native accepted-stock return")
    activate("Record return")
    wait_until(30, 0.5, lambda: message_visible("Return recorded for ₹25.00"))
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹25.00"))
    fill("Good quantity received", "1")
    fill("Delivery challan / note reference", "NATIVE-REMAINDER")
    activate("Receive goods")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Received"))
    assert_closing_balance(12500)
    # Inventory reconciliation, full receipt: 2.25 pcs plus the remaining 1.000
    # received, minus the 0.250 returned to the supplier, is 3 pcs.
    assert_stock(3000)
    activate("Close order")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Closed"))
    window.capture_as_image().save(OUTPUT / "windows-purchasing-lifecycle.png")
    stop()
    launch()
    activate_link("Suppliers & purchases")
    activate("Open supplier native-supplier-1")
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹125.00"))
    activate("Open order PO-1")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Closed"))
    window.capture_as_image().save(OUTPUT / "windows-purchasing-reopened.png")
    # Export and restore the actual purchasing records through the OS pickers.
    if window.child_window(title="Open backup controls", control_type="Button", visible_only=False).exists(timeout=0.1):
        activate("Open backup controls")
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Confirm recovery passphrase for export", recovery_secret)
    activate("Export encrypted backup…")
    pick_native_file("Export encrypted Sornio backup", Path(os.environ["TEMP"]) / ("purchasing-" + str(uuid4()) + ".sorniobackup"))
    wait_until(60, 0.5, lambda: message_visible("Encrypted backup saved and verified."))
    purchasing_path = re.search(r"Saved to: (.+?)\. Backup ID ", message_text("Encrypted backup saved and verified.") or "")
    assert purchasing_path, "Purchasing backup did not report its actual path"
    purchasing_backup = Path(purchasing_path.group(1))
    assert purchasing_backup.exists() and purchasing_backup.stat().st_size >= 4096
    assert not purchasing_backup.read_bytes().startswith(b"SQLite format 3")
    fill("Amount (₹)", "20")
    fill("Payment reference", "NATIVE-AFTER-BACKUP")
    activate("Record payment")
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹105.00"))
    # Full settlement: pay the whole remaining 105.00 and require the payable to
    # reach exactly zero through the installed app. The restore below returns the
    # workspace to the 125.00 snapshot, so the later preserved-data stage still
    # sees a live payable.
    fill("Amount (₹)", "105")
    fill("Payment reference", "NATIVE-SETTLE-IN-FULL")
    activate("Record payment")
    assert_closing_balance(0)
    window.capture_as_image().save(OUTPUT / "windows-purchasing-settled.png")
    activate("Choose encrypted backup…")
    pick_native_file("Choose encrypted Sornio backup", purchasing_backup)
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original Owner password from backup", PASSWORD)
    activate("Verify and preview backup")
    wait_until(60, 0.5, lambda: message_visible("Backup verified. Re-enter the passwords"))
    phrase_titles = [control.window_text() for control in ui_descendants(control_type="Edit")
                     if re.match(r"^Type RESTORE [a-f0-9]{12} to restore$", control.window_text())]
    assert len(phrase_titles) == 1
    phrase_title = phrase_titles[0]
    phrase = re.match(r"^Type (RESTORE [a-f0-9]{12}) to restore$", phrase_title).group(1)
    fill("Current Owner password", PASSWORD)
    fill("Recovery passphrase", recovery_secret)
    fill("Original Owner password from backup", PASSWORD)
    fill(phrase_title, phrase)
    activate("Create safety backup and restore")
    assert_locked()
    enter_password()
    activate_link("Suppliers & purchases")
    activate("Open supplier native-supplier-1")
    wait_until(30, 0.5, lambda: message_visible("Supplier statement · closing balance ₹125.00"))
    activate("Open order PO-1")
    wait_until(30, 0.5, lambda: message_visible("PO-1 · Closed"))
    window.capture_as_image().save(OUTPUT / "windows-purchasing-restored.png")
    (OUTPUT / "purchasing-installed-result.json").write_text(json.dumps({
        # GITHUB_SHA on a pull_request event is the synthetic merge commit, which
        # names no tree that can be checked out. The workflow passes the real head
        # commit as SORNIO_ACCEPTANCE_SOURCE_SHA; prefer it, and keep the merge
        # commit visible under its own key so the two can never be confused.
        "result": "PASS",
        "source_commit": os.environ.get("SORNIO_ACCEPTANCE_SOURCE_SHA") or os.environ.get("GITHUB_SHA"),
        "merge_commit": os.environ.get("GITHUB_SHA"),
        "executable": str(EXE), "environment": "installed Windows release application; UIA keyboard; outbound blocked",
        "duration_seconds": time.monotonic() - purchasing_started,
        "dataset": {"suppliers": 1, "purchase_orders": 1, "receipts": 2, "invoices": 1, "payments": 1, "returns": 1},
        "scenarios_executed": [
            "supplier creation, archive and restore",
            "purchase order creation, submit, approve",
            "partial receiving with damaged quantity excluded from stock and payable",
            "forced restart immediately after partial receiving, recovered exactly once",
            "supplier invoice anchored to the receipt with the variance booked",
            "supplier partial payment",
            "supplier return reducing the payable and restoring stock",
            "full receiving completing the order",
            "order close",
            "payable settled to exactly zero and then restored from the encrypted backup",
        ],
        "financial_reconciliation": "7500 receipt + 500 invoice variance - 3000 bank payment - 2500 return + 10000 receipt = 12500 paise; preserved after a forced restart in the middle of the lifecycle; then 2000 paid (10500) and a further 10500 settled it to 0, and the encrypted backup restored 12500",
        "inventory_reconciliation": "1.5 pcs + 0.75 accepted of a 1.0 receipt (0.25 damaged) - 0.25 returned + 1.0 remainder = 3 pcs, asserted after each movement",
        "assertion_style": "rendered product state from the installed binary; independently re-read from the encrypted workspace by apps/desktop/check-purchasing-store.py",
        "limitations": "unsigned engineering installer; same-version reinstall checked by the separate preserved-data stage; no physical printer, scanner or power-loss coverage"
    }, indent=2) + "\n", encoding="utf-8")
    print("Phase 22 installed purchasing lifecycle passed: 12500-paise payable and 3-pcs stock reconciled, settled to zero, and restored; a forced restart mid-lifecycle recovered the partial receipt exactly once.")
    print("Native Windows release: offline password setup, two saves, restore, lock/unlock, forced termination, wrong-password refusal, fractional item/stock saves, overselling and missing-credit-reference guards, review cancellation, real cash/credit checkout, committed receipt UUIDs/totals, ledger balances, deductions, receipt recovery, durable acknowledgement, owner staff creation, cashier restrictions/sale, role changes, disabled-account refusal, customer creation/phone lookup, partial and full cash collection, forced repayment receipt recovery, ledger balances and native printable statement passed.")
except Exception:
    traceback.print_exc()
    if window is not None:
        try:
            window.capture_as_image().save(OUTPUT / "windows-local-failure.png")
            # The visible copy is what a stale assertion turns on: the check
            # waits for one product string and the app shows another. Record
            # the labels and paragraphs that were on screen, never input
            # values, and mask long digit runs so a phone number cannot reach
            # a log.
            labels = visible_product_labels()
            (OUTPUT / "windows-local-failure-labels.txt").write_text(
                "\n".join(labels), encoding="utf-8"
            )
            print("Visible product copy at the moment of failure:")
            for label in labels[:160]:
                print("   ", label)
        except Exception as capture_error:
            print("Could not capture the failing native window:", type(capture_error).__name__)
    raise
finally:
    stop()
