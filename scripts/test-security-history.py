"""Exercise the native security read SQL on the actual migrated schema, not Rust/RBAC execution."""
from pathlib import Path
import runpy,json
root=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']()
db=m['build']([s for _,ddl in groups for s in ddl]);m['seed'](db)
db.execute("INSERT INTO local_principals(id,business_id,username,display_name,role,enabled,revision,password_hash) VALUES('cook','biz-test','cook','Cook','cashier',1,3,'synthetic')")
db.execute("INSERT INTO local_hub_devices(id,name,credential_hash,generation,state,actor_id,created,expires) VALUES('phone','Kitchen phone','NEVER-EXPOSE-CREDENTIAL','g','revoked','cook',0,1)")
request={'businessId':'biz-test','targetActorId':'cook','sessionHandle':'NEVER-EXPOSE-HANDLE','token':'NEVER-EXPOSE-TOKEN'}
for i,outcome in enumerate(['signed_out','already_inactive','refused']):
 result={'status':'refused' if outcome=='refused' else 'accepted','outcome':outcome}
 db.execute("INSERT INTO local_kitchen_assignment_ops(id,actor_id,generation,device,request,state,result,acknowledged) VALUES(?,'p1','g','desktop',?,?,?,1)",(f'op{i}',json.dumps(request),result['status'],json.dumps(result)))

def event(action,target,business='biz-test',workspace='ws-test',actor='p1',date='2026-11-12T00:00:00.000Z'):
 db.execute('INSERT INTO local_identity_audit(business_id,workspace_id,actor_id,actor_role,action,target,created_at,details) VALUES(?,?,?,\'owner\',?,?,?,\'{"credential":"NEVER-EXPOSE-DETAILS"}\')',(business,workspace,actor,action,target,date))
for i in range(3):event('staff.session_signout',f'op{i}')
event('hub.device_approved','phone');event('hub.device_revoked','phone');event('staff.session_signout','legacy-missing')
event('hub.device_revoked','phone',business='other-business');event('hub.device_revoked','phone',workspace='other-workspace');event('invoice.posted','invoice')
sql=(root/'packages/local-store/src/security_history.sql').read_text()
def read(action='',actor='',start='',end='',cursor=None,search='',limit=2,business='biz-test',workspace='ws-test'):
 return db.execute(sql,(business,workspace,action,actor,start,end,cursor,search,limit)).fetchall()
before={t:db.execute(f'SELECT * FROM {t}').fetchall() for t in ['local_identity_audit','local_kitchen_assignment_ops','local_invoices','local_billing_ledger','local_products','local_credit_entries','local_hub_devices','local_principals']}
first=read();second=read(cursor=first[-1][0]);third=read(cursor=second[-1][0]);rows=first+second+third
assert len(rows)==6 and len({r[0] for r in rows})==6
assert read(cursor=third[-1][0])==[]
assert {r[9] for r in rows if r[8] and r[8].startswith('op')}=={'signed_out','already_inactive','refused'}
assert len(read(action='hub.device_revoked'))==1
assert len(read(search='kItChEn',limit=50))==2
assert len(read(search='Cook',limit=50))==3
assert len(read(search='op1',limit=50))==1
assert read(search='%')==[] and read(search="' OR 1=1 --")==[]
assert read(actor='cook')==[] and read(business='none')==[] and read(workspace='none')==[]
assert read(start='2026-11-13')==[] and read(end='2026-11-11')==[]
assert read(start='2026-11-12',end='2026-11-12',limit=50)==rows
assert rows[0][6]=='operation' and rows[0][9] is None # Never invent missing old receipts.
assert 'NEVER-EXPOSE' not in json.dumps(rows)
# A later audit record cannot duplicate or displace entries in an older sequence page.
event('hub.device_revoked','phone');assert read(cursor=first[-1][0])==second
db.execute("UPDATE local_principals SET display_name='Renamed cook' WHERE id='cook'")
assert len(read(search='Renamed cook',limit=50))==3 # Explicitly current names, not historical snapshots.
# Deliberately do not assert unchanged principals/audit after our own test writes.
for t in before:
 if t not in ('local_identity_audit','local_principals'):assert db.execute(f'SELECT * FROM {t}').fetchall()==before[t]
assert db.execute('PRAGMA user_version').fetchone()[0]==22
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Security history SQL passed: stable bounded pages, tied timestamps, scope/action/actor/date/literal search filters, durable outcomes, legacy gaps, redaction, current-name labels and unchanged financial/session/device records.')
