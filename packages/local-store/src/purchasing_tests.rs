//! Native purchasing, receiving and payable acceptance tests.
use super::*;
use crate::{access::Workspace, catalog::AddProduct, identity::StaffDetails, Draft};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Native purchasing password!";
fn supplier(id: &str) -> SaveSupplier {
    SaveSupplier {
        operation_id: format!("save-{id}"),
        id: id.into(),
        name: format!("Supplier {id}"),
        phone: Some("+91 98765 43210".into()),
        gstin: Some("22AAAAA0000A1Z5".into()),
        address: Some("12 Market Road".into()),
        payment_terms_days: 30,
        notes: String::new(),
        archived: false,
        expected_revision: None,
    }
}
fn store(path: &std::path::Path) -> Store {
    let mut s = Store::open(path, KEY).unwrap();
    s.save_supplier(supplier("s1")).unwrap();
    s.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 100_000,
    })
    .unwrap();
    s
}
fn line(product_id: &str, quantity_milli: i64, unit_cost_paise: i64) -> PurchaseOrderLineInput {
    PurchaseOrderLineInput {
        product_id: product_id.into(),
        quantity_milli,
        unit_cost_paise,
        tax_bps: Some(0),
    }
}
fn create(s: &mut Store, id: &str, lines: Vec<PurchaseOrderLineInput>) -> PurchaseOrder {
    s.create_purchase_order(CreatePurchaseOrder {
        operation_id: id.into(),
        supplier_id: "s1".into(),
        note: "Weekly stock".into(),
        lines,
    })
    .unwrap()
}
fn approved(s: &mut Store, id: &str, lines: Vec<PurchaseOrderLineInput>) -> PurchaseOrder {
    let order = create(s, id, lines);
    let submitted = s
        .submit_purchase_order(TransitionPurchaseOrder {
            operation_id: format!("{id}-submit"),
            id: order.id.clone(),
            expected_revision: order.revision,
            reason: None,
        })
        .unwrap();
    s.decide_purchase_order(DecidePurchaseOrder {
        operation_id: format!("{id}-approve"),
        id: submitted.id.clone(),
        expected_revision: submitted.revision,
        decision: "approve".into(),
        reason: None,
    })
    .unwrap()
}
fn receive(
    s: &mut Store,
    id: &str,
    order: &PurchaseOrder,
    lines: Vec<GoodsReceiptLineInput>,
) -> GoodsReceipt {
    s.post_goods_receipt(PostGoodsReceipt {
        operation_id: id.into(),
        order_id: order.id.clone(),
        reference: Some("CHALLAN-1".into()),
        note: "Delivery".into(),
        lines,
    })
    .unwrap()
}
fn receipt_line(line_index: i64, product_id: &str, quantity_milli: i64) -> GoodsReceiptLineInput {
    GoodsReceiptLineInput {
        line_index,
        product_id: product_id.into(),
        quantity_milli,
        damaged_milli: None,
        note: None,
    }
}
fn stock(s: &Store, product_id: &str) -> i64 {
    s.list_products()
        .unwrap()
        .into_iter()
        .find(|p| p.id == product_id)
        .unwrap()
        .stock_milli
}
fn find_supplier(s: &Store, id: &str) -> Supplier {
    s.find_suppliers("", true)
        .unwrap()
        .into_iter()
        .find(|sup| sup.id == id)
        .unwrap()
}

#[test]
fn supplier_profiles_use_stable_ids_revisions_and_exact_replays() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let created = find_supplier(&s, "s1");
    assert_eq!(created.revision, 1);
    assert_eq!(created.balance_paise, "0");
    let mut edit = supplier("s1");
    edit.operation_id = "edit-1".into();
    edit.expected_revision = Some(1);
    edit.name = "Supplier One".into();
    let saved = s.save_supplier(edit.clone()).unwrap();
    assert_eq!(saved.revision, 2);
    assert_eq!(saved.name, "Supplier One");
    let replayed = s.save_supplier(edit).unwrap();
    assert_eq!(
        replayed.revision, 2,
        "exact retry returns the stored result"
    );
    let mut stale = supplier("s1");
    stale.operation_id = "edit-2".into();
    stale.expected_revision = Some(1);
    assert!(matches!(
        s.save_supplier(stale),
        Err(StoreError::SupplierConflict)
    ));
    let mut invalid = supplier("bad");
    invalid.operation_id = "bad-1".into();
    invalid.gstin = Some("NOT-A-GSTIN".into());
    assert!(matches!(
        s.save_supplier(invalid),
        Err(StoreError::InvalidSupplier)
    ));
    let mut zero = supplier("zero");
    zero.operation_id = "zero-1".into();
    zero.phone = Some("12".into());
    assert!(matches!(
        s.save_supplier(zero),
        Err(StoreError::InvalidSupplier)
    ));
    // Archive hides the record from the working list but keeps the history.
    let mut archived = supplier("s1");
    archived.operation_id = "archive-1".into();
    archived.archived = true;
    archived.name = "Supplier One".into();
    archived.expected_revision = Some(2);
    s.save_supplier(archived).unwrap();
    assert!(s.find_suppliers("Supplier One", false).unwrap().is_empty());
    assert_eq!(s.find_suppliers("Supplier One", true).unwrap().len(), 1);
    // Duplicate detection is advisory and finds matching phone or gstin.
    let matches_found = s
        .supplier_duplicates("Different name", Some("+91 98765 43210"), None)
        .unwrap();
    assert!(matches_found.iter().any(|row| row.id == "s1"));
    let by_tax = s
        .supplier_duplicates("No match here", None, Some("22AAAAA0000A1Z5"))
        .unwrap();
    assert!(by_tax.iter().any(|row| row.id == "s1"));
    assert!(s
        .supplier_duplicates("Nothing alike", Some("+91 00000 00000"), None)
        .unwrap()
        .is_empty());
}

#[test]
fn purchase_order_totals_use_integer_money_and_snapshot_product_data() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let order = create(
        &mut s,
        "po-1",
        vec![
            line("rice", 2_500, 4_250),
            PurchaseOrderLineInput {
                product_id: "rice".into(),
                quantity_milli: 1_000,
                unit_cost_paise: 10_000,
                tax_bps: Some(500),
            },
        ],
    );
    assert_eq!(order.status, "draft");
    assert_eq!(order.lines[0].line_subtotal_paise, 10_625); // 2500 * 4250 / 1000
    assert_eq!(order.lines[1].line_subtotal_paise, 10_000);
    assert_eq!(order.lines[1].tax_paise, 500); // 5% half-up
    assert_eq!(order.subtotal_paise, 20_625);
    assert_eq!(order.tax_paise, 500);
    assert_eq!(order.total_paise, 21_125);
    let replayed = s
        .create_purchase_order(CreatePurchaseOrder {
            operation_id: "po-1".into(),
            supplier_id: "s1".into(),
            note: "Weekly stock".into(),
            lines: order
                .lines
                .iter()
                .map(|l| PurchaseOrderLineInput {
                    product_id: l.product_id.clone(),
                    quantity_milli: l.quantity_milli,
                    unit_cost_paise: l.unit_cost_paise,
                    tax_bps: Some(l.tax_bps),
                })
                .collect(),
        })
        .unwrap();
    assert_eq!(replayed.revision, 1);
    assert_eq!(replayed.total_paise, order.total_paise);
}

#[test]
fn purchase_order_lifecycle_enforces_the_state_machine() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let draft = create(&mut s, "po-2", vec![line("rice", 5_000, 3_000)]);
    // Drafts cannot be approved or received.
    assert!(matches!(
        s.decide_purchase_order(DecidePurchaseOrder {
            operation_id: "early-approve".into(),
            id: draft.id.clone(),
            expected_revision: draft.revision,
            decision: "approve".into(),
            reason: None,
        }),
        Err(StoreError::OrderState)
    ));
    assert!(matches!(
        s.post_goods_receipt(PostGoodsReceipt {
            operation_id: "early-receive".into(),
            order_id: draft.id.clone(),
            reference: None,
            note: String::new(),
            lines: vec![receipt_line(0, "rice", 100)],
        }),
        Err(StoreError::OrderState)
    ));
    // Edit only drafts, only with the right revision.
    let updated = s
        .update_purchase_order(UpdatePurchaseOrder {
            operation_id: "po-2-edit".into(),
            id: draft.id.clone(),
            expected_revision: draft.revision,
            note: "Adjusted".into(),
            lines: vec![line("rice", 4_000, 3_100)],
        })
        .unwrap();
    assert_eq!(updated.revision, 2);
    assert!(matches!(
        s.update_purchase_order(UpdatePurchaseOrder {
            operation_id: "po-2-stale".into(),
            id: draft.id.clone(),
            expected_revision: 1,
            note: "Stale".into(),
            lines: vec![line("rice", 4_000, 3_100)],
        }),
        Err(StoreError::PurchaseOrderConflict)
    ));
    let submitted = s
        .submit_purchase_order(TransitionPurchaseOrder {
            operation_id: "po-2-submit".into(),
            id: draft.id.clone(),
            expected_revision: 2,
            reason: None,
        })
        .unwrap();
    // Submitted orders are frozen for editing.
    assert!(matches!(
        s.update_purchase_order(UpdatePurchaseOrder {
            operation_id: "po-2-edit-2".into(),
            id: draft.id.clone(),
            expected_revision: 3,
            note: "Too late".into(),
            lines: vec![line("rice", 4_000, 3_100)],
        }),
        Err(StoreError::OrderState)
    ));
    let approved = s
        .decide_purchase_order(DecidePurchaseOrder {
            operation_id: "po-2-approve".into(),
            id: draft.id.clone(),
            expected_revision: submitted.revision,
            decision: "approve".into(),
            reason: None,
        })
        .unwrap();
    assert_eq!(approved.status, "approved");
    assert!(approved.approved_at.is_some());
    // A decided order cannot be decided again.
    assert!(matches!(
        s.decide_purchase_order(DecidePurchaseOrder {
            operation_id: "po-2-approve-again".into(),
            id: draft.id.clone(),
            expected_revision: approved.revision,
            decision: "reject".into(),
            reason: Some("Too late".into()),
        }),
        Err(StoreError::OrderState)
    ));
    // Cancelling an approved order needs the approval role and zero receipts.
    let cancellable = create(&mut s, "po-3", vec![line("rice", 1_000, 1_000)]);
    let cancelled = s
        .cancel_purchase_order(TransitionPurchaseOrder {
            operation_id: "po-3-cancel".into(),
            id: cancellable.id.clone(),
            expected_revision: cancellable.revision,
            reason: Some("Supplier closed".into()),
        })
        .unwrap();
    assert_eq!(cancelled.status, "cancelled");
}

#[test]
fn receiving_partially_then_completely_reconciles_stock_and_payables() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let before = stock(&s, "rice");
    let order = approved(&mut s, "po-4", vec![line("rice", 10_000, 3_000)]);
    let first = receive(
        &mut s,
        "rcv-1",
        &order,
        vec![receipt_line(0, "rice", 4_000)],
    );
    assert_eq!(first.goods_total_paise, 12_000);
    assert_eq!(stock(&s, "rice"), before + 4_000);
    assert_eq!(first.order_status, "partial");
    let after_first = find_supplier(&s, "s1").balance_paise;
    assert_eq!(after_first, "12000");
    let current = first_order(&s, &order);
    let second = receive(
        &mut s,
        "rcv-2",
        &current,
        vec![receipt_line(0, "rice", 6_000)],
    );
    assert_eq!(second.order_status, "received");
    assert_eq!(stock(&s, "rice"), before + 10_000);
    assert_eq!(find_supplier(&s, "s1").balance_paise, "30000");
    // Over-receiving is refused.
    assert!(matches!(
        s.post_goods_receipt(PostGoodsReceipt {
            operation_id: "rcv-3".into(),
            order_id: order.id.clone(),
            reference: None,
            note: String::new(),
            lines: vec![receipt_line(0, "rice", 1)],
        }),
        Err(StoreError::OrderState)
    ));
}
fn first_order(s: &Store, order: &PurchaseOrder) -> PurchaseOrder {
    s.get_purchase_order(&order.id).unwrap()
}

#[test]
fn receiving_is_exactly_once_under_retries_and_reopen() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let before;
    {
        let mut s = store(&path);
        before = stock(&s, "rice");
        let order = approved(&mut s, "po-5", vec![line("rice", 8_000, 5_000)]);
        let receipt = receive(
            &mut s,
            "rcv-5",
            &order,
            vec![receipt_line(0, "rice", 5_000)],
        );
        assert_eq!(receipt.goods_total_paise, 25_000);
        drop(s);
    }
    // A retry after the response was interrupted replays the stored receipt.
    let mut s = Store::open(&path, KEY).unwrap();
    let order = s.find_purchase_orders("", "", "").unwrap().pop().unwrap();
    let replayed = s
        .post_goods_receipt(PostGoodsReceipt {
            operation_id: "rcv-5".into(),
            order_id: order.id.clone(),
            reference: Some("CHALLAN-1".into()),
            note: "Delivery".into(),
            lines: vec![receipt_line(0, "rice", 5_000)],
        })
        .unwrap();
    assert_eq!(replayed.goods_total_paise, 25_000);
    assert_eq!(
        stock(&s, "rice"),
        before + 5_000,
        "goods were not received twice"
    );
    assert_eq!(find_supplier(&s, "s1").balance_paise, "25000");
    // The operation log is queryable and durable.
    let events: i64 =
        s.0.query_row(
            "SELECT COUNT(*) FROM local_purchase_stock_events",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(events, 1);
}

#[test]
fn damaged_goods_do_not_enter_stock_or_the_payable() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let before = stock(&s, "rice");
    let order = approved(&mut s, "po-6", vec![line("rice", 4_000, 2_000)]);
    let receipt = s
        .post_goods_receipt(PostGoodsReceipt {
            operation_id: "rcv-6".into(),
            order_id: order.id.clone(),
            reference: Some("CHALLAN-6".into()),
            note: "Two bags soaked".into(),
            lines: vec![GoodsReceiptLineInput {
                line_index: 0,
                product_id: "rice".into(),
                quantity_milli: 4_000,
                damaged_milli: Some(1_000),
                note: Some("Soaked".into()),
            }],
        })
        .unwrap();
    assert_eq!(receipt.goods_total_paise, 6_000); // 3 kg at 2000 paise
    assert_eq!(receipt.damaged_total_paise, 2_000);
    assert_eq!(stock(&s, "rice"), before + 3_000);
    assert_eq!(find_supplier(&s, "s1").balance_paise, "6000");
    let status = s.get_purchase_order(&order.id).unwrap().status;
    assert_eq!(status, "received");
}

#[test]
fn invoices_post_variance_and_payments_allocate_once() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let order = approved(&mut s, "po-7", vec![line("rice", 10_000, 3_000)]);
    let receipt = receive(
        &mut s,
        "rcv-7",
        &order,
        vec![receipt_line(0, "rice", 10_000)],
    );
    let invoice = s
        .post_supplier_invoice(PostSupplierInvoice {
            operation_id: "inv-7".into(),
            supplier_id: "s1".into(),
            receipt_id: Some(receipt.id),
            reference: "INV-7".into(),
            total_paise: 31_000, // supplier billed 1000 more than the PO accrual
            due_on: None,
        })
        .unwrap();
    assert_eq!(invoice.variance_paise, 1_000);
    assert_eq!(find_supplier(&s, "s1").balance_paise, "31000");
    // A duplicate invoice reference for the same receipt is refused.
    assert!(matches!(
        s.post_supplier_invoice(PostSupplierInvoice {
            operation_id: "inv-7b".into(),
            supplier_id: "s1".into(),
            receipt_id: None,
            reference: "INV-7".into(),
            total_paise: 100,
            due_on: None,
        }),
        Err(StoreError::InvalidPayable)
    ));
    // Partial payment allocates against the invoice.
    let first = s
        .post_supplier_payment(PostSupplierPayment {
            operation_id: "pay-7a".into(),
            supplier_id: "s1".into(),
            invoice_id: Some(invoice.id.clone()),
            method: "bank".into(),
            amount_paise: 10_000,
            reference: "NEFT-1".into(),
            paid_on: None,
        })
        .unwrap();
    assert_eq!(first.balance_paise, "21000");
    // Overpaying the invoice is refused.
    assert!(matches!(
        s.post_supplier_payment(PostSupplierPayment {
            operation_id: "pay-7b".into(),
            supplier_id: "s1".into(),
            invoice_id: Some(invoice.id.clone()),
            method: "bank".into(),
            amount_paise: 21_001,
            reference: "NEFT-2".into(),
            paid_on: None,
        }),
        Err(StoreError::Overpayment)
    ));
    // Paying the remainder closes the invoice exactly.
    let second = s
        .post_supplier_payment(PostSupplierPayment {
            operation_id: "pay-7c".into(),
            supplier_id: "s1".into(),
            invoice_id: Some(invoice.id.clone()),
            method: "upi".into(),
            amount_paise: 21_000,
            reference: "UPI-7".into(),
            paid_on: None,
        })
        .unwrap();
    assert_eq!(second.balance_paise, "0");
    // Replaying a payment does not post it twice.
    let replay = s
        .post_supplier_payment(PostSupplierPayment {
            operation_id: "pay-7c".into(),
            supplier_id: "s1".into(),
            invoice_id: Some(invoice.id.clone()),
            method: "upi".into(),
            amount_paise: 21_000,
            reference: "UPI-7".into(),
            paid_on: None,
        })
        .unwrap();
    assert_eq!(replay.balance_paise, "0");
    assert_eq!(find_supplier(&s, "s1").balance_paise, "0");
    // The same operation id cannot back two different requests.
    assert!(matches!(
        s.post_supplier_payment(PostSupplierPayment {
            operation_id: "pay-7c".into(),
            supplier_id: "s1".into(),
            invoice_id: None,
            method: "upi".into(),
            amount_paise: 1,
            reference: "UPI-7".into(),
            paid_on: None,
        }),
        Err(StoreError::OperationConflict)
    ));
}

#[test]
fn unallocated_payments_are_the_explicit_advance_workflow() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let payment = s
        .post_supplier_payment(PostSupplierPayment {
            operation_id: "adv-1".into(),
            supplier_id: "s1".into(),
            invoice_id: None,
            method: "cash".into(),
            amount_paise: 5_000,
            reference: "ADV-1".into(),
            paid_on: None,
        })
        .unwrap();
    assert_eq!(payment.balance_paise, "-5000");
    // A later goods receipt nets the advance off the new liability.
    let order = approved(&mut s, "po-8", vec![line("rice", 2_000, 4_000)]);
    receive(
        &mut s,
        "rcv-8",
        &order,
        vec![receipt_line(0, "rice", 2_000)],
    );
    assert_eq!(find_supplier(&s, "s1").balance_paise, "3000");
}

#[test]
fn reversing_a_payment_restores_the_payable_and_audits_once() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let order = approved(&mut s, "po-9", vec![line("rice", 4_000, 5_000)]);
    receive(
        &mut s,
        "rcv-9",
        &order,
        vec![receipt_line(0, "rice", 4_000)],
    );
    s.post_supplier_payment(PostSupplierPayment {
        operation_id: "pay-9".into(),
        supplier_id: "s1".into(),
        invoice_id: None,
        method: "bank".into(),
        amount_paise: 10_000,
        reference: "NEFT-9".into(),
        paid_on: None,
    })
    .unwrap();
    assert_eq!(find_supplier(&s, "s1").balance_paise, "10000");
    let reversal = s
        .reverse_supplier_entry(ReverseSupplierEntry {
            operation_id: "rev-9".into(),
            target_operation_id: "pay-9".into(),
            reason: "Bank debit bounced".into(),
        })
        .unwrap();
    assert_eq!(reversal.amount_paise, 10_000);
    assert_eq!(find_supplier(&s, "s1").balance_paise, "20000");
    // Reversing the same entry twice is refused.
    assert!(matches!(
        s.reverse_supplier_entry(ReverseSupplierEntry {
            operation_id: "rev-9b".into(),
            target_operation_id: "pay-9".into(),
            reason: "Again".into(),
        }),
        Err(StoreError::InvalidPayable)
    ));
    // A reversal cannot target a goods receipt; returns handle that.
    assert!(matches!(
        s.reverse_supplier_entry(ReverseSupplierEntry {
            operation_id: "rev-9c".into(),
            target_operation_id: "rcv-9".into(),
            reason: "Wrong workflow".into(),
        }),
        Err(StoreError::InvalidPayable)
    ));
}

#[test]
fn returns_deduct_stock_and_reduce_the_payable_exactly_once() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let before = stock(&s, "rice");
    let order = approved(&mut s, "po-10", vec![line("rice", 6_000, 4_000)]);
    let receipt = receive(
        &mut s,
        "rcv-10",
        &order,
        vec![receipt_line(0, "rice", 6_000)],
    );
    assert_eq!(find_supplier(&s, "s1").balance_paise, "24000");
    let returned = s
        .post_purchase_return(PostPurchaseReturn {
            operation_id: "ret-10".into(),
            receipt_id: receipt.id.clone(),
            disposition: "supplier_credit".into(),
            refund_method: None,
            reason: "Moisture damage".into(),
            lines: vec![PostPurchaseReturnLine {
                receipt_line: 0,
                product_id: "rice".into(),
                quantity_milli: 2_000,
            }],
        })
        .unwrap();
    assert_eq!(returned.total_paise, 8_000);
    assert_eq!(stock(&s, "rice"), before + 4_000);
    assert_eq!(find_supplier(&s, "s1").balance_paise, "16000");
    // Replaying the same return does nothing twice.
    let replayed = s
        .post_purchase_return(PostPurchaseReturn {
            operation_id: "ret-10".into(),
            receipt_id: receipt.id.clone(),
            disposition: "supplier_credit".into(),
            refund_method: None,
            reason: "Moisture damage".into(),
            lines: vec![PostPurchaseReturnLine {
                receipt_line: 0,
                product_id: "rice".into(),
                quantity_milli: 2_000,
            }],
        })
        .unwrap();
    assert_eq!(replayed.total_paise, 8_000);
    assert_eq!(stock(&s, "rice"), before + 4_000);
    // Only 4 kg remain returnable; asking for more is refused.
    assert!(matches!(
        s.post_purchase_return(PostPurchaseReturn {
            operation_id: "ret-10b".into(),
            receipt_id: receipt.id.clone(),
            disposition: "supplier_credit".into(),
            refund_method: None,
            reason: "Too much".into(),
            lines: vec![PostPurchaseReturnLine {
                receipt_line: 0,
                product_id: "rice".into(),
                quantity_milli: 4_001,
            }],
        }),
        Err(StoreError::InvalidReturn)
    ));
    // Refunding the remainder returns money without touching the payable.
    let refunded = s
        .post_purchase_return(PostPurchaseReturn {
            operation_id: "ret-10c".into(),
            receipt_id: receipt.id.clone(),
            disposition: "refund".into(),
            refund_method: Some("bank".into()),
            reason: "Supplier refunded".into(),
            lines: vec![PostPurchaseReturnLine {
                receipt_line: 0,
                product_id: "rice".into(),
                quantity_milli: 4_000,
            }],
        })
        .unwrap();
    assert_eq!(refunded.disposition, "refund");
    assert_eq!(find_supplier(&s, "s1").balance_paise, "16000");
    assert_eq!(stock(&s, "rice"), before);
}

#[test]
fn every_operation_journal_balances_and_statements_reconcile() {
    let d = tempfile::tempdir().unwrap();
    let mut s = store(&d.path().join("s.db"));
    let order = approved(&mut s, "po-11", vec![line("rice", 10_000, 3_000)]);
    let receipt = receive(
        &mut s,
        "rcv-11",
        &order,
        vec![receipt_line(0, "rice", 10_000)],
    );
    s.post_supplier_invoice(PostSupplierInvoice {
        operation_id: "inv-11".into(),
        supplier_id: "s1".into(),
        receipt_id: Some(receipt.id.clone()),
        reference: "INV-11".into(),
        total_paise: 32_000,
        due_on: None,
    })
    .unwrap();
    s.post_supplier_payment(PostSupplierPayment {
        operation_id: "pay-11".into(),
        supplier_id: "s1".into(),
        invoice_id: None,
        method: "upi".into(),
        amount_paise: 12_000,
        reference: "UPI-11".into(),
        paid_on: None,
    })
    .unwrap();
    s.post_purchase_return(PostPurchaseReturn {
        operation_id: "ret-11".into(),
        receipt_id: receipt.id.clone(),
        disposition: "supplier_credit".into(),
        refund_method: None,
        reason: "Short supply".into(),
        lines: vec![PostPurchaseReturnLine {
            receipt_line: 0,
            product_id: "rice".into(),
            quantity_milli: 1_000,
        }],
    })
    .unwrap();
    let bad: i64 = s
        .0
        .query_row(
            "SELECT COUNT(*) FROM (SELECT operation_id FROM local_supplier_journal GROUP BY operation_id HAVING COALESCE(SUM(amount_paise),0) <> 0)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(bad, 0, "every journal operation balances");
    let statement = s.supplier_statement("s1", 0, None).unwrap();
    assert_eq!(statement.closing_balance_paise, "17000");
    assert_eq!(statement.opening_balance_paise, "0");
    let summed: i128 = statement
        .entries
        .iter()
        .map(|e| e.amount_paise.parse::<i128>().unwrap())
        .sum();
    assert_eq!(summed.to_string(), statement.closing_balance_paise);
    let aging: i128 = statement.aging.current_paise.parse::<i128>().unwrap()
        + statement.aging.days_1_30_paise.parse::<i128>().unwrap()
        + statement.aging.days_31_60_paise.parse::<i128>().unwrap()
        + statement.aging.days_61_90_paise.parse::<i128>().unwrap()
        + statement.aging.days_90_plus_paise.parse::<i128>().unwrap();
    assert_eq!(aging, 17_000, "aging covers exactly the open charges");
    assert!(!statement.has_more);
}

#[test]
fn experimental_v13_purchasing_database_is_adopted_on_upgrade() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("experimental.db");
    // Manufacture the database the unreleased v13 review build produced:
    // everything up to v12, the v13 purchasing DDL, no held_bills phase, and a
    // row written by the preview itself.
    {
        let _ = Store::open(&path, KEY).unwrap();
        let db = rusqlite::Connection::open(&path).unwrap();
        db.pragma_update(None, "key", KEY).unwrap();
        crate::schema_rollback::drop_post_v11_tables(&db);
        db.pragma_update(None, "user_version", 12).unwrap();
        let experimental = include_str!("purchasing-schema.sql")
            .replace("PRAGMA user_version=23;", "PRAGMA user_version=13;");
        assert!(experimental.contains("user_version=13"));
        db.execute_batch(&experimental).unwrap();
        db.execute(
            "INSERT INTO local_suppliers(id,name,phone,gstin,address,payment_terms_days,notes,archived,revision) VALUES('sup-exp','Experimental Supplier','+91 1','22AAAAA0000A1Z5','12 Market Road',30,'',0,1)",
            (),
        )
        .unwrap();
    }
    // Adoption must open the database, create the skipped held_bills phase,
    // stamp v23 and keep the preview's data.
    let store = Store::open(&path, KEY).unwrap();
    let suppliers = store.find_suppliers("", true).unwrap();
    assert_eq!(suppliers.len(), 1);
    assert_eq!(suppliers[0].id, "sup-exp");
    assert_eq!(suppliers[0].name, "Experimental Supplier");
    drop(store);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0)).unwrap(),
        23
    );
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='local_held_bills'",
            (),
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
}

#[test]
fn experimental_database_with_drifted_purchasing_fails_closed() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("drifted.db");
    {
        let _ = Store::open(&path, KEY).unwrap();
        let db = rusqlite::Connection::open(&path).unwrap();
        db.pragma_update(None, "key", KEY).unwrap();
        crate::schema_rollback::drop_post_v11_tables(&db);
        db.pragma_update(None, "user_version", 12).unwrap();
        let experimental = include_str!("purchasing-schema.sql")
            .replace("PRAGMA user_version=23;", "PRAGMA user_version=13;");
        db.execute_batch(&experimental).unwrap();
        db.execute(
            "INSERT INTO local_suppliers(id,name,phone,gstin,address,payment_terms_days,notes,archived,revision) VALUES('sup-exp','Experimental Supplier','+91 1','22AAAAA0000A1Z5','12 Market Road',30,'',0,1)",
            (),
        )
        .unwrap();
        // A local modification by hand: the append-only guard is gone.
        db.execute_batch("DROP TRIGGER suppliers_no_delete").unwrap();
    }
    match Store::open(&path, KEY) {
        Ok(_) => panic!("a drifted experimental database must not open"),
        Err(StoreError::ExperimentalSchema) => {}
        Err(other) => panic!("expected ExperimentalSchema, got {other}"),
    }
    // Fail closed: still v13, the preview's row intact, held_bills absent.
    let db = rusqlite::Connection::open(&path).unwrap();
    db.pragma_update(None, "key", KEY).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0)).unwrap(),
        13
    );
    assert_eq!(
        db.query_row("SELECT name FROM local_suppliers WHERE id='sup-exp'", (), |r| r
            .get::<_, String>(0))
        .unwrap(),
        "Experimental Supplier"
    );
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='local_held_bills'",
            (),
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}

#[test]
fn migration_to_v23_preserves_existing_data_and_enables_purchasing() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    {
        let mut s = Store::open(&path, KEY).unwrap();
        s.save(
            0,
            Draft {
                business_name: "Existing shop".into(),
                business_type: "kirana".into(),
                note: "Keep me".into(),
            },
        )
        .unwrap();
        s.add_product(AddProduct {
            operation_id: "legacy-stock".into(),
            name: "Legacy stock".into(),
            sku: "LEGACY".into(),
            unit: "pcs".into(),
            unit_price_paise: 100,
            opening_stock_milli: 1_000,
        })
        .unwrap();
        // Simulate a genuine v22 database (current Phase 20 head): every phase-13..22
    // table was created by its own phase and stays; only the v23 purchasing
    // tables are removed and the version rolled back.
        s.0.execute_batch(
            "DROP TABLE local_purchase_return_lines; DROP TABLE local_purchase_returns; DROP TABLE local_supplier_payments; DROP TABLE local_supplier_invoices; DROP TABLE local_purchase_stock_events; DROP TABLE local_goods_receipt_lines; DROP TABLE local_goods_receipts; DROP TABLE local_purchase_order_lines; DROP TABLE local_purchase_orders; DROP TABLE local_supplier_journal; DROP TABLE local_supplier_entries; DROP TABLE local_supplier_outbox; DROP TABLE local_supplier_pending; DROP TABLE local_supplier_canceled; DROP TABLE local_supplier_ops; DROP TABLE local_suppliers; PRAGMA user_version = 22;",
        )
        .unwrap();
    }
    let mut s = Store::open(&path, KEY).unwrap();
    let version: i64 =
        s.0.pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
    assert_eq!(version, 23);
    assert_eq!(
        s.load().unwrap().draft.unwrap().business_name,
        "Existing shop"
    );
    assert!(s
        .list_products()
        .unwrap()
        .iter()
        .any(|p| p.id == "legacy-stock"));
    // Purchasing works end to end on the migrated database.
    s.save_supplier(supplier("s1")).unwrap();
    let order = create(&mut s, "po-migrated", vec![line("legacy-stock", 100, 50)]);
    assert_eq!(order.number, 1);
}

#[test]
fn native_roles_gate_every_purchasing_capability() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    // Prepare a product as the owner, then switch to each staff role.
    w.add_product(crate::catalog::AddProduct {
        operation_id: "gated-rice".into(),
        name: "Gated rice".into(),
        sku: "GRICE".into(),
        unit: "kg".into(),
        unit_price_paise: 1_000,
        opening_stock_milli: 10_000,
    })
    .unwrap();
    for (username, role) in [
        ("manager1", crate::identity::Role::Manager),
        ("assistant1", crate::identity::Role::AssistantManager),
        ("cashier1", crate::identity::Role::Cashier),
    ] {
        w.create_staff(
            StaffDetails {
                username: username.into(),
                display_name: username.into(),
                role: role.clone(),
            },
            PASSWORD,
        )
        .unwrap();
    }
    // Owner creates a supplier and an approved order to operate on.
    w.save_supplier(SaveSupplier {
        operation_id: "gated-supplier".into(),
        id: "gated-supplier".into(),
        name: "Gated supplier".into(),
        phone: None,
        gstin: None,
        address: None,
        payment_terms_days: 30,
        notes: String::new(),
        archived: false,
        expected_revision: None,
    })
    .unwrap();
    w.create_purchase_order(CreatePurchaseOrder {
        operation_id: "gated-po".into(),
        supplier_id: "gated-supplier".into(),
        note: String::new(),
        lines: vec![line("gated-rice", 1_000, 500)],
    })
    .unwrap();
    w.submit_purchase_order(TransitionPurchaseOrder {
        operation_id: "gated-po-submit".into(),
        id: "gated-po".into(),
        expected_revision: 1,
        reason: None,
    })
    .unwrap();
    // Manager: manage, approve and pay — allowed.
    w.login("manager1", PASSWORD).unwrap();
    assert!(w.find_suppliers("", false).is_ok());
    assert!(w
        .decide_purchase_order(DecidePurchaseOrder {
            operation_id: "gated-po-approve".into(),
            id: "gated-po".into(),
            expected_revision: 2,
            decision: "approve".into(),
            reason: None,
        })
        .is_ok());
    assert!(w
        .post_supplier_payment(PostSupplierPayment {
            operation_id: "gated-payment".into(),
            supplier_id: "gated-supplier".into(),
            invoice_id: None,
            method: "bank".into(),
            amount_paise: 100,
            reference: "GATE-1".into(),
            paid_on: None,
        })
        .is_ok());
    // Opening balances stay owner-only.
    assert!(matches!(
        w.post_supplier_opening(PostSupplierOpening {
            operation_id: "gated-opening".into(),
            supplier_id: "gated-supplier".into(),
            amount_paise: 100,
            due_on: None,
            reason: "Legacy balance".into(),
        }),
        Err(StoreError::Forbidden)
    ));
    // Assistant manager: read/prepare/receive — but not approve, pay or manage profiles.
    w.login("assistant1", PASSWORD).unwrap();
    assert!(w.find_suppliers("", false).is_ok());
    assert!(matches!(
        w.save_supplier(SaveSupplier {
            operation_id: "assistant-save".into(),
            id: "assistant-supplier".into(),
            name: "Assistant supplier".into(),
            phone: None,
            gstin: None,
            address: None,
            payment_terms_days: 30,
            notes: String::new(),
            archived: false,
            expected_revision: None,
        }),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.decide_purchase_order(DecidePurchaseOrder {
            operation_id: "assistant-approve".into(),
            id: "gated-po".into(),
            expected_revision: 3,
            decision: "approve".into(),
            reason: None,
        }),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.post_supplier_payment(PostSupplierPayment {
            operation_id: "assistant-pay".into(),
            supplier_id: "gated-supplier".into(),
            invoice_id: None,
            method: "cash".into(),
            amount_paise: 100,
            reference: "GATE-2".into(),
            paid_on: None,
        }),
        Err(StoreError::Forbidden)
    ));
    // Cashier: purchasing is invisible.
    w.login("cashier1", PASSWORD).unwrap();
    assert!(matches!(
        w.find_suppliers("", false),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.post_goods_receipt(PostGoodsReceipt {
            operation_id: "cashier-receive".into(),
            order_id: "gated-po".into(),
            reference: None,
            note: String::new(),
            lines: vec![receipt_line(0, "gated-rice", 100)],
        }),
        Err(StoreError::Forbidden)
    ));
}
