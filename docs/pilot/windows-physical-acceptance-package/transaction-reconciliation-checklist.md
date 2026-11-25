# Transaction Reconciliation Checklist (Physical Bench & Supervised Pilot)

Complete this worksheet at the end of the physical bench run (and at the end of every supervised pilot day). Every calculation must reconcile to the exact paisa (`₹0.01`, integer-paise arithmetic). Archive completed sheets and supporting screenshots per [`EVIDENCE-CAPTURE-GUIDE.md`](EVIDENCE-CAPTURE-GUIDE.md).

| Run Metadata | Value |
|---|---|
| Date (IST) & Workstation Name | |
| Sornio Version & Installer SHA-256 | |
| Tester / Shop Owner Name | |

---

## 1. Cash Drawer & Tender Reconciliation (`R1`–`R2`)

| Check ID | Line Item | Formula / Source | Expected (`₹`) | Sornio Recorded (`₹`) | Physical Count (`₹`) | Variance (`₹`) | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|---|---|---|---|
| **R1** | **Opening cash float** | Morning float entry | | | | | `NOT RUN` |
| **R1** | **+ Cash sales** | Sum of Cash-only + Cash splits | | | | | `NOT RUN` |
| **R1** | **+ Cash credit repayments** | Customer udhaar cash collections | | | | | `NOT RUN` |
| **R1** | **− Cash customer refunds** | Cash refund parts on returns | | | | | `NOT RUN` |
| **R1** | **= Expected closing cash** | `Float + Cash sales + Repayments − Refunds` (variance must be `₹0.00`) | | | | | `NOT RUN` |
| **R2** | **Unverified UPI total** | Sum of UPI parts (excluded from drawer cash) | | | N/A (bank app) | | `NOT RUN` |
| **R2** | **Unverified Card total** | Sum of Card parts (excluded from drawer cash) | | | N/A (POS slip) | | `NOT RUN` |

## 2. Inventory & Stock Reconciliation (`R3`)

*(SKUs below match [`pilot-starter-catalog.csv`](pilot-starter-catalog.csv) exactly.)*

| Check ID | Sample SKU / Item | Opening Stock | + Goods Received (Good only) | − Units Sold | + Sellable Returns | ± Adjustments | Expected Closing | Sornio Closing | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|---|---|---|---|---|---|
| **R3** | `0089011100001` Hero Ranger 26T Mountain Bicycle | | | | | | | | `NOT RUN` |
| **R3** | `0089011100004` Musical Folding Baby Walker (8-Wheel) | | | | | | | | `NOT RUN` |
| **R3** | `0089011100006` Ralson 26x1.95 Bicycle Tyre | | | | | | | | `NOT RUN` |
| **R3** | `0089011100007` 26in Butyl Inner Tube (test damaged return NOT restocked) | | | | | | | | `NOT RUN` |
| **R3** | Loose Brake Cable (`metre`, decimal qty) | | | | | | | | `NOT RUN` |

## 3. Customer Credit (`Udhaar`) & Supplier Payables Reconciliation (`R4`–`R5`)

| Check ID | Check | Expected (`₹`) | Sornio Recorded (`₹`) | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|---|
| **R4** | Customer credit sales − credit returns − repayments = exact customer outstanding balance | | | `NOT RUN` |
| **R4** | Credit limit refusal blocks sale exceeding available credit | Refused | | `NOT RUN` |
| **R5** | Supplier good received value (excluding damaged units) − supplier payments − supplier returns = exact payable | | | `NOT RUN` |

## 4. Security, RBAC, Backup & Reprint Integrity Sign-Off (`R6`–`R9`)

| Check ID | Control | Verification Method | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|
| **R6** | **Cashier RBAC enforced** | Cashier blocked from Workstation Settings, Staff Admin, Backup/Restore, and Owner aggregate reports | `NOT RUN` |
| **R7** | **Append-only audit trail intact** | Session unlock, staff changes, backup/restore events present in Security / Audit history | `NOT RUN` |
| **R8** | **Encrypted SQLCipher DB & USB backup** | First 16 bytes of neither `workspace.db` nor `.sorniobackup` equal `SQLite format 3` | `NOT RUN` |
| **R9** | **Reprints & crash retries did not alter totals** | Reprinted receipts carry `REPRINT` / `ਦੁਬਾਰਾ ਛਪਾਈ` banner and recovered operations committed strictly once | `NOT RUN` |

**Bench / Pilot Sign-Off:**  
Tester Signature & Date: __________________________  
Owner / Reviewer Signature & Date: __________________________
