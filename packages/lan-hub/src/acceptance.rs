//! stdin/stdout control plane for Level-2 acceptance. Business requests go over
//! the production HTTPS listener, never through this control plane. Commands
//! here only provision fixtures, operate desktop-owner controls, restart the
//! process-owned service, and read authoritative SQLCipher records.
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sornio_lan_hub::hub_server::{self, LocalState, Runtime};
use sornio_local_store::{
    access::Workspace,
    catalog::AddProduct,
    identity::{OwnerSetup, Role, StaffDetails},
    restaurant::{Action, Item, Request as RestaurantRequest},
    restaurant_checkout::Menu,
    Store,
};
use std::{
    io::{BufRead, Write},
    net::{SocketAddr, TcpListener},
    path::PathBuf,
    sync::{Arc, Mutex},
};

type Result<T> = std::result::Result<T, String>;
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v[key].as_str().ok_or_else(|| format!("missing {key}"))
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
struct Fixture {
    directory: PathBuf,
    key: String,
    password: String,
    bind: String,
    state: LocalState,
    runtime: Option<Runtime>,
    actors: Value,
    identity: Value,
    owner_credential: String,
    owner_token: String,
}
impl Fixture {
    fn workspace(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, std::result::Result<Workspace, String>>> {
        self.state
            .lock()
            .map_err(|_| "workspace mutex poisoned".into())
    }
    fn db(&self, flags: OpenFlags) -> Result<Connection> {
        let db = Connection::open_with_flags(self.directory.join("authority.db"), flags)
            .map_err(|e| e.to_string())?;
        db.pragma_update(None, "key", &self.key)
            .map_err(|e| e.to_string())?;
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        Ok(db)
    }
    fn start(&mut self, advertise: bool) -> Result<Value> {
        if let Some(mut old) = self.runtime.take() {
            old.halt();
        }
        let address: SocketAddr = format!("{}:0", self.bind)
            .parse()
            .map_err(|_| "invalid bind address")?;
        let listener = TcpListener::bind(address).map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let origin = format!("https://localhost:{port}");
        let (cert, key) = {
            let mut guard = self.workspace()?;
            let w = guard.as_mut().map_err(|e| e.clone())?;
            w.hub_tls().map_err(|e| e.to_string())?
        };
        let tls = hub_server::config(&cert, &key)?;
        let hint = hub_server::tls_status(&cert, &key);
        let ad = advertise.then(|| {
            (
                origin.clone(),
                self.identity.clone(),
                hint["certificateSha256"].as_str().unwrap_or("").into(),
            )
        });
        self.runtime = Some(hub_server::start_listener(
            listener,
            tls,
            self.state.clone(),
            ad,
        )?);
        let discovery = self
            .runtime
            .as_ref()
            .and_then(|r| r.advertisement.as_ref())
            .map(|a| a.status())
            .unwrap_or(json!({"state":"off"}));
        Ok(
            json!({"origin":origin,"address":self.runtime.as_ref().unwrap().address,"identity":self.identity,"actors":self.actors,"discovery":discovery}),
        )
    }
    fn owner_login(&mut self) -> Result<()> {
        let base = json!({"version":1,"hubId":self.identity["hubId"],"businessId":self.identity["businessId"],"deviceId":"acceptance-desktop","username":"owner","password":self.password});
        let session = self
            .workspace()?
            .as_mut()
            .map_err(|e| e.clone())?
            .hub_request("/v1/session", &self.owner_credential, base)
            .map_err(|e| e.to_string())?;
        self.owner_token = session["token"]
            .as_str()
            .ok_or("missing owner token")?
            .into();
        Ok(())
    }
    fn snapshot(&self) -> Result<Value> {
        let db = self.db(OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let cipher: String = db
            .query_row("PRAGMA cipher_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let count = |table: &str| -> Result<i64> {
            db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
                .map_err(|e| e.to_string())
        };
        let rows = |sql: &str| -> Result<Vec<Value>> {
            let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
            let names = statement
                .column_names()
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>();
            let result = statement
                .query_map([], |row| {
                    let mut object = serde_json::Map::new();
                    for (i, name) in names.iter().enumerate() {
                        object.insert(
                            name.clone(),
                            match row.get_ref(i)? {
                                ValueRef::Null => Value::Null,
                                ValueRef::Integer(n) => json!(n),
                                ValueRef::Real(n) => json!(n),
                                ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                                ValueRef::Blob(s) => json!(hex(s)),
                            },
                        );
                    }
                    Ok(Value::Object(object))
                })
                .map_err(|e| e.to_string())?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(result)
        };
        let mut financial = serde_json::Map::new();
        for table in [
            "local_invoices",
            "local_billing_ledger",
            "local_retail_payments",
            "local_retail_journal",
            "local_credit_entries",
            "local_customer_journal",
            "local_restaurant_bindings",
            "local_restaurant_attempts",
        ] {
            financial.insert(table.into(), json!(count(table)?));
        }
        Ok(json!({
            "cipherVersion":cipher,
            "generation":db.query_row("SELECT generation FROM local_recovery_identity", [], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?,
            "tickets":rows("SELECT id,order_id,state,revision,items FROM local_restaurant_tickets ORDER BY id")?,
            "orders":rows("SELECT id,table_id,kind,state,revision,settled_invoice FROM local_restaurant_orders ORDER BY id")?,
            "tables":rows("SELECT id,name,active FROM local_restaurant_tables ORDER BY id")?,
            "products":rows("SELECT id,stock_milli,unit_price_paise,revision FROM local_products ORDER BY id")?,
            "operations":rows("SELECT id,device_id,actor_id,generation,request,result FROM local_hub_operations ORDER BY id")?,
            "events":rows("SELECT operation_id,actor_id,request FROM local_restaurant_events ORDER BY operation_id")?,
            "assignments":rows("SELECT ticket_id,actor_id FROM local_kitchen_ticket_staff ORDER BY ticket_id")?,
            "assignmentHistory":rows("SELECT id,actor_id,ticket_id,request,result FROM local_kitchen_staff_events ORDER BY sequence")?,
            "devices":rows("SELECT id,state,revision,actor_id,generation FROM local_hub_devices ORDER BY id")?,
            "sessionCount":count("local_hub_sessions")?,
            "financial":financial,
        }))
    }
    fn command(&mut self, command: &str, p: &Value) -> Result<Value> {
        match command {
            "snapshot" => self.snapshot(),
            "start" => self.start(p["advertise"].as_bool().unwrap_or(false)),
            "stop" => {
                if let Some(mut r) = self.runtime.take() {
                    r.halt();
                }
                Ok(json!({"stopped":true}))
            }
            "restart" => {
                if let Some(mut r) = self.runtime.take() {
                    r.halt();
                }
                {
                    let mut guard = self.workspace()?;
                    *guard = Err("restarting".into());
                }
                let mut w = Workspace::new(
                    Store::open(&self.directory.join("authority.db"), &self.key)
                        .map_err(|e| e.to_string())?,
                );
                w.login("owner", &self.password)
                    .map_err(|e| e.to_string())?;
                *self.workspace()? = Ok(w);
                self.owner_login()?;
                self.start(false)
            }
            "device" => {
                let actor = p["actorId"].as_str().map(str::to_owned);
                self.workspace()?
                    .as_mut()
                    .map_err(|e| e.clone())?
                    .hub_device(
                        text(p, "id")?,
                        p["revision"].as_i64().ok_or("missing revision")?,
                        actor.as_deref(),
                    )
                    .map_err(|e| e.to_string())?;
                Ok(json!({"changed":true}))
            }
            "expireSessions" => {
                // Fixture clock advancement only: no business table is touched.
                let db = self.db(OpenFlags::SQLITE_OPEN_READ_WRITE)?;
                db.execute("UPDATE local_hub_sessions SET expires=0", [])
                    .map_err(|e| e.to_string())?;
                Ok(json!({"expired":true}))
            }
            "closeOrder" => {
                self.workspace()?
                    .as_mut()
                    .map_err(|e| e.clone())?
                    .restaurant_action(RestaurantRequest {
                        operation_id: text(p, "operationId")?.into(),
                        action: Action::CancelOrder {
                            id: text(p, "orderId")?.into(),
                            expected_revision: p["expectedRevision"]
                                .as_i64()
                                .ok_or("missing revision")?,
                        },
                    })
                    .map_err(|e| e.to_string())?;
                Ok(json!({"closed":true}))
            }
            "advanceTicket" => {
                self.workspace()?
                    .as_mut()
                    .map_err(|e| e.clone())?
                    .restaurant_action(RestaurantRequest {
                        operation_id: text(p, "operationId")?.into(),
                        action: Action::SetTicketState {
                            id: text(p, "ticketId")?.into(),
                            expected_revision: p["expectedRevision"]
                                .as_i64()
                                .ok_or("missing revision")?,
                            state: text(p, "state")?.into(),
                        },
                    })
                    .map_err(|e| e.to_string())?;
                Ok(json!({"advanced":true}))
            }
            "assign" | "responsibility" => {
                let mut body = json!({"version":1,"hubId":self.identity["hubId"],"businessId":self.identity["businessId"],"actorId":self.actors["owner"],"operationId":p["operationId"],"targetActorId":p["targetActorId"],"expectedRevision":p["expectedRevision"]});
                if command == "assign" {
                    body["ticketId"] = p["ticketId"].clone();
                } else {
                    body["responsibility"] = p["responsibility"].clone();
                }
                let result = self
                    .workspace()?
                    .as_mut()
                    .map_err(|e| e.clone())?
                    .hub_request(
                        if command == "assign" {
                            "/v1/kitchen-assign"
                        } else {
                            "/v1/staff-responsibility"
                        },
                        &self.owner_token,
                        body,
                    )
                    .map_err(|e| e.to_string())?;
                Ok(result)
            }
            "restore" => {
                if let Some(mut r) = self.runtime.take() {
                    r.halt();
                }
                let archive = self.directory.join("acceptance.backup");
                let recovery_password = format!("{}-recovery", self.password);
                let mut guard = self.workspace()?;
                let w = guard.as_mut().map_err(|e| e.clone())?;
                w.export_backup(&archive, &self.password, &recovery_password)
                    .map_err(|e| e.to_string())?;
                let preview = w
                    .preview_backup(&archive, &self.password, &recovery_password, &self.password)
                    .map_err(|e| e.to_string())?;
                w.restore_backup(
                    &archive,
                    &self.directory,
                    &self.password,
                    &recovery_password,
                    &self.password,
                    &preview,
                    &preview.confirmation,
                )
                .map_err(|e| e.to_string())?;
                w.login("owner", &self.password)
                    .map_err(|e| e.to_string())?;
                drop(guard);
                self.start(false)
            }
            "shutdown" => {
                if let Some(mut r) = self.runtime.take() {
                    r.halt();
                }
                Ok(json!({"shutdown":true}))
            }
            _ => Err(format!("unknown control command {command}")),
        }
    }
}

fn initialize(p: &Value) -> Result<Fixture> {
    let directory = PathBuf::from(text(p, "directory")?);
    let key = text(p, "key")?.to_owned();
    let password = text(p, "password")?.to_owned();
    let bind = text(p, "bind")?.to_owned();
    let cert = text(p, "certificate")?.to_owned();
    let tls_key = text(p, "privateKey")?.to_owned();
    let mut w = Workspace::new(
        Store::open(&directory.join("authority.db"), &key).map_err(|e| e.to_string())?,
    );
    w.provision_owner(
        OwnerSetup {
            business_name: "Sornio Acceptance Cafe".into(),
            business_type: "cafe".into(),
            display_name: "Acceptance Owner".into(),
            username: "owner".into(),
        },
        &password,
    )
    .map_err(|e| e.to_string())?;
    let owner = w.local_session().map_err(|e| e.to_string())?.principal.id;
    let manager = w
        .create_staff(
            StaffDetails {
                username: "manager".into(),
                display_name: "Acceptance Manager".into(),
                role: Role::Manager,
            },
            &password,
        )
        .map_err(|e| e.to_string())?;
    let chef = w
        .create_staff(
            StaffDetails {
                username: "chef".into(),
                display_name: "Acceptance Chef".into(),
                role: Role::Cashier,
            },
            &password,
        )
        .map_err(|e| e.to_string())?;
    let waiter = w
        .create_staff(
            StaffDetails {
                username: "waiter".into(),
                display_name: "Acceptance Waiter".into(),
                role: Role::Cashier,
            },
            &password,
        )
        .map_err(|e| e.to_string())?;
    w.add_product(AddProduct {
        operation_id: "pizza".into(),
        name: "Pizza".into(),
        sku: "PIZZA".into(),
        unit: "pcs".into(),
        unit_price_paise: 10000,
        opening_stock_milli: 10000,
    })
    .map_err(|e| e.to_string())?;
    w.save_restaurant_menu(Menu {
        id: "menu-pizza".into(),
        product_id: "pizza".into(),
        category: "Food".into(),
        label: "Pizza".into(),
        variant: "Large".into(),
        available: true,
    })
    .map_err(|e| e.to_string())?;
    for (id, name) in [("table-1", "Table 1"), ("table-2", "Table 2")] {
        w.restaurant_action(RestaurantRequest {
            operation_id: format!("seed-{id}"),
            action: Action::CreateTable {
                id: id.into(),
                name: name.into(),
            },
        })
        .map_err(|e| e.to_string())?;
    }
    for (order, table, ticket) in [
        ("order-1", Some("table-1"), "ticket-1"),
        ("order-2", None, "ticket-2"),
    ] {
        w.restaurant_action(RestaurantRequest {
            operation_id: format!("seed-{order}"),
            action: Action::OpenOrder {
                id: order.into(),
                table_id: table.map(str::to_owned),
            },
        })
        .map_err(|e| e.to_string())?;
        w.restaurant_action(RestaurantRequest {
            operation_id: format!("seed-{ticket}"),
            action: Action::SendTicket {
                id: ticket.into(),
                order_id: order.into(),
                expected_revision: 1,
                items: vec![Item {
                    name: "Pizza".into(),
                    quantity: 1,
                    note: "Less spice".into(),
                    product_id: Some("pizza".into()),
                    unit_price_paise: Some(10000),
                }],
            },
        })
        .map_err(|e| e.to_string())?;
    }
    w.hub_configure(true, Some((cert, tls_key)))
        .map_err(|e| e.to_string())?;
    let identity = w.hub_admin().map_err(|e| e.to_string())?["identity"].clone();
    let owner_credential = hex(&Sha256::digest(format!("acceptance-owner-{key}")));
    let base = json!({"version":1,"hubId":identity["hubId"],"businessId":identity["businessId"]});
    let mut enrollment = base.clone();
    enrollment["deviceId"] = json!("acceptance-desktop");
    enrollment["name"] = json!("Acceptance desktop");
    enrollment["credential"] = json!(owner_credential);
    w.hub_request("/v1/enrol", "", enrollment)
        .map_err(|e| e.to_string())?;
    w.hub_device("acceptance-desktop", 1, Some(&owner))
        .map_err(|e| e.to_string())?;
    let mut login = base.clone();
    login["deviceId"] = json!("acceptance-desktop");
    login["username"] = json!("owner");
    login["password"] = json!(password);
    let session = w
        .hub_request("/v1/session", &owner_credential, login)
        .map_err(|e| e.to_string())?;
    let owner_token = session["token"]
        .as_str()
        .ok_or("missing owner token")?
        .to_owned();
    let actors = json!({"owner":owner,"manager":manager.id,"chef":chef.id,"waiter":waiter.id});
    let mut fixture = Fixture {
        directory,
        key,
        password,
        bind,
        state: Arc::new(Mutex::new(Ok(w))),
        runtime: None,
        actors,
        identity,
        owner_credential,
        owner_token,
    };
    for (operation, target, revision, responsibility) in [
        ("seed-chef", chef.id, 1, "preparer"),
        ("seed-waiter", waiter.id, 1, "preparer"),
    ] {
        let result = fixture.command("responsibility", &json!({"operationId":operation,"targetActorId":target,"expectedRevision":revision,"responsibility":responsibility}))?;
        if result["status"] != "accepted" {
            return Err(format!("seed responsibility refused: {result}"));
        }
    }
    let result = fixture.command("assign", &json!({"operationId":"seed-assignment","ticketId":"ticket-1","expectedRevision":1,"targetActorId":chef.id}))?;
    if result["status"] != "accepted" {
        return Err(format!("seed assignment refused: {result}"));
    }
    Ok(fixture)
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut fixture: Option<Fixture> = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let _ = writeln!(stdout, "{}", json!({"ok":false,"error":e.to_string()}));
                continue;
            }
        };
        let id = value["id"].clone();
        let command = value["command"].as_str().unwrap_or("");
        let result = (|| -> Result<Value> {
            if command == "init" {
                if fixture.is_some() {
                    return Err("already initialized".into());
                }
                let mut f = initialize(&value["params"])?;
                let started = f.start(value["params"]["advertise"].as_bool().unwrap_or(false))?;
                let baseline = f.snapshot()?;
                fixture = Some(f);
                return Ok(json!({"started":started,"baseline":baseline}));
            }
            let f = fixture.as_mut().ok_or("not initialized")?;
            f.command(command, &value["params"])
        })();
        let reply = match result {
            Ok(result) => json!({"id":id,"ok":true,"result":result}),
            Err(error) => json!({"id":id,"ok":false,"error":error}),
        };
        if writeln!(stdout, "{reply}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
        if command == "shutdown" {
            break;
        }
    }
    if let Some(mut f) = fixture {
        if let Some(mut r) = f.runtime.take() {
            r.halt();
        }
    }
}
