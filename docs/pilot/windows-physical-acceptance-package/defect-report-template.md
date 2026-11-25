# Physical Hardware & Retail Pilot Defect Report Template

Copy one section per observed issue during physical bench acceptance or supervised shop pilot testing. Follow [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md) for screenshot, photograph, and log hygiene.

```markdown
## Defect ID: BENCH-YYYYMMDD-001

- **Date & Time (IST):**
- **Reporter:**
- **Severity:** [ ] Critical (data loss / financial mismatch / crash)  [ ] High (blocks billing/printing/scanning)  [ ] Medium (workaround exists)  [ ] Low (cosmetic/copy)
- **Blocking Disposition:** [ ] Blocks Installation  [ ] Blocks Supervised Pilot  [ ] Blocks Production Release  [ ] Non-blocking
- **Test Procedure ID:** (e.g., `IN2`, `PERF1`, `PR2a`, `PR6`, `SC4`, `CD1`, `BR3`, `PL2`, `R1`)
- **Sornio Build & SHA-256:** (`0.4.0`, SHA-256 from `bench-preflight.json`, Authenticode status)
- **Windows Edition, Build & Machine Specs:** (Edition/Build, CPU, RAM, HDD/SSD & C: free GB)
- **Connected Peripherals:**
  - Thermal Printer Model / Driver Version / Connection (USB/LAN) / Roll Width:
  - USB HID Barcode Scanner Model / Connection / Programmed Suffix / OS Keyboard Layout:
  - Cash Drawer Model / Interface / RJ11 Pin:
  - External Backup USB Drive (File System / Capacity):

### Summary
One-sentence description of what failed.

### Steps to Reproduce
1.
2.
3.

### Expected Result
What the acceptance procedure requires.

### Actual Result
Exact UI message, printer output, scanner behavior, or Windows error observed.

### Financial & Data Integrity Impact Check (Mandatory)
- Did any invoice duplicate or disappear? [ ] Yes  [ ] No
- Did stock, cash drawer expected total, customer credit, or supplier payable mismatch? [ ] Yes  [ ] No
- Did `workspace.db` remain encrypted and reopen cleanly after restart? [ ] Yes  [ ] No

### Attached Evidence
- [ ] `bench-preflight.json` and machine specs log
- [ ] Screenshot / photograph of receipt paper or error banner (named `<TEST_ID>_<DESC>.png/.jpg`)
- [ ] Exact operation ID / invoice ID and relevant log excerpt (NEVER attach real passwords, PINs, or `.sorniobackup` recovery passphrases!)
```
