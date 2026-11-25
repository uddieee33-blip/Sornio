CREATE TABLE local_workstation_settings (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    receipt_layout TEXT NOT NULL DEFAULT '80mm' CHECK (receipt_layout IN ('58mm', '80mm', 'a4')),
    receipt_language TEXT NOT NULL DEFAULT 'en' CHECK (receipt_language IN ('en', 'pa')),
    printer_name TEXT NOT NULL DEFAULT '',
    barcode_suffix TEXT NOT NULL DEFAULT 'enter' CHECK (barcode_suffix IN ('enter', 'tab', 'enter_or_tab')),
    cash_drawer_mode TEXT NOT NULL DEFAULT 'none' CHECK (cash_drawer_mode IN ('none', 'manual_only', 'escpos_pin2', 'escpos_pin5')),
    backup_destination_note TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO local_workstation_settings (singleton) VALUES (1);
CREATE INDEX local_products_name_nocase ON local_products(name COLLATE NOCASE, id);
PRAGMA user_version = 24;
