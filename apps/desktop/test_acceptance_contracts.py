"""Static invariants for the installed-app acceptance scripts.

These are the defects this repository has actually shipped in its own harness,
turned into checks that run in seconds. Each one is here because it cost a run:

  * an expected stock figure that contradicted the run's own assertions
    (the audit demanded 2.5 pcs while the GUI read 1.5 and later 3.0),
  * a field name the product never emits (`balancePaise` on `Supplier`),
  * a closing-balance figure pinned at 75.00 for a stage that closed at 80.00,
  * a dialog driver that pressed Save without verifying the filename landed.

    python -m unittest discover -s apps/desktop -p test_acceptance_contracts.py
"""
import ast
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
NATIVE = HERE / "check-native.py"
AUDIT = HERE / "check-purchasing-store.py"


def module_assignments(path):
    """Top-level integer constants of a module, without importing it.

    Literals are read directly; arithmetic over names already seen is evaluated
    with those names, so `EXPECTED = OPENING + NET` is resolved the way Python
    will resolve it at runtime rather than skipped.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    values = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, int):
            values[name] = node.value.value
            continue
        if not isinstance(node.value, ast.BinOp):
            continue
        try:
            expression = ast.Expression(body=node.value)
            values[name] = eval(  # noqa: S307 - a parsed integer expression from this repo
                compile(expression, str(path), "eval"), {"__builtins__": {}}, dict(values)
            )
        except Exception:
            continue
    return values


def module_source(path):
    return path.read_text(encoding="utf-8")


class StockArithmetic(unittest.TestCase):
    def test_audit_stock_baseline_matches_the_gui_assertions(self):
        # The GUI reads 1.5 pcs immediately before purchasing begins. That number
        # is read out of the script's own assertions rather than restated, so the
        # two files cannot drift apart again.
        source = module_source(NATIVE)
        retail_stock = re.findall(r'assert_balances\("[\d.]+", "[\d.]+", "([\d.]+)"\)', source)
        self.assertIn("1.5", retail_stock, "the retail stage no longer reads 1.5 pcs before purchasing")
        constants = module_assignments(AUDIT)
        self.assertEqual(constants["OPENING_RICE_MILLI"], 1500)
        self.assertEqual(constants["NET_STOCK_MILLI"], 1500)
        self.assertEqual(
            constants["EXPECTED_RICE_MILLI"],
            constants["OPENING_RICE_MILLI"] + constants["NET_STOCK_MILLI"],
        )

    def test_net_stock_movement_is_derived_from_the_receipts(self):
        constants = module_assignments(AUDIT)
        accepted = constants["RECEIPT_PARTIAL_GOODS"] + constants["RECEIPT_REMAINDER"]
        damaged = constants["RECEIPT_PARTIAL_DAMAGED"]
        returned = constants["RETURN"]
        # The order line the GUI creates: 2 pcs at ₹100.00 each, so the store
        # holds unit_cost_paise = 10000 and 10 paise buys one milli.
        unit_cost = 10000
        # (7500 + 10000 - 2500) paise of goods at 10000 paise per 1000 milli.
        movement = (accepted - returned) * 1000 // unit_cost
        self.assertEqual(movement, constants["NET_STOCK_MILLI"])
        # Damaged goods are excluded from the payable and from stock, so they
        # may never appear in the movement the audit derives.
        self.assertNotIn(damaged, (accepted, movement))

    def test_payable_ledger_sums_to_the_closing_balance(self):
        constants = module_assignments(AUDIT)
        ledger = (
            constants["RECEIPT_PARTIAL_GOODS"]
            + constants["INVOICE_VARIANCE"]
            - constants["PARTIAL_PAYMENT"]
            - constants["RETURN"]
            + constants["RECEIPT_REMAINDER"]
        )
        self.assertEqual(ledger, constants["CLOSING_PAYABLE"])
        # The GUI removes the final 105.00 and restores 125.00, so the fixed
        # ledger figures describe the whole pre-restore lifecycle exactly.
        self.assertEqual(constants["CLOSING_PAYABLE"] + constants["PARTIAL_PAYMENT"], 15500)


class ProductFieldNames(unittest.TestCase):
    """The audit must use the key names the product serialises (camelCase)."""

    def test_supplier_balance_is_read_by_its_serialised_name(self):
        source = module_source(AUDIT)
        self.assertIn('supplier["balancePaise"]', source)
        # Indexing the store response with the Rust field name would read a key
        # that never exists: the product serialises camelCase.
        for snake in ('["balance_paise"]', '["overdue_paise"]', '["stock_milli"]',
                      '["goods_total_paise"]', '["received_milli"]'):
            self.assertNotIn(snake, source, f"the audit indexes the store with {snake}")

    def test_audit_field_names_exist_on_the_product_structs(self):
        purchasing = (HERE.parent.parent / "packages/local-store/src/purchasing.rs").read_text(
            encoding="utf-8"
        )
        catalog = (HERE.parent.parent / "packages/local-store/src/catalog.rs").read_text(
            encoding="utf-8"
        )
        for field in ("balance_paise", "overdue_paise", "received_milli", "damaged_milli",
                      "line_subtotal_paise", "goods_total_paise", "damaged_total_paise",
                      "order_status", "unit_cost_paise", "running_balance_paise",
                      "opening_balance_paise", "closing_balance_paise", "operation_id"):
            self.assertIn(f"pub {field}:", purchasing, f"purchasing.rs has no {field}")
        self.assertIn("pub stock_milli:", catalog)


class PinnedFigures(unittest.TestCase):
    """A pinned figure must be the one the product displayed at that point."""

    def test_no_stage_pins_a_closing_balance_it_did_not_earn(self):
        source = module_source(NATIVE)
        # The restart-after-partial-receipt stage used to demand 7500 here while
        # the preceding assertions had already credited the 500 variance, so the
        # statement read 8000. The stage now re-asserts the figure the product
        # itself showed before the restart.
        stage = source[source.index("Restart and recovery in the middle"):]
        stage = stage[: stage.index("Delivery challan") if "Delivery challan" in stage else 4000]
        self.assertIn("opening_balance = message_text", stage)
        self.assertIn("assert_closing_balance(FIRST_RECEIPT_ACCRUAL)", stage)

    def test_the_accounting_after_the_restart_is_the_pinned_one(self):
        source = module_source(NATIVE)
        # These are the figures the lifecycle produces after the restart, and the
        # audit's fixed constants describe exactly them.
        self.assertIn('message_visible("Supplier statement · closing balance ₹80.00")', source)
        self.assertIn('message_visible("Supplier statement · closing balance ₹50.00")', source)
        self.assertIn('message_visible("Supplier statement · closing balance ₹25.00")', source)
        self.assertIn("assert_closing_balance(12500)", source)
        self.assertIn("assert_closing_balance(0)", source)


class DialogDriverUse(unittest.TestCase):
    def test_the_acceptance_never_presses_save_without_the_shared_driver(self):
        source = module_source(NATIVE)
        self.assertIn("import native_dialog", source)
        self.assertIn("native_dialog.close_dialog(", source)
        # The old inline loop that re-resolved a dialog and clicked blind is gone.
        self.assertNotIn("any_live_dialog", source)

    def test_every_dialog_call_names_its_mode(self):
        source = module_source(NATIVE)
        calls = re.findall(r"pick_native_file\(([^\n]*)\)", source)
        self.assertTrue(calls)
        for call in calls:
            if "Choose encrypted Sornio backup" in call:
                self.assertIn('mode="open"', call, f"open dialog called without its mode: {call}")

    def test_the_export_open_restart_export_regression_is_present(self):
        source = module_source(NATIVE)
        for marker in ("export-before-restart", "restart", "export-after-restart", "open-after-restart"):
            self.assertIn(marker, source, f"the dialog regression no longer records {marker}")
        self.assertIn("dialog-regression-result.json", source)


class AuditScheduling(unittest.TestCase):
    def test_the_audit_step_runs_even_when_the_gui_stage_failed(self):
        workflow = (HERE.parent.parent / ".github/workflows/windows-local.yml").read_text(
            encoding="utf-8"
        )
        step = workflow[workflow.index("Audit the persisted purchasing state"):]
        self.assertIn("if: always()", step[:2000])
        # It must not be softened to continue-on-error, which would hide an
        # audit failure behind a green step.
        self.assertNotIn("continue-on-error", step[:2000])

    def test_the_dialog_driver_test_is_wired_into_ci(self):
        workflow = (HERE.parent.parent / ".github/workflows/windows-local.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("test_native_dialog.py", workflow)


if __name__ == "__main__":
    unittest.main()
