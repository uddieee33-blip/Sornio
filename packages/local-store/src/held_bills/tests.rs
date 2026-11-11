use super::*;
use crate::{access::Workspace, catalog::AddProduct, identity::Session};
const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
fn seed(path: &std::path::Path) -> Store {
    let mut workspace = Workspace::new(Store::open(path, KEY).unwrap());
    if workspace.status().unwrap().configured { workspace.unlock("Synthetic held bill password 2026").unwrap(); }
    else { workspace.setup("Synthetic held bill password 2026").unwrap(); }
    let local = workspace.local_session().unwrap();
    drop(workspace);
    let mut store = Store::open(path, KEY).unwrap();
    store.1 = Some(Session { scope: local.scope, actor_id: local.principal.id,
        revision: local.principal.revision, generation: crate::recovery::generation(&store.0).unwrap(),
        expires: std::time::Instant::now() + std::time::Duration::from_secs(3600) });
    if store.list_products().unwrap().is_empty() {
        store.add_product(AddProduct { operation_id: "rice".into(), name: "Rice".into(), sku: "00123".into(),
            unit: "kg".into(), unit_price_paise: 10000, opening_stock_milli: 100000 }).unwrap();
    }
    store
}
fn save(id: &str) -> Mutation {
    Mutation { id: id.into(), expected_revision: 0, action: Action::Save { draft: DraftInput {
        lines: vec![Line { product_id: "rice".into(), quantity_milli: 1250 }], tax_basis_points: 0,
        tender: Tender::Cash, customer_id: None, payments: vec![], note: "Waiting customer".into(),
    } } }
}
fn financial_state(s: &Store) -> (i64, i64, i64, i64) {
    s.0.query_row("SELECT (SELECT count(*) FROM local_invoices), (SELECT count(*) FROM local_credit_entries), (SELECT count(*) FROM local_retail_payments), (SELECT stock_milli FROM local_products WHERE id='rice')", [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap()
}
#[test]
fn holding_replaying_and_reopening_never_posts_financial_records() {
    let d = tempfile::tempdir().unwrap(); let path = d.path().join("held.db"); let mut s = seed(&path);
    let before = financial_state(&s); let request = save("held-1");
    let first = s.mutate_held_bill(request.clone()).unwrap();
    assert_eq!(first.bill.draft.total_paise, 12500);
    assert_eq!(s.mutate_held_bill(request).unwrap().bill.revision, first.bill.revision);
    assert_eq!(financial_state(&s), before); drop(s);
    let s = seed(&path); assert_eq!(s.list_held_bills().unwrap().len(), 1); assert_eq!(financial_state(&s), before);
}
#[test]
fn resumed_bill_fences_stale_mutations_and_detached_checkout() {
    let d = tempfile::tempdir().unwrap(); let mut s = seed(&d.path().join("held.db"));
    s.mutate_held_bill(save("held-2")).unwrap();
    s.mutate_held_bill(Mutation { id: "held-2".into(), expected_revision: 1, action: Action::Resume }).unwrap();
    assert!(s.mutate_held_bill(Mutation { id: "held-2".into(), expected_revision: 1, action: Action::Discard }).is_err());
    assert!(guard_checkout(&s.0, &s.1, "unrelated-sale").is_err());
    assert_eq!(financial_state(&s), (0, 0, 0, 100000));
}
#[test]
fn held_checkout_and_completion_are_atomic_and_retry_safe() {
    let d = tempfile::tempdir().unwrap(); let mut s = seed(&d.path().join("held.db"));
    s.mutate_held_bill(save("held-3")).unwrap();
    let resumed = s.mutate_held_bill(Mutation { id: "held-3".into(), expected_revision: 1, action: Action::Resume }).unwrap();
    let invoice = PostInvoice { operation_id: "held-sale".into(), lines: vec![billing::BillLine {
        product_id: "rice".into(), expected_revision: s.list_products().unwrap()[0].revision, quantity_milli: 1250,
    }], tax_basis_points: 0, tender: Tender::Cash, customer_id: None };
    let prepared = Prepare { id: "held-3".into(), expected_revision: resumed.bill.revision, invoice: invoice.clone(), payments: None };
    s.prepare_held_checkout(prepared.clone()).unwrap(); s.prepare_held_checkout(prepared).unwrap();
    assert_eq!(financial_state(&s), (0, 0, 0, 100000));
    s.0.execute_batch("CREATE TRIGGER fail_held_completion BEFORE UPDATE ON local_held_bills WHEN NEW.state='completed' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(s.post_invoice(invoice.clone()).is_err()); assert_eq!(financial_state(&s), (0, 0, 0, 100000));
    s.0.execute_batch("DROP TRIGGER fail_held_completion;").unwrap();
    s.post_invoice(invoice.clone()).unwrap(); s.post_invoice(invoice).unwrap();
    assert_eq!(financial_state(&s), (1, 0, 0, 98750));
    assert_eq!(row(&s.0, "held-3", &s.1.as_ref().unwrap().actor_id).unwrap().state, "completed");
}
#[test]
fn another_actor_cannot_read_or_mutate_the_draft() {
    let d = tempfile::tempdir().unwrap(); let mut s = seed(&d.path().join("held.db"));
    s.mutate_held_bill(save("held-4")).unwrap();
    assert!(matches!(row(&s.0, "held-4", "other-actor"), Err(StoreError::Forbidden)));
    s.1 = None; assert!(matches!(s.list_held_bills(), Err(StoreError::Locked)));
}
