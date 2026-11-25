# Transaction Reconciliation Checklist (Physical Bench & Supervised Pilot)

Complete this worksheet at the end of the physical bench run (and at the end of every supervised pilot day). Every calculation must reconcile to the exact paisa (`₹0.01`, integer-paise arithmetic).

| Run Metadata | Value |
|---|---|
| Date (IST) & Workstation Name | |
| Sornio Version & Installer SHA-256 | |
| Tester / Shop Owner Name | |

---

## 1. Cash Drawer & Tender Reconciliation

| Line Item | Formula / Source | Expected (`₹`) | Sornio Recorded (`₹`) | Physical Count (`₹`) | Variance (`₹`) | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|---|---|---|
| **Opening cash float** | Morning float entry | | | | | `NOT RUN` |
| **+ Cash sales** | Sum of Cash-only + Cash splits | | | | | `NOT RUN` |
| **+ Cash credit repayments** | Customer udhaar cash collections | | | | | `NOT RUN` |
| **− Cash customer refunds** | Cash refund parts on returns | | | | | `NOT RUN` |
| **= Expected closing cash** | `Float + Cash sales + Repayments − Refunds` | | | | | `NOT RUN` |
| **Unverified UPI total** | Sum of UPI parts (excluded from drawer cash) | | | N/A (bank app) | | `NOT RUN` |
| **Unverified Card total** | Sum of Card parts (excluded from drawer cash) | | | N/A (POS slip) | | `NOT RUN` |

## 2. Inventory & Stock Reconciliation

| Sample SKU / Item | Opening Stock | + Goods Received (Good only) | − Units Sold | + Sellable Returns | ± Adjustments | Expected Closing | Sornio Closing | Result |
|---|---|---|---|---|---|---|---|---|
| `0089011100001` Hero Ranger 26T Bicycle | | | | | | | | `NOT RUN` |
| `0089011100003` Musical Folding Baby Walker | | | | | | | | `NOT RUN` |
| `0089011100006` Ralson 26x1.95 Tyre | | | | | | | | `NOT RUN` |
| `0089011100007` 26in Butyl Inner Tube (test damaged return NOT restocked) | | | | | | | | `NOT RUN` |
| Loose Brake Cable (`metre`, decimal qty) | | | | | | | | `NOT RUN` |

## 3. Customer Credit (`Udhaar`) & Supplier Payables Reconciliation

| Check | Expected (`₹`) | Sornio Recorded (`₹`) | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|---|
| Customer credit sales − credit returns − repayments = exact customer outstanding balance | | | `NOT RUN` |
| Credit limit refusal blocks sale exceeding available credit | Refused | | `NOT RUN` |
| Supplier good received value (excluding damaged units) − supplier payments − supplier returns = exact payable | | | `NOT RUN` |

## 4. Security, RBAC & Backup Integrity Sign-Off

| Control | Verification Method | Result (`PASS`/`FAIL`/`NOT RUN`) |
|---|---|---|
| **Cashier RBAC enforced** | Cashier blocked from Workstation Settings, Staff Admin, Backup/Restore, and Owner aggregate reports | `NOT RUN` |
| **Append-only audit trail intact** | Session unlock, staff changes, backup/restore events present in Security / Audit history | `NOT RUN` |
| **Encrypted SQLCipher DB & USB backup** | Neither `workspace.db` nor `.sorniobackup` starts with `SQLite format 3` | `NOT RUN` |
| **Reprints did not alter totals** | Reprinted receipts carry `REPRINT` / `ਦੁਬਾਰਾ ਛਪਾਈ` banner with zero duplicate sales | `NOT RUN` |

**Bench / Pilot Sign-Off:**  
Tester Signature & Date: __________________________  
Owner / Reviewer Signature & Date: __________________________
