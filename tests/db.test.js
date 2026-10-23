// Database tests (M2): migrations, row-level security, legacy/v2 ownership, append-only activity, order numbers,
// and an idempotent importer. Each run creates a throwaway database and drops it afterwards.
// Needs a local Postgres: `node scripts/db.js start` (writes DATABASE_ADMIN_URL to .env.local).
// Synthetic data only, except the optional real-export checks, which read git-ignored data/export when present.
const test=require("node:test"); const assert=require("node:assert/strict");
const fs=require("fs"), os=require("os"), path=require("path"), crypto=require("crypto"); const {Client}=require("pg");
require("../scripts/env");
const {migrate}=require("../scripts/migrate"); const {importExport}=require("../scripts/import"); const L=require("../src/logic.js");

const ADMIN=process.env.DATABASE_ADMIN_URL; const skip=ADMIN?false:"no DATABASE_ADMIN_URL — run `node scripts/db.js start`";
const realExport=path.join(__dirname,"../data/export"); const hasReal=fs.existsSync(path.join(realExport,"orders"));
const dbName="lhd_test_"+crypto.randomBytes(4).toString("hex");
const urlFor=db=>{ const u=new URL(ADMIN); u.pathname="/"+db; return u.toString(); };
const ROLES=["admin","sale","store","accounting","crew"]; const uid={}; for(const r of ROLES) uid[r]=crypto.randomUUID();
const NOT_STAFF=crypto.randomUUID(), INACTIVE=crypto.randomUUID();
const ALL_TABLES=["staff","positions","products","kit_parts","customers","customer_tax_ids","crew","crew_rates","crew_rate_costs",
  "settings","orders","order_lines","repairs","order_counters","activity","import_runs"];

const {writeFixture}=require("./helpers/fixture");

let admin, c; const fixture=fs.mkdtempSync(path.join(os.tmpdir(),"lhd-fixture-"));
test.before(async()=>{ if(skip) return;
  admin=new Client({connectionString:ADMIN}); await admin.connect(); await admin.query(`create database ${dbName}`);
  await migrate(urlFor(dbName),{log:()=>{}}); c=new Client({connectionString:urlFor(dbName)}); await c.connect();
  writeFixture(fixture);
  await c.query("insert into staff(user_id,display_name,role,active) select * from unnest($1::uuid[],$2::text[],$3::text[],$4::bool[])",
    [[...ROLES.map(r=>uid[r]),INACTIVE],[...ROLES.map(r=>"Test "+r),"Gone"],[...ROLES,"sale"],[...ROLES.map(()=>true),false]]);
});
test.after(async()=>{ if(skip) return; if(c) await c.end(); await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end(); fs.rmSync(fixture,{recursive:true,force:true}); });

// Run fn inside a transaction as a client role, then roll back. Returns fn's result or the error.
async function as(role,sub,fn){
  await c.query("begin");
  try{ await c.query(`set local role ${role}`); if(sub) await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub})]);
    return await fn(); }
  catch(e){ return e; } finally { await c.query("rollback"); } }
const denied=e=>e instanceof Error && (e.code==="42501"||/permission denied|row-level security/.test(e.message));

const domainCounts=async()=>{ const out={}; for(const t of ["positions","products","kit_parts","customers","customer_tax_ids","crew","crew_rates",
  "crew_rate_costs","settings","order_counters","orders","order_lines","activity"]) out[t]=+(await c.query(`select count(*) from ${t}`)).rows[0].count; return out; };
const fingerprint=async()=>{ const out={}; for(const t of ["products","kit_parts","customers","customer_tax_ids","crew_rates","orders","order_lines"]){
  out[t]=(await c.query(`select md5(coalesce(string_agg(x::text, '|' order by x::text),'')) h from (select to_jsonb(r) - 'updated_at' x from ${t} r) s`)).rows[0].h; } return out; };

test("migrations: every public table has row-level security forced, and re-running is a no-op",{skip},async()=>{
  const r=await c.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by 1`);
  assert.deepEqual(r.rows.map(x=>x.relname).sort(),[...ALL_TABLES].sort(),"a table was added without being listed here and in the RLS block");
  for(const row of r.rows) assert.ok(row.relrowsecurity&&row.relforcerowsecurity,`${row.relname} lacks forced RLS`);
  const logs=[]; await migrate(urlFor(dbName),{log:m=>logs.push(m)}); assert.deepEqual(logs,[]);
});

test("importer: synthetic export loads, and a second run leaves identical rows",{skip},async()=>{
  const r1=await importExport(c,fixture); const n1=await domainCounts(); const f1=await fingerprint();
  const r2=await importExport(c,fixture); const n2=await domainCounts(); const f2=await fingerprint();
  assert.deepEqual(n2,n1); assert.deepEqual(f2,f1); assert.deepEqual(r2.skipped,r1.skipped);
  assert.equal(n1.products,4); assert.equal(n1.orders,2); assert.equal(n1.order_lines,4); assert.equal(n1.kit_parts,2); assert.equal(n1.activity,2);
  assert.equal(r1.skipped.kitPartUnknownProduct,1);
  const p=(await c.query("select is_fuel_hour, sort from products where id=4")).rows[0]; assert.equal(p.is_fuel_hour,true); assert.equal(+p.sort,3);
  assert.equal((await c.query("select dept from crew_rates where crew_id='500' and position_id=7")).rows[0].dept,1);
});

test("importer: a crew member's repeated position keeps every rate, marked for review (Gene, 23 Oct)",{skip},async()=>{
  const r=(await c.query("select position_id, rate_no, needs_review, price::float8 from crew_rates where crew_id='500' order by position_id, rate_no")).rows;
  assert.deepEqual(r,[{position_id:7,rate_no:1,needs_review:false,price:3000},{position_id:8,rate_no:1,needs_review:true,price:2500},{position_id:8,rate_no:2,needs_review:true,price:1}]);
  assert.equal((await c.query("select count(*) from crew_rate_costs where crew_id='500'")).rows[0].count,"3");
});

test("importer: a job's missing customer is created from the job and flagged new; re-import never re-flags it (Gene, 23 Oct)",{skip},async()=>{
  const cu=(await c.query("select name, flagged_new, flag_note from customers where id='404'")).rows[0];
  assert.equal(cu.name,"Synthetic Films"); assert.equal(cu.flagged_new,true); assert.match(cu.flag_note,/6900002/);
  assert.equal((await c.query("select customer_id from orders where id='6900002'")).rows[0].customer_id,"404");
  await c.query("update customers set flagged_new=false, name='Checked Name' where id='404'");   // a person checks it
  const r=await importExport(c,fixture); assert.equal(r.counts.customers_flagged_new,undefined);
  assert.deepEqual((await c.query("select name, flagged_new from customers where id='404'")).rows[0],{name:"Checked Name",flagged_new:false});
});

test("importer: prices read back from the database still give the old-system totals",{skip},async()=>{
  const o=(await c.query("select * from orders where id='6900001'")).rows[0];
  const lines=(await c.query("select t,list::float8,qty::float8,days::float8,disc::float8,foc,sb,ot::float8,ot_rate::float8 as \"otRate\" from order_lines where order_id='6900001' order by sort")).rows;
  const T=L.orderTotals(lines,{extraDisc:+o.extra_disc,insurance:+o.insurance,adjust:+o.adjust,tax:o.tax});
  assert.equal(L.r2(T.sub-T.extra+T.adj),o.legacy_totals.sub);
});

test("RLS: no client role can insert, update or delete any table — including admin",{skip},async()=>{
  const writes=[ ["products","update products set price = 1"], ["orders","update orders set status='Order'"], ["order_lines","update order_lines set list = 0"],
    ["orders","insert into orders(no,owner,status) values ('6999999','v2','Quote')"], ["customers","delete from customers"], ["staff","update staff set role='admin'"],
    ["activity","insert into activity(entity,action) values ('order','x')"], ["order_counters","update order_counters set seq = 0"], ["settings","delete from settings"],
    ["crew_rates","update crew_rates set price = 0"], ["kit_parts","delete from kit_parts"], ["repairs","insert into repairs(code) values ('x')"] ];
  for(const role of ROLES) for(const [t,sql] of writes){ const e=await as("authenticated",uid[role],()=>c.query(sql)); assert.ok(denied(e),`${role} could run: ${sql}`); }
});

test("RLS: store can read jobs and products but cannot change prices or move Quote→Order directly",{skip},async()=>{
  const n=await as("authenticated",uid.store,async()=>+(await c.query("select count(*) from orders")).rows[0].count); assert.equal(n,2);
  assert.ok(denied(await as("authenticated",uid.store,()=>c.query("update order_lines set list = 1 where order_id='6900002'"))));
  assert.ok(denied(await as("authenticated",uid.store,()=>c.query("update orders set status='Order' where status='Quote'"))));
});

test("RLS: anonymous gets nothing; signed-in non-staff and inactive staff see zero rows",{skip},async()=>{
  for(const t of ALL_TABLES) assert.ok(denied(await as("anon",null,()=>c.query(`select 1 from ${t} limit 1`))),`anon read ${t}`);
  for(const who of [NOT_STAFF,INACTIVE]) for(const t of ["orders","products","customers","staff"]){
    const n=await as("authenticated",who,async()=>(await c.query(`select 1 from ${t}`)).rowCount); assert.equal(n,0,`${t} visible to non-staff`); }
});

test("RLS: customer tax IDs only for admin/sale/accounting; crew costs only for admin/crew",{skip},async()=>{
  const cnt=(role,t)=>as("authenticated",uid[role],async()=>(await c.query(`select 1 from ${t}`)).rowCount);
  const all=async t=>+(await c.query(`select count(*) from ${t}`)).rows[0].count;   // as the owner, ignoring RLS
  const taxN=await all("customer_tax_ids"), costN=await all("crew_rate_costs"); assert.ok(taxN>0&&costN>0);
  for(const r of ["admin","sale","accounting"]) assert.equal(await cnt(r,"customer_tax_ids"),taxN);
  for(const r of ["store","crew"]) assert.equal(await cnt(r,"customer_tax_ids"),0);
  for(const r of ["admin","crew"]) assert.equal(await cnt(r,"crew_rate_costs"),costN);
  for(const r of ["sale","store","accounting"]) assert.equal(await cnt(r,"crew_rate_costs"),0);
  for(const r of ROLES) assert.ok(denied(await cnt(r,"order_counters")),`${r} read order_counters`);
});

test("ownership: legacy jobs are read-only even for the server role; v2 jobs are writable and survive re-import",{skip},async()=>{
  assert.ok(denied(await as("service_role",null,()=>c.query("update orders set note='x' where id='6900001'"))),"server changed a legacy order");
  assert.ok(denied(await as("service_role",null,()=>c.query("delete from order_lines where order_id='6900001'"))),"server deleted legacy lines");
  assert.ok(denied(await as("service_role",null,()=>c.query("insert into orders(no,owner,status) values ('6800000','legacy','Quote')"))),"server created a legacy order");
  // A v2 order that happens to share an id with the export must be left alone by the importer.
  await c.query("begin"); await c.query("set local role service_role");
  await c.query("insert into orders(id,no,owner,status,note) values ('6900002-v2','6909001','v2','Quote','mine')");
  await c.query("update orders set note='edited in v2' where id='6909001' or no='6909001'");
  await c.query("insert into order_lines(order_id,k,sort,t,list,qty,days) values ('6900002-v2','z',0,1,100,1,1)"); await c.query("commit");
  fs.writeFileSync(path.join(fixture,"orders/6900002-v2.json"),JSON.stringify({id:"6900002-v2",no:"6909001",status:"Quote",customerName:"Overwrite?"}));
  const r=await importExport(c,fixture); fs.rmSync(path.join(fixture,"orders/6900002-v2.json"));
  assert.equal(r.skipped.orderOwnedByV2,1);
  const o=(await c.query("select owner,note,customer_name from orders where id='6900002-v2'")).rows[0];
  assert.deepEqual(o,{owner:"v2",note:"edited in v2",customer_name:null});
  assert.equal((await c.query("select count(*) from order_lines where order_id='6900002-v2'")).rows[0].count,"1");
});

test("activity is append-only for everyone, including the database owner",{skip},async()=>{
  assert.ok(denied(await as("service_role",null,()=>c.query("update activity set action='x'"))));
  assert.ok(denied(await as("service_role",null,()=>c.query("delete from activity"))));
  await c.query("begin"); try{ await assert.rejects(c.query("update activity set action='x'"),/append-only/); } finally { await c.query("rollback"); }
  await c.query("begin"); try{ await assert.rejects(c.query("truncate activity"),/append-only/); } finally { await c.query("rollback"); }
  const ok=await as("service_role",null,async()=>(await c.query("insert into activity(entity,entity_id,action) values ('order','6909001','created') returning id")).rowCount); assert.equal(ok,1);
});

test("order numbers: server only, continue after 6909000, unique under 20 concurrent calls",{skip},async()=>{
  assert.ok(denied(await as("authenticated",uid.admin,()=>c.query("select next_order_no()"))));
  const be2=((new Date().getFullYear()+543)%100);
  const clients=await Promise.all(Array.from({length:20},async()=>{ const k=new Client({connectionString:urlFor(dbName)}); await k.connect(); return k; }));
  try{
    const nos=await Promise.all(clients.map(async k=>{ await k.query("begin"); await k.query("set local role service_role"); const r=await k.query("select next_order_no() n"); await k.query("commit"); return r.rows[0].n; }));
    assert.equal(new Set(nos).size,20);
    const seqs=nos.map(n=>+n.slice(2)).sort((a,b)=>a-b);
    if(be2===69) assert.deepEqual(seqs,Array.from({length:20},(_,i)=>9001+i)); else assert.deepEqual(seqs,Array.from({length:20},(_,i)=>1+i));
    for(const n of nos) assert.match(n,new RegExp("^"+String(be2).padStart(2,"0")+"\\d{5}$"));
  } finally { await Promise.all(clients.map(k=>k.end())); }
});

test("real export: imports twice with identical rows, and every job still matches the old system from the database",{skip:skip||(hasReal?false:"data/export not present")},async()=>{
  const r1=await importExport(c,realExport); const n1=await domainCounts(); const f1=await fingerprint();
  await importExport(c,realExport); const n2=await domainCounts(); const f2=await fingerprint();
  assert.deepEqual(n2,n1); assert.deepEqual(f2,f1);
  assert.ok(r1.counts.orders>=200&&r1.counts.products>=3000&&r1.counts.customers>=1000,JSON.stringify(r1.counts));
  const orders=(await c.query("select id,no,extra_disc,insurance,adjust,tax,legacy_totals from orders where owner='legacy' and legacy_totals is not null and id not like '69000%'")).rows;
  const lines=(await c.query(`select order_id,t,list::float8,qty::float8,days::float8,disc::float8,foc,sb,ot::float8,ot_rate::float8 as "otRate" from order_lines order by order_id, sort`)).rows;
  const by={}; for(const l of lines) (by[l.order_id]=by[l.order_id]||[]).push(l);
  const bad=orders.filter(o=>{ const T=L.orderTotals(by[o.id]||[],{extraDisc:+o.extra_disc,insurance:+o.insurance,adjust:+o.adjust,tax:o.tax});
    return Math.abs(L.r2(T.sub-T.extra+T.adj)-o.legacy_totals.sub)>0.05||Math.abs(T.total-o.legacy_totals.total)>0.05; }).map(o=>o.no);
  assert.ok(orders.length>=200); assert.deepEqual(bad,[],`${orders.length-bad.length}/${orders.length} match from the database`);
});
