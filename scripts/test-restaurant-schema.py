"""Exercise restaurant SQLite constraints; this does not execute native Rust commands."""
import sqlite3
import tempfile
from pathlib import Path
schema = (Path(__file__).resolve().parent.parent / 'packages/local-store/src/restaurant-schema.sql').read_text()
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / 'restaurant.db'
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('CREATE TABLE local_principals(id TEXT PRIMARY KEY)')
    db.execute("INSERT INTO local_principals VALUES('owner')")
    db.executescript(schema)
    db.execute("INSERT INTO local_restaurant_tables VALUES('t1','Table 1',1)")
    db.execute("INSERT INTO local_restaurant_orders VALUES('o1','t1','dine_in','open',1)")
    db.execute("INSERT INTO local_restaurant_tickets VALUES('k1','o1','[]','pending',1)")
    db.execute("INSERT INTO local_restaurant_events(operation_id,actor_id,request) VALUES('op1','owner','ticket')")
    db.commit(); db.close()
    db = sqlite3.connect(path); db.execute('PRAGMA foreign_keys=ON')
    assert db.execute('SELECT state FROM local_restaurant_tickets WHERE id=?',('k1',)).fetchone() == ('pending',)
    def refused(sql):
        try: db.execute(sql)
        except sqlite3.IntegrityError: return
        raise AssertionError('Expected SQLite constraint refusal')
    refused("INSERT INTO local_restaurant_orders VALUES('o2','t1','dine_in','open',1)")
    refused("INSERT INTO local_restaurant_tickets VALUES('k1','o1','[]','pending',1)")
    refused("INSERT INTO local_restaurant_events(operation_id,actor_id,request) VALUES('op1','owner','other')")
    refused("UPDATE local_restaurant_events SET request='changed' WHERE operation_id='op1'")
    refused("DELETE FROM local_restaurant_events WHERE operation_id='op1'")
    refused("INSERT INTO local_restaurant_orders VALUES('o3',NULL,'dine_in','open',1)")
    assert db.execute('SELECT COUNT(*) FROM local_restaurant_tickets').fetchone()[0] == 1
    db.close()
print('Restaurant SQLite: persistence, table exclusivity, duplicate IDs, append-only events and order-kind constraints passed.')
