# Windows cashier keyboard and receipt printing review

Base: merged main `97bfe2f7f93f84ec6a8cd7b2db32a94eb2f712c6`.
This is standalone offline receipt usability, not a complete GST/staff/LAN release.
No financial engine, database migration, tax, inventory or posting logic changes.

## Cashier workflow

F2 selects the item search. Enter adds a single name match or a unique exact
case-insensitive item code. A keyboard-wedge scanner can type the existing item
SKU followed by Enter into that field; no global keystroke capture is installed.
Repeated scans increment an existing item's quantity by one unit, within cached
stock bounds. Ambiguous codes require selection; native posting still enforces
actual inventory and prices. Scanner firmware, suffix, keyboard layout and
physical hardware remain untested. No separate EAN/UPC registry is claimed.

F3 selects the last quantity; Enter returns to search. F4 opens the existing sale
review and focuses Confirm; Enter confirms explicitly. F8 retries only the
existing durable operation, never assigning a new ID. Repeated function-key
keydown and IME composition are ignored. Start-next-sale focus waits until native
read/busy completion, so a disabled field cannot swallow keyboard entry.

Find saved receipt pages through the existing authorized native invoice read API
(100 per page, oldest first). Selecting and printing a historical record performs
no checkout preparation or posting. Locking removes the receipt and print copy.
Main currently has shared local-password access, not individual staff roles; this
change grants no new native capabilities or permissions. Integrate staff roles
from their actual merged engine before staff-enabled release.

## Printing

Print saved receipt / Ctrl+P inside the receipt clones its rendered saved record
into a print-only section. Print code has no IPC or posting access. A4, 58 mm and
80 mm modes provide content width/margin presets; the Windows driver must select
matching media and supports the actual roll length, margins and pagination.
There are no raw ESC/POS, drawer, cutter or direct-USB commands. No iframe, new
window permission, external service or CSP relaxation is required. Screen IDs
are stripped from the clone and financial values are copied, not recalculated.

A cancelled dialog or afterprint event is not proof of successful paper output.
The UI asks the cashier to inspect the printer/PDF and retry the same receipt.
A print exception preserves the saved invoice. Print copies are cleared when
leaving/locking the receipt; printing again cannot create an invoice.

The old invoice schema does not snapshot business identity, discounts, GST
components or bank settlement. Current saved workspace name is explicitly labeled
as a current shop label, not historic invoice identity. Discounts are described
as unrecorded, cash/credit follows the native record, and no GST-compliance or
bank-settlement claim is added. No LAN status is invented: main has no LAN engine;
its explicit status says offline on this PC/no hub. Existing uncertain-operation
messages and retry/restart recovery remain authoritative.

## English and Punjabi

Reuses `lib/i18n.tsx` and its same-origin catalogue and formatting architecture.
A small desktop Punjabi catalogue translates selected checkout/receipt labels;
this is not full Punjabi coverage or professional translation approval. Financial
item text is excluded from translation. An 11,400-byte OFL-licensed Gurmukhi font
is bundled for offline glyphs; the license accompanies it. Locale is the only
browser-stored preference; receipts, drafts and credentials remain native.
Vite deduplicates React when consuming the shared provider.

## Verification and limits

The existing React-to-Rust/SQLCipher acceptance was expanded: keyboard-only
checkout under 4x Chromium CPU throttling; explicit print failure; retries of all
three layouts; print-media isolation; Punjabi catalogue/font loading; historical
receipt reopen; no extra posting; unchanged native invoice list; lock cleanup;
existing lost prepare/post replies, process restart, stock races and responsive
checks. It runs in the existing browser Actions workflow. Windows UIA now enters
the first code through the search field with the Enter scanner suffix.

Four local instrumented keyboard-only samples completed in 508, 535, 537 and
584 ms under 4x CPU throttling (median 536 ms; final-head sample 584 ms), excluding human typing time. This is not
a before/after speed comparison or evidence of shop-PC latency. It eliminates
three pointer-target actions (Add, Review, Confirm) in that exact-code test.
No animations, timers, background polling or third-party runtime packages were
added. The result list remains capped at 50 visible matches.

Local TypeScript, production Vite build, JavaScript/Python syntax and diff checks
passed. The partial local source snapshot lacks the repository's binary brand
icon; its build/browser review used an existing local icon fixture, never
committed. Exact packaged Windows acceptance remains required. Local browser
was headless Chromium 153; CI uses the repository's independently pinned browser.
Generated PDFs verify layout software only. No physical A4, 58/80 mm printer,
Windows print dialog, driver failure/out-of-paper, barcode scanner, cash drawer,
thermal durability or actual low-cost PC was tested. Gurmukhi glyphs were visually
inspected after the bundled font fixed missing-glyph boxes in the test browser.

Do not claim production readiness or merge automatically. Actual Windows and
printer/peripheral acceptance, staff/LAN integration and legally complete invoice
identity/tax support remain release gates.
