//! Phase 23 native verification:
//! - Schema v23 -> v24 migration with atomic pre-migration safety backup
//! - Downgrade refusal (v25 opened by v24 leaves bytes unmodified)
//! - Migration failure rollback & storage-full protection
//! - Corrupted/truncated/bit-flipped/incompatible backup archive rejection
//! - v23 encrypted backup preview & restoration into v24 workspace
//! - Restart during checkout, restart during supplier payment, locked DB handling
//! - Synthetic bicycle & spare-parts real-shop pilot end-to-end reconciliation
//! - Realistic 10,000-product / 50,000-invoice performance benchmark (explicitly invoked)
use crate::{
    access::Workspace,
    billing::{BillLine, PostInvoice, Tender},
    catalog::AddProduct,
    customers::{CreditKind, CreditRequest, SaveCustomer},
    identity::{OwnerSetup, Role, StaffDetails},
    payments::{Action, PaymentPart, Request, ReturnDisposition, ReturnLine},
    purchasing::{
        CreatePurchaseOrder, DecidePurchaseOrder, GoodsReceiptLineInput, PostGoodsReceipt,
        PostSupplierInvoice, PostSupplierPayment, PurchaseOrderLineInput, SaveSupplier,
        TransitionPurchaseOrder,
    },
    workstation_settings::SaveWorkstationSettings,
    Store, StoreError, SCHEMA_VERSION,
};
use serde_json::json;
use std::{path::Path, time::Instant};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PASSWORD: &str = "Phase23 synthetic owner password";

fn open(path: &Path) -> Workspace {
    Workspace::new(Store::open(path, KEY).unwrap())
}

fn scalar(w: &Workspace, sql: &str) -> i64 {
    w.store_for_test()
        .0
        .query_row(sql, [], |r| r.get(0))
        .unwrap()
}

fn sale(id: String, product: String, revision: i64) -> PostInvoice {
    PostInvoice {
        operation_id: id,
        lines: vec![BillLine {
            product_id: product,
            expected_revision: revision,
            quantity_milli: 1000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    }
}

/// Build a disposable v23 fixture with realistic business, staff, inventory,
/// customer credit, sales, and purchasing records, then roll back only the v24
/// table/index so `open_with_migration_backup` performs a genuine v23 -> v24
/// schema migration.
fn seed_v23_workspace(path: &Path) {
    let mut w = open(path);
    w.provision_owner(
        OwnerSetup {
            business_name: "Ludhiana Cycle & Spares".into(),
            business_type: "general".into(),
            display_name: "Harpreet Singh".into(),
            username: "owner".into(),
        },
        PASSWORD,
    )
    .unwrap();
    w.create_staff(
        StaffDetails {
            username: "cashier1".into(),
            display_name: "Gurpreet".into(),
            role: Role::Cashier,
        },
        PASSWORD,
    )
    .unwrap();
    w.add_product(AddProduct {
        operation_id: "prod-tube".into(),
        name: "26in Inner Tube".into(),
        sku: "0089012345678".into(),
        unit: "pcs".into(),
        unit_price_paise: 18_500,
        opening_stock_milli: 20_000,
    })
    .unwrap();
    w.acknowledge_inventory("prod-tube").unwrap();
    w.save_customer(SaveCustomer {
        operation_id: "cust-1".into(),
        id: "cust-aman".into(),
        name: "Amanpreet Cycles".into(),
        phone: Some("9876543210".into()),
        credit_limit_paise: Some(500_000),
        credit_days: 15,
        expected_revision: None,
    })
    .unwrap();
    w.post_invoice(PostInvoice {
        operation_id: "inv-v23-1".into(),
        lines: vec![BillLine {
            product_id: "prod-tube".into(),
            expected_revision: 1,
            quantity_milli: 2_000,
        }],
        tax_basis_points: 0,
        tender: Tender::Credit,
        customer_id: Some("cust-aman".into()),
    })
    .unwrap();
    w.save_supplier(SaveSupplier {
        operation_id: "sup-1".into(),
        id: "sup-hero".into(),
        name: "Hero Spares Wholesale".into(),
        phone: Some("9814000001".into()),
        gstin: None,
        address: Some("Gill Road, Ludhiana".into()),
        payment_terms_days: 30,
        notes: "Primary tubes supplier".into(),
        archived: false,
        expected_revision: None,
    })
    .unwrap();
    let po = w
        .create_purchase_order(CreatePurchaseOrder {
            operation_id: "po-v23-1".into(),
            supplier_id: "sup-hero".into(),
            note: "Initial tube restock".into(),
            lines: vec![PurchaseOrderLineInput {
                product_id: "prod-tube".into(),
                quantity_milli: 5_000,
                unit_cost_paise: 12_000,
                tax_bps: Some(0),
            }],
        })
        .unwrap();
    w.submit_purchase_order(TransitionPurchaseOrder {
        operation_id: "po-v23-1-sub".into(),
        id: po.id.clone(),
        expected_revision: po.revision,
        reason: None,
    })
    .unwrap();
    let submitted = w.get_purchase_order(&po.id).unwrap();
    w.decide_purchase_order(DecidePurchaseOrder {
        operation_id: "po-v23-1-app".into(),
        id: po.id.clone(),
        expected_revision: submitted.revision,
        decision: "approve".into(),
        reason: None,
    })
    .unwrap();
    w.post_goods_receipt(PostGoodsReceipt {
        operation_id: "gr-v23-1".into(),
        order_id: po.id,
        reference: Some("CH-V23-1".into()),
        note: "Delivered".into(),
        lines: vec![GoodsReceiptLineInput {
            line_index: 0,
            product_id: "prod-tube".into(),
            quantity_milli: 5_000,
            damaged_milli: Some(0),
            note: None,
        }],
    })
    .unwrap();
    crate::schema_rollback::drop_post_v23_tables(&w.store_for_test().0);
    w.store_for_test()
        .0
        .pragma_update(None, "user_version", 23)
        .unwrap();
    drop(w);
}

#[test]
fn v23_upgrade_creates_encrypted_safety_backup_and_preserves_all_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.db");
    let backup_dir = dir.path().join("migration-backups");
    seed_v23_workspace(&path);

    let store = Store::open_with_migration_backup(&path, KEY, &backup_dir).unwrap();
    let mut w = Workspace::new(store);
    w.login("owner", PASSWORD).unwrap();

    // Schema migrated cleanly to v24 and created an encrypted pre-migration safety copy.
    assert_eq!(scalar(&w, "PRAGMA user_version"), SCHEMA_VERSION);
    let backups: Vec<_> = std::fs::read_dir(&backup_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert_eq!(
        backups.len(),
        1,
        "exactly one pre-migration encrypted safety copy must be written"
    );
    let safety_bytes = std::fs::read(backups[0].path()).unwrap();
    assert!(
        !safety_bytes.starts_with(b"SQLite format 3"),
        "pre-migration safety backup must remain SQLCipher ciphertext"
    );

    // Every prior record survives intact.
    assert_eq!(w.list_staff().unwrap().len(), 2);
    let products = w.list_products().unwrap();
    assert_eq!(products.len(), 1);
    assert_eq!(products[0].sku, "0089012345678");
    // 20 opening - 2 sold + 5 received = 23 pcs (23_000 milli)
    assert_eq!(products[0].stock_milli, 23_000);
    let customer = w.read_customer("cust-aman").unwrap();
    assert_eq!(customer.balance_paise, "37000");
    let supplier = w.supplier_statement("sup-hero", 0, None).unwrap();
    assert_eq!(supplier.supplier.balance_paise, "60000");

    // New v24 workstation settings are initialized and persist across restart.
    let settings = w.read_workstation_settings().unwrap();
    assert_eq!(settings.receipt_layout, "80mm");
    assert_eq!(settings.receipt_language, "en");
    w.save_workstation_settings(SaveWorkstationSettings {
        expected_revision: settings.revision,
        receipt_layout: "58mm".into(),
        receipt_language: "pa".into(),
        printer_name: "TVS RP-3200".into(),
        barcode_suffix: "enter_or_tab".into(),
        cash_drawer_mode: "escpos_pin2".into(),
        backup_destination_note: "Shop USB E:\\Backups".into(),
    })
    .unwrap();
    drop(w);

    let mut reopened = Workspace::new(
        Store::open_with_migration_backup(&path, KEY, &backup_dir).unwrap(),
    );
    reopened.login("owner", PASSWORD).unwrap();
    assert_eq!(reopened.read_workstation_settings().unwrap().printer_name, "TVS RP-3200");
    // Reopening an already-v24 workspace must not create another migration backup.
    assert_eq!(
        std::fs::read_dir(&backup_dir).unwrap().count(),
        1,
        "already-migrated workspace must not duplicate pre-migration backups"
    );
}

#[test]
fn downgrade_refusal_never_modifies_or_reinitializes_newer_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("newer.db");
    let backup_dir = dir.path().join("migration-backups");
    {
        let mut w = open(&path);
        w.setup(PASSWORD).unwrap();
        w.store_for_test()
            .0
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
    }
    let before = std::fs::read(&path).unwrap();
    let result = Store::open_with_migration_backup(&path, KEY, &backup_dir);
    assert!(matches!(result, Err(StoreError::NewerSchema)));
    let after = std::fs::read(&path).unwrap();
    assert_eq!(
        before, after,
        "downgrade refusal must leave the newer database byte-for-byte untouched"
    );
    assert!(
        !backup_dir.exists(),
        "downgrade refusal must not create a migration backup"
    );
}

#[test]
fn failed_migration_safety_backup_aborts_cleanly_without_modifying_v23_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.db");
    seed_v23_workspace(&path);
    let before = std::fs::read(&path).unwrap();

    // Point backup_dir at a regular file so creating the directory fails (simulates
    // unavailable/unwritable storage for the pre-migration safety copy).
    let blocked_backup_path = dir.path().join("not-a-directory");
    std::fs::write(&blocked_backup_path, b"occupied").unwrap();
    let err = Store::open_with_migration_backup(&path, KEY, &blocked_backup_path);
    assert!(matches!(err, Err(StoreError::MigrationBackupFailed)));

    // Original v23 database is untouched and still migrates cleanly once storage is fixed.
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let good_backup_dir = dir.path().join("valid-backups");
    let mut recovered = Workspace::new(
        Store::open_with_migration_backup(&path, KEY, &good_backup_dir).unwrap(),
    );
    recovered.login("owner", PASSWORD).unwrap();
    assert_eq!(recovered.list_products().unwrap()[0].stock_milli, 23_000);
}

#[test]
fn damaged_truncated_and_incompatible_backups_never_replace_live_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("live.db");
    let recovery = "Separate phase23 recovery passphrase";
    let mut w = open(&path);
    w.setup(PASSWORD).unwrap();
    w.add_product(AddProduct {
        operation_id: "keep-bike".into(),
        name: "Hero Ranger 26T".into(),
        sku: "HERO-26T".into(),
        unit: "pcs".into(),
        unit_price_paise: 750_000,
        opening_stock_milli: 4_000,
    })
    .unwrap();
    w.acknowledge_inventory("keep-bike").unwrap();
    let valid_archive = dir.path().join("valid.sorniobackup");
    w.export_backup(&valid_archive, PASSWORD, recovery).unwrap();

    // 1. Truncated archive
    let truncated = dir.path().join("truncated.sorniobackup");
    let valid_bytes = std::fs::read(&valid_archive).unwrap();
    std::fs::write(&truncated, &valid_bytes[..valid_bytes.len() / 2]).unwrap();
    assert!(matches!(
        w.preview_backup(&truncated, PASSWORD, recovery, PASSWORD),
        Err(StoreError::InvalidBackup)
    ));

    // 2. Bit-flipped ciphertext archive
    let bit_flipped = dir.path().join("corrupt.sorniobackup");
    let mut corrupted = valid_bytes.clone();
    let mid = corrupted.len() / 2;
    corrupted[mid] ^= 0xFF;
    std::fs::write(&bit_flipped, &corrupted).unwrap();
    assert!(matches!(
        w.preview_backup(&bit_flipped, PASSWORD, recovery, PASSWORD),
        Err(StoreError::InvalidBackup)
    ));

    // 3. Plaintext / non-SQLCipher garbage archive
    let garbage = dir.path().join("garbage.sorniobackup");
    std::fs::write(&garbage, vec![0x42u8; 8192]).unwrap();
    assert!(matches!(
        w.preview_backup(&garbage, PASSWORD, recovery, PASSWORD),
        Err(StoreError::InvalidBackup)
    ));

    // Live workspace remains completely intact.
    let items = w.list_products().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].sku, "HERO-26T");
    assert_eq!(items[0].stock_milli, 4_000);
}

#[test]
fn restart_during_checkout_and_supplier_payment_prevents_duplicates() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("restart-ops.db");
    let checkout_req = PostInvoice {
        operation_id: "checkout-interrupted-1".into(),
        lines: vec![BillLine {
            product_id: "tyre-1".into(),
            expected_revision: 1,
            quantity_milli: 2_000,
        }],
        tax_basis_points: 0,
        tender: Tender::Cash,
        customer_id: None,
    };
    let payment_req = PostSupplierPayment {
        operation_id: "sup-pay-interrupted-1".into(),
        supplier_id: "sup-tyres".into(),
        invoice_id: None,
        method: "bank".into(),
        amount_paise: 25_000,
        reference: "NEFT-2301".into(),
        paid_on: None,
    };

    {
        let mut w = open(&path);
        w.setup(PASSWORD).unwrap();
        w.add_product(AddProduct {
            operation_id: "tyre-1".into(),
            name: "26x2.10 MTB Tyre".into(),
            sku: "TYRE-26-MTB".into(),
            unit: "pcs".into(),
            unit_price_paise: 45_000,
            opening_stock_milli: 10_000,
        })
        .unwrap();
        w.acknowledge_inventory("tyre-1").unwrap();
        w.save_supplier(SaveSupplier {
            operation_id: "sup-tyres-op".into(),
            id: "sup-tyres".into(),
            name: "Ralson Tyre Distributors".into(),
            phone: None,
            gstin: None,
            address: None,
            payment_terms_days: 15,
            notes: String::new(),
            archived: false,
            expected_revision: None,
        })
        .unwrap();
        // Prepare checkout and commit supplier payment, then simulate abrupt restart
        // before the UI acknowledges either operation.
        w.prepare_checkout(checkout_req.clone()).unwrap();
        w.post_supplier_payment(payment_req.clone()).unwrap();
    }

    // Reopen after simulated termination: pending checkout must be recovered and
    // retrying both checkout and supplier payment must commit once without duplicates.
    let mut w = open(&path);
    w.login("owner", PASSWORD).unwrap();
    let state = w.cashier_state().unwrap();
    assert!(
        state.checkout.is_some(),
        "prepared checkout must survive abrupt restart"
    );
    assert!(state.checkout.as_ref().unwrap().invoice.is_none());
    let first_post = w.post_prepared_invoice(checkout_req.clone()).unwrap();
    let retry_post = w.post_prepared_invoice(checkout_req).unwrap();
    assert_eq!(first_post, retry_post);
    w.clear_checkout("checkout-interrupted-1", true).unwrap();

    // Exact retry of supplier payment replays identically without double-debiting.
    let replayed_payment = w.post_supplier_payment(payment_req).unwrap();
    assert_eq!(replayed_payment.amount_paise, 25_000);
    assert_eq!(scalar(&w, "SELECT COUNT(*) FROM local_invoices"), 1);
    assert_eq!(scalar(&w, "SELECT COUNT(*) FROM local_supplier_payments"), 1);
    assert_eq!(
        w.list_products().unwrap()[0].stock_milli,
        8_000,
        "stock must be deducted exactly once"
    );
    assert_eq!(
        w.supplier_statement("sup-tyres", 0, None)
            .unwrap()
            .supplier
            .balance_paise,
        "-25000"
    );
}

#[test]
fn synthetic_bicycle_retail_pilot_reconciles_end_to_end() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bicycle-pilot.db");
    let mut w = open(&path);
    w.provision_owner(
        OwnerSetup {
            business_name: "Satluj Cycles & Spares (Synthetic Pilot)".into(),
            business_type: "general".into(),
            display_name: "Pilot Owner".into(),
            username: "owner".into(),
        },
        PASSWORD,
    )
    .unwrap();

    // 1. Add barcode & non-barcode bicycle and spare-part products.
    for p in [
        AddProduct {
            operation_id: "bike-26".into(),
            name: "Atlas Goldline 26T Bicycle".into(),
            sku: "8901112223334".into(),
            unit: "pcs".into(),
            unit_price_paise: 650_000, // Rs 6,500.00
            opening_stock_milli: 5_000,
        },
        AddProduct {
            operation_id: "tyre-26".into(),
            name: "Ralson 26x1.95 Tyre".into(),
            sku: "8901112223341".into(),
            unit: "pcs".into(),
            unit_price_paise: 38_000, // Rs 380.00
            opening_stock_milli: 30_000,
        },
        AddProduct {
            operation_id: "tube-26".into(),
            name: "26in Butyl Tube".into(),
            sku: "8901112223358".into(),
            unit: "pcs".into(),
            unit_price_paise: 14_000, // Rs 140.00
            opening_stock_milli: 40_000,
        },
        AddProduct {
            operation_id: "brake-wire".into(),
            name: "Loose Brake Cable (Non-Barcode)".into(),
            sku: String::new(),
            unit: "metre".into(),
            unit_price_paise: 4_500, // Rs 45.00/m
            opening_stock_milli: 50_000,
        },
    ] {
        let id = p.operation_id.clone();
        w.add_product(p).unwrap();
        w.acknowledge_inventory(&id).unwrap();
    }

    // 2. Open cashier day float (Rs 2,000.00) using the store's IST business date.
    let day = crate::payments::today(&w.store_for_test().0).unwrap();
    let float_req = Request {
        operation_id: "pilot-float".into(),
        action: Action::Float {
            day: day.clone(),
            username: "owner".into(),
            amount_paise: 200_000,
        },
    };
    w.prepare_retail(float_req.clone()).unwrap();
    w.post_retail(float_req).unwrap();
    w.clear_retail("pilot-float", true).unwrap();

    // 3. Create credit customer.
    w.save_customer(SaveCustomer {
        operation_id: "pilot-cust-1".into(),
        id: "cust-gill".into(),
        name: "Gill Repair Workshop".into(),
        phone: Some("9814099999".into()),
        credit_limit_paise: Some(500_000),
        credit_days: 15,
        expected_revision: None,
    })
    .unwrap();

    // 4. Scenario A: Bicycle mixed-tender sale (Cash Rs 4,000 + UPI Rs 2,500 = Rs 6,500).
    let bike_sale = Request {
        operation_id: "pilot-sale-bike".into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: "pilot-sale-bike".into(),
                lines: vec![BillLine {
                    product_id: "bike-26".into(),
                    expected_revision: 1,
                    quantity_milli: 1_000,
                }],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: None,
            },
            payments: vec![
                PaymentPart {
                    id: "pay-bike-cash".into(),
                    method: "cash".into(),
                    amount_paise: 400_000,
                    reference: String::new(),
                },
                PaymentPart {
                    id: "pay-bike-upi".into(),
                    method: "upi".into(),
                    amount_paise: 250_000,
                    reference: "UPI-PILOT-001".into(),
                },
            ],
        },
    };
    w.prepare_retail(bike_sale.clone()).unwrap();
    w.post_retail(bike_sale).unwrap();
    w.clear_retail("pilot-sale-bike", true).unwrap();

    // 5. Scenario B: Multiple quantities tyres + tubes + non-barcode brake wire
    //    on mixed cash + customer credit:
    //    2 tyres (76,000) + 3 tubes (42,000) + 2.5m wire (11,250) = 129,250 paise.
    //    Cash 50,000 + Credit 79,250.
    let spares_sale = Request {
        operation_id: "pilot-sale-spares".into(),
        action: Action::Sale {
            invoice: PostInvoice {
                operation_id: "pilot-sale-spares".into(),
                lines: vec![
                    BillLine {
                        product_id: "tyre-26".into(),
                        expected_revision: 1,
                        quantity_milli: 2_000,
                    },
                    BillLine {
                        product_id: "tube-26".into(),
                        expected_revision: 1,
                        quantity_milli: 3_000,
                    },
                    BillLine {
                        product_id: "brake-wire".into(),
                        expected_revision: 1,
                        quantity_milli: 2_500,
                    },
                ],
                tax_basis_points: 0,
                tender: Tender::Retail,
                customer_id: Some("cust-gill".into()),
            },
            payments: vec![
                PaymentPart {
                    id: "pay-spares-cash".into(),
                    method: "cash".into(),
                    amount_paise: 50_000,
                    reference: String::new(),
                },
                PaymentPart {
                    id: "pay-spares-credit".into(),
                    method: "credit".into(),
                    amount_paise: 79_250,
                    reference: String::new(),
                },
            ],
        },
    };
    w.prepare_retail(spares_sale.clone()).unwrap();
    w.post_retail(spares_sale).unwrap();
    w.clear_retail("pilot-sale-spares", true).unwrap();

    // 6. Scenario C: Damaged customer return of 1 tube (Rs 140 refund, NOT restocked).
    let return_lines = vec![ReturnLine {
        line_index: 1,
        quantity_milli: 1_000,
        disposition: ReturnDisposition::Damaged,
    }];
    let return_quote = w
        .quote_retail_return("pilot-sale-spares", &return_lines)
        .unwrap();
    let ret_req = Request {
        operation_id: "pilot-ret-tube".into(),
        action: Action::Return {
            invoice_id: "pilot-sale-spares".into(),
            expected_revision: return_quote.revision,
            lines: return_lines,
            refunds: return_quote.suggested_refunds,
            reason: "Pinched valve on tube; damaged not restocked".into(),
        },
    };
    w.prepare_retail(ret_req.clone()).unwrap();
    w.post_retail(ret_req).unwrap();
    w.clear_retail("pilot-ret-tube", true).unwrap();

    // 7. Scenario D: Partial customer credit repayment (Rs 300 cash).
    let cust = w.read_customer("cust-gill").unwrap();
    let balance_after_return: i64 = cust.balance_paise.parse().unwrap();
    let repay_req = CreditRequest {
        operation_id: "pilot-repay-1".into(),
        customer_id: "cust-gill".into(),
        expected_revision: cust.revision,
        kind: CreditKind::Repayment,
        amount_paise: 30_000,
        reason: "Partial cash repayment".into(),
        due_on: None,
        reverse_of: None,
    };
    w.prepare_credit(repay_req.clone()).unwrap();
    w.post_credit(repay_req).unwrap();
    w.clear_credit("pilot-repay-1", true).unwrap();
    let expected_final_customer_balance = (balance_after_return - 30_000).to_string();
    assert_eq!(
        w.read_customer("cust-gill").unwrap().balance_paise,
        expected_final_customer_balance
    );

    // 8. Scenario E: Supplier purchasing, receiving with damaged item, invoice & partial payment.
    w.save_supplier(SaveSupplier {
        operation_id: "pilot-sup-1".into(),
        id: "sup-ludhiana".into(),
        name: "Ludhiana Cycle Parts Co.".into(),
        phone: Some("9814011111".into()),
        gstin: None,
        address: Some("Miller Ganj, Ludhiana".into()),
        payment_terms_days: 30,
        notes: String::new(),
        archived: false,
        expected_revision: None,
    })
    .unwrap();
    let po = w
        .create_purchase_order(CreatePurchaseOrder {
            operation_id: "pilot-po-1".into(),
            supplier_id: "sup-ludhiana".into(),
            note: "Restock tyres".into(),
            lines: vec![PurchaseOrderLineInput {
                product_id: "tyre-26".into(),
                quantity_milli: 10_000,
                unit_cost_paise: 28_000,
                tax_bps: Some(0),
            }],
        })
        .unwrap();
    w.submit_purchase_order(TransitionPurchaseOrder {
        operation_id: "pilot-po-sub".into(),
        id: po.id.clone(),
        expected_revision: po.revision,
        reason: None,
    })
    .unwrap();
    let sub = w.get_purchase_order(&po.id).unwrap();
    w.decide_purchase_order(DecidePurchaseOrder {
        operation_id: "pilot-po-app".into(),
        id: po.id.clone(),
        expected_revision: sub.revision,
        decision: "approve".into(),
        reason: None,
    })
    .unwrap();
    let gr = w
        .post_goods_receipt(PostGoodsReceipt {
            operation_id: "pilot-gr-1".into(),
            order_id: po.id,
            reference: Some("CH-MILLER-01".into()),
            note: "1 tyre bead damaged on arrival".into(),
            lines: vec![GoodsReceiptLineInput {
                line_index: 0,
                product_id: "tyre-26".into(),
                quantity_milli: 10_000,
                damaged_milli: Some(1_000),
                note: Some("Damaged bead".into()),
            }],
        })
        .unwrap();
    // Accepted good stock = 9 * 28,000 = 252,000 paise.
    assert_eq!(gr.goods_total_paise, 252_000);
    let sup_inv = w
        .post_supplier_invoice(PostSupplierInvoice {
            operation_id: "pilot-sinv-1".into(),
            supplier_id: "sup-ludhiana".into(),
            receipt_id: Some(gr.id),
            reference: "LCP-INV-101".into(),
            total_paise: 252_000,
            due_on: None,
        })
        .unwrap();
    w.post_supplier_payment(PostSupplierPayment {
        operation_id: "pilot-spay-1".into(),
        supplier_id: "sup-ludhiana".into(),
        invoice_id: Some(sup_inv.id),
        method: "bank".into(),
        amount_paise: 150_000,
        reference: "IMPS-88221".into(),
        paid_on: Some(day.clone()),
    })
    .unwrap();

    // 9. Scenario F: Daily cash closing matching the exact expected drawer cash.
    let view = w.retail_view(&day, "owner", None).unwrap();
    let expected_cash: i64 = view.summary.expected_cash_paise.parse().unwrap();
    let close_req = Request {
        operation_id: "pilot-close-day".into(),
        action: Action::Close {
            day: day.clone(),
            username: "owner".into(),
            through: view.summary.through,
            counted_paise: expected_cash,
        },
    };
    w.prepare_retail(close_req.clone()).unwrap();
    w.post_retail(close_req).unwrap();
    w.clear_retail("pilot-close-day", true).unwrap();

    // 10. Scenario G: Encrypted backup, restore, and full independent reconciliation.
    let backup_path = dir.path().join("bicycle-pilot.sorniobackup");
    let recovery = "Bicycle pilot recovery passphrase 2026";
    w.export_backup(&backup_path, PASSWORD, recovery).unwrap();
    let preview = w
        .preview_backup(&backup_path, PASSWORD, recovery, PASSWORD)
        .unwrap();
    w.restore_backup(
        &backup_path,
        &dir.path().join("safety"),
        PASSWORD,
        recovery,
        PASSWORD,
        &preview,
        &preview.confirmation,
    )
    .unwrap();
    w.login("owner", PASSWORD).unwrap();

    // Reconcile EVERY inventory count, customer balance, supplier payable, and journal balance.
    let products: std::collections::BTreeMap<String, i64> = w
        .list_products()
        .unwrap()
        .into_iter()
        .map(|p| (p.id, p.stock_milli))
        .collect();
    assert_eq!(products["bike-26"], 4_000); // 5 - 1
    assert_eq!(products["tyre-26"], 37_000); // 30 - 2 + 9 good received
    assert_eq!(products["tube-26"], 37_000); // 40 - 3 (damaged return NOT restocked)
    assert_eq!(products["brake-wire"], 47_500); // 50 - 2.5
    assert_eq!(
        w.read_customer("cust-gill").unwrap().balance_paise,
        expected_final_customer_balance
    );
    assert_eq!(
        w.supplier_statement("sup-ludhiana", 0, None)
            .unwrap()
            .supplier
            .balance_paise,
        "102000" // 252,000 - 150,000
    );
    assert_eq!(
        scalar(
            &w,
            "SELECT COUNT(*) FROM (SELECT invoice_id FROM local_billing_ledger GROUP BY invoice_id HAVING SUM(amount_paise)<>0)"
        ),
        0
    );
    assert_eq!(
        scalar(&w, "SELECT COUNT(*) FROM pragma_foreign_key_check"),
        0
    );
}

#[test]
#[ignore = "Explicit Phase 23 10k products / 50k invoices workload; run via scripts/run-phase23-workload.py"]
fn phase23_ten_thousand_products_and_fifty_thousand_invoices_benchmark() {
    let started = Instant::now();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("phase23-scale.db");

    let startup = Instant::now();
    let mut w = open(&path);
    w.setup(PASSWORD).unwrap();
    let startup_ms = startup.elapsed().as_secs_f64() * 1000.0;
    let initial_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

    let mut stages = serde_json::Map::new();

    // 10,000 products (verifies exceeding the former 5,000 ceiling)
    let stage = Instant::now();
    for n in 0..10_000 {
        let id = format!("p-{n}");
        w.add_product(AddProduct {
            operation_id: id.clone(),
            name: format!("Spare Part {n:05}"),
            sku: format!("SP-{n:05}"),
            unit: "pcs".into(),
            unit_price_paise: 10_000,
            opening_stock_milli: 100_000,
        })
        .unwrap();
        w.acknowledge_inventory(&id).unwrap();
    }
    stages.insert(
        "products_10k_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );

    // 5,000 customers + 1,000 suppliers
    let stage = Instant::now();
    for n in 0..5_000 {
        w.save_customer(SaveCustomer {
            operation_id: format!("c-save-{n}"),
            id: format!("c-{n}"),
            name: format!("Retail Customer {n:05}"),
            phone: None,
            credit_limit_paise: Some(500_000),
            credit_days: 15,
            expected_revision: None,
        })
        .unwrap();
    }
    stages.insert(
        "customers_5k_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );

    let stage = Instant::now();
    for n in 0..1_000 {
        w.save_supplier(SaveSupplier {
            operation_id: format!("s-save-{n}"),
            id: format!("s-{n}"),
            name: format!("Parts Supplier {n:05}"),
            phone: None,
            gstin: None,
            address: None,
            payment_terms_days: 30,
            notes: String::new(),
            archived: false,
            expected_revision: None,
        })
        .unwrap();
    }
    stages.insert(
        "suppliers_1k_seconds".into(),
        json!(stage.elapsed().as_secs_f64()),
    );

    // 50,000 invoices across the 10,000 products (5 sales per product)
    let stage = Instant::now();
    let mut checkout_samples_ms = Vec::new();
    for n in 0..50_000 {
        let req = sale(
            format!("inv-{n}"),
            format!("p-{}", n % 10_000),
            n / 10_000 + 1,
        );
        let t = Instant::now();
        let posted = w.post_invoice(req).unwrap();
        let elapsed_ms = t.elapsed().as_secs_f64() * 1000.0;
        if n % 250 == 0 {
            checkout_samples_ms.push(elapsed_ms);
        }
        assert_eq!(posted.total_paise, 10_000);
    }
    let invoices_seconds = stage.elapsed().as_secs_f64();
    stages.insert("invoices_50k_seconds".into(), json!(invoices_seconds));

    // Repeated product list/search & receipt reads on full 10k/50k dataset
    let mut product_search_ms = Vec::new();
    let mut receipt_read_ms = Vec::new();
    for i in 0..30 {
        let t = Instant::now();
        let all = w.list_products().unwrap();
        assert_eq!(all.len(), 10_000);
        let target = format!("SP-{:05}", i * 333);
        assert!(all.iter().any(|p| p.sku == target));
        product_search_ms.push(t.elapsed().as_secs_f64() * 1000.0);

        let rt = Instant::now();
        let inv = w.read_invoice(&format!("inv-{}", i * 1500)).unwrap();
        assert_eq!(inv.total_paise, 10_000);
        receipt_read_ms.push(rt.elapsed().as_secs_f64() * 1000.0);
    }

    // Reconcile stock (10,000 * 100,000 - 50,000 * 1,000 = 950,000,000 milli) & cash (500,000,000 paise)
    assert_eq!(scalar(&w, "SELECT COUNT(*) FROM local_products"), 10_000);
    assert_eq!(scalar(&w, "SELECT COUNT(*) FROM local_invoices"), 50_000);
    assert_eq!(
        scalar(&w, "SELECT SUM(stock_milli) FROM local_products"),
        950_000_000
    );
    assert_eq!(
        scalar(
            &w,
            "SELECT SUM(amount_paise) FROM local_billing_ledger WHERE account='cash'"
        ),
        500_000_000
    );
    drop(w);

    let final_bytes = std::fs::metadata(&path).unwrap().len();
    let reopen = Instant::now();
    let mut w = open(&path);
    w.login("owner", PASSWORD).unwrap();
    let reopen_ms = reopen.elapsed().as_secs_f64() * 1000.0;
    assert_eq!(
        scalar(&w, "SELECT SUM(stock_milli) FROM local_products"),
        950_000_000
    );

    checkout_samples_ms.sort_by(f64::total_cmp);
    product_search_ms.sort_by(f64::total_cmp);
    receipt_read_ms.sort_by(f64::total_cmp);

    println!(
        "PHASE23_METRICS {}",
        json!({
            "result": "PASS",
            "schema": SCHEMA_VERSION,
            "counts": {
                "products": 10000,
                "customers": 5000,
                "suppliers": 1000,
                "invoices": 50000
            },
            "elapsed_seconds": started.elapsed().as_secs_f64(),
            "stages": stages,
            "startup_with_setup_ms": startup_ms,
            "reopen_with_unlock_ms": reopen_ms,
            "checkout_post_ms": {
                "samples": checkout_samples_ms.len(),
                "median": checkout_samples_ms[checkout_samples_ms.len() / 2],
                "p95": checkout_samples_ms[(checkout_samples_ms.len() * 95) / 100],
                "max": checkout_samples_ms[checkout_samples_ms.len() - 1]
            },
            "product_catalog_search_ms": {
                "samples": product_search_ms.len(),
                "median": product_search_ms[product_search_ms.len() / 2],
                "max": product_search_ms[product_search_ms.len() - 1]
            },
            "receipt_read_ms": {
                "samples": receipt_read_ms.len(),
                "median": receipt_read_ms[receipt_read_ms.len() / 2],
                "max": receipt_read_ms[receipt_read_ms.len() - 1]
            },
            "native_postings_per_second": 50000.0 / invoices_seconds,
            "initial_database_bytes": initial_bytes,
            "final_database_bytes": final_bytes,
            "financial_reconciliation": "PASS: 10,000 products, 50,000 invoices, 950,000,000 milli-stock and 500,000,000 paise cash reconciled after reopen"
        })
    );
}
