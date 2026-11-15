"""Run actual native history SQL against real migrated SQLite, including keyset pages."""
from pathlib import Path
import json,runpy
root=Path(__file__).resolve().parents[1];m=runpy.run_path(str(root/'scripts/verify-local-schema.py'));groups,_=m['load_migrations']();db=m['build']([s for _,ddl in groups for s in ddl]);m['seed'](db)
db.execute("INSERT INTO local_restaurant_tables VALUES('table','Table 8',1)");db.execute("INSERT INTO local_restaurant_orders(id,table_id,kind,state,revision) VALUES('order','table','dine_in','open',1)");db.execute("INSERT INTO local_restaurant_tickets VALUES('kot','order',?,'ready',3)",(json.dumps([{'name':'Pizza','quantity':2,'note':'No onion'}]),))
for n,state in enumerate(['preparing','ready','served']):
 db.execute("INSERT INTO local_restaurant_events(operation_id,actor_id,request,created_at) VALUES(?,'p1',?,'2026-11-12T00:00:00.000Z')",(f'op{n}',json.dumps({'operationId':f'op{n}','action':{'kind':'set_ticket_state','id':'kot','expected_revision':n+1,'state':state}})))
db.execute("INSERT INTO local_kitchen_staff_events(id,actor_id,ticket_id,request,result,created_at) VALUES('assign','p1','kot','{}',?,'2026-11-11T00:00:00.000Z')",(json.dumps({'actorId':'p1','previousActorId':None}),))
sql=(root/'packages/local-store/src/kitchen_history.sql').read_text()
def query(search='',state='all',start='',end='',before='',id='',limit=2):return db.execute(sql,(search,state,start,end,before,id,limit)).fetchall()
allrows=query(limit=50);assert len(allrows)==4
first=query();second=query(before=first[-1][6],id=first[-1][0]);assert [r[0] for r in first+second]==[r[0] for r in allrows];assert len(set(r[0] for r in first+second))==4
for term in ['Pizza','Owner','Table 8','order','kot']:assert len(query(search=term,limit=50))==4
assert len(query(state='served'))==1;assert len(query(start='2026-11-12',end='2026-11-12',limit=50))==3
assert query(start='2027-01-01')==[]
assert all(not r[10] for r in allrows)
# No fabricated initial Pending event exists.
assert query(state='pending')==[]
assert db.execute('SELECT count(*) FROM local_invoices').fetchone()[0]==1
print('Kitchen history SQL passed: bounded pages, same-time keyset ties, search, dates, recorded states and no synthetic pending events.')
