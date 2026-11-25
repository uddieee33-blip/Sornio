# Thermal Receipt Printer & Cash Drawer Test Procedure

**Prerequisite:** Complete `README.md` Section 2 offline installation and attach the shop's physical thermal printer (58 mm and/or 80 mm) and RJ11 cash drawer (if used). Disconnect Wi-Fi and Ethernet before starting.

| Bench Hardware | Recorded Model / Driver / Port |
|---|---|
| 58 mm / 80 mm Thermal Printer | |
| Windows Driver & Paper Profile | |
| Cash Drawer Model & RJ11 Pin (`Pin 2` / `Pin 5` / `Manual` / `None`) | |

---

## Part A — Thermal Receipt Printer Acceptance (`PR1`–`PR7`)

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Notes / Photo Ref |
|---|---|---|---|---|---|
| **PR1** | **Printer discovery & timeout resilience** | Open **Business & settings → Counter hardware & receipt defaults**, click **Refresh printers**. Select the thermal printer, choose `58mm` or `80mm`, save. | Printer appears in dropdown with accurate default/status label; saving persists across app restart. | `NOT RUN` | |
| **PR2** | **58 mm / 80 mm English receipt print** | Complete a 3-item Cash sale (Hero Bicycle + Helmet + Bell). Click **Show print preview**, verify layout, then click **Print saved receipt** and confirm Windows print dialog paper size matches roll width. | Receipt prints cleanly with zero clipped right-hand totals, exact `₹` paise formatting, timestamp (IST), and non-GST disclaimer. | `NOT RUN` | |
| **PR3** | **Gurmukhi (`ਪੰਜਾਬੀ`) receipt print** | Switch receipt language to `ਪੰਜਾਬੀ` (`pa`) and print a saved mixed Cash + UPI sale. | Gurmukhi headings (`ਸੰਭਾਲੀ ਰਸੀਦ`, `ਕੁੱਲ ਰਕਮ`, `ਨਕਦ ਪ੍ਰਾਪਤ`) render legibly on thermal paper via bundled `Noto Sans Gurmukhi` with zero missing glyphs (`□□□`). | `NOT RUN` | |
| **PR4** | **Long names & 25-line invoice** | Bill a 60+ char item name (`Kids Deluxe Folding 3-in-1 Musical Steel Tricycle with Canopy & Push Bar`) and a 25-line invoice mixing cycles, toys, and loose spares; print. | Long product names wrap cleanly without overwriting prices; continuous roll feeds cleanly with intact footer totals. | `NOT RUN` | |
| **PR5** | **Marked reprints & zero financial duplication** | Click **Find saved receipt**, open an earlier invoice, print twice. Check **Payments & closing** and **Items & stock**. | Paper visibly prints `REPRINT — Copy of original saved receipt` / `ਦੁਬਾਰਾ ਛਪਾਈ — ਮੂਲ ਸੰਭਾਲੀ ਰਸੀਦ ਦੀ ਕਾਪੀ`; invoice count, stock, and cash totals remain 100% unchanged. | `NOT RUN` | |
| **PR6** | **Paper-out / cover-open fault & retry** | Post a sale (confirm `Sale saved on this PC`). Before printing, lift the thermal paper cover (or remove roll). Click **Print saved receipt**, observe behavior, then close cover / reload roll and click **Print saved receipt** again. | Live printer warning appears (`Selected printer appears offline or stopped in Windows. The sale is already saved — do not re-bill...`), sale is saved **exactly once** (never duplicated), and reprint succeeds after reloading paper. | `NOT RUN` | |
| **PR7** | **USB printer disconnect & replug recovery** | Unplug thermal printer USB cable while Sornio is open. Attempt print / click **Refresh printers**. Replug USB into same or different USB port, refresh printers, and reprint saved receipt. | App does not freeze or crash (5-second bounded discovery timeout protects UI); missing/offline printer warning appears while disconnected; printing succeeds cleanly after replug without restarting Sornio or corrupting sales. | `NOT RUN` | |

---

## Part B — Cash Drawer Acceptance (`CD1`–`CD3`)

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Notes |
|---|---|---|---|---|---|
| **CD1** | **RJ11 cash drawer pulse on Cash sale (supported thermal printer)** | Connect RJ11 drawer to thermal printer, enable drawer kick-on-print in Windows Printer Preferences (`Pin 2`: `1B 70 00 19 FA` or `Pin 5`: `1B 70 01 19 FA`), record matching mode in Sornio Settings, complete Cash sale and print receipt. | Cash drawer opens once cleanly when the receipt prints. (Mark `BLOCKED` if no RJ11 drawer hardware is present.) | `NOT RUN` | |
| **CD2** | **No accidental drawer kick on cancelled / refused flows** | Open **Review sale** (`F4`) and press `Escape`; attempt an over-credit-limit sale (refused); cancel the Windows print dialog. | Drawer stays locked closed on every cancelled, refused, or unprinted flow. | `NOT RUN` | |
| **CD3** | **Manual key-opened / absent cash drawer mode** | Set **Cash drawer contract** to `Manual key-opened drawer` or `No cash drawer`. Complete Cash, UPI, and Credit sales. | Zero errors, zero blocked checkouts, and no false claim that a drawer was electronically opened. | `NOT RUN` | |
