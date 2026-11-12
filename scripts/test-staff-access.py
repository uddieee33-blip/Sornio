"""Execute authoritative read queries; not native Rust/SQLCipher permission verification."""
from pathlib import Path
import json,runpy,time
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for _,ddl in groups for s in ddl]);m['seed'](db)
db.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES('cook','biz-test','cook','Cook','cashier',1,3,'synthetic')")
for n,mode in enumerate(['preparer','supervisor','revoked']):db.execute("INSERT INTO local_kitchen_staff_events(id,actor_id,request,result,created_at) VALUES(?,'p1','{}',?,'2026-11-12T00:00:00.000Z')",(f'change{n}',json.dumps({'employeeId':'cook','mode':mode,'revision':n+1})))
sql=(root/'packages/local-store/src/staff_access-history.sql').read_text()
def audit(before='',id='',business='biz-test',start='',end='',limit=2):return db.execute(sql,('cook',business,start,end,before,id,limit)).fetchall()
first=audit();second=audit(before=first[-1][5],id=first[-1][0]);assert len(first+second)==3;assert len(set(r[0] for r in first+second))==3;assert audit(business='foreign')==[];assert audit(start='2027-01-01')==[];assert audit(start='2026-11-12',end='2026-11-12',limit=50)==first+second
assert db.execute("SELECT COALESCE(date(?,'+0 days')=?,0)",('2026-02-30','2026-02-30')).fetchone()[0]==0
assert db.execute("SELECT COALESCE(date(?,'+0 days')=?,0)",('2024-02-29','2024-02-29')).fetchone()[0]==1
if db.execute('SELECT count(*) FROM local_recovery_identity').fetchone()[0]==0:db.execute("INSERT INTO local_recovery_identity VALUES(1,'biz-test','generation')")
generation=db.execute('SELECT generation FROM local_recovery_identity').fetchone()[0];now=int(time.time())
db.execute("INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires,revision,last_seen) VALUES('phone','Kitchen phone','synthetic-hash',?,'approved','cook',?, ?,1,?)",(generation,now,now+86400,now));db.execute("INSERT INTO local_hub_sessions VALUES('synthetic-token','phone',1,'cook',3,?,?)",(generation,now+900));db.commit()
session_sql=(root/'packages/local-store/src/staff_access-sessions.sql').read_text()
def sessions(business='biz-test'):return db.execute(session_sql,('cook',business)).fetchall()
assert len(sessions())==1;assert sessions('foreign')==[]
db.execute('SAVEPOINT shorter_grant');db.execute("UPDATE local_hub_devices SET expires=?",(now+60,));assert sessions()[0][2]==now+60;db.execute('ROLLBACK TO shorter_grant');db.execute('RELEASE shorter_grant')
for statement in ["UPDATE local_hub_devices SET state='revoked'", "UPDATE local_hub_devices SET revision=2", "UPDATE local_hub_devices SET actor_id='p1'", "UPDATE local_hub_sessions SET actor_revision=1", "UPDATE local_hub_sessions SET expires=0", "UPDATE local_hub_devices SET expires=0", "UPDATE local_principals SET enabled=0 WHERE id='cook'", "UPDATE local_hub_sessions SET generation='old'", "INSERT INTO local_kitchen_staff VALUES('cook','revoked')"]:
 db.execute('SAVEPOINT invalid');db.execute(statement);assert sessions()==[],statement;db.execute('ROLLBACK TO invalid');db.execute('RELEASE invalid')
assert db.execute('PRAGMA foreign_key_check').fetchall()==[];assert db.execute('SELECT count(*) FROM local_invoices').fetchone()[0]==1
assert 'token_hash' not in session_sql.split('FROM')[0]
print('Staff access SQL passed: bounded tied-time pages, employee/business/date isolation and revoked/expired/stale/disabled/generation-invalid session exclusion; no token fields returned.')
