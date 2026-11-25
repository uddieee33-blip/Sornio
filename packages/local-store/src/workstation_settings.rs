//! Persisted counter hardware, receipt layout, scanner suffix, and backup
//! destination preferences on the encrypted local database (schema v24).
//! Software configuration only: physical printer, scanner, and cash-drawer
//! verification still require physical shop hardware.
use crate::{Store, StoreError};
use rusqlite::{params, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkstationSettings {
    pub receipt_layout: String,
    pub receipt_language: String,
    pub printer_name: String,
    pub barcode_suffix: String,
    pub cash_drawer_mode: String,
    pub backup_destination_note: String,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveWorkstationSettings {
    pub expected_revision: i64,
    pub receipt_layout: String,
    pub receipt_language: String,
    pub printer_name: String,
    pub barcode_suffix: String,
    pub cash_drawer_mode: String,
    pub backup_destination_note: String,
}

pub(crate) fn migrate(tx: &Transaction<'_>) -> Result<(), StoreError> {
    tx.execute_batch(include_str!("workstation_settings-schema.sql"))?;
    Ok(())
}

fn text_valid(value: &str, max_chars: usize) -> bool {
    value.len() <= max_chars * 4
        && value.chars().count() <= max_chars
        && !value.chars().any(char::is_control)
}

/// Pure ESC/POS RJ11 drawer-kick pulse bytes for supported thermal printer ports.
/// Physical drawer actuation requires a connected thermal printer and drawer.
pub fn cash_drawer_escpos_command(mode: &str) -> Option<&'static [u8]> {
    match mode {
        "escpos_pin2" => Some(&[0x1B, 0x70, 0x00, 0x19, 0xFA]),
        "escpos_pin5" => Some(&[0x1B, 0x70, 0x01, 0x19, 0xFA]),
        _ => None,
    }
}

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkstationSettings> {
    Ok(WorkstationSettings {
        receipt_layout: row.get(0)?,
        receipt_language: row.get(1)?,
        printer_name: row.get(2)?,
        barcode_suffix: row.get(3)?,
        cash_drawer_mode: row.get(4)?,
        backup_destination_note: row.get(5)?,
        revision: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

impl Store {
    pub(crate) fn read_workstation_settings(&self) -> Result<WorkstationSettings, StoreError> {
        let settings = self.0.query_row(
            "SELECT receipt_layout, receipt_language, printer_name, barcode_suffix,
                    cash_drawer_mode, backup_destination_note, revision, updated_at
             FROM local_workstation_settings
             WHERE singleton = 1",
            [],
            read_row,
        )?;
        Ok(settings)
    }

    pub(crate) fn save_workstation_settings(
        &mut self,
        request: SaveWorkstationSettings,
    ) -> Result<WorkstationSettings, StoreError> {
        if request.expected_revision <= 0
            || !matches!(request.receipt_layout.as_str(), "58mm" | "80mm" | "a4")
            || !matches!(request.receipt_language.as_str(), "en" | "pa")
            || !matches!(
                request.barcode_suffix.as_str(),
                "enter" | "tab" | "enter_or_tab"
            )
            || !matches!(
                request.cash_drawer_mode.as_str(),
                "none" | "manual_only" | "escpos_pin2" | "escpos_pin5"
            )
            || !text_valid(&request.printer_name, 160)
            || !text_valid(&request.backup_destination_note, 200)
        {
            return Err(StoreError::InvalidDraft);
        }
        let printer_name = request.printer_name.trim().to_string();
        let backup_destination_note = request.backup_destination_note.trim().to_string();
        let tx = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::identity::guard(
            &tx,
            &self.1,
            crate::identity::Permission::Settings,
            "workstation.settings_updated",
            None,
        )?;
        let current_revision: i64 = tx.query_row(
            "SELECT revision FROM local_workstation_settings WHERE singleton = 1",
            [],
            |r| r.get(0),
        )?;
        if current_revision != request.expected_revision {
            return Err(StoreError::Conflict);
        }
        let next_revision = current_revision
            .checked_add(1)
            .ok_or(StoreError::InvalidDraft)?;
        let changed = tx.execute(
            "UPDATE local_workstation_settings
             SET receipt_layout = ?1,
                 receipt_language = ?2,
                 printer_name = ?3,
                 barcode_suffix = ?4,
                 cash_drawer_mode = ?5,
                 backup_destination_note = ?6,
                 revision = ?7,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE singleton = 1 AND revision = ?8",
            params![
                request.receipt_layout,
                request.receipt_language,
                printer_name,
                request.barcode_suffix,
                request.cash_drawer_mode,
                backup_destination_note,
                next_revision,
                request.expected_revision,
            ],
        )?;
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        let updated = tx.query_row(
            "SELECT receipt_layout, receipt_language, printer_name, barcode_suffix,
                    cash_drawer_mode, backup_destination_note, revision, updated_at
             FROM local_workstation_settings
             WHERE singleton = 1",
            [],
            read_row,
        )?;
        tx.commit()?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::access::Workspace;
    use crate::identity::{Role, StaffDetails};

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const PASSWORD: &str = "Workstation settings owner password";

    #[test]
    fn workstation_settings_persist_enforce_owner_and_check_revision() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.db");
        let mut w = Workspace::new(Store::open(&path, KEY).unwrap());
        w.setup(PASSWORD).unwrap();
        let initial = w.read_workstation_settings().unwrap();
        assert_eq!(initial.receipt_layout, "80mm");
        assert_eq!(initial.receipt_language, "en");
        assert_eq!(initial.barcode_suffix, "enter");
        assert_eq!(initial.cash_drawer_mode, "none");
        assert_eq!(initial.revision, 1);

        let saved = w
            .save_workstation_settings(SaveWorkstationSettings {
                expected_revision: 1,
                receipt_layout: "58mm".into(),
                receipt_language: "pa".into(),
                printer_name: "EPSON TM-T82III".into(),
                barcode_suffix: "enter_or_tab".into(),
                cash_drawer_mode: "escpos_pin2".into(),
                backup_destination_note: "USB Drive E:\\SornioBackups".into(),
            })
            .unwrap();
        assert_eq!(saved.revision, 2);
        assert_eq!(saved.receipt_layout, "58mm");
        assert_eq!(saved.receipt_language, "pa");
        assert_eq!(saved.printer_name, "EPSON TM-T82III");
        assert_eq!(saved.barcode_suffix, "enter_or_tab");
        assert_eq!(saved.cash_drawer_mode, "escpos_pin2");
        assert_eq!(saved.backup_destination_note, "USB Drive E:\\SornioBackups");

        // Stale revision is rejected.
        assert!(matches!(
            w.save_workstation_settings(SaveWorkstationSettings {
                expected_revision: 1,
                receipt_layout: "a4".into(),
                receipt_language: "en".into(),
                printer_name: String::new(),
                barcode_suffix: "enter".into(),
                cash_drawer_mode: "none".into(),
                backup_destination_note: String::new(),
            }),
            Err(StoreError::Conflict)
        ));

        // Invalid enum/control chars are rejected.
        assert!(matches!(
            w.save_workstation_settings(SaveWorkstationSettings {
                expected_revision: 2,
                receipt_layout: "letter".into(),
                receipt_language: "en".into(),
                printer_name: String::new(),
                barcode_suffix: "enter".into(),
                cash_drawer_mode: "none".into(),
                backup_destination_note: String::new(),
            }),
            Err(StoreError::InvalidDraft)
        ));

        // Cashier can read settings (needed for counter scanning & receipts),
        // but cannot modify them.
        w.create_staff(
            StaffDetails {
                username: "counter1".into(),
                display_name: "Counter Staff".into(),
                role: Role::Cashier,
            },
            PASSWORD,
        )
        .unwrap();
        w.lock();
        drop(w);

        let mut reopened = Workspace::new(Store::open(&path, KEY).unwrap());
        reopened.login("counter1", PASSWORD).unwrap();
        let read_back = reopened.read_workstation_settings().unwrap();
        assert_eq!(read_back.receipt_layout, "58mm");
        assert_eq!(read_back.receipt_language, "pa");
        assert_eq!(read_back.printer_name, "EPSON TM-T82III");
        assert_eq!(read_back.barcode_suffix, "enter_or_tab");
        assert_eq!(read_back.revision, 2);
        assert!(matches!(
            reopened.save_workstation_settings(SaveWorkstationSettings {
                expected_revision: 2,
                receipt_layout: "a4".into(),
                receipt_language: "en".into(),
                printer_name: String::new(),
                barcode_suffix: "enter".into(),
                cash_drawer_mode: "none".into(),
                backup_destination_note: String::new(),
            }),
            Err(StoreError::Forbidden)
        ));
    }

    #[test]
    fn cash_drawer_escpos_commands_match_standard_pulse_bytes() {
        assert_eq!(
            cash_drawer_escpos_command("escpos_pin2"),
            Some(&[0x1B, 0x70, 0x00, 0x19, 0xFA][..])
        );
        assert_eq!(
            cash_drawer_escpos_command("escpos_pin5"),
            Some(&[0x1B, 0x70, 0x01, 0x19, 0xFA][..])
        );
        assert_eq!(cash_drawer_escpos_command("manual_only"), None);
        assert_eq!(cash_drawer_escpos_command("none"), None);
        assert_eq!(cash_drawer_escpos_command("unknown"), None);
    }
}
