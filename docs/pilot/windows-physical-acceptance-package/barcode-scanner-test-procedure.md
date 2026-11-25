# USB HID Barcode Scanner & Multi-Device Counter Test Procedure

**Prerequisite:** Import [`pilot-starter-catalog.csv`](pilot-starter-catalog.csv) (11 realistic bicycle, tricycle, baby walker, toy, accessory, and loose spare-part SKUs) and attach a physical USB HID Keyboard-Wedge barcode scanner.

| Bench Hardware | Recorded Model & Configured Suffix |
|---|---|
| USB HID Barcode Scanner | |
| Programmed Suffix (`Enter` / `Tab` / `CR+LF`) | |
| Simultaneous Devices Attached (Printer + Scanner + Drawer + USB Stick) | |

---

## Barcode Scanner Acceptance Matrix (`SC1`–`SC7`)

| ID | Scenario | Exact Execution Steps | Required Pass Criteria | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) | Notes |
|---|---|---|---|---|---|
| **SC1** | **Leading-zero barcode scan** | Press `F2` to focus Checkout search; scan barcode `0089011100001` (`Hero Ranger 26T Mountain Bicycle`). | Leading zeroes preserved; exact product added to cart in 1 scan with quantity `1` and exact price `₹7,450.00`. | `NOT RUN` | |
| **SC2** | **Configurable `Enter`, `Tab`, and `CR+LF` suffixes** | Test Sornio **USB barcode scanner suffix key** (`Enter only`, `Tab only`, `Enter or Tab`) matching scanner programming; test `CR+LF` suffix if scanner supports it. | Configured suffix adds item immediately; trailing empty LF does not flash false errors; pressing `Tab` on an empty search box preserves normal keyboard navigation. | `NOT RUN` | |
| **SC3** | **Rapid consecutive scans & piece auto-increment** | Scan `0089011100008` (`Alloy Bicycle Bell & LED Tail Light Combo`, `pcs`) 5 times rapidly. | Quantity increments accurately to `5`, subtotal updates to `5 × ₹320.00 = ₹1,600.00`, and no stray `Enter` accidentally posts the sale. | `NOT RUN` | |
| **SC4** | **Scanner input while switching between POS fields** | Add `Hero Ranger 26T Mountain Bicycle` (qty `1`), press `F3` so focus is inside `Quantity for Hero Ranger...`, and **without pressing Enter or F2**, scan `0089011100009` (`Kids Safety Helmet`). Also verify scanning a weighed/metre item (`Loose Brake Cable`) prompts for explicit quantity rather than guessing `1`. | Accidental barcode scan inside the quantity input restores the first line's quantity (`1`), moves the scanned helmet cleanly into the cart (`qty 1`), displays `"Scanned barcode moved from quantity field to sale."`, and returns focus to the barcode search box. Normal numeric quantity edits (`2`, `2.5`, `10`) remain unaffected. | `NOT RUN` | |
| **SC5** | **Unknown & ambiguous barcode handling** | Scan an unknown barcode (`9999999999999`) and a partial code (`00890111`). | Clear non-destructive alert shown; active cart is untouched; search box stays ready for next scan. | `NOT RUN` | |
| **SC6** | **Scanner disconnect & replug mid-cart** | Scan 2 items into cart, unplug USB barcode scanner for 5 seconds, plug into a different USB port, press `F2`, scan a 3rd item. | Cart survives intact; 3rd item scans cleanly without restarting Sornio. | `NOT RUN` | |
| **SC7** | **Multiple hardware devices connected simultaneously** | With USB HID scanner, USB thermal printer (with RJ11 drawer if available), and external backup USB drive **all plugged in simultaneously**, execute 3 consecutive scan-to-bill-to-print sales (Cash, mixed Cash+UPI, and Credit) followed by an external USB backup export. | Zero USB contention, zero focus corruption, zero print/scan cross-interference, and exact reconciliation across all 3 sales. | `NOT RUN` | |
