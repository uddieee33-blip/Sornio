import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const db = new PGlite();
let passed = 0;
const check = (value, label) => { if (!value) throw new Error(label); passed++; console.log('ok '+label); };
const owner='00000000-0000-0000-0000-000000000001', stranger='00000000-0000-0000-0000-000000000002', staff='00000000-0000-0000-0000-000000000003';
await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; INSERT INTO auth.users VALUES('${owner}'),('${stranger}'); CREATE TABLE products(id integer); INSERT INTO products SELECT generate_series(1,6);`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261021185718_owner_plan_foundation.sql',import.meta.url),'utf8'));
async function as(user,sql,args=[]) {
 await db.exec('BEGIN');
 try { await db.exec('SET LOCAL ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]); const r=await db.query(sql,args); await db.exec('COMMIT');return {ok:true,rows:r.rows}; }
 catch(e){await db.exec('ROLLBACK');return {ok:false,code:e.code,error:e.message};}
}
const rows=await db.query('select * from business_members order by user_id');
check(rows.rows.length===2 && rows.rows.every(r=>r.role==='owner'),'existing accounts receive separate owner seats');
check((await db.query('select count(*)::int as c from products')).rows[0].c===6,'existing products remain untouched');
const business=rows.rows[0].business_id;
const a=await as(owner,'select ensure_owner_business() as scope');
const b=await as(owner,'select ensure_owner_business() as scope');
check(a.ok&&b.ok&&a.rows[0].scope.businessId===b.rows[0].scope.businessId,'owner bootstrap is idempotent');
const attack=await as(stranger,"insert into business_members(business_id,user_id,role) values($1,$2,'owner')",[business,stranger]);
check(!attack.ok,'a stranger cannot claim another business');
check((await as(stranger,'select * from businesses where id=$1',[business])).rows.length===0,'business reads stay isolated');
await db.query('insert into auth.users values($1)',[staff]);
await db.query("insert into business_members(business_id,user_id,role) values($1,$2,'staff')",[business,staff]);
check(!(await as(staff,"select change_business_plan('start-trial')")).ok,'staff cannot grant a trial');
const trial=await as(owner,"select change_business_plan('start-trial') as record");
check(trial.ok&&trial.rows[0].record.planId==='trial','owner can start the trial');
check(trial.rows[0].record.trialEndsAt-trial.rows[0].record.since===7*86400,'trial duration matches the seven-day catalogue');
await as(owner,"select change_business_plan('choose-plan')");
check(!(await as(owner,"select change_business_plan('start-trial')")).ok,'downgrading or clearing cookies cannot restart the trial');
check(!(await as(owner,"insert into business_plan_records(business_id,record) values($1,'{}')",[business])).ok,'direct browser writes cannot grant plans');
const hash=createHash('sha256').update('opaque-test-key').digest('hex');
await db.query("insert into plan_activation_keys(code_hash,business_id,plan_id,months,payment_reference,expires_at) values($1,$2,'growth',3,'TEST-UTR',now()+interval '1 day')",[hash,business]);
check(!(await as(stranger,"select change_business_plan('activate',$1)",[hash])).ok,'activation keys are bound to their business');
check(!(await as(staff,"select change_business_plan('activate',$1)",[hash])).ok,'staff cannot redeem activation keys');
const paid=await as(owner,"select change_business_plan('activate',$1) as record",[hash]);
check(paid.ok&&paid.rows[0].record.planId==='growth','a valid key grants the purchased plan');
const retry=await as(owner,"select change_business_plan('activate',$1) as record",[hash]);
check(retry.ok&&retry.rows[0].record.renewsAt===paid.rows[0].record.renewsAt,'retrying a redemption cannot extend access twice');
check((await as(staff,'select read_business_plan() as record')).rows[0].record.planId==='growth','another business device reads the durable entitlement');
check(!(await as(owner,'select * from plan_activation_keys')).ok,'owners cannot read the activation key registry');
await db.close();console.log(`${passed} owner/plan assertions passed`);
