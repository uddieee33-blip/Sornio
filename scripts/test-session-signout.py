"""Actual migration and exact-session deletion SQL. Not native Rust/RBAC evidence."""
from pathlib import Path
import json,re,runpy,time
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for label,ddl in groups if label!='session_signout' for s in ddl]);m['seed'](db);assert db.execute('PRAGMA user_version').fetchone()[0]==21
now=int(time.time());db.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES('cook','biz-test','cook','Cook','cashier',1,3,'synthetic')")
if db.execute('SELECT count(*) FROM local_recovery_identity').fetchone()[0]==0:db.execute("INSERT INTO local_recovery_identity VALUES(1,'biz-test','generation')")
generation=db.execute('SELECT generation FROM local_recovery_identity').fetchone()[0]
for device in ['one','two']:
 db.execute("INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires) VALUES(?,?,?,?,'approved','cook',?,?)",(device,device,device,generation,now,now+86400));db.execute("INSERT INTO local_hub_sessions VALUES(?,?,1,'cook',3,?,?)",('token-'+device,device,generation,now+900))
before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in ['local_invoices','local_billing_ledger','local_retail_payments','local_credit_entries','local_products','local_principals','local_hub_devices']}
db.executescript((root/'packages/local-store/src/session_signout-schema.sql').read_text());assert db.execute('PRAGMA user_version').fetchone()[0]==22;assert db.execute('SELECT count(*) FROM local_hub_sessions').fetchone()[0]==2
handle=db.execute("SELECT handle FROM local_hub_session_handles WHERE token_hash='token-one'").fetchone()[0];assert len(handle)==32
source=(root/'packages/local-store/src/session_signout.rs').read_text();sql=re.search(r'"(DELETE FROM local_hub_sessions WHERE token_hash=[^"]+)"',source).group(1)
db.execute('SAVEPOINT lost');assert db.execute(sql,(handle,'cook',3,generation)).rowcount==1;assert db.execute('SELECT count(*) FROM local_hub_session_handles').fetchone()[0]==1;db.execute('ROLLBACK TO lost');db.execute('RELEASE lost');assert db.execute('SELECT count(*) FROM local_hub_sessions').fetchone()[0]==2
assert db.execute(sql,(handle,'p1',3,generation)).rowcount==0;assert db.execute(sql,(handle,'cook',2,generation)).rowcount==0;assert db.execute(sql,(handle,'cook',3,'foreign')).rowcount==0
assert db.execute(sql,(handle,'cook',3,generation)).rowcount==1;assert db.execute('SELECT count(*) FROM local_hub_session_handles').fetchone()[0]==1
# Reauthentication on the same device must remain unaffected by a delayed old request.
db.execute("INSERT INTO local_hub_sessions VALUES('new-token','one',1,'cook',3,?,?)",(generation,now+900));db.execute("INSERT INTO local_hub_session_handles VALUES(lower(hex(randomblob(16))),'new-token')");assert db.execute(sql,(handle,'cook',3,generation)).rowcount==0;assert db.execute("SELECT count(*) FROM local_hub_sessions WHERE token_hash='new-token'").fetchone()[0]==1
assert before=={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in before};assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
query="SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND NOT(type = 'table' AND name = 'sornio_backup_manifest') ORDER BY type,name"
for version,excluded in [(20,{'responsibility_access','session_signout'}),(21,{'session_signout'})]:
 prior=m['build']([s for label,ddl in groups if label not in excluded for s in ddl]);rows=[list(r) for r in prior.execute(query)]
 if version==20:assert rows==json.loads((root/'packages/local-store/fixtures/recovery-v20-schema.json').read_text())
 else:assert rows==json.loads((root/'packages/local-store/fixtures/recovery-v21-schema.json').read_text())
print('Session sign-out SQL passed: v21 session preservation, opaque handles/cascade, exact-session scope, rollback, replacement-session safety and unchanged staff/devices/financial records; v20 recovery control matched.')
