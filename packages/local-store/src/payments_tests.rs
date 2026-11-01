use super::*;
use crate::{
    access::Workspace,
    billing::BillLine,
    catalog::AddProduct,
    customers::{CreditKind, CreditRequest, SaveCustomer},
    identity::{Role, StaffDetails},
};
use proptest::prelude::*;
use rusqlite::types::Value as SqlValue;
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Synthetic retail password 2026";

#[test]
fn damaged_return_refunds_once_without_reintroducing_sellable_stock() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let sale = sale_req(&s, "damage-sale", &[("cash", 10000)]);
    perform(&mut s, sale);
    let legacy = return_req(&s, "damage-return", "damage-sale", 1000);
    let mut raw = serde_json::to_value(&legacy).unwrap();
    raw["action"]["lines"][0]["disposition"] = json!("damaged");
    let request: Request = serde_json::from_value(raw).unwrap();
    s.prepare_retail(request.clone()).unwrap();
    let before = snapshots(&s);
    s.0.execute_batch("CREATE TRIGGER fail_disposition BEFORE INSERT ON local_retail_outbox BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;").unwrap();
    assert!(s.post_retail(request.clone()).is_err());
    assert_eq!(snapshots(&s), before);
    s.0.execute_batch("DROP TRIGGER fail_disposition").unwrap();
    let receipt = s.post_retail(request.clone()).unwrap();
    assert_eq!(receipt.data["stockRestored"], false);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 99000);
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    drop(s);
    let mut s = authenticated(&path);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 99000);
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    // Reauthentication legitimately adds identity audit evidence. Compare the
    // complete state immediately before and after the replay.
    let saved = snapshots(&s);
    assert_eq!(s.post_retail(request.clone()).unwrap(), receipt);
    assert_eq!(snapshots(&s), saved);
    assert!(
        s.post_retail(legacy).is_err(),
        "A disposition change must conflict with the saved request"
    );
    assert_eq!(snapshots(&s), saved);
    assert!(quote(
        &s.0,
        "damage-sale",
        &[serde_json::from_value(json!({"lineIndex":0,"quantityMilli":1})).unwrap()]
    )
    .is_err());
    let stored: String =
        s.0.query_row(
            "SELECT request FROM local_retail_ops WHERE id='damage-return'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(stored.contains("damaged"));
    journals_balance(&s);
}

#[test]
fn return_disposition_preserves_legacy_bytes_and_rejects_unknown_values() {
    let old = r#"{"lineIndex":0,"quantityMilli":1000}"#;
    let line: ReturnLine = serde_json::from_str(old).unwrap();
    assert_eq!(serde_json::to_string(&line).unwrap(), old);
    let explicit: ReturnLine =
        serde_json::from_str(r#"{"lineIndex":0,"quantityMilli":1000,"disposition":"sellable"}"#)
            .unwrap();
    assert_eq!(serde_json::to_string(&explicit).unwrap(), old);
    assert!(serde_json::from_value::<ReturnLine>(
        json!({"lineIndex":0,"quantityMilli":1000,"disposition":"unknown"})
    )
    .is_err());
}

#[test]
fn mixed_return_lines_restock_only_sellable_quantities_of_the_same_product() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let mut sale = sale_req(&s, "mixed-sale", &[("cash", 20000)]);
    if let Action::Sale { invoice, .. } = &mut sale.action {
        invoice.lines.push(invoice.lines[0].clone());
    }
    perform(&mut s, sale);
    let lines: Vec<ReturnLine> = serde_json::from_value(json!([
        {"lineIndex":0,"quantityMilli":1000,"disposition":"no_restock"},
        {"lineIndex":1,"quantityMilli":1000}
    ]))
    .unwrap();
    let q = quote(&s.0, "mixed-sale", &lines).unwrap();
    let receipt = perform(
        &mut s,
        req(
            "mixed-return",
            Action::Return {
                invoice_id: "mixed-sale".into(),
                expected_revision: q.revision,
                lines,
                refunds: q.suggested_refunds,
                reason: "One inspected line is sellable; retain the other outside available stock"
                    .into(),
            },
        ),
    );
    assert_eq!(receipt.data["stockRestored"], true);
    assert_eq!(receipt.data["returnLines"][0]["disposition"], "no_restock");
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 99000);
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    journals_balance(&s);
}

#[test]
fn refund_and_repayment_race_conserves_cash_debt_and_damaged_stock() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.save_customer(SaveCustomer {
        operation_id: "customer".into(),
        id: "customer".into(),
        name: "Synthetic customer".into(),
        phone: None,
        credit_limit_paise: None,
        credit_days: 0,
        expected_revision: None,
    })
    .unwrap();
    a.post_invoice(PostInvoice {
        operation_id: "race-credit".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some("customer".into()),
    })
    .unwrap();
    let mut b = authenticated(&path);
    let customer = b.find_customers("customer", false).unwrap().remove(0);
    let repayment = CreditRequest {
        operation_id: "race-repay".into(),
        customer_id: "customer".into(),
        expected_revision: customer.revision,
        kind: CreditKind::Repayment,
        amount_paise: 3000,
        reason: String::new(),
        due_on: None,
        reverse_of: None,
    };
    b.prepare_credit(repayment.clone()).unwrap();
    let mut returned = return_req(&a, "race-return", "race-credit", 1000);
    if let Action::Return { lines, .. } = &mut returned.action {
        lines[0].disposition = ReturnDisposition::Damaged;
    }
    a.prepare_retail(returned.clone()).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_retail(returned)
    });
    barrier.wait();
    let paid = b.post_credit(repayment.clone(), true);
    let refunded = worker.join().unwrap().unwrap();
    match paid {
        Ok(receipt) => {
            assert_eq!(refunded.data["cashOutPaise"], 3000);
            assert_eq!(b.post_credit(repayment, true).unwrap(), receipt);
        }
        Err(StoreError::CreditConflict | StoreError::Overpayment) => {
            assert_eq!(refunded.data["cashOutPaise"], 0);
        }
        other => panic!("Unexpected repayment outcome: {other:?}"),
    }
    assert_eq!(
        b.find_customers("customer", false).unwrap()[0].balance_paise,
        "0"
    );
    let balances = b.cashier_state().unwrap().balances;
    assert_eq!(
        (balances.cash_paise, balances.credit_paise),
        ("0".into(), "0".into())
    );
    assert_eq!(b.list_products().unwrap()[0].stock_milli, 99000);
    journals_balance(&b);
}

#[test]
fn stock_correction_and_sale_race_never_commits_both_stale_intents() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.acknowledge_inventory("rice").unwrap();
    let mut b = authenticated(&path);
    let sale = sale_req(&a, "race-sale", &[("cash", 10000)]);
    a.prepare_retail(sale.clone()).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_retail(sale)
    });
    barrier.wait();
    let correction = b.adjust_stock(crate::catalog::AdjustStock {
        operation_id: "race-correction".into(),
        product_id: "rice".into(),
        expected_revision: 1,
        delta_milli: -100000,
        reason: "Physical count found no available stock".into(),
    });
    match (worker.join().unwrap(), correction) {
        (Ok(_), Err(StoreError::StockConflict)) => {
            assert_eq!(b.list_products().unwrap()[0].stock_milli, 99000);
            assert_eq!(b.list_invoices(0).unwrap().len(), 1);
        }
        (Err(StoreError::StockConflict), Ok(_)) => {
            assert_eq!(b.list_products().unwrap()[0].stock_milli, 0);
            assert!(b.list_invoices(0).unwrap().is_empty());
        }
        other => panic!("Both stale intents must not commit: {other:?}"),
    }
    journals_balance(&b);
}

#[test]
fn concurrent_successful_invoices_receive_distinct_durable_numbers() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    a.acknowledge_inventory("rice").unwrap();
    a.add_product(AddProduct {
        operation_id: "second-product".into(),
        name: "Second product".into(),
        sku: "SECOND".into(),
        unit: "pcs".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 1000,
    })
    .unwrap();
    let mut b = authenticated(&path);
    let invoice = |id: &str, product: &str| PostInvoice {
        operation_id: id.into(),
        lines: vec![BillLine {
            product_id: product.into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    };
    let first = invoice("parallel-one", "rice");
    let second = invoice("parallel-two", "second-product");
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let worker = std::thread::spawn(move || {
        other.wait();
        a.post_invoice(first)
    });
    barrier.wait();
    let second = b.post_invoice(second).unwrap();
    let first = worker.join().unwrap().unwrap();
    assert!(first.invoice_number.is_some());
    assert_ne!(first.invoice_number, second.invoice_number);
    assert_eq!(b.list_invoices(0).unwrap().len(), 2);
    assert_eq!(b.cashier_state().unwrap().balances.cash_paise, "20000");
}

#[test]
fn corrupt_encrypted_database_is_rejected_without_replacement() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    drop(seed(&path));
    let mut bytes = std::fs::read(&path).unwrap();
    bytes[256] ^= 1;
    std::fs::write(&path, &bytes).unwrap();
    assert!(Store::open(&path, KEY).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]
    #[test]
    fn generated_non_restock_returns_preserve_refund_limits_and_stock(
        cut in 1i64..1000, damaged in any::<bool>(),
    ) {
        let d = tempfile::tempdir().unwrap();
        let mut s = seed(&d.path().join("s.db"));
        let sale = sale_req(&s, "non-restock-sale", &[("cash", 10000)]);
        perform(&mut s, sale);
        let mut first = return_req(&s, "non-restock-return", "non-restock-sale", cut);
        if let Action::Return { lines, .. } = &mut first.action {
            lines[0].disposition = if damaged { ReturnDisposition::Damaged } else { ReturnDisposition::NoRestock };
        }
        let saved = perform(&mut s, first.clone());
        prop_assert_eq!(saved.data["stockRestored"].as_bool(), Some(false));
        let before = snapshots(&s);
        prop_assert_eq!(s.post_retail(first).unwrap(), saved);
        prop_assert_eq!(snapshots(&s), before);
        let remaining = return_req(&s, "sellable-return", "non-restock-sale", 1000-cut);
        perform(&mut s, remaining);
        prop_assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000-cut);
        prop_assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
        prop_assert_eq!(invoice_payments(&s.0,"non-restock-sale").unwrap()[0].refundable_paise, 0);
        journals_balance(&s);
    }

    #[test]
    fn generated_split_returns_conserve_money_stock_and_closing(
        qty in 1000i64..9000, price in 100i64..100000, bps in 0i64..3001,
        cut in 1u32..999, float in 100i64..100000, difference in -100i64..101, match_upi in any::<bool>(),
    ) {
        let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));
        s.0.execute("UPDATE local_products SET unit_price_paise=?1 WHERE id='rice'",[price]).unwrap();
        let total=crate::billing::line_total(qty,price).unwrap();let tax=crate::billing::tax_total(total,bps).unwrap();let amount=total+tax;
        let cash=amount/3;let upi=(amount-cash)/2;let card=amount-cash-upi;
        let mut r=sale_req(&s,"generated-sale",&[("cash",cash),("upi",upi),("card",card)]);
        if let Action::Sale{invoice,..}=&mut r.action {invoice.lines[0].quantity_milli=qty;invoice.tax_basis_points=bps;}
        let saved=perform(&mut s,r.clone());let before=snapshots(&s);prop_assert_eq!(s.post_retail(r).unwrap(),saved);prop_assert_eq!(snapshots(&s),before);
        prop_assert_eq!(s.list_products().unwrap()[0].stock_milli,100000-qty);
        for p in invoice_payments(&s.0,"generated-sale").unwrap() {prop_assert!(!p.externally_verified);if p.method!="cash"{prop_assert_eq!(p.status,"pending");}}
        if match_upi { let r=match_req(&s,"match-upi","generated-sale-p-1","BANKREF123456");perform(&mut s,r); }
        let first=(qty*cut as i64/1000).clamp(1,qty-1);
        let request_a=return_req(&s,"return-a","generated-sale",first);let a=perform(&mut s,request_a);
        let request_b=return_req(&s,"return-b","generated-sale",qty-first);let b=perform(&mut s,request_b);
        prop_assert_eq!(a.data["totalPaise"].as_i64().unwrap()+b.data["totalPaise"].as_i64().unwrap(),amount);
        prop_assert_eq!(a.data["taxPaise"].as_i64().unwrap()+b.data["taxPaise"].as_i64().unwrap(),tax);
        prop_assert_eq!(s.list_products().unwrap()[0].stock_milli,100000);
        prop_assert_eq!(s.cashier_state().unwrap().balances.cash_paise,"0");prop_assert_eq!(pending_digital(&s.0).unwrap(),0);
        let refunds:Vec<String>={let mut q=s.0.prepare("SELECT id FROM local_retail_refunds").unwrap();q.query_map([],|r|r.get(0)).unwrap().collect::<Result<_,_>>().unwrap()};
        for (index,id) in refunds.into_iter().enumerate() { let f=refund(&s.0,&id).unwrap();perform(&mut s,req(&format!("send-refund-{index}"),Action::MatchRefund{refund_id:id,expected_revision:f.revision,reference:format!("REFUND{index:08}"),statement_amount_paise:f.amount_paise,evidence:"Manually compared outgoing statement".into()})); }
        for account in ["cash","receivables","revenue","tax_payable","refund_payable","upi_clearing","card_clearing"] {
            let net:i64=s.0.query_row("SELECT COALESCE((SELECT SUM(amount_paise) FROM local_billing_ledger WHERE account=?1),0)+COALESCE((SELECT SUM(amount) FROM local_retail_journal WHERE account=?1),0)",[account],|r|r.get(0)).unwrap();prop_assert_eq!(net,0,"account {}",account);
        }
        for table in ["local_billing_ledger","local_retail_journal"] {
            let col=if table=="local_billing_ledger"{"amount_paise"}else{"amount"};
            let sum:i64=s.0.query_row(&format!("SELECT COALESCE(SUM({col}),0) FROM {table}"),[],|r|r.get(0)).unwrap();prop_assert_eq!(sum,0);
        }
        journals_balance(&s);let day=today(&s.0).unwrap();
        perform(&mut s,req("opening",Action::Float{day:day.clone(),username:"owner".into(),amount_paise:float}));
        let summary=summary(&s.0,&s.1,&day,"owner").unwrap();prop_assert_eq!(&summary.expected_cash_paise,&float.to_string());
        let close=perform(&mut s,req("closing",Action::Close{day:day.clone(),username:"owner".into(),through:summary.through,counted_paise:float+difference}));
        let expected_variance=difference.to_string();prop_assert_eq!(close.data["closing"]["variancePaise"].as_str(),Some(expected_variance.as_str()));
        for p in invoice_payments(&s.0,"generated-sale").unwrap(){prop_assert!(!p.externally_verified);prop_assert_eq!(p.refundable_paise,0);}
    }

    #[test]
    fn generated_invalid_split_and_mid_transaction_failure_never_partially_commit(cash in 1i64..9999) {
        let d=tempfile::tempdir().unwrap();let mut s=seed(&d.path().join("s.db"));
        let mut bad=sale_req(&s,"bad-split",&[("cash",cash),("upi",10001-cash)]);
        s.prepare_retail(bad.clone()).unwrap();let before=snapshots(&s);prop_assert!(s.post_retail(bad.clone()).is_err());prop_assert_eq!(snapshots(&s),before);
        s.clear_retail("bad-split",false).unwrap();
        bad=sale_req(&s,"retryable",&[("cash",cash),("upi",10000-cash)]);s.prepare_retail(bad.clone()).unwrap();
        let before=snapshots(&s);s.0.execute_batch("CREATE TRIGGER fail_property BEFORE INSERT ON local_retail_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
        prop_assert!(s.post_retail(bad.clone()).is_err());prop_assert_eq!(snapshots(&s),before);s.0.execute_batch("DROP TRIGGER fail_property").unwrap();
        let receipt=s.post_retail(bad.clone()).unwrap();let committed=snapshots(&s);prop_assert_eq!(s.post_retail(bad).unwrap(),receipt);prop_assert_eq!(snapshots(&s),committed);journals_balance(&s);
    }
}
fn authenticated(path: &std::path::Path) -> Store {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    if !w.status().unwrap().configured {
        w.setup(PASSWORD).unwrap();
    } else {
        w.unlock(PASSWORD).unwrap();
    }
    let l = w.local_session().unwrap();
    drop(w);
    let mut s = Store::open(path, KEY).unwrap();
    s.1 = Some(Session {
        scope: l.scope,
        actor_id: l.principal.id,
        revision: l.principal.revision,
        generation: crate::recovery::generation(&s.0).unwrap(),
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
    });
    s
}
fn seed(path: &std::path::Path) -> Store {
    let mut s = authenticated(path);
    s.add_product(AddProduct {
        operation_id: "rice".into(),
        name: "Rice".into(),
        sku: "RICE".into(),
        unit: "kg".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 100000,
    })
    .unwrap();
    s
}
fn req(id: &str, action: Action) -> Request {
    Request {
        operation_id: id.into(),
        action,
    }
}
fn perform(s: &mut Store, r: Request) -> Receipt {
    s.prepare_retail(r.clone()).unwrap();
    let out = s.post_retail(r.clone()).unwrap();
    s.clear_retail(&r.operation_id, true).unwrap();
    out
}
fn sale_req(s: &Store, id: &str, parts: &[(&str, i64)]) -> Request {
    req(
        id,
        Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: s.list_products().unwrap()[0].revision,
                    quantity_milli: 1000,
                }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: parts
                .iter()
                .enumerate()
                .map(|(i, (method, amount))| PaymentPart {
                    id: format!("{id}-p-{i}"),
                    method: (*method).into(),
                    amount_paise: *amount,
                    reference: String::new(),
                })
                .collect(),
        },
    )
}
fn match_req(s: &Store, id: &str, payment: &str, reference: &str) -> Request {
    let p = state(&s.0, payment).unwrap();
    req(
        id,
        Action::Match {
            payment_id: payment.into(),
            expected_revision: p.revision,
            reference: reference.into(),
            statement_amount_paise: p.refundable_paise,
            evidence: "Matched bank statement manually".into(),
        },
    )
}
fn return_req(s: &Store, id: &str, invoice: &str, qty: i64) -> Request {
    let lines = vec![ReturnLine {
        line_index: 0,
        quantity_milli: qty,
        disposition: Default::default(),
    }];
    let q = quote(&s.0, invoice, &lines).unwrap();
    req(
        id,
        Action::Return {
            invoice_id: invoice.into(),
            expected_revision: q.revision,
            lines,
            refunds: q.suggested_refunds,
            reason: "Returned goods checked at counter".into(),
        },
    )
}
fn snapshots(s: &Store) -> Vec<Vec<Vec<SqlValue>>> {
    [
        "local_invoices",
        "local_products",
        "local_invoice_stock",
        "local_billing_ledger",
        "local_billing_audit",
        "local_billing_outbox",
        "local_customers",
        "local_credit_entries",
        "local_customer_journal",
        "local_identity_audit",
        "local_retail_ops",
        "local_retail_payments",
        "local_retail_events",
        "local_retail_journal",
        "local_retail_activity",
        "local_retail_returns",
        "local_retail_return_items",
        "local_retail_return_parts",
        "local_retail_refunds",
        "local_retail_pending",
        "local_retail_canceled",
        "local_retail_outbox",
        "local_retail_closings",
        "local_retail_floats",
        "local_retail_float_corrections",
    ]
    .iter()
    .map(|t| {
        let mut q =
            s.0.prepare(&format!("SELECT * FROM {t} ORDER BY rowid"))
                .unwrap();
        let n = q.column_count();
        q.query_map([], |r| {
            (0..n)
                .map(|i| r.get(i))
                .collect::<Result<Vec<SqlValue>, _>>()
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    })
    .collect()
}
fn journals_balance(s: &Store) {
    let mut q = s
        .0
        .prepare("SELECT operation_id,SUM(amount) FROM local_retail_journal GROUP BY operation_id")
        .unwrap();
    for n in q.query_map([], |r| r.get::<_, i64>(1)).unwrap() {
        assert_eq!(n.unwrap(), 0);
    }
}
#[test]
fn split_sale_uses_original_invoice_and_never_verifies_digital_payments() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "sale", &[("cash", 3000), ("upi", 5000), ("card", 2000)]);
    let out = perform(&mut s, r.clone());
    assert_eq!(out.data["invoice"]["totalPaise"], 10000);
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 99000);
    let p = invoice_payments(&s.0, "sale").unwrap();
    assert_eq!(p[0].status, "recorded");
    assert_eq!(p[1].status, "pending");
    assert!(!p.iter().any(|p| p.externally_verified));
    let cash = s.cashier_state().unwrap().balances;
    assert_eq!(cash.cash_paise, "3000");
    assert_eq!(cash.credit_paise, "0");
    assert_eq!(pending_digital(&s.0).unwrap(), 7000);
    assert_eq!(s.post_retail(r).unwrap(), out);
    journals_balance(&s);
}
#[test]
fn changed_or_unbalanced_splits_and_forged_verification_are_refused_atomically() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "bad", &[("cash", 3000), ("upi", 6000)]);
    s.prepare_retail(r.clone()).unwrap();
    let before = snapshots(&s);
    assert!(matches!(
        s.post_retail(r.clone()),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), before);
    let mut value = serde_json::to_value(&r).unwrap();
    value["action"]["payments"][0]["externallyVerified"] = json!(true);
    assert!(serde_json::from_value::<Request>(value).is_err());
    s.clear_retail("bad", false).unwrap();
    assert!(matches!(
        s.post_retail(r),
        Err(StoreError::OperationConflict)
    ));
}
#[test]
fn manual_match_checks_amount_reference_and_reversal_retains_history() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let sale = sale_req(&s, "sale", &[("upi", 10000)]);
    perform(&mut s, sale);
    let mut r = match_req(&s, "match", "sale-p-0", "123456789012");
    if let Action::Match {
        statement_amount_paise,
        ..
    } = &mut r.action
    {
        *statement_amount_paise = 9999;
    }
    s.prepare_retail(r.clone()).unwrap();
    let before = snapshots(&s);
    assert!(s.post_retail(r).is_err());
    assert_eq!(snapshots(&s), before);
    s.clear_retail("match", false).unwrap();
    let r = match_req(&s, "correct", "sale-p-0", "123456789012");
    let receipt = perform(&mut s, r.clone());
    assert_eq!(receipt.data["payment"]["status"], "manually_reconciled");
    assert_eq!(receipt.data["payment"]["externallyVerified"], false);
    assert_eq!(pending_digital(&s.0).unwrap(), 0);
    assert_eq!(s.post_retail(r).unwrap(), receipt);
    let r = req(
        "reverse",
        Action::ReverseMatch {
            payment_id: "sale-p-0".into(),
            expected_revision: 1,
            reason: "Reference was entered against the wrong invoice".into(),
        },
    );
    perform(&mut s, r);
    assert_eq!(state(&s.0, "sale-p-0").unwrap().status, "pending");
    assert_eq!(pending_digital(&s.0).unwrap(), 10000);
    journals_balance(&s);
}
#[test]
fn duplicate_bank_reference_cannot_settle_two_payments_even_with_spacing() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "sale", &[("upi", 5000), ("upi", 5000)]);
    perform(&mut s, r);
    let r = match_req(&s, "one", "sale-p-0", "abc123456");
    perform(&mut s, r);
    let r = match_req(&s, "two", "sale-p-1", " ABC 123456 ");
    s.prepare_retail(r.clone()).unwrap();
    let before = snapshots(&s);
    assert!(matches!(
        s.post_retail(r),
        Err(StoreError::DuplicateSettlement)
    ));
    assert_eq!(snapshots(&s), before);
}
#[test]
fn partial_returns_restore_exact_stock_and_round_cumulatively_to_original_total() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.0.execute("UPDATE local_products SET unit_price_paise=101", [])
        .unwrap();
    let mut r = sale_req(&s, "sale", &[("cash", 106)]);
    if let Action::Sale { invoice, .. } = &mut r.action {
        invoice.tax_basis_points = 500;
    }
    perform(&mut s, r);
    let mut sub = 0;
    let mut tax = 0;
    for (id, qty) in [("r1", 333), ("r2", 333), ("r3", 334)] {
        let r = return_req(&s, id, "sale", qty);
        let result = perform(&mut s, r.clone());
        sub += result.data["subtotalPaise"].as_i64().unwrap();
        tax += result.data["taxPaise"].as_i64().unwrap();
        let before = snapshots(&s);
        assert_eq!(s.post_retail(r).unwrap(), result);
        assert_eq!(snapshots(&s), before);
    }
    assert_eq!((sub, tax), (101, 5));
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    assert!(quote(
        &s.0,
        "sale",
        &[ReturnLine {
            line_index: 0,
            quantity_milli: 1,
            disposition: Default::default(),
        }]
    )
    .is_err());
    journals_balance(&s);
}
#[test]
fn pending_payment_returns_cancel_receivables_without_fake_cash_or_bank_refunds() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "sale", &[("upi", 10000)]);
    perform(&mut s, r);
    let r = return_req(&s, "half", "sale", 500);
    let q = quote(
        &s.0,
        "sale",
        &[ReturnLine {
            line_index: 0,
            quantity_milli: 500,
            disposition: Default::default(),
        }],
    )
    .unwrap();
    assert_eq!(q.canceled_digital_paise, 5000);
    assert_eq!(q.cash_out_paise, 0);
    perform(&mut s, r);
    assert_eq!(pending_digital(&s.0).unwrap(), 5000);
    let r = match_req(&s, "match", "sale-p-0", "123456789012");
    perform(&mut s, r);
    let r = return_req(&s, "rest", "sale", 500);
    let out = perform(&mut s, r);
    let id = out.data["pendingRefundIds"][0].as_str().unwrap();
    assert_eq!(refund(&s.0, id).unwrap().status, "pending");
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "0");
    assert_eq!(
        summary(&s.0, &s.1, &today(&s.0).unwrap(), "owner")
            .unwrap()
            .manually_matched_paise,
        "5000"
    );
    let r = req(
        "refund-bank",
        Action::MatchRefund {
            refund_id: id.into(),
            expected_revision: 0,
            reference: "REFUND123456".into(),
            statement_amount_paise: 5000,
            evidence: "Manually checked outgoing bank statement".into(),
        },
    );
    perform(&mut s, r);
    assert!(!refund(&s.0, id).unwrap().externally_verified);
    assert_eq!(
        state(&s.0, "sale-p-0").unwrap().status,
        "refund_manually_reconciled"
    );
    journals_balance(&s);
}
#[test]
fn every_return_write_and_audit_failure_roll_back_stock_journals_and_retry() {
    for table in [
        "local_products",
        "local_retail_returns",
        "local_retail_return_items",
        "local_retail_return_parts",
        "local_retail_journal",
        "local_retail_activity",
        "local_retail_ops",
        "local_retail_outbox",
        "local_identity_audit",
    ] {
        for mode in ["ABORT,'injected'", "IGNORE"] {
            let d = tempfile::tempdir().unwrap();
            let path = d.path().join("s.db");
            let mut s = seed(&path);
            s.post_invoice(PostInvoice {
                operation_id: "cash-sale".into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: 1,
                    quantity_milli: 1000,
                }],
                tax_basis_points: 0,
                tender: Tender::Cash,
                customer_id: None,
            })
            .unwrap();
            let r = return_req(&s, "return", "cash-sale", 500);
            s.prepare_retail(r.clone()).unwrap();
            let before = snapshots(&s);
            let action = if table == "local_products" {
                "UPDATE"
            } else {
                "INSERT"
            };
            s.0.execute_batch(&format!("CREATE TRIGGER fail_return BEFORE {action} ON {table} BEGIN SELECT RAISE({mode}); END;")).unwrap();
            assert!(s.post_retail(r.clone()).is_err(), "{table}");
            assert_eq!(snapshots(&s), before, "{table}");
            let session = s.1.clone();
            drop(s);
            let mut s = Store::open(&path, KEY).unwrap();
            assert_eq!(snapshots(&s), before);
            s.0.execute_batch("DROP TRIGGER fail_return").unwrap();
            s.1 = session;
            let out = s.post_retail(r.clone()).unwrap();
            assert_eq!(s.post_retail(r).unwrap(), out);
            journals_balance(&s);
        }
    }
}
#[test]
fn cash_and_credit_customer_returns_keep_existing_ledger_totals_consistent() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(SaveCustomer {
        operation_id: "customer".into(),
        id: "c1".into(),
        name: "Asha".into(),
        phone: None,
        credit_limit_paise: None,
        credit_days: 30,
        expected_revision: None,
    })
    .unwrap();
    s.post_invoice(PostInvoice {
        operation_id: "credit".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some("c1".into()),
    })
    .unwrap();
    let c = s.find_customers("c1", false).unwrap()[0].clone();
    let pay = CreditRequest {
        operation_id: "pay".into(),
        customer_id: "c1".into(),
        expected_revision: c.revision,
        kind: CreditKind::Repayment,
        amount_paise: 3000,
        reason: String::new(),
        due_on: None,
        reverse_of: None,
    };
    s.prepare_credit(pay.clone()).unwrap();
    s.post_credit(pay, true).unwrap();
    s.clear_credit("pay", true).unwrap();
    let r = return_req(&s, "return", "credit", 1000);
    let q = quote(
        &s.0,
        "credit",
        &[ReturnLine {
            line_index: 0,
            quantity_milli: 1000,
            disposition: Default::default(),
        }],
    )
    .unwrap();
    assert_eq!((q.credit_reduction_paise, q.cash_out_paise), (7000, 3000));
    perform(&mut s, r);
    assert_eq!(s.find_customers("c1", false).unwrap()[0].balance_paise, "0");
    let b = s.cashier_state().unwrap().balances;
    assert_eq!((b.cash_paise, b.credit_paise), ("0".into(), "0".into()));
    journals_balance(&s);
}
#[test]
fn closing_variance_is_native_and_closed_drawer_blocks_late_atomic_sales() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let day = today(&s.0).unwrap();
    perform(
        &mut s,
        req(
            "float",
            Action::Float {
                day: day.clone(),
                username: "owner".into(),
                amount_paise: 2000,
            },
        ),
    );
    let r = sale_req(&s, "sale", &[("cash", 3000), ("upi", 7000)]);
    perform(&mut s, r);
    let x = summary(&s.0, &s.1, &day, "owner").unwrap();
    assert_eq!(x.expected_cash_paise, "5000");
    assert_eq!(x.digital_pending_paise, "7000");
    let r = req(
        "close",
        Action::Close {
            day: day.clone(),
            username: "owner".into(),
            through: x.through,
            counted_paise: 4900,
        },
    );
    let c = perform(&mut s, r);
    assert_eq!(c.data["closing"]["variancePaise"], "-100");
    let before = snapshots(&s);
    let r = sale_req(&s, "late", &[("cash", 10000)]);
    s.prepare_retail(r.clone()).unwrap();
    let before2 = snapshots(&s);
    assert!(matches!(s.post_retail(r), Err(StoreError::DayClosed)));
    assert_eq!(snapshots(&s), before2);
    s.clear_retail("late", false).unwrap();
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    let original =
        s.0.query_row(
            "SELECT payload FROM local_retail_closings WHERE id='close'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap();
    let corrected = perform(
        &mut s,
        req(
            "correct",
            Action::CorrectClose {
                closing_id: "close".into(),
                counted_paise: 5000,
                reason: "Second count signed by manager".into(),
            },
        ),
    );
    assert_eq!(corrected.data["closing"]["variancePaise"], "0");
    assert_eq!(
        s.0.query_row(
            "SELECT payload FROM local_retail_closings WHERE id='close'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        original
    );
    assert!(!before.is_empty());
    perform(
        &mut s,
        req(
            "reopen",
            Action::Reopen {
                closing_id: "correct".into(),
                reason: "Approved late counter transaction".into(),
            },
        ),
    );
    let r = sale_req(&s, "after-reopen", &[("cash", 10000)]);
    perform(&mut s, r);
}
#[test]
fn stale_closing_quote_and_duplicate_closings_are_rejected() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let day = today(&s.0).unwrap();
    let quote = summary(&s.0, &s.1, &day, "owner").unwrap();
    let r = sale_req(&s, "sale", &[("cash", 10000)]);
    perform(&mut s, r);
    let r = req(
        "close",
        Action::Close {
            day: day.clone(),
            username: "owner".into(),
            through: quote.through,
            counted_paise: 0,
        },
    );
    s.prepare_retail(r.clone()).unwrap();
    let before = snapshots(&s);
    assert!(matches!(s.post_retail(r), Err(StoreError::PaymentConflict)));
    assert_eq!(snapshots(&s), before);
}
#[test]
fn prepared_settlement_survives_restart_and_exact_acknowledgement() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let r = sale_req(&s, "sale", &[("card", 10000)]);
    s.prepare_retail(r.clone()).unwrap();
    drop(s);
    let mut s = authenticated(&path);
    assert_eq!(s.pending_retail().unwrap().unwrap().request, r);
    let out = s.post_retail(r.clone()).unwrap();
    drop(s);
    let mut s = authenticated(&path);
    assert_eq!(
        s.pending_retail().unwrap().unwrap().receipt,
        Some(out.clone())
    );
    assert_eq!(s.post_retail(r).unwrap(), out);
    s.clear_retail("sale", true).unwrap();
    s.clear_retail("sale", true).unwrap();
    assert!(s.pending_retail().unwrap().is_none());
}
#[test]
fn native_rbac_and_cross_business_denials_do_not_depend_on_react() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.setup(PASSWORD).unwrap();
    w.create_staff(
        StaffDetails {
            username: "cashier".into(),
            display_name: "Cashier".into(),
            role: Role::Cashier,
        },
        PASSWORD,
    )
    .unwrap();
    let scope = w.local_session().unwrap().scope;
    w.login("cashier", PASSWORD).unwrap();
    let bad = req(
        "bypass",
        Action::Float {
            day: "2026-01-01".into(),
            username: "cashier".into(),
            amount_paise: 1000,
        },
    );
    assert!(matches!(w.prepare_retail(bad), Err(StoreError::Forbidden)));
    assert!(matches!(
        w.retail_view("2026-01-01", "owner", None),
        Err(StoreError::Forbidden)
    ));
    assert!(matches!(
        w.export_retail("2026-01-01"),
        Err(StoreError::Forbidden)
    ));
    let mut wrong = scope.clone();
    wrong.business_id = "other".into();
    assert!(matches!(
        w.run_scoped(&wrong, |w| w.retail_view("2026-01-01", "cashier", None)),
        Err(StoreError::WorkspaceMismatch)
    ));
}
#[test]
fn settlement_history_and_exports_are_append_only_formula_safe_and_exact() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "-sale", &[("cash", 10000)]);
    perform(&mut s, r);
    for table in [
        "local_retail_ops",
        "local_retail_payments",
        "local_retail_activity",
        "local_retail_journal",
        "local_retail_outbox",
    ] {
        assert!(s.0.execute(&format!("DELETE FROM {table}"), []).is_err());
        assert!(s
            .0
            .execute(
                &format!("INSERT OR REPLACE INTO {table} SELECT * FROM {table} LIMIT 1"),
                []
            )
            .is_err());
    }
    let csv = s.export_retail(&today(&s.0).unwrap()).unwrap().csv;
    assert!(csv.contains("externally_verified"));
    assert!(csv.contains("\"'-sale\""));
    assert!(csv.contains(",100.00,"));
    assert!(!csv.contains("00123456789abcdef"));
    assert!(!csv.contains(PASSWORD));
    assert_eq!(csv_text("  =SUM(A1)"), "\"'  =SUM(A1)\"");
}
#[test]
fn simultaneous_exact_settlement_retries_post_once() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    let r = sale_req(&a, "sale", &[("upi", 5000), ("upi", 5000)]);
    perform(&mut a, r);
    let r = match_req(&a, "one", "sale-p-0", "TXN123456");
    a.prepare_retail(r.clone()).unwrap();
    let mut b = authenticated(&path);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let rr = r.clone();
    let t = std::thread::spawn(move || {
        other.wait();
        a.post_retail(rr)
    });
    barrier.wait();
    let second = b.post_retail(r);
    let first = t.join().unwrap();
    assert!(first.is_ok() && second.is_ok());
    assert_eq!(first.unwrap(), second.unwrap());
    assert_eq!(state(&b.0, "sale-p-0").unwrap().revision, 1);
    journals_balance(&b);
}

#[test]
fn deferred_commit_failure_never_returns_a_refund_receipt_or_partial_stock() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let r = sale_req(&s, "sale", &[("cash", 10000)]);
    perform(&mut s, r);
    let r = return_req(&s, "return", "sale", 500);
    s.prepare_retail(r.clone()).unwrap();
    let before = snapshots(&s);
    s.0.execute_batch("CREATE TABLE fail_parent(id INTEGER PRIMARY KEY);CREATE TABLE fail_child(id INTEGER REFERENCES fail_parent(id) DEFERRABLE INITIALLY DEFERRED);CREATE TRIGGER fail_commit AFTER INSERT ON local_retail_ops BEGIN INSERT INTO fail_child VALUES(1);END;").unwrap();
    assert!(s.post_retail(r.clone()).is_err());
    assert_eq!(snapshots(&s), before);
    let session = s.1.clone();
    drop(s);
    let mut s = Store::open(&path, KEY).unwrap();
    assert_eq!(snapshots(&s), before);
    s.0.execute_batch("DROP TRIGGER fail_commit").unwrap();
    s.1 = session;
    s.post_retail(r).unwrap();
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 99500);
}
fn second_principal(path: &std::path::Path) -> Session {
    let mut w = Workspace::new(Store::open(path, KEY).unwrap());
    w.unlock(PASSWORD).unwrap();
    w.create_staff(
        StaffDetails {
            username: "manager".into(),
            display_name: "Manager".into(),
            role: Role::Manager,
        },
        PASSWORD,
    )
    .unwrap();
    w.login("manager", PASSWORD).unwrap();
    let l = w.local_session().unwrap();
    Session {
        scope: l.scope,
        actor_id: l.principal.id,
        revision: l.principal.revision,
        generation: crate::recovery::generation(&Store::open(path, KEY).unwrap().0).unwrap(),
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600),
    }
}
#[test]
fn competing_staff_cannot_match_one_bank_reference_to_two_allocations() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    let r = sale_req(&a, "sale", &[("upi", 5000), ("upi", 5000)]);
    perform(&mut a, r);
    let manager = second_principal(&path);
    let mut b = Store::open(&path, KEY).unwrap();
    b.1 = Some(manager);
    let ra = match_req(&a, "one", "sale-p-0", "BANK123456");
    let rb = match_req(&b, "two", "sale-p-1", "BANK123456");
    a.prepare_retail(ra.clone()).unwrap();
    b.prepare_retail(rb.clone()).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let t = std::thread::spawn(move || {
        other.wait();
        a.post_retail(ra)
    });
    barrier.wait();
    let second = b.post_retail(rb);
    let first = t.join().unwrap();
    assert!(matches!(
        (&first, &second),
        (Ok(_), Err(StoreError::DuplicateSettlement))
            | (Err(StoreError::DuplicateSettlement), Ok(_))
    ));
    assert_eq!(pending_digital(&b.0).unwrap(), 5000);
    journals_balance(&b);
}
#[test]
fn competing_partial_returns_cannot_restore_or_refund_more_than_was_sold() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut a = seed(&path);
    let r = sale_req(&a, "sale", &[("cash", 10000)]);
    perform(&mut a, r);
    let manager = second_principal(&path);
    let mut b = Store::open(&path, KEY).unwrap();
    b.1 = Some(manager);
    let ra = return_req(&a, "a", "sale", 750);
    let rb = return_req(&b, "b", "sale", 750);
    a.prepare_retail(ra.clone()).unwrap();
    b.prepare_retail(rb.clone()).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let other = barrier.clone();
    let t = std::thread::spawn(move || {
        other.wait();
        a.post_retail(ra)
    });
    barrier.wait();
    let second = b.post_retail(rb);
    let first = t.join().unwrap();
    assert_ne!(first.is_ok(), second.is_ok());
    assert_eq!(b.list_products().unwrap()[0].stock_milli, 99750);
    assert_eq!(b.cashier_state().unwrap().balances.cash_paise, "2500");
    assert_eq!(
        b.0.query_row("SELECT COUNT(*) FROM local_retail_returns", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    journals_balance(&b);
}
#[test]
fn interrupted_cashier_sale_can_be_adopted_by_owner_without_duplicate_posting() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    let manager = second_principal(&path);
    s.1 = Some(manager);
    let r = sale_req(&s, "sale", &[("cash", 10000)]);
    s.prepare_retail(r.clone()).unwrap();
    let out = s.post_retail(r.clone()).unwrap();
    drop(s);
    let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
    w.unlock(PASSWORD).unwrap();
    assert_eq!(
        w.takeover_payment("sale", "Manager terminal interrupted")
            .unwrap(),
        "retail"
    );
    assert_eq!(w.post_retail(r).unwrap(), out);
    w.clear_retail("sale", true).unwrap();
    assert_eq!(w.cashier_state().unwrap().balances.cash_paise, "10000");
    assert_eq!(w.list_invoices(0).unwrap().len(), 1);
}
#[test]
fn v8_migration_preserves_financial_rows_and_seeds_legacy_cash_activity() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("s.db");
    let mut s = seed(&path);
    s.post_invoice(PostInvoice {
        operation_id: "old-cash".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 1,
            quantity_milli: 1000,
        }],
        tax_basis_points: 500,
        tender: Tender::Cash,
        customer_id: None,
    })
    .unwrap();
    s.save_customer(SaveCustomer {
        operation_id: "profile".into(),
        id: "c1".into(),
        name: "Asha".into(),
        phone: None,
        credit_limit_paise: None,
        credit_days: 30,
        expected_revision: None,
    })
    .unwrap();
    s.post_invoice(PostInvoice {
        operation_id: "old-credit".into(),
        lines: vec![BillLine {
            product_id: "rice".into(),
            expected_revision: 2,
            quantity_milli: 500,
        }],
        tax_basis_points: 500,
        tender: Tender::Credit,
        customer_id: Some("c1".into()),
    })
    .unwrap();
    let p = CreditRequest {
        operation_id: "old-pay".into(),
        customer_id: "c1".into(),
        expected_revision: 2,
        kind: CreditKind::Repayment,
        amount_paise: 1000,
        reason: String::new(),
        due_on: None,
        reverse_of: None,
    };
    s.prepare_credit(p.clone()).unwrap();
    s.post_credit(p, true).unwrap();
    s.clear_credit("old-pay", true).unwrap();
    let old_statement = serde_json::to_value(s.customer_statement("c1", 0, None).unwrap()).unwrap();
    let original = s.list_invoices(0).unwrap()[0].invoice.clone();
    let scope = identity::scope(&s.0).unwrap();
    let stock = s.list_products().unwrap();
    let names = [
        "local_inventory_pending",
        "local_inventory_outbox",
        "local_inventory_actors",
        "local_retail_outbox",
        "local_retail_pending",
        "local_retail_canceled",
        "local_retail_events",
        "local_retail_journal",
        "local_retail_activity",
        "local_retail_return_items",
        "local_retail_return_parts",
        "local_retail_refunds",
        "local_retail_returns",
        "local_retail_payments",
        "local_retail_float_corrections",
        "local_retail_floats",
        "local_retail_closings",
        "local_retail_ops",
    ];
    crate::lan_authority::remove_fixture_tables(&s.0);
    for t in names {
        s.0.execute_batch(&format!("DROP TABLE {t}")).unwrap();
    }
    s.0.pragma_update(None, "user_version", 8).unwrap();
    drop(s);
    let s = authenticated(&path);
    assert_eq!(
        serde_json::to_value(s.customer_statement("c1", 0, None).unwrap()).unwrap(),
        old_statement
    );
    assert_eq!(s.cashier_state().unwrap().balances.credit_paise, "4250");
    assert_eq!(identity::scope(&s.0).unwrap(), scope);
    assert_eq!(s.list_invoices(0).unwrap()[0].invoice, original);
    assert_eq!(s.list_products().unwrap(), stock);
    assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "11500");
    assert_eq!(state(&s.0, "old-cash").unwrap().status, "recorded");
    assert_eq!(
        summary(
            &s.0,
            &s.1,
            &day_at(&s.0, &original.created_at).unwrap(),
            "owner"
        )
        .unwrap()
        .net_cash_paise,
        "11500"
    );
}
#[test]
fn business_day_uses_the_invoice_posting_timestamp_across_ist_midnight() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "sale", &[("cash", 10000)]);
    perform(&mut s, r);
    activity_at(
        &s.0,
        &s.1,
        "before-boundary",
        "test",
        1,
        Some("2026-01-01T18:29:59.999Z"),
    )
    .unwrap();
    activity_at(
        &s.0,
        &s.1,
        "after-boundary",
        "test",
        1,
        Some("2026-01-01T18:30:00.000Z"),
    )
    .unwrap();
    assert_eq!(
        summary(&s.0, &s.1, "2026-01-01", "owner")
            .unwrap()
            .net_cash_paise,
        "1"
    );
    assert_eq!(
        summary(&s.0, &s.1, "2026-01-02", "owner")
            .unwrap()
            .net_cash_paise,
        "1"
    );
}
#[test]
fn opening_float_correction_is_append_only_and_invalidates_a_stale_close() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let day = today(&s.0).unwrap();
    perform(
        &mut s,
        req(
            "opening",
            Action::Float {
                day: day.clone(),
                username: "owner".into(),
                amount_paise: 1000,
            },
        ),
    );
    let x = summary(&s.0, &s.1, &day, "owner").unwrap();
    perform(
        &mut s,
        req(
            "float-correction",
            Action::CorrectFloat {
                opening_id: "opening".into(),
                amount_paise: 2000,
                reason: "Opening note transposed, second count approved".into(),
            },
        ),
    );
    assert_eq!(
        s.0.query_row(
            "SELECT amount FROM local_retail_floats WHERE id='opening'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1000
    );
    assert_eq!(
        summary(&s.0, &s.1, &day, "owner")
            .unwrap()
            .expected_cash_paise,
        "2000"
    );
    let r = req(
        "stale-close",
        Action::Close {
            day,
            username: "owner".into(),
            through: x.through,
            counted_paise: 2000,
        },
    );
    s.prepare_retail(r.clone()).unwrap();
    assert!(matches!(s.post_retail(r), Err(StoreError::PaymentConflict)));
}

#[test]
fn reconciliation_csv_uses_the_journal_posting_day_at_an_ist_boundary() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let r = sale_req(&s, "sale", &[("upi", 10000)]);
    perform(&mut s, r);
    let r = match_req(&s, "match", "sale-p-0", "DAY123456");
    perform(&mut s, r);
    // Fixture a bank-event clock on the preceding IST date; do not change its
    // native cash-activity/journal posting snapshot or the financial amounts.
    s.0.execute_batch("DROP TRIGGER local_retail_events_no_UPDATE;UPDATE local_retail_events SET created_at=strftime('%Y-%m-%dT18:29:59.999Z','now','+330 minutes','-1 day') WHERE operation_id='match';").unwrap();
    let day = today(&s.0).unwrap();
    let csv = s.export_retail(&day).unwrap().csv;
    let rows = csv
        .lines()
        .filter(|r| r.contains("\"match\""))
        .collect::<Vec<_>>();
    assert!(rows
        .iter()
        .any(|r| r.starts_with("\"manual_reconciliation\"")));
    assert!(rows.iter().any(|r| r.starts_with("\"journal\"")));
    assert!(rows.iter().all(|r| r.contains(&format!("\"{day}\""))));
}
#[test]
fn cash_variance_preserves_large_integer_values_and_refuses_overflow() {
    assert_eq!(
        variance(0, "9018000000000001").unwrap(),
        "-9018000000000001"
    );
    assert_eq!(variance(1, "0").unwrap(), "1");
    assert!(variance(0, &i128::MIN.to_string()).is_err());
}
#[test]
fn invalid_or_unbounded_checkpoint_inputs_are_refused_before_persistence() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    let before = snapshots(&s);
    let actions = [
        Action::Close {
            day: "x".repeat(1000),
            username: "owner".into(),
            through: 0,
            counted_paise: 0,
        },
        Action::Float {
            day: "2026-01-01".into(),
            username: "x".repeat(1000),
            amount_paise: 0,
        },
        Action::Return {
            invoice_id: "sale".into(),
            expected_revision: 0,
            lines: vec![
                ReturnLine {
                    line_index: 0,
                    quantity_milli: 1,
                    disposition: Default::default(),
                };
                101
            ],
            refunds: vec![],
            reason: "Checked goods".into(),
        },
        Action::Match {
            payment_id: "payment".into(),
            expected_revision: 0,
            reference: "MATCH123456".into(),
            statement_amount_paise: -1,
            evidence: "Bank statement".into(),
        },
    ];
    for (i, a) in actions.into_iter().enumerate() {
        assert!(matches!(
            s.prepare_retail(req(&format!("invalid-{i}"), a)),
            Err(StoreError::InvalidPayment)
        ));
        assert_eq!(snapshots(&s), before);
    }
}

#[test]
#[ignore = "subprocess worker exercised by refund_process_death_preserves_atomicity_and_exact_retry"]
fn refund_crash_worker() {
    let path = std::env::var_os("SORNIO_RETAIL_CRASH_DB").unwrap();
    let mut s = authenticated(std::path::Path::new(&path));
    let raw: String =
        s.0.query_row("SELECT request FROM local_retail_pending", [], |r| r.get(0))
            .unwrap();
    s.post_retail(serde_json::from_str(&raw).unwrap()).unwrap();
    panic!("Crash point was not reached");
}

#[test]
fn refund_process_death_preserves_atomicity_and_exact_retry() {
    for phase in ["before_commit", "after_commit"] {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut s = seed(&path);
        let sale = sale_req(&s, "sale", &[("cash", 10000)]);
        perform(&mut s, sale);
        let request = return_req(&s, "interrupted-return", "sale", 500);
        s.prepare_retail(request.clone()).unwrap();
        let business = |s: &Store| {
            let mut rows = snapshots(s);
            rows.remove(9);
            rows
        };
        let before = business(&s);
        drop(s);
        let exit = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "payments::tests::refund_crash_worker",
                "--ignored",
            ])
            .env("SORNIO_RETAIL_CRASH_DB", &path)
            .env("SORNIO_RETAIL_CRASH_ID", "interrupted-return")
            .env("SORNIO_RETAIL_CRASH_PHASE", phase)
            .status()
            .unwrap();
        assert_eq!(
            exit.code(),
            Some(if phase == "before_commit" { 88 } else { 89 })
        );
        let mut s = authenticated(&path);
        if phase == "before_commit" {
            assert_eq!(business(&s), before);
        }
        let receipt = s.post_retail(request.clone()).unwrap();
        let committed = business(&s);
        assert_eq!(s.post_retail(request.clone()).unwrap(), receipt);
        assert_eq!(business(&s), committed);
        let mut changed = request;
        if let Action::Return { reason, .. } = &mut changed.action {
            *reason = "Changed retry payload".into();
        }
        assert!(matches!(
            s.post_retail(changed),
            Err(StoreError::OperationConflict)
        ));
        assert_eq!(business(&s), committed);
        assert_eq!(s.list_products().unwrap()[0].stock_milli, 99500);
        assert_eq!(s.cashier_state().unwrap().balances.cash_paise, "5000");
        assert_eq!(
            s.0.query_row("SELECT COUNT(*) FROM local_retail_returns", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        journals_balance(&s);
    }
}

#[test]
fn concurrent_closing_and_sale_have_one_serialized_outcome() {
    for _ in 0..8 {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("s.db");
        let mut a = seed(&path);
        let mut b = authenticated(&path);
        let day = today(&a.0).unwrap();
        let close = req(
            "close",
            Action::Close {
                day: day.clone(),
                username: "owner".into(),
                through: summary(&a.0, &a.1, &day, "owner").unwrap().through,
                counted_paise: 0,
            },
        );
        a.prepare_retail(close.clone()).unwrap();
        let sale = if let Action::Sale { mut invoice, .. } =
            sale_req(&b, "sale", &[("cash", 10000)]).action
        {
            invoice.tender = Tender::Cash;
            invoice
        } else {
            unreachable!()
        };
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let other = barrier.clone();
        let worker = std::thread::spawn(move || {
            other.wait();
            a.post_retail(close)
        });
        barrier.wait();
        let sold = b.post_invoice(sale);
        let closed = worker.join().unwrap();
        match (closed, sold) {
            (Ok(_), Err(StoreError::DayClosed)) => {
                assert_eq!(b.list_invoices(0).unwrap().len(), 0);
                assert_eq!(b.list_products().unwrap()[0].stock_milli, 100000);
            }
            (Err(StoreError::PaymentConflict), Ok(_)) => {
                assert_eq!(b.list_invoices(0).unwrap().len(), 1);
                assert_eq!(b.list_products().unwrap()[0].stock_milli, 99000);
            }
            result => panic!("Non-serialized result: {result:?}"),
        }
        journals_balance(&b);
    }
}

fn customer_profile(id: &str, limit: Option<i64>) -> SaveCustomer {
    SaveCustomer {
        operation_id: format!("create-{id}"),
        id: id.into(),
        name: format!("Customer {id}"),
        phone: Some("+91 98765 43210".into()),
        credit_limit_paise: limit,
        credit_days: 30,
        expected_revision: None,
    }
}
/// Retail invoice for 10 units of rice: total 100000 paise (₹1000), optionally
/// attached to a customer so one payment part may be "credit".
fn split_sale_req(s: &Store, id: &str, customer: Option<&str>, parts: &[(&str, i64)]) -> Request {
    req(
        id,
        Action::Sale {
            invoice: PostInvoice {
                operation_id: id.into(),
                lines: vec![BillLine {
                    product_id: "rice".into(),
                    expected_revision: s.list_products().unwrap()[0].revision,
                    quantity_milli: 10000,
                }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: customer.map(str::to_owned),
            },
            payments: parts
                .iter()
                .enumerate()
                .map(|(i, (method, amount))| PaymentPart {
                    id: format!("{id}-p-{i}"),
                    method: (*method).into(),
                    amount_paise: *amount,
                    reference: String::new(),
                })
                .collect(),
        },
    )
}
fn count(s: &Store, sql: &str) -> i64 {
    s.0.query_row(sql, [], |r| r.get(0)).unwrap()
}
#[test]
fn split_cash_and_customer_credit_sale_posts_one_atomic_sale() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer_profile("c1", None)).unwrap();
    // ₹1000 invoice: ₹600 cash now, ₹400 outstanding as customer credit.
    let r = split_sale_req(
        &s,
        "split-1",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    let out = perform(&mut s, r.clone());
    assert_eq!(out.data["invoice"]["totalPaise"], 100000);
    assert_eq!(out.data["invoice"]["customerId"], "c1");
    assert_eq!(
        s.list_invoices(0).unwrap().len(),
        1,
        "invoice created exactly once"
    );
    assert_eq!(
        s.list_products().unwrap()[0].stock_milli,
        90000,
        "stock deducted exactly once"
    );
    assert_eq!(
        count(
            &s,
            "SELECT COUNT(*) FROM local_invoice_stock WHERE invoice_id='split-1'"
        ),
        1
    );
    assert_eq!(
        count(
            &s,
            "SELECT COUNT(*) FROM local_billing_audit WHERE invoice_id='split-1'"
        ),
        1
    );
    assert_eq!(count(&s, "SELECT COUNT(*) FROM local_billing_outbox"), 1);
    // The receipt represents amounts received and amounts outstanding.
    let payments = invoice_payments(&s.0, "split-1").unwrap();
    assert_eq!(payments.len(), 2);
    assert_eq!(payments[0].method, "cash");
    assert_eq!(payments[0].amount_paise, 60000);
    assert_eq!(payments[0].status, "recorded");
    assert_eq!(payments[1].method, "credit");
    assert_eq!(payments[1].amount_paise, 40000);
    assert_eq!(payments[1].status, "credit_due");
    assert!(!payments.iter().any(|p| p.externally_verified));
    // Drawer holds the cash part; the receivable equals the credit part.
    let balances = s.cashier_state().unwrap().balances;
    assert_eq!(balances.cash_paise, "60000");
    assert_eq!(balances.credit_paise, "40000");
    // Customer subledger records exactly one sale entry for the credit part.
    let c = s.find_customers("c1", false).unwrap()[0].clone();
    assert_eq!(c.balance_paise, "40000");
    assert_eq!(count(&s, "SELECT COUNT(*) FROM local_credit_entries"), 1);
    // Durable identity: exact retry replays; a changed request conflicts.
    let saved = snapshots(&s);
    assert_eq!(s.post_retail(r.clone()).unwrap(), out);
    assert_eq!(snapshots(&s), saved);
    let changed = split_sale_req(
        &s,
        "split-1",
        Some("c1"),
        &[("cash", 50000), ("credit", 50000)],
    );
    assert!(matches!(
        s.post_retail(changed),
        Err(StoreError::OperationConflict)
    ));
    assert_eq!(snapshots(&s), saved);
    journals_balance(&s);
    // Restart keeps the same state.
    drop(s);
    let s = authenticated(&d.path().join("s.db"));
    assert_eq!(s.list_invoices(0).unwrap().len(), 1);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 90000);
    assert_eq!(s.cashier_state().unwrap().balances.credit_paise, "40000");
    assert_eq!(
        s.find_customers("c1", false).unwrap()[0].balance_paise,
        "40000"
    );
}
#[test]
fn split_sale_validation_credit_limit_and_atomicity_are_enforced_natively() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer_profile("c1", Some(30000)))
        .unwrap();
    // A credit part without a customer is refused before any write.
    let before = snapshots(&s);
    let no_customer = split_sale_req(&s, "nc", None, &[("cash", 60000), ("credit", 40000)]);
    assert!(matches!(
        s.post_retail(no_customer),
        Err(StoreError::InvalidPayment)
    ));
    // Two credit parts are refused.
    let two = split_sale_req(
        &s,
        "two",
        Some("c1"),
        &[("credit", 40000), ("credit", 40000), ("cash", 20000)],
    );
    assert!(matches!(
        s.post_retail(two),
        Err(StoreError::InvalidPayment)
    ));
    // A customer without a credit part is refused.
    let cust_no_credit = split_sale_req(&s, "cnc", Some("c1"), &[("cash", 100000)]);
    assert!(matches!(
        s.post_retail(cust_no_credit),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), before);
    // Unbalanced split: passes shape validation but never commits.
    let unbalanced = split_sale_req(
        &s,
        "ub",
        Some("c1"),
        &[("cash", 60000), ("credit", 50000)],
    );
    s.prepare_retail(unbalanced.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(unbalanced.clone()),
        Err(StoreError::InvalidPayment)
    ));
    assert_eq!(snapshots(&s), prepared, "failed commit must roll back completely");
    s.clear_retail("ub", false).unwrap();
    // Credit limit: ₹400 credit against a ₹300 limit fails closed, atomically.
    let over = split_sale_req(
        &s,
        "over",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    s.prepare_retail(over.clone()).unwrap();
    let prepared = snapshots(&s);
    assert!(matches!(
        s.post_retail(over),
        Err(StoreError::CreditLimit)
    ));
    assert_eq!(snapshots(&s), prepared, "no invoice, stock, ledger or credit row may survive");
    s.clear_retail("over", false).unwrap();
    assert_eq!(s.list_invoices(0).unwrap().len(), 0);
    assert_eq!(s.list_products().unwrap()[0].stock_milli, 100000);
    assert_eq!(s.find_customers("c1", false).unwrap()[0].balance_paise, "0");
    journals_balance(&s);
}
#[test]
fn split_sale_repayment_and_credit_return_reconcile_without_duplicates() {
    let d = tempfile::tempdir().unwrap();
    let mut s = seed(&d.path().join("s.db"));
    s.save_customer(customer_profile("c1", None)).unwrap();
    let r = split_sale_req(
        &s,
        "split-2",
        Some("c1"),
        &[("cash", 60000), ("credit", 40000)],
    );
    perform(&mut s, r);
    // Customer repays ₹100: receivable drops exactly once, idempotently.
    let c = s.find_customers("c1", false).unwrap()[0].clone();
    let repayment = CreditRequest {
        operation_id: "repay-1".into(),
        customer_id: "c1".into(),
        expected_revision: c.revision,
        kind: CreditKind::Repayment,
        amount_paise: 10000,
        reason: "Cash repayment at counter".into(),
        due_on: None,
        reverse_of: None,
    };
    let receipt = s.post_credit(repayment.clone(), false).unwrap();
    assert_eq!(receipt.balance_paise, "30000");
    let balances = s.cashier_state().unwrap().balances;
    assert_eq!(balances.cash_paise, "70000");
    assert_eq!(balances.credit_paise, "30000");
    let saved = snapshots(&s);
    assert_eq!(s.post_credit(repayment, false).unwrap(), receipt);
    assert_eq!(snapshots(&s), saved);
    // Full return refunds the cash part and clears the remaining debt.
    let ret = return_req(&s, "ret-1", "split-2", 10000);
    let out = perform(&mut s, ret.clone());
    assert_eq!(out.data["stockRestored"], true);
    assert_eq!(
        s.list_products().unwrap()[0].stock_milli,
        100000,
        "sellable return restores stock once"
    );
    assert_eq!(count(&s, "SELECT COUNT(*) FROM local_retail_returns WHERE id='ret-1'"), 1);
    assert_eq!(s.find_customers("c1", false).unwrap()[0].balance_paise, "0");
    let balances = s.cashier_state().unwrap().balances;
    assert_eq!(balances.credit_paise, "0");
    // ₹600 sale cash + ₹100 repayment were both refunded on the full return.
    assert_eq!(balances.cash_paise, "0");
    assert_eq!(out.data["cashOutPaise"], 70000);
    let saved = snapshots(&s);
    assert_eq!(s.post_retail(ret).unwrap(), out);
    assert_eq!(snapshots(&s), saved);
    journals_balance(&s);
}
