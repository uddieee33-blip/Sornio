# Thermal Receipt Printer & Cash Drawer Test Procedure

**Prerequisites:**
1. Complete `README.md` Section 2 offline installation and confirm Windows **Print Spooler** service (`Get-Service Spooler`) is `Running`.
2. Install the vendor's Windows print driver for the physical thermal printer (80 mm and/or 58 mm) and load thermal paper roll.
3. Disconnect Wi-Fi and Ethernet before starting.
4. Capture evidence for every test ID per [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md) (CI logs or browser print previews cannot substitute for physical printed thermal paper).

> **Unsupported Hardware Boundary:** Sornio `0.4.0` prints through the Windows Print Spooler (`window.print()`) and **does not** emit raw ESC/POS USB/TCP/serial commands directly. Electronic cash-drawer opening requires an RJ11 cash drawer connected to a thermal printer whose Windows driver triggers drawer kick on print. Standalone USB-serial or proprietary-API cash drawers are **unsupported**; use `Manual key-opened drawer` or `No cash drawer` mode (`CD3`).

| Bench Hardware | Recorded Model / Driver / Port |
|---|---|
| 80 mm Thermal Printer (Model / Driver Version / USB or LAN Port) | |
| 58 mm Thermal Printer (Model / Driver Version / Port — or `Not Used`) | |
| Cash Drawer Model & RJ11 Pin (`Pin 2` / `Pin 5` / `Manual` / `None`) | |

---

## Part A — Thermal Receipt Printer Acceptance (`PR1`–`PR7`)

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Evidence Ref (Photo / Log) |
|---|---|---|---|---|---|
| **PR1** | **Printer discovery & timeout resilience** | Open **Business & settings → Counter hardware & receipt defaults**, click **Refresh printers**. Select the thermal printer, choose `80mm` or `58mm`, save, then restart Sornio. | Printer appears in dropdown with accurate default/status label; selection persists across app restart. | `NOT RUN` | |
| **PR2a** | **80 mm English receipt print** | Set roll width to `80mm`; complete a 3-item Cash sale (`Hero Ranger 26T Mountain Bicycle` + `Kids Safety Helmet` + `Alloy Bicycle Bell`). Click **Show print preview**, verify layout, then click **Print saved receipt** with 80 mm paper selected in Windows print dialog. *(Mark `BLOCKED` if no 80 mm printer is available.)* | Receipt prints cleanly on physical 80 mm thermal roll with zero clipped right-hand totals, exact `₹` paise formatting, timestamp (IST), and non-GST disclaimer. | `NOT RUN` | |
| **PR2b** | **58 mm English receipt print** | Set roll width to `58mm`; repeat the 3-item Cash sale and print on a physical 58 mm thermal roll. *(If target pilot shop uses strictly 80 mm hardware, record `BLOCKED` / `NOT APPLICABLE (80 mm shop only)` and do not claim 58 mm compatibility.)* | Receipt prints cleanly on physical 58 mm thermal roll with zero clipped prices, intact wrapped item lines, and readable totals. | `NOT RUN` | |
| **PR3** | **Gurmukhi (`ਪੰਜਾਬੀ`) receipt print** | Switch receipt language to `ਪੰਜਾਬੀ` (`pa`) and print a saved mixed Cash + UPI sale on the physical thermal printer (test both 80 mm and 58 mm if both are in scope). | Gurmukhi headings (`ਸੰਭਾਲੀ ਰਸੀਦ`, `ਕੁੱਲ ਰਕਮ`, `ਨਕਦ ਪ੍ਰਾਪਤ`) render legibly on thermal paper via bundled `Noto Sans Gurmukhi` with zero missing glyphs (`□□□`). | `NOT RUN` | |
| **PR4** | **Long names & 25-line invoice** | Create 1 temporary long-name product (`Kids Deluxe Folding 3-in-1 Musical Steel Tricycle with Canopy & Push Bar`) plus enough distinct bench items (in addition to the 11 items from `pilot-starter-catalog.csv`) to build a 25-line invoice mixing cycles, toys, and loose spares; post and print. | Long product names wrap cleanly without overwriting prices; continuous roll feeds cleanly with intact footer totals. | `NOT RUN` | |
| **PR5** | **Marked reprints & zero financial duplication** | Click **Find saved receipt**, open an earlier invoice, print twice. Check **Payments & closing** and **Items & stock**. | Paper visibly prints `REPRINT — Copy of original saved receipt` / `ਦੁਬਾਰਾ ਛਪਾਈ — ਮੂਲ ਸੰਭਾਲੀ ਰਸੀਦ ਦੀ ਕਾਪੀ`; invoice count, stock, and cash totals remain 100% unchanged. | `NOT RUN` | |
| **PR6** | **Paper-out / cover-open fault & retry** | Post a sale (confirm `Sale saved on this PC`). Before printing, lift the thermal paper cover (or remove roll). Click **Print saved receipt**, observe behavior and post-print status refresh, then close cover / reload roll and click **Print saved receipt** again. | Live printer warning appears (`Selected printer appears offline or stopped in Windows. The sale is already saved — do not re-bill...`), sale is saved **exactly once** (never duplicated), and reprint succeeds cleanly after reloading paper. | `NOT RUN` | |
| **PR7** | **USB printer disconnect & replug recovery** | Unplug thermal printer USB cable while Sornio is open. Attempt print / click **Re-check printers** or **Refresh printers**. Replug USB into same or different USB port, refresh printers, and reprint saved receipt. | App does not freeze or crash (5-second bounded discovery timeout protects UI); missing/offline printer warning appears while disconnected; printing succeeds cleanly after replug without restarting Sornio or corrupting sales. | `NOT RUN` | |

---

## Part B — Cash Drawer Acceptance (`CD1`–`CD3`)

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Evidence Ref (Photo / Video / Log) |
|---|---|---|---|---|---|
| **CD1** | **RJ11 cash drawer pulse on Cash sale (supported thermal printer)** | Connect RJ11 drawer to thermal printer, enable drawer kick-on-print in Windows Printer Preferences (`Pin 2`: `1B 70 00 19 FA` or `Pin 5`: `1B 70 01 19 FA`), record matching mode in Sornio Settings, complete Cash sale and print receipt. | Cash drawer opens once cleanly when the receipt prints. (Mark `BLOCKED` if no RJ11 drawer hardware is present, or document driver limitation if printer driver lacks RJ11 kick.) | `NOT RUN` | |
| **CD2** | **No accidental drawer kick on cancelled / refused flows & non-cash driver behavior** | Open **Review sale** (`F4`) and press `Escape`; attempt an over-credit-limit sale (refused); cancel the Windows print dialog. Also print a UPI-only sale and record whether the printer driver kicks on every print job. | Drawer stays locked closed on every cancelled, refused, or unprinted flow. Document exact driver behavior on printed UPI/Credit receipts for cashier SOP. | `NOT RUN` | |
| **CD3** | **Manual key-opened / absent cash drawer mode** | Set **Cash drawer contract** to `Manual key-opened drawer` or `No cash drawer`. Complete Cash, UPI, and Credit sales. | Zero errors, zero blocked checkouts, and no false claim that a drawer was electronically opened. | `NOT RUN` | |
