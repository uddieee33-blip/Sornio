# Physical Hardware & Retail Pilot Defect Report Template

Copy one section per observed issue during physical bench acceptance or supervised shop pilot testing.

```markdown
## Defect ID: BENCH-YYYYMMDD-001

- **Date & Time (IST):**
- **Reporter:**
- **Severity:** [ ] Critical (data loss / financial mismatch / crash)  [ ] High (blocks billing/printing/scanning)  [ ] Medium (workaround exists)  [ ] Low (cosmetic/copy)
- **Test Procedure ID:** (e.g., `PR6`, `SC4`, `CD1`, `BR3`, `PL2`)
- **Sornio Build & SHA-256:** (`0.4.0`, SHA-256 from `bench-preflight.json`)
- **Windows Edition & Build:** (from `bench-preflight.json`)
- **Connected Peripherals:**
  - Thermal Printer Model / Driver / Roll Width:
  - USB HID Barcode Scanner Model / Suffix:
  - Cash Drawer Model / Interface / Pin:
  - External Backup USB Drive:

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
- [ ] `bench-preflight.json`
- [ ] Screenshot / photograph of receipt paper or error banner
- [ ] Exact operation ID / invoice ID (never attach real customer passwords or recovery passphrases!)
```
